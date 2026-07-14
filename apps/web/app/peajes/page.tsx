'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import { Receipt, Plus, Search, Calendar, ArrowLeft, ArrowRight, Pencil, Trash2, Paperclip, Loader2 } from 'lucide-react';
import PeajeModal from './PeajeModal';
import { useCurrency } from '../../lib/useCurrency';

const ESTADOS = ['Todos', 'PENDIENTE', 'PAGADO', 'ANULADO'] as const;

const ESTADO_BADGE: Record<string, string> = {
    PAGADO: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    PENDIENTE: 'text-amber-600 border-amber-200 bg-amber-50',
    ANULADO: 'text-slate-500 border-slate-200 bg-slate-50',
};

export default function PeajesPage() {
    const { format } = useCurrency();
    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Record<string, number>>({ Todos: 0, PENDIENTE: 0, PAGADO: 0, ANULADO: 0 });
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [estado, setEstado] = useState<string>('Todos');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [deleting, setDeleting] = useState<any | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const openCreate = () => { setEditing(null); setIsModalOpen(true); };
    const openEdit = (item: any) => { setEditing(item); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setEditing(null); };

    // Debounce the search box so it hits the API at most every 250ms.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    // Only the current page is fetched from the server; counts come pre-aggregated.
    const fetchItems = useCallback(() => {
        setLoading(true);
        api.get('/peajes', {
            params: {
                q: debouncedQuery || undefined,
                estado: estado !== 'Todos' ? estado : undefined,
                skip: (page - 1) * pageSize,
                take: pageSize,
            },
        })
            .then(res => {
                setItems(res.data.items ?? []);
                setTotal(res.data.total ?? 0);
                setCounts(res.data.counts ?? { Todos: 0, PENDIENTE: 0, PAGADO: 0, ANULADO: 0 });
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [debouncedQuery, estado, page, pageSize]);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    // Back to page 1 whenever a filter changes.
    useEffect(() => { setPage(1); }, [debouncedQuery, estado, pageSize]);

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            await api.delete(`/peajes/${deleting.id}`);
            setDeleting(null);
            // If we just removed the last row on a page past the first, step back.
            if (items.length === 1 && page > 1) setPage(p => p - 1);
            else fetchItems();
        } catch (err) {
            console.error(err);
            alert('Error al eliminar el registro');
        } finally {
            setDeleteLoading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageRows = items;

    return (
        <div className="max-w-[1100px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Peajes / Multas</h1>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition"
                >
                    <Plus size={16} /> Registrar
                </button>
            </div>

            <PeajeModal isOpen={isModalOpen} onClose={closeModal} onSuccess={fetchItems} record={editing} />

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por placa, ID multa o comentario"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition"
                />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1.5 mb-5 bg-white border border-slate-200 rounded-xl p-1 w-fit">
                {ESTADOS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setEstado(t)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${estado === t ? 'bg-[#FFC933] text-[#1a1a1c]' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        {t === 'Todos' ? 'Todos' : t.charAt(0) + t.slice(1).toLowerCase()}
                        <span className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-md text-[11px] font-bold ${estado === t ? 'bg-[#1a1a1c]/10 text-[#1a1a1c]' : 'bg-slate-100 text-slate-500'}`}>
                            {counts[t as keyof typeof counts]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Cards */}
            {loading ? (
                <div className="text-center py-16 text-sm text-slate-400">Cargando registros...</div>
            ) : items.length === 0 ? (
                <div className="text-center py-16 text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl">
                    No se encontraron peajes ni multas.
                </div>
            ) : (
                <div className="space-y-3">
                    {pageRows.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition">
                            {/* Top */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                    <Receipt size={18} />
                                </div>
                                <span className="font-semibold text-slate-900">{item.targa || 'N/A'}</span>
                                {item.estado && (
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium border ${ESTADO_BADGE[item.estado] || ESTADO_BADGE.PENDIENTE}`}>
                                        {item.estado}
                                    </span>
                                )}
                                <div className="ml-auto flex items-center gap-3">
                                    <div className="text-lg font-bold text-slate-900 tabular-nums">{format(item.monto || 0)}</div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openEdit(item)}
                                            title="Editar"
                                            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 transition"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            onClick={() => setDeleting(item)}
                                            title="Eliminar"
                                            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center text-slate-500 hover:text-red-600 transition"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Meta */}
                            <div className="mt-3 pl-[52px] flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    {item.comentarios && <p className="text-sm text-slate-700 truncate">{item.comentarios}</p>}
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                        {item.fecha && <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(item.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                                        {item.hora && <span>{item.hora}</span>}
                                        {item.id_multa && <span>Multa: {item.id_multa}</span>}
                                        {item.tipo && <span>{item.tipo}</span>}
                                        {item.archivo && (
                                            <a href={item.archivo} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-700">
                                                <Paperclip size={12} /> Archivo
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>Mostrar</span>
                        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 outline-none focus:border-slate-400 text-slate-900 cursor-pointer transition">
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                        <span>por página</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span className="tabular-nums">{startIndex + 1}–{Math.min(startIndex + pageSize, total)} de {total}</span>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-600 transition">
                                <ArrowLeft size={16} />
                            </button>
                            <span className="px-1 font-medium text-slate-900 tabular-nums">{currentPage} / {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-600 transition">
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deleting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                                <Trash2 size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">Eliminar registro</h2>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">
                            ¿Seguro que deseas eliminar el peaje/multa de <span className="font-medium text-slate-700">{deleting.targa || 'este vehículo'}</span>
                            {deleting.id_multa ? ` (${deleting.id_multa})` : ''}? Esta acción no se puede deshacer.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleting(null)}
                                disabled={deleteLoading}
                                className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleteLoading}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition disabled:opacity-50"
                            >
                                {deleteLoading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
