
'use client';

import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Trabajador } from '../../types';
import { User, Shield, Phone, Mail, MoreHorizontal, LayoutGrid, Table } from 'lucide-react';
import clsx from 'clsx';

export default function TrabajadoresPage() {
    const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'grid' | 'table'>('grid');

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await api.get('/trabajadores');
                setTrabajadores(res.data);
            } catch (error) {
                console.error('Error fetching workers:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="text-slate-500 animate-pulse">Cargando directorio...</div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6 transition-colors">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Directorio de Personal</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Mostrando {trabajadores.length} miembros del equipo
                    </p>
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
                        + Nuevo Miembro
                    </button>
                </div>
            </div>

            {/* Grid View */}
            {view === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {trabajadores.map((worker) => (
                        <div key={worker.id} className="group relative bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-blue-500/50 shadow-sm transition-all duration-300 overflow-hidden">
                            {/* Hover Gradient Effect */}
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative p-6 space-y-6">
                                {/* Profile Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex gap-4">
                                        <div className="relative">
                                            <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 overflow-hidden">
                                                {worker.url_foto ? (
                                                    <img src={worker.url_foto} alt={worker.nombre_completo} className="h-full w-full object-cover" />
                                                ) : (
                                                    <User size={24} />
                                                )}
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white dark:border-[#0f172a] ${worker.estado_laboral === 'Activo' ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{worker.nombre_completo}</h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{worker.cargo}</p>
                                        </div>
                                    </div>
                                    <button className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                        <MoreHorizontal size={20} />
                                    </button>
                                </div>

                                {/* Status Badge */}
                                <div className="flex flex-wrap gap-2">
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${worker.estado_laboral === 'Activo'
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                        }`}>
                                        {worker.estado_laboral?.toUpperCase()}
                                    </span>
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                        {worker.nacionalidad || 'Sin nacionalidad'}
                                    </span>
                                </div>

                                {/* Divider */}
                                <div className="h-px bg-slate-100 dark:bg-slate-800" />

                                {/* Contact Info */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                                        <Shield size={16} className="text-blue-500" />
                                        <span className="font-mono text-xs tracking-wide bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">{worker.id_trabajador || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                                        <Phone size={16} className="text-slate-400 dark:text-slate-600" />
                                        <span>{worker.telefono || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                                        <Mail size={16} className="text-slate-400 dark:text-slate-600" />
                                        <span className="truncate">{worker.email_personal || '-'}</span>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="pt-2 flex gap-2">
                                    <button className="flex-1 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition">
                                        Ver Perfil
                                    </button>
                                    <button className="flex-1 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition">
                                        Documentos
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Table View */}
            {view === 'table' && (
                <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Empleado</th>
                                    <th className="px-6 py-4">ID / Cargo</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4">Contacto</th>
                                    <th className="px-6 py-4">Documentos</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {trabajadores.map((worker) => (
                                    <tr key={worker.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                                    {worker.url_foto ? <img src={worker.url_foto} className="h-full w-full object-cover" /> : <User size={16} />}
                                                </div>
                                                <div className="font-medium text-slate-900 dark:text-white">{worker.nombre_completo}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-mono text-xs text-blue-600 dark:text-blue-400">{worker.id_trabajador}</div>
                                            <div className="text-xs">{worker.cargo}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${worker.estado_laboral === 'Activo'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                                }`}>
                                                {worker.estado_laboral}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-xs">
                                                <div className="flex items-center gap-2"><Phone size={12} /> {worker.telefono || '-'}</div>
                                                <div className="flex items-center gap-2"><Mail size={12} /> {worker.email_personal || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                {worker.fecha_vencimiento_licencia && <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] border border-slate-200 dark:border-slate-700">Licencia</span>}
                                                {worker.fecha_vencimiento_pasaporte && <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] border border-slate-200 dark:border-slate-700">Pasaporte</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                                <MoreHorizontal size={18} />
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
