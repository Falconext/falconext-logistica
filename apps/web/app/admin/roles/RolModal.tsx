'use client';

import { useState, useEffect } from 'react';
import { X, Save, Plus, Loader2, ShieldCheck, Lock } from 'lucide-react';
import api from '../../../lib/api';
import { MODULES } from '../../../lib/modules';
import { toast } from 'sonner';

export interface Rol {
    id: string;
    nombre: string;
    descripcion?: string | null;
    modulos: string[];
    es_admin: boolean;
    solo_propios: boolean;
    usuarios_count?: number;
    tenant_id?: string;
    creado_en?: string;
    actualizado_en?: string;
}

interface RolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: Rol | null;
}

const emptyForm = {
    nombre: '',
    descripcion: '',
    modulos: [] as string[],
    es_admin: false,
    solo_propios: false,
};

export default function RolModal({ isOpen, onClose, onSuccess, initialData }: RolModalProps) {
    const isEdit = !!initialData?.id;

    const [form, setForm] = useState({ ...emptyForm });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const set = (k: keyof typeof emptyForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

    useEffect(() => {
        if (!isOpen) return;
        setError('');
        if (initialData) {
            setForm({
                nombre: initialData.nombre || '',
                descripcion: initialData.descripcion || '',
                modulos: Array.isArray(initialData.modulos) ? [...initialData.modulos] : [],
                es_admin: initialData.es_admin ?? false,
                solo_propios: initialData.solo_propios ?? false,
            });
        } else {
            setForm({ ...emptyForm });
        }
    }, [isOpen, initialData]);

    const allSelected = form.modulos.length === MODULES.length;

    const toggleModule = (key: string) => {
        setForm((f) => ({
            ...f,
            modulos: f.modulos.includes(key)
                ? f.modulos.filter((m) => m !== key)
                : [...f.modulos, key],
        }));
    };

    const toggleAll = () => {
        setForm((f) => ({
            ...f,
            modulos: f.modulos.length === MODULES.length ? [] : MODULES.map((m) => m.key),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!form.nombre.trim()) {
            setError('El nombre del rol es obligatorio.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            // Un rol administrador ve todos los módulos y no se restringe por dueño.
            const modulos = form.es_admin ? [] : form.modulos;
            const solo_propios = form.es_admin ? false : form.solo_propios;

            const payload = {
                nombre: form.nombre.trim(),
                descripcion: form.descripcion.trim() || undefined,
                modulos,
                es_admin: form.es_admin,
                solo_propios,
            };

            if (isEdit) {
                await api.patch(`/roles/${initialData!.id}`, payload);
                toast.success('Rol actualizado.');
            } else {
                await api.post('/roles', payload);
                toast.success('Rol creado.');
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Error al guardar el rol.';
            setError(Array.isArray(msg) ? msg.join(' ') : msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const inputCls =
        'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition disabled:opacity-60 disabled:cursor-not-allowed';
    const labelCls = 'text-xs font-semibold text-slate-500 uppercase tracking-wide';

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {isEdit ? 'Editar rol' : 'Nuevo rol'}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {isEdit ? 'Actualiza el nombre, el tipo y los módulos del rol.' : 'Define un rol y qué módulos podrán ver sus usuarios.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition shrink-0">
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 overflow-y-auto">
                    {error && (
                        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Datos del rol */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Nombre *</label>
                            <input className={inputCls} value={form.nombre}
                                onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Supervisor de flota" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Descripción</label>
                            <input className={inputCls} value={form.descripcion}
                                onChange={(e) => set('descripcion', e.target.value)} placeholder="Ej: Gestión operativa y flota" />
                        </div>
                    </div>

                    {/* Tipo: Administrador */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Administrador (ve todo y administra)</p>
                            <p className="text-xs text-slate-500">Acceso total a los módulos y a la administración de usuarios y roles.</p>
                        </div>
                        <button type="button" role="switch" aria-checked={form.es_admin}
                            onClick={() => set('es_admin', !form.es_admin)}
                            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${form.es_admin ? 'bg-[#1a1a1c]' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${form.es_admin ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {/* Ver solo sus propios registros (no aplica a admins) */}
                    {!form.es_admin && (
                        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">Ver solo sus propios registros</p>
                                <p className="text-xs text-slate-500">Peajes, combustible, operaciones y documentos — solo lo que le pertenece.</p>
                            </div>
                            <button type="button" role="switch" aria-checked={form.solo_propios}
                                onClick={() => set('solo_propios', !form.solo_propios)}
                                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${form.solo_propios ? 'bg-[#1a1a1c]' : 'bg-slate-300'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${form.solo_propios ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                    )}

                    {/* Módulos */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 text-slate-800 font-bold">
                                <ShieldCheck size={18} className="text-[#1a1a1c]" />
                                <span>Módulos permitidos</span>
                            </div>
                            {!form.es_admin && (
                                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                                        className="w-4 h-4 rounded accent-[#1a1a1c]" />
                                    Seleccionar todos
                                </label>
                            )}
                        </div>

                        {form.es_admin ? (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#FFC933]/15 border border-[#FFC933]/40 text-sm text-slate-700">
                                <Lock size={18} className="text-[#1a1a1c] shrink-0" />
                                <span>Los roles de administrador ven <span className="font-semibold">todos los módulos</span>. No es necesario asignar permisos individuales.</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {MODULES.map((m) => {
                                    const checked = form.modulos.includes(m.key);
                                    return (
                                        <label key={m.key}
                                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition select-none ${checked ? 'border-[#1a1a1c] bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                            <input type="checkbox" checked={checked}
                                                onChange={() => toggleModule(m.key)}
                                                className="w-4 h-4 rounded accent-[#1a1a1c]" />
                                            <span className="text-sm text-slate-700">{m.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
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
                        {isEdit ? 'Guardar cambios' : 'Crear rol'}
                    </button>
                </div>
            </div>
        </div>
    );
}
