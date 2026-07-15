'use client';

import { useEffect, useState, memo, useCallback, useRef } from 'react';
import api from '../../lib/api';
import { Programacion } from '../../types';
import { LiveMap } from '../../components/tracking/LiveMap';
import { LiveMapReal } from '../../components/tracking/LiveMapReal';
import NewRouteModal from './NewRouteModal';
import {
    Truck, Search, Plus, Package, Layers, FileSpreadsheet, MapPin, User, Navigation, X, Check, Trash2, AlertTriangle, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useCurrency } from '../../lib/useCurrency';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDJ-Y0SukxfjbACOUjPY7CoV6qnaQkKSZg";

// Estado → LoadSwift-style badge
const ESTADO_META: Record<string, { label: string; badge: string; dot: string }> = {
    PENDIENTE: { label: 'Pendiente', badge: 'text-amber-600 border-amber-200 bg-amber-50', dot: 'bg-amber-500' },
    RETIRADO: { label: 'En ruta', badge: 'text-blue-600 border-blue-200 bg-blue-50', dot: 'bg-blue-500' },
    ENTREGADO: { label: 'Entregado', badge: 'text-emerald-600 border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500' },
    ANULADO: { label: 'Anulado', badge: 'text-red-600 border-red-200 bg-red-50', dot: 'bg-red-500' },
    REPROGRAMADO: { label: 'Reprog.', badge: 'text-purple-600 border-purple-200 bg-purple-50', dot: 'bg-purple-500' },
};
const estadoMeta = (e?: string) => ESTADO_META[e || 'PENDIENTE'] || ESTADO_META.PENDIENTE;
const ALL_ESTADOS = Object.keys(ESTADO_META);

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—';

const PAGE_SIZE = 60;
const WINDOW_OPTIONS: { label: string; days: number | null }[] = [
    { label: '60 días', days: 60 },
    { label: '6 meses', days: 180 },
    { label: '1 año', days: 365 },
    { label: 'Todo', days: null },
];

// Tarjeta de detalle de la operación seleccionada.
// En desktop flota sobre el mapa (abajo-izquierda); en móvil se muestra debajo del mapa.
function RouteDetailCard({ selected, format, onEdit, onDelete }: {
    selected: Programacion;
    format: (n: number) => string;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl shadow-lg lg:shadow-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 truncate">{selected.cliente || 'Operación'}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${estadoMeta(selected.estado).badge}`}>
                            {estadoMeta(selected.estado).label}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{selected.id_programacion}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    <button
                        onClick={onEdit}
                        className="px-3 py-1.5 rounded-lg bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-xs font-medium transition"
                    >
                        Editar
                    </button>
                    <button
                        onClick={onDelete}
                        title="Eliminar operación"
                        className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 flex items-center justify-center transition"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                    <MapPin size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400">Origen</p>
                        <p className="text-slate-700 truncate">{selected.lugar_retiro || '—'}</p>
                    </div>
                </div>
                <div className="flex items-start gap-2">
                    <MapPin size={15} className="text-slate-900 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400">Destino</p>
                        <p className="text-slate-700 truncate">{selected.lugar_entrega || '—'}</p>
                    </div>
                </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1.5"><Truck size={13} /> {selected.vehiculo_id || '—'}</span>
                <span className="flex items-center gap-1.5 truncate"><User size={13} /> {selected.trabajador_id || 'Sin asignar'}</span>
                {selected.ingreso_estimado != null && (
                    <span className="ml-auto font-semibold text-slate-900 tabular-nums">{format(selected.ingreso_estimado)}</span>
                )}
            </div>
        </div>
    );
}

export default function OperacionesPage() {
    const { format } = useCurrency();
    const [rutas, setRutas] = useState<Programacion[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [devicesMap, setDevicesMap] = useState<Record<string, { id: string; name: string; worker?: string }>>({});
    const [selected, setSelected] = useState<Programacion | null>(null);

    const [deleting, setDeleting] = useState<Programacion | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [windowDays, setWindowDays] = useState<number | null>(60);
    const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
    const [showLayers, setShowLayers] = useState(false);
    const [visibleEstados, setVisibleEstados] = useState<Set<string>>(new Set(ALL_ESTADOS));

    const [isNewRouteModalOpen, setIsNewRouteModalOpen] = useState(false);
    const [editingRuta, setEditingRuta] = useState<Programacion | null>(null);

    const listRef = useRef<HTMLDivElement | null>(null);

    // Debounce the search box so filtering hits the API at most every 250ms.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Build the query params for the current filters (date window, search, estados).
    const buildParams = useCallback((skip: number) => {
        const params: any = { skip, take: PAGE_SIZE };
        if (windowDays != null) {
            const from = new Date();
            from.setDate(from.getDate() - windowDays);
            params.from = from.toISOString();
        }
        if (debouncedQuery) params.q = debouncedQuery;
        // Only send estados when a strict subset is selected; "all" means no filter.
        if (visibleEstados.size > 0 && visibleEstados.size < ALL_ESTADOS.length) {
            params.estados = Array.from(visibleEstados).join(',');
        }
        return params;
    }, [windowDays, debouncedQuery, visibleEstados]);

    // (Re)load the first page whenever any filter changes.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.get('/programacion', { params: buildParams(0) })
            .then(res => {
                if (cancelled) return;
                setRutas(res.data.items ?? []);
                setTotal(res.data.total ?? 0);
                setCounts(res.data.counts ?? {});
                if (listRef.current) listRef.current.scrollTop = 0;
            })
            .catch(err => console.error(err))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [buildParams]);

    const fetchDevices = async () => {
        try {
            const res = await api.get('/gps/devices');
            const map: any = {};
            res.data.forEach((d: any) => {
                if (d.vehiculo?.placa) map[d.vehiculo.placa] = { id: d.id, name: d.name, worker: d.trabajador?.nombre_completo };
            });
            setDevicesMap(map);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => { fetchDevices(); }, []);

    // Append the next page when the user scrolls near the bottom (infinite scroll).
    const loadMore = useCallback(() => {
        if (loadingMore || loading || rutas.length >= total) return;
        setLoadingMore(true);
        api.get('/programacion', { params: buildParams(rutas.length) })
            .then(res => {
                setRutas(prev => [...prev, ...(res.data.items ?? [])]);
                setTotal(res.data.total ?? 0);
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingMore(false));
    }, [buildParams, rutas.length, total, loadingMore, loading]);

    const onListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) loadMore();
    }, [loadMore]);

    // Auto-select first route
    useEffect(() => {
        if (!selected && rutas.length > 0) setSelected(rutas[0]);
    }, [rutas, selected]);

    const toggleEstado = (e: string) => {
        setVisibleEstados(prev => {
            const next = new Set(prev);
            next.has(e) ? next.delete(e) : next.add(e);
            return next;
        });
    };

    // Stable callback so memoized cards don't re-render on every parent render
    const handleSelect = useCallback((r: Programacion) => setSelected(r), []);

    const handleDelete = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            await api.delete(`/programacion/${deleting.id}`);
            toast.success('Operación eliminada');
            // Drop it locally and adjust the total instead of a full refetch.
            setRutas(prev => prev.filter(r => r.id !== deleting.id));
            setTotal(t => Math.max(0, t - 1));
            if (selected?.id === deleting.id) setSelected(null);
            setDeleting(null);
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar la operación');
        } finally {
            setIsDeleting(false);
        }
    };

    const reloadFirstPage = useCallback(() => {
        setLoading(true);
        api.get('/programacion', { params: buildParams(0) })
            .then(res => {
                setRutas(res.data.items ?? []);
                setTotal(res.data.total ?? 0);
                setCounts(res.data.counts ?? {});
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [buildParams]);

    const exportToExcel = async () => {
        try {
            // Pull the full current filter (capped at 1000) for a complete export.
            const params = { ...buildParams(0), take: 1000 };
            const res = await api.get('/programacion', { params });
            const data: Programacion[] = res.data.items ?? [];
            if (data.length === 0) return toast.error('No hay datos');
            const xlsx = await import('xlsx');
            const ws = xlsx.utils.json_to_sheet(data.map(r => ({
                ID: r.id_programacion, Fecha: new Date(r.fecha).toLocaleDateString(), Cliente: r.cliente,
                Vehículo: r.vehiculo_id, Conductor: r.trabajador_id, Estado: r.estado,
                Origen: r.lugar_retiro, Destino: r.lugar_entrega
            })));
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Operaciones');
            xlsx.writeFile(wb, 'Reporte_Operaciones.xlsx');
            toast.success('Excel generado');
        } catch (error) {
            console.error(error);
            toast.error('Error al exportar');
        }
    };

    const device = selected ? devicesMap[selected.vehiculo_id || ''] : null;

    return (
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-4rem)]">
            {/* ================= LEFT: LIST ================= */}
            <div className="w-full lg:max-w-[400px] lg:shrink-0 flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden max-h-[55vh] lg:max-h-none">
                {/* Header */}
                <div className="p-4 pb-3">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-xl font-bold text-slate-900">Operaciones</h1>
                            <span className="min-w-[26px] h-6 px-2 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-sm font-bold">
                                {total}
                            </span>
                        </div>
                        <button onClick={exportToExcel} title="Exportar" className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 transition">
                            <FileSpreadsheet size={16} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar cliente, placa, destino..."
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition"
                        />
                    </div>
                    {/* Periodo — limita cuántos datos se traen del servidor */}
                    <div className="mt-2 flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                        {WINDOW_OPTIONS.map(opt => (
                            <button
                                key={opt.label}
                                onClick={() => setWindowDays(opt.days)}
                                className={clsx(
                                    "flex-1 px-2 py-1 rounded-md text-xs font-medium transition",
                                    windowDays === opt.days ? "bg-[#1a1a1c] text-white" : "text-slate-500 hover:text-slate-900"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div ref={listRef} onScroll={onListScroll} className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5">
                    {loading ? (
                        <div className="text-center py-16 text-sm text-slate-400">Cargando operaciones...</div>
                    ) : rutas.length === 0 ? (
                        <div className="text-center py-16 text-sm text-slate-400">Sin operaciones para mostrar.</div>
                    ) : (
                        <>
                            {rutas.map((ruta) => (
                                <RouteCard
                                    key={ruta.id}
                                    ruta={ruta}
                                    isSelected={selected?.id === ruta.id}
                                    onSelect={handleSelect}
                                />
                            ))}
                            {loadingMore && (
                                <div className="flex items-center justify-center py-4 text-slate-400">
                                    <Loader2 size={16} className="animate-spin" />
                                </div>
                            )}
                            {rutas.length < total && !loadingMore && (
                                <button
                                    onClick={loadMore}
                                    className="w-full py-2.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition"
                                >
                                    Cargar más ({total - rutas.length} restantes)
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Footer add */}
                <div className="p-3 border-t border-slate-100">
                    <button
                        onClick={() => { setEditingRuta(null); setIsNewRouteModalOpen(true); }}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition"
                    >
                        <Plus size={16} /> Nueva operación
                    </button>
                </div>
            </div>

            {/* ================= RIGHT: MAP + DETAIL ================= */}
            <div className="flex-1 flex flex-col min-h-0 gap-3">
              <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 h-[52vh] lg:h-auto lg:flex-1">
                {/* Map (memoized — no re-render on search/hover/layers) */}
                <div className="absolute inset-0">
                    <MapView
                        deviceId={device?.id || ''}
                        worker={device?.worker || ''}
                        origin={selected?.lugar_retiro || ''}
                        destination={selected?.lugar_entrega || ''}
                        plate={selected?.vehiculo_id || ''}
                        mapType={mapType}
                    />
                </div>

                {/* Controles: debajo de la barra de estado en móvil, arriba-derecha en desktop */}
                <div className="absolute top-[68px] right-3 sm:top-4 sm:right-4 flex items-center gap-2 z-20">
                    <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                        <button
                            onClick={() => setMapType('roadmap')}
                            className={clsx("px-3.5 py-1.5 rounded-lg text-sm font-medium transition", mapType === 'roadmap' ? "bg-[#FFC933] text-[#1a1a1c]" : "text-slate-600 hover:text-slate-900")}
                        >
                            Mapa
                        </button>
                        <button
                            onClick={() => setMapType('satellite')}
                            className={clsx("px-3.5 py-1.5 rounded-lg text-sm font-medium transition", mapType === 'satellite' ? "bg-[#FFC933] text-[#1a1a1c]" : "text-slate-600 hover:text-slate-900")}
                        >
                            Satélite
                        </button>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowLayers(v => !v)}
                            className={clsx("flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white shadow-sm border text-sm font-medium transition", showLayers ? "border-blue-400 text-slate-900" : "border-slate-200 text-slate-600 hover:text-slate-900")}
                        >
                            <Layers size={16} /> Capas
                        </button>

                        {showLayers && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 animate-in fade-in zoom-in-95 duration-150">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
                                    <Package size={15} /> Estados visibles
                                </div>
                                <div className="space-y-1">
                                    {ALL_ESTADOS.map((e) => {
                                        const meta = estadoMeta(e);
                                        const on = visibleEstados.has(e);
                                        return (
                                            <button
                                                key={e}
                                                onClick={() => toggleEstado(e)}
                                                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition text-left"
                                            >
                                                <span className={clsx("w-4 h-4 rounded flex items-center justify-center border", on ? "bg-blue-500 border-blue-500" : "border-slate-300")}>
                                                    {on && <Check size={11} className="text-white" />}
                                                </span>
                                                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                                                <span className="text-sm text-slate-700 flex-1">{meta.label}</span>
                                                <span className="text-xs text-slate-400 tabular-nums">{counts[e]}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Detalle flotante — solo desktop */}
                {selected && (
                    <div className="hidden lg:block absolute bottom-4 left-4 w-[360px] z-10">
                        <RouteDetailCard
                            selected={selected}
                            format={format}
                            onEdit={() => { setEditingRuta(selected); setIsNewRouteModalOpen(true); }}
                            onDelete={() => setDeleting(selected)}
                        />
                    </div>
                )}
              </div>

              {/* Detalle apilado — solo móvil/tablet (debajo del mapa, no lo tapa) */}
              {selected && (
                  <div className="lg:hidden">
                      <RouteDetailCard
                          selected={selected}
                          format={format}
                          onEdit={() => { setEditingRuta(selected); setIsNewRouteModalOpen(true); }}
                          onDelete={() => setDeleting(selected)}
                      />
                  </div>
              )}
            </div>

            {/* Modal */}
            <NewRouteModal
                isOpen={isNewRouteModalOpen}
                onClose={() => setIsNewRouteModalOpen(false)}
                onSuccess={reloadFirstPage}
                initialData={editingRuta}
            />

            {/* Confirmación de eliminación */}
            {deleting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl p-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900">Eliminar operación</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    ¿Seguro que deseas eliminar{' '}
                                    <span className="font-medium text-slate-700">{deleting.cliente || deleting.id_programacion || 'esta operación'}</span>?
                                    Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleting(null)}
                                disabled={isDeleting}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                            >
                                {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* Memoized route card — only the card whose `isSelected` changed re-renders on a click,
   instead of the whole list. This is what made clicking feel slow. */
const RouteCard = memo(function RouteCard({ ruta, isSelected, onSelect }: {
    ruta: Programacion; isSelected: boolean; onSelect: (r: Programacion) => void;
}) {
    const meta = estadoMeta(ruta.estado);
    return (
        <button
            onClick={() => onSelect(ruta)}
            className={clsx(
                "w-full text-left rounded-xl border p-3.5 transition",
                isSelected ? "border-blue-400 ring-1 ring-blue-200 bg-blue-50/30" : "border-slate-200 hover:border-slate-300 bg-white"
            )}
        >
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Package size={15} />
                </div>
                <span className="font-semibold text-slate-900 text-sm truncate">{ruta.cliente || ruta.id_programacion || 'Operación'}</span>
                <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium border ${meta.badge}`}>
                    {meta.label}
                </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-900 shrink-0" />
                <div className="flex-1 h-px bg-slate-200 relative">
                    <Truck size={14} className="absolute left-1/2 -translate-x-1/2 -top-[7px] text-slate-700 bg-white px-0.5" />
                </div>
                <span className="w-2 h-2 rounded-full border-2 border-slate-400 shrink-0" />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                <span className="truncate max-w-[45%]">{ruta.lugar_retiro?.split(',')[0] || 'Origen'} · {fmtDate(ruta.fecha_retiro || ruta.fecha)}</span>
                <span className="truncate max-w-[45%] text-right">{ruta.lugar_entrega?.split(',')[0] || 'Destino'} · {fmtDate(ruta.fecha_entrega)}</span>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Truck size={12} /> {ruta.vehiculo_id || '—'}</span>
                <span className="flex items-center gap-1 truncate"><User size={12} /> {ruta.trabajador_id || 'Sin asignar'}</span>
            </div>
        </button>
    );
});

/* Memoized map — only re-renders when the selected route or map type actually changes,
   so typing in search, opening "Capas" or hovering the list won't touch the map. */
const MapView = memo(function MapView({ deviceId, worker, origin, destination, plate, mapType }: {
    deviceId: string; worker?: string; origin: string; destination: string; plate: string; mapType: 'roadmap' | 'satellite';
}) {
    if (deviceId) {
        return <LiveMapReal deviceId={deviceId} apiKey={MAPS_KEY} vehiclePlate={plate} workerName={worker} />;
    }
    if (origin && destination) {
        return <LiveMap originAddress={origin} destinationAddress={destination} apiKey={MAPS_KEY} mapType={mapType} preview />;
    }
    return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
            <Navigation size={40} className="opacity-40" />
            <p className="text-sm">Selecciona una operación para ver su ruta.</p>
        </div>
    );
});
