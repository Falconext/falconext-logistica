'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Clock, Navigation } from 'lucide-react';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor } from './mapTheme';

interface Props {
  originAddress: string;
  destinationAddress: string;
  mapType?: 'roadmap' | 'satellite';
  statusText?: string;
}

const geoCache = new Map<string, google.maps.LatLng | null>();

let geocoderInstance: google.maps.Geocoder | null = null;
function getGeocoder() {
  if (!geocoderInstance) geocoderInstance = new google.maps.Geocoder();
  return geocoderInstance;
}

async function geocode(addr: string): Promise<google.maps.LatLng | null> {
  if (!addr) return null;
  if (geoCache.has(addr)) return geoCache.get(addr)!;
  try {
    const { results } = await getGeocoder().geocode({ address: addr });
    const loc = results?.[0]?.geometry?.location ?? null;
    geoCache.set(addr, loc);
    return loc;
  } catch {
    geoCache.set(addr, null);
    return null;
  }
}

export function MapboxRouteMap({ originAddress, destinationAddress, mapType = 'roadmap', statusText = 'En Tránsito' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [eta, setEta] = useState('');
  const [dist, setDist] = useState('');
  const [err, setErr] = useState(false);

  const { isLoaded } = useGoogleMaps();
  const isSat = mapType === 'satellite';

  // Crear el mapa una sola vez cuando el SDK esté cargado.
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: { lat: -12.0464, lng: -77.0428 },
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      mapTypeId: isSat ? 'satellite' : 'roadmap',
      styles: isSat ? [] : stylesFor('day'),
    });
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar entre mapa/satélite sin recrear el mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMapTypeId(isSat ? 'satellite' : 'roadmap');
    map.setOptions({ styles: isSat ? [] : stylesFor('day') });
  }, [mapType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geocodificar, trazar ruta y marcadores.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !originAddress || !destinationAddress) return;
    let cancelled = false;

    const clear = () => {
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };

    (async () => {
      setErr(false);
      setEta('');
      setDist('');
      const [o, d] = await Promise.all([geocode(originAddress), geocode(destinationAddress)]);
      if (cancelled) return;
      if (!o || !d) { setErr(true); return; }

      clear();

      let path: google.maps.LatLng[] = [o, d];
      try {
        const svc = new google.maps.DirectionsService();
        const result = await svc.route({ origin: o, destination: d, travelMode: google.maps.TravelMode.DRIVING });
        const route = result.routes?.[0];
        if (route) {
          path = route.overview_path;
          setEta(route.legs?.[0]?.duration?.text ?? '');
          setDist(route.legs?.[0]?.distance?.text ?? '');
        }
      } catch { /* usa línea recta origen→destino */ }
      if (cancelled) return;

      polylineRef.current = new google.maps.Polyline({
        path,
        strokeColor: '#FFC933',
        strokeWeight: 5,
        strokeOpacity: 0.9,
        map,
      });

      // Marcadores origen/destino con InfoWindow al hacer click.
      const makeMarker = (pos: google.maps.LatLng, color: string, label: string) => {
        const marker = new google.maps.Marker({
          position: pos,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
        const info = new google.maps.InfoWindow({ content: label });
        marker.addListener('click', () => info.open({ map, anchor: marker }));
        return marker;
      };
      markersRef.current = [
        makeMarker(o, '#16A34A', 'Origen'),
        makeMarker(d, '#DC2626', 'Destino'),
      ];

      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 70);
    })();

    return () => { cancelled = true; };
  }, [originAddress, destinationAddress, isLoaded]);

  if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</div>;

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
