'use client';

// Vista de CHOFER: "Mis Consegnas". Equivale a la pestaña del app (que reutiliza
// Operaciones filtrada a `mias`): muestra las programaciones asignadas al usuario
// logueado (por trabajador_id), con su estado de consegna, y abre el detalle
// (NewRouteModal) para verlas/editarlas. En modo chofer solo se edita el itinerario.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Search, MapPin, Smartphone, Loader2, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { isChofer } from '../../lib/modules';
import { Programacion } from '../../types';
import {
    ESTADO_CONSEGNA_OPTIONS,
    estadoConsegnaMeta,
} from '../operaciones/constants';
import NewRouteModal from '../operaciones/NewRouteModal';

export default function MisConsegnasPage() {
    const user = useAuthStore((s) => s.user);
    const [items, setItems] = useState<Programacion[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [estado, setEstado] = useState('');
    const [editing, setEditing] = useState<Programacion | null>(null);

    // Identidad del usuario para el filtro "mías" (igual que el app: id o código).
    const misIds = useMemo(
        () => [user?.trabajador_id].filter(Boolean) as string[],
        [user?.trabajador_id],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, any> = { take: 200 };
            if (estado) params.estados = estado;
            const res = await api.get('/programacion', { params });
            const all: Programacion[] = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
            // Solo las asignadas a este usuario.
            const mine = misIds.length
                ? all.filter((r) => misIds.includes(String((r as any).trabajador_id)))
                : all;
            setItems(mine);
        } catch (e) {
            console.error('[MisConsegnas] load', e);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [estado, misIds]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter((r) =>
            [r.cliente, (r as any).lugar_retiro, (r as any).lugar_entrega, r.app, r.spedizione]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q)),
        );
    }, [items, query]);

    const soloItinerario = isChofer(user);

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-50 grid place-items-center text-blue-600"><Package size={20} /></div>
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-800">Mis Consegnas</h1>
                        <p className="text-sm text-slate-500">Las entregas asignadas a ti</p>
                    </div>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                    <RefreshCw size={15} /> Actualizar
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar cliente, dirección, app…"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                </div>
                <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                    <option value="">Todos los estados</option>
                    {ESTADO_CONSEGNA_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-slate-500 p-6"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                    <Package className="mx-auto mb-2 text-slate-400" size={28} />
                    <p className="font-semibold text-slate-700">Sin consegnas</p>
                    <p className="text-sm">No tienes consegnas que coincidan con el filtro.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((r) => {
                        const meta = estadoConsegnaMeta(r.estado_consegna);
                        return (
                            <button
                                key={r.id}
                                onClick={() => setEditing(r)}
                                className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition space-y-2"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-slate-800 truncate">{r.cliente || 'Operación'}</span>
                                    {meta && (
                                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${meta.badge}`}>{meta.label}</span>
                                    )}
                                </div>
                                <div className="text-sm text-slate-600 space-y-1">
                                    <div className="flex items-center gap-2 truncate"><MapPin size={14} className="text-emerald-500 shrink-0" /> {(r as any).lugar_retiro || '—'}</div>
                                    <div className="flex items-center gap-2 truncate"><MapPin size={14} className="text-slate-700 shrink-0" /> {(r as any).lugar_entrega || '—'}</div>
                                </div>
                                {(r.app || r.spedizione || r.ciudad) && (
                                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                                        {r.app && <span className="flex items-center gap-1"><Smartphone size={12} /> {r.app}</span>}
                                        {r.spedizione && <span className="flex items-center gap-1"><Package size={12} /> {r.spedizione}</span>}
                                        {r.ciudad && <span>{r.ciudad}</span>}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            <NewRouteModal
                isOpen={!!editing}
                onClose={() => setEditing(null)}
                onSuccess={() => { setEditing(null); load(); }}
                initialData={editing}
                canEditAll={!soloItinerario}
            />
        </div>
    );
}
