'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Clock, Navigation } from 'lucide-react';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
if (TOKEN) mapboxgl.accessToken = TOKEN;

interface Props {
  originAddress: string;
  destinationAddress: string;
  mapType?: 'roadmap' | 'satellite';
  statusText?: string;
}

const geoCache = new Map<string, [number, number] | null>();

async function geocode(addr: string): Promise<[number, number] | null> {
  if (!addr) return null;
  if (geoCache.has(addr)) return geoCache.get(addr)!;
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?limit=1&access_token=${TOKEN}`);
    const j = await r.json();
    const c = j.features?.[0]?.center as [number, number] | undefined;
    const val = c ?? null;
    geoCache.set(addr, val);
    return val;
  } catch {
    return null;
  }
}

export function MapboxRouteMap({ originAddress, destinationAddress, mapType = 'roadmap', statusText = 'En Tránsito' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [eta, setEta] = useState('');
  const [dist, setDist] = useState('');
  const [err, setErr] = useState(false);

  const style = mapType === 'satellite' ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/dark-v11';

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;
    const map = new mapboxgl.Map({ container: containerRef.current, style, center: [12.4964, 41.9028], zoom: 9, attributionControl: false });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setReady(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Cambiar de estilo (mapa/satélite) sin recrear el mapa.
  useEffect(() => { if (ready) mapRef.current?.setStyle(style); }, [style]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !originAddress || !destinationAddress) return;
    let cancelled = false;

    (async () => {
      setErr(false);
      const [o, d] = await Promise.all([geocode(originAddress), geocode(destinationAddress)]);
      if (cancelled) return;
      if (!o || !d) { setErr(true); return; }

      let geometry: any = { type: 'LineString', coordinates: [o, d] };
      try {
        const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${o[0]},${o[1]};${d[0]},${d[1]}?geometries=geojson&overview=full&access_token=${TOKEN}`);
        const j = await r.json();
        const route = j.routes?.[0];
        if (route) {
          geometry = route.geometry;
          setEta(`${Math.round(route.duration / 60)} min`);
          setDist(`${(route.distance / 1000).toFixed(1)} km`);
        }
      } catch { /* usa línea recta */ }
      if (cancelled) return;

      const draw = () => {
        if (!map.getSource('route')) {
          map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry } as any });
          map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFC933', 'line-width': 5, 'line-opacity': 0.9 } });
        } else {
          (map.getSource('route') as mapboxgl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry } as any);
        }
      };
      if (map.isStyleLoaded()) draw(); else map.once('idle', draw);

      // Marcadores origen/destino
      new mapboxgl.Marker({ color: '#16A34A' }).setLngLat(o).setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setText('Origen')).addTo(map);
      new mapboxgl.Marker({ color: '#DC2626' }).setLngLat(d).setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setText('Destino')).addTo(map);

      const b = new mapboxgl.LngLatBounds();
      (geometry.coordinates as [number, number][]).forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 70, duration: 0 });
    })();

    return () => { cancelled = true; };
  }, [originAddress, destinationAddress, ready]);

  if (!TOKEN) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_MAPBOX_TOKEN.</div>;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {err ? (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/95 backdrop-blur shadow-lg border border-amber-200 text-sm text-amber-700">
          <MapPin size={15} className="text-amber-500" /> No se pudo trazar la ruta para estas direcciones.
        </div>
      ) : (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-4 px-4 py-2.5 rounded-xl bg-white/95 dark:bg-[#0f1522]/95 backdrop-blur shadow-lg border border-slate-200 dark:border-[#202a40]">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {statusText}
          </span>
          {eta && <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"><Clock size={14} /> {eta}</span>}
          {dist && <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"><Navigation size={14} /> {dist}</span>}
        </div>
      )}
    </div>
  );
}
