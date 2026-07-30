'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import {
    Users, Truck, Package, RefreshCw, Loader2, MapPin, Clock, AlertTriangle,
    CheckCircle2, XCircle, Navigation, Boxes, PauseCircle
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';

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

// Recalcula minutos restantes en el cliente desde fecha_entrega (para que la cuenta
// regresiva avance sin refetch). Cae al valor del server si no hay fecha.
function restanteFrom(e: Entrega, nowMs: number): number | null {
    if (e.fecha_entrega) return Math.round((new Date(e.fecha_entrega).getTime() - nowMs) / 60000);
    return e.restanteMin;
}

const REFRESH_MS = 30000;

export default function PanelPage() {
    const [data, setData] = useState<PanelStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [now, setNow] = useState<number>(() => Date.now());
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [busyToggle, setBusyToggle] = useState<Set<string>>(new Set());

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const res = await api.get<PanelStatus>('/panel/status');
            setData(res.data);
            setLastUpdated(new Date());
            setNow(Date.now());
        } catch (err) {
            console.error(err);
            if (!silent) toast.error('Error cargando el panel');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh cada 30s (silencioso).
    useEffect(() => {
        const id = setInterval(() => load(true), REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    // Tick del reloj cada 30s para que la cuenta regresiva avance sola.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    // Toggle de disponibilidad (personal o vehículo). Optimista.
    const toggleDisponible = useCallback(async (kind: 'trabajador' | 'vehiculo', id: string, next: boolean) => {
        setBusyToggle((s) => new Set(s).add(id));
        // Optimista
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
            load(true); // revertir con datos reales
        } finally {
            setBusyToggle((s) => { const n = new Set(s); n.delete(id); return n; });
        }
    }, [load]);

    const r = data?.resumen;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={20} /> Cargando panel...
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FFC933] text-[#1a1a1c] flex items-center justify-center shrink-0">
                        <Boxes size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">Panel de Control</h1>
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
                <KpiCard icon={Navigation} label="En consegna" value={data?.entregas.enConsegna.length ?? 0} tone="indigo" />
                <KpiCard icon={PauseCircle} label="In sospeso" value={data?.entregas.enSospeso.length ?? 0} tone="slate" />
            </div>

            {/* Entregas activas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <EntregasColumn
                    title="In Consegna" subtitle="En ruta / entregando" icon={Navigation}
                    accent="indigo" entregas={data?.entregas.enConsegna ?? []} now={now}
                />
                <EntregasColumn
                    title="In Sospeso" subtitle="Pendiente / reprogramado" icon={PauseCircle}
                    accent="amber" entregas={data?.entregas.enSospeso ?? []} now={now}
                />
            </div>

            {/* Personal por zona */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Users size={18} className="text-slate-500" />
                    <h2 className="font-bold text-slate-900 dark:text-white">Personal por zona</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(data?.personal ?? []).map((z) => (
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

const KPI_TONES: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400',
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400',
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400',
    slate: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-300',
};

function KpiCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) {
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

const ACCENTS: Record<string, { bar: string; chip: string; icon: string }> = {
    indigo: { bar: 'bg-indigo-500', chip: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-300', icon: 'text-indigo-500' },
    amber: { bar: 'bg-amber-500', chip: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300', icon: 'text-amber-500' },
};

function EntregasColumn({ title, subtitle, icon: Icon, accent, entregas, now }: {
    title: string; subtitle: string; icon: any; accent: 'indigo' | 'amber'; entregas: Entrega[]; now: number;
}) {
    const a = ACCENTS[accent];
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                    <span className={clsx('w-1.5 h-8 rounded-full', a.bar)} />
                    <Icon size={17} className={a.icon} />
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
                        <p className="text-[11px] text-slate-400">{subtitle}</p>
                    </div>
                </div>
                <span className={clsx('px-2.5 py-1 rounded-lg text-xs font-bold', a.chip)}>{entregas.length}</span>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-800/60 max-h-[380px] overflow-y-auto">
                {entregas.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">Sin entregas.</div>
                ) : entregas.map((e) => {
                    const rest = fmtRestante(restanteFrom(e, now));
                    return (
                        <div key={e.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
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
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Pill de disponibilidad clickable (verde disponible / rojo no disponible / azul en ruta).
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
