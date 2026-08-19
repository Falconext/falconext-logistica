'use client';

// Vista de CHOFER: "Historial Mensual". Km, entregas y horas por cada mes; cada
// mes se despliega para ver su desglose y los recorridos que lo suman.
// GET /registros/mias/historial-mensual + /registros/mias/mes-detalle.
import { useCallback, useEffect, useState } from 'react';
import {
    History, Route as RouteIcon, Package, Clock, ChevronDown, ChevronUp,
    Sun, Moon, Bell, Timer, Loader2,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { useCurrency } from '../../lib/useCurrency';

interface Mes {
    anio: number; mes: number; label: string;
    km: number; entregas: number; oreTotal: number; oreDia: number; oreNoche: number;
    reperibilita: number; attesaHoras: number; recorridos: number;
    pagoHoras?: number; pagoReperibilita?: number; pagoAttesa?: number; gananciaTotal?: number;
}
interface DetItem { fecha: string; cliente: string; km: number; oreDia: number; oreNoche: number; }

const horasLabel = (h?: number) => {
    const v = Number(h); const safe = Number.isFinite(v) ? v : 0;
    const horas = Math.floor(safe); const min = Math.round((safe - horas) * 60);
    return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
};

export default function HistorialMensualPage() {
    const user = useAuthStore((s) => s.user);
    const { format } = useCurrency();
    const veFinanzas = !!(user as any)?.ve_finanzas;
    const [meses, setMeses] = useState<Mes[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detalle, setDetalle] = useState<Record<string, DetItem[] | 'loading'>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/registros/mias/historial-mensual', { params: { meses: 6 } });
            setMeses(Array.isArray(res.data?.meses) ? res.data.meses : []);
        } catch (e) {
            console.error('[historial-mensual]', e);
            setMeses([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggle = async (m: Mes) => {
        const key = `${m.anio}-${m.mes}`;
        if (expanded === key) { setExpanded(null); return; }
        setExpanded(key);
        if (!detalle[key]) {
            setDetalle((d) => ({ ...d, [key]: 'loading' }));
            try {
                const res = await api.get('/registros/mias/mes-detalle', { params: { anio: m.anio, mes: m.mes } });
                setDetalle((d) => ({ ...d, [key]: Array.isArray(res.data?.items) ? res.data.items : [] }));
            } catch {
                setDetalle((d) => ({ ...d, [key]: [] }));
            }
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-50 grid place-items-center text-blue-600"><History size={20} /></div>
                <div>
                    <h1 className="text-xl font-extrabold text-slate-800">Historial</h1>
                    <p className="text-sm text-slate-500">Tus km y entregas por mes</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-slate-500 p-6"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
            ) : meses.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                    <p className="font-semibold text-slate-700">Sin historial</p>
                    <p className="text-sm">Aún no hay meses con actividad registrada.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {meses.map((m) => {
                        const key = `${m.anio}-${m.mes}`;
                        const isOpen = expanded === key;
                        const det = detalle[key];
                        return (
                            <div key={key} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                <button onClick={() => toggle(m)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                                    <span className="font-extrabold text-slate-800 capitalize">{m.label}</span>
                                    {isOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                                </button>
                                <div className="px-4 pb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                                    <span className="flex items-center gap-1.5"><RouteIcon size={14} className="text-sky-500" /> {m.km} km</span>
                                    <span className="flex items-center gap-1.5"><Package size={14} className="text-emerald-500" /> {m.entregas} entregas</span>
                                    <span className="flex items-center gap-1.5"><Clock size={14} className="text-blue-500" /> {horasLabel(m.oreTotal)}</span>
                                </div>

                                {isOpen && (
                                    <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                                        <div className="text-xs font-bold text-slate-500 uppercase">¿Por qué este total?</div>
                                        <Break icon={<Sun size={14} className="text-amber-500" />} label="Horas día" value={`${horasLabel(m.oreDia)}${veFinanzas ? ` · ${format(m.pagoHoras ?? 0)}` : ''}`} />
                                        <Break icon={<Moon size={14} className="text-indigo-500" />} label="Horas noche" value={horasLabel(m.oreNoche)} />
                                        <Break icon={<Bell size={14} className="text-emerald-500" />} label="Reperibilità" value={`${m.reperibilita ?? 0}${veFinanzas ? ` · ${format(m.pagoReperibilita ?? 0)}` : ''}`} />
                                        <Break icon={<Timer size={14} className="text-sky-500" />} label="Attesa (autorizada)" value={`${horasLabel(m.attesaHoras)}${veFinanzas ? ` · ${format(m.pagoAttesa ?? 0)}` : ''}`} />
                                        {veFinanzas && m.gananciaTotal != null && (
                                            <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1">
                                                <span className="font-extrabold text-slate-800">Total</span>
                                                <span className="font-extrabold text-emerald-600">{format(m.gananciaTotal)}</span>
                                            </div>
                                        )}

                                        <div className="text-xs font-bold text-slate-500 uppercase pt-2">Recorridos ({m.recorridos ?? 0})</div>
                                        {det === 'loading' ? (
                                            <div className="flex items-center gap-2 text-slate-400 text-sm py-2"><Loader2 className="animate-spin" size={14} /> Cargando…</div>
                                        ) : det && det.length > 0 ? (
                                            <div className="divide-y divide-slate-100">
                                                {det.map((it, i) => (
                                                    <div key={i} className="py-2">
                                                        <div className="text-sm font-semibold text-slate-700 truncate">{it.cliente}</div>
                                                        <div className="text-xs text-slate-500">
                                                            {new Date(it.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {it.km} km · {horasLabel(Number(it.oreDia) + Number(it.oreNoche))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-slate-400 italic py-1">Sin recorridos este mes.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Break({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            {icon}
            <span className="flex-1 text-slate-700">{label}</span>
            <span className="font-semibold text-slate-700">{value}</span>
        </div>
    );
}
