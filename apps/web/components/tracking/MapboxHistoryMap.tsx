'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, FastForward, Calendar as CalendarIcon, RotateCcw, Route, Clock, Gauge, TrendingUp, MapPin, Timer, Navigation } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';

interface HistoryMapProps {
    deviceId: string;
    apiKey?: string; // ignorado: se usa NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
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

interface Stop {
    lat: number;
    lng: number;
    startTime: string;
    endTime: string;
    durationMin: number;
}

interface Leg {
    from: string;
    to: string;
    startTime: string;
    endTime: string;
    durationMin: number;
    distanceKm: number;
    avgSpeedKmh: number;
    expectedMin?: number | null;
    delayMin?: number | null;
}

interface Trip {
    points: number;
    distanceKm: number;
    distanceSource?: 'mapbox' | 'gps';
    durationMin: number;
    movingMin: number;
    stoppedMin: number;
    expectedMovingMin?: number | null;
    delayMin?: number | null;
    avgSpeedKmh: number;
    maxSpeedKmh: number;
    startTime: string | null;
    endTime: string | null;
    matchedGeometry?: { type: string; coordinates: [number, number][] } | null;
    stops: Stop[];
    legs: Leg[];
}

// "135" -> "2h 15m" ; "45" -> "45 min"
function fmtDur(min: number): string {
    if (!min || min < 1) return '0 min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtHora(iso: string | null): string {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export function MapboxHistoryMap({ deviceId, deviceName, vehiclePlate }: HistoryMapProps) {
    const { isLoaded } = useGoogleMaps();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const routeLineRef = useRef<google.maps.Polyline | null>(null);
    const cursorRef = useRef<google.maps.Marker | null>(null);
    const startRef = useRef<google.maps.Marker | null>(null);
    const endRef = useRef<google.maps.Marker | null>(null);
    const stopMarkersRef = useRef<google.maps.Marker[]>([]);
    const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [history, setHistory] = useState<Position[]>([]);
    const [trip, setTrip] = useState<Trip | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [preset, setPreset] = useState<MapPreset>('day');

    // Inicializar el mapa.
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
    }, [isLoaded]);

    // Preset Día/Noche (se aplica al cambiar el toggle).
    useEffect(() => {
        mapRef.current?.setOptions({ styles: stylesFor(preset) });
    }, [preset]);

    // Cargar historial + análisis cuando cambia fecha o dispositivo.
    useEffect(() => {
        if (!deviceId) return;
        let cancelled = false;
        (async () => {
            setIsPlaying(false);
            setCurrentIndex(0);
            try {
                // Medianoche LOCAL del día elegido. Ojo: new Date('YYYY-MM-DD') se
                // parsea como UTC y en TZ negativas (Perú) cae al día anterior; con
                // el sufijo 'T00:00:00' se interpreta en la zona del navegador.
                const start = new Date(selectedDate + 'T00:00:00');
                const end = new Date(selectedDate + 'T23:59:59.999');
                const params = { from: start.toISOString(), to: end.toISOString() };
                const [resHist, resTrip] = await Promise.all([
                    api.get(`/gps/history/${deviceId}`, { params }),
                    api.get(`/gps/history/${deviceId}/analisis`, { params }),
                ]);
                if (cancelled) return;
                const data: Position[] = (resHist.data || []).map((d: any) => ({
                    lng: parseFloat(d.longitude),
                    lat: parseFloat(d.latitude),
                    timestamp: new Date(d.timestamp),
                    speed: d.speed || 0,
                    heading: d.heading || 0,
                })).filter((p: Position) => !isNaN(p.lat) && !isNaN(p.lng)).reverse(); // API DESC -> cronológico
                setHistory(data);
                setTrip(resTrip.data || null);
                if (data.length === 0) toast.info('No hay historial para la fecha seleccionada');
            } catch (error) {
                console.error('Error fetching history:', error);
                toast.error('Error al cargar historial');
            }
        })();
        return () => { cancelled = true; };
    }, [deviceId, selectedDate]);

    // Dibujar la ruta + marcadores A/B + paradas numeradas + encuadrar.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isLoaded) return;

        // Ruta pegada a las calles (Map Matching) si el backend la devolvió; si no, los puntos crudos.
        // matchedGeometry.coordinates[i] = [lng, lat]; history[i] = { lng, lat }. En Google todo es { lat, lng }.
        const routePath: google.maps.LatLngLiteral[] = trip?.matchedGeometry?.coordinates?.length
            ? trip.matchedGeometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
            : history.map(p => ({ lat: p.lat, lng: p.lng }));
        if (!routeLineRef.current) {
            routeLineRef.current = new google.maps.Polyline({
                path: routePath,
                strokeColor: '#3B82F6',
                strokeWeight: 4,
                strokeOpacity: 0.85,
                map,
            });
        } else {
            routeLineRef.current.setPath(routePath);
        }

        // Marcadores inicio (A) / fin (B)
        startRef.current?.setMap(null); endRef.current?.setMap(null); startRef.current = null; endRef.current = null;
        if (history.length > 0) {
            const mk = (text: string, color: string, pos: google.maps.LatLngLiteral) => new google.maps.Marker({
                position: pos,
                map,
                label: { text, color: '#fff', fontWeight: '700', fontSize: '11px' },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 11,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                },
            });
            startRef.current = mk('A', '#16A34A', { lat: history[0].lat, lng: history[0].lng });
            endRef.current = mk('B', '#DC2626', { lat: history[history.length - 1].lat, lng: history[history.length - 1].lng });

            const bounds = new google.maps.LatLngBounds();
            history.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
            map.fitBounds(bounds, 60);
        }

        // Marcadores de paradas (numerados, naranja).
        stopMarkersRef.current.forEach(m => m.setMap(null));
        stopMarkersRef.current = [];
        (trip?.stops || []).forEach((s, idx) => {
            const marker = new google.maps.Marker({
                position: { lat: s.lat, lng: s.lng },
                map,
                label: { text: String(idx + 1), color: '#fff', fontWeight: '800' },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: '#F97316',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 3,
                },
            });
            const infoWindow = new google.maps.InfoWindow({
                content: `<div style="font-family:system-ui;font-size:12px"><b>Parada ${idx + 1}</b><br/>${fmtHora(s.startTime)} – ${fmtHora(s.endTime)}<br/>Detenido: <b>${fmtDur(s.durationMin)}</b></div>`,
            });
            marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
            stopMarkersRef.current.push(marker);
        });
    }, [history, trip, isLoaded]);

    // Mover el cursor de reproducción.
    useEffect(() => {
        const map = mapRef.current;
        const pos = history[currentIndex];
        if (!map || !isLoaded || !pos) return;
        if (!cursorRef.current) {
            cursorRef.current = new google.maps.Marker({
                position: { lat: pos.lat, lng: pos.lng },
                map,
                zIndex: 999,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: '#FFC933',
                    fillOpacity: 1,
                    strokeColor: '#1a1a1c',
                    strokeWeight: 3,
                },
            });
        } else {
            cursorRef.current.setPosition({ lat: pos.lat, lng: pos.lng });
        }
    }, [currentIndex, history, isLoaded]);

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

    if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</div>;

    const stats = [
        { icon: Route, label: 'Distancia', value: `${trip?.distanceKm ?? 0} km`, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
        { icon: Clock, label: 'Duración total', value: fmtDur(trip?.durationMin ?? 0), color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
        { icon: Navigation, label: 'En movimiento', value: fmtDur(trip?.movingMin ?? 0), color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
        { icon: Timer, label: 'Detenido', value: fmtDur(trip?.stoppedMin ?? 0), color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
        { icon: Gauge, label: 'Vel. promedio', value: `${trip?.avgSpeedKmh ?? 0} km/h`, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
        { icon: TrendingUp, label: 'Vel. máxima', value: `${trip?.maxSpeedKmh ?? 0} km/h`, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/30' },
        { icon: MapPin, label: 'Paradas', value: `${trip?.stops.length ?? 0}`, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    ];

    return (
        <div className="w-full flex flex-col gap-4">
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
                    <div className="text-right mr-2">
                        <p className="text-xs text-slate-500">Jornada</p>
                        <p className="font-bold text-slate-900 dark:text-white">{fmtHora(trip?.startTime ?? null)} – {fmtHora(trip?.endTime ?? null)}</p>
                    </div>
                    <div className="text-right border-l pl-4 border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500">{vehiclePlate || 'Dispositivo'}</p>
                        <p className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{deviceName || deviceId}</p>
                    </div>
                </div>
            </div>

            {/* Tarjetas de métricas del recorrido */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {stats.map((s) => (
                    <div key={s.label} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2.5">
                        <div className={`${s.bg} ${s.color} p-2 rounded-lg shrink-0`}>
                            <s.icon size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] text-slate-500 leading-tight truncate">{s.label}</p>
                            <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight truncate">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mapa */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm h-[58vh] min-h-[360px]">
                <div ref={containerRef} className="h-full w-full" />

                <MapThemeToggle preset={preset} onChange={setPreset} className="absolute top-3 right-3" />

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

            {/* Tramos y paradas (timeline del día) */}
            {trip && trip.legs.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex flex-wrap items-center gap-2">
                        <Route size={18} className="text-blue-600 dark:text-blue-400" />
                        Recorrido del día
                        {trip.expectedMovingMin != null && (
                            <span className="text-xs font-normal text-slate-400">· esperado {fmtDur(trip.expectedMovingMin)} en ruta</span>
                        )}
                        {trip.delayMin != null && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trip.delayMin > 1 ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' : trip.delayMin < -1 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`}>
                                {trip.delayMin > 1 ? `+${trip.delayMin} min de demora total` : trip.delayMin < -1 ? `${Math.abs(trip.delayMin)} min más rápido` : 'En tiempo'}
                            </span>
                        )}
                    </h3>
                    <div className="relative pl-6">
                        {/* línea vertical del timeline */}
                        <div className="absolute left-[9px] top-1 bottom-1 w-0.5 bg-slate-200 dark:bg-slate-700" />
                        {trip.legs.map((leg, idx) => {
                            const stopAfter = trip.stops[idx]; // la parada al final de este tramo (si existe)
                            return (
                                <div key={idx} className="relative pb-4 last:pb-0">
                                    {/* punto del timeline */}
                                    <div className="absolute -left-[19px] top-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900" />
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                        <span className="font-semibold text-slate-900 dark:text-white">{leg.from} → {leg.to}</span>
                                        <span className="text-slate-400 text-xs">{fmtHora(leg.startTime)} – {fmtHora(leg.endTime)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                                        <span className="inline-flex items-center gap-1"><Clock size={12} /> {fmtDur(leg.durationMin)}</span>
                                        <span className="inline-flex items-center gap-1"><Route size={12} /> {leg.distanceKm} km</span>
                                        <span className="inline-flex items-center gap-1"><Gauge size={12} /> {leg.avgSpeedKmh} km/h prom.</span>
                                    </div>
                                    {leg.expectedMin != null && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            <span className="text-slate-400">Esperado: {fmtDur(leg.expectedMin)}</span>
                                            {leg.delayMin != null && (
                                                <span className={`font-semibold px-1.5 py-0.5 rounded ${leg.delayMin > 1 ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' : leg.delayMin < -1 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`}>
                                                    {leg.delayMin > 1 ? `+${leg.delayMin} min de demora` : leg.delayMin < -1 ? `${Math.abs(leg.delayMin)} min más rápido` : 'En tiempo'}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {stopAfter && (
                                        <div className="mt-1.5 ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-md">
                                            <MapPin size={12} /> Parada {idx + 1} · detenido {fmtDur(stopAfter.durationMin)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
