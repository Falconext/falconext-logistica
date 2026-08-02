'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Truck } from 'lucide-react';
import api from '../../lib/api';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';
import { useT } from '../../lib/i18n';

interface LiveMapRealProps {
    deviceId: string;
    apiKey?: string; // ignorado: se usa NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    vehiclePlate?: string;
    deviceName?: string;
    workerName?: string;
}

export function MapboxLiveMap({ deviceId, vehiclePlate, deviceName, workerName }: LiveMapRealProps) {
    const t = useT();
    const { isLoaded } = useGoogleMaps();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const centeredRef = useRef(false);
    const [speed, setSpeed] = useState(0);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [preset, setPreset] = useState<MapPreset>('day');

    // Inicializar el mapa.
    useEffect(() => {
        if (!isLoaded || !containerRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
            center: { lat: 45.4642, lng: 9.1900 },
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            styles: stylesFor('day'),
        });
    }, [isLoaded]);

    // Preset Día/Noche (se aplica al cambiar el toggle).
    useEffect(() => {
        mapRef.current?.setOptions({ styles: stylesFor(preset) });
    }, [preset]);

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
                    markerRef.current = new google.maps.Marker({
                        position: { lat, lng },
                        map,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 9,
                            fillColor: '#2563EB',
                            fillOpacity: 1,
                            strokeColor: '#fff',
                            strokeWeight: 3,
                        },
                    });
                } else {
                    markerRef.current.setPosition({ lat, lng });
                }
                if (!centeredRef.current) { map.panTo({ lat, lng }); map.setZoom(15); centeredRef.current = true; }
            } catch (error) {
                console.error('Error fetching GPS position', error);
            }
        };

        fetchPosition();
        const id = setInterval(fetchPosition, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [deviceId, isLoaded]);

    if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">{t('componentes.liveMap.configurarMapa')}</div>;

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
                            {workerName || (vehiclePlate ? t('componentes.liveMap.vehiculoLabel', { placa: vehiclePlate }) : (deviceName || t('componentes.liveMap.idLabel', { id: deviceId.substring(0, 6) })))}
                        </h3>
                        <p className="text-xs text-slate-500">
                            {[vehiclePlate && t('componentes.liveMap.vehiculoShort', { placa: vehiclePlate }), lastUpdate ? t('componentes.liveMap.ultimaAct', { time: lastUpdate.toLocaleTimeString() }) : t('componentes.liveMap.esperandoData')].filter(Boolean).join(' · ')}
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
