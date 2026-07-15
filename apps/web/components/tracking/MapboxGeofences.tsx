'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { STANDARD_STYLE, applyFadedTheme, MapThemeToggle, MapPreset } from './mapTheme';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
if (TOKEN) mapboxgl.accessToken = TOKEN;

// Genera un polígono GeoJSON aproximando un círculo de radio en metros.
function circlePolygon(lng: number, lat: number, radiusM: number, points = 64): any {
    const coords: [number, number][] = [];
    const distX = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
    const distY = radiusM / 110540;
    for (let i = 0; i <= points; i++) {
        const theta = (i / points) * 2 * Math.PI;
        coords.push([lng + distX * Math.cos(theta), lat + distY * Math.sin(theta)]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

interface GF { id: string; latitude: number; longitude: number; radius: number; }

/** Mapa de solo lectura: muestra todas las geocercas como círculos. */
export function GeofencesMap({ geofences }: { geofences: GF[] }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const [ready, setReady] = useState(false);
    const [preset, setPreset] = useState<MapPreset>('day');

    useEffect(() => {
        if (!containerRef.current || mapRef.current || !TOKEN) return;
        const map = new mapboxgl.Map({ container: containerRef.current, style: STANDARD_STYLE, center: [-77.0428, -12.0464], zoom: 11, attributionControl: false });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
        map.on('load', () => setReady(true));
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
    }, []);

    useEffect(() => { if (ready && mapRef.current) applyFadedTheme(mapRef.current, preset); }, [preset, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const fc = { type: 'FeatureCollection', features: geofences.map(g => circlePolygon(g.longitude, g.latitude, g.radius)) } as any;
        const draw = () => {
            if (!map.getSource('geofences')) {
                map.addSource('geofences', { type: 'geojson', data: fc });
                map.addLayer({ id: 'geofences-fill', type: 'fill', source: 'geofences', paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.2 } });
                map.addLayer({ id: 'geofences-line', type: 'line', source: 'geofences', paint: { 'line-color': '#2563EB', 'line-width': 2 } });
            } else {
                (map.getSource('geofences') as mapboxgl.GeoJSONSource).setData(fc);
            }
        };
        if (map.isStyleLoaded()) draw(); else map.once('idle', draw);

        if (geofences.length > 0) {
            const b = new mapboxgl.LngLatBounds();
            geofences.forEach(g => b.extend([g.longitude, g.latitude]));
            map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 0 });
        }
    }, [geofences, ready]);

    if (!TOKEN) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_MAPBOX_TOKEN.</div>;
    return (
        <div className="relative h-full w-full rounded-xl overflow-hidden">
            <div ref={containerRef} className="h-full w-full" />
            <MapThemeToggle preset={preset} onChange={setPreset} className="absolute top-3 right-3" />
        </div>
    );
}

/** Editor: centro arrastrable + círculo que sigue al radio. Click en el mapa reubica el centro. */
export function GeofenceEditorMap({ center, radius, onCenterChange }: { center: { lat: number; lng: number }; radius: number; onCenterChange: (lat: number, lng: number) => void }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);
    const [ready, setReady] = useState(false);
    const [preset, setPreset] = useState<MapPreset>('day');
    const onChangeRef = useRef(onCenterChange);
    onChangeRef.current = onCenterChange;

    useEffect(() => {
        if (!containerRef.current || mapRef.current || !TOKEN) return;
        const map = new mapboxgl.Map({ container: containerRef.current, style: STANDARD_STYLE, center: [center.lng, center.lat], zoom: 13, attributionControl: false });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
        map.on('load', () => setReady(true));
        map.on('click', (e) => onChangeRef.current(e.lngLat.lat, e.lngLat.lng));
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { if (ready && mapRef.current) applyFadedTheme(mapRef.current, preset); }, [preset, ready]);

    // Marcador arrastrable en el centro.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (!markerRef.current) {
            markerRef.current = new mapboxgl.Marker({ color: '#2563EB', draggable: true })
                .setLngLat([center.lng, center.lat])
                .addTo(map);
            markerRef.current.on('dragend', () => {
                const ll = markerRef.current!.getLngLat();
                onChangeRef.current(ll.lat, ll.lng);
            });
        } else {
            markerRef.current.setLngLat([center.lng, center.lat]);
        }
    }, [center.lat, center.lng, ready]);

    // Círculo que sigue al centro y radio.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const fc = circlePolygon(center.lng, center.lat, radius);
        const draw = () => {
            if (!map.getSource('editor')) {
                map.addSource('editor', { type: 'geojson', data: fc });
                map.addLayer({ id: 'editor-fill', type: 'fill', source: 'editor', paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.3 } });
                map.addLayer({ id: 'editor-line', type: 'line', source: 'editor', paint: { 'line-color': '#2563EB', 'line-width': 2 } });
            } else {
                (map.getSource('editor') as mapboxgl.GeoJSONSource).setData(fc);
            }
        };
        if (map.isStyleLoaded()) draw(); else map.once('idle', draw);
    }, [center.lat, center.lng, radius, ready]);

    if (!TOKEN) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_MAPBOX_TOKEN.</div>;
    return (
        <div className="relative h-full w-full">
            <div ref={containerRef} className="h-full w-full" />
            <MapThemeToggle preset={preset} onChange={setPreset} className="absolute top-3 right-3" />
        </div>
    );
}
