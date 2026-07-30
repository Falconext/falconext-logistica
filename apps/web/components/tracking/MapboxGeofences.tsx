'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';
import { useT } from '../../lib/i18n';

interface GF { id: string; latitude: number; longitude: number; radius: number; }

/** Mapa de solo lectura: muestra todas las geocercas como círculos. */
export function GeofencesMap({ geofences }: { geofences: GF[] }) {
    const t = useT();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const circlesRef = useRef<google.maps.Circle[]>([]);
    const [ready, setReady] = useState(false);
    const [preset, setPreset] = useState<MapPreset>('day');
    const { isLoaded } = useGoogleMaps();

    useEffect(() => {
        if (!isLoaded || !containerRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
            center: { lat: -12.0464, lng: -77.0428 },
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            styles: stylesFor('day'),
        });
        setReady(true);
    }, [isLoaded]);

    useEffect(() => {
        if (ready && mapRef.current) mapRef.current.setOptions({ styles: stylesFor(preset) });
    }, [preset, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        // Limpia círculos previos antes de redibujar.
        circlesRef.current.forEach(c => c.setMap(null));
        circlesRef.current = geofences.map(g => new google.maps.Circle({
            center: { lat: g.latitude, lng: g.longitude },
            radius: g.radius,
            map,
            fillColor: '#3B82F6',
            fillOpacity: 0.2,
            strokeColor: '#2563EB',
            strokeWeight: 2,
        }));

        if (geofences.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            geofences.forEach(g => bounds.extend({ lat: g.latitude, lng: g.longitude }));
            map.fitBounds(bounds, 80);
        }
    }, [geofences, ready]);

    if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">{t('componentes.geofences.configurarMapa')}</div>;
    return (
        <div className="relative h-full w-full rounded-xl overflow-hidden">
            <div ref={containerRef} className="h-full w-full" />
            <MapThemeToggle preset={preset} onChange={setPreset} className="absolute top-3 right-3" />
        </div>
    );
}

/** Editor: centro arrastrable + círculo que sigue al radio. Click en el mapa reubica el centro. */
export function GeofenceEditorMap({ center, radius, onCenterChange }: { center: { lat: number; lng: number }; radius: number; onCenterChange: (lat: number, lng: number) => void }) {
    const t = useT();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const circleRef = useRef<google.maps.Circle | null>(null);
    const [ready, setReady] = useState(false);
    const [preset, setPreset] = useState<MapPreset>('day');
    const { isLoaded } = useGoogleMaps();
    const onChangeRef = useRef(onCenterChange);
    onChangeRef.current = onCenterChange;

    useEffect(() => {
        if (!isLoaded || !containerRef.current || mapRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
            center: { lat: center.lat, lng: center.lng },
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            styles: stylesFor('day'),
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) onChangeRef.current(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
        setReady(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded]);

    useEffect(() => {
        if (ready && mapRef.current) mapRef.current.setOptions({ styles: stylesFor(preset) });
    }, [preset, ready]);

    // Marcador arrastrable en el centro.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (!markerRef.current) {
            markerRef.current = new google.maps.Marker({
                position: { lat: center.lat, lng: center.lng },
                map,
                draggable: true,
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2563EB', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
            });
            markerRef.current.addListener('dragend', () => {
                const pos = markerRef.current!.getPosition();
                if (pos) onChangeRef.current(pos.lat(), pos.lng());
            });
        } else {
            markerRef.current.setPosition({ lat: center.lat, lng: center.lng });
        }
    }, [center.lat, center.lng, ready]);

    // Círculo que sigue al centro y radio.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (!circleRef.current) {
            circleRef.current = new google.maps.Circle({
                center: { lat: center.lat, lng: center.lng },
                radius,
                map,
                fillColor: '#3B82F6',
                fillOpacity: 0.3,
                strokeColor: '#2563EB',
                strokeWeight: 2,
            });
        } else {
            circleRef.current.setCenter({ lat: center.lat, lng: center.lng });
            circleRef.current.setRadius(radius);
        }
    }, [center.lat, center.lng, radius, ready]);

    if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">{t('componentes.geofences.configurarMapa')}</div>;
    return (
        <div className="relative h-full w-full">
            <div ref={containerRef} className="h-full w-full" />
            <MapThemeToggle preset={preset} onChange={setPreset} className="absolute top-3 right-3" />
        </div>
    );
}
