'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../../lib/api';
import { useCurrency } from '../../lib/useCurrency';
import { Trabajador } from '../../types';
import { Eye, Trash2, Search, Plus, ChevronsUpDown, Phone, Mail, ArrowLeft, ArrowRight, Pencil, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import TrabajadorModal from './TrabajadorModal';
import Select from '../../components/Select';

const PAGE_SIZE = 10;

export default function TrabajadoresPage() {
    const { format } = useCurrency();
    const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterArea, setFilterArea] = useState('');
    const [page, setPage] = useState(1);

    // CRUD state
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Trabajador | null>(null);
    const [toDelete, setToDelete] = useState<Trabajador | null>(null);
    const [deleting, setDeleting] = useState(false);

    // trabajador_id → en línea (dispositivo con señal en los últimos 5 min)
    const [onlineWorkers, setOnlineWorkers] = useState<Record<string, boolean>>({});

    const fetchData = useCallback(() => {
        setLoading(true);
        api.get('/trabajadores')
            .then(res => setTrabajadores(res.data))
            .catch(err => console.error('Error fetching workers:', err))
            .finally(() => setLoading(false));
    }, []);

    const fetchOnline = useCallback(() => {
        api.get('/gps/devices')
            .then(res => {
                const map: Record<string, boolean> = {};
                (res.data || []).forEach((d: any) => {
                    if (!d.trabajador?.id) return;
                    const p = d.positions?.[0];
                    const online = p ? Date.now() - new Date(p.timestamp).getTime() < 5 * 60 * 1000 : false;
                    // si el trabajador tiene varios dispositivos, basta con uno en línea
                    map[d.trabajador.id] = map[d.trabajador.id] || online;
                });
                setOnlineWorkers(map);
            })
            .catch(err => console.error('Error fetching devices:', err));
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        fetchOnline();
        const t = setInterval(fetchOnline, 20000);
        return () => clearInterval(t);
    }, [fetchOnline]);

    const openCreate = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (t: Trabajador) => { setEditing(t); setModalOpen(true); };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/trabajadores/${toDelete.id}`);
            setTrabajadores(prev => prev.filter(t => t.id !== toDelete.id));
            setToDelete(null);
        } catch (err) {
            console.error('Error deleting worker:', err);
            alert('No se pudo eliminar el trabajador.');
        } finally {
            setDeleting(false);
        }
    };

    const roles = useMemo(() => Array.from(new Set(trabajadores.map(t => t.cargo).filter(Boolean))).sort(), [trabajadores]);
    const areas = useMemo(() => Array.from(new Set(trabajadores.map(t => t.area_trabajo).filter(Boolean))).sort(), [trabajadores]);

    const filtered = useMemo(() => trabajadores.filter(t => {
        if (filterRole && t.cargo !== filterRole) return false;
        if (filterArea && t.area_trabajo !== filterArea) return false;
        if (query && !(t.nombre_completo?.toLowerCase().includes(query.toLowerCase()) || t.id_trabajador?.toLowerCase().includes(query.toLowerCase()))) return false;
        return true;
    }), [trabajadores, filterRole, filterArea, query]);

    useEffect(() => setPage(1), [query, filterRole, filterArea]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Personal</h1>
                    <span className="min-w-[28px] h-6 px-2 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-sm font-bold">
                        {trabajadores.length}
                    </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar"
                            className="w-full sm:w-48 pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition"
                        />
                    </div>
                    <Select value={filterRole} onChange={(v) => setFilterRole(v)}
                        options={roles.map(r => ({ value: r, label: r }))}
                        placeholder="Todos los cargos" clearable className="w-full sm:w-44" />
                    <Select value={filterArea} onChange={(v) => setFilterArea(v)}
                        options={areas.map(a => ({ value: a, label: a }))}
                        placeholder="Todas las áreas" clearable className="w-full sm:w-44" />
                    <button onClick={openCreate} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition w-full sm:w-auto">
                        <Plus size={16} /> Nuevo trabajador
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-slate-400">
                                {['Empleado', 'ID / Cargo', 'Área', 'Contacto', 'Sueldo base', 'Estado'].map((h) => (
                                    <th key={h} className="px-5 py-3.5 font-medium">
                                        <span className="inline-flex items-center gap-1">{h} <ChevronsUpDown size={13} className="text-slate-300" /></span>
                                    </th>
                                ))}
                                <th className="px-5 py-3.5 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-16 text-slate-400">Cargando directorio...</td></tr>
                            ) : pageRows.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-16 text-slate-400">No se encontraron miembros.</td></tr>
                            ) : pageRows.map((w) => {
                                const active = w.estado_laboral === 'Activo';
                                return (
                                    <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="relative shrink-0">
                                                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden text-slate-400">
                                                        <img
                                                            src={w.url_foto || '/default-avatar.svg'}
                                                            alt={w.nombre_completo || ''}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-avatar.svg'; }}
                                                        />
                                                    </div>
                                                    {onlineWorkers[w.id] && (
                                                        <span
                                                            title="En línea (GPS activo)"
                                                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                                                        />
                                                    )}
                                                </div>
                                                <span className="font-semibold text-slate-900">{w.nombre_completo}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="font-mono text-xs text-blue-600">{w.id_trabajador || '-'}</div>
                                            <div className="text-xs text-slate-500">{w.cargo}</div>
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600">{w.area_trabajo || '-'}</td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex flex-col gap-1 text-xs text-slate-500">
                                                <span className="flex items-center gap-1.5"><Phone size={12} /> {w.telefono || '-'}</span>
                                                <span className="flex items-center gap-1.5"><Mail size={12} /> {w.email_personal || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 font-medium text-slate-900">
                                            {w.sueldo_base ? format(parseFloat(w.sueldo_base.toString())) : '-'}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`text-sm font-medium ${active ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                {w.estado_laboral || 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Link href={`/trabajadores/${w.id}`} title="Ver" className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
                                                    <Eye size={15} />
                                                </Link>
                                                <button onClick={() => openEdit(w)} title="Editar" className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
                                                    <Pencil size={15} />
                                                </button>
                                                <button onClick={() => setToDelete(w)} title="Eliminar" className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 flex items-center justify-center text-slate-500 transition">
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

                {!loading && filtered.length > 0 && (
                    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
                )}
            </div>

            {/* Modal crear / editar */}
            <TrabajadorModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={fetchData}
                initialData={editing}
            />

            {/* Confirmación de eliminación */}
            {toDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl p-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Eliminar trabajador</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    ¿Seguro que deseas eliminar a <span className="font-semibold text-slate-700">{toDelete.nombre_completo}</span>? Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setToDelete(null)} disabled={deleting}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition disabled:opacity-60">
                                Cancelar
                            </button>
                            <button onClick={confirmDelete} disabled={deleting}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition disabled:opacity-60">
                                {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
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
            <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ArrowLeft size={16} /> Anterior
            </button>
            <div className="flex items-center gap-1.5">
                {pages.map((p) => (
                    <button key={p} onClick={() => onChange(p)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition ${p === page ? 'border-2 border-blue-500 text-slate-900' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {p}
                    </button>
                ))}
            </div>
            <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition">
                Siguiente <ArrowRight size={16} />
            </button>
        </div>
    );
}
