
'use client';

import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Programacion } from '../../types';
import {
    Calendar, MapPin, Clock, User, Truck, CheckCircle2,
    Search, Filter, PlayCircle
} from 'lucide-react';

export default function OperacionesPage() {
    const [rutas, setRutas] = useState<Programacion[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await api.get('/programacion');
                setRutas(res.data);
            } catch (error) {
                console.error('Error fetching operations:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="text-slate-500 animate-pulse">Cargando operaciones...</div>
            </div>
        );
    }

    // Group by date simply for now (or list)
    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6 transition-colors">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Operaciones Diarias</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Programación de rutas y entregas ({rutas.length})
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar ruta, conductor..."
                            className="pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                        />
                    </div>
                    <button className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">
                        <Filter size={20} />
                    </button>
                    <button className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 font-medium shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                        <PlayCircle size={20} />
                        Nueva Ruta
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Fecha / ID</th>
                                <th className="px-6 py-4">Recurso Asignado</th>
                                <th className="px-6 py-4">Ruta</th>
                                <th className="px-6 py-4">Horarios</th>
                                <th className="px-6 py-4">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rutas.map((ruta) => (
                                <tr key={ruta.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-900 dark:text-white">
                                                {new Date(ruta.fecha).toLocaleDateString()}
                                            </span>
                                            <span className="text-xs font-mono text-slate-400">{ruta.id_programacion?.substring(0, 8)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                                                <User size={14} className="text-blue-500" />
                                                <span>{ruta.trabajador_id || 'Sin Asignar'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Truck size={14} className="text-amber-500" />
                                                <span>{ruta.vehiculo_id || 'Sin Vehículo'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 max-w-xs">
                                        <div className="space-y-1">
                                            <div className="flex items-start gap-2">
                                                <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                                <span className="text-slate-900 dark:text-white truncate">{ruta.lugar_retiro || 'Origen Desconocido'}</span>
                                            </div>
                                            <div className="flex items-start gap-2 pl-[3px]">
                                                <div className="w-0.5 h-3 bg-slate-200 dark:bg-slate-700 ml-1" />
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <div className="mt-1 h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                                                <span className="text-slate-600 dark:text-slate-400 truncate">{ruta.lugar_entrega || 'Destino Desconocido'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded w-fit">
                                            <Clock size={12} />
                                            {ruta.hora_retiro ? `${Number(ruta.hora_retiro).toFixed(2)}h` : '--:--'}
                                        </div>
                                        <div className="text-xs text-slate-400 mt-1 pl-1">ETA: {ruta.eta || '?'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                                            <CheckCircle2 size={12} />
                                            Programado
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
