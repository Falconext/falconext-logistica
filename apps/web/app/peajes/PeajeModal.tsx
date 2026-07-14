'use client';

import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import FileUpload from '../../components/FileUpload';
import { useCurrency } from '../../lib/useCurrency';

interface PeajeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    record?: any | null;
}

const emptyForm = () => ({
    id_multa: '',
    estado: 'PENDIENTE',
    fecha: new Date().toISOString().split('T')[0],
    hora: '',
    targa: '',
    monto: '',
    trabajador_id: '',
    tipo: '',
    mes: '',
    fecha_recepcion: '',
    peaje_salida: '',
    recibo_pago: '',
    comentarios: '',
    nota_autista: '',
    archivo: '',
});

export default function PeajeModal({ isOpen, onClose, onSuccess, record }: PeajeModalProps) {
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
                id_multa: record.id_multa || '',
                estado: record.estado || 'PENDIENTE',
                fecha: record.fecha ? new Date(record.fecha).toISOString().split('T')[0] : '',
                hora: record.hora || '',
                targa: record.targa || '',
                monto: record.monto != null ? String(record.monto) : '',
                trabajador_id: record.trabajador_id || '',
                tipo: record.tipo || '',
                mes: record.mes || '',
                fecha_recepcion: record.fecha_recepcion ? new Date(record.fecha_recepcion).toISOString().split('T')[0] : '',
                peaje_salida: record.peaje_salida || '',
                recibo_pago: record.recibo_pago || '',
                comentarios: record.comentarios || '',
                nota_autista: record.nota_autista || '',
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
                await api.patch(`/peajes/${record.id}`, formData);
            } else {
                await api.post('/peajes', formData);
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

    const inputClass = 'w-full p-3 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-slate-400 focus:ring-2 focus:ring-[#FFC933]/40 transition text-slate-900';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur-md z-10">
                    <h2 className="text-xl font-bold text-slate-900">{isEdit ? 'Editar Peaje / Multa' : 'Registrar Peaje / Multa'}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">ID Multa</label>
                            <input type="text" placeholder="Id de la multa" className={inputClass}
                                value={formData.id_multa}
                                onChange={(e) => setFormData({ ...formData, id_multa: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Estado</label>
                            <select className={inputClass} value={formData.estado}
                                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}>
                                <option value="PENDIENTE">PENDIENTE</option>
                                <option value="PAGADO">PAGADO</option>
                                <option value="ANULADO">ANULADO</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Placa (Targa)</label>
                            <select className={inputClass} value={formData.targa}
                                onChange={(e) => setFormData({ ...formData, targa: e.target.value })}>
                                <option value="">Seleccionar vehículo</option>
                                {vehicles.map(v => (
                                    <option key={v.id} value={v.placa}>{v.placa}{v.marca_modelo ? ` - ${v.marca_modelo}` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Conductor</label>
                            <select className={inputClass} value={formData.trabajador_id}
                                onChange={(e) => setFormData({ ...formData, trabajador_id: e.target.value })}>
                                <option value="">Seleccionar conductor</option>
                                {workers.map(w => (
                                    <option key={w.id} value={w.id}>{w.nombre || w.nombre_completo || w.id}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Monto ({currency})</label>
                            <input type="number" step="0.01" min="0" placeholder="0.00" className={inputClass}
                                value={formData.monto}
                                onChange={(e) => setFormData({ ...formData, monto: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Tipo</label>
                            <input type="text" placeholder="Tipo de infracción / peaje" className={inputClass}
                                value={formData.tipo}
                                onChange={(e) => setFormData({ ...formData, tipo: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Fecha</label>
                            <input type="date" className={inputClass}
                                value={formData.fecha}
                                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Hora</label>
                            <input type="time" className={inputClass}
                                value={formData.hora}
                                onChange={(e) => setFormData({ ...formData, hora: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Mes</label>
                            <input type="text" placeholder="p.ej. Enero" className={inputClass}
                                value={formData.mes}
                                onChange={(e) => setFormData({ ...formData, mes: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Fecha recepción</label>
                            <input type="date" className={inputClass}
                                value={formData.fecha_recepcion}
                                onChange={(e) => setFormData({ ...formData, fecha_recepcion: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Peaje / Salida</label>
                            <input type="text" placeholder="Peaje o salida" className={inputClass}
                                value={formData.peaje_salida}
                                onChange={(e) => setFormData({ ...formData, peaje_salida: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Recibo de pago</label>
                            <input type="text" placeholder="Nº recibo" className={inputClass}
                                value={formData.recibo_pago}
                                onChange={(e) => setFormData({ ...formData, recibo_pago: e.target.value })} />
                        </div>

                        <div className="col-span-1 md:col-span-2 space-y-2">
                            <label className="text-sm font-medium text-slate-700">Nota autista</label>
                            <input type="text" placeholder="Nota del conductor" className={inputClass}
                                value={formData.nota_autista}
                                onChange={(e) => setFormData({ ...formData, nota_autista: e.target.value })} />
                        </div>

                        <div className="col-span-1 md:col-span-2 space-y-2">
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Comentarios</label>
                        <textarea rows={3} placeholder="Detalles..." className={`${inputClass} resize-none`}
                            value={formData.comentarios}
                            onChange={(e) => setFormData({ ...formData, comentarios: e.target.value })}></textarea>
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
