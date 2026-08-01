'use client';

// Vista "Documentos Scadenza": réplica moderna de la vista del sistema anterior.
// Dos paneles (furgones y trabajadores) con TODAS sus fechas de vencimiento en
// columnas con semáforo, agrupados por área (Milano Nord/Sud, Personal, Roma).
// Fuente: GET /alerts/scadenze. Pertenece al módulo Alertas.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Search, Truck, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { useT, useDateLocale } from '../../lib/i18n';
import { AREAS, SIN_AREA } from '../../lib/areas';

interface VehiculoScad {
    id: string;
    placa: string;
    marca_modelo?: string | null;
    tipo_unidad?: string | null;
    area?: string | null;
    url_foto?: string | null;
    fecha_vencimiento_seguro?: string | null;
    fecha_vencimiento_revision?: string | null;
    fecha_vencimiento_deroghe?: string | null;
}

interface TrabajadorScad {
    id: string;
    id_trabajador?: string | null;
    nombre_completo: string;
    cargo?: string | null;
    area_trabajo?: string | null;
    url_foto?: string | null;
    fecha_nacimiento?: string | null;
    fecha_vencimiento_unilav?: string | null;
    fecha_vencimiento_residencia?: string | null;
    fecha_vencimiento_licencia?: string | null;
    fecha_vencimiento_identidad?: string | null;
    fecha_vencimiento_traduccion?: string | null;
    fecha_vencimiento_fiscal?: string | null;
    fecha_vencimiento_pasaporte?: string | null;
}

// Semáforo: rojo vencido / ámbar ≤30 días / verde vigente.
function estadoFecha(v?: string | null): 'ok' | 'warn' | 'expired' | null {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const dias = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (dias < 0) return 'expired';
    if (dias <= 30) return 'warn';
    return 'ok';
}

function agrupar<T>(items: T[], getArea: (x: T) => string | null | undefined, sinArea: string): [string, T[]][] {
    const grupos = new Map<string, T[]>();
    for (const it of items) {
        const area = (getArea(it) || '').trim().toUpperCase() || sinArea;
        if (!grupos.has(area)) grupos.set(area, []);
        grupos.get(area)!.push(it);
    }
    // Orden: catálogo de áreas primero, luego el resto alfabético, SIN ÁREA al final.
    const orden = (a: string) => {
        const i = (AREAS as readonly string[]).indexOf(a);
        if (i >= 0) return i;
        return a === sinArea ? 999 : 100;
    };
    return [...grupos.entries()].sort((a, b) => orden(a[0]) - orden(b[0]) || a[0].localeCompare(b[0]));
}

export default function ScadenzePage() {
    const t = useT();
    const dateLocale = useDateLocale();
    const [vehiculos, setVehiculos] = useState<VehiculoScad[]>([]);
    const [trabajadores, setTrabajadores] = useState<TrabajadorScad[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        api.get('/alerts/scadenze')
            .then((res) => {
                setVehiculos(res.data?.vehiculos ?? []);
                setTrabajadores(res.data?.trabajadores ?? []);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const fmt = (v?: string | null) => {
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'numeric', year: 'numeric' });
    };

    // Celda de fecha con semáforo (equivalente a los ✓/👍/❗ de la vista vieja).
    const FechaCell = ({ v }: { v?: string | null }) => {
        const st = estadoFecha(v);
        if (!st) return <span className="text-slate-300 dark:text-slate-600">{t('scadenze.sinFecha')}</span>;
        const cls = st === 'expired'
            ? 'text-red-600 dark:text-red-400'
            : st === 'warn'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400';
        const Icon = st === 'ok' ? CheckCircle2 : AlertCircle;
        return (
            <span className={`inline-flex items-center gap-1.5 font-semibold ${cls}`}>
                <Icon size={14} />
                {fmt(v)}
            </span>
        );
    };

    const ql = q.trim().toLowerCase();
    const vehiculosFiltrados = useMemo(
        () => vehiculos.filter((v) => !ql || v.placa.toLowerCase().includes(ql) || (v.marca_modelo || '').toLowerCase().includes(ql)),
        [vehiculos, ql]
    );
    const trabajadoresFiltrados = useMemo(
        () => trabajadores.filter((w) => !ql || w.nombre_completo.toLowerCase().includes(ql)),
        [trabajadores, ql]
    );

    const gruposVeh = useMemo(() => agrupar(vehiculosFiltrados, (v) => v.area, t('scadenze.sinArea')), [vehiculosFiltrados, t]);
    const gruposTrab = useMemo(() => agrupar(trabajadoresFiltrados, (w) => w.area_trabajo, t('scadenze.sinArea')), [trabajadoresFiltrados, t]);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin"></div>
                    <span className="text-slate-500">{t('scadenze.cargando')}</span>
                </div>
            </div>
        );
    }

    const AreaHeader = ({ nombre, count, cols }: { nombre: string; count: number; cols: number }) => (
        <tr className="bg-slate-50 dark:bg-slate-800/60">
            <td colSpan={cols} className="px-4 py-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tracking-wide">{nombre}</span>
                <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">{count}</span>
            </td>
        </tr>
    );

    const thCls = 'px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap';
    const tdCls = 'px-4 py-2.5 whitespace-nowrap text-sm';

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <CalendarClock className="text-amber-500" size={28} />
                        {t('scadenze.titulo')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('scadenze.subtitulo')}</p>
                </div>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t('scadenze.buscar')}
                        className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 w-full md:w-72"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 items-start">
                {/* Furgones */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        <Truck size={18} className="text-slate-400" />
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">{t('scadenze.furgones')}</h2>
                        <span className="ml-auto text-xs text-slate-400">{vehiculosFiltrados.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className={thCls}>{t('scadenze.col.targa')}</th>
                                    <th className={thCls}>{t('scadenze.col.modelo')}</th>
                                    <th className={thCls}>{t('scadenze.col.poliza')}</th>
                                    <th className={thCls}>{t('scadenze.col.rtecnica')}</th>
                                    <th className={thCls}>{t('scadenze.col.deroghe')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gruposVeh.length === 0 && (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">{t('scadenze.vacio')}</td></tr>
                                )}
                                {gruposVeh.map(([area, items]) => (
                                    <>
                                        <AreaHeader key={`h-${area}`} nombre={area} count={items.length} cols={5} />
                                        {items.map((v) => (
                                            <tr key={v.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                <td className={tdCls}>
                                                    <Link href="/vehiculos" className="flex items-center gap-2.5 font-bold text-slate-800 dark:text-slate-100 hover:underline">
                                                        {v.url_foto
                                                            ? <img src={v.url_foto} alt="" className="w-9 h-7 rounded object-cover bg-slate-100" />
                                                            : <span className="w-9 h-7 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Truck size={13} className="text-slate-400" /></span>}
                                                        {v.placa}
                                                    </Link>
                                                </td>
                                                <td className={`${tdCls} text-slate-600 dark:text-slate-300`}>{v.marca_modelo || '—'}</td>
                                                <td className={tdCls}><FechaCell v={v.fecha_vencimiento_seguro} /></td>
                                                <td className={tdCls}><FechaCell v={v.fecha_vencimiento_revision} /></td>
                                                <td className={tdCls}><FechaCell v={v.fecha_vencimiento_deroghe} /></td>
                                            </tr>
                                        ))}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Trabajadores */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        <Users size={18} className="text-slate-400" />
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">{t('scadenze.trabajadores')}</h2>
                        <span className="ml-auto text-xs text-slate-400">{trabajadoresFiltrados.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className={thCls}>{t('scadenze.col.nombre')}</th>
                                    <th className={thCls}>{t('scadenze.col.nacimiento')}</th>
                                    <th className={thCls}>{t('scadenze.col.unilav')}</th>
                                    <th className={thCls}>{t('scadenze.col.soggiorno')}</th>
                                    <th className={thCls}>{t('scadenze.col.patente')}</th>
                                    <th className={thCls}>{t('scadenze.col.identita')}</th>
                                    <th className={thCls}>{t('scadenze.col.traduzione')}</th>
                                    <th className={thCls}>{t('scadenze.col.fiscale')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gruposTrab.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">{t('scadenze.vacio')}</td></tr>
                                )}
                                {gruposTrab.map(([area, items]) => (
                                    <>
                                        <AreaHeader key={`h-${area}`} nombre={area} count={items.length} cols={8} />
                                        {items.map((w) => (
                                            <tr key={w.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                <td className={tdCls}>
                                                    <Link href="/trabajadores" className="flex items-center gap-2.5 font-bold text-slate-800 dark:text-slate-100 hover:underline">
                                                        {w.url_foto
                                                            ? <img src={w.url_foto} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
                                                            : <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-bold text-slate-500">{w.nombre_completo[0]}</span>}
                                                        {w.nombre_completo}
                                                    </Link>
                                                </td>
                                                <td className={`${tdCls} text-slate-600 dark:text-slate-300`}>{fmt(w.fecha_nacimiento) || '—'}</td>
                                                <td className={tdCls}><FechaCell v={w.fecha_vencimiento_unilav} /></td>
                                                <td className={tdCls}><FechaCell v={w.fecha_vencimiento_residencia} /></td>
                                                <td className={tdCls}><FechaCell v={w.fecha_vencimiento_licencia} /></td>
                                                <td className={tdCls}><FechaCell v={w.fecha_vencimiento_identidad} /></td>
                                                <td className={tdCls}><FechaCell v={w.fecha_vencimiento_traduccion} /></td>
                                                <td className={tdCls}><FechaCell v={w.fecha_vencimiento_fiscal} /></td>
                                            </tr>
                                        ))}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
