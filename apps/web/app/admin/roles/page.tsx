'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/api';
import { MODULES } from '../../../lib/modules';
import { ShieldCheck, Plus, Pencil, Trash2, Loader2, AlertTriangle, Users, Crown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import RolModal, { Rol } from './RolModal';

function TipoBadge({ rol }: { rol: Rol }) {
    if (rol.es_admin) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-[#1a1a1c] text-[#FFC933]">
                <Crown size={12} /> Administrador
            </span>
        );
    }
    if (rol.solo_propios) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-[#FFC933] text-[#1a1a1c]">
                <Lock size={12} /> Restringido a lo suyo
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600">
            <ShieldCheck size={12} /> Estándar
        </span>
    );
}

export default function RolesPage() {
    const [roles, setRoles] = useState<Rol[]>([]);
    const [loading, setLoading] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Rol | null>(null);
    const [toDelete, setToDelete] = useState<Rol | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchData = useCallback(() => {
        setLoading(true);
        api.get('/roles')
            .then((res) => setRoles(Array.isArray(res.data) ? res.data : []))
            .catch((err) => {
                console.error('Error fetching roles:', err);
                toast.error(err?.response?.data?.message || 'No se pudieron cargar los roles.');
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openCreate = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (r: Rol) => { setEditing(r); setModalOpen(true); };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/roles/${toDelete.id}`);
            setRoles((prev) => prev.filter((r) => r.id !== toDelete.id));
            toast.success('Rol eliminado.');
            setToDelete(null);
        } catch (err: any) {
            console.error('Error deleting role:', err);
            toast.error(err?.response?.data?.message || 'No se pudo eliminar el rol.');
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
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gestión de roles</h1>
                        <p className="text-sm text-slate-500">Define perfiles de acceso y los módulos que cada uno puede ver.</p>
                    </div>
                    <span className="min-w-[28px] h-6 px-2 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-sm font-bold">
                        {roles.length}
                    </span>
                </div>
                <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a1c] hover:bg-[#2a2a2e] text-white text-sm font-medium transition self-start">
                    <Plus size={16} /> Nuevo rol
                </button>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-slate-400">
                                {['Rol', 'Tipo', 'Módulos', 'Usuarios'].map((h) => (
                                    <th key={h} className="px-5 py-3.5 font-medium">{h}</th>
                                ))}
                                <th className="px-5 py-3.5 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-16 text-slate-400">Cargando roles...</td></tr>
                            ) : roles.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-16 text-slate-400">No hay roles registrados.</td></tr>
                            ) : roles.map((r) => (
                                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                    <td className="px-5 py-3.5">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-slate-900 truncate">{r.nombre}</div>
                                            {r.descripcion && (
                                                <div className="text-xs text-slate-500 truncate">{r.descripcion}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5"><TipoBadge rol={r} /></td>
                                    <td className="px-5 py-3.5">
                                        {r.es_admin ? (
                                            <span className="text-sm font-medium text-slate-700">Todos</span>
                                        ) : (
                                            <span className="text-sm text-slate-600">
                                                {(r.modulos?.length || 0)} de {MODULES.length}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                                            <Users size={14} className="text-slate-400" />
                                            {r.usuarios_count ?? 0}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button onClick={() => openEdit(r)} title="Editar" className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
                                                <Pencil size={15} />
                                            </button>
                                            <button
                                                onClick={() => setToDelete(r)}
                                                title="Eliminar"
                                                className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 flex items-center justify-center text-slate-500 transition"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal crear / editar */}
            <RolModal
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
                                <h3 className="text-lg font-bold text-slate-900">Eliminar rol</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    ¿Seguro que deseas eliminar el rol <span className="font-semibold text-slate-700">{toDelete.nombre}</span>? Esta acción no se puede deshacer.
                                </p>
                                {(toDelete.usuarios_count ?? 0) > 0 && (
                                    <p className="text-xs text-amber-600 mt-2">
                                        Este rol tiene {toDelete.usuarios_count} usuario(s) asignado(s); el sistema podría impedir su eliminación.
                                    </p>
                                )}
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
