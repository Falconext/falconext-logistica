'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Truck, Package, RefreshCw, Loader2, MapPin, Clock, AlertTriangle,
    Navigation, PauseCircle, CheckCircle2, XCircle, Flag, ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import api from '../../lib/api';
import { useLivePolling } from '../../lib/useLivePolling';
import { PanelLiveMap } from '../../components/tracking/PanelLiveMap';
import { useT, useDateLocale } from '../../lib/i18n';

/** Firma de la función de traducción, para pasarla a helpers fuera del componente. */
type TFunc = (key: string, vars?: Record<string, string | number>) => string;

/* ---------- Tipos del endpoint /panel/status ---------- */
interface Entrega {
    id: string; id_programacion?: string | null; targa?: string | null; autista?: string | null;
    cliente?: string | null; lugar_retiro?: string | null; lugar_entrega?: string | null;
    fecha_entrega?: string | null; estado?: string | null; restanteMin: number | null;
}
interface PanelStatus {
    entregas: { enConsegna: Entrega[]; enSospeso: Entrega[] };
    resumen: { entregasActivas: number };
}
/* ---------- Tipos del endpoint /panel/resumen-dia ---------- */
interface ResumenDiaItem {
    id: string; trabajador: string | null; datosConsegna: string | null;
    spedizione: string | null; cliente: string | null;
}
interface ResumenDiaGrupo { estado: string; total: number; items: ResumenDiaItem[]; }

/* ---------- Helpers ---------- */
// Placa "PLACA - MODELO" → solo la placa (datos legacy).
const soloPlaca = (raw?: string | null) => (raw || '').trim().split(/\s+/)[0] || '—';

// Minutos restantes → texto humano. Negativo = atrasado.
function fmtRestante(min: number | null, t: TFunc): { text: string; tone: 'late' | 'soon' | 'ok' | 'none' } {
    if (min == null) return { text: t('panel.tiempo.sinFecha'), tone: 'none' };
    const late = min < 0;
    const abs = Math.abs(min);
    const d = Math.floor(abs / 1440);
    const h = Math.floor((abs % 1440) / 60);
    const m = abs % 60;
    const parts = d > 0 ? t('panel.tiempo.diasHoras', { d, h }) : h > 0 ? t('panel.tiempo.horasMin', { h, m }) : t('panel.tiempo.min', { m });
    if (late) return { text: t('panel.tiempo.atrasado', { parts }), tone: 'late' };
    if (min <= 120) return { text: t('panel.tiempo.en', { parts }), tone: 'soon' };
    return { text: t('panel.tiempo.en', { parts }), tone: 'ok' };
}

// Recalcula minutos restantes en el cliente para que la cuenta regresiva avance sin refetch.
function restanteFrom(e: Entrega, nowMs: number): number | null {
    if (e.fecha_entrega) return Math.round((new Date(e.fecha_entrega).getTime() - nowMs) / 60000);
    return e.restanteMin;
}

// Metadata visual por estado de consegna (icono + color), para el resumen del día.
const ESTADO_META: Record<string, { icon: any; tone: string }> = {
    CONSEGNATO: { icon: CheckCircle2, tone: 'emerald' },
    IN_CONSEGNA: { icon: Truck, tone: 'indigo' },
    ACCETTATA: { icon: CheckCircle2, tone: 'teal' },
    IN_SOSPESO: { icon: PauseCircle, tone: 'amber' },
    RITIRATO: { icon: Flag, tone: 'pink' },
    RISCHEDULATO: { icon: RefreshCw, tone: 'blue' },
    ANNULLATO: { icon: XCircle, tone: 'red' },
    SIN_ESTADO: { icon: Package, tone: 'slate' },
};
const ESTADO_TONES: Record<string, { chip: string; dot: string }> = {
    emerald: { chip: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400', dot: 'bg-emerald-500' },
    indigo: { chip: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400', dot: 'bg-indigo-500' },
    teal: { chip: 'text-teal-600 bg-teal-50 dark:bg-teal-500/10 dark:text-teal-400', dot: 'bg-teal-500' },
    amber: { chip: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400', dot: 'bg-amber-500' },
    pink: { chip: 'text-pink-600 bg-pink-50 dark:bg-pink-500/10 dark:text-pink-400', dot: 'bg-pink-500' },
    blue: { chip: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400', dot: 'bg-blue-500' },
    red: { chip: 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400', dot: 'bg-red-500' },
    slate: { chip: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-300', dot: 'bg-slate-400' },
};

// Refresco de datos (consulta a la API). El guard de visibilidad de abajo evita
// consultar cuando la pestaña está oculta (pestaña olvidada abierta → 0 consultas,
// Neon se duerme). Intervalo más holgado para no despertar la BD sin necesidad.
const REFRESH_MS = 60000;
// Tick cosmético del reloj/cuenta regresiva. No toca la API.
const CLOCK_TICK_MS = 30000;

export default function PanelPage() {
    const t = useT();
    const dateLocale = useDateLocale();
    const [data, setData] = useState<PanelStatus | null>(null);
    const [resumenDia, setResumenDia] = useState<ResumenDiaGrupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [now, setNow] = useState<number>(() => Date.now());
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [tab, setTab] = useState<'consegna' | 'sospeso'>('consegna');

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        // allSettled: si el resumen del día falla, el resto del panel sigue funcionando.
        const [statusR, resumenR] = await Promise.allSettled([
            api.get<PanelStatus>('/panel/status'),
            api.get<{ grupos: ResumenDiaGrupo[] }>('/panel/resumen-dia'),
        ]);
        if (statusR.status === 'fulfilled') {
            setData(statusR.value.data);
            setLastUpdated(new Date());
            setNow(Date.now());
        } else if (!silent) {
            console.error(statusR.reason);
            toast.error(t('panel.toasts.errorCargar'));
        }
        if (resumenR.status === 'fulfilled') setResumenDia(resumenR.value.data.grupos ?? []);
        setLoading(false);
        setRefreshing(false);
    }, [t]);

    useEffect(() => { load(); }, [load]);

    // Auto-refresco consciente del costo: solo consulta con la pestaña visible y el
    // usuario activo. Se pausa si la pestaña se oculta o pasan 15 min sin interacción,
    // y reanuda al instante al volver/mover el mouse. No cierra sesión.
    useLivePolling(() => load(true), { intervalMs: REFRESH_MS });
    // Tick de reloj (cosmético, no consulta a la API).
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(id);
    }, []);

    const r = data?.resumen;
    const enConsegna = data?.entregas.enConsegna ?? [];
    const enSospeso = data?.entregas.enSospeso ?? [];
    // Placas en ruta → para realzar esos vehículos en el mini-mapa.
    const enConsegnaPlacas = enConsegna.map((e) => e.targa || '').filter(Boolean);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={20} /> {t('panel.header.cargando')}
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
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{t('panel.header.titulo')}</h1>
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                </span>
                                <span className="text-[10px] font-bold tracking-wide text-emerald-600 dark:text-emerald-400">{t('panel.header.enVivo')}</span>
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('panel.header.subtitulo')}
                            {lastUpdated && <span className="ml-1.5">{t('panel.header.actualizado', { hora: lastUpdated.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) })}</span>}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60"
                >
                    <RefreshCw size={15} className={clsx(refreshing && 'animate-spin')} /> {t('panel.header.actualizar')}
                </button>
            </div>

            {/* KPIs — solo estado de las consegnas (personal/flota se gestionan en Trabajadores/Vehículos) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard icon={Package} label={t('panel.kpi.entregasActivas')} value={r?.entregasActivas ?? 0} tone="amber" />
                <KpiCard icon={Navigation} label={t('panel.kpi.enConsegna')} value={enConsegna.length} tone="indigo" />
                <KpiCard icon={PauseCircle} label={t('panel.kpi.inSospeso')} value={enSospeso.length} tone="slate" />
            </div>

            {/* Héroe: mapa en vivo (Rastreo) + entregas activas */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                {/* Mapa en vivo */}
                <div className="xl:col-span-3 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <MapPin size={17} className="text-indigo-500" />
                            <h2 className="font-bold text-slate-900 dark:text-white leading-tight">{t('panel.mapa.titulo')}</h2>
                        </div>
                        <Link href="/rastreo" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{t('panel.mapa.verRastreo')}</Link>
                    </div>
                    <div className="h-[360px] sm:h-[420px]">
                        <PanelLiveMap enConsegnaPlacas={enConsegnaPlacas} />
                    </div>
                </div>

                {/* Entregas activas con pestañas */}
                <div className="xl:col-span-2 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-1 p-1.5 border-b border-slate-100 dark:border-slate-800">
                        <TabButton active={tab === 'consegna'} onClick={() => setTab('consegna')} icon={Navigation} label={t('panel.tabs.inConsegna')} count={enConsegna.length} accent="indigo" />
                        <TabButton active={tab === 'sospeso'} onClick={() => setTab('sospeso')} icon={PauseCircle} label={t('panel.tabs.inSospeso')} count={enSospeso.length} accent="amber" />
                    </div>
                    <div className="flex-1 divide-y divide-slate-50 dark:divide-slate-800/60 overflow-y-auto max-h-[420px]">
                        {entregasTab.length === 0 ? (
                            <div className="py-16 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                                <Package size={22} className="opacity-50" />
                                <p className="text-sm">{tab === 'consegna' ? t('panel.entregas.sinEntregasRuta') : t('panel.entregas.sinEntregasPendientes')}</p>
                            </div>
                        ) : entregasTab.map((e) => {
                            const rest = fmtRestante(restanteFrom(e, now), t);
                            return (
                                <Link key={e.id} href={`/operaciones?op=${e.id}`} title={t('panel.entregas.verEnOperaciones')} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                                        <Package size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{soloPlaca(e.targa)}</span>
                                            <span className="text-xs text-slate-400 truncate">{e.autista || t('panel.entregas.sinConductor')}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {e.cliente ? `${e.cliente} · ` : ''}{e.lugar_entrega || t('panel.entregas.sinDestino')}
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

            {/* Resumen del día: operaciones de hoy agrupadas por estado de consegna */}
            <section className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <ClipboardList size={16} className="text-slate-500" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('panel.resumenDia.titulo')}</h2>
                </div>
                {resumenDia.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                        <ClipboardList size={22} className="opacity-50" />
                        <p className="text-sm">{t('panel.resumenDia.sinOperaciones')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {resumenDia.map((grupo) => {
                            const meta = ESTADO_META[grupo.estado] || ESTADO_META.SIN_ESTADO;
                            const tone = ESTADO_TONES[meta.tone];
                            const Icon = meta.icon;
                            return (
                                <div key={grupo.estado} className="px-4 py-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={clsx('flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold', tone.chip)}>
                                            <Icon size={12} /> {t(`panel.resumenDia.estados.${grupo.estado}`)}
                                        </span>
                                        <span className="text-xs text-slate-400 font-semibold">{grupo.total}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        {/* table-fixed + colgroup compartido → todos los grupos usan los mismos anchos y las columnas quedan alineadas entre estados */}
                                        <table className="w-full text-sm table-fixed">
                                            <colgroup>
                                                <col style={{ width: '20%' }} />
                                                <col style={{ width: '34%' }} />
                                                <col style={{ width: '18%' }} />
                                                <col style={{ width: '28%' }} />
                                            </colgroup>
                                            <thead>
                                                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                                                    <th className="font-semibold py-0.5 pr-4">{t('panel.resumenDia.columnas.autista')}</th>
                                                    <th className="font-semibold py-0.5 pr-4">{t('panel.resumenDia.columnas.datosConsegna')}</th>
                                                    <th className="font-semibold py-0.5 pr-4">{t('panel.resumenDia.columnas.spedizione')}</th>
                                                    <th className="font-semibold py-0.5">{t('panel.resumenDia.columnas.cliente')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                                {grupo.items.map((it) => (
                                                    <tr key={it.id}>
                                                        <td className="py-1 pr-4 font-medium text-slate-800 dark:text-slate-100 truncate">{it.trabajador || '—'}</td>
                                                        <td className="py-1 pr-4 text-slate-500 dark:text-slate-400 truncate">{it.datosConsegna || '—'}</td>
                                                        <td className="py-1 pr-4 text-slate-500 dark:text-slate-400 truncate">{it.spedizione || '—'}</td>
                                                        <td className="py-1 text-slate-500 dark:text-slate-400 truncate">{it.cliente || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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
        <div className="group rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-300 p-4 flex items-center gap-3.5">
            <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', t.chip)}>
                <Icon size={20} />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{value}</p>
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
