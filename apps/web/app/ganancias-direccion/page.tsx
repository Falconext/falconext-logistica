'use client';

// Vista de DIRECCIÓN: "Ganancias". Cuánto va ganando cada chofer/supervisor en el
// mes (horas × tarifa + reperibilità). Solo roles con ve_finanzas; el backend
// bloquea el acceso si el rol no ve finanzas. GET /registros/direccion/resumen.
import { useCallback, useEffect, useState } from 'react';
import { Wallet, Clock, Route as RouteIcon, Bell, Loader2, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { useCurrency } from '../../lib/useCurrency';

interface Fila {
    trabajadorId: string;
    nombre: string;
    cargo?: string | null;
    km: number;
    oreDia: number;
    oreNoche: number;
    oreTotal: number;
    reperibilita: number;
    pagoHoras: number;
    pagoReperibilita: number;
    gananciaTotal: number;
}
interface Data { moneda: string; totalPagar: number; choferes: Fila[]; }

const horasLabel = (h: number) => {
    const horas = Math.floor(h);
    const min = Math.round((h - horas) * 60);
    return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
};

export default function GananciasDireccionPage() {
    const { format } = useCurrency();
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/registros/direccion/resumen');
            setData(res.data ?? null);
        } catch (e) {
            console.error('[ganancias-direccion]', e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center text-emerald-600"><Wallet size={20} /></div>
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Ganancias</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Cuánto va ganando cada chofer/supervisor</p>
                    </div>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50">
                    <RefreshCw size={15} /> Actualizar
                </button>
            </div>

            {/* Total a pagar */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <div className="text-sm text-slate-500 dark:text-slate-400">Total a pagar (mes)</div>
                <div className="text-3xl font-extrabold text-emerald-600 mt-1">{format(data?.totalPagar ?? 0)}</div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 p-6"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
            ) : !data?.choferes?.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-10 text-center text-slate-500 dark:text-slate-400">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">Sin actividad</p>
                    <p className="text-sm">Aún no hay recorridos ni reperibilità este mes.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {data.choferes.map((f) => (
                        <div key={f.trabajadorId} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{f.nombre}</div>
                                    {f.cargo && <div className="text-xs text-slate-500 dark:text-slate-400">{f.cargo}</div>}
                                </div>
                                <div className="text-lg font-extrabold text-emerald-600">{format(f.gananciaTotal)}</div>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                                <span className="flex items-center gap-1.5"><Clock size={14} className="text-blue-500" /> {horasLabel(f.oreDia)} día · {horasLabel(f.oreNoche)} noche</span>
                                <span className="flex items-center gap-1.5"><RouteIcon size={14} className="text-sky-500" /> {f.km} km</span>
                                <span className="flex items-center gap-1.5"><Bell size={14} className="text-emerald-500" /> Reperibilità: {f.reperibilita} (+{format(f.pagoReperibilita)})</span>
                                <span className="text-slate-500 dark:text-slate-400">Pago horas: {format(f.pagoHoras)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
