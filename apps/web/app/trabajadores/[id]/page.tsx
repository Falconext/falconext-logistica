'use client';

import { useEffect, useState, useMemo } from 'react';
import api from '../../../lib/api';
import { Truck, FileText, Phone, Mail, MapPin, User, ArrowLeft, Fuel, Receipt, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { useCurrency } from '../../../lib/useCurrency';

interface HistorialData {
    rutas: any[];
    peajes: any[];
    combustible: any[];
}

const ITEMS_PER_PAGE = 15;

export default function TrabajadorDetailsPage() {
    const params = useParams();
    const id = params.id as string;
    const { format } = useCurrency();

    const [worker, setWorker] = useState<any>(null);
    const [historial, setHistorial] = useState<HistorialData>({ rutas: [], peajes: [], combustible: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'rutas' | 'peajes' | 'combustible'>('rutas');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedMonth, setSelectedMonth] = useState<string>('all');

    useEffect(() => {
        if (!id) return;
        async function fetchData() {
            try {
                const [resWorker, resHistory] = await Promise.all([
                    api.get(`/trabajadores/${id}`),
                    api.get(`/trabajadores/${id}/historial`)
                ]);
                setWorker(resWorker.data);
                setHistorial(resHistory.data);
            } catch (error) {
                console.error('Error fetching worker details:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [id]);

    // Reset page when tab or month changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, selectedMonth]);

    // Get current data based on active tab
    const currentData = useMemo(() => {
        if (activeTab === 'rutas') return historial.rutas || [];
        if (activeTab === 'peajes') return historial.peajes || [];
        return historial.combustible || [];
    }, [activeTab, historial]);

    // Get month key from date
    const getMonthKey = (dateStr: string | null) => {
        if (!dateStr) return 'sin-fecha';
        const date = new Date(dateStr);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    const formatMonthLabel = (key: string) => {
        if (key === 'sin-fecha') return 'Sin Fecha';
        const [year, month] = key.split('-');
        const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
            'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    };

    // Group data by month
    const monthGroups = useMemo(() => {
        const groups = new Map<string, number>();
        currentData.forEach(item => {
            const key = getMonthKey(item.fecha);
            groups.set(key, (groups.get(key) || 0) + 1);
        });
        return Array.from(groups.entries())
            .sort((a, b) => b[0].localeCompare(a[0])); // Most recent first
    }, [currentData]);

    // Filter by selected month
    const filteredData = useMemo(() => {
        if (selectedMonth === 'all') return currentData;
        return currentData.filter(item => getMonthKey(item.fecha) === selectedMonth);
    }, [currentData, selectedMonth]);

    // Pagination
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const paginatedData = filteredData.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const checkExpiration = (dateStr: string | null) => {
        if (!dateStr) return { status: 'MISSING', label: 'No Registrado', color: 'text-slate-400 bg-slate-100 dark:bg-slate-800' };
        const date = new Date(dateStr);
        const today = new Date();
        const thirtyDays = new Date();
        thirtyDays.setDate(today.getDate() + 30);
        if (date < today) return { status: 'EXPIRED', label: 'Vencido', color: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' };
        if (date < thirtyDays) return { status: 'WARNING', label: 'Por Vencer', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' };
        return { status: 'OK', label: 'Vigente', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' };
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="text-slate-500 animate-pulse">Cargando perfil del conductor...</div>
            </div>
        );
    }

    if (!worker) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Conductor no encontrado</h2>
                <Link href="/trabajadores" className="text-blue-600 hover:underline mt-2 inline-block">Volver a la lista</Link>
            </div>
        );
    }

    const tabs = [
        { id: 'rutas', label: 'Rutas', icon: Truck, count: historial.rutas?.length || 0 },
        { id: 'peajes', label: 'Peajes / Multas', icon: Receipt, count: historial.peajes?.length || 0 },
        { id: 'combustible', label: 'Combustible', icon: Fuel, count: historial.combustible?.length || 0 },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/trabajadores" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{worker.nombre_completo}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{worker.cargo} • {worker.nacionalidad} • <span className="font-mono text-blue-600 dark:text-blue-400">{worker.id_trabajador}</span></p>
                </div>
                <div className="ml-auto">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${worker.estado_laboral === 'Activo'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                        {worker.estado_laboral}
                    </span>
                </div>
            </div>

            <div className="flex gap-6 h-[calc(100vh-180px)]">
                {/* Left Sidebar: Profile + Months */}
                <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
                    {/* Worker Card */}
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 overflow-hidden border-2 border-slate-50 dark:border-slate-900">
                                {worker.url_foto ? (
                                    <img src={worker.url_foto} alt={worker.nombre_completo} className="w-full h-full object-cover" />
                                ) : (
                                    <User size={28} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 dark:text-white truncate">{worker.nombre_completo}</div>
                                <div className="text-xs text-slate-500">{worker.cargo}</div>
                            </div>
                        </div>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Phone size={12} /> {worker.telefono || '-'}
                            </div>
                            <div className="flex items-center gap-2 text-slate-500">
                                <Mail size={12} /> {worker.email_personal || '-'}
                            </div>
                            <div className="flex items-center gap-2 text-slate-500">
                                <MapPin size={12} /> {worker.area_trabajo || '-'}
                            </div>
                        </div>
                    </div>

                    {/* Documents */}
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <FileText size={14} className="text-blue-500" /> Documentación
                        </h3>
                        <div className="space-y-2">
                            {[
                                { label: 'Licencia', date: worker.fecha_vencimiento_licencia },
                                { label: 'Pasaporte', date: worker.fecha_vencimiento_pasaporte },
                                { label: 'Residencia', date: worker.fecha_vencimiento_residencia },
                            ].map((doc) => {
                                const status = checkExpiration(doc.date);
                                return (
                                    <div key={doc.label} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-600 dark:text-slate-300">{doc.label}</span>
                                        <span className={`font-bold px-2 py-0.5 rounded ${status.color}`}>{status.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Month Navigation */}
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex-1 overflow-y-auto">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <Calendar size={14} className="text-purple-500" /> Navegación
                        </h3>
                        <div className="space-y-1">
                            <button
                                onClick={() => setSelectedMonth('all')}
                                className={clsx(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition",
                                    selectedMonth === 'all'
                                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                )}
                            >
                                <span>Todos los registros</span>
                                <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">{currentData.length}</span>
                            </button>
                            {monthGroups.map(([month, count]) => (
                                <button
                                    key={month}
                                    onClick={() => setSelectedMonth(month)}
                                    className={clsx(
                                        "w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition",
                                        selectedMonth === month
                                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    )}
                                >
                                    <span>{formatMonthLabel(month)}</span>
                                    <span className="text-xs text-slate-400">{count}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {/* Tab Navigation */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={clsx(
                                    "flex-1 px-4 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2",
                                    activeTab === tab.id
                                        ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                )}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-full text-xs font-bold",
                                    activeTab === tab.id
                                        ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                )}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Header with info */}
                    <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">
                                Mostrando {paginatedData.length} de {filteredData.length} registros
                                {selectedMonth !== 'all' && ` • ${formatMonthLabel(selectedMonth)}`}
                            </span>
                        </div>
                    </div>

                    {/* Table Content */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Rutas Table */}
                        {activeTab === 'rutas' && (
                            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Fecha</th>
                                        <th className="px-6 py-3">Vehículo</th>
                                        <th className="px-6 py-3">Cliente</th>
                                        <th className="px-6 py-3">Destino</th>
                                        <th className="px-6 py-3">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {paginatedData.length === 0 ? (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No hay registros.</td></tr>
                                    ) : (
                                        paginatedData.map((route: any) => (
                                            <tr key={route.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200">
                                                    {new Date(route.fecha).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Truck size={14} className="text-slate-400" />
                                                        {route.vehiculo_id || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">{route.cliente}</td>
                                                <td className="px-6 py-3 text-xs max-w-[200px] truncate">{route.lugar_entrega}</td>
                                                <td className="px-6 py-3">
                                                    <span className={clsx(
                                                        "px-2 py-1 rounded-full text-xs font-bold",
                                                        route.estado === 'ENTREGADO' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                                            route.estado === 'ANULADO' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                                                "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                    )}>
                                                        {route.estado}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}

                        {/* Peajes Table */}
                        {activeTab === 'peajes' && (
                            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Fecha</th>
                                        <th className="px-6 py-3">Vehículo</th>
                                        <th className="px-6 py-3">Monto</th>
                                        <th className="px-6 py-3">Mes</th>
                                        <th className="px-6 py-3">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {paginatedData.length === 0 ? (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No hay registros.</td></tr>
                                    ) : (
                                        paginatedData.map((peaje: any) => (
                                            <tr key={peaje.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200">
                                                    {peaje.fecha ? new Date(peaje.fecha).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Truck size={14} className="text-slate-400" />
                                                        {peaje.targa || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className="font-bold text-amber-600 dark:text-amber-400">{format(peaje.monto)}</span>
                                                </td>
                                                <td className="px-6 py-3 text-xs">{peaje.mes}</td>
                                                <td className="px-6 py-3">
                                                    <span className={clsx(
                                                        "px-2 py-1 rounded-full text-xs font-bold",
                                                        peaje.estado?.includes('PAGADO') ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                    )}>
                                                        {peaje.estado || 'PENDIENTE'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}

                        {/* Combustible Table */}
                        {activeTab === 'combustible' && (
                            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Fecha</th>
                                        <th className="px-6 py-3">Vehículo</th>
                                        <th className="px-6 py-3">Monto</th>
                                        <th className="px-6 py-3">Método</th>
                                        <th className="px-6 py-3">Área</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {paginatedData.length === 0 ? (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No hay registros.</td></tr>
                                    ) : (
                                        paginatedData.map((fuel: any) => (
                                            <tr key={fuel.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200">
                                                    {fuel.fecha ? new Date(fuel.fecha).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Truck size={14} className="text-slate-400" />
                                                        {fuel.targa || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{format(fuel.monto)}</span>
                                                </td>
                                                <td className="px-6 py-3 text-xs">{fuel.metodo || '-'}</td>
                                                <td className="px-6 py-3">
                                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                        {fuel.area || '-'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-sm text-slate-600 dark:text-slate-400 px-4">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
