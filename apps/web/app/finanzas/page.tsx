'use client';

// Panel financiero (Fase C): rentabilidad por operación — ingreso (lo que paga
// el cliente) vs. costo del chofer (horas + reperibilità + attesa + gastos de
// ruta). Inspirado en el "Panel de Ventas" de Krezka, adaptado a logística.
// Solo roles con ve_finanzas; el backend bloquea GET /programacion/financiero.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { TrendingUp, TrendingDown, Wallet, Percent, Download, RefreshCw, Search, Lock } from 'lucide-react';
import api from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useCurrency } from '../../lib/useCurrency';
import { useAuthStore } from '../../lib/store';
import { SPEDIZIONE_OPTIONS } from '../operaciones/constants';

interface FilaFinanciero {
    id: string;
    fecha: string;
    cliente?: string | null;
    spedizione?: string | null;
    lugar_entrega?: string | null;
    vehiculo_placa?: string | null;
    vehiculo_categoria?: string | null;
    trabajador_nombre?: string | null;
    km_facturable?: number | null;
    ingreso: number | null;
    costo_chofer: number;
    rentabilidad: number | null;
    rentabilidad_pct: number | null;
}

interface Resumen {
    operaciones: number;
    operaciones_con_ingreso: number;
    ingreso: number;
    costo: number;
    rentabilidad: number;
    rentabilidad_pct: number | null;
}

interface Financiero {
    desde: string;
    hasta: string;
    moneda: string;
    resumen: Resumen;
    items: FilaFinanciero[];
}

interface TrabajadorOpt { id: string; nombre_completo: string; }

const CATEGORIA_LABEL: Record<string, string> = {
    AUTO_FURGONETA: 'Auto/Furgoneta',
    H1_L1: 'H1 L1',
    H2_L2: 'H2 L2',
    CASSONATO: 'Cassonato',
};

const monthRangeISO = () => {
    const now = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
};

export default function FinanzasPage() {
    const t = useT();
    const { format } = useCurrency();
    const { user } = useAuthStore();
    const veFinanzas = !!(user as any)?.ve_finanzas;

    const [fFrom, setFFrom] = useState(() => monthRangeISO().from);
    const [fTo, setFTo] = useState(() => monthRangeISO().to);
    const [fCliente, setFCliente] = useState('');
    const [fSpedizione, setFSpedizione] = useState('');
    const [fTrabajador, setFTrabajador] = useState('');

    const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
    const [data, setData] = useState<Financiero | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!veFinanzas) { setLoading(false); return; }
        setLoading(true);
        try {
            const { data } = await api.get('/programacion/financiero', {
                params: {
                    from: fFrom || undefined,
                    to: fTo || undefined,
                    cliente: fCliente || undefined,
                    spedizione: fSpedizione || undefined,
                    trabajadorId: fTrabajador || undefined,
                },
            });
            setData(data ?? null);
        } catch (e) {
            console.error('[finanzas]', e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [veFinanzas, fFrom, fTo, fCliente, fSpedizione, fTrabajador]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!veFinanzas) return;
        api.get('/trabajadores').then(({ data }) => setTrabajadores(Array.isArray(data) ? data : [])).catch(() => setTrabajadores([]));
    }, [veFinanzas]);

    const grupos = useMemo(() => {
        const map = new Map<string, FilaFinanciero[]>();
        for (const it of data?.items ?? []) {
            const key = it.fecha ? it.fecha.slice(0, 10) : '—';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(it);
        }
        return [...map.entries()];
    }, [data]);

    const fmtFecha = (v: string) => {
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    };

    const pctFmt = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);

    const exportar = () => {
        if (!data?.items?.length) return;
        const rows = data.items.map((it) => ({
            Fecha: fmtFecha(it.fecha),
            Cliente: it.cliente || '',
            Spedizione: it.spedizione || '',
            Destino: it.lugar_entrega || '',
            Vehiculo: it.vehiculo_placa || '',
            Categoria: it.vehiculo_categoria ? (CATEGORIA_LABEL[it.vehiculo_categoria] || it.vehiculo_categoria) : '',
            'Km ida': it.km_facturable ?? '',
            Ingreso: it.ingreso ?? '',
            Gastado: it.costo_chofer,
            Rentabilidad: it.rentabilidad ?? '',
            'Rentabilidad %': it.rentabilidad_pct ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Finanzas');
        XLSX.writeFile(wb, `finanzas_${fFrom}_${fTo}.xlsx`);
    };

    const thCls = 'px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap';
    const tdCls = 'px-4 py-2.5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300';

    if (!veFinanzas) {
        return (
            <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <Lock size={22} />
                </div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-white">{t('finanzas.noAutorizado')}</h1>
                <p className="text-sm text-slate-500">{t('finanzas.noAutorizadoTexto')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <TrendingUp className="text-emerald-500" size={28} />
                        {t('finanzas.titulo')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('finanzas.subtitulo')}</p>
                </div>
                <div className="flex items-center gap-2 self-start">
                    <button onClick={load} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                        <RefreshCw size={16} /> {t('finanzas.actualizar')}
                    </button>
                    <button onClick={exportar} disabled={!data?.items?.length} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] text-white text-sm font-semibold disabled:opacity-40 transition">
                        <Download size={16} /> {t('finanzas.exportar')}
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><Wallet size={14} /> {t('finanzas.kpi.ingreso')}</div>
                    <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">{format(data?.resumen.ingreso ?? 0)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><TrendingDown size={14} /> {t('finanzas.kpi.costo')}</div>
                    <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">{format(data?.resumen.costo ?? 0)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><TrendingUp size={14} /> {t('finanzas.kpi.rentabilidad')}</div>
                    <div className={`text-xl font-extrabold mt-1 ${(data?.resumen.rentabilidad ?? 0) < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{format(data?.resumen.rentabilidad ?? 0)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><Percent size={14} /> {t('finanzas.kpi.rentabilidadPct')}</div>
                    <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">{pctFmt(data?.resumen.rentabilidad_pct ?? null)}</div>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">{t('finanzas.filtros.desde')}</span>
                    <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none" />
                </div>
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">{t('finanzas.filtros.hasta')}</span>
                    <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none" />
                </div>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={fCliente} onChange={(e) => setFCliente(e.target.value)} placeholder={t('finanzas.filtros.cliente')}
                        className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 w-full md:w-56" />
                </div>
                <select value={fSpedizione} onChange={(e) => setFSpedizione(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200">
                    <option value="">{t('finanzas.filtros.todas')}</option>
                    {SPEDIZIONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={fTrabajador} onChange={(e) => setFTrabajador(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200">
                    <option value="">{t('finanzas.filtros.todos')}</option>
                    {trabajadores.map((w) => <option key={w.id} value={w.id}>{w.nombre_completo}</option>)}
                </select>
            </div>

            {/* Tabla */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="h-9 w-9 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin" /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className={thCls}>{t('finanzas.col.fecha')}</th>
                                    <th className={thCls}>{t('finanzas.col.cliente')}</th>
                                    <th className={thCls}>{t('finanzas.col.spedizione')}</th>
                                    <th className={thCls}>{t('finanzas.col.destino')}</th>
                                    <th className={thCls}>{t('finanzas.col.vehiculo')}</th>
                                    <th className={`${thCls} text-right`}>{t('finanzas.col.km')}</th>
                                    <th className={`${thCls} text-right`}>{t('finanzas.col.ingreso')}</th>
                                    <th className={`${thCls} text-right`}>{t('finanzas.col.gastado')}</th>
                                    <th className={`${thCls} text-right`}>{t('finanzas.col.rentabilidad')}</th>
                                    <th className={`${thCls} text-right`}>{t('finanzas.col.rentabilidadPct')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grupos.length === 0 && (
                                    <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">{t('finanzas.vacio')}</td></tr>
                                )}
                                {grupos.map(([fecha, filas]) => {
                                    const subIngreso = filas.reduce((s, f) => s + (f.ingreso ?? 0), 0);
                                    const subCosto = filas.reduce((s, f) => s + f.costo_chofer, 0);
                                    const subRent = filas.reduce((s, f) => s + (f.rentabilidad ?? 0), 0);
                                    return (
                                        <Fragment key={fecha}>
                                            {filas.map((it) => (
                                                <tr key={it.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                    <td className={tdCls}>{fmtFecha(it.fecha)}</td>
                                                    <td className={`${tdCls} font-medium text-slate-800 dark:text-slate-100`}>{it.cliente || '—'}</td>
                                                    <td className={tdCls}>{it.spedizione || '—'}</td>
                                                    <td className={tdCls}>{it.lugar_entrega || '—'}</td>
                                                    <td className={tdCls}>
                                                        {it.vehiculo_placa || '—'}
                                                        {it.vehiculo_categoria && <span className="ml-1 text-xs text-slate-400">({CATEGORIA_LABEL[it.vehiculo_categoria] || it.vehiculo_categoria})</span>}
                                                    </td>
                                                    <td className={`${tdCls} text-right`}>{it.km_facturable ?? '—'}</td>
                                                    <td className={`${tdCls} text-right`}>{it.ingreso != null ? format(it.ingreso) : <span className="text-slate-300 dark:text-slate-600">{t('finanzas.sinIngreso')}</span>}</td>
                                                    <td className={`${tdCls} text-right`}>{format(it.costo_chofer)}</td>
                                                    <td className={`${tdCls} text-right font-semibold ${it.rentabilidad == null ? '' : it.rentabilidad < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                        {it.rentabilidad != null ? format(it.rentabilidad) : '—'}
                                                    </td>
                                                    <td className={`${tdCls} text-right`}>{pctFmt(it.rentabilidad_pct)}</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                                                <td className={tdCls} colSpan={6}>{fmtFecha(fecha)} · {t('finanzas.totales')}</td>
                                                <td className={`${tdCls} text-right`}>{format(subIngreso)}</td>
                                                <td className={`${tdCls} text-right`}>{format(subCosto)}</td>
                                                <td className={`${tdCls} text-right ${subRent < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{format(subRent)}</td>
                                                <td className={tdCls}></td>
                                            </tr>
                                        </Fragment>
                                    );
                                })}
                                {grupos.length > 0 && data && (
                                    <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`} colSpan={6}>{t('finanzas.totales')}</td>
                                        <td className={`${tdCls} text-right`}>{format(data.resumen.ingreso)}</td>
                                        <td className={`${tdCls} text-right`}>{format(data.resumen.costo)}</td>
                                        <td className={`${tdCls} text-right ${data.resumen.rentabilidad < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{format(data.resumen.rentabilidad)}</td>
                                        <td className={`${tdCls} text-right`}>{pctFmt(data.resumen.rentabilidad_pct)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
