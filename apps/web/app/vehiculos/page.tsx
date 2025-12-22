
'use client';

import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Vehiculo } from '../../types';
import { Truck, Calendar, FileText, AlertCircle, MoreVertical, LayoutGrid, Table, Shield } from 'lucide-react';
import clsx from 'clsx';

export default function VehiculosPage() {
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'grid' | 'table'>('table'); // Default to table for vehicles

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await api.get('/vehiculos');
                setVehiculos(res.data);
            } catch (error) {
                console.error('Error fetching vehicles:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="text-slate-500 animate-pulse">Cargando flota...</div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6 transition-colors">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Flota de Vehículos</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Gestión de {vehiculos.length} unidades de transporte.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                        <button
                            onClick={() => setView('grid')}
                            className={clsx(
                                "p-2 rounded-md transition-all",
                                view === 'grid'
                                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setView('table')}
                            className={clsx(
                                "p-2 rounded-md transition-all",
                                view === 'table'
                                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}
                        >
                            <Table size={18} />
                        </button>
                    </div>
                    <button className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95">
                        + Nuevo Vehículo
                    </button>
                </div>
            </div>

            {/* Grid View */}
            {view === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {vehiculos.map((vehiculo) => (
                        <div key={vehiculo.id} className="group bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 p-6 space-y-6 transition-all duration-300 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div className="flex gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                        <Truck size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{vehiculo.placa}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{vehiculo.marca_modelo}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-semibold border ${vehiculo.estado_vehiculo === 'ACTIVO'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                    }`}>
                                    {vehiculo.estado_vehiculo || 'DESCONOCIDO'}
                                </span>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Tipo</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{vehiculo.tipo_unidad || '-'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Seguro</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{vehiculo.poliza_seguro || '-'}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                                <button className="flex-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Ver Detalles</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {/* Table View */}
            {view === 'table' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Vehículo</th>
                                    <th className="px-6 py-4">Año / Tipo</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4">Documentación</th>
                                    <th className="px-6 py-4">Mantenimiento</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {vehiculos.map((v) => (
                                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                    <Truck size={18} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 dark:text-white">{v.placa}</div>
                                                    <div className="text-xs">{v.marca_modelo}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-900 dark:text-slate-200">{v.anio_fabricacion || '-'}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-500">{v.tipo_unidad}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${v.estado_vehiculo === 'ACTIVO'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                                }`}>
                                                {v.estado_vehiculo || 'DESCONOCIDO'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <FileText size={12} className="text-slate-400" />
                                                    {v.tarjeta_circulacion ? 'Circulación OK' : <span className="text-red-400">Falta Circulación</span>}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <Shield size={12} className="text-slate-400" />
                                                    {v.poliza_seguro ? 'Seguro Vigente' : <span className="text-red-400">Sin Seguro</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                <AlertCircle size={12} />
                                                <span>Rev. Técnica: {v.revision_tecnica || 'Pendiente'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                                <MoreVertical size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
