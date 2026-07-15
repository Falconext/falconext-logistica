'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Truck } from 'lucide-react';
import api from '../../lib/api';
import { STANDARD_STYLE, applyFadedTheme, MapThemeToggle, MapPreset } from './mapTheme';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
if (TOKEN) mapboxgl.accessToken = TOKEN;

interface LiveMapRealProps {
    deviceId: string;
    apiKey?: string; // ignorado: se usa NEXT_PUBLIC_MAPBOX_TOKEN
    vehiclePlate?: string;
    deviceName?: string;
    workerName?: string;
}

export function MapboxLiveMap({ deviceId, vehiclePlate, deviceName, workerName }: LiveMapRealProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);
    const centeredRef = useRef(false);
    const [ready, setReady] = useState(false);
    const [speed, setSpeed] = useState(0);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [preset, setPreset] = useState<MapPreset>('day');

    // Inicializar el mapa.
    useEffect(() => {
        if (!containerRef.current || mapRef.current || !TOKEN) return;
        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: STANDARD_STYLE,
            center: [-77.0428, -12.0464],
            zoom: 13,
            attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.on('load', () => setReady(true));
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
    }, []);

    // Tema Faded + preset Día/Noche (se aplica al cargar y al cambiar el toggle).
    useEffect(() => {
        if (ready && mapRef.current) applyFadedTheme(mapRef.current, preset);
    }, [preset, ready]);

    // Sondeo de posición cada 5s.
    useEffect(() => {
        if (!deviceId) return;
        let cancelled = false;

        const fetchPosition = async () => {
            try {
                const res = await api.get(`/gps/history/${deviceId}?limit=1`);
                if (cancelled || !res.data || res.data.length === 0) return;
                const latest = res.data[0];
                const lng = parseFloat(latest.longitude);
                const lat = parseFloat(latest.latitude);
                if (isNaN(lat) || isNaN(lng)) return;
                setSpeed(latest.speed || 0);
                setLastUpdate(new Date(latest.timestamp));

                const map = mapRef.current;
                if (!map) return;
                if (!markerRef.current) {
                    const el = document.createElement('div');
                    el.style.cssText = 'width:34px;height:34px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff';
                    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
                    markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
                } else {
                    markerRef.current.setLngLat([lng, lat]);
                }
                if (!centeredRef.current) { map.easeTo({ center: [lng, lat], zoom: 15, duration: 600 }); centeredRef.current = true; }
            } catch (error) {
                console.error('Error fetching GPS position', error);
            }
        };

        fetchPosition();
        const id = setInterval(fetchPosition, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [deviceId, ready]);

    if (!TOKEN) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_MAPBOX_TOKEN.</div>;

    return (
        <div className="relative h-full w-full">
            <div ref={containerRef} className="h-full w-full" />

            <MapThemeToggle preset={preset} onChange={setPreset} className="absolute bottom-4 left-4" />

            {/* Panel de info */}
            <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur p-4 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center pointer-events-auto">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Truck size={16} />
                            {workerName || (vehiclePlate ? `Vehículo: ${vehiclePlate}` : (deviceName || `ID: ${deviceId.substring(0, 6)}...`))}
                        </h3>
                        <p className="text-xs text-slate-500">
                            {[vehiclePlate && `Vehículo ${vehiclePlate}`, lastUpdate ? `Última act: ${lastUpdate.toLocaleTimeString()}` : 'Esperando data...'].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                            {(speed * 3.6).toFixed(1)} <span className="text-xs">km/h</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
