'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Truck, Search, Circle } from 'lucide-react';
import api from '../../lib/api';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
if (TOKEN) mapboxgl.accessToken = TOKEN;

const ONLINE_MS = 5 * 60 * 1000;

interface Position { latitude: number | string; longitude: number | string; timestamp: string; speed?: number; }
interface Device { id: string; name: string; vehiculo?: { placa?: string } | null; trabajador?: { nombre_completo?: string } | null; positions?: Position[]; }

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function MapboxFleetMap() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const fitDone = useRef(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

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
          return { device: d, lat, lng, p, online };
        })
        .filter(Boolean) as { device: Device; lat: number; lng: number; p: Position; online: boolean }[],
    [devices, now]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return located;
    return located.filter((l) => l.device.name?.toLowerCase().includes(q) || l.device.vehiculo?.placa?.toLowerCase().includes(q) || l.device.trabajador?.nombre_completo?.toLowerCase().includes(q));
  }, [located, query]);

  const onlineCount = located.filter((l) => l.online).length;
  const label = (l: (typeof located)[number]) => l.device.trabajador?.nombre_completo || l.device.vehiculo?.placa || l.device.name;

  // Inicializar el mapa.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-77.0428, -12.0464],
      zoom: 5,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setReady(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

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

  // Sincronizar marcadores con los dispositivos ubicados.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    located.forEach((l) => {
      seen.add(l.device.id);
      const color = l.online ? '#16A34A' : '#94A3B8';
      let m = markersRef.current[l.device.id];
      if (!m) {
        const el = document.createElement('div');
        el.style.cssText = `width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);cursor:pointer;background:${color}`;
        m = new mapboxgl.Marker({ element: el })
          .setLngLat([l.lng, l.lat])
          .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }))
          .addTo(map);
        markersRef.current[l.device.id] = m;
      } else {
        m.setLngLat([l.lng, l.lat]);
        (m.getElement() as HTMLElement).style.background = color;
      }
      m.getPopup()?.setHTML(
        `<div style="font-family:system-ui;font-size:12px"><b>${label(l)}</b><br/>${((l.p.speed ?? 0) * 3.6).toFixed(0)} km/h · ${timeAgo(l.p.timestamp)}<br/><span style="color:${color}">${l.online ? '● En línea' : '○ Desconectado'}</span></div>`
      );
    });
    // eliminar marcadores de dispositivos que ya no están
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    });
    // encuadrar la primera vez
    if (!fitDone.current && located.length > 0) {
      const b = new mapboxgl.LngLatBounds();
      located.forEach((l) => b.extend([l.lng, l.lat]));
      map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 0 });
      fitDone.current = true;
    }
  }, [located, ready]);

  const focus = (l: (typeof located)[number]) => {
    mapRef.current?.flyTo({ center: [l.lng, l.lat], zoom: 15 });
    markersRef.current[l.device.id]?.togglePopup();
  };

  if (!TOKEN) {
    return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_MAPBOX_TOKEN para ver el mapa.</div>;
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Panel lateral */}
      <div className="absolute top-4 left-4 bottom-4 w-72 z-10 flex flex-col bg-white/95 dark:bg-[#0f1522]/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 dark:border-[#202a40] overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-[#202a40]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Flota en vivo</h3>
            <span className="text-xs font-semibold text-emerald-600">{onlineCount} en línea</span>
          </div>
          <p className="text-xs text-slate-500 mb-2">{located.length} con ubicación · {devices.length} dispositivos</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#141d2e] border border-slate-200 dark:border-[#202a40]">
            <Search size={15} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar chofer o placa" className="w-full bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">Sin choferes con ubicación aún.</div>
          ) : (
            filtered.map((l) => (
              <button key={l.device.id} onClick={() => focus(l)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-[#141d2e] transition">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${l.online ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark:bg-[#141d2e] text-slate-400'}`}>
                  <Truck size={16} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{label(l)}</span>
                  <span className="block text-xs text-slate-500 truncate">{l.device.vehiculo?.placa || l.device.name} · {timeAgo(l.p.timestamp)}</span>
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
