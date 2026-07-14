'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Truck, Search, Circle, Navigation } from 'lucide-react';
import api from '../../lib/api';

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: -12.0464, lng: -77.0428 }; // Lima
const libraries: ('maps' | 'places' | 'drawing' | 'geometry')[] = ['maps', 'places', 'drawing', 'geometry'];
const ONLINE_MS = 5 * 60 * 1000; // en línea si envió señal en los últimos 5 min

interface Position { latitude: number | string; longitude: number | string; timestamp: string; speed?: number; heading?: number; }
interface Trabajador { id: string; nombre_completo: string; cargo?: string; url_foto?: string | null; }
interface Device { id: string; name: string; vehiculo?: { placa?: string } | null; trabajador?: Trabajador | null; positions?: Position[]; }

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function FleetLiveMap({ apiKey }: { apiKey: string }) {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: apiKey, libraries });
  const [devices, setDevices] = useState<Device[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mapRef = useRef<google.maps.Map | null>(null);
  const fitDone = useRef(false);

  const fetchDevices = async () => {
    try {
      const res = await api.get('/gps/devices');
      setDevices(Array.isArray(res.data) ? res.data : []);
      setNow(Date.now());
    } catch (e) {
      console.error('Error cargando dispositivos', e);
    }
  };

  useEffect(() => {
    fetchDevices();
    const id = setInterval(fetchDevices, 12000); // refresco cada 12s
    return () => clearInterval(id);
  }, []);

  // Solo dispositivos con posición conocida.
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
          return { device: d, pos: { lat, lng }, p, online };
        })
        .filter(Boolean) as { device: Device; pos: google.maps.LatLngLiteral; p: Position; online: boolean }[],
    [devices, now]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return located;
    return located.filter(
      (l) =>
        l.device.name?.toLowerCase().includes(q) ||
        l.device.vehiculo?.placa?.toLowerCase().includes(q) ||
        l.device.trabajador?.nombre_completo?.toLowerCase().includes(q)
    );
  }, [located, query]);

  const onlineCount = located.filter((l) => l.online).length;

  // Ajustar el mapa a todos los marcadores la primera vez que hay datos.
  useEffect(() => {
    if (!mapRef.current || fitDone.current || located.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    located.forEach((l) => bounds.extend(l.pos));
    mapRef.current.fitBounds(bounds, 80);
    if (located.length === 1) mapRef.current.setZoom(15);
    fitDone.current = true;
  }, [located]);

  const focus = (id: string, pos: google.maps.LatLngLiteral) => {
    setSelectedId(id);
    mapRef.current?.panTo(pos);
    if ((mapRef.current?.getZoom() ?? 0) < 14) mapRef.current?.setZoom(15);
  };

  if (!isLoaded) {
    return <div className="h-full flex items-center justify-center text-slate-500 animate-pulse">Cargando mapa...</div>;
  }

  const label = (l: (typeof located)[number]) =>
    l.device.trabajador?.nombre_completo || l.device.vehiculo?.placa || l.device.name || l.device.id.slice(0, 6);

  const subLabel = (l: (typeof located)[number]) =>
    [l.device.vehiculo?.placa, l.device.name].filter(Boolean).join(' · ') || l.device.name;

  return (
    <div className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={defaultCenter}
        zoom={6}
        onLoad={(map) => { mapRef.current = map; }}
        options={{ zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
      >
        {filtered.map((l) => (
          <Marker
            key={l.device.id}
            position={l.pos}
            onClick={() => setSelectedId(l.device.id)}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: l.online ? '#16A34A' : '#94A3B8',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            }}
          >
            {selectedId === l.device.id && (
              <InfoWindow onCloseClick={() => setSelectedId(null)}>
                <div style={{ minWidth: 150 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{label(l)}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{subLabel(l)}</div>
                  <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
                    {((l.p.speed ?? 0) * 3.6).toFixed(0)} km/h · {timeAgo(l.p.timestamp)}
                  </div>
                  <div style={{ fontSize: 11, color: l.online ? '#16A34A' : '#94a3b8', marginTop: 2 }}>
                    {l.online ? '● En línea' : '○ Desconectado'}
                  </div>
                </div>
              </InfoWindow>
            )}
          </Marker>
        ))}
      </GoogleMap>

      {/* Panel lateral de choferes */}
      <div className="absolute top-4 left-4 bottom-4 w-72 z-10 flex flex-col bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Flota en vivo</h3>
            <span className="text-xs font-semibold text-emerald-600">{onlineCount} en línea</span>
          </div>
          <p className="text-xs text-slate-500 mb-2">{located.length} con ubicación · {devices.length} dispositivos</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <Search size={15} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar chofer o placa"
              className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">Sin choferes con ubicación aún.</div>
          ) : (
            filtered.map((l) => (
              <button
                key={l.device.id}
                onClick={() => focus(l.device.id, l.pos)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${selectedId === l.device.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${l.online ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Truck size={16} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 truncate">{label(l)}</span>
                  <span className="block text-xs text-slate-500 truncate">{subLabel(l)} · {timeAgo(l.p.timestamp)}</span>
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
