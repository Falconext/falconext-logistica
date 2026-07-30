'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Users, Truck, Package, RefreshCw, Loader2, MapPin, Clock, AlertTriangle,
    CheckCircle2, XCircle, Navigation, PauseCircle, Search, Bell, LogIn, LogOut, MapPinned, FileWarning
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import api from '../../lib/api';
import { PanelLiveMap } from '../../components/tracking/PanelLiveMap';

/* ---------- Tipos del endpoint /panel/status ---------- */
interface Trabajador {
    id: string; id_trabajador?: string | null; nombre_completo: string; cargo?: string | null;
    url_foto?: string | null; area_trabajo?: string | null; estado_laboral?: string | null;
    disponible: boolean; enOperacion: boolean; disponibleReal: boolean;
}
interface ZonaPersonal { zona: string; total: number; disponibles: number; trabajadores: Trabajador[]; }
interface Vehiculo {
    id: string; placa: string; marca_modelo?: string | null; tipo_unidad?: string | null;
    id_interno_furgon?: string | null; url_foto?: string | null; estado_vehiculo?: string | null;
    disponible: boolean; enOperacion: boolean; disponibleReal: boolean;
}
interface Entrega {
    id: string; id_programacion?: string | null; targa?: string | null; autista?: string | null;
    cliente?: string | null; lugar_retiro?: string | null; lugar_entrega?: string | null;
    fecha_entrega?: string | null; estado?: string | null; restanteMin: number | null;
}
interface PanelStatus {
    personal: ZonaPersonal[];
    flota: Vehiculo[];
    entregas: { enConsegna: Entrega[]; enSospeso: Entrega[] };
    resumen: {
        personalTotal: number; personalDisponible: number;
        flotaTotal: number; flotaDisponible: number; entregasActivas: number;
    };
}
// Alertas de vencimientos (módulo Alertas) + eventos de geocerca (módulo Rastreo).
interface DocumentAlert {
    trabajadorNombre: string; documentLabel: string; daysRemaining: number;
    severity: 'critical' | 'warning' | 'info'; entityName?: string;
}
interface AlertSummary { critical: number; warning: number; info: number; total: number; }
interface GeoEvent { id: string; event_type: string; timestamp: string; geofence: string; label: string; }

/* ---------- Helpers ---------- */
// Placa "PLACA - MODELO" → solo la placa (datos legacy).
const soloPlaca = (raw?: string | null) => (raw || '').trim().split(/\s+/)[0] || '—';

// Minutos restantes → texto humano. Negativo = atrasado.
function fmtRestante(min: number | null): { text: string; tone: 'late' | 'soon' | 'ok' | 'none' } {
    if (min == null) return { text: 'Sin fecha', tone: 'none' };
    const late = min < 0;
    const abs = Math.abs(min);
    const d = Math.floor(abs / 1440);
    const h = Math.floor((abs % 1440) / 60);
    const m = abs % 60;
    const parts = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    if (late) return { text: `Atrasado ${parts}`, tone: 'late' };
    if (min <= 120) return { text: `En ${parts}`, tone: 'soon' };
    return { text: `En ${parts}`, tone: 'ok' };
}

// Recalcula minutos restantes en el cliente para que la cuenta regresiva avance sin refetch.
function restanteFrom(e: Entrega, nowMs: number): number | null {
    if (e.fecha_entrega) return Math.round((new Date(e.fecha_entrega).getTime() - nowMs) / 60000);
    return e.restanteMin;
}

// Días restantes → texto ("Vence hoy" / "en Nd" / "Vencido Nd").
function fmtDias(d: number): string {
    if (d < 0) return `Vencido ${Math.abs(d)}d`;
    if (d === 0) return 'Vence hoy';
    return `en ${d}d`;
}

function timeAgo(ts: string): string {
    const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
}

const REFRESH_MS = 30000;

export default function PanelPage() {
    const [data, setData] = useState<PanelStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [now, setNow] = useState<number>(() => Date.now());
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [busyToggle, setBusyToggle] = useState<Set<string>>(new Set());
    const [tab, setTab] = useState<'consegna' | 'sospeso'>('consegna');
    const [zonaQuery, setZonaQuery] = useState('');
    const [alerts, setAlerts] = useState<DocumentAlert[]>([]);
    const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null);
    const [geoEvents, setGeoEvents] = useState<GeoEvent[]>([]);

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        // Panel + módulos conectados (alertas de vencimientos + eventos de geocerca).
        // allSettled: si un módulo falla, el resto del panel sigue funcionando.
        const [statusR, alertsR, summaryR, geoR] = await Promise.allSettled([
            api.get<PanelStatus>('/panel/status'),
            api.get<DocumentAlert[]>('/alerts/documents', { params: { days: 30 } }),
            api.get<AlertSummary>('/alerts/summary'),
            api.get<GeoEvent[]>('/gps/geofence-events', { params: { limit: 12 } }),
        ]);
        if (statusR.status === 'fulfilled') {
            setData(statusR.value.data);
            setLastUpdated(new Date());
            setNow(Date.now());
        } else if (!silent) {
            console.error(statusR.reason);
            toast.error('Error cargando el panel');
        }
        if (alertsR.status === 'fulfilled') setAlerts(alertsR.value.data ?? []);
        if (summaryR.status === 'fulfilled') setAlertSummary(summaryR.value.data ?? null);
        if (geoR.status === 'fulfilled') setGeoEvents(geoR.value.data ?? []);
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh + tick de reloj cada 30s (la cuenta regresiva avanza sola).
    useEffect(() => {
        const id = setInterval(() => load(true), REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    // Toggle de disponibilidad (personal o vehículo). Optimista.
    const toggleDisponible = useCallback(async (kind: 'trabajador' | 'vehiculo', id: string, next: boolean) => {
        setBusyToggle((s) => new Set(s).add(id));
        setData((prev) => {
            if (!prev) return prev;
            if (kind === 'trabajador') {
                const personal = prev.personal.map((z) => {
                    const trabajadores = z.trabajadores.map((t) =>
                        t.id === id ? { ...t, disponible: next, disponibleReal: next && !t.enOperacion } : t);
                    return { ...z, trabajadores, disponibles: trabajadores.filter((t) => t.disponibleReal).length };
                });
                return { ...prev, personal, resumen: { ...prev.resumen, personalDisponible: personal.reduce((s, z) => s + z.disponibles, 0) } };
            }
            const flota = prev.flota.map((v) =>
                v.id === id ? { ...v, disponible: next, disponibleReal: next && !v.enOperacion } : v);
            return { ...prev, flota, resumen: { ...prev.resumen, flotaDisponible: flota.filter((v) => v.disponibleReal).length } };
        });
        try {
            await api.patch(`/panel/${kind}/${id}/disponibilidad`, { disponible: next });
        } catch (err) {
            console.error(err);
            toast.error('No se pudo actualizar la disponibilidad');
            load(true);
        } finally {
            setBusyToggle((s) => { const n = new Set(s); n.delete(id); return n; });
        }
    }, [load]);

    const r = data?.resumen;
    const enConsegna = data?.entregas.enConsegna ?? [];
    const enSospeso = data?.entregas.enSospeso ?? [];
    // Placas en ruta → para realzar esos vehículos en el mini-mapa.
    const enConsegnaPlacas = useMemo(() => enConsegna.map((e) => e.targa || '').filter(Boolean), [enConsegna]);

    const zonasFiltradas = useMemo(() => {
        const q = zonaQuery.trim().toLowerCase();
        const base = data?.personal ?? [];
        if (!q) return base;
        return base
            .map((z) => ({ ...z, trabajadores: z.trabajadores.filter((t) => t.nombre_completo.toLowerCase().includes(q) || z.zona.toLowerCase().includes(q)) }))
            .filter((z) => z.trabajadores.length > 0);
    }, [data?.personal, zonaQuery]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={20} /> Cargando panel...
            </div>
        );
    }

    const entregasTab = tab === 'consegna' ? enConsegna : enSospeso;

    return (
        <div className="space-y-5 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFCC00] to-[#F5A800] text-[#3a2c00] flex items-center justify-center shrink-0 shadow-sm">
                        <Navigation size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">Panel de Control</h1>
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                </span>
                                <span className="text-[10px] font-bold tracking-wide text-emerald-600 dark:text-emerald-400">EN VIVO</span>
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Torre operativa · disponibilidad y entregas
                            {lastUpdated && <span className="ml-1.5">· actualizado {lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60"
                >
                    <RefreshCw size={15} className={clsx(refreshing && 'animate-spin')} /> Actualizar
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                <KpiCard icon={Users} label="Personal disponible" value={`${r?.personalDisponible ?? 0}/${r?.personalTotal ?? 0}`} tone="emerald" />
                <KpiCard icon={Truck} label="Flota disponible" value={`${r?.flotaDisponible ?? 0}/${r?.flotaTotal ?? 0}`} tone="blue" />
                <KpiCard icon={Package} label="Entregas activas" value={r?.entregasActivas ?? 0} tone="amber" />
                <KpiCard icon={Navigation} label="En consegna" value={enConsegna.length} tone="indigo" />
                <KpiCard icon={PauseCircle} label="In sospeso" value={enSospeso.length} tone="slate" />
            </div>

            {/* Héroe: mapa en vivo (Rastreo) + entregas activas */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                {/* Mapa en vivo */}
                <div className="xl:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <MapPin size={17} className="text-indigo-500" />
                            <h2 className="font-bold text-slate-900 dark:text-white leading-tight">Flota en vivo</h2>
                        </div>
                        <Link href="/rastreo" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Ver rastreo →</Link>
                    </div>
                    <div className="h-[360px] sm:h-[420px]">
                        <PanelLiveMap enConsegnaPlacas={enConsegnaPlacas} />
                    </div>
                </div>

                {/* Entregas activas con pestañas */}
                <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden flex flex-col">
                    <div className="flex items-center gap-1 p-1.5 border-b border-slate-100 dark:border-slate-800">
                        <TabButton active={tab === 'consegna'} onClick={() => setTab('consegna')} icon={Navigation} label="In Consegna" count={enConsegna.length} accent="indigo" />
                        <TabButton active={tab === 'sospeso'} onClick={() => setTab('sospeso')} icon={PauseCircle} label="In Sospeso" count={enSospeso.length} accent="amber" />
                    </div>
                    <div className="flex-1 divide-y divide-slate-50 dark:divide-slate-800/60 overflow-y-auto max-h-[420px]">
                        {entregasTab.length === 0 ? (
                            <div className="py-16 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                                <Package size={22} className="opacity-50" />
                                <p className="text-sm">Sin entregas {tab === 'consegna' ? 'en ruta' : 'pendientes'}.</p>
                            </div>
                        ) : entregasTab.map((e) => {
                            const rest = fmtRestante(restanteFrom(e, now));
                            return (
                                <Link key={e.id} href={`/operaciones?op=${e.id}`} title="Ver en Operaciones" className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                                        <Package size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{soloPlaca(e.targa)}</span>
                                            <span className="text-xs text-slate-400 truncate">{e.autista || 'Sin conductor'}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {e.cliente ? `${e.cliente} · ` : ''}{e.lugar_entrega || 'Sin destino'}
                                        </p>
                                    </div>
                                    <span className={clsx(
                                        'shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap',
                                        rest.tone === 'late' ? 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400'
                                            : rest.tone === 'soon' ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400'
                                                : rest.tone === 'ok' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                    : 'text-slate-400 bg-slate-100 dark:bg-slate-800'
                                    )}>
                                        {rest.tone === 'late' ? <AlertTriangle size={12} /> : <Clock size={12} />}
                                        {rest.text}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Vencimientos (módulo Alertas) + Actividad de geocercas (módulo Rastreo) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Vencimientos */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                            <Bell size={17} className="text-amber-500 shrink-0" />
                            <h2 className="font-bold text-slate-900 dark:text-white truncate">Vencimientos</h2>
                            {alertSummary && (alertSummary.critical > 0 || alertSummary.warning > 0) && (
                                <div className="flex items-center gap-1.5 ml-1">
                                    {alertSummary.critical > 0 && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400">{alertSummary.critical} crít.</span>}
                                    {alertSummary.warning > 0 && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400">{alertSummary.warning} próx.</span>}
                                </div>
                            )}
                        </div>
                        <Link href="/alertas" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0">Ver todas →</Link>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-slate-800/60 overflow-y-auto max-h-[300px]">
                        {alerts.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                                <CheckCircle2 size={22} className="opacity-50" />
                                <p className="text-sm">Sin vencimientos en los próximos 30 días.</p>
                            </div>
                        ) : alerts.slice(0, 8).map((a, i) => {
                            const critical = a.severity === 'critical' || a.daysRemaining < 0;
                            return (
                                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                        critical ? 'bg-red-50 text-red-500 dark:bg-red-500/10' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10')}>
                                        <FileWarning size={15} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{a.trabajadorNombre || a.entityName || '—'}</p>
                                        <p className="text-[11px] text-slate-400 truncate">{a.documentLabel}</p>
                                    </div>
                                    <span className={clsx('shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap',
                                        critical ? 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400' : 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400')}>
                                        {fmtDias(a.daysRemaining)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Actividad de geocercas */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                            <MapPinned size={17} className="text-indigo-500 shrink-0" />
                            <h2 className="font-bold text-slate-900 dark:text-white truncate">Actividad de geocercas</h2>
                            {geoEvents.length > 0 && <span className="text-xs text-slate-400">({geoEvents.length})</span>}
                        </div>
                        <Link href="/geocercas" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0">Ver geocercas →</Link>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-slate-800/60 overflow-y-auto max-h-[300px]">
                        {geoEvents.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                                <MapPinned size={22} className="opacity-50" />
                                <p className="text-sm">Sin eventos de entrada/salida recientes.</p>
                            </div>
                        ) : geoEvents.map((ev) => {
                            const enter = ev.event_type === 'ENTER';
                            return (
                                <div key={ev.id} className="px-4 py-2.5 flex items-center gap-3">
                                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                        enter ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10')}>
                                        {enter ? <LogIn size={15} /> : <LogOut size={15} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                            {ev.label} <span className={clsx('font-semibold', enter ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{enter ? 'entró a' : 'salió de'}</span> {ev.geofence}
                                        </p>
                                        <p className="text-[11px] text-slate-400 truncate">{timeAgo(ev.timestamp)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Personal por zona */}
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Users size={18} className="text-slate-500" />
                        <h2 className="font-bold text-slate-900 dark:text-white">Personal por zona</h2>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 w-full sm:w-64">
                        <Search size={14} className="text-slate-400 shrink-0" />
                        <input
                            value={zonaQuery}
                            onChange={(e) => setZonaQuery(e.target.value)}
                            placeholder="Buscar persona o zona"
                            className="w-full bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {zonasFiltradas.length === 0 ? (
                        <p className="text-sm text-slate-400 py-6">Sin resultados.</p>
                    ) : zonasFiltradas.map((z) => (
                        <div key={z.zona} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                                <div className="flex items-center gap-2 min-w-0">
                                    <MapPin size={15} className="text-slate-400 shrink-0" />
                                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate capitalize">{z.zona}</span>
                                </div>
                                <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{z.disponibles}</span>/{z.total} disp.
                                </span>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-800/60 max-h-[420px] overflow-y-auto">
                                {z.trabajadores.map((t) => (
                                    <PersonRow key={t.id} t={t} busy={busyToggle.has(t.id)} onToggle={(next) => toggleDisponible('trabajador', t.id, next)} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Flota */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Truck size={18} className="text-slate-500" />
                    <h2 className="font-bold text-slate-900 dark:text-white">Flota</h2>
                    <span className="text-xs text-slate-400">({data?.flota.length ?? 0})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {(data?.flota ?? []).map((v) => (
                        <VehicleRow key={v.id} v={v} busy={busyToggle.has(v.id)} onToggle={(next) => toggleDisponible('vehiculo', v.id, next)} />
                    ))}
                </div>
            </section>
        </div>
    );
}

/* ---------- Subcomponentes ---------- */

const KPI_TONES: Record<string, { chip: string; bar: string }> = {
    emerald: { chip: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400', bar: 'bg-emerald-500' },
    blue: { chip: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400', bar: 'bg-blue-500' },
    amber: { chip: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400', bar: 'bg-amber-500' },
    indigo: { chip: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400', bar: 'bg-indigo-500' },
    slate: { chip: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-300', bar: 'bg-slate-400' },
};

function KpiCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) {
    const t = KPI_TONES[tone];
    return (
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 flex items-center gap-3 overflow-hidden">
            <span className={clsx('absolute left-0 top-0 bottom-0 w-1', t.bar)} />
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', t.chip)}>
                <Icon size={18} />
            </div>
            <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-none">{value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{label}</p>
            </div>
        </div>
    );
}

const TAB_ACCENT: Record<string, string> = {
    indigo: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300',
    amber: 'text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300',
};

function TabButton({ active, onClick, icon: Icon, label, count, accent }: {
    active: boolean; onClick: () => void; icon: any; label: string; count: number; accent: 'indigo' | 'amber';
}) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition',
                active ? TAB_ACCENT[accent] : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            )}
        >
            <Icon size={15} />
            <span className="truncate">{label}</span>
            <span className={clsx('px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums', active ? 'bg-white/70 dark:bg-black/20' : 'bg-slate-100 dark:bg-slate-800')}>{count}</span>
        </button>
    );
}

// Pill de disponibilidad clickable (verde disponible / rojo no disponible).
function AvailabilityPill({ disponible, enOperacion, busy, onToggle }: {
    disponible: boolean; enOperacion: boolean; busy: boolean; onToggle: (next: boolean) => void;
}) {
    return (
        <button
            onClick={() => onToggle(!disponible)}
            disabled={busy}
            title={enOperacion ? 'En operación activa' : disponible ? 'Marcar como no disponible' : 'Marcar como disponible'}
            className={clsx(
                'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition disabled:opacity-60',
                disponible
                    ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20'
                    : 'text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20'
            )}
        >
            {busy ? <Loader2 size={12} className="animate-spin" /> : disponible ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {disponible ? 'Disponibile' : 'Non disponibile'}
        </button>
    );
}

function PersonRow({ t, busy, onToggle }: { t: Trabajador; busy: boolean; onToggle: (next: boolean) => void }) {
    return (
        <div className="px-4 py-2.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                <img
                    src={t.url_foto || '/default-avatar.svg'}
                    alt={t.nombre_completo}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-avatar.svg'; }}
                />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{t.nombre_completo}</p>
                <p className="text-[11px] text-slate-400 truncate">
                    {t.cargo || 'Conductor'}
                    {t.enOperacion && <span className="ml-1.5 text-indigo-500 font-semibold">· en ruta</span>}
                </p>
            </div>
            <AvailabilityPill disponible={t.disponible} enOperacion={t.enOperacion} busy={busy} onToggle={onToggle} />
        </div>
    );
}

function VehicleRow({ v, busy, onToggle }: { v: Vehiculo; busy: boolean; onToggle: (next: boolean) => void }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-3.5 py-2.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
                {v.url_foto ? (
                    <img
                        src={v.url_foto}
                        alt={v.placa}
                        className="w-full h-full object-cover"
                        onError={(e) => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; }}
                    />
                ) : <Truck size={18} />}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{v.placa}</p>
                <p className="text-[11px] text-slate-400 truncate">
                    {v.marca_modelo || v.tipo_unidad || 'Vehículo'}
                    {v.enOperacion && <span className="ml-1.5 text-indigo-500 font-semibold">· en ruta</span>}
                </p>
            </div>
            <AvailabilityPill disponible={v.disponible} enOperacion={v.enOperacion} busy={busy} onToggle={onToggle} />
        </div>
    );
}
