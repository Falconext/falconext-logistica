'use client';

// Vista de CHOFER: "Mi Resumen" — su inicio personal. Entregas y gastos del mes,
// bonifico/saldo, accesos rápidos, consegnas asignadas y partes recientes.
// GET /registros/mias/resumen + /programacion + /recorridos/mio/resumen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Package, Fuel, Navigation, MapPinned, CircleUser, ChevronRight, Clock,
    Route as RouteIcon, Moon, ClipboardList, Loader2,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { useCurrency } from '../../lib/useCurrency';

interface Resumen {
    tarifas?: { giorno: number; notte: number; corte: number };
    totalPartes: number; km: number; oreMattina: number; oreSera: number; oreTotal: number;
    reperibilita?: number; gananciaEstimada: number;
    recientes: { id: string; fecha: string; operacion: string; targa?: string | null; km: number; oreMattina: number; oreSera: number; ganancia: number }[];
}
interface ResumenChofer {
    entregas: { total: number; entregadas: number; canceladas: number; pendientes: number; enRuta: number };
    gastos: { combustible: number; peajes: number; otros: number; total: number };
    anticipo: number; saldo: number; moneda: string;
}
interface Consegna { id: string; id_programacion?: string | null; cliente?: string | null; lugar_retiro?: string | null; lugar_entrega?: string | null; fecha?: string | null; estado?: string | null; }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const horasLabel = (h: number) => { const horas = Math.floor(h); const min = Math.round((h - horas) * 60); return min > 0 ? `${horas}h ${min}m` : `${horas}h`; };

function estadoBadge(estado?: string | null): { label: string; cls: string } {
    switch ((estado || '').toUpperCase()) {
        case 'COMPLETADO': case 'COMPLETED': return { label: 'Completado', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
        case 'IN_TRANSIT': case 'EN_RUTA_IDA': case 'EN_RUTA_VUELTA': return { label: 'En ruta', cls: 'text-blue-600 bg-blue-50 border-blue-200' };
        case 'EN_DESTINO': return { label: 'En destino', cls: 'text-blue-600 bg-blue-50 border-blue-200' };
        case 'PENDING': case 'PENDIENTE': return { label: 'Pendiente', cls: 'text-amber-600 bg-amber-50 border-amber-200' };
        default: return { label: estado || '—', cls: 'text-slate-500 bg-slate-50 border-slate-200' };
    }
}

export default function MiResumenPage() {
    const user = useAuthStore((s) => s.user);
    const { format } = useCurrency();
    const veFinanzas = !!(user as any)?.ve_finanzas;
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [chofer, setChofer] = useState<ResumenChofer | null>(null);
    const [consegnas, setConsegnas] = useState<Consegna[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [resRes, progRes, choferRes] = await Promise.all([
                api.get('/registros/mias/resumen').catch(() => null),
                api.get('/programacion', { params: { estados: 'PENDING,PENDIENTE,IN_TRANSIT,REPROGRAMADO', take: 5 } }).catch(() => null),
                api.get('/recorridos/mio/resumen').catch(() => null),
            ]);
            setResumen(resRes?.data ?? null);
            setChofer(choferRes?.data ?? null);
            const prog = progRes?.data;
            setConsegnas(Array.isArray(prog) ? prog : prog?.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const nombre = useMemo(() => (user?.nombre || user?.email?.split('@')[0] || 'Chofer').split(' ')[0], [user]);
    const mes = MESES[new Date().getMonth()];

    if (loading) {
        return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;
    }

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
            <div>
                <h1 className="text-2xl font-extrabold text-slate-800">Hola, {nombre}</h1>
                <p className="text-sm text-slate-500 capitalize">Tu resumen de {mes}</p>
            </div>

            {/* Entregas del mes */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3 text-slate-700 font-semibold"><Package size={16} className="text-blue-600" /> Entregas de <span className="capitalize">{mes}</span></div>
                <div className="grid grid-cols-4 gap-2">
                    <Tile label="Total" value={String(chofer?.entregas.total ?? 0)} color="text-slate-800" />
                    <Tile label="Entregadas" value={String(chofer?.entregas.entregadas ?? 0)} color="text-emerald-600" />
                    <Tile label="Canceladas" value={String(chofer?.entregas.canceladas ?? 0)} color="text-red-500" />
                    <Tile label="Pendientes" value={String(chofer?.entregas.pendientes ?? 0)} color="text-amber-500" />
                </div>
            </div>

            {/* Gastos del mes + bonifico/saldo */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3 text-slate-700 font-semibold"><Fuel size={16} className="text-blue-600" /> Gastos de <span className="capitalize">{mes}</span></div>
                <div className="grid grid-cols-4 gap-2">
                    <Tile label="Carburante" value={format(chofer?.gastos.combustible ?? 0)} color="text-sky-600" />
                    <Tile label="Peaje" value={format(chofer?.gastos.peajes ?? 0)} color="text-indigo-600" />
                    <Tile label="Spesa" value={format(chofer?.gastos.otros ?? 0)} color="text-amber-600" />
                    <Tile label="Total" value={format(chofer?.gastos.total ?? 0)} color="text-red-500" />
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Bonifico (adelanto)</span><span className="font-semibold text-slate-700">{format(chofer?.anticipo ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Total gastos</span><span className="font-semibold text-slate-700">− {format(chofer?.gastos.total ?? 0)}</span></div>
                    <div className="flex justify-between border-t border-slate-100 pt-1.5">
                        <span className={`font-extrabold ${(chofer?.saldo ?? 0) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{(chofer?.saldo ?? 0) < 0 ? 'Saldo (falta)' : 'Saldo a favor'}</span>
                        <span className={`font-extrabold ${(chofer?.saldo ?? 0) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{format(Math.abs(chofer?.saldo ?? 0))}</span>
                    </div>
                </div>
            </div>

            {/* Métricas (solo ve_finanzas) */}
            {veFinanzas && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric icon={<Clock size={16} className="text-blue-500" />} label="Horas día" value={horasLabel(resumen?.oreMattina ?? 0)} />
                    <Metric icon={<RouteIcon size={16} className="text-sky-500" />} label="Km del mes" value={`${resumen?.km ?? 0} km`} />
                    <Metric icon={<Moon size={16} className="text-indigo-500" />} label="Horas noche" value={horasLabel(resumen?.oreSera ?? 0)} />
                    <Metric icon={<ClipboardList size={16} className="text-emerald-500" />} label="Reperibilità" value={String(resumen?.reperibilita ?? 0)} />
                </div>
            )}

            {/* Accesos rápidos */}
            <div className="grid grid-cols-3 gap-2">
                <Quick href="/mi-ruta" icon={<Navigation size={20} className="text-blue-600" />} label="Mi Ruta" />
                <Quick href="/historial-mensual" icon={<MapPinned size={20} className="text-sky-600" />} label="Historial" />
                <Quick href="/mi-perfil" icon={<CircleUser size={20} className="text-indigo-600" />} label="Mi Perfil" />
            </div>

            {/* Consegnas asignadas */}
            <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Mis consegnas</h2>
                {consegnas.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500 text-sm">Sin consegnas pendientes.</div>
                ) : (
                    <div className="space-y-2">
                        {consegnas.map((cx) => {
                            const b = estadoBadge(cx.estado);
                            return (
                                <Link key={cx.id} href="/mis-consegnas" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 hover:border-blue-300">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-slate-800 truncate">{cx.cliente || cx.id_programacion || 'Consegna'}</div>
                                        <div className="text-xs text-slate-500 truncate">{(cx.lugar_retiro || '—')} → {(cx.lugar_entrega || '—')}</div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${b.cls}`}>{b.label}</span>
                                    <ChevronRight size={16} className="text-slate-300" />
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Partes recientes */}
            {!!resumen?.recientes?.length && (
                <div>
                    <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Mis partes recientes</h2>
                    <div className="space-y-2">
                        {resumen.recientes.map((r) => (
                            <Link key={r.id} href="/parte-diario" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 hover:border-blue-300">
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-slate-800 truncate">{new Date(r.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {r.operacion}{r.targa ? ` · ${r.targa}` : ''}</div>
                                    <div className="text-xs text-slate-500">{r.km} km · {horasLabel(r.oreMattina)} día + {horasLabel(r.oreSera)} noche</div>
                                </div>
                                <ChevronRight size={16} className="text-slate-300" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="rounded-xl bg-slate-50 py-2 px-1 text-center">
            <div className={`text-sm font-extrabold truncate ${color}`}>{value}</div>
            <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{label}</div>
        </div>
    );
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
            <div className="text-lg font-extrabold text-slate-800 mt-0.5">{value}</div>
        </div>
    );
}
function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-3 hover:border-blue-300 hover:shadow-sm transition">
            {icon}
            <span className="text-xs font-semibold text-slate-700">{label}</span>
        </Link>
    );
}
