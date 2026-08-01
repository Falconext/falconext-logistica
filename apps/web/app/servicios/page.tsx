'use client';

// Servicios DHL / Farmacia: partes diarios (km + ore guida) que reportan los
// choferes. Reemplaza las vistas "DHL", "FARMACIA" y "RESUMEN MES DHL" del
// sistema anterior. Dos vistas: lista de partes y resumen mensual por chofer.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Search, Settings2, X, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../lib/api';
import { useT, useI18n } from '../../lib/i18n';
import { useCurrency } from '../../lib/useCurrency';
import { useAuthStore } from '../../lib/store';

const MESES: Record<string, string[]> = {
    es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    it: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
};

const OPERACIONES = ['DHL', 'FARMACIA'] as const;
type Operacion = (typeof OPERACIONES)[number];

interface Parte {
    id: string;
    fecha: string;
    targa?: string | null;
    km?: number;
    ore_mattina?: number;
    ore_sera?: number;
    ganancia?: number;
    cliente?: string | null;
    trabajador_nombre?: string | null;
    trabajador_foto?: string | null;
}

interface FilaResumen {
    trabajador_id: string;
    nombre: string;
    foto?: string | null;
    partes: number;
    km: number;
    oreMattina: number;
    oreSera: number;
    oreTotal: number;
    ganancia: number;
}

const hLabel = (h?: number) => {
    const v = h || 0;
    const horas = Math.floor(v);
    const min = Math.round((v - horas) * 60);
    return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
};

export default function ServiciosPage() {
    const t = useT();
    const { locale } = useI18n();
    const { format } = useCurrency();
    const { user } = useAuthStore();
    const isAdmin = !!user?.es_admin;

    const now = new Date();
    const [operacion, setOperacion] = useState<Operacion>('DHL');
    const [vista, setVista] = useState<'partes' | 'resumen'>('partes');
    const [anio, setAnio] = useState(now.getFullYear());
    const [mes, setMes] = useState(now.getMonth() + 1); // 1-12
    const [q, setQ] = useState('');

    const [partes, setPartes] = useState<Parte[]>([]);
    const [resumen, setResumen] = useState<{ filas: FilaResumen[]; totales: any } | null>(null);
    const [loading, setLoading] = useState(true);

    // Config de tarifas (para el modal admin)
    const [showTarifas, setShowTarifas] = useState(false);
    const [tarifas, setTarifas] = useState({ tarifa_ore_giorno: '', tarifa_ore_notte: '', hora_corte_notte: '' });
    const [savingTarifas, setSavingTarifas] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            if (vista === 'partes') {
                const { data } = await api.get('/registros', { params: { operacion, anio, mes, q: q || undefined, take: 500 } });
                setPartes(data?.items ?? []);
            } else {
                const { data } = await api.get('/registros/resumen-mes', { params: { operacion, anio, mes } });
                setResumen({ filas: data?.filas ?? [], totales: data?.totales ?? {} });
            }
        } catch {
            // silencioso
        } finally {
            setLoading(false);
        }
    }, [vista, operacion, anio, mes, q]);

    useEffect(() => { load(); }, [load]);

    const abrirTarifas = async () => {
        try {
            const { data } = await api.get('/registros/config');
            setTarifas({
                tarifa_ore_giorno: String(data.tarifa_ore_giorno ?? ''),
                tarifa_ore_notte: String(data.tarifa_ore_notte ?? ''),
                hora_corte_notte: String(data.hora_corte_notte ?? ''),
            });
            setShowTarifas(true);
        } catch { /* noop */ }
    };

    const guardarTarifas = async () => {
        setSavingTarifas(true);
        try {
            await api.patch('/registros/config', tarifas);
            setShowTarifas(false);
            load();
        } catch { /* noop */ } finally {
            setSavingTarifas(false);
        }
    };

    const cambiarMes = (delta: number) => {
        let m = mes + delta;
        let a = anio;
        if (m < 1) { m = 12; a -= 1; }
        if (m > 12) { m = 1; a += 1; }
        setMes(m); setAnio(a);
    };

    const meses = MESES[locale] ?? MESES.es;

    const fmtFecha = (v: string) => {
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    };

    const Avatar = ({ foto, nombre }: { foto?: string | null; nombre?: string | null }) => (
        foto
            ? <img src={foto} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
            : <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-bold text-slate-500">{(nombre || '?')[0]}</span>
    );

    const thCls = 'px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap';
    const tdCls = 'px-4 py-2.5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300';

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <Package className="text-amber-500" size={28} />
                        {t('servicios.titulo')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('servicios.subtitulo')}</p>
                </div>
                {isAdmin && (
                    <button onClick={abrirTarifas} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition self-start">
                        <Settings2 size={16} /> {t('servicios.tarifas')}
                    </button>
                )}
            </div>

            {/* Controles */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
                {/* Operación */}
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                    {OPERACIONES.map((op) => (
                        <button key={op} onClick={() => setOperacion(op)}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${operacion === op ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                            {op}
                        </button>
                    ))}
                </div>

                {/* Vista */}
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                    <button onClick={() => setVista('partes')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${vista === 'partes' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>{t('servicios.tabPartes')}</button>
                    <button onClick={() => setVista('resumen')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${vista === 'resumen' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>{t('servicios.tabResumen')}</button>
                </div>

                {/* Mes */}
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-1">
                    <button onClick={() => cambiarMes(-1)} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white"><ChevronLeft size={16} /></button>
                    <span className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-[130px] text-center">{meses[mes - 1]} {anio}</span>
                    <button onClick={() => cambiarMes(1)} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white"><ChevronRight size={16} /></button>
                </div>

                {vista === 'partes' && (
                    <div className="relative md:ml-auto">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('servicios.buscar')}
                            className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 w-full md:w-64" />
                    </div>
                )}
            </div>

            {/* Contenido */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="h-9 w-9 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin" /></div>
                ) : vista === 'partes' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className={thCls}>{t('servicios.col.fecha')}</th>
                                    <th className={thCls}>{t('servicios.col.chofer')}</th>
                                    <th className={thCls}>{t('servicios.col.targa')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.km')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.oreDia')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.oreNoche')}</th>
                                    <th className={thCls}>{t('servicios.col.cliente')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.ganancia')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {partes.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">{t('servicios.vacio')}</td></tr>
                                )}
                                {partes.map((p) => (
                                    <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                        <td className={tdCls}>{fmtFecha(p.fecha)}</td>
                                        <td className={tdCls}>
                                            <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                                                <Avatar foto={p.trabajador_foto} nombre={p.trabajador_nombre} />
                                                {p.trabajador_nombre || '—'}
                                            </span>
                                        </td>
                                        <td className={`${tdCls} font-semibold`}>{p.targa || '—'}</td>
                                        <td className={`${tdCls} text-right`}>{p.km ?? 0}</td>
                                        <td className={`${tdCls} text-right`}><span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Sun size={13} />{hLabel(p.ore_mattina)}</span></td>
                                        <td className={`${tdCls} text-right`}><span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400"><Moon size={13} />{hLabel(p.ore_sera)}</span></td>
                                        <td className={tdCls}>{p.cliente || '—'}</td>
                                        <td className={`${tdCls} text-right font-bold text-emerald-600 dark:text-emerald-400`}>{format(p.ganancia ?? 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className={thCls}>{t('servicios.col.chofer')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.partes')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.km')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.oreDia')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.oreNoche')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.oreTotal')}</th>
                                    <th className={`${thCls} text-right`}>{t('servicios.col.ganancia')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(resumen?.filas.length ?? 0) === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">{t('servicios.vacio')}</td></tr>
                                )}
                                {resumen?.filas.map((f) => (
                                    <tr key={f.trabajador_id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                        <td className={tdCls}>
                                            <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                                                <Avatar foto={f.foto} nombre={f.nombre} />
                                                {f.nombre}
                                            </span>
                                        </td>
                                        <td className={`${tdCls} text-right`}>{f.partes}</td>
                                        <td className={`${tdCls} text-right`}>{f.km}</td>
                                        <td className={`${tdCls} text-right`}>{hLabel(f.oreMattina)}</td>
                                        <td className={`${tdCls} text-right`}>{hLabel(f.oreSera)}</td>
                                        <td className={`${tdCls} text-right font-semibold`}>{hLabel(f.oreTotal)}</td>
                                        <td className={`${tdCls} text-right font-bold text-emerald-600 dark:text-emerald-400`}>{format(f.ganancia)}</td>
                                    </tr>
                                ))}
                                {resumen && resumen.filas.length > 0 && (
                                    <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`}>{t('servicios.totales')}</td>
                                        <td className={`${tdCls} text-right`}>{resumen.totales.partes}</td>
                                        <td className={`${tdCls} text-right`}>{resumen.totales.km}</td>
                                        <td className={tdCls}></td>
                                        <td className={tdCls}></td>
                                        <td className={`${tdCls} text-right`}>{hLabel(resumen.totales.ore)}</td>
                                        <td className={`${tdCls} text-right text-emerald-600 dark:text-emerald-400`}>{format(resumen.totales.ganancia)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal tarifas */}
            {showTarifas && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowTarifas(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('servicios.editarTarifas')}</h3>
                            <button onClick={() => setShowTarifas(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                        </div>
                        <div className="space-y-3">
                            <label className="block">
                                <span className="text-xs font-bold text-slate-500 uppercase">{t('servicios.tarifaDia')}</span>
                                <input type="number" step="0.01" value={tarifas.tarifa_ore_giorno} onChange={(e) => setTarifas({ ...tarifas, tarifa_ore_giorno: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-slate-500 uppercase">{t('servicios.tarifaNoche')}</span>
                                <input type="number" step="0.01" value={tarifas.tarifa_ore_notte} onChange={(e) => setTarifas({ ...tarifas, tarifa_ore_notte: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-slate-500 uppercase">{t('servicios.horaCorte')}</span>
                                <input type="number" min="0" max="23" value={tarifas.hora_corte_notte} onChange={(e) => setTarifas({ ...tarifas, hora_corte_notte: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowTarifas(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">{t('servicios.cancelar')}</button>
                            <button onClick={guardarTarifas} disabled={savingTarifas} className="px-4 py-2 rounded-xl bg-[#1a1a1c] text-white text-sm font-semibold disabled:opacity-50">{t('servicios.guardar')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
