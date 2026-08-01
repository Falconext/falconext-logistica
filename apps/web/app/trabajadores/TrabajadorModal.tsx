'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Loader2, User, CreditCard, Phone, FileText, Trash2, Plus } from 'lucide-react';
import { Trabajador, Documento } from '../../types';
import api from '../../lib/api';
import { useCurrency } from '../../lib/useCurrency';
import FileUpload from '../../components/FileUpload';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { AREA_OPTIONS } from '../../lib/areas';

interface TrabajadorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: Trabajador | null;
}

const ESTADOS = ['Activo', 'Inactivo', 'Vacaciones', 'Baja'];

// yyyy-mm-dd para inputs date
const toDateInput = (v?: string) => (v ? new Date(v).toISOString().split('T')[0] : '');
// ISO completo (Prisma exige DateTime ISO-8601)
const toIso = (v?: string) => (v ? new Date(v).toISOString() : undefined);

const emptyForm = {
    nombre_completo: '',
    cargo: '',
    estado_laboral: 'Activo',
    area_trabajo: '',
    id_trabajador: '',
    fecha_nacimiento: '',
    telefono: '',
    email_personal: '',
    licencia_conducir: '',
    fecha_vencimiento_licencia: '',
    traduccion_licencia: '',
    fecha_vencimiento_traduccion: '',
    numero_pasaporte: '',
    fecha_vencimiento_pasaporte: '',
    documento_identidad: '',
    fecha_vencimiento_identidad: '',
    permiso_residencia: '',
    fecha_vencimiento_residencia: '',
    codigo_fiscal: '',
    fecha_vencimiento_fiscal: '',
    sueldo_base: '' as string | number,
    tarifa_hora: '' as string | number,
    url_foto: '',
    trackable: false,
};

export default function TrabajadorModal({ isOpen, onClose, onSuccess, initialData }: TrabajadorModalProps) {
    const { format } = useCurrency();
    const isEdit = !!initialData?.id;

    const [form, setForm] = useState({ ...emptyForm });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Documentos (solo en edición)
    const [docs, setDocs] = useState<Documento[]>([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docTipo, setDocTipo] = useState<'LICENCIA' | 'PASAPORTE'>('LICENCIA');
    const [savingDoc, setSavingDoc] = useState(false);

    const set = (k: keyof typeof emptyForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

    const fetchDocs = useCallback(async () => {
        if (!initialData?.id) return;
        setDocsLoading(true);
        try {
            const res = await api.get('/documentos', {
                params: { entidad: 'TRABAJADOR', entidad_id: initialData.id },
            });
            setDocs(res.data);
        } catch {
            /* silencioso */
        } finally {
            setDocsLoading(false);
        }
    }, [initialData?.id]);

    useEffect(() => {
        if (!isOpen) return;
        setError('');
        if (initialData) {
            setForm({
                nombre_completo: initialData.nombre_completo || '',
                cargo: initialData.cargo || '',
                estado_laboral: initialData.estado_laboral || 'Activo',
                area_trabajo: initialData.area_trabajo || '',
                telefono: initialData.telefono || '',
                email_personal: initialData.email_personal || '',
                id_trabajador: initialData.id_trabajador || '',
                fecha_nacimiento: toDateInput(initialData.fecha_nacimiento),
                licencia_conducir: initialData.licencia_conducir || '',
                fecha_vencimiento_licencia: toDateInput(initialData.fecha_vencimiento_licencia),
                traduccion_licencia: initialData.traduccion_licencia || '',
                fecha_vencimiento_traduccion: toDateInput(initialData.fecha_vencimiento_traduccion),
                numero_pasaporte: initialData.numero_pasaporte || '',
                fecha_vencimiento_pasaporte: toDateInput(initialData.fecha_vencimiento_pasaporte),
                documento_identidad: initialData.documento_identidad || '',
                fecha_vencimiento_identidad: toDateInput(initialData.fecha_vencimiento_identidad),
                permiso_residencia: initialData.permiso_residencia || '',
                fecha_vencimiento_residencia: toDateInput(initialData.fecha_vencimiento_residencia),
                codigo_fiscal: initialData.codigo_fiscal || '',
                fecha_vencimiento_fiscal: toDateInput(initialData.fecha_vencimiento_fiscal),
                sueldo_base: initialData.sueldo_base ?? '',
                tarifa_hora: initialData.tarifa_hora ?? '',
                url_foto: initialData.url_foto || '',
                trackable: initialData.trackable ?? false,
            });
            fetchDocs();
        } else {
            setForm({ ...emptyForm });
            setDocs([]);
        }
    }, [isOpen, initialData, fetchDocs]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.nombre_completo.trim() || !form.cargo.trim()) {
            setError('Nombre completo y cargo son obligatorios.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const payload: any = {
                nombre_completo: form.nombre_completo.trim(),
                cargo: form.cargo.trim(),
                estado_laboral: form.estado_laboral,
                area_trabajo: form.area_trabajo || null,
                telefono: form.telefono || null,
                email_personal: form.email_personal || null,
                id_trabajador: form.id_trabajador || null,
                fecha_nacimiento: toIso(form.fecha_nacimiento) ?? null,
                licencia_conducir: form.licencia_conducir || null,
                fecha_vencimiento_licencia: toIso(form.fecha_vencimiento_licencia) ?? null,
                traduccion_licencia: form.traduccion_licencia || null,
                fecha_vencimiento_traduccion: toIso(form.fecha_vencimiento_traduccion) ?? null,
                numero_pasaporte: form.numero_pasaporte || null,
                fecha_vencimiento_pasaporte: toIso(form.fecha_vencimiento_pasaporte) ?? null,
                documento_identidad: form.documento_identidad || null,
                fecha_vencimiento_identidad: toIso(form.fecha_vencimiento_identidad) ?? null,
                permiso_residencia: form.permiso_residencia || null,
                fecha_vencimiento_residencia: toIso(form.fecha_vencimiento_residencia) ?? null,
                codigo_fiscal: form.codigo_fiscal || null,
                fecha_vencimiento_fiscal: toIso(form.fecha_vencimiento_fiscal) ?? null,
                sueldo_base: form.sueldo_base === '' ? null : Number(form.sueldo_base),
                tarifa_hora: form.tarifa_hora === '' ? null : Number(form.tarifa_hora),
                url_foto: form.url_foto || null,
                trackable: form.trackable,
            };

            if (isEdit) {
                await api.patch(`/trabajadores/${initialData!.id}`, payload);
            } else {
                await api.post('/trabajadores', payload);
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Error al guardar el trabajador.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddDoc = async (url: string) => {
        if (!initialData?.id) return;
        setSavingDoc(true);
        try {
            await api.post('/documentos', {
                entidad: 'TRABAJADOR',
                entidad_id: initialData.id,
                tipo: docTipo,
                nombre: docTipo === 'LICENCIA' ? 'Licencia de conducir' : 'Pasaporte',
                url,
            });
            await fetchDocs();
        } catch {
            setError('No se pudo guardar el documento.');
        } finally {
            setSavingDoc(false);
        }
    };

    const handleDeleteDoc = async (id: string) => {
        if (!confirm('¿Eliminar este documento?')) return;
        try {
            await api.delete(`/documentos/${id}`);
            setDocs((d) => d.filter((x) => x.id !== id));
        } catch {
            setError('No se pudo eliminar el documento.');
        }
    };

    if (!isOpen) return null;

    const inputCls =
        'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition';
    const labelCls = 'text-xs font-semibold text-slate-500 uppercase tracking-wide';

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {isEdit ? 'Editar trabajador' : 'Nuevo trabajador'}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {isEdit ? 'Actualiza los datos del miembro del personal.' : 'Registra un nuevo miembro del personal.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-7 overflow-y-auto">
                    {error && (
                        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Foto */}
                    <FileUpload
                        variant="avatar"
                        label="Subir foto"
                        placeholder="/default-avatar.svg"
                        value={form.url_foto || undefined}
                        onChange={(url) => set('url_foto', url)}
                        onClear={() => set('url_foto', '')}
                    />

                    {/* Datos personales */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                            <User size={18} className="text-[#1a1a1c]" />
                            <span>Datos personales</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={labelCls}>Nombre completo *</label>
                                <input className={inputCls} value={form.nombre_completo}
                                    onChange={(e) => set('nombre_completo', e.target.value)} placeholder="Ej: Juan Pérez" />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Cargo *</label>
                                <input className={inputCls} value={form.cargo}
                                    onChange={(e) => set('cargo', e.target.value)} placeholder="Ej: Conductor" />
                            </div>
                            <div className="space-y-1.5">
                                <Select label="Estado laboral" value={form.estado_laboral}
                                    onChange={(v) => set('estado_laboral', v)}
                                    options={ESTADOS.map((s) => ({ value: s, label: s }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Select label="Área" value={form.area_trabajo}
                                    onChange={(v) => set('area_trabajo', v)}
                                    options={AREA_OPTIONS} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>ID trabajador</label>
                                <input className={inputCls} value={form.id_trabajador}
                                    onChange={(e) => set('id_trabajador', e.target.value)} placeholder="Ej: G027" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Fecha de nacimiento" value={form.fecha_nacimiento}
                                    onChange={(v) => set('fecha_nacimiento', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Sueldo base</label>
                                <input type="number" step="0.01" min="0" className={inputCls}
                                    value={form.sueldo_base}
                                    onChange={(e) => set('sueldo_base', e.target.value)} placeholder="0.00" />
                                {form.sueldo_base !== '' && !isNaN(Number(form.sueldo_base)) && (
                                    <p className="text-xs text-slate-400">{format(Number(form.sueldo_base))}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Tarifa por hora de manejo</label>
                                <input type="number" step="0.01" min="0" className={inputCls}
                                    value={form.tarifa_hora}
                                    onChange={(e) => set('tarifa_hora', e.target.value)} placeholder="0.00" />
                                {form.tarifa_hora !== '' && !isNaN(Number(form.tarifa_hora)) && (
                                    <p className="text-xs text-slate-400">{format(Number(form.tarifa_hora))} / hora — base de la ganancia estimada del chofer en la app</p>
                                )}
                            </div>
                            <div className="sm:col-span-2">
                                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-slate-400 transition">
                                    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#1a1a1c]"
                                        checked={form.trackable}
                                        onChange={(e) => set('trackable', e.target.checked)} />
                                    <span className="flex-1">
                                        <span className="block text-sm font-semibold text-slate-800">Será rastreado</span>
                                        <span className="block text-xs text-slate-400">El trabajador reportará su ubicación GPS desde la app.</span>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Contacto */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                            <Phone size={18} className="text-[#1a1a1c]" />
                            <span>Contacto</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelCls}>Teléfono</label>
                                <input className={inputCls} value={form.telefono}
                                    onChange={(e) => set('telefono', e.target.value)} placeholder="+51 ..." />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Email personal</label>
                                <input type="email" className={inputCls} value={form.email_personal}
                                    onChange={(e) => set('email_personal', e.target.value)} placeholder="correo@ejemplo.com" />
                            </div>
                        </div>
                    </div>

                    {/* Documentación */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                            <CreditCard size={18} className="text-[#1a1a1c]" />
                            <span>Documentación</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelCls}>Licencia de conducir</label>
                                <input className={inputCls} value={form.licencia_conducir}
                                    onChange={(e) => set('licencia_conducir', e.target.value)} placeholder="N° de licencia" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Vencimiento licencia" value={form.fecha_vencimiento_licencia}
                                    onChange={(v) => set('fecha_vencimiento_licencia', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>N° de pasaporte</label>
                                <input className={inputCls} value={form.numero_pasaporte}
                                    onChange={(e) => set('numero_pasaporte', e.target.value)} placeholder="N° de pasaporte" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Vencimiento pasaporte" value={form.fecha_vencimiento_pasaporte}
                                    onChange={(v) => set('fecha_vencimiento_pasaporte', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Documento de identidad</label>
                                <input className={inputCls} value={form.documento_identidad}
                                    onChange={(e) => set('documento_identidad', e.target.value)} placeholder="N° carta d'identità" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Venc. identidad" value={form.fecha_vencimiento_identidad}
                                    onChange={(v) => set('fecha_vencimiento_identidad', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Permiso de residencia (soggiorno)</label>
                                <input className={inputCls} value={form.permiso_residencia}
                                    onChange={(e) => set('permiso_residencia', e.target.value)} placeholder="N° permesso" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Venc. soggiorno" value={form.fecha_vencimiento_residencia}
                                    onChange={(v) => set('fecha_vencimiento_residencia', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Traducción de licencia</label>
                                <input className={inputCls} value={form.traduccion_licencia}
                                    onChange={(e) => set('traduccion_licencia', e.target.value)} placeholder="N° traduzione" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Venc. traducción" value={form.fecha_vencimiento_traduccion}
                                    onChange={(v) => set('fecha_vencimiento_traduccion', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Código fiscal</label>
                                <input className={inputCls} value={form.codigo_fiscal}
                                    onChange={(e) => set('codigo_fiscal', e.target.value)} placeholder="Codice fiscale" />
                            </div>
                            <div className="space-y-1.5">
                                <DatePicker label="Venc. código fiscal" value={form.fecha_vencimiento_fiscal}
                                    onChange={(v) => set('fecha_vencimiento_fiscal', v)} />
                            </div>
                        </div>
                    </div>

                    {/* Escaneos de documentos (solo edición) */}
                    {isEdit && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                                <FileText size={18} className="text-[#1a1a1c]" />
                                <span>Escaneos de documentos</span>
                            </div>

                            {/* Lista */}
                            {docsLoading ? (
                                <p className="text-sm text-slate-400">Cargando documentos...</p>
                            ) : docs.length === 0 ? (
                                <p className="text-sm text-slate-400">Aún no hay escaneos cargados.</p>
                            ) : (
                                <div className="space-y-2">
                                    {docs.map((d) => (
                                        <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FFC933] text-[#1a1a1c]">
                                                {d.tipo}
                                            </span>
                                            <a href={d.url} target="_blank" rel="noreferrer"
                                                className="flex-1 text-sm text-blue-600 truncate hover:underline">
                                                {d.nombre || 'Ver documento'}
                                            </a>
                                            <button type="button" onClick={() => handleDeleteDoc(d.id)}
                                                className="text-slate-400 hover:text-red-500 transition">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Subir nuevo */}
                            <div className="flex items-center gap-2">
                                <label className={labelCls}>Tipo</label>
                                <Select value={docTipo} onChange={(v) => setDocTipo(v as 'LICENCIA' | 'PASAPORTE')}
                                    options={[{ value: 'LICENCIA', label: 'Licencia' }, { value: 'PASAPORTE', label: 'Pasaporte' }]}
                                    className="w-44" />
                                {savingDoc && <Loader2 className="animate-spin text-slate-400" size={16} />}
                            </div>
                            <FileUpload
                                variant="wide"
                                accept="image/*,application/pdf"
                                label="Subir escaneo (licencia / pasaporte)"
                                onChange={handleAddDoc}
                            />
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="p-4 sm:p-6 border-t border-slate-100 flex justify-end gap-3">
                    <button type="button" onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition">
                        Cancelar
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition disabled:opacity-60">
                        {submitting ? <Loader2 className="animate-spin" size={16} /> : isEdit ? <Save size={16} /> : <Plus size={16} />}
                        {isEdit ? 'Guardar cambios' : 'Crear trabajador'}
                    </button>
                </div>
            </div>
        </div>
    );
}
