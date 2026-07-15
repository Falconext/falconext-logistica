'use client';

import { useState, useEffect } from 'react';
import { X, Save, Plus, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import api from '../../../lib/api';
import Select from '../../../components/Select';
import { toast } from 'sonner';

export interface Usuario {
    id: string;
    email: string;
    nombre?: string | null;
    role: string;
    activo: boolean;
    rol_id?: string | null;
    rol?: { id: string; nombre: string; es_admin: boolean; solo_propios: boolean; modulos?: string[] } | null;
    trabajador_id?: string | null;
    trabajador_codigo?: string | null;
    tenant_id?: string;
}

interface Rol { id: string; nombre: string; descripcion?: string | null; modulos: string[]; es_admin: boolean; solo_propios: boolean; }
interface TrabajadorOpt { id: string; id_trabajador?: string | null; nombre_completo: string; }

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
    activo: true,
    rol_id: '',
    trabajador_id: '',
};

export default function UsuarioModal({ isOpen, onClose, onSuccess, initialData }: UsuarioModalProps) {
    const isEdit = !!initialData?.id;
    const isSuperadmin = (initialData?.role || '').toUpperCase() === 'SUPERADMIN';

    const [form, setForm] = useState({ ...emptyForm });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [roles, setRoles] = useState<Rol[]>([]);
    const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);

    const set = (k: keyof typeof emptyForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

    useEffect(() => {
        if (!isOpen) return;
        api.get('/roles').then((r) => setRoles(Array.isArray(r.data) ? r.data : [])).catch(() => setRoles([]));
        api.get('/trabajadores').then((r) => setTrabajadores(Array.isArray(r.data) ? r.data : [])).catch(() => setTrabajadores([]));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setError('');
        if (initialData) {
            setForm({
                nombre: initialData.nombre || '',
                email: initialData.email || '',
                password: '',
                activo: initialData.activo ?? true,
                rol_id: initialData.rol_id || '',
                trabajador_id: initialData.trabajador_id || '',
            });
        } else {
            setForm({ ...emptyForm });
        }
    }, [isOpen, initialData]);

    const selectedRole = roles.find((r) => r.id === form.rol_id) || null;
    const needsTrabajador = !!selectedRole?.solo_propios;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isEdit) {
            if (!form.email.trim()) { setError('El email es obligatorio.'); return; }
            if (!form.password || form.password.length < 6) { setError('La contraseña es obligatoria (mínimo 6 caracteres).'); return; }
        } else if (form.password && form.password.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres.'); return;
        }
        if (!isSuperadmin && !form.rol_id) { setError('Selecciona un rol para el usuario.'); return; }
        if (needsTrabajador && !form.trabajador_id) {
            setError('Este rol ve solo sus propios registros: vincula al trabajador correspondiente.'); return;
        }

        setSubmitting(true);
        setError('');
        try {
            const trabajador_id = form.trabajador_id || null;
            if (isEdit) {
                const payload: any = {
                    nombre: form.nombre.trim() || null,
                    activo: form.activo,
                    trabajador_id,
                };
                if (!isSuperadmin) payload.rol_id = form.rol_id || null;
                if (form.password) payload.password = form.password;
                await api.patch(`/usuarios/${initialData!.id}`, payload);
                toast.success('Usuario actualizado.');
            } else {
                await api.post('/usuarios', {
                    email: form.email.trim(),
                    password: form.password,
                    nombre: form.nombre.trim() || undefined,
                    rol_id: form.rol_id || null,
                    trabajador_id,
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

    const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition disabled:opacity-60 disabled:cursor-not-allowed';
    const labelCls = 'text-xs font-semibold text-slate-500 uppercase tracking-wide';

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-slate-900">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
                        <p className="text-sm text-slate-500">{isEdit ? 'Actualiza los datos y el rol del usuario.' : 'Crea un usuario y asígnale un rol.'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition shrink-0"><X size={22} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 overflow-y-auto">
                    {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Nombre</label>
                            <input className={inputCls} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Ana López" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Email {!isEdit && '*'}</label>
                            <input type="email" className={inputCls} value={form.email} disabled={isEdit} onChange={(e) => set('email', e.target.value)} placeholder="correo@empresa.com" />
                            {isEdit && <p className="text-xs text-slate-400">El email no se puede modificar.</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Contraseña {!isEdit && '*'}</label>
                            <input type="password" className={inputCls} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isEdit ? 'Dejar en blanco para no cambiar' : 'Mínimo 6 caracteres'} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Rol {!isSuperadmin && '*'}</label>
                            {isSuperadmin ? (
                                <input className={inputCls} value="SUPERADMIN (plataforma)" disabled />
                            ) : (
                                <Select
                                    value={form.rol_id}
                                    onChange={(v) => set('rol_id', v)}
                                    options={roles.map((r) => ({ value: r.id, label: r.nombre }))}
                                    placeholder="— Selecciona un rol —"
                                />
                            )}
                        </div>
                    </div>

                    {/* Resumen del rol seleccionado */}
                    {selectedRole && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#FFC933]/15 border border-[#FFC933]/40 text-sm text-slate-700">
                            <ShieldCheck size={18} className="text-[#1a1a1c] shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-slate-900">{selectedRole.nombre}</p>
                                <p>
                                    {selectedRole.es_admin
                                        ? 'Administrador: ve todos los módulos y puede administrar.'
                                        : `Verá ${selectedRole.modulos.length} módulo(s).`}
                                    {selectedRole.solo_propios && ' Solo verá sus propios registros.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Estado activo */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Usuario activo</p>
                            <p className="text-xs text-slate-500">Los usuarios inactivos no pueden iniciar sesión.</p>
                        </div>
                        <button type="button" role="switch" aria-checked={form.activo} onClick={() => set('activo', !form.activo)}
                            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${form.activo ? 'bg-[#1a1a1c]' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {/* Trabajador vinculado (para roles "solo sus registros") */}
                    {!isSuperadmin && (
                        <div className="space-y-1.5 rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 text-slate-800 font-bold mb-1">
                                <KeyRound size={16} className="text-[#1a1a1c]" />
                                <span className="text-sm">Trabajador vinculado {needsTrabajador && <span className="text-red-500">*</span>}</span>
                            </div>
                            <Select
                                value={form.trabajador_id}
                                onChange={(v) => set('trabajador_id', v)}
                                options={trabajadores.map((t) => ({ value: t.id, label: `${t.nombre_completo}${t.id_trabajador ? ` (${t.id_trabajador})` : ''}` }))}
                                placeholder="— Sin vincular —"
                            />
                            <p className="text-xs text-slate-400">
                                {needsTrabajador
                                    ? 'Obligatorio: identifica de qué persona son los peajes, combustible y operaciones que verá.'
                                    : 'Opcional. Necesario solo si el rol restringe a "sus propios registros".'}
                            </p>
                        </div>
                    )}
                </form>

                <div className="p-4 sm:p-6 border-t border-slate-100 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition">Cancelar</button>
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
