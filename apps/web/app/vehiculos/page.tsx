'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { Vehiculo } from '../../types';
import { Truck, Eye, Trash2, Search, SlidersHorizontal, Download, Plus, ChevronsUpDown, Crosshair, ArrowLeft, ArrowRight, Loader2, AlertTriangle, Check, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import VehiculoModal from './VehiculoModal';

const PAGE_SIZE = 10;

export default function VehiculosPage() {
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

    const fetchVehiculos = () => {
        setLoading(true);
        api.get('/vehiculos')
            .then(res => setVehiculos(res.data))
            .catch(err => console.error('Error fetching vehicles:', err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchVehiculos();
    }, []);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/vehiculos/${deleteTarget.id}`);
            setVehiculos(prev => prev.filter(v => v.id !== deleteTarget.id));
            toast.success('Vehículo eliminado');
            setDeleteTarget(null);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.message || 'Error al eliminar el vehículo');
        } finally {
            setDeleting(false);
        }
    };

    // Distinct option values for the filter dropdown (derived from live data)
    const estadoOptions = useMemo(
        () => Array.from(new Set(vehiculos.map(v => v.estado_vehiculo).filter(Boolean) as string[])).sort(),
        [vehiculos]
    );
    const tipoOptions = useMemo(
        () => Array.from(new Set(vehiculos.map(v => v.tipo_unidad).filter(Boolean) as string[])).sort(),
        [vehiculos]
    );

    const activeFilterCount = estadoFilter.size + tipoFilter.size;

    const toggleSetValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
        setter(prev => {
            const next = new Set(prev);
            next.has(value) ? next.delete(value) : next.add(value);
            return next;
        });
    };

    const clearFilters = () => { setEstadoFilter(new Set()); setTipoFilter(new Set()); };

    const filtered = useMemo(() => vehiculos.filter(v => {
        const matchesQuery =
            v.placa?.toLowerCase().includes(query.toLowerCase()) ||
            v.marca_modelo?.toLowerCase().includes(query.toLowerCase());
        const matchesEstado = estadoFilter.size === 0 || (v.estado_vehiculo ? estadoFilter.has(v.estado_vehiculo) : false);
        const matchesTipo = tipoFilter.size === 0 || (v.tipo_unidad ? tipoFilter.has(v.tipo_unidad) : false);
        return matchesQuery && matchesEstado && matchesTipo;
    }), [vehiculos, query, estadoFilter, tipoFilter]);

    useEffect(() => setPage(1), [query, estadoFilter, tipoFilter]);

    const exportToExcel = () => {
        if (filtered.length === 0) return toast.error('No hay vehículos para exportar');
        import('xlsx').then(xlsx => {
            const ws = xlsx.utils.json_to_sheet(filtered.map(v => ({
                Placa: v.placa,
                'Marca / Modelo': v.marca_modelo || '',
                Tipo: v.tipo_unidad || '',
                'Año': v.anio_fabricacion || '',
                Seguro: v.poliza_seguro || '',
                'Revisión Técnica': v.revision_tecnica || '',
                Estado: v.estado_vehiculo || '',
            })));
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Vehículos');
            xlsx.writeFile(wb, 'Reporte_Vehiculos.xlsx');
            toast.success('Excel generado');
        }).catch(() => toast.error('Error al generar el Excel'));
    };

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vehículos</h1>
                    <span className="min-w-[28px] h-6 px-2 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-sm font-bold">
                        {vehiculos.length}
                    </span>
                </div>
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar"
                            className="w-56 pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition"
                        />
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border text-sm transition ${showFilters || activeFilterCount > 0 ? 'border-slate-400 text-slate-900' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                        >
                            <SlidersHorizontal size={16} /> Filtros
                            {activeFilterCount > 0 && (
                                <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#FFC933] text-[#1a1a1c] text-[11px] font-bold">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>

                        {showFilters && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} />
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-20 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-semibold text-slate-900">Filtrar por</span>
                                        {activeFilterCount > 0 && (
                                            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition">
                                                <X size={12} /> Limpiar
                                            </button>
                                        )}
                                    </div>

                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">Estado</p>
                                    <div className="space-y-1 mb-3">
                                        {estadoOptions.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
                                        {estadoOptions.map((e) => {
                                            const on = estadoFilter.has(e);
                                            return (
                                                <button
                                                    key={e}
                                                    onClick={() => toggleSetValue(setEstadoFilter, e)}
                                                    className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 transition text-left"
                                                >
                                                    <span className={`w-4 h-4 rounded flex items-center justify-center border ${on ? 'bg-[#FFC933] border-[#FFC933]' : 'border-slate-300'}`}>
                                                        {on && <Check size={11} className="text-[#1a1a1c]" />}
                                                    </span>
                                                    <span className="text-sm text-slate-700 flex-1 truncate">{e}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">Tipo de unidad</p>
                                    <div className="space-y-1">
                                        {tipoOptions.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
                                        {tipoOptions.map((t) => {
                                            const on = tipoFilter.has(t);
                                            return (
                                                <button
                                                    key={t}
                                                    onClick={() => toggleSetValue(setTipoFilter, t)}
                                                    className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 transition text-left"
                                                >
                                                    <span className={`w-4 h-4 rounded flex items-center justify-center border ${on ? 'bg-[#FFC933] border-[#FFC933]' : 'border-slate-300'}`}>
                                                        {on && <Check size={11} className="text-[#1a1a1c]" />}
                                                    </span>
                                                    <span className="text-sm text-slate-700 flex-1 truncate">{t}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-sm text-slate-700 transition"
                    >
                        <Download size={16} /> Exportar
                    </button>
                    <button
                        onClick={() => setModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition"
                    >
                        <Plus size={16} /> Nuevo vehículo
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-slate-400">
                                {['Unidad', 'Marca / Modelo', 'Tipo', 'Año', 'Seguro', 'Rev. Técnica', 'GPS', 'Estado'].map((h) => (
                                    <th key={h} className="px-5 py-3.5 font-medium">
                                        <span className="inline-flex items-center gap-1">{h} <ChevronsUpDown size={13} className="text-slate-300" /></span>
                                    </th>
                                ))}
                                <th className="px-5 py-3.5 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">Cargando flota...</td></tr>
                            ) : pageRows.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">No se encontraron vehículos.</td></tr>
                            ) : pageRows.map((v) => {
                                const estado = (v.estado_vehiculo || '').toUpperCase();
                                const available = estado === 'ACTIVO' || estado === 'DISPONIBLE';
                                return (
                                    <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                                    <Truck size={16} />
                                                </div>
                                                <span className="font-semibold text-slate-900">{v.placa}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600">{v.marca_modelo || '-'}</td>
                                        <td className="px-5 py-3.5 text-slate-600">{v.tipo_unidad || '-'}</td>
                                        <td className="px-5 py-3.5 text-slate-600">{v.anio_fabricacion || '-'}</td>
                                        <td className="px-5 py-3.5">
                                            {v.poliza_seguro
                                                ? <span className="text-slate-600">{v.poliza_seguro}</span>
                                                : <span className="text-red-500 text-xs font-medium">Sin seguro</span>}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600">{v.revision_tecnica || <span className="text-amber-500 text-xs font-medium">Pendiente</span>}</td>
                                        <td className="px-5 py-3.5">
                                            <span className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500">
                                                <Crosshair size={15} />
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`text-sm font-medium ${available ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {available ? 'Disponible' : 'No disponible'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Link href={`/vehiculos/${v.id}`} title="Ver" className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
                                                    <Eye size={15} />
                                                </Link>
                                                <button
                                                    title="Eliminar"
                                                    onClick={() => setDeleteTarget(v)}
                                                    className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 flex items-center justify-center text-slate-500 transition"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!loading && filtered.length > 0 && (
                    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
                )}
            </div>

            {/* Create modal */}
            <VehiculoModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={() => fetchVehiculos()}
            />

            {/* Delete confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl overflow-hidden">
                        <div className="p-6 flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                                <AlertTriangle size={22} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Eliminar vehículo</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    ¿Seguro que deseas eliminar la unidad <span className="font-semibold text-slate-700">{deleteTarget.placa}</span>? Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition flex items-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
                            >
                                {deleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 6);
    return (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100">
            <button
                onClick={() => onChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
                <ArrowLeft size={16} /> Anterior
            </button>
            <div className="flex items-center gap-1.5">
                {pages.map((p) => (
                    <button
                        key={p}
                        onClick={() => onChange(p)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition ${p === page
                            ? 'border-2 border-blue-500 text-slate-900'
                            : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                        {p}
                    </button>
                ))}
            </div>
            <button
                onClick={() => onChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
                Siguiente <ArrowRight size={16} />
            </button>
        </div>
    );
}
