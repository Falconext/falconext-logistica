'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Navigation, MapPin, CornerUpLeft, Clock, Timer, RefreshCw, Loader2, Route as RouteIcon, User, X, MapPinned, Coffee,
    WifiOff, History, ArrowUp, ArrowDown, Minus, Radio
} from 'lucide-react';
import clsx from 'clsx';
import api from '../../lib/api';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from '../../components/tracking/googleMaps';
import { stylesFor } from '../../components/tracking/mapTheme';

interface RecorridoActivo {
    id: string;
    trabajador: string;
    url_foto: string | null;
    placa: string | null;
    estado: 'EN_RUTA_IDA' | 'EN_DESTINO' | 'EN_RUTA_VUELTA' | 'EN_DESCANSO';
    descansando: boolean;
    descansoMin: number;
    origen: string | null;
    destino: string | null;
    origen_lat: number | null;
    origen_lng: number | null;
    destino_lat: number | null;
    destino_lng: number | null;
    programacion_id: string | null;
    iniciado_en: string;
    enTramoMin: number;
    etaMin: number | null;
    disponibleEnMin: number | null;
    posicion: { lat: number; lng: number; timestamp: string } | null;
    sinGps: boolean;
    ida_km: number | null;
    ida_min: number | null;
    paradas: Array<{ orden: number; label: string; es_retorno: boolean; entregado: boolean }>;
}

interface RecorridoHistorial {
    id: string;
    trabajador: string;
    placa: string | null;
    cliente: string | null;
    origen: string | null;
    destino: string | null;
    estado: 'COMPLETADO' | 'CANCELADO';
    iniciado_en: string;
    finalizado_en: string | null;
    duracionMin: number | null;
    ida_min: number | null;
    ida_km: number | null;
    vuelta_min: number | null;
    vuelta_km: number | null;
    descanso_min: number;
    esperadoMin: number | null;
    desvioMin: number | null;
}

const REFRESH_MS = 20000;

const ESTADO_META: Record<string, { label: string; chip: string; icon: any }> = {
    EN_RUTA_IDA: { label: 'En ruta · ida', chip: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400', icon: Navigation },
    EN_DESTINO: { label: 'En el destino', chip: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400', icon: MapPin },
    EN_RUTA_VUELTA: { label: 'Regresando', chip: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400', icon: CornerUpLeft },
    EN_DESCANSO: { label: 'Descansando', chip: 'text-orange-600 bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400', icon: Coffee },
};

function fmtMin(min: number | null): string {
    if (min == null) return '—';
    if (min < 1) return '<1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

export default function RecorridosPage() {
    const [data, setData] = useState<RecorridoActivo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [, setTick] = useState(0);
    const [mapRec, setMapRec] = useState<RecorridoActivo | null>(null);
    const [confirmClose, setConfirmClose] = useState<string | null>(null);
    const [closing, setClosing] = useState<string | null>(null);
    const [view, setView] = useState<'activos' | 'historial'>('activos');
    const [historial, setHistorial] = useState<RecorridoHistorial[]>([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [trazaId, setTrazaId] = useState<string | null>(null);
    const [traza, setTraza] = useState<any | null>(null);
    const [loadingTraza, setLoadingTraza] = useState(false);

    useEffect(() => {
        if (!trazaId) { setTraza(null); return; }
        let cancel = false;
        setLoadingTraza(true);
        api.get(`/recorridos/${trazaId}/traza`)
            .then((res) => { if (!cancel) setTraza(res.data); })
            .catch((e) => console.error(e))
            .finally(() => { if (!cancel) setLoadingTraza(false); });
        return () => { cancel = true; };
    }, [trazaId]);

    const loadHistorial = useCallback(async () => {
        setLoadingHist(true);
        try {
            const res = await api.get<RecorridoHistorial[]>('/recorridos/historial', { params: { limit: 50 } });
            setHistorial(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingHist(false);
        }
    }, []);
    useEffect(() => { if (view === 'historial') loadHistorial(); }, [view, loadHistorial]);

    const cerrar = useCallback(async (id: string) => {
        setClosing(id);
        try {
            await api.post(`/recorridos/${id}/cerrar`);
            setConfirmClose(null);
            await load(true);
        } catch (e) {
            console.error(e);
        } finally {
            setClosing(null);
        }
    }, []);

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const res = await api.get<RecorridoActivo[]>('/recorridos/activos');
            setData(Array.isArray(res.data) ? res.data : []);
            setLastUpdated(new Date());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const id = setInterval(() => load(true), REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);
    // Tick cada 30s para que "tiempo en tramo" avance en pantalla.
    useEffect(() => {
        const id = setInterval(() => setTick((n) => n + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const resumen = useMemo(() => ({
        total: data.length,
        ida: data.filter((r) => r.estado === 'EN_RUTA_IDA').length,
        destino: data.filter((r) => r.estado === 'EN_DESTINO').length,
        vuelta: data.filter((r) => r.estado === 'EN_RUTA_VUELTA').length,
        descanso: data.filter((r) => r.estado === 'EN_DESCANSO').length,
    }), [data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={20} /> Cargando recorridos...
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#1a1a1c] text-[#FFC933] flex items-center justify-center shrink-0">
                        <RouteIcon size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">Recorridos activos</h1>
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                </span>
                                <span className="text-[10px] font-bold tracking-wide text-emerald-600 dark:text-emerald-400">EN VIVO</span>
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Traslados en curso de tus choferes · tiempo y ETA a disponible
                            {lastUpdated && <span className="ml-1.5">· {lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Toggle Activos | Historial */}
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60">
                        <button
                            onClick={() => setView('activos')}
                            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition',
                                view === 'activos' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}
                        >
                            <Radio size={14} /> Activos
                        </button>
                        <button
                            onClick={() => setView('historial')}
                            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition',
                                view === 'historial' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}
                        >
                            <History size={14} /> Historial
                        </button>
                    </div>
                    <button
                        onClick={() => (view === 'activos' ? load(true) : loadHistorial())}
                        disabled={refreshing || loadingHist}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={clsx((refreshing || loadingHist) && 'animate-spin')} /> Actualizar
                    </button>
                </div>
            </div>

            {view === 'activos' && <>
            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                <Kpi label="En curso" value={resumen.total} tone="slate" icon={RouteIcon} />
                <Kpi label="En ruta (ida)" value={resumen.ida} tone="indigo" icon={Navigation} />
                <Kpi label="En destino" value={resumen.destino} tone="amber" icon={MapPin} />
                <Kpi label="Regresando" value={resumen.vuelta} tone="blue" icon={CornerUpLeft} />
                <Kpi label="Descansando" value={resumen.descanso} tone="orange" icon={Coffee} />
            </div>

            {/* Lista */}
            {data.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                    <RouteIcon size={26} className="opacity-50" />
                    <p className="text-sm">Ningún chofer tiene un recorrido en curso ahora mismo.</p>
                    <p className="text-xs">Cuando un chofer pulse «Iniciar ruta» en la app, aparecerá aquí en vivo.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {data.map((r) => {
                        const meta = ESTADO_META[r.estado];
                        const Icon = meta.icon;
                        return (
                            <div key={r.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
                                {/* Cabecera: chofer + estado */}
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                                        {r.url_foto
                                            ? <img src={r.url_foto} alt={r.trabajador} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-avatar.svg'; }} />
                                            : <div className="w-full h-full flex items-center justify-center text-slate-400"><User size={18} /></div>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{r.trabajador}</p>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] text-slate-400 truncate">{r.placa || 'Sin vehículo'}</span>
                                            {r.sinGps && (
                                                <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400" title="El chofer no está compartiendo su ubicación">
                                                    <WifiOff size={10} /> Sin GPS
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={clsx('shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold', meta.chip)}>
                                        <Icon size={12} /> {meta.label}
                                    </span>
                                </div>

                                {/* Ruta origen → destino */}
                                <div className="px-4 py-3 space-y-2 text-sm">
                                    <div className="flex items-start gap-2">
                                        <MapPin size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase text-slate-400">Origen</p>
                                            <p className="text-slate-700 dark:text-slate-200 truncate">{r.origen || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin size={14} className="text-slate-900 dark:text-white mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase text-slate-400">Destino</p>
                                            <p className="text-slate-700 dark:text-slate-200 truncate">{r.destino || '—'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Métricas: tiempo en tramo + ETA disponible */}
                                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                                    <div className="flex items-center gap-2">
                                        <Clock size={15} className="text-slate-400 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase text-slate-400">En este tramo</p>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{fmtMin(r.enTramoMin)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {r.estado === 'EN_DESCANSO'
                                            ? <Coffee size={15} className="text-orange-400 shrink-0" />
                                            : <Timer size={15} className="text-indigo-400 shrink-0" />}
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase text-slate-400">
                                                {r.estado === 'EN_DESCANSO' ? 'Descansando hace'
                                                    : r.estado === 'EN_RUTA_VUELTA' ? 'Disponible en'
                                                        : r.estado === 'EN_DESTINO' ? 'Estado' : 'Llega en'}
                                            </p>
                                            <p className={clsx('text-sm font-bold tabular-nums', r.estado === 'EN_DESCANSO' ? 'text-orange-600 dark:text-orange-400' : 'text-indigo-600 dark:text-indigo-400')}>
                                                {r.estado === 'EN_DESCANSO' ? fmtMin(r.descansoMin)
                                                    : r.estado === 'EN_DESTINO' ? 'En destino'
                                                        : `~${fmtMin(r.disponibleEnMin ?? r.etaMin)}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex border-t border-slate-100 dark:border-slate-800 divide-x divide-slate-100 dark:divide-slate-800">
                                    <button onClick={() => setMapRec(r)} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                        <MapPinned size={13} /> Ver en el mapa
                                    </button>
                                    {confirmClose === r.id ? (
                                        <div className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5">
                                            <span className="text-[11px] text-slate-500">¿Cerrar?</span>
                                            <button onClick={() => cerrar(r.id)} disabled={closing === r.id} className="px-2 py-1 rounded-md text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60">
                                                {closing === r.id ? '…' : 'Sí'}
                                            </button>
                                            <button onClick={() => setConfirmClose(null)} className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">No</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setConfirmClose(r.id)} title="Cerrar recorrido atascado" className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                            <X size={13} /> Cerrar
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            </>}

            {view === 'historial' && <HistorialSection items={historial} loading={loadingHist} onOpen={setTrazaId} />}

            {mapRec && <RecorridoMapModal rec={mapRec} onClose={() => setMapRec(null)} />}
            {trazaId && <TrazaModal data={traza} loading={loadingTraza} onClose={() => setTrazaId(null)} />}
        </div>
    );
}

/* ---------- Historial: recorridos cerrados con esperado vs real ---------- */
function HistorialSection({ items, loading, onOpen }: { items: RecorridoHistorial[]; loading: boolean; onOpen: (id: string) => void }) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Cargando historial...
            </div>
        );
    }
    if (items.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                <History size={26} className="opacity-50" />
                <p className="text-sm">Aún no hay recorridos finalizados.</p>
            </div>
        );
    }
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="px-4 py-3 font-medium">Chofer</th>
                            <th className="px-4 py-3 font-medium">Ruta</th>
                            <th className="px-4 py-3 font-medium">Estado</th>
                            <th className="px-4 py-3 font-medium text-right">Real (ida)</th>
                            <th className="px-4 py-3 font-medium text-right">Esperado</th>
                            <th className="px-4 py-3 font-medium text-right">Desvío</th>
                            <th className="px-4 py-3 font-medium text-right">Distancia</th>
                            <th className="px-4 py-3 font-medium text-right">Descanso</th>
                            <th className="px-4 py-3 font-medium text-right">Finalizó</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                        {items.map((r) => (
                            <tr key={r.id} onClick={() => onOpen(r.id)} title="Ver traza del recorrido" className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                                <td className="px-4 py-3">
                                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{r.trabajador}</p>
                                    <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{r.placa || (r.cliente || '—')}</p>
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                    <p className="truncate max-w-[220px]">{r.origen || '—'}</p>
                                    <p className="truncate max-w-[220px] text-slate-400">→ {r.destino || '—'}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={clsx('px-2 py-0.5 rounded-md text-[11px] font-semibold',
                                        r.estado === 'COMPLETADO' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' : 'text-slate-500 bg-slate-100 dark:bg-slate-800')}>
                                        {r.estado === 'COMPLETADO' ? 'Completado' : 'Cancelado'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{fmtMin(r.ida_min)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.esperadoMin != null ? fmtMin(r.esperadoMin) : '—'}</td>
                                <td className="px-4 py-3 text-right"><Desvio min={r.desvioMin} /></td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.ida_km != null ? `${r.ida_km} km` : '—'}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.descanso_min ? fmtMin(r.descanso_min) : '—'}</td>
                                <td className="px-4 py-3 text-right text-[11px] text-slate-400 whitespace-nowrap">
                                    {r.finalizado_en ? new Date(r.finalizado_en).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Desvío esperado vs real: verde si llegó antes/igual, rojo si tardó más.
function Desvio({ min }: { min: number | null }) {
    if (min == null) return <span className="text-slate-300">—</span>;
    if (min === 0) return <span className="inline-flex items-center gap-1 text-slate-500 tabular-nums"><Minus size={12} /> 0m</span>;
    const late = min > 0;
    return (
        <span className={clsx('inline-flex items-center gap-1 tabular-nums font-semibold',
            late ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
            {late ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {fmtMin(Math.abs(min))}
        </span>
    );
}

/* ---------- Modal con el mapa del recorrido (origen → destino + posición viva) ---------- */
function RecorridoMapModal({ rec, onClose }: { rec: RecorridoActivo; onClose: () => void }) {
    const { isLoaded } = useGoogleMaps();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    // Portal a <body>: el modal vive dentro de <main overflow-y-auto>, así que sin
    // portal el `fixed inset-0` queda acotado a ese contenedor en vez de cubrir
    // todo el viewport (se ve "subido"/recortado, tapando solo parte de la pantalla).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!isLoaded || !containerRef.current || mapRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
            center: { lat: 41.9, lng: 12.5 },
            zoom: 6,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            styles: stylesFor('day'),
        });
        mapRef.current = map;

        const bounds = new google.maps.LatLngBounds();
        const marker = (lat: number, lng: number, color: string, title: string, scale = 8) => {
            new google.maps.Marker({
                position: { lat, lng }, map, title,
                icon: { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
            });
            bounds.extend({ lat, lng });
        };

        const hasO = rec.origen_lat != null && rec.origen_lng != null;
        const hasD = rec.destino_lat != null && rec.destino_lng != null;
        if (hasO) marker(rec.origen_lat!, rec.origen_lng!, '#16A34A', `Origen: ${rec.origen ?? ''}`);
        if (hasD) marker(rec.destino_lat!, rec.destino_lng!, '#1a1a1c', `Destino: ${rec.destino ?? ''}`);
        if (rec.posicion) marker(rec.posicion.lat, rec.posicion.lng, '#2563EB', 'Posición actual', 9);

        // Ruta real (origen → paradas intermedias → destino) por Directions API.
        // Cae a línea recta origen→destino solo si la API falla.
        let cancelled = false;
        (async () => {
            if (!hasO || !hasD) return;
            const wps = (rec.paradas || [])
                .filter((p) => !p.es_retorno && p.label)
                .sort((a, b) => a.orden - b.orden)
                .map((p) => p.label);

            let path: google.maps.LatLng[] | google.maps.LatLngLiteral[] = [
                { lat: rec.origen_lat!, lng: rec.origen_lng! },
                { lat: rec.destino_lat!, lng: rec.destino_lng! },
            ];
            try {
                const svc = new google.maps.DirectionsService();
                const result = await svc.route({
                    origin: { lat: rec.origen_lat!, lng: rec.origen_lng! },
                    destination: { lat: rec.destino_lat!, lng: rec.destino_lng! },
                    waypoints: wps.map((label) => ({ location: label, stopover: true })),
                    travelMode: google.maps.TravelMode.DRIVING,
                });
                const route = result.routes?.[0];
                if (route) path = route.overview_path;
            } catch { /* usa línea recta origen→destino */ }
            if (cancelled) return;

            new google.maps.Polyline({
                path, map, geodesic: true, strokeColor: '#6366F1', strokeOpacity: 0.7, strokeWeight: 3,
            });
        })();

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, 60);
            if (hasO && !hasD && !rec.posicion) map.setZoom(13);
        }

        return () => { cancelled = true; };
    }, [isLoaded, rec]);

    if (!mounted) return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-3xl rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{rec.trabajador}</p>
                        <p className="text-xs text-slate-400 truncate">{rec.origen || '—'} → {rec.destino || '—'}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="h-[420px] relative">
                    {!GOOGLE_MAPS_KEY ? (
                        <div className="h-full flex items-center justify-center text-sm text-slate-400 px-6 text-center">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.</div>
                    ) : (rec.origen_lat == null && rec.destino_lat == null && !rec.posicion) ? (
                        <div className="h-full flex items-center justify-center text-sm text-slate-400 px-6 text-center">Sin coordenadas: no se pudo geocodificar el origen/destino ni hay posición GPS todavía.</div>
                    ) : (
                        <div ref={containerRef} className="h-full w-full" />
                    )}
                </div>
                <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Origen</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-white" /> Destino</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Posición actual</span>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ---------- Modal de traza detallada (ruta GPS real + análisis) ---------- */
function TrazaModal({ data, loading, onClose }: { data: any | null; loading: boolean; onClose: () => void }) {
    const { isLoaded } = useGoogleMaps();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    // Portal a <body> — mismo motivo que RecorridoMapModal (evita quedar acotado
    // al <main overflow-y-auto> en vez de cubrir el viewport completo).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const rec = data?.recorrido;
    const path: { lat: number; lng: number }[] = data?.path || [];
    const an = data?.analisis;

    useEffect(() => {
        if (!isLoaded || !containerRef.current || mapRef.current || !rec) return;
        const map = new google.maps.Map(containerRef.current, {
            center: { lat: 41.9, lng: 12.5 }, zoom: 6,
            disableDefaultUI: true, zoomControl: true, clickableIcons: false, styles: stylesFor('day'),
        });
        mapRef.current = map;
        const bounds = new google.maps.LatLngBounds();
        const marker = (lat: number, lng: number, color: string, title: string, scale = 8) => {
            new google.maps.Marker({ position: { lat, lng }, map, title, icon: { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 } });
            bounds.extend({ lat, lng });
        };
        // Trayecto real
        if (path.length > 1) {
            new google.maps.Polyline({ path, map, geodesic: true, strokeColor: '#2563EB', strokeOpacity: 0.85, strokeWeight: 4 });
            path.forEach((p) => bounds.extend(p));
            marker(path[0].lat, path[0].lng, '#16A34A', 'Inicio real', 7);
            marker(path[path.length - 1].lat, path[path.length - 1].lng, '#DC2626', 'Fin real', 7);
        }
        // Origen/destino planificados (si no hay trayecto, al menos esto)
        if (rec.origen_lat != null && rec.origen_lng != null) marker(rec.origen_lat, rec.origen_lng, '#16A34A', 'Origen');
        if (rec.destino_lat != null && rec.destino_lng != null) marker(rec.destino_lat, rec.destino_lng, '#1a1a1c', 'Destino');
        if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    }, [isLoaded, rec, path]);

    const hasPath = path.length > 1;
    const stops = an?.stops?.length ?? 0;

    if (!mounted) return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-4xl rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Traza del recorrido</p>
                        <p className="text-xs text-slate-400 truncate">{rec ? `${rec.origen || '—'} → ${rec.destino || '—'}` : ''}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition shrink-0"><X size={16} /></button>
                </div>

                {loading || !rec ? (
                    <div className="h-[420px] flex items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando traza...</div>
                ) : (
                    <>
                        <div className="h-[360px] relative">
                            <div ref={containerRef} className="h-full w-full" />
                            {!hasPath && (
                                <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
                                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 text-xs text-slate-500 shadow-sm">
                                        <WifiOff size={13} /> Sin trayecto GPS registrado (se muestran origen y destino)
                                    </span>
                                </div>
                            )}
                        </div>
                        {/* Resumen */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-px bg-slate-100 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800">
                            <TrazaStat label="Distancia real" value={an?.distanceKm ? `${an.distanceKm} km` : rec.ida_km != null ? `${rec.ida_km} km` : '—'} />
                            <TrazaStat label="Tiempo ida" value={fmtMin(rec.ida_min)} />
                            <TrazaStat label="Esperado" value={rec.esperado_ida_min != null ? fmtMin(Math.round(rec.esperado_ida_min)) : '—'} />
                            <TrazaStat label="Paradas" value={`${stops}`} />
                            <TrazaStat label="Vel. máx" value={an?.maxSpeedKmh ? `${Math.round(an.maxSpeedKmh)} km/h` : '—'} />
                            <TrazaStat label="Descanso" value={rec.descanso_min ? fmtMin(rec.descanso_min) : '—'} />
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

function TrazaStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white dark:bg-slate-900 px-3 py-2.5">
            <p className="text-[10px] uppercase text-slate-400">{label}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
        </div>
    );
}

const KPI_TONES: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-300',
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400',
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400',
    orange: 'text-orange-600 bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400',
};

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: any }) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', KPI_TONES[tone])}>
                <Icon size={18} />
            </div>
            <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-none">{value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{label}</p>
            </div>
        </div>
    );
}
