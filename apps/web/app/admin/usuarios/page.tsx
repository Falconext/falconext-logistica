'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/api';
import { MODULES } from '../../../lib/modules';
import { useAuthStore } from '../../../lib/store';
import { UserCog, Plus, Pencil, Trash2, Loader2, AlertTriangle, ShieldCheck, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import UsuarioModal, { Usuario } from './UsuarioModal';

function isAdminLike(role?: string) {
    const r = (role || '').toUpperCase();
    return r === 'ADMIN' || r === 'SUPERADMIN';
}

function RoleBadge({ role }: { role: string }) {
    const r = (role || '').toUpperCase();
    const styles: Record<string, string> = {
        SUPERADMIN: 'bg-[#1a1a1c] text-[#FFC933]',
        ADMIN: 'bg-[#FFC933] text-[#1a1a1c]',
        USER: 'bg-slate-100 text-slate-600',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${styles[r] || styles.USER}`}>
            {isAdminLike(r) ? <ShieldCheck size={12} /> : <UserIcon size={12} />}
            {r || 'USER'}
        </span>
    );
}

export default function UsuariosPage() {
    const { user: currentUser } = useAuthStore();
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Usuario | null>(null);
    const [toDelete, setToDelete] = useState<Usuario | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchData = useCallback(() => {
        setLoading(true);
        api.get('/usuarios')
            .then((res) => setUsuarios(res.data))
            .catch((err) => {
                console.error('Error fetching users:', err);
                toast.error(err?.response?.data?.message || 'No se pudieron cargar los usuarios.');
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openCreate = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (u: Usuario) => { setEditing(u); setModalOpen(true); };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/usuarios/${toDelete.id}`);
            setUsuarios((prev) => prev.filter((u) => u.id !== toDelete.id));
            toast.success('Usuario eliminado.');
            setToDelete(null);
        } catch (err: any) {
            console.error('Error deleting user:', err);
            toast.error(err?.response?.data?.message || 'No se pudo eliminar el usuario.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1a1a1c] flex items-center justify-center text-[#FFC933] shrink-0">
                        <UserCog size={20} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Administración de usuarios</h1>
                        <p className="text-sm text-slate-500">Gestiona el acceso y los módulos visibles de cada usuario.</p>
                    </div>
                    <span className="min-w-[28px] h-6 px-2 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-sm font-bold">
                        {usuarios.length}
                    </span>
                </div>
                <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition self-start">
                    <Plus size={16} /> Nuevo usuario
                </button>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-slate-400">
                                {['Usuario', 'Rol', 'Módulos', 'Estado'].map((h) => (
                                    <th key={h} className="px-5 py-3.5 font-medium">{h}</th>
                                ))}
                                <th className="px-5 py-3.5 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-16 text-slate-400">Cargando usuarios...</td></tr>
                            ) : usuarios.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-16 text-slate-400">No hay usuarios registrados.</td></tr>
                            ) : usuarios.map((u) => {
                                const admin = isAdminLike(u.role);
                                const isSelf = currentUser?.id === u.id;
                                return (
                                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                                                    {(u.nombre || u.email).charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-900 truncate">{u.nombre || u.email.split('@')[0]}</div>
                                                    <div className="text-xs text-slate-500 truncate">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                                        <td className="px-5 py-3.5">
                                            {admin ? (
                                                <span className="text-sm font-medium text-slate-700">Todos</span>
                                            ) : (
                                                <span className="text-sm text-slate-600">
                                                    {(u.modulos?.length || 0)} de {MODULES.length}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${u.activo ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                <span className={`w-2 h-2 rounded-full ${u.activo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                {u.activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button onClick={() => openEdit(u)} title="Editar" className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    onClick={() => setToDelete(u)}
                                                    disabled={isSelf}
                                                    title={isSelf ? 'No puedes eliminar tu propio usuario' : 'Eliminar'}
                                                    className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 flex items-center justify-center text-slate-500 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal crear / editar */}
            <UsuarioModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={fetchData}
                initialData={editing}
            />

            {/* Confirmación de eliminación */}
            {toDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl p-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Eliminar usuario</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    ¿Seguro que deseas eliminar a <span className="font-semibold text-slate-700">{toDelete.nombre || toDelete.email}</span>? Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setToDelete(null)} disabled={deleting}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition disabled:opacity-60">
                                Cancelar
                            </button>
                            <button onClick={confirmDelete} disabled={deleting}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition disabled:opacity-60">
                                {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
