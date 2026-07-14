'use client';

import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import FileUpload from '../../components/FileUpload';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { useCurrency } from '../../lib/useCurrency';

interface CombustibleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    record?: any | null;
}

const emptyForm = () => ({
    id_registro: '',
    fecha: new Date().toISOString().split('T')[0],
    targa: '',
    trabajador_id: '',
    monto: '',
    metodo: '',
    area: '',
    mes: '',
    archivo: '',
});

export default function CombustibleModal({ isOpen, onClose, onSuccess, record }: CombustibleModalProps) {
    const { currency } = useCurrency();
    const isEdit = !!record;

    const [vehicles, setVehicles] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState(emptyForm());

    useEffect(() => {
        if (!isOpen) return;
        api.get('/vehiculos').then(res => setVehicles(res.data)).catch(() => setVehicles([]));
        api.get('/trabajadores').then(res => setWorkers(res.data)).catch(() => setWorkers([]));
        setError('');
        if (record) {
            setFormData({
                id_registro: record.id_registro || '',
                fecha: record.fecha ? new Date(record.fecha).toISOString().split('T')[0] : '',
                targa: record.targa || '',
                trabajador_id: record.trabajador_id || '',
                monto: record.monto != null ? String(record.monto) : '',
                metodo: record.metodo || '',
                area: record.area || '',
                mes: record.mes || '',
                archivo: record.archivo || '',
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
                await api.patch(`/combustible/${record.id}`, formData);
            } else {
                await api.post('/combustible', formData);
            }
            onSuccess();
            onClose();
            setFormData(emptyForm());
        } catch (err: any) {
            console.error(err);
            setError(err?.response?.data?.message || 'Error al guardar el registro');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const inputClass = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-slate-400 focus:ring-2 focus:ring-[#FFC933]/40 transition text-sm text-slate-900';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur-md z-10">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isEdit ? 'Editar Combustible' : 'Registrar Combustible'}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">ID Registro</label>
                            <input type="text" placeholder="Id del registro" className={inputClass}
                                value={formData.id_registro}
                                onChange={(e) => setFormData({ ...formData, id_registro: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Select
                                label="Placa (Targa)"
                                placeholder="Seleccionar vehículo"
                                value={formData.targa}
                                onChange={(v) => setFormData({ ...formData, targa: v })}
                                options={vehicles.map(v => ({ value: v.placa, label: `${v.placa}${v.marca_modelo ? ` - ${v.marca_modelo}` : ''}` }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Select
                                label="Conductor"
                                placeholder="Seleccionar conductor"
                                value={formData.trabajador_id}
                                onChange={(v) => setFormData({ ...formData, trabajador_id: v })}
                                options={workers.map(w => ({ value: String(w.id), label: w.nombre || w.nombre_completo || String(w.id) }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Monto ({currency})</label>
                            <input type="number" step="0.01" min="0" placeholder="0.00" className={inputClass}
                                value={formData.monto}
                                onChange={(e) => setFormData({ ...formData, monto: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Método</label>
                            <input type="text" placeholder="AUTOBOT / IP / etc." className={inputClass}
                                value={formData.metodo}
                                onChange={(e) => setFormData({ ...formData, metodo: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Área</label>
                            <input type="text" placeholder="DHL / FARMACIA / etc." className={inputClass}
                                value={formData.area}
                                onChange={(e) => setFormData({ ...formData, area: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <DatePicker label="Fecha"
                                value={formData.fecha}
                                onChange={(v) => setFormData({ ...formData, fecha: v })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Mes</label>
                            <input type="text" placeholder="p.ej. Enero" className={inputClass}
                                value={formData.mes}
                                onChange={(e) => setFormData({ ...formData, mes: e.target.value })} />
                        </div>

                        <div className="col-span-1 sm:col-span-2 space-y-2">
                            <label className="text-sm font-medium text-slate-700">Archivo (PDF / Imagen)</label>
                            <FileUpload
                                variant="wide"
                                accept="image/*,application/pdf"
                                label="Subir foto o PDF"
                                value={formData.archivo}
                                onChange={(url) => setFormData((f) => ({ ...f, archivo: url }))}
                                onClear={() => setFormData((f) => ({ ...f, archivo: '' }))}
                            />
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="px-6 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                            Cancelar
                        </button>
                        <button type="submit" disabled={submitting}
                            className="flex items-center gap-2 px-6 py-2 bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white rounded-xl font-medium transition disabled:opacity-50">
                            {submitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            {isEdit ? 'Guardar cambios' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
