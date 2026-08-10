'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Clock, Navigation } from 'lucide-react';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor } from './mapTheme';
import { useT } from '../../lib/i18n';

interface Props {
  originAddress: string;
  destinationAddress: string;
  waypoints?: string[]; // paradas intermedias (en orden) entre origen y destino
  mapType?: 'roadmap' | 'satellite';
  statusText?: string;
  statusDotClass?: string; // clase Tailwind para el color del punto de estado
}

const geoCache = new Map<string, google.maps.LatLng | null>();

let geocoderInstance: google.maps.Geocoder | null = null;
function getGeocoder() {
  if (!geocoderInstance) geocoderInstance = new google.maps.Geocoder();
  return geocoderInstance;
}

async function geocode(addr: string): Promise<google.maps.LatLng | null> {
  if (!addr) return null;
  // "lat,lng" (posición actual) → punto directo, sin geocodificar.
  const m = addr.trim().match(/^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) return new google.maps.LatLng(parseFloat(m[1]), parseFloat(m[2]));
  if (geoCache.has(addr)) return geoCache.get(addr)!;
  try {
    // region:'it' sesga a Italia: evita que una dirección ambigua (p.ej. "Lima")
    // se resuelva a otro país. El móvil ya aplica el mismo sesgo.
    const { results } = await getGeocoder().geocode({ address: addr, region: 'it' });
    const loc = results?.[0]?.geometry?.location ?? null;
    geoCache.set(addr, loc);
    return loc;
  } catch {
    geoCache.set(addr, null);
    return null;
  }
}

export function MapboxRouteMap({ originAddress, destinationAddress, waypoints, mapType = 'roadmap', statusText, statusDotClass = 'bg-emerald-500' }: Props) {
  const t = useT();
  const resolvedStatusText = statusText ?? t('componentes.routeMap.enTransito');
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
      center: { lat: 45.4642, lng: 9.1900 },
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
      const wps = (waypoints || []).map((w) => (w || '').trim()).filter(Boolean);
      const [o, d, ...wpLocsRaw] = await Promise.all([
        geocode(originAddress),
        geocode(destinationAddress),
        ...wps.map((w) => geocode(w)),
      ]);
      if (cancelled) return;
      if (!o || !d) { setErr(true); return; }
      const wpLocs = wpLocsRaw.filter((x): x is google.maps.LatLng => !!x);

      clear();

      let path: google.maps.LatLng[] = [o, ...wpLocs, d];
      try {
        const svc = new google.maps.DirectionsService();
        const result = await svc.route({
          origin: o,
          destination: d,
          waypoints: wpLocs.map((loc) => ({ location: loc, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
        });
        const route = result.routes?.[0];
        if (route) {
          path = route.overview_path;
          // Suma de todos los tramos (origen → paradas → destino).
          const totMin = (route.legs || []).reduce((s, l) => s + (l.duration?.value ?? 0), 0);
          const totM = (route.legs || []).reduce((s, l) => s + (l.distance?.value ?? 0), 0);
          if (totMin) setEta(`${Math.round(totMin / 60)} min`);
          if (totM) setDist(`${(totM / 1000).toFixed(1)} km`);
        }
      } catch { /* usa línea recta origen→paradas→destino */ }
      if (cancelled) return;

      polylineRef.current = new google.maps.Polyline({
        path,
        strokeColor: '#FFC933',
        strokeWeight: 5,
        strokeOpacity: 0.9,
        map,
      });

      // Marcadores origen/paradas/destino con InfoWindow al hacer click.
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
        makeMarker(o, '#16A34A', t('componentes.routeMap.origen')),
        ...wpLocs.map((loc, i) => makeMarker(loc, '#F97316', `Parada ${i + 1}`)),
        makeMarker(d, '#DC2626', t('componentes.routeMap.destino')),
      ];

      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 70);
    })();

    return () => { cancelled = true; };
  }, [originAddress, destinationAddress, (waypoints || []).join('|'), isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">{t('componentes.routeMap.configurarMapa')}</div>;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {err ? (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/95 backdrop-blur shadow-lg border border-amber-200 text-sm text-amber-700">
          <MapPin size={15} className="text-amber-500" /> {t('componentes.routeMap.noSePudoTrazar')}
        </div>
      ) : (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-4 px-4 py-2.5 rounded-xl bg-white/95 dark:bg-[#0f1522]/95 backdrop-blur shadow-lg border border-slate-200 dark:border-[#202a40]">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <span className={`w-2 h-2 rounded-full ${statusDotClass}`} /> {resolvedStatusText}
          </span>
          {eta && <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"><Clock size={14} /> {eta}</span>}
          {dist && <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"><Navigation size={14} /> {dist}</span>}
        </div>
      )}
    </div>
  );
}
