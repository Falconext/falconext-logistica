'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../lib/api';
import { Vehiculo } from '../../types';
import { Truck, Eye, Trash2, Search, SlidersHorizontal, Download, Plus, ChevronsUpDown, Crosshair, ArrowLeft, ArrowRight, Loader2, AlertTriangle, Check, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import VehiculoModal from './VehiculoModal';
import { useT } from '../../lib/i18n';

const PAGE_SIZE = 10;

const fmtFechaCorta = (raw?: string | null): string => {
    if (!raw) return '';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function VehiculosPage() {
    const t = useT();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const [modalOpen, setModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Vehiculo | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [showFilters, setShowFilters] = useState(false);
    const [estadoFilter, setEstadoFilter] = useState<Set<string>>(new Set());
    const [tipoFilter, setTipoFilter] = useState<Set<string>>(new Set());
    const [areaFilter, setAreaFilter] = useState<Set<string>>(new Set());
    const [gpsByVeh, setGpsByVeh] = useState<Record<string, { deviceId: string; online: boolean; hasPos: boolean }>>({});

    const fetchVehiculos = () => {
        setLoading(true);
        api.get('/vehiculos').then(res => setVehiculos(res.data)).catch(err => console.error('Error fetching vehicles:', err)).finally(() => setLoading(false));
    };

    const fetchGps = () => {
        api.get('/gps/devices').then(res => {
            const map: Record<string, { deviceId: string; online: boolean; hasPos: boolean }> = {};
            const now = Date.now();
            (Array.isArray(res.data) ? res.data : []).forEach((d: any) => {
                const vehId = d.vehiculo?.id || d.vehiculo_id;
                if (!vehId) return;
                const pos = d.positions?.[0];
                const hasPos = !!pos;
                const online = hasPos && now - new Date(pos.timestamp).getTime() < 5 * 60 * 1000;
                map[vehId] = { deviceId: d.id, online, hasPos };
            });
            setGpsByVeh(map);
        }).catch(err => console.error('Error fetching GPS devices:', err));
    };

    useEffect(() => { fetchVehiculos(); fetchGps(); }, []);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/vehiculos/${deleteTarget.id}`);
            setVehiculos(prev => prev.filter(v => v.id !== deleteTarget.id));
            toast.success(t('vehiculos.lista.toastEliminado'));
            setDeleteTarget(null);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.message || t('vehiculos.lista.toastErrorEliminar'));
        } finally {
            setDeleting(false);
        }
    };

    const estadoOptions = useMemo(() => Array.from(new Set(vehiculos.map(v => v.estado_vehiculo).filter(Boolean) as string[])).sort(), [vehiculos]);
    const tipoOptions = useMemo(() => Array.from(new Set(vehiculos.map(v => v.tipo_unidad).filter(Boolean) as string[])).sort(), [vehiculos]);
    const areaOptions = useMemo(() => Array.from(new Set(vehiculos.map(v => v.area).filter(Boolean) as string[])).sort(), [vehiculos]);
    const activeFilterCount = estadoFilter.size + tipoFilter.size + areaFilter.size;

    const toggleSetValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
        setter(prev => { const next = new Set(prev); next.has(value) ? next.delete(value) : next.add(value); return next; });
    };
    const clearFilters = () => { setEstadoFilter(new Set()); setTipoFilter(new Set()); setAreaFilter(new Set()); };

    const filtered = useMemo(() => vehiculos.filter(v => {
        const matchesQuery = v.placa?.toLowerCase().includes(query.toLowerCase()) || v.marca_modelo?.toLowerCase().includes(query.toLowerCase());
        const matchesEstado = estadoFilter.size === 0 || (v.estado_vehiculo ? estadoFilter.has(v.estado_vehiculo) : false);
        const matchesTipo = tipoFilter.size === 0 || (v.tipo_unidad ? tipoFilter.has(v.tipo_unidad) : false);
        const matchesArea = areaFilter.size === 0 || (v.area ? areaFilter.has(v.area) : false);
        return matchesQuery && matchesEstado && matchesTipo && matchesArea;
    }), [vehiculos, query, estadoFilter, tipoFilter, areaFilter]);

    useEffect(() => setPage(1), [query, estadoFilter, tipoFilter, areaFilter]);

    const exportToExcel = () => {
        if (filtered.length === 0) return toast.error(t('vehiculos.lista.toastErrorExportarVacio'));
        import('xlsx').then(xlsx => {
            const ws = xlsx.utils.json_to_sheet(filtered.map(v => ({
                [t('vehiculos.lista.columnas.placa')]: v.placa,
                [t('vehiculos.lista.columnas.marcaModelo')]: v.marca_modelo || '',
                [t('vehiculos.lista.columnas.tipo')]: v.tipo_unidad || '',
                [t('vehiculos.lista.columnas.anio')]: v.anio_fabricacion || '',
                [t('vehiculos.lista.columnas.seguro')]: v.poliza_seguro || '',
                [t('vehiculos.lista.columnas.revisionTecnicaCompleta')]: fmtFechaCorta(v.revision_tecnica),
                [t('vehiculos.lista.columnas.estado')]: v.estado_vehiculo || '',
            })));
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, t('vehiculos.lista.titulo'));
            xlsx.writeFile(wb, 'Reporte_Vehiculos.xlsx');
            toast.success(t('vehiculos.lista.toastExcelGenerado'));
        }).catch(() => toast.error(t('vehiculos.lista.toastErrorExcel')));
    };

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const checkboxCls = (on: boolean) => `w-4 h-4 rounded flex items-center justify-center border ${on ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-600'}`;
    const filterOptBtn = "w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left";

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t('vehiculos.lista.titulo')}</h1>
                    <span className="min-w-[28px] h-7 px-2.5 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold tabular-nums">{vehiculos.length}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('vehiculos.lista.buscar')}
                            className="w-full sm:w-56 pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 transition" />
                    </div>
                    <div className="relative w-full sm:w-auto">
                        <button onClick={() => setShowFilters(v => !v)}
                            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border text-sm transition ${showFilters || activeFilterCount > 0 ? 'border-blue-400 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'}`}>
                            <SlidersHorizontal size={16} /> {t('vehiculos.lista.filtros')}
                            {activeFilterCount > 0 && <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-500 text-white text-[11px] font-bold">{activeFilterCount}</span>}
                        </button>
                        {showFilters && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} />
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-20 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{t('vehiculos.lista.filtrarPor')}</span>
                                        {activeFilterCount > 0 && <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"><X size={12} /> {t('vehiculos.lista.limpiar')}</button>}
                                    </div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">{t('vehiculos.lista.estado')}</p>
                                    <div className="space-y-1 mb-3">
                                        {estadoOptions.length === 0 && <p className="text-xs text-slate-400">{t('vehiculos.lista.sinDatos')}</p>}
                                        {estadoOptions.map((e) => { const on = estadoFilter.has(e); return (
                                            <button key={e} onClick={() => toggleSetValue(setEstadoFilter, e)} className={filterOptBtn}>
                                                <span className={checkboxCls(on)}>{on && <Check size={11} className="text-white" />}</span>
                                                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{e}</span>
                                            </button>); })}
                                    </div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">{t('vehiculos.lista.tipoUnidad')}</p>
                                    <div className="space-y-1">
                                        {tipoOptions.length === 0 && <p className="text-xs text-slate-400">{t('vehiculos.lista.sinDatos')}</p>}
                                        {tipoOptions.map((tp) => { const on = tipoFilter.has(tp); return (
                                            <button key={tp} onClick={() => toggleSetValue(setTipoFilter, tp)} className={filterOptBtn}>
                                                <span className={checkboxCls(on)}>{on && <Check size={11} className="text-white" />}</span>
                                                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{tp}</span>
                                            </button>); })}
                                    </div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5 mt-3">{t('vehiculos.lista.area')}</p>
                                    <div className="space-y-1">
                                        {areaOptions.length === 0 && <p className="text-xs text-slate-400">{t('vehiculos.lista.sinDatos')}</p>}
                                        {areaOptions.map((a) => { const on = areaFilter.has(a); return (
                                            <button key={a} onClick={() => toggleSetValue(setAreaFilter, a)} className={filterOptBtn}>
                                                <span className={checkboxCls(on)}>{on && <Check size={11} className="text-white" />}</span>
                                                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{a}</span>
                                            </button>); })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <button onClick={exportToExcel} className="w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-300 text-sm text-slate-700 dark:text-slate-300 transition">
                        <Download size={16} /> {t('vehiculos.lista.exportar')}
                    </button>
                    <button onClick={() => setModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold transition shadow-sm">
                        <Plus size={16} /> {t('vehiculos.lista.nuevoVehiculo')}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400">
                                {[
                                    t('vehiculos.lista.columnas.unidad'), t('vehiculos.lista.columnas.marcaModelo'), t('vehiculos.lista.columnas.tipo'),
                                    t('vehiculos.lista.columnas.anio'), t('vehiculos.lista.columnas.seguro'), t('vehiculos.lista.columnas.revTecnica'),
                                    t('vehiculos.lista.columnas.gps'), t('vehiculos.lista.columnas.estado'),
                                ].map((h) => (
                                    <th key={h} className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">{h} <ChevronsUpDown size={12} className="text-slate-300 dark:text-slate-600" /></span>
                                    </th>
                                ))}
                                <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-right">{t('vehiculos.lista.columnas.acciones')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">{t('vehiculos.lista.cargando')}</td></tr>
                            ) : pageRows.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">{t('vehiculos.lista.vacio')}</td></tr>
                            ) : pageRows.map((v) => {
                                const estado = (v.estado_vehiculo || '').toUpperCase();
                                const available = estado === 'ACTIVO' || estado === 'DISPONIBLE';
                                return (
                                    <tr key={v.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0"><Truck size={16} /></div>
                                                <span className="font-semibold text-slate-900 dark:text-white">{v.placa}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{v.marca_modelo || '-'}</td>
                                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{v.tipo_unidad || '-'}</td>
                                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{v.anio_fabricacion || '-'}</td>
                                        <td className="px-5 py-3.5">
                                            {v.poliza_seguro ? <span className="text-slate-600 dark:text-slate-400">{v.poliza_seguro}</span> : <span className="text-rose-500 text-xs font-medium">{t('vehiculos.lista.sinSeguro')}</span>}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{fmtFechaCorta(v.revision_tecnica) || <span className="text-amber-500 text-xs font-medium">{t('vehiculos.lista.pendiente')}</span>}</td>
                                        <td className="px-5 py-3.5">
                                            {(() => {
                                                const gps = gpsByVeh[v.id];
                                                if (!gps) return <span title="Sin dispositivo GPS asignado" className="w-8 h-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600"><Crosshair size={15} /></span>;
                                                return (
                                                    <Link href={`/rastreo?device=${gps.deviceId}`} title={gps.online ? 'GPS en línea · ver en el mapa' : gps.hasPos ? 'Dispositivo asignado · sin señal reciente' : 'Dispositivo asignado · sin posición aún'}
                                                        className={`relative w-8 h-8 rounded-lg border flex items-center justify-center transition ${gps.online ? 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                                        <Crosshair size={15} />
                                                        {gps.online && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />}
                                                    </Link>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${available ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20' : 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                {available ? t('vehiculos.lista.disponible') : t('vehiculos.lista.noDisponible')}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Link href={`/vehiculos/${v.id}`} title={t('vehiculos.lista.ver')} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition"><Eye size={15} /></Link>
                                                <button title={t('vehiculos.lista.eliminar')} onClick={() => setDeleteTarget(v)} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:border-red-500/30 flex items-center justify-center text-slate-500 dark:text-slate-400 transition"><Trash2 size={15} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {!loading && filtered.length > 0 && <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />}
            </div>

            <VehiculoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={() => fetchVehiculos()} />

            {deleteTarget && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="p-6 flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center shrink-0"><AlertTriangle size={22} /></div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('vehiculos.lista.confirmarEliminarTitulo')}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('vehiculos.lista.confirmarEliminarPre')}<span className="font-semibold text-slate-700 dark:text-slate-200">{deleteTarget.placa}</span>{t('vehiculos.lista.confirmarEliminarPost')}</p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex justify-end gap-3">
                            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60">{t('vehiculos.lista.cancelar')}</button>
                            <button onClick={handleDelete} disabled={deleting} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition flex items-center gap-2 disabled:opacity-60 disabled:pointer-events-none">
                                {deleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}{t('vehiculos.lista.eliminar')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
    const t = useT();
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 6);
    return (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ArrowLeft size={16} /> {t('vehiculos.lista.anterior')}
            </button>
            <div className="flex items-center gap-1.5">
                {pages.map((p) => (
                    <button key={p} onClick={() => onChange(p)} className={`w-9 h-9 rounded-lg text-sm font-medium transition ${p === page ? 'border-2 border-blue-500 text-slate-900 dark:text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{p}</button>
                ))}
            </div>
            <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
                {t('vehiculos.lista.siguiente')} <ArrowRight size={16} />
            </button>
        </div>
    );
}
