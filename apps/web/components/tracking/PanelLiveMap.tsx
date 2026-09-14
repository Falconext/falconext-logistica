'use client';

// Mini-mapa en vivo para el Panel de Control. Reutiliza la misma fuente que el
// módulo de Rastreo (GET /gps/devices) y el loader de Google Maps. Versión compacta:
// sin lista lateral, con overlay mínimo y realce de los vehículos "en consegna".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Satellite, Maximize2, LocateFixed } from 'lucide-react';
import Link from 'next/link';
import api from '../../lib/api';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';
import { isFleetCoord, fitFleetBounds, FLEET_HOME, FLEET_HOME_ZOOM } from './mapBounds';
import { useT } from '../../lib/i18n';

const ONLINE_MS = 5 * 60 * 1000;
const MOVING_KMH = 3;
const REFRESH_MS = 15000;

interface Position { latitude: number | string; longitude: number | string; timestamp: string; speed?: number; }
interface Device {
  id: string; name: string;
  vehiculo?: { placa?: string } | null;
  trabajador?: { nombre_completo?: string } | null;
  positions?: Position[];
}

// Normaliza una placa/targa legacy ("ABC-123 - MODELO" → "ABC-123") para comparar.
const normPlaca = (raw?: string | null) => (raw || '').trim().split(/\s+/)[0].toUpperCase();

function timeAgo(ts: string, t: ReturnType<typeof useT>): string {
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return t('componentes.panelLiveMap.ahora');
  if (min < 60) return t('componentes.panelLiveMap.haceMin', { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('componentes.panelLiveMap.haceHoras', { h });
  return t('componentes.panelLiveMap.haceDias', { d: Math.floor(h / 24) });
}

function popupHtml(l: { device: Device; p: Position; online: boolean; enConsegna: boolean }, color: string, t: ReturnType<typeof useT>) {
  const label = l.device.trabajador?.nombre_completo || l.device.vehiculo?.placa || l.device.name;
  const estado = l.enConsegna ? t('componentes.panelLiveMap.popupEnConsegna') : l.online ? t('componentes.panelLiveMap.popupEnLinea') : t('componentes.panelLiveMap.popupDesconectado');
  const kmh = Math.round((l.p.speed ?? 0) * 3.6);
  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:150px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      ${l.device.vehiculo?.placa ? `<span style="font-family:ui-monospace,monospace;font-weight:800;font-size:12px;letter-spacing:.04em;background:#0f172a;color:#fff;padding:2px 6px;border-radius:4px">${l.device.vehiculo.placa}</span>` : ''}
      <b style="font-size:12.5px;color:#0f172a">${label}</b>
    </div>
    <div style="font-size:12px;color:#475569">${kmh} km/h · ${timeAgo(l.p.timestamp, t)}</div>
    <div style="font-size:11px;font-weight:700;color:${color};margin-top:3px">${estado}</div>
  </div>`;
}

export function PanelLiveMap({ enConsegnaPlacas }: { enConsegnaPlacas?: string[] }) {
  const t = useT();
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const haloRef = useRef<Record<string, google.maps.Marker>>({});
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const fitDone = useRef(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<MapPreset>('day');

  const activeSet = useMemo(
    () => new Set((enConsegnaPlacas || []).map(normPlaca).filter(Boolean)),
    [enConsegnaPlacas]
  );

  const located = useMemo(
    () =>
      devices
        .map((d) => {
          const p = d.positions?.[0];
          if (!p) return null;
          const lat = parseFloat(String(p.latitude));
          const lng = parseFloat(String(p.longitude));
          if (!isFleetCoord(lat, lng)) return null;
          const online = now - new Date(p.timestamp).getTime() < ONLINE_MS;
          const moving = online && (p.speed ?? 0) * 3.6 >= MOVING_KMH;
          const enConsegna = activeSet.has(normPlaca(d.vehiculo?.placa));
          return { device: d, lat, lng, p, online, moving, enConsegna };
        })
        .filter(Boolean) as { device: Device; lat: number; lng: number; p: Position; online: boolean; moving: boolean; enConsegna: boolean }[],
    [devices, now, activeSet]
  );

  const onlineCount = located.filter((l) => l.online).length;
  const colorFor = (l: (typeof located)[number]) =>
    l.enConsegna ? '#6366F1' : l.online ? '#16A34A' : '#94A3B8';

  // Inicializar el mapa — vista de reposo en Italia (nunca "el mundo entero").
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;
    const map = new google.maps.Map(containerRef.current, {
      center: FLEET_HOME,
      zoom: FLEET_HOME_ZOOM,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      clickableIcons: false,
      styles: stylesFor('day'),
    });
    infoRef.current = new google.maps.InfoWindow();
    mapRef.current = map;
    setReady(true);
  }, [isLoaded]);

  useEffect(() => {
    mapRef.current?.setOptions({ styles: stylesFor(preset) });
  }, [preset]);

  // Datos: cargar + refrescar cada 15s (misma fuente que Rastreo).
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await api.get('/gps/devices');
        setDevices(Array.isArray(res.data) ? res.data : []);
        setNow(Date.now());
      } catch (e) { console.error(e); }
    };
    fetchDevices();
    const id = setInterval(fetchDevices, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    fitFleetBounds(map, located, { padding: 60, maxZoom: 10 });
  };

  // Sincronizar marcadores. Cada punto se dibuja con un halo suave por debajo
  // (glow estático) + el marcador sólido encima, para un look más premium sin
  // depender de animaciones CSS que Google Marker no soporta.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    located.forEach((l) => {
      seen.add(l.device.id);
      const color = colorFor(l);
      const html = popupHtml(l, color, t);

      let halo = haloRef.current[l.device.id];
      const haloIcon = { path: google.maps.SymbolPath.CIRCLE, scale: l.moving ? 15 : 11, fillColor: color, fillOpacity: l.moving ? 0.22 : 0.14, strokeWeight: 0 };
      if (!halo) {
        halo = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map, icon: haloIcon, clickable: false, zIndex: 1 });
        haloRef.current[l.device.id] = halo;
      } else {
        halo.setPosition({ lat: l.lat, lng: l.lng });
        halo.setIcon(haloIcon);
      }

      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: l.enConsegna ? 8.5 : 7.5,
        fillColor: color, fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 2.5,
      };
      let m = markersRef.current[l.device.id];
      if (!m) {
        m = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map, icon, zIndex: 2 });
        m.addListener('click', () => {
          infoRef.current?.setContent(html);
          infoRef.current?.open({ map, anchor: m! });
        });
        markersRef.current[l.device.id] = m;
      } else {
        m.setPosition({ lat: l.lat, lng: l.lng });
        m.setIcon(icon);
      }
    });
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) {
        markersRef.current[id].setMap(null); delete markersRef.current[id];
        haloRef.current[id]?.setMap(null); delete haloRef.current[id];
      }
    });
    if (!fitDone.current && located.length > 0) {
      fitFleetBounds(map, located, { padding: 60, maxZoom: 10 });
      fitDone.current = true;
    }
  }, [located, ready]);

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="h-full flex items-center justify-center text-center text-sm text-slate-400 px-6">
        {t('componentes.panelLiveMap.configuraPre')} <code className="mx-1 px-1 rounded bg-slate-100 dark:bg-slate-800">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> {t('componentes.panelLiveMap.configuraPost')}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Overlay: estado vivo + acceso a Rastreo completo */}
      <div className="absolute top-3 left-3 flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#0f1522]/95 backdrop-blur border border-slate-200/70 dark:border-[#202a40] shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
        <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
          <Satellite size={12} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="relative flex h-2 w-2 -ml-1">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {t('componentes.panelLiveMap.badgeEnLinea', { count: onlineCount })}
        </span>
        <span className="text-xs text-slate-400 whitespace-nowrap">{t('componentes.panelLiveMap.ubicados', { count: located.length })}</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2">
        <MapThemeToggle preset={preset} onChange={setPreset} />
        <button
          onClick={recenter}
          title={t('componentes.panelLiveMap.centrarFlota')}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/90 dark:bg-[#0f1522]/90 backdrop-blur border border-slate-200 dark:border-[#202a40] text-slate-600 dark:text-slate-300 shadow-sm hover:bg-white dark:hover:bg-[#141d2e] transition"
        >
          <LocateFixed size={15} />
        </button>
        <Link
          href="/rastreo"
          title={t('componentes.panelLiveMap.abrirRastreo')}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/90 dark:bg-[#0f1522]/90 backdrop-blur border border-slate-200 dark:border-[#202a40] text-slate-600 dark:text-slate-300 shadow-sm hover:bg-white dark:hover:bg-[#141d2e] transition"
        >
          <Maximize2 size={15} />
        </Link>
      </div>

      {located.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 dark:bg-[#0f1522]/90 backdrop-blur border border-slate-200 dark:border-[#202a40] text-sm text-slate-500 shadow-sm">
            <Satellite size={15} className="text-slate-400" /> {t('componentes.panelLiveMap.sinUbicaciones')}
          </div>
        </div>
      )}
    </div>
  );
}
