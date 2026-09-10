'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, FastForward, Calendar as CalendarIcon, RotateCcw, Route, Clock, Gauge, TrendingUp, MapPin, Timer, Navigation, AlertTriangle, Zap, Eye } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from './googleMaps';
import { stylesFor, MapThemeToggle, MapPreset } from './mapTheme';
import { useT } from '../../lib/i18n';

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

// "95" -> "1m 35s" ; "40" -> "40 s"
function fmtSeg(seg: number): string {
    if (seg < 60) return `${Math.round(seg)} s`;
    const m = Math.floor(seg / 60);
    const r = Math.round(seg % 60);
    return r === 0 ? `${m} min` : `${m}m ${r}s`;
}

// ── Velocidad instantánea ──────────────────────────────────────────────────
// Igual que el backend (gps.service computeMovingStats): la velocidad viene del
// dispositivo en m/s y se descartan lecturas absurdas (>= 200 km/h). Cuando el
// equipo no reporta velocidad (manda 0) se estima con distancia/tiempo entre
// puntos consecutivos, marcada como estimada para no venderla como exacta.
const MAX_KMH_VALIDA = 200;
const MAX_GAP_ESTIMACION_MS = 5 * 60 * 1000; // sin datos por más de 5 min no se estima

interface Velocidad {
    kmh: number;
    estimada: boolean;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function calcularVelocidades(history: Position[]): Velocidad[] {
    return history.map((p, i) => {
        const dev = p.speed * 3.6;
        if (p.speed > 0 && dev < MAX_KMH_VALIDA) return { kmh: dev, estimada: false };
        if (i === 0) return { kmh: 0, estimada: false };
        const prev = history[i - 1];
        const dtMs = p.timestamp.getTime() - prev.timestamp.getTime();
        if (dtMs < 1000 || dtMs > MAX_GAP_ESTIMACION_MS) return { kmh: 0, estimada: false };
        const kmh = haversineKm(prev, p) / (dtMs / 3600000);
        if (!Number.isFinite(kmh) || kmh >= MAX_KMH_VALIDA) return { kmh: 0, estimada: false };
        return { kmh, estimada: true };
    });
}

// Bandas de color relativas al umbral: por encima es exceso (rojo), desde el
// 75% del umbral es alta (ámbar), en movimiento normal (verde), parado (gris).
// Una velocidad ESTIMADA nunca llega a "exceso": un salto de GPS entre dos
// puntos produce picos de 150-180 km/h que no existieron, y en la revisión de
// un incidente eso sería acusar al chofer con un dato inventado. Se pinta
// como alta y se deja la marca "≈ estimada" en el panel.
type Banda = 'parado' | 'normal' | 'alta' | 'exceso';
const COLOR_BANDA: Record<Banda, string> = {
    parado: '#94A3B8',
    normal: '#16A34A',
    alta: '#F59E0B',
    exceso: '#DC2626',
};
function bandaDe(kmh: number, umbral: number, estimada = false): Banda {
    if (kmh > umbral) return estimada ? 'alta' : 'exceso';
    if (kmh > umbral * 0.75) return 'alta';
    if (kmh > 2) return 'normal';
    return 'parado';
}

// Tramo continuo por encima del umbral: sirve para listar los "eventos" y
// saltar con el cursor al punto de mayor velocidad de cada uno.
interface Exceso {
    startIdx: number;
    endIdx: number;
    maxIdx: number;
    maxKmh: number;
    startTime: Date;
    endTime: Date;
    duracionSeg: number;
}

function detectarExcesos(history: Position[], vel: Velocidad[], umbral: number): Exceso[] {
    const out: Exceso[] = [];
    let cur: Exceso | null = null;
    vel.forEach((v, i) => {
        if (v.kmh > umbral && !v.estimada) {
            if (!cur) {
                cur = { startIdx: i, endIdx: i, maxIdx: i, maxKmh: v.kmh, startTime: history[i].timestamp, endTime: history[i].timestamp, duracionSeg: 0 };
            } else {
                cur.endIdx = i;
                cur.endTime = history[i].timestamp;
                if (v.kmh > cur.maxKmh) { cur.maxKmh = v.kmh; cur.maxIdx = i; }
            }
        } else if (cur) {
            out.push(cur);
            cur = null;
        }
    });
    if (cur) out.push(cur);
    out.forEach(e => { e.duracionSeg = Math.max(0, (e.endTime.getTime() - e.startTime.getTime()) / 1000); });
    return out;
}

const UMBRAL_STORAGE_KEY = 'historyMap.umbralKmh';
const UMBRAL_DEFAULT = 130; // autostrada

export function MapboxHistoryMap({ deviceId, deviceName, vehiclePlate }: HistoryMapProps) {
    const t = useT();
    const { isLoaded } = useGoogleMaps();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const routeLineRef = useRef<google.maps.Polyline | null>(null);
    const cursorRef = useRef<google.maps.Marker | null>(null);
    const startRef = useRef<google.maps.Marker | null>(null);
    const endRef = useRef<google.maps.Marker | null>(null);
    const stopMarkersRef = useRef<google.maps.Marker[]>([]);
    const speedLinesRef = useRef<google.maps.Polyline[]>([]);
    const maxMarkerRef = useRef<google.maps.Marker | null>(null);
    const maxInfoRef = useRef<google.maps.InfoWindow | null>(null);
    const excesoMarkersRef = useRef<google.maps.Marker[]>([]);
    const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [history, setHistory] = useState<Position[]>([]);
    const [trip, setTrip] = useState<Trip | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [preset, setPreset] = useState<MapPreset>('day');
    // Umbral de exceso (km/h). Se recuerda por navegador; no es el límite legal de
    // cada vía (eso requiere un servicio de mapas de pago), es el tope que la
    // empresa decide vigilar.
    const [umbral, setUmbral] = useState<number>(UMBRAL_DEFAULT);
    useEffect(() => {
        try {
            const v = Number(localStorage.getItem(UMBRAL_STORAGE_KEY));
            if (Number.isFinite(v) && v >= 30 && v <= 200) setUmbral(v);
        } catch { /* sin storage: queda el default */ }
    }, []);
    const cambiarUmbral = (v: number) => {
        const n = Math.min(200, Math.max(30, Math.round(v) || UMBRAL_DEFAULT));
        setUmbral(n);
        try { localStorage.setItem(UMBRAL_STORAGE_KEY, String(n)); } catch { /* ignorar */ }
    };

    const velocidades = useMemo(() => calcularVelocidades(history), [history]);
    const excesos = useMemo(() => detectarExcesos(history, velocidades, umbral), [history, velocidades, umbral]);
    // Punto de velocidad máxima del día: se prefiere una lectura real del equipo;
    // solo si no hay ninguna se toma la mayor estimada.
    const maxIdx = useMemo(() => {
        let best = -1;
        let bestKmh = 0;
        let bestEstimada = true;
        velocidades.forEach((v, i) => {
            if (v.kmh <= 0) return;
            const mejor = (!v.estimada && bestEstimada) || (v.estimada === bestEstimada && v.kmh > bestKmh);
            if (best === -1 || mejor) { best = i; bestKmh = v.kmh; bestEstimada = v.estimada; }
        });
        return best;
    }, [velocidades]);

    // Saltar el cursor a un punto (desde la lista de excesos o el marcador de máxima).
    const irAlPunto = useCallback((idx: number) => {
        setIsPlaying(false);
        setCurrentIndex(idx);
        const p = history[idx];
        if (p && mapRef.current) {
            mapRef.current.panTo({ lat: p.lat, lng: p.lng });
            if ((mapRef.current.getZoom() ?? 0) < 14) mapRef.current.setZoom(14);
        }
    }, [history]);

    // Inicializar el mapa.
    useEffect(() => {
        if (!isLoaded || !containerRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
            center: { lat: 45.4642, lng: 9.1900 },
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
                if (data.length === 0) toast.info(t('componentes.historyMap.sinHistorial'));
            } catch (error) {
                console.error('Error fetching history:', error);
                toast.error(t('componentes.historyMap.errorCargar'));
            }
        })();
        return () => { cancelled = true; };
    }, [deviceId, selectedDate]);

    // Dibujar la ruta + marcadores A/B + paradas numeradas + encuadrar.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isLoaded) return;

        // Ruta pegada a las calles (Map Matching) si el backend la devolvió: va debajo,
        // fina y gris, como guía del camino real. Encima, los puntos crudos coloreados
        // por velocidad (los únicos que tienen velocidad por punto).
        // matchedGeometry.coordinates[i] = [lng, lat]; history[i] = { lng, lat }. En Google todo es { lat, lng }.
        const basePath: google.maps.LatLngLiteral[] = trip?.matchedGeometry?.coordinates?.length
            ? trip.matchedGeometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
            : [];
        if (!routeLineRef.current) {
            routeLineRef.current = new google.maps.Polyline({
                path: basePath,
                strokeColor: '#94A3B8',
                strokeWeight: 3,
                strokeOpacity: 0.55,
                map,
            });
        } else {
            routeLineRef.current.setPath(basePath);
        }

        // Segmentos por banda de velocidad: puntos consecutivos con la misma banda se
        // agrupan en una sola polilínea (una por punto sería inviable con miles de
        // posiciones). Cada tramo incluye el punto siguiente para no dejar huecos.
        speedLinesRef.current.forEach(l => l.setMap(null));
        speedLinesRef.current = [];
        if (history.length > 1) {
            let i = 0;
            while (i < history.length - 1) {
                const banda = bandaDe(velocidades[i]?.kmh ?? 0, umbral, velocidades[i]?.estimada);
                let j = i;
                while (j < history.length - 1 && bandaDe(velocidades[j]?.kmh ?? 0, umbral, velocidades[j]?.estimada) === banda) j++;
                const path = history.slice(i, j + 1).map(p => ({ lat: p.lat, lng: p.lng }));
                speedLinesRef.current.push(new google.maps.Polyline({
                    path,
                    strokeColor: COLOR_BANDA[banda],
                    strokeWeight: banda === 'exceso' ? 6 : 5,
                    strokeOpacity: 0.95,
                    zIndex: banda === 'exceso' ? 6 : 5,
                    map,
                }));
                i = j;
            }
        }

        // Marcador de la velocidad máxima del día (clic = llevar el cursor ahí).
        maxMarkerRef.current?.setMap(null); maxMarkerRef.current = null;
        maxInfoRef.current?.close();
        if (maxIdx >= 0 && history[maxIdx]) {
            const p = history[maxIdx];
            const v = velocidades[maxIdx];
            const marker = new google.maps.Marker({
                position: { lat: p.lat, lng: p.lng },
                map,
                zIndex: 50,
                title: t('componentes.historyMap.maxEnPunto'),
                label: { text: 'MAX', color: '#fff', fontWeight: '800', fontSize: '9px' },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 13,
                    fillColor: '#DC2626',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 3,
                },
            });
            const info = new google.maps.InfoWindow({
                content: `<div style="font-family:system-ui;font-size:12px"><b>${t('componentes.historyMap.maxEnPunto')}</b><br/>${Math.round(v.kmh)} km/h${v.estimada ? ` <i>(${t('componentes.historyMap.estimada')})</i>` : ''} · ${p.timestamp.toLocaleTimeString()}</div>`,
            });
            marker.addListener('click', () => { irAlPunto(maxIdx); info.open({ map, anchor: marker }); });
            maxMarkerRef.current = marker;
            maxInfoRef.current = info;
        }

        // Un marcador por exceso, en su punto de mayor velocidad.
        excesoMarkersRef.current.forEach(m => m.setMap(null));
        excesoMarkersRef.current = [];
        excesos.forEach((e, n) => {
            if (e.maxIdx === maxIdx) return; // ya lo cubre el marcador MAX
            const p = history[e.maxIdx];
            const marker = new google.maps.Marker({
                position: { lat: p.lat, lng: p.lng },
                map,
                zIndex: 40,
                title: `${t('componentes.historyMap.exceso')} ${n + 1} · ${Math.round(e.maxKmh)} km/h`,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 6,
                    fillColor: '#DC2626',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                },
            });
            marker.addListener('click', () => irAlPunto(e.maxIdx));
            excesoMarkersRef.current.push(marker);
        });

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
                content: `<div style="font-family:system-ui;font-size:12px"><b>${t('componentes.historyMap.popupParada', { n: idx + 1 })}</b><br/>${fmtHora(s.startTime)} – ${fmtHora(s.endTime)}<br/>${t('componentes.historyMap.detenidoLabel')}: <b>${fmtDur(s.durationMin)}</b></div>`,
            });
            marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
            stopMarkersRef.current.push(marker);
        });
    }, [history, trip, isLoaded, velocidades, excesos, maxIdx, umbral, irAlPunto, t]);

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
    const velActual = velocidades[currentIndex];
    const bandaActual: Banda = velActual ? bandaDe(velActual.kmh, umbral, velActual.estimada) : 'parado';
    const claseBanda: Record<Banda, string> = {
        parado: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        normal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        alta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        exceso: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    };

    if (!GOOGLE_MAPS_KEY) return <div className="h-full flex items-center justify-center text-slate-400">{t('componentes.historyMap.configurarMapa')}</div>;

    const stats = [
        { icon: Route, label: t('componentes.historyMap.distancia'), value: `${trip?.distanceKm ?? 0} km`, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
        { icon: Clock, label: t('componentes.historyMap.duracionTotal'), value: fmtDur(trip?.durationMin ?? 0), color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
        { icon: Navigation, label: t('componentes.historyMap.enMovimiento'), value: fmtDur(trip?.movingMin ?? 0), color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
        { icon: Timer, label: t('componentes.historyMap.detenido'), value: fmtDur(trip?.stoppedMin ?? 0), color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
        { icon: Gauge, label: t('componentes.historyMap.velPromedio'), value: `${trip?.avgSpeedKmh ?? 0} km/h`, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
        { icon: TrendingUp, label: t('componentes.historyMap.velMaxima'), value: `${trip?.maxSpeedKmh ?? 0} km/h`, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/30' },
        { icon: MapPin, label: t('componentes.historyMap.paradas'), value: `${trip?.stops.length ?? 0}`, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
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
                        <p className="text-xs text-slate-500 font-bold uppercase">{t('componentes.historyMap.fechaRastreo')}</p>
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
                        <p className="text-xs text-slate-500">{t('componentes.historyMap.jornada')}</p>
                        <p className="font-bold text-slate-900 dark:text-white">{fmtHora(trip?.startTime ?? null)} – {fmtHora(trip?.endTime ?? null)}</p>
                    </div>
                    <div className="text-right border-l pl-4 border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500">{vehiclePlate || t('componentes.historyMap.dispositivoFallback')}</p>
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
                            title={t('componentes.historyMap.reiniciar')}
                        >
                            <RotateCcw size={16} />
                        </button>
                        <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
                            <p className="text-xs text-slate-500 font-mono shrink-0">
                                {currentPos ? currentPos.timestamp.toLocaleTimeString() : '--:--:--'}
                            </p>
                            {/* Velocidad en el instante del cursor: es lo que se necesita para
                                revisar un incidente (a qué velocidad iba justo ahí). */}
                            <div
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-sm tabular-nums ${claseBanda[bandaActual]}`}
                                title={velActual?.estimada ? t('componentes.historyMap.estimadaTip') : t('componentes.historyMap.velActual')}
                            >
                                <Gauge size={14} />
                                {velActual ? `${Math.round(velActual.kmh)} km/h` : '— km/h'}
                                {velActual?.estimada && <span className="text-[10px] font-medium opacity-80">≈ {t('componentes.historyMap.estimada')}</span>}
                                {bandaActual === 'exceso' && <AlertTriangle size={13} />}
                            </div>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0" title={t('componentes.historyMap.umbralTip')}>
                            <AlertTriangle size={13} className="text-rose-500" />
                            {t('componentes.historyMap.umbral')}
                            <input
                                type="number"
                                min={30}
                                max={200}
                                step={5}
                                value={umbral}
                                onChange={(e) => cambiarUmbral(Number(e.target.value))}
                                className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs text-right tabular-nums outline-none focus:ring-2 focus:ring-rose-500/30"
                            />
                            km/h
                        </label>
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
                    {/* Leyenda de colores de la ruta */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        {([
                            ['normal', t('componentes.historyMap.leyendaNormal')],
                            ['alta', `${t('componentes.historyMap.leyendaAlta')} ≥ ${Math.round(umbral * 0.75)}`],
                            ['exceso', `${t('componentes.historyMap.leyendaExceso')} > ${umbral}`],
                            ['parado', t('componentes.historyMap.leyendaParado')],
                        ] as [Banda, string][]).map(([b, label]) => (
                            <span key={b} className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-4 h-1.5 rounded-full" style={{ backgroundColor: COLOR_BANDA[b] }} />
                                {label}
                            </span>
                        ))}
                        {excesos.length > 0 && (
                            <span className="ml-auto inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                                <AlertTriangle size={12} /> {t('componentes.historyMap.excesosBadge', { n: excesos.length })}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Excesos de velocidad (eventos) — solo cuando hay recorrido cargado */}
            {history.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1 flex flex-wrap items-center gap-2">
                        <Zap size={18} className="text-rose-600 dark:text-rose-400" />
                        {t('componentes.historyMap.excesosTitulo')}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${excesos.length ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'}`}>
                            {excesos.length}
                        </span>
                    </h3>
                    <p className="text-xs text-slate-500 mb-3">{t('componentes.historyMap.excesosSub', { umbral })}</p>
                    {excesos.length === 0 ? (
                        <p className="text-sm text-slate-500">{t('componentes.historyMap.sinExcesos', { umbral })}</p>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {excesos.map((e, n) => {
                                const activo = currentIndex >= e.startIdx && currentIndex <= e.endIdx;
                                return (
                                    <div key={e.startIdx} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm ${activo ? 'bg-rose-50/60 dark:bg-rose-900/10 -mx-2 px-2 rounded-lg' : ''}`}>
                                        <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{n + 1}</span>
                                        <span className="font-mono text-xs text-slate-500">{e.startTime.toLocaleTimeString()} – {e.endTime.toLocaleTimeString()}</span>
                                        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock size={12} /> {fmtSeg(e.duracionSeg)}</span>
                                        <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                                            <TrendingUp size={13} /> {Math.round(e.maxKmh)} km/h
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => irAlPunto(e.maxIdx)}
                                            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            <Eye size={13} /> {t('componentes.historyMap.verEnMapa')}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Tramos y paradas (timeline del día) */}
            {trip && trip.legs.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex flex-wrap items-center gap-2">
                        <Route size={18} className="text-blue-600 dark:text-blue-400" />
                        {t('componentes.historyMap.recorridoDia')}
                        {trip.expectedMovingMin != null && (
                            <span className="text-xs font-normal text-slate-400">{t('componentes.historyMap.esperadoEnRuta', { dur: fmtDur(trip.expectedMovingMin) })}</span>
                        )}
                        {trip.delayMin != null && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trip.delayMin > 1 ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' : trip.delayMin < -1 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`}>
                                {trip.delayMin > 1 ? t('componentes.historyMap.demoraTotalMin', { min: trip.delayMin }) : trip.delayMin < -1 ? t('componentes.historyMap.masRapidoMin', { min: Math.abs(trip.delayMin) }) : t('componentes.historyMap.enTiempo')}
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
                                        <span className="inline-flex items-center gap-1"><Gauge size={12} /> {leg.avgSpeedKmh} km/h {t('componentes.historyMap.promAbbrev')}</span>
                                    </div>
                                    {leg.expectedMin != null && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            <span className="text-slate-400">{t('componentes.historyMap.esperadoLabel', { dur: fmtDur(leg.expectedMin) })}</span>
                                            {leg.delayMin != null && (
                                                <span className={`font-semibold px-1.5 py-0.5 rounded ${leg.delayMin > 1 ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' : leg.delayMin < -1 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`}>
                                                    {leg.delayMin > 1 ? t('componentes.historyMap.demoraMin', { min: leg.delayMin }) : leg.delayMin < -1 ? t('componentes.historyMap.masRapidoMin', { min: Math.abs(leg.delayMin) }) : t('componentes.historyMap.enTiempo')}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {stopAfter && (
                                        <div className="mt-1.5 ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-md">
                                            <MapPin size={12} /> {t('componentes.historyMap.paradaDetenido', { n: idx + 1, dur: fmtDur(stopAfter.durationMin) })}
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
