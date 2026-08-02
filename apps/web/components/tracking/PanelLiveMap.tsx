'use client';

// Mini-mapa en vivo para el Panel de Control. Reutiliza la misma fuente que el
// módulo de Rastreo (GET /gps/devices) y el loader de Google Maps. Versión compacta:
// sin lista lateral, con overlay mínimo y realce de los vehículos "en consegna".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import api from '../../lib/api';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';
import { useT } from '../../lib/i18n';

const ONLINE_MS = 5 * 60 * 1000;
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

export function PanelLiveMap({ enConsegnaPlacas }: { enConsegnaPlacas?: string[] }) {
  const t = useT();
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
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
          if (isNaN(lat) || isNaN(lng)) return null;
          const online = now - new Date(p.timestamp).getTime() < ONLINE_MS;
          const enConsegna = activeSet.has(normPlaca(d.vehiculo?.placa));
          return { device: d, lat, lng, p, online, enConsegna };
        })
        .filter(Boolean) as { device: Device; lat: number; lng: number; p: Position; online: boolean; enConsegna: boolean }[],
    [devices, now, activeSet]
  );

  const onlineCount = located.filter((l) => l.online).length;
  const label = (l: (typeof located)[number]) =>
    l.device.trabajador?.nombre_completo || l.device.vehiculo?.placa || l.device.name;
  const colorFor = (l: (typeof located)[number]) =>
    l.enConsegna ? '#6366F1' : l.online ? '#16A34A' : '#94A3B8';

  // Inicializar el mapa.
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;
    const map = new google.maps.Map(containerRef.current, {
      center: { lat: 45.4642, lng: 9.1900 },
      zoom: 5,
      disableDefaultUI: true,
      zoomControl: true,
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

  // Sincronizar marcadores.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    located.forEach((l) => {
      seen.add(l.device.id);
      const color = colorFor(l);
      const estado = l.enConsegna ? t('componentes.panelLiveMap.popupEnConsegna') : l.online ? t('componentes.panelLiveMap.popupEnLinea') : t('componentes.panelLiveMap.popupDesconectado');
      const html = `<div style="font-family:system-ui;font-size:12px"><b>${label(l)}</b><br/>${((l.p.speed ?? 0) * 3.6).toFixed(0)} km/h · ${timeAgo(l.p.timestamp, t)}<br/><span style="color:${color}">${estado}</span></div>`;
      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: l.enConsegna ? 9 : 8,
        fillColor: color, fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 3,
      };
      let m = markersRef.current[l.device.id];
      if (!m) {
        m = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map, icon });
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
      if (!seen.has(id)) { markersRef.current[id].setMap(null); delete markersRef.current[id]; }
    });
    if (!fitDone.current && located.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      located.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lng }));
      map.fitBounds(bounds, 60);
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
      <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-[#0f1522]/90 backdrop-blur border border-slate-200 dark:border-[#202a40] shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {t('componentes.panelLiveMap.badgeEnLinea', { count: onlineCount })}
        </span>
        <span className="text-xs text-slate-400">{t('componentes.panelLiveMap.ubicados', { count: located.length })}</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2">
        <MapThemeToggle preset={preset} onChange={setPreset} />
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
            <Radio size={15} className="text-slate-400" /> {t('componentes.panelLiveMap.sinUbicaciones')}
          </div>
        </div>
      )}
    </div>
  );
}
