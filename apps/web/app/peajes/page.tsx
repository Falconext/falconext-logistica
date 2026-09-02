'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../lib/api';
import { Receipt, Plus, Search, ArrowLeft, ArrowRight, Pencil, Trash2, Paperclip, Loader2, SlidersHorizontal, Eye, FileSpreadsheet, ExternalLink } from 'lucide-react';
import PeajeModal from './PeajeModal';
import PeajeDetailModal from './PeajeDetailModal';
import Select from '../../components/Select';
import DatePicker from '../../components/DatePicker';
import { useCurrency } from '../../lib/useCurrency';
import { useT, useDateLocale } from '../../lib/i18n';
import { useAuthStore } from '../../lib/store';
import { isChofer as checkIsChofer } from '../../lib/modules';
import { SPEDIZIONE_OPTIONS } from '../operaciones/constants';
import { toast } from 'sonner';

const ESTADOS = ['Todos', 'PENDIENTE', 'PAGADO', 'ANULADO'] as const;

const ESTADO_LABEL_KEY: Record<string, string> = {
    Todos: 'todos',
    PENDIENTE: 'pendiente',
    PAGADO: 'pagado',
    ANULADO: 'anulado',
};

const ESTADO_BADGE: Record<string, string> = {
    PAGADO: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    PENDIENTE: 'text-amber-600 border-amber-200 bg-amber-50',
    ANULADO: 'text-slate-500 border-slate-200 bg-slate-50',
};

// Color por BUCKET (agrupa los estados de texto libre) — para diferenciar de un
// vistazo lo PAGADO (verde) de lo que FALTA pagar (ámbar) y lo anulado (gris).
const DOT_BY_BUCKET: Record<string, string> = {
    PAGADO: 'bg-emerald-500',
    PENDIENTE: 'bg-amber-500',
    ANULADO: 'bg-slate-400',
};
const BADGE_BY_BUCKET: Record<string, string> = {
    PAGADO: 'text-emerald-700 border-emerald-200 bg-emerald-50',
    PENDIENTE: 'text-amber-700 border-amber-200 bg-amber-50',
    ANULADO: 'text-slate-500 border-slate-200 bg-slate-50',
};

// Espejo del bucketOf() del backend — solo para decidir si mostrar la fecha
// límite en rojo (vencida y aún sin resolver).
const PAGADO_VALS = ['PAGADO', 'PAGADO POR AUTISTA', 'PAGO BONIFICO'];
const ANULADO_VALS = ['ANULADO'];
function bucketOfEstado(e?: string | null): 'PAGADO' | 'ANULADO' | 'PENDIENTE' {
    const v = (e || '').trim().toUpperCase();
    if (PAGADO_VALS.includes(v)) return 'PAGADO';
    if (ANULADO_VALS.includes(v)) return 'ANULADO';
    return 'PENDIENTE';
}

export default function PeajesPage() {
    const t = useT();
    const dateLocale = useDateLocale();
    const { format } = useCurrency();
    const user = useAuthStore((s) => s.user);
    // La edición de peajes es solo para supervisores en adelante; los autistas
    // (solo_propios) solo ven su propia info (el backend ya la filtra) y no editan.
    const canEdit = !checkIsChofer(user);
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
    const [viewing, setViewing] = useState<any | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [busyEstado, setBusyEstado] = useState<Set<string>>(new Set());
    // Portal a <body> para el modal de confirmación de borrado (evita quedar
    // acotado al <main overflow-y-auto> del layout).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Filtros avanzados: fecha exacta, trabajador, spedizione.
    const [showFiltros, setShowFiltros] = useState(false);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [trabajadorFiltro, setTrabajadorFiltro] = useState('');
    const [spedizioneFiltro, setSpedizioneFiltro] = useState('');
    const [trabajadores, setTrabajadores] = useState<{ id: string; nombre_completo: string }[]>([]);
    const trabajadorOptions = useMemo(() => trabajadores.map(tr => ({ value: tr.id, label: tr.nombre_completo })), [trabajadores]);
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
        const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [query]);

    // Only the current page is fetched from the server; counts come pre-aggregated.
    const fetchItems = useCallback(() => {
        setLoading(true);
        api.get('/peajes', {
            params: {
                q: debouncedQuery || undefined,
                estado: estado !== 'Todos' ? estado : undefined,
                from: fechaInicio ? new Date(`${fechaInicio}T00:00:00`).toISOString() : undefined,
                to: fechaFin ? new Date(`${fechaFin}T23:59:59`).toISOString() : undefined,
                trabajadorId: trabajadorFiltro || undefined,
                spedizione: spedizioneFiltro || undefined,
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
    }, [debouncedQuery, estado, page, pageSize, fechaInicio, fechaFin, trabajadorFiltro, spedizioneFiltro]);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    // Back to page 1 whenever a filter changes.
    useEffect(() => { setPage(1); }, [debouncedQuery, estado, pageSize, fechaInicio, fechaFin, trabajadorFiltro, spedizioneFiltro]);

    // Cambio rápido de estado desde la tabla (solo admin — el backend igual lo exige).
    const patchEstado = async (item: any, nuevoEstado: string) => {
        setBusyEstado((s) => new Set(s).add(item.id));
        try {
            await api.patch(`/peajes/${item.id}`, { estado: nuevoEstado });
            fetchItems();
        } catch (err) {
            console.error(err);
            toast.error(t('peajes.errorActualizarEstado'));
        } finally {
            setBusyEstado((s) => { const n = new Set(s); n.delete(item.id); return n; });
        }
    };

    const exportToExcel = async () => {
        try {
            const params = {
                q: debouncedQuery || undefined,
                estado: estado !== 'Todos' ? estado : undefined,
                from: fechaInicio ? new Date(`${fechaInicio}T00:00:00`).toISOString() : undefined,
                to: fechaFin ? new Date(`${fechaFin}T23:59:59`).toISOString() : undefined,
                trabajadorId: trabajadorFiltro || undefined,
                spedizione: spedizioneFiltro || undefined,
                skip: 0,
                take: 1000,
            };
            const res = await api.get('/peajes', { params });
            const data: any[] = res.data.items ?? [];
            if (data.length === 0) return toast.error(t('peajes.sinDatosExportar'));
            const xlsx = await import('xlsx');
            const ws = xlsx.utils.json_to_sheet(data.map(r => ({
                [t('peajes.columnas.vehiculo')]: r.targa || 'N/A',
                [t('peajes.columnas.estado')]: r.estado || '—',
                Spedizione: r.spedizione || '—',
                [t('peajes.columnas.comentario')]: r.comentarios || '',
                [t('peajes.columnas.fecha')]: r.fecha ? new Date(r.fecha).toLocaleDateString() : '',
                [t('peajes.detalle.fechaLimitePago')]: r.fecha_limite_pago ? new Date(r.fecha_limite_pago).toLocaleDateString() : '',
                [t('peajes.detalle.numeroMancato')]: r.numero_mancato || r.id_multa || '',
                [t('peajes.columnas.monto')]: r.monto || 0,
            })));
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Peajes');
            xlsx.writeFile(wb, 'Reporte_Peajes.xlsx');
            toast.success(t('peajes.excelGenerado'));
        } catch (err) {
            console.error(err);
            toast.error(t('peajes.errorExportar'));
        }
    };

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
            alert(t('peajes.errorEliminar'));
        } finally {
            setDeleteLoading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageRows = items;

    return (
        <div className="max-w-[1560px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{t('peajes.titulo')}</h1>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                        onClick={exportToExcel}
                        title={t('peajes.exportar')}
                        className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 transition"
                    >
                        <FileSpreadsheet size={17} />
                    </button>
                    <button
                        onClick={openCreate}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition"
                    >
                        <Plus size={16} /> {t('peajes.registrar')}
                    </button>
                </div>
            </div>

            <PeajeModal isOpen={isModalOpen} onClose={closeModal} onSuccess={fetchItems} record={editing} />
            <PeajeDetailModal item={viewing} onClose={() => setViewing(null)} />

            {/* Search */}
            <div className="relative mb-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('peajes.buscarPlaceholder')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition"
                />
            </div>

            {/* Filtros avanzados: fecha exacta, trabajador, spedizione */}
            <div className="mb-4">
                <button
                    onClick={() => setShowFiltros(v => !v)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition ${showFiltros || filtrosActivosCount > 0 ? 'border-blue-300 text-slate-900 bg-blue-50/40' : 'border-slate-200 text-slate-500 hover:text-slate-900 bg-white'}`}
                >
                    <SlidersHorizontal size={14} /> {t('peajes.filtros.titulo')}
                    {filtrosActivosCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-[10px] font-bold">
                            {filtrosActivosCount}
                        </span>
                    )}
                </button>
                {showFiltros && (
                    <div className="mt-2 p-4 rounded-xl border border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <DatePicker label={t('peajes.filtros.fechaInicio')} value={fechaInicio} onChange={setFechaInicio} />
                        <DatePicker label={t('peajes.filtros.fechaFin')} value={fechaFin} onChange={setFechaFin} />
                        <Select
                            label={t('peajes.filtros.trabajador')}
                            value={trabajadorFiltro}
                            onChange={setTrabajadorFiltro}
                            options={trabajadorOptions}
                            placeholder={t('peajes.filtros.todos')}
                            clearable
                        />
                        <Select
                            label={t('peajes.filtros.spedizione')}
                            value={spedizioneFiltro}
                            onChange={setSpedizioneFiltro}
                            options={SPEDIZIONE_OPTIONS}
                            placeholder={t('peajes.filtros.todos')}
                            clearable
                        />
                        {filtrosActivosCount > 0 && (
                            <button onClick={limpiarFiltrosAvanzados} className="text-xs font-medium text-blue-600 hover:underline text-left sm:col-span-2 lg:col-span-4">
                                {t('peajes.filtros.limpiar')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1.5 mb-5 bg-white border border-slate-200 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
                {ESTADOS.map((estadoOption) => (
                    <button
                        key={estadoOption}
                        onClick={() => setEstado(estadoOption)}
                        className={`flex items-center gap-2 shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition ${estado === estadoOption ? 'bg-[#FFC933] text-[#1a1a1c]' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        {t(`peajes.estados.${ESTADO_LABEL_KEY[estadoOption]}`)}
                        <span className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-md text-[11px] font-bold ${estado === estadoOption ? 'bg-[#1a1a1c]/10 text-[#1a1a1c]' : 'bg-slate-100 text-slate-500'}`}>
                            {counts[estadoOption as keyof typeof counts]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-slate-400">
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.columnas.estado')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.columnas.autista')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.columnas.vehiculo')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.columnas.nroMancato')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.columnas.linkPago')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.columnas.fecha')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap">{t('peajes.detalle.fechaLimitePago')}</th>
                                <th className="px-3.5 py-3 font-medium whitespace-nowrap text-right">{t('peajes.columnas.monto')}</th>
                                <th className="px-3.5 py-3 font-medium text-right whitespace-nowrap">{t('peajes.columnas.acciones')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">{t('peajes.cargando')}</td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-16 text-slate-400">{t('peajes.vacio')}</td></tr>
                            ) : pageRows.map((item) => {
                                const limite = item.fecha_limite_pago ? new Date(item.fecha_limite_pago) : null;
                                const bucket = bucketOfEstado(item.estado);
                                const vencido = !!limite && limite.getTime() < Date.now() && bucket === 'PENDIENTE';
                                const nroMancato = item.numero_mancato || item.id_multa || null;
                                const linkPago = item.link_peaje || item.archivo || null;
                                return (
                                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                    {/* Estado — con color por bucket para diferenciar pagado / por pagar / anulado */}
                                    <td className="px-3.5 py-3">
                                        {canEdit ? (
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_BY_BUCKET[bucket]}`} />
                                                <Select
                                                    className="w-36"
                                                    searchable={false}
                                                    value={item.estado || ''}
                                                    disabled={busyEstado.has(item.id)}
                                                    onChange={(v) => patchEstado(item, v)}
                                                    options={[
                                                        { value: '', label: t('peajes.estados.pendiente') },
                                                        { value: 'PAGADO', label: t('peajes.estados.pagado') },
                                                        { value: 'ANULADO', label: t('peajes.estados.anulado') },
                                                    ]}
                                                />
                                            </div>
                                        ) : (
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap ${BADGE_BY_BUCKET[bucket]}`}>
                                                <span className={`w-2 h-2 rounded-full ${DOT_BY_BUCKET[bucket]}`} />
                                                {item.estado || t('peajes.estados.pendiente')}
                                            </span>
                                        )}
                                    </td>
                                    {/* Autista */}
                                    <td className="px-3.5 py-3 text-slate-700 whitespace-nowrap">{item.autista || '—'}</td>
                                    {/* Vehículo */}
                                    <td className="px-3.5 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                                <Receipt size={15} />
                                            </div>
                                            <span className="font-semibold text-slate-900 truncate max-w-[120px]" title={item.targa || ''}>{item.targa || 'N/A'}</span>
                                        </div>
                                    </td>
                                    {/* Nº Mancato */}
                                    <td className="px-3.5 py-3 text-slate-600 tabular-nums">
                                        <span className="block truncate max-w-[120px]" title={nroMancato || ''}>{nroMancato || '—'}</span>
                                    </td>
                                    {/* Link de pago — se muestra el texto tal cual (legible, para
                                        identificar el peaje) y se normaliza el href para que abra. */}
                                    <td className="px-3.5 py-3">
                                        {linkPago ? (
                                            <a href={/^https?:\/\//i.test(linkPago) ? linkPago : `https://${linkPago}`} target="_blank" rel="noopener noreferrer"
                                                title={linkPago}
                                                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline font-medium max-w-[200px] truncate">
                                                <ExternalLink size={14} className="shrink-0" /> <span className="truncate">{String(linkPago).replace(/^https?:\/\//i, '').replace(/\/+$/, '')}</span>
                                            </a>
                                        ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                    </td>
                                    {/* Fecha */}
                                    <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap">
                                        {item.fecha ? new Date(item.fecha).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                    </td>
                                    {/* Fecha límite */}
                                    <td className={`px-3.5 py-3 whitespace-nowrap ${vencido ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                                        {limite ? limite.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                    </td>
                                    {/* Monto */}
                                    <td className="px-3.5 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{format(item.monto || 0)}</td>
                                    {/* Acciones */}
                                    <td className="px-3.5 py-3">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => setViewing(item)}
                                                title={t('peajes.verDetalle')}
                                                className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 transition"
                                            >
                                                <Eye size={15} />
                                            </button>
                                            {canEdit && (item._origen === 'operacion' ? (
                                                <span className="text-xs text-slate-400 italic whitespace-nowrap px-1">{t('peajes.desdeOperacion')}</span>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => openEdit(item)}
                                                        title={t('peajes.editar')}
                                                        className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 transition"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleting(item)}
                                                        title={t('peajes.eliminar')}
                                                        className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center text-slate-500 hover:text-red-600 transition"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {!loading && total > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>{t('peajes.mostrar')}</span>
                        <Select value={String(pageSize)} onChange={(v) => setPageSize(Number(v))}
                            searchable={false} className="w-20"
                            options={[
                                { value: '10', label: '10' },
                                { value: '25', label: '25' },
                                { value: '50', label: '50' },
                            ]} />
                        <span>{t('peajes.porPagina')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span className="tabular-nums">{t('peajes.rangoPaginacion', { inicio: startIndex + 1, fin: Math.min(startIndex + pageSize, total), total })}</span>
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
            {deleting && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl p-6 max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                                <Trash2 size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">{t('peajes.eliminarRegistroTitulo')}</h2>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">
                            {(() => {
                                const vehiculoLabel = deleting.targa || t('peajes.esteVehiculo');
                                const fullText = t('peajes.confirmarEliminarTexto', {
                                    vehiculo: vehiculoLabel,
                                    multa: '',
                                });
                                const [before, after] = fullText.split(vehiculoLabel);
                                return (
                                    <>
                                        {before}
                                        <span className="font-medium text-slate-700">{vehiculoLabel}</span>
                                        {after}
                                    </>
                                );
                            })()}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleting(null)}
                                disabled={deleteLoading}
                                className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                            >
                                {t('peajes.cancelar')}
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleteLoading}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition disabled:opacity-50"
                            >
                                {deleteLoading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                {t('peajes.eliminar')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
