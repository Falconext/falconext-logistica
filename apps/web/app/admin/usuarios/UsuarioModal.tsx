'use client';

import { useState, useEffect } from 'react';
import { X, Save, Plus, Loader2, ShieldCheck } from 'lucide-react';
import api from '../../../lib/api';
import { MODULES } from '../../../lib/modules';
import { toast } from 'sonner';

export interface Usuario {
    id: string;
    email: string;
    nombre?: string | null;
    role: string;
    activo: boolean;
    modulos?: string[] | null;
    tenant_id?: string;
}

interface UsuarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: Usuario | null;
}

const emptyForm = {
    nombre: '',
    email: '',
    password: '',
    role: 'USER',
    activo: true,
    modulos: [] as string[],
};

function isAdminLike(role: string) {
    const r = (role || '').toUpperCase();
    return r === 'ADMIN' || r === 'SUPERADMIN';
}

export default function UsuarioModal({ isOpen, onClose, onSuccess, initialData }: UsuarioModalProps) {
    const isEdit = !!initialData?.id;
    const isSuperadmin = (initialData?.role || '').toUpperCase() === 'SUPERADMIN';

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
                email: initialData.email || '',
                password: '',
                role: (initialData.role || 'USER').toUpperCase(),
                activo: initialData.activo ?? true,
                modulos: Array.isArray(initialData.modulos) ? [...initialData.modulos] : [],
            });
        } else {
            setForm({ ...emptyForm });
        }
    }, [isOpen, initialData]);

    const adminLike = isAdminLike(form.role);
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

        if (!isEdit) {
            if (!form.email.trim()) { setError('El email es obligatorio.'); return; }
            if (!form.password || form.password.length < 6) {
                setError('La contraseña es obligatoria (mínimo 6 caracteres).');
                return;
            }
        } else if (form.password && form.password.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            // Los admins ven todos los módulos: no enviamos lista específica.
            const modulos = adminLike ? [] : form.modulos;

            if (isEdit) {
                const payload: any = {
                    nombre: form.nombre.trim() || null,
                    modulos,
                    activo: form.activo,
                };
                // No se puede reasignar el rol de un SUPERADMIN (backend solo admite ADMIN|USER).
                if (!isSuperadmin) payload.role = form.role;
                if (form.password) payload.password = form.password;
                await api.patch(`/usuarios/${initialData!.id}`, payload);
                toast.success('Usuario actualizado.');
            } else {
                await api.post('/usuarios', {
                    email: form.email.trim(),
                    password: form.password,
                    nombre: form.nombre.trim() || undefined,
                    role: form.role,
                    modulos,
                });
                toast.success('Usuario creado.');
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Error al guardar el usuario.';
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {isEdit ? 'Actualiza los datos y permisos del usuario.' : 'Crea un usuario y define qué módulos verá.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                    {error && (
                        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Datos de la cuenta */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Nombre</label>
                            <input className={inputCls} value={form.nombre}
                                onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Ana López" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Email {!isEdit && '*'}</label>
                            <input type="email" className={inputCls} value={form.email} disabled={isEdit}
                                onChange={(e) => set('email', e.target.value)} placeholder="correo@empresa.com" />
                            {isEdit && <p className="text-xs text-slate-400">El email no se puede modificar.</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Contraseña {!isEdit && '*'}</label>
                            <input type="password" className={inputCls} value={form.password}
                                onChange={(e) => set('password', e.target.value)}
                                placeholder={isEdit ? 'Dejar en blanco para no cambiar' : 'Mínimo 6 caracteres'} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Rol</label>
                            {isSuperadmin ? (
                                <input className={inputCls} value="SUPERADMIN" disabled />
                            ) : (
                                <select className={inputCls} value={form.role}
                                    onChange={(e) => set('role', e.target.value)}>
                                    <option value="USER">USER</option>
                                    <option value="ADMIN">ADMIN</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Estado activo */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Usuario activo</p>
                            <p className="text-xs text-slate-500">Los usuarios inactivos no pueden iniciar sesión.</p>
                        </div>
                        <button type="button" role="switch" aria-checked={form.activo}
                            onClick={() => set('activo', !form.activo)}
                            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${form.activo ? 'bg-[#1a1a1c]' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {/* Módulos */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 text-slate-800 font-bold">
                                <ShieldCheck size={18} className="text-[#1a1a1c]" />
                                <span>Módulos permitidos</span>
                            </div>
                            {!adminLike && (
                                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                                        className="w-4 h-4 rounded accent-[#1a1a1c]" />
                                    Seleccionar todos
                                </label>
                            )}
                        </div>

                        {adminLike ? (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#FFC933]/15 border border-[#FFC933]/40 text-sm text-slate-700">
                                <ShieldCheck size={18} className="text-[#1a1a1c] shrink-0" />
                                <span>Los administradores ven <span className="font-semibold">todos los módulos</span>. No es necesario asignar permisos individuales.</span>
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
                <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                    <button type="button" onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition">
                        Cancelar
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition disabled:opacity-60">
                        {submitting ? <Loader2 className="animate-spin" size={16} /> : isEdit ? <Save size={16} /> : <Plus size={16} />}
                        {isEdit ? 'Guardar cambios' : 'Crear usuario'}
                    </button>
                </div>
            </div>
        </div>
    );
}
