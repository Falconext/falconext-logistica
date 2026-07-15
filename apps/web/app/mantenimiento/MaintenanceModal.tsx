'use client';

import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import FileUpload from '../../components/FileUpload';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { useCurrency } from '../../lib/useCurrency';

interface MaintenanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    record?: any | null; // si viene, es edición
}

const emptyForm = () => ({
    vehiculo_id: '',
    tipo: 'Preventivo',
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    costo: '',
    taller: '',
    kilometraje: '',
    evidence_url: '',
});

export default function MaintenanceModal({ isOpen, onClose, onSuccess, record }: MaintenanceModalProps) {
    const { currency } = useCurrency();
    const isEdit = !!record;

    const [vehicles, setVehicles] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState(emptyForm());

    useEffect(() => {
        if (!isOpen) return;
        api.get('/vehiculos').then(res => setVehicles(res.data)).catch(() => setVehicles([]));
        setError('');
        if (record) {
            setFormData({
                vehiculo_id: record.vehiculo_id || record.vehiculo?.id || '',
                tipo: record.tipo || 'Preventivo',
                fecha: record.fecha ? new Date(record.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                descripcion: record.descripcion || '',
                costo: record.costo != null ? String(record.costo) : '',
                taller: record.taller || '',
                kilometraje: record.kilometraje != null ? String(record.kilometraje) : '',
                evidence_url: record.evidence_url || '',
            });
        } else {
            setFormData(emptyForm());
        }
    }, [isOpen, record]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            if (isEdit) {
                await api.patch(`/mantenimiento/${record.id}`, formData);
            } else {
                await api.post('/mantenimiento', formData);
            }
            onSuccess();
            onClose();
            setFormData(emptyForm());
        } catch (err: any) {
            console.error(err);
            setError(err?.response?.data?.message || 'Error al guardar el mantenimiento');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const inputClass = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-slate-400 focus:ring-2 focus:ring-[#FFC933]/40 transition text-sm text-slate-900';

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur-md z-10">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isEdit ? 'Editar Mantenimiento' : 'Registrar Mantenimiento'}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        <div className="space-y-2">
                            <Select
                                label="Vehículo"
                                placeholder="Seleccionar vehículo"
                                value={formData.vehiculo_id}
                                onChange={(v) => setFormData({ ...formData, vehiculo_id: v })}
                                options={vehicles.map(v => ({
                                    value: v.id,
                                    label: `${v.placa}${v.marca_modelo ? ` - ${v.marca_modelo}` : ''}`,
                                }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Select
                                label="Tipo"
                                value={formData.tipo}
                                onChange={(v) => setFormData({ ...formData, tipo: v })}
                                options={[
                                    { value: 'Preventivo', label: 'Preventivo' },
                                    { value: 'Correctivo', label: 'Correctivo' },
                                    { value: 'Emergencia', label: 'Emergencia' },
                                ]}
                            />
                        </div>

                        <div className="space-y-2">
                            <DatePicker
                                label="Fecha"
                                value={formData.fecha}
                                onChange={(v) => setFormData({ ...formData, fecha: v })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Costo ({currency})</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                placeholder="0.00"
                                className={inputClass}
                                value={formData.costo}
                                onChange={(e) => setFormData({ ...formData, costo: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Taller / Proveedor</label>
                            <input
                                type="text"
                                placeholder="Nombre del taller"
                                className={inputClass}
                                value={formData.taller}
                                onChange={(e) => setFormData({ ...formData, taller: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Kilometraje</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="km"
                                className={inputClass}
                                value={formData.kilometraje}
                                onChange={(e) => setFormData({ ...formData, kilometraje: e.target.value })}
                            />
                        </div>

                        <div className="col-span-1 sm:col-span-2 space-y-2">
                            <label className="text-sm font-medium text-slate-700">Evidencia / Factura (Opcional)</label>
                            <FileUpload
                                variant="wide"
                                accept="image/*,application/pdf"
                                label="Subir foto o PDF"
                                value={formData.evidence_url}
                                onChange={(url) => setFormData((f) => ({ ...f, evidence_url: url }))}
                                onClear={() => setFormData((f) => ({ ...f, evidence_url: '' }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Descripción</label>
                        <textarea
                            required
                            rows={3}
                            placeholder="Detalles..."
                            className={`${inputClass} resize-none`}
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        ></textarea>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex items-center gap-2 px-6 py-2 bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white rounded-xl font-medium transition disabled:opacity-50"
                        >
                            {submitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            {isEdit ? 'Guardar cambios' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
