'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../lib/api';
import { Fuel, Plus, Search, ArrowLeft, ArrowRight, Pencil, Trash2, Paperclip, Loader2, SlidersHorizontal, FileSpreadsheet, Check, X } from 'lucide-react';
import CombustibleModal from './CombustibleModal';
import GastoSustentoModal from '../../components/GastoSustentoModal';
import { useAuthStore } from '../../lib/store';
import { isChofer as checkIsChofer } from '../../lib/modules';
import Select from '../../components/Select';
import DatePicker from '../../components/DatePicker';
import { useCurrency } from '../../lib/useCurrency';
import { useT, useDateLocale } from '../../lib/i18n';
import { SPEDIZIONE_OPTIONS } from '../operaciones/constants';
import { toast } from 'sonner';

// Placa de un gasto "Desde operación": si falta, se puede corregir inline
// (es el motivo #1 por el que el reporte muestra "N/A" en vehículo).
function TargaCell({ item, onSaved }: { item: any; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(item.targa || '');
    const [saving, setSaving] = useState(false);

    if (item._origen !== 'operacion') {
        return <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{item.targa || 'N/A'}</span>;
    }
    if (!editing) {
        return (
            <button onClick={() => { setValue(item.targa || ''); setEditing(true); }} className="flex items-center gap-1.5 group">
                <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{item.targa || 'N/A'}</span>
                <Pencil size={11} className="text-slate-300 group-hover:text-slate-500 dark:text-slate-400 transition" />
            </button>
        );
    }
    const save = async () => {
        setSaving(true);
        try {
            await api.patch(`/combustible/${item.id}`, { targa: value.trim() });
            setEditing(false);
            onSaved();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo actualizar la placa');
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="flex items-center gap-1">
            <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                className="w-24 px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 outline-none text-sm"
            />
            <button onClick={save} disabled={saving} className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button onClick={() => setEditing(false)} className="w-6 h-6 rounded-md bg-slate-50 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                <X size={12} />
            </button>
        </div>
    );
}

export default function CombustiblePage() {
    const t = useT();
    const dateLocale = useDateLocale();
    const { format } = useCurrency();
    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [sum, setSum] = useState(0);
    const [areas, setAreas] = useState<string[]>(['Todos']);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [area, setArea] = useState<string>('Todos');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [deleting, setDeleting] = useState<any | null>(null);
    // Sustento posterior de un combustible "Desde operación" (foto del ticket).
    const user = useAuthStore((s) => s.user);
    const [sustentando, setSustentando] = useState<any | null>(null);
    const puedeSustentar = (item: any) => item?._origen === 'operacion' && (!checkIsChofer(user) || (!!item.trabajador_id && [user?.trabajador_id, (user as any)?.trabajador_codigo].filter(Boolean).includes(item.trabajador_id)));
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Filtros avanzados: fecha exacta, trabajador, spedizione.
    const [showFiltros, setShowFiltros] = useState(false);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [trabajadorFiltro, setTrabajadorFiltro] = useState('');
    const [spedizioneFiltro, setSpedizioneFiltro] = useState('');
    const [trabajadores, setTrabajadores] = useState<{ id: string; nombre_completo: string }[]>([]);
    const trabajadorOptions = useMemo(() => trabajadores.map(tr => ({ value: tr.id, label: tr.nombre_completo })), [trabajadores]);
    // Portal a <body> para el modal de confirmación de borrado.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const filtrosActivosCount = [fechaInicio, fechaFin, trabajadorFiltro, spedizioneFiltro].filter(Boolean).length;
    const limpiarFiltrosAvanzados = () => { setFechaInicio(''); setFechaFin(''); setTrabajadorFiltro(''); setSpedizioneFiltro(''); };

    useEffect(() => {
        api.get('/trabajadores').then(res => setTrabajadores(res.data ?? [])).catch(() => { });
    }, []);

    const openCreate = () => { setEditing(null); setIsModalOpen(true); };
    const openEdit = (item: any) => { setEditing(item); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setEditing(null); };

    // Debounce the search box so it hits the API at most every 250ms.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const filterParams = () => ({
        q: debouncedQuery || undefined,
        area: area !== 'Todos' ? area : undefined,
        from: fechaInicio ? new Date(`${fechaInicio}T00:00:00`).toISOString() : undefined,
        to: fechaFin ? new Date(`${fechaFin}T23:59:59`).toISOString() : undefined,
        trabajadorId: trabajadorFiltro || undefined,
        spedizione: spedizioneFiltro || undefined,
    });

    // Only the current page is fetched; the total sum + area list are aggregated server-side.
    const fetchItems = useCallback(() => {
        setLoading(true);
        api.get('/combustible', {
            params: { ...filterParams(), skip: (page - 1) * pageSize, take: pageSize },
        })
            .then(res => {
                setItems(res.data.items ?? []);
                setTotal(res.data.total ?? 0);
                setSum(res.data.sum ?? 0);
                setAreas(['Todos', ...(res.data.areas ?? [])]);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery, area, page, pageSize, fechaInicio, fechaFin, trabajadorFiltro, spedizioneFiltro]);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    // Back to page 1 whenever a filter changes.
    useEffect(() => { setPage(1); }, [debouncedQuery, area, pageSize, fechaInicio, fechaFin, trabajadorFiltro, spedizioneFiltro]);

    const exportToExcel = async () => {
        try {
            const res = await api.get('/combustible', { params: { ...filterParams(), skip: 0, take: 1000 } });
            const data: any[] = res.data.items ?? [];
            if (data.length === 0) return toast.error(t('combustible.sinDatosExportar'));
            const xlsx = await import('xlsx');
            const ws = xlsx.utils.json_to_sheet(data.map(r => ({
                [t('combustible.colVehiculo')]: r.targa || 'N/A',
                [t('combustible.colArea')]: r.area || '—',
                Spedizione: r.spedizione || '—',
                [t('combustible.colFecha')]: r.fecha ? new Date(r.fecha).toLocaleDateString() : '',
                [t('combustible.colMetodo')]: r.metodo || '',
                [t('combustible.colMonto')]: r.monto || 0,
            })));
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Combustible');
            xlsx.writeFile(wb, 'Reporte_Combustible.xlsx');
            toast.success(t('combustible.excelGenerado'));
        } catch (err) {
            console.error(err);
            toast.error(t('combustible.errorExportar'));
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            await api.delete(`/combustible/${deleting.id}`);
            setDeleting(null);
            if (items.length === 1 && page > 1) setPage(p => p - 1);
            else fetchItems();
        } catch (err) {
            console.error(err);
            alert(t('combustible.deleteError'));
        } finally {
            setDeleteLoading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageRows = items;

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t('combustible.title')}</h1>
                    <p className="text-sm text-slate-400 mt-0.5">{t('combustible.totalFiltrado')} <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{format(sum)}</span></p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                        onClick={exportToExcel}
                        title={t('combustible.exportar')}
                        className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition"
                    >
                        <FileSpreadsheet size={17} />
                    </button>
                    <button
                        onClick={openCreate}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition"
                    >
                        <Plus size={16} /> {t('combustible.registrar')}
                    </button>
                </div>
            </div>

            <CombustibleModal isOpen={isModalOpen} onClose={closeModal} onSuccess={fetchItems} record={editing} />
            <GastoSustentoModal item={sustentando} tipo="COMBUSTIBLE" onClose={() => setSustentando(null)} onSaved={fetchItems} />

            {/* Search */}
            <div className="relative mb-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('combustible.searchPlaceholder')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-slate-400 outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 transition"
                />
            </div>

            {/* Filtros avanzados: fecha exacta, trabajador, spedizione */}
            <div className="mb-4">
                <button
                    onClick={() => setShowFiltros(v => !v)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition ${showFiltros || filtrosActivosCount > 0 ? 'border-blue-300 text-slate-900 dark:text-white bg-blue-50/40' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-white dark:bg-slate-900'}`}
                >
                    <SlidersHorizontal size={14} /> {t('combustible.filtros.titulo')}
                    {filtrosActivosCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-[10px] font-bold">
                            {filtrosActivosCount}
                        </span>
                    )}
                </button>
                {showFiltros && (
                    <div className="mt-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <DatePicker label={t('combustible.filtros.fechaInicio')} value={fechaInicio} onChange={setFechaInicio} />
                        <DatePicker label={t('combustible.filtros.fechaFin')} value={fechaFin} onChange={setFechaFin} />
                        <Select
                            label={t('combustible.filtros.trabajador')}
                            value={trabajadorFiltro}
                            onChange={setTrabajadorFiltro}
                            options={trabajadorOptions}
                            placeholder={t('combustible.filtros.todos')}
                            clearable
                        />
                        <Select
                            label={t('combustible.filtros.spedizione')}
                            value={spedizioneFiltro}
                            onChange={setSpedizioneFiltro}
                            options={SPEDIZIONE_OPTIONS}
                            placeholder={t('combustible.filtros.todos')}
                            clearable
                        />
                        {filtrosActivosCount > 0 && (
                            <button onClick={limpiarFiltrosAvanzados} className="text-xs font-medium text-blue-600 hover:underline text-left sm:col-span-2 lg:col-span-4">
                                {t('combustible.filtros.limpiar')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Tabs */}
            {areas.length > 1 && (
                <div className="flex items-center gap-1.5 mb-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1 max-w-full sm:w-fit flex-wrap">
                    {areas.map((a) => (
                        <button
                            key={a}
                            onClick={() => setArea(a)}
                            className={`flex items-center gap-2 shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition ${area === a ? 'bg-[#FFC933] text-[#1a1a1c]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                        >
                            {a === 'Todos' ? t('combustible.todos') : a}
                        </button>
                    ))}
                </div>
            )}

            {/* Tabla */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400">
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">{t('combustible.colVehiculo')}</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">{t('combustible.colArea')}</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">Spedizione</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">{t('combustible.colFecha')}</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">{t('combustible.colMetodo')}</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">{t('combustible.colMes')}</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap text-right">{t('combustible.colMonto')}</th>
                                <th className="px-5 py-3.5 font-medium whitespace-nowrap">{t('combustible.colArchivo')}</th>
                                <th className="px-5 py-3.5 font-medium text-right whitespace-nowrap">{t('combustible.colAcciones')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">{t('combustible.loading')}</td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">{t('combustible.emptyState')}</td></tr>
                            ) : pageRows.map((item) => (
                                <tr key={item.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
                                                <Fuel size={16} />
                                            </div>
                                            <TargaCell item={item} onSaved={fetchItems} />
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {item._origen === 'operacion' ? (
                                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium border text-indigo-600 border-indigo-200 bg-indigo-50 whitespace-nowrap">Operación</span>
                                        ) : item.area ? (
                                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium border text-blue-600 border-blue-200 bg-blue-50 whitespace-nowrap">
                                                {item.area}
                                            </span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{item.spedizione || '—'}</td>
                                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                        {item.fecha ? new Date(item.fecha).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.metodo || '—'}</td>
                                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{item.mes || '—'}</td>
                                    <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{format(item.monto || 0)}</td>
                                    <td className="px-5 py-3.5">
                                        {item.archivo ? (
                                            <a href={item.archivo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 whitespace-nowrap">
                                                <Paperclip size={13} /> {t('combustible.ver')}
                                            </a>
                                        ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {item._origen === 'operacion' ? (
                                            <div className="flex items-center justify-end gap-1.5">
                                                {puedeSustentar(item) && (
                                                    <button
                                                        onClick={() => setSustentando(item)}
                                                        title={t('componentes.sustento.accion')}
                                                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 hover:border-blue-200 flex items-center justify-center text-slate-500 hover:text-blue-600 transition"
                                                    >
                                                        <Paperclip size={15} />
                                                    </button>
                                                )}
                                                <span className="text-xs text-slate-400 italic whitespace-nowrap">Desde operación</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => openEdit(item)}
                                                    title={t('combustible.editar')}
                                                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleting(item)}
                                                    title={t('combustible.eliminar')}
                                                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 hover:border-red-200 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-600 transition"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {!loading && total > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <span>{t('combustible.mostrar')}</span>
                        <Select
                            className="w-[84px]"
                            value={String(pageSize)}
                            onChange={(v) => setPageSize(Number(v))}
                            options={[
                                { value: '10', label: '10' },
                                { value: '25', label: '25' },
                                { value: '50', label: '50' },
                            ]}
                        />
                        <span>{t('combustible.porPagina')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                        <span className="tabular-nums">{t('combustible.paginationRange', { from: startIndex + 1, to: Math.min(startIndex + pageSize, total), total })}</span>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-600 dark:text-slate-400 transition">
                                <ArrowLeft size={16} />
                            </button>
                            <span className="px-1 font-medium text-slate-900 dark:text-white tabular-nums">{currentPage} / {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-600 dark:text-slate-400 transition">
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deleting && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 shadow-2xl p-6 max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                                <Trash2 size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('combustible.deleteTitle')}</h2>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            {t('combustible.deleteConfirmPrefix')} <span className="font-medium text-slate-700 dark:text-slate-200">{deleting.targa || t('combustible.deleteConfirmVehiculoFallback')}</span>{t('combustible.deleteConfirmSuffix')}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleting(null)}
                                disabled={deleteLoading}
                                className="px-5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
                            >
                                {t('combustible.cancelar')}
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleteLoading}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition disabled:opacity-50"
                            >
                                {deleteLoading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                {t('combustible.eliminar')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
