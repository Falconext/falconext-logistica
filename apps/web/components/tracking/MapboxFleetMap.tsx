'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Truck, Search, Circle, LocateFixed, Radio } from 'lucide-react';
import api from '../../lib/api';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';
import { isFleetCoord, fitFleetBounds, FLEET_HOME, FLEET_HOME_ZOOM } from './mapBounds';
import { useT } from '../../lib/i18n';

const ONLINE_MS = 5 * 60 * 1000;
const MOVING_KMH = 3;

interface Position { latitude: number | string; longitude: number | string; timestamp: string; speed?: number; }
interface Device { id: string; name: string; vehiculo?: { placa?: string } | null; trabajador?: { nombre_completo?: string } | null; positions?: Position[]; }

function timeAgo(ts: string, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('componentes.fleetMap.ahora');
  if (min < 60) return t('componentes.fleetMap.haceMin', { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('componentes.fleetMap.haceHoras', { h });
  return t('componentes.fleetMap.haceDias', { d: Math.floor(h / 24) });
}

function popupHtml(l: { device: Device; p: Position; online: boolean }, color: string, t: ReturnType<typeof useT>) {
  const label = l.device.trabajador?.nombre_completo || l.device.vehiculo?.placa || l.device.name;
  const kmh = Math.round((l.p.speed ?? 0) * 3.6);
  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:150px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      ${l.device.vehiculo?.placa ? `<span style="font-family:ui-monospace,monospace;font-weight:800;font-size:12px;letter-spacing:.04em;background:#0f172a;color:#fff;padding:2px 6px;border-radius:4px">${l.device.vehiculo.placa}</span>` : ''}
      <b style="font-size:12.5px;color:#0f172a">${label}</b>
    </div>
    <div style="font-size:12px;color:#475569">${kmh} km/h · ${timeAgo(l.p.timestamp, t)}</div>
    <div style="font-size:11px;font-weight:700;color:${color};margin-top:3px">${l.online ? t('componentes.fleetMap.popupEnLinea') : t('componentes.fleetMap.popupDesconectado')}</div>
  </div>`;
}

export function MapboxFleetMap() {
  const t = useT();
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const haloRef = useRef<Record<string, google.maps.Marker>>({});
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const fitDone = useRef(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<MapPreset>('day');

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
          return { device: d, lat, lng, p, online, moving };
        })
        .filter(Boolean)
        // En línea primero (moviéndose antes que detenido), luego desconectados
        // por antigüedad — así la lista siempre abre con la flota activa.
        .sort((a: any, b: any) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          if (a.moving !== b.moving) return a.moving ? -1 : 1;
          return new Date(b.p.timestamp).getTime() - new Date(a.p.timestamp).getTime();
        }) as { device: Device; lat: number; lng: number; p: Position; online: boolean; moving: boolean }[],
    [devices, now]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return located;
    return located.filter((l) => l.device.name?.toLowerCase().includes(q) || l.device.vehiculo?.placa?.toLowerCase().includes(q) || l.device.trabajador?.nombre_completo?.toLowerCase().includes(q));
  }, [located, query]);

  const onlineCount = located.filter((l) => l.online).length;
  const label = (l: (typeof located)[number]) => l.device.trabajador?.nombre_completo || l.device.vehiculo?.placa || l.device.name;

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

  // Preset Día/Noche (los marcadores persisten al cambiar solo la luz).
  useEffect(() => {
    mapRef.current?.setOptions({ styles: stylesFor(preset) });
  }, [preset]);

  // Datos: cargar + refrescar cada 12s.
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await api.get('/gps/devices');
        setDevices(Array.isArray(res.data) ? res.data : []);
        setNow(Date.now());
      } catch (e) { console.error(e); }
    };
    fetchDevices();
    const id = setInterval(fetchDevices, 12000);
    return () => clearInterval(id);
  }, []);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    fitFleetBounds(map, located, { padding: 80, maxZoom: 11 });
  };

  // Sincronizar marcadores con los dispositivos ubicados. Cada punto lleva un
  // halo suave por debajo (glow estático, más grande si está en movimiento) +
  // el marcador sólido encima.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    located.forEach((l) => {
      seen.add(l.device.id);
      const color = l.online ? '#16A34A' : '#94A3B8';
      const html = popupHtml(l, color, t);

      let halo = haloRef.current[l.device.id];
      const haloIcon = { path: google.maps.SymbolPath.CIRCLE, scale: l.moving ? 16 : 12, fillColor: color, fillOpacity: l.moving ? 0.22 : 0.13, strokeWeight: 0 };
      if (!halo) {
        halo = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map, icon: haloIcon, clickable: false, zIndex: 1 });
        haloRef.current[l.device.id] = halo;
      } else {
        halo.setPosition({ lat: l.lat, lng: l.lng });
        halo.setIcon(haloIcon);
      }

      const icon = { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 };
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
    // eliminar marcadores de dispositivos que ya no están
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) {
        markersRef.current[id].setMap(null); delete markersRef.current[id];
        haloRef.current[id]?.setMap(null); delete haloRef.current[id];
      }
    });
    // encuadrar la primera vez (robusto: descarta outliers fuera de Europa)
    if (!fitDone.current && located.length > 0) {
      fitFleetBounds(map, located, { padding: 80, maxZoom: 11 });
      fitDone.current = true;
    }
  }, [located, ready]);

  const focus = (l: (typeof located)[number]) => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo({ lat: l.lat, lng: l.lng });
    map.setZoom(15);
    const m = markersRef.current[l.device.id];
    if (m) {
      const color = l.online ? '#16A34A' : '#94A3B8';
      infoRef.current?.setContent(popupHtml(l, color, t));
      infoRef.current?.open({ map, anchor: m });
    }
  };

  // Deep-link ?device=<id> (desde Vehículos): enfoca ese dispositivo una vez ubicado.
  const autoFocused = useRef(false);
  useEffect(() => {
    if (autoFocused.current || !ready || located.length === 0) return;
    const deviceId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('device') : null;
    if (!deviceId) return;
    const target = located.find((l) => l.device.id === deviceId);
    if (target && markersRef.current[deviceId]) {
      focus(target);
      autoFocused.current = true;
    }
  }, [located, ready]);

  if (!GOOGLE_MAPS_KEY) {
    return <div className="h-full flex items-center justify-center text-slate-400">{t('componentes.fleetMap.configurarMapa')}</div>;
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <MapThemeToggle preset={preset} onChange={setPreset} />
        <button
          onClick={recenter}
          title={t('componentes.fleetMap.centrarFlota')}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/90 dark:bg-[#0f1522]/90 backdrop-blur border border-slate-200 dark:border-[#202a40] text-slate-600 dark:text-slate-300 shadow-sm hover:bg-white dark:hover:bg-[#141d2e] transition"
        >
          <LocateFixed size={15} />
        </button>
      </div>

      {/* Panel: hoja inferior en móvil, panel lateral izquierdo en desktop */}
      <div className="absolute z-10 flex flex-col bg-white/95 dark:bg-[#0f1522]/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 dark:border-[#202a40] overflow-hidden
                      inset-x-2 bottom-2 max-h-[42vh]
                      sm:inset-x-auto sm:top-4 sm:left-4 sm:bottom-4 sm:w-72 sm:max-h-none">
        {/* Handle estilo hoja (solo móvil) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        <div className="px-4 pb-4 pt-1 sm:p-4 border-b border-slate-100 dark:border-[#202a40] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <Radio size={13} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white">{t('componentes.fleetMap.flotaEnVivo')}</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              {t('componentes.fleetMap.badgeEnLinea', { count: onlineCount })}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-2 mt-1">{t('componentes.fleetMap.conUbicacion', { count: located.length, total: devices.length })}</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#141d2e] border border-slate-200 dark:border-[#202a40]">
            <Search size={15} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('componentes.fleetMap.buscarPlaceholder')} className="w-full bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">{t('componentes.fleetMap.sinChoferes')}</div>
          ) : (
            filtered.map((l) => (
              <button key={l.device.id} onClick={() => focus(l)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-[#141d2e] transition">
                <span className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${l.online ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark:bg-[#141d2e] text-slate-400'}`}>
                  <Truck size={16} />
                  {l.moving && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0f1522]" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{label(l)}</span>
                  <span className="block text-xs text-slate-500 truncate">{l.device.vehiculo?.placa || l.device.name} · {timeAgo(l.p.timestamp, t)}</span>
                </span>
                <Circle size={9} className={l.online ? 'text-emerald-500 fill-emerald-500' : 'text-slate-300 fill-slate-300'} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
