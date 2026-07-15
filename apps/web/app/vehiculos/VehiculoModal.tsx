'use client';

import { useEffect, useState } from 'react';
import { X, Save, Loader2, Truck, FileText } from 'lucide-react';
import { Vehiculo } from '../../types';
import api from '../../lib/api';
import { toast } from 'sonner';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';

interface VehiculoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (vehiculo?: Vehiculo) => void;
    initialData?: Vehiculo | null;
}

const EMPTY = {
    placa: '',
    marca_modelo: '',
    anio_fabricacion: '',
    tipo_unidad: '',
    estado_vehiculo: 'ACTIVO',
    aislamiento_termico: '',
    tarjeta_circulacion: '',
    poliza_seguro: '',
    fecha_vencimiento_seguro: '',
    revision_tecnica: '',
    permisos_especiales: '',
    id_interno_furgon: '',
    kilometraje_actual: '',
};

const inputCls =
    'w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition';
const labelCls = 'text-xs font-bold text-slate-500 uppercase';

export default function VehiculoModal({ isOpen, onClose, onSuccess, initialData }: VehiculoModalProps) {
    const [form, setForm] = useState<Record<string, string>>(EMPTY);
    const [submitting, setSubmitting] = useState(false);

    const isEdit = !!initialData?.id;

    useEffect(() => {
        if (!isOpen) return;
        if (initialData) {
            setForm({
                placa: initialData.placa || '',
                marca_modelo: initialData.marca_modelo || '',
                anio_fabricacion: initialData.anio_fabricacion?.toString() || '',
                tipo_unidad: initialData.tipo_unidad || '',
                estado_vehiculo: initialData.estado_vehiculo || 'ACTIVO',
                aislamiento_termico: initialData.aislamiento_termico || '',
                tarjeta_circulacion: initialData.tarjeta_circulacion || '',
                poliza_seguro: initialData.poliza_seguro || '',
                fecha_vencimiento_seguro: initialData.fecha_vencimiento_seguro
                    ? initialData.fecha_vencimiento_seguro.split('T')[0]
                    : '',
                revision_tecnica: initialData.revision_tecnica || '',
                permisos_especiales: initialData.permisos_especiales || '',
                id_interno_furgon: initialData.id_interno_furgon || '',
                kilometraje_actual: initialData.kilometraje_actual?.toString() || '',
            });
        } else {
            setForm(EMPTY);
        }
    }, [isOpen, initialData]);

    const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.placa.trim()) {
            toast.error('La placa es obligatoria');
            return;
        }
        setSubmitting(true);
        try {
            const payload: Record<string, any> = {
                placa: form.placa.trim(),
                marca_modelo: form.marca_modelo || null,
                tipo_unidad: form.tipo_unidad || null,
                estado_vehiculo: form.estado_vehiculo || null,
                aislamiento_termico: form.aislamiento_termico || null,
                tarjeta_circulacion: form.tarjeta_circulacion || null,
                poliza_seguro: form.poliza_seguro || null,
                revision_tecnica: form.revision_tecnica || null,
                permisos_especiales: form.permisos_especiales || null,
                id_interno_furgon: form.id_interno_furgon || null,
                anio_fabricacion: form.anio_fabricacion ? parseInt(form.anio_fabricacion, 10) : null,
                kilometraje_actual: form.kilometraje_actual ? parseInt(form.kilometraje_actual, 10) : null,
                fecha_vencimiento_seguro: form.fecha_vencimiento_seguro
                    ? new Date(form.fecha_vencimiento_seguro).toISOString()
                    : null,
            };

            let saved: Vehiculo;
            if (isEdit) {
                const res = await api.patch(`/vehiculos/${initialData!.id}`, payload);
                saved = res.data;
                toast.success('Vehículo actualizado');
            } else {
                const res = await api.post('/vehiculos', payload);
                saved = res.data;
                toast.success('Vehículo creado');
            }
            onSuccess(saved);
            onClose();
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.message || (isEdit ? 'Error al actualizar' : 'Error al crear vehículo'));
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFC933] text-[#1a1a1c] flex items-center justify-center">
                            <Truck size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">
                                {isEdit ? 'Editar vehículo' : 'Nuevo vehículo'}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {isEdit ? 'Actualiza los datos de la unidad' : 'Registra una unidad en la flota'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 overflow-y-auto">
                    {/* Datos generales */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                            <Truck size={16} className="text-slate-400" />
                            <span>Datos generales</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelCls}>Placa *</label>
                                <input
                                    required
                                    className={inputCls}
                                    placeholder="Ej: ABC-123"
                                    value={form.placa}
                                    onChange={(e) => set('placa', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Marca / Modelo</label>
                                <input
                                    className={inputCls}
                                    placeholder="Ej: Volvo FH 460"
                                    value={form.marca_modelo}
                                    onChange={(e) => set('marca_modelo', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Tipo de unidad</label>
                                <input
                                    className={inputCls}
                                    placeholder="Ej: Furgón, Tráiler"
                                    value={form.tipo_unidad}
                                    onChange={(e) => set('tipo_unidad', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Año de fabricación</label>
                                <input
                                    type="number"
                                    className={inputCls}
                                    placeholder="Ej: 2021"
                                    value={form.anio_fabricacion}
                                    onChange={(e) => set('anio_fabricacion', e.target.value)}
                                />
                            </div>
                            <Select
                                label="Estado"
                                value={form.estado_vehiculo}
                                onChange={(v) => set('estado_vehiculo', v)}
                                options={[
                                    { value: 'ACTIVO', label: 'Activo' },
                                    { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
                                    { value: 'INACTIVO', label: 'Inactivo' },
                                ]}
                            />
                            <div className="space-y-1.5">
                                <label className={labelCls}>Kilometraje actual</label>
                                <input
                                    type="number"
                                    className={inputCls}
                                    placeholder="Ej: 120000"
                                    value={form.kilometraje_actual}
                                    onChange={(e) => set('kilometraje_actual', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>ID interno furgón</label>
                                <input
                                    className={inputCls}
                                    placeholder="Ej: F-08"
                                    value={form.id_interno_furgon}
                                    onChange={(e) => set('id_interno_furgon', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Aislamiento térmico</label>
                                <input
                                    className={inputCls}
                                    placeholder="Ej: Sí / No"
                                    value={form.aislamiento_termico}
                                    onChange={(e) => set('aislamiento_termico', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Documentación */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                            <FileText size={16} className="text-slate-400" />
                            <span>Documentación</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelCls}>Tarjeta de circulación</label>
                                <input
                                    className={inputCls}
                                    value={form.tarjeta_circulacion}
                                    onChange={(e) => set('tarjeta_circulacion', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Póliza de seguro</label>
                                <input
                                    className={inputCls}
                                    value={form.poliza_seguro}
                                    onChange={(e) => set('poliza_seguro', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker
                                    label="Venc. seguro"
                                    value={form.fecha_vencimiento_seguro}
                                    onChange={(v) => set('fecha_vencimiento_seguro', v)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Revisión técnica</label>
                                <input
                                    className={inputCls}
                                    value={form.revision_tecnica}
                                    onChange={(e) => set('revision_tecnica', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={labelCls}>Permisos especiales</label>
                                <input
                                    className={inputCls}
                                    value={form.permisos_especiales}
                                    onChange={(e) => set('permisos_especiales', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-4 px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="mt-4 px-6 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white font-medium transition flex items-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
                        >
                            {submitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            {isEdit ? 'Guardar cambios' : 'Crear vehículo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
