'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Pause, FastForward, Calendar as CalendarIcon, RotateCcw } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
if (TOKEN) mapboxgl.accessToken = TOKEN;

interface HistoryMapProps {
    deviceId: string;
    apiKey?: string; // ignorado: se usa NEXT_PUBLIC_MAPBOX_TOKEN
    deviceName?: string;
    vehiclePlate?: string;
}

interface Position {
    lng: number;
    lat: number;
    timestamp: Date;
    speed: number;
    heading: number;
}

export function MapboxHistoryMap({ deviceId, deviceName, vehiclePlate }: HistoryMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const cursorRef = useRef<mapboxgl.Marker | null>(null);
    const startRef = useRef<mapboxgl.Marker | null>(null);
    const endRef = useRef<mapboxgl.Marker | null>(null);
    const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [ready, setReady] = useState(false);

    const [history, setHistory] = useState<Position[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);

    // Inicializar el mapa.
    useEffect(() => {
        if (!containerRef.current || mapRef.current || !TOKEN) return;
        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [-77.0428, -12.0464],
            zoom: 11,
            attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', () => setReady(true));
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
    }, []);

    // Cargar historial cuando cambia fecha o dispositivo.
    useEffect(() => {
        if (!deviceId) return;
        let cancelled = false;
        (async () => {
            setIsPlaying(false);
            setCurrentIndex(0);
            try {
                const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
                const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
                const res = await api.get(`/gps/history/${deviceId}`, { params: { from: start.toISOString(), to: end.toISOString() } });
                if (cancelled) return;
                const data: Position[] = (res.data || []).map((d: any) => ({
                    lng: parseFloat(d.longitude),
                    lat: parseFloat(d.latitude),
                    timestamp: new Date(d.timestamp),
                    speed: d.speed || 0,
                    heading: d.heading || 0,
                })).filter((p: Position) => !isNaN(p.lat) && !isNaN(p.lng)).reverse(); // API DESC -> cronológico
                setHistory(data);
                if (data.length === 0) toast.info('No hay historial para la fecha seleccionada');
            } catch (error) {
                console.error('Error fetching history:', error);
                toast.error('Error al cargar historial');
            }
        })();
        return () => { cancelled = true; };
    }, [deviceId, selectedDate]);

    // Dibujar la ruta + marcadores A/B + encuadrar cuando cambia el historial.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;

        const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: history.map(p => [p.lng, p.lat]) } } as any;
        const draw = () => {
            if (!map.getSource('hist')) {
                map.addSource('hist', { type: 'geojson', data: line });
                map.addLayer({ id: 'hist', type: 'line', source: 'hist', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3B82F6', 'line-width': 4, 'line-opacity': 0.85 } });
            } else {
                (map.getSource('hist') as mapboxgl.GeoJSONSource).setData(line);
            }
        };
        if (map.isStyleLoaded()) draw(); else map.once('idle', draw);

        // Marcadores inicio (A) / fin (B)
        startRef.current?.remove(); endRef.current?.remove(); startRef.current = null; endRef.current = null;
        if (history.length > 0) {
            const mk = (text: string, color: string) => {
                const el = document.createElement('div');
                el.style.cssText = `width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center`;
                el.innerHTML = `<span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700;font-family:system-ui">${text}</span>`;
                return el;
            };
            startRef.current = new mapboxgl.Marker({ element: mk('A', '#16A34A'), anchor: 'bottom' }).setLngLat([history[0].lng, history[0].lat]).addTo(map);
            endRef.current = new mapboxgl.Marker({ element: mk('B', '#DC2626'), anchor: 'bottom' }).setLngLat([history[history.length - 1].lng, history[history.length - 1].lat]).addTo(map);

            const b = new mapboxgl.LngLatBounds();
            history.forEach(p => b.extend([p.lng, p.lat]));
            map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
        }
    }, [history, ready]);

    // Mover el cursor de reproducción.
    useEffect(() => {
        const map = mapRef.current;
        const pos = history[currentIndex];
        if (!map || !ready || !pos) return;
        if (!cursorRef.current) {
            const el = document.createElement('div');
            el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#FFC933;border:3px solid #1a1a1c;box-shadow:0 0 0 3px rgba(255,201,51,.4)';
            cursorRef.current = new mapboxgl.Marker({ element: el }).setLngLat([pos.lng, pos.lat]).addTo(map);
        } else {
            cursorRef.current.setLngLat([pos.lng, pos.lat]);
        }
    }, [currentIndex, history, ready]);

    // Bucle de reproducción.
    useEffect(() => {
        if (isPlaying && history.length > 0) {
            playbackTimerRef.current = setInterval(() => {
                setCurrentIndex(prev => {
                    if (prev >= history.length - 1) { setIsPlaying(false); return prev; }
                    return prev + 1;
                });
            }, 1000 / playbackSpeed);
        } else if (playbackTimerRef.current) {
            clearInterval(playbackTimerRef.current);
        }
        return () => { if (playbackTimerRef.current) clearInterval(playbackTimerRef.current); };
    }, [isPlaying, playbackSpeed, history.length]);

    const toggleSpeed = () => setPlaybackSpeed(prev => (prev === 1 ? 5 : prev === 5 ? 10 : 1));
    const currentPos = history[currentIndex];

    if (!TOKEN) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_MAPBOX_TOKEN.</div>;

    return (
        <div className="relative h-full w-full flex flex-col gap-4">
            {/* Header de controles */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                        <CalendarIcon size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase">Fecha de Rastreo</p>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent font-medium text-slate-900 dark:text-white outline-none cursor-pointer"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right mr-4">
                        <p className="text-xs text-slate-500">Puntos</p>
                        <p className="font-bold text-slate-900 dark:text-white">{history.length}</p>
                    </div>
                    <div className="text-right border-l pl-4 border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500">{vehiclePlate || 'Dispositivo'}</p>
                        <p className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{deviceName || deviceId}</p>
                    </div>
                </div>
            </div>

            {/* Mapa */}
            <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                <div ref={containerRef} className="h-full w-full" />

                {/* Controles de reproducción */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-10">
                    <div className="flex items-center gap-4 mb-2">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-lg shadow-blue-500/30"
                        >
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <button
                            onClick={toggleSpeed}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                        >
                            <FastForward size={14} /> {playbackSpeed}x
                        </button>
                        <button
                            onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title="Reiniciar"
                        >
                            <RotateCcw size={16} />
                        </button>
                        <div className="flex-1 text-center">
                            <p className="text-xs text-slate-500 font-mono">
                                {currentPos ? currentPos.timestamp.toLocaleTimeString() : '--:--:--'}
                            </p>
                        </div>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max={Math.max(history.length - 1, 0)}
                        value={currentIndex}
                        onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        disabled={history.length === 0}
                    />
                </div>
            </div>
        </div>
    );
}
