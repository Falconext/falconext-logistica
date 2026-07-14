'use client';

import { useState, useEffect } from 'react';
import { X, Save, Loader2, MapPin, Calendar, Clock, User, Truck, FileText } from 'lucide-react';
import { Programacion } from '../../types';
import api from '../../lib/api';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { toast } from 'sonner';

interface NewRouteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: Programacion | null;
}

export default function NewRouteModal({ isOpen, onClose, onSuccess, initialData }: NewRouteModalProps) {
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(false); // Added

    // Initial state with separate Date/Time for Pickup (Retiro) and Delivery (Entrega)
    const [formData, setFormData] = useState({
        // Resources
        vehiculo_id: '',
        trabajador_id: '',
        cliente: '',

        // Pickup
        retiro_lugar: '',
        retiro_fecha: new Date().toISOString().split('T')[0],
        retiro_hora: '',

        // Delivery
        entrega_lugar: '',
        entrega_fecha: new Date().toISOString().split('T')[0],
        entrega_hora: '',

        nota: ''
    });

    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                try {
                    const [vRes, wRes] = await Promise.all([
                        api.get('/vehiculos'),
                        api.get('/trabajadores')
                    ]);
                    setVehicles(vRes.data);
                    setWorkers(wRes.data);
                } catch (error) {
                    toast.error('Error cargando recursos');
                }
            };
            fetchData();
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // Combine Date + Time for ISO
            const fechaRetiroIso = new Date(`${formData.retiro_fecha}T${formData.retiro_hora || '00:00'}:00`).toISOString();

            // For Delivery, we might not have a separate time input in UI yet, but let's be safe.
            // If explicit time added later, use it. For now default to end of day or similar if needed, 
            // but relying on what we have.
            const fechaEntregaIso = formData.entrega_fecha ? new Date(`${formData.entrega_fecha}T${formData.entrega_hora || '23:59'}:00`).toISOString() : null;

            const payload = {
                vehiculo_id: formData.vehiculo_id,
                trabajador_id: formData.trabajador_id,
                cliente: formData.cliente,
                lugar_retiro: formData.retiro_lugar,
                fecha_retiro: fechaRetiroIso,
                hora_retiro: formData.retiro_hora, // Legacy support
                lugar_entrega: formData.entrega_lugar,
                fecha_entrega: fechaEntregaIso,
                nota: formData.nota
            };

            if (initialData?.id) {
                // EDIT MODE
                await api.patch(`/programacion/${initialData.id}`, payload);
                toast.success('Ruta actualizada exitosamente');
            } else {
                // CREATE MODE
                await api.post('/programacion', payload);
                toast.success('Ruta creada exitosamente');
            }

            onSuccess();
            onClose();
            // Reset form
            setFormData({
                vehiculo_id: '',
                trabajador_id: '',
                cliente: '',
                retiro_lugar: '',
                retiro_fecha: '',
                retiro_hora: '',
                entrega_lugar: '',
                entrega_fecha: '',
                entrega_hora: '',
                nota: ''
            });

        } catch (error: any) {
            console.error(error);
            toast.error(initialData ? 'Error al actualizar ruta' : 'Error al crear ruta');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nueva Ruta</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Programar viaje y asignar recursos</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-8 flex-1 overflow-y-auto">

                    {/* 1. Resources & Client */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <Truck size={18} className="text-blue-500" />
                            <span>Recursos y Cliente</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select
                                label="Vehículo"
                                placeholder="-- Seleccionar --"
                                value={formData.vehiculo_id}
                                onChange={(v) => setFormData({ ...formData, vehiculo_id: v })}
                                options={vehicles.map(v => ({ value: v.placa, label: `${v.placa} (${v.marca_modelo})` }))}
                            />
                            <Select
                                label="Conductor"
                                placeholder="-- Seleccionar --"
                                value={formData.trabajador_id}
                                onChange={(v) => setFormData({ ...formData, trabajador_id: v })}
                                options={workers.map(w => ({ value: w.nombre_completo, label: w.nombre_completo }))}
                            />
                            <div className="col-span-1 md:col-span-2 space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Cliente / Destinatario</label>
                                <input
                                    type="text"
                                    placeholder="Nombre del cliente"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.cliente}
                                    onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 2. Itinerary (Split Cards for Pickup/Delivery) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <MapPin size={18} className="text-blue-500" />
                            <span>Itinerario de Ruta</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* ORIGIN (RETIRO) */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                <h4 className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold mb-4">
                                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg"><MapPin size={16} /></div>
                                    Origen (Retiro)
                                </h4>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Dirección</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej: Av. Javier Prado Este 4200, Surco"
                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                            value={formData.retiro_lugar}
                                            onChange={(e) => setFormData({ ...formData, retiro_lugar: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <DatePicker
                                                label="Fecha"
                                                value={formData.retiro_fecha}
                                                onChange={(v) => setFormData({ ...formData, retiro_fecha: v })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                                value={formData.retiro_hora}
                                                onChange={(e) => setFormData({ ...formData, retiro_hora: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* DESTINATION (ENTREGA) */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 relative overflow-hidden group hover:border-red-500/30 transition-colors">
                                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                                <h4 className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold mb-4">
                                    <div className="bg-red-100 dark:bg-red-900/30 p-1.5 rounded-lg"><MapPin size={16} /></div>
                                    Destino (Entrega)
                                </h4>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Dirección</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej: Aeropuerto Jorge Chávez, Callao"
                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                            value={formData.entrega_lugar}
                                            onChange={(e) => setFormData({ ...formData, entrega_lugar: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <DatePicker
                                                label="Fecha"
                                                value={formData.entrega_fecha}
                                                onChange={(v) => setFormData({ ...formData, entrega_fecha: v })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                                value={formData.entrega_hora}
                                                onChange={(e) => setFormData({ ...formData, entrega_hora: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Notes */}
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <FileText size={16} /> Notas Adicionales
                            </label>
                            <textarea
                                rows={2}
                                placeholder="Instrucciones especiales para el conductor..."
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-900 dark:text-white resize-none text-sm"
                                value={formData.nota}
                                onChange={(e) => setFormData({ ...formData, nota: e.target.value })}
                            ></textarea>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-[#0f172a] pb-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                        >
                            {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Crear Ruta
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
