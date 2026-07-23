'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../lib/api';
import { Vehiculo } from '../../../types';
import { Truck, Calendar, FileText, Shield, Wrench, ArrowLeft, Clock, DollarSign, MapPin, AlertTriangle, CheckCircle2, Edit2, X, Save, Camera, Trash2, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useCurrency } from '../../../lib/useCurrency';
import FileUpload from '../../../components/FileUpload';
import DocumentosPanel from '../../../components/DocumentosPanel';
import { VEHICULO_DOCS } from '../../../components/documentTypes';
import VehiculoModal from '../VehiculoModal';

interface Mantenimiento {
    id: string;
    tipo: string;
    fecha: string;
    descripcion: string;
    costo: number;
    taller: string;
    kilometraje: number | null;
}

export default function VehiculoDetailPage() {
    const params = useParams();
    const vehiculoId = params.id as string;

    const { format } = useCurrency();

    const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
    const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'info' | 'historial' | 'documentos'>('historial');

    // Edit modal state
    const [editingMant, setEditingMant] = useState<Mantenimiento | null>(null);
    const [editCosto, setEditCosto] = useState('');
    const [saving, setSaving] = useState(false);

    // Vehicle edit modal
    const [editVehiculoOpen, setEditVehiculoOpen] = useState(false);

    // Foto
    const [savingFoto, setSavingFoto] = useState(false);

    const handleFotoChange = async (url: string) => {
        if (!vehiculo) return;
        setSavingFoto(true);
        try {
            await api.patch(`/vehiculos/${vehiculo.id}`, { url_foto: url });
            setVehiculo({ ...vehiculo, url_foto: url });
            toast.success('Foto actualizada');
        } catch (error) {
            toast.error('Error al guardar la foto');
        } finally {
            setSavingFoto(false);
        }
    };

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(mantenimientos.length / itemsPerPage);
    const paginatedMantenimientos = mantenimientos.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleEditClick = (mant: Mantenimiento) => {
        setEditingMant(mant);
        setEditCosto(mant.costo?.toString() || '0');
    };

    const handleSaveCosto = async () => {
        if (!editingMant) return;
        setSaving(true);
        try {
            await api.patch(`/mantenimiento/${editingMant.id}`, { costo: parseFloat(editCosto) });
            setMantenimientos(prev => prev.map(m =>
                m.id === editingMant.id ? { ...m, costo: parseFloat(editCosto) } : m
            ));
            toast.success('Costo actualizado correctamente');
            setEditingMant(null);
        } catch (error) {
            toast.error('Error al actualizar el costo');
        } finally {
            setSaving(false);
        }
    };

    const refetchVehiculo = async () => {
        try {
            const res = await api.get(`/vehiculos/${vehiculoId}`);
            setVehiculo(res.data);
        } catch (error) {
            console.error('Error refetching vehicle:', error);
        }
    };

    useEffect(() => {
        async function fetchData() {
            try {
                const [vehiculoRes, mantenimientoRes] = await Promise.all([
                    api.get(`/vehiculos/${vehiculoId}`),
                    api.get(`/mantenimiento/vehiculo/${vehiculoId}`)
                ]);
                setVehiculo(vehiculoRes.data);
                setMantenimientos(mantenimientoRes.data);
            } catch (error) {
                console.error('Error fetching vehicle data:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [vehiculoId]);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin"></div>
                    <span className="text-slate-500">Cargando vehículo...</span>
                </div>
            </div>
        );
    }

    if (!vehiculo) {
        return (
            <div className="text-center py-12">
                <AlertTriangle className="mx-auto text-amber-500 mb-4" size={48} />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Vehículo no encontrado</h2>
                <Link href="/vehiculos" className="text-blue-600 hover:underline mt-2 inline-block">
                    ← Volver a la lista
                </Link>
            </div>
        );
    }

    const totalCosto = mantenimientos.reduce((sum, m) => sum + (m.costo || 0), 0);
    const tipoConfig: Record<string, { color: string; icon: string }> = {
        'Preventivo': { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', icon: '🔧' },
        'Correctivo': { color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: '⚠️' },
        'Emergencia': { color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', icon: '🚨' },
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div className="flex items-center gap-4">
                    <Link
                        href="/vehiculos"
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    {vehiculo.url_foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={vehiculo.url_foto}
                            alt={vehiculo.placa}
                            className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                        />
                    ) : (
                        <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                            <Truck size={28} />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            {vehiculo.placa}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400">
                            {vehiculo.marca_modelo || 'Sin marca/modelo'} • {vehiculo.tipo_unidad || 'Sin tipo'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        "px-4 py-2 rounded-full text-sm font-bold",
                        (vehiculo.estado_vehiculo === 'Activo' || vehiculo.estado_vehiculo === 'ACTIVO')
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                    )}>
                        {vehiculo.estado_vehiculo || 'Sin estado'}
                    </div>
                    <button
                        onClick={() => setEditVehiculoOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition"
                    >
                        <Edit2 size={16} /> Editar
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                            <Wrench size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold">Mantenimientos</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{mantenimientos.length}</p>
                        </div>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold">Costo Total</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                {format(totalCosto)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold">Año</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                {vehiculo.anio_fabricacion || '-'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                            <Shield size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold">Seguro</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {vehiculo.fecha_vencimiento_seguro
                                    ? new Date(vehiculo.fecha_vencimiento_seguro).toLocaleDateString()
                                    : 'Sin fecha'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('historial')}
                    className={clsx(
                        "px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap",
                        activeTab === 'historial'
                            ? "border-purple-500 text-purple-600 dark:text-purple-400"
                            : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    🔧 Historial de Mantenimiento
                </button>
                <button
                    onClick={() => setActiveTab('info')}
                    className={clsx(
                        "px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap",
                        activeTab === 'info'
                            ? "border-purple-500 text-purple-600 dark:text-purple-400"
                            : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    📋 Información del Vehículo
                </button>
                <button
                    onClick={() => setActiveTab('documentos')}
                    className={clsx(
                        "px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap",
                        activeTab === 'documentos'
                            ? "border-purple-500 text-purple-600 dark:text-purple-400"
                            : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    📎 Fotos y Documentos
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'historial' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {mantenimientos.length === 0 ? (
                        <div className="text-center py-12">
                            <Wrench className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sin historial de mantenimiento</h3>
                            <p className="text-slate-500 mt-1">Este vehículo no tiene registros de mantenimiento.</p>
                        </div>
                    ) : (
                        <>
                            {/* Info Banner */}
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/30 text-sm text-blue-700 dark:text-blue-300">
                                ℹ️ Algunos costos aparecen en cero porque el Excel no incluye esa columna. Puedes editar cada registro para agregar el costo.
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <tr>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fecha</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descripción</th>
                                            <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taller</th>
                                            <th className="text-right px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kilometraje</th>
                                            <th className="text-right px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Costo</th>
                                            <th className="text-center px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {paginatedMantenimientos.map((mant) => {
                                            const config = tipoConfig[mant.tipo] || tipoConfig['Correctivo'];
                                            return (
                                                <tr key={mant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                                                            {new Date(mant.fecha).toLocaleDateString('es-ES', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={clsx(
                                                            "px-2.5 py-1 rounded-full text-xs font-bold",
                                                            config.color
                                                        )}>
                                                            {config.icon} {mant.tipo}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <p className="text-sm text-slate-700 dark:text-slate-300 max-w-md truncate">
                                                            {mant.descripcion || 'Sin descripción'}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm text-slate-500 dark:text-slate-400">
                                                            {mant.taller || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className="text-sm font-mono text-slate-600 dark:text-slate-300">
                                                            {mant.kilometraje ? `${mant.kilometraje.toLocaleString()} km` : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={clsx(
                                                            "text-sm font-bold",
                                                            mant.costo > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                                                        )}>
                                                            {format(mant.costo || 0)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        <button
                                                            onClick={() => handleEditClick(mant)}
                                                            className="p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 transition"
                                                            title="Editar costo"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/30">
                                    <p className="text-sm text-slate-500">
                                        Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, mantenimientos.length)} de {mantenimientos.length} registros
                                    </p>
                                    <div className="flex items-center flex-wrap gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                        >
                                            Anterior
                                        </button>
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={clsx(
                                                    "w-8 h-8 rounded-lg text-sm font-medium transition",
                                                    currentPage === page
                                                        ? "bg-purple-600 text-white"
                                                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                                                )}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeTab === 'info' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                                Información General
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Placa</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.placa}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Marca/Modelo</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.marca_modelo || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Año</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.anio_fabricacion || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Tipo de Unidad</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.tipo_unidad || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Estado</span>
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded text-xs font-bold",
                                        vehiculo.estado_vehiculo === 'Activo'
                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                    )}>
                                        {vehiculo.estado_vehiculo || '-'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                                Documentación
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Tarjeta Circulación</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.tarjeta_circulacion || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Póliza de Seguro</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.poliza_seguro || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Venc. Seguro</span>
                                    <span className={clsx(
                                        "font-medium",
                                        vehiculo.fecha_vencimiento_seguro && new Date(vehiculo.fecha_vencimiento_seguro) < new Date()
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-slate-900 dark:text-white"
                                    )}>
                                        {vehiculo.fecha_vencimiento_seguro
                                            ? new Date(vehiculo.fecha_vencimiento_seguro).toLocaleDateString()
                                            : '-'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Revisión Técnica</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{vehiculo.revision_tecnica || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Kilometraje Actual</span>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        {vehiculo.kilometraje_actual?.toLocaleString() || '0'} km
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'documentos' && (
                <div className="space-y-6">
                    {/* Foto del vehículo */}
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                        <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
                            <Camera size={18} className="text-purple-500" /> Foto de la unidad
                        </h3>
                        <div className="flex items-center gap-4">
                            <FileUpload
                                variant="avatar"
                                accept="image/*"
                                label="Subir foto"
                                value={vehiculo.url_foto || null}
                                onChange={handleFotoChange}
                                onClear={() => handleFotoChange('')}
                            />
                            {savingFoto && (
                                <span className="flex items-center gap-2 text-sm text-slate-500">
                                    <Loader2 className="animate-spin" size={16} /> Guardando...
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Documentos del vehículo (subir/previsualizar PDFs + vencimientos) */}
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 px-6 pt-5 pb-3 flex items-center gap-2">
                            <FileText size={18} className="text-purple-500" /> Documentos del vehículo
                        </h3>
                        <DocumentosPanel entidad="VEHICULO" entidadId={vehiculo.id} docTypes={VEHICULO_DOCS} />
                    </div>
                </div>
            )}

            {/* Vehicle Edit Modal */}
            <VehiculoModal
                isOpen={editVehiculoOpen}
                onClose={() => setEditVehiculoOpen(false)}
                onSuccess={(saved) => (saved ? setVehiculo(saved) : refetchVehiculo())}
                initialData={vehiculo}
            />

            {/* Edit Cost Modal */}
            {editingMant && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0f172a] rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <DollarSign size={20} className="text-emerald-500" />
                                Editar Costo
                            </h3>
                            <button
                                onClick={() => setEditingMant(null)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition text-slate-500"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Mantenimiento</p>
                                <p className="text-sm text-slate-900 dark:text-white font-medium">
                                    {editingMant.descripcion || 'Sin descripción'}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {new Date(editingMant.fecha).toLocaleDateString('es-ES', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Costo
                                </label>
                                <input
                                    type="number"
                                    value={editCosto}
                                    onChange={(e) => setEditCosto(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-lg font-bold"
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 bg-slate-50 dark:bg-slate-900/50">
                            <button
                                onClick={() => setEditingMant(null)}
                                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveCosto}
                                disabled={saving}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? (
                                    <span>Guardando...</span>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        <span>Guardar</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
