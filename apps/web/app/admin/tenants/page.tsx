'use client';

import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import { CURRENCIES, CurrencyCode, normalizeCurrency } from '../../../lib/currency';
import Select from '../../../components/Select';
import { Building, Users, Truck, Plus, ShieldCheck, X, Pencil, Trash2, Coins } from 'lucide-react';
import { toast } from 'sonner';

type Tenant = {
    id: string;
    name: string;
    slug: string;
    plan: string;
    moneda?: string | null;
    _count?: { users?: number; vehiculos?: number };
};

const emptyForm = {
    name: '',
    slug: '',
    plan: 'FREE',
    moneda: 'EUR' as CurrencyCode,
    adminEmail: '',
    adminPassword: '',
};

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Modal / form state. editing = null -> creando ; editing = Tenant -> editando.
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Tenant | null>(null);
    const [formData, setFormData] = useState({ ...emptyForm });

    // Confirmación de borrado
    const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchTenants = () => {
        setLoading(true);
        api.get('/tenants')
            .then(res => { setTenants(res.data); setError(null); })
            .catch(err => {
                console.error(err);
                setError(err.response?.data?.message || 'No se pudieron cargar las empresas');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    const openCreate = () => {
        setEditing(null);
        setFormData({ ...emptyForm });
        setShowForm(true);
    };

    const openEdit = (t: Tenant) => {
        setEditing(t);
        setFormData({
            name: t.name || '',
            slug: t.slug || '',
            plan: t.plan || 'FREE',
            moneda: normalizeCurrency(t.moneda),
            adminEmail: '',
            adminPassword: '',
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditing(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const toastId = toast.loading(editing ? 'Guardando cambios...' : 'Creando empresa...');
        try {
            if (editing) {
                // PATCH: solo campos editables (name, plan, moneda).
                await api.patch(`/tenants/${editing.id}`, {
                    name: formData.name,
                    plan: formData.plan,
                    moneda: formData.moneda,
                });
                toast.success('Empresa actualizada', { id: toastId });
            } else {
                await api.post('/tenants', {
                    name: formData.name,
                    slug: formData.slug,
                    plan: formData.plan,
                    moneda: formData.moneda,
                    adminEmail: formData.adminEmail,
                    adminPassword: formData.adminPassword,
                });
                toast.success('Empresa creada exitosamente', { id: toastId });
            }
            closeForm();
            fetchTenants();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Error al guardar la empresa', { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const toastId = toast.loading('Eliminando empresa...');
        try {
            await api.delete(`/tenants/${deleteTarget.id}`);
            toast.success('Empresa eliminada', { id: toastId });
            setDeleteTarget(null);
            fetchTenants();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Error al eliminar la empresa', { id: toastId });
        } finally {
            setDeleting(false);
        }
    };

    const inputClass =
        'w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60 disabled:cursor-not-allowed';

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <ShieldCheck className="text-blue-600 shrink-0" />
                        Gestión de Empresas
                    </h1>
                    <p className="text-slate-500 mt-1">Superadmin Dashboard</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition shadow-lg shadow-blue-500/20 w-full sm:w-auto"
                >
                    <Plus size={18} />
                    Nueva Empresa
                </button>
            </div>

            {/* Modal crear / editar */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center gap-3 p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="font-bold text-xl text-slate-900 dark:text-white">
                                {editing ? 'Editar Empresa' : 'Registrar Nueva Empresa'}
                            </h3>
                            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nombre Empresa</label>
                                    <input
                                        type="text" placeholder="Ej. Logística Express" required
                                        className={inputClass}
                                        value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Slug (URL)
                                        {editing && <span className="text-xs text-slate-400 font-normal ml-1">(no editable)</span>}
                                    </label>
                                    <input
                                        type="text" placeholder="Ej. logistica-express" required={!editing}
                                        disabled={!!editing}
                                        className={inputClass}
                                        value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })}
                                    />
                                </div>

                                {!editing && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Admin</label>
                                            <input
                                                type="email" placeholder="admin@empresa.com" required
                                                className={inputClass}
                                                value={formData.adminEmail} onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña Admin</label>
                                            <input
                                                type="password" placeholder="••••••••" required minLength={6}
                                                className={inputClass}
                                                value={formData.adminPassword} onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Plan de Suscripción</label>
                                    <Select
                                        value={formData.plan}
                                        onChange={v => setFormData({ ...formData, plan: v })}
                                        options={[
                                            { value: 'FREE', label: 'Plan Gratuito (Básico)' },
                                            { value: 'PRO', label: 'Plan Pro (Avanzado)' },
                                            { value: 'ENTERPRISE', label: 'Enterprise (Completo)' },
                                        ]}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                        <Coins size={14} className="text-blue-500" />
                                        Moneda (Divisa)
                                    </label>
                                    <Select
                                        value={formData.moneda}
                                        onChange={v => setFormData({ ...formData, moneda: v as CurrencyCode })}
                                        options={(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => ({
                                            value: code,
                                            label: `${CURRENCIES[code].symbol} — ${CURRENCIES[code].label} (${code})`,
                                        }))}
                                    />
                                    <p className="text-xs text-slate-400">Divisa en la que la empresa verá todos sus montos.</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="px-5 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 transition"
                                >
                                    {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Empresa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirmación de eliminación */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600">
                                    <Trash2 size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Eliminar empresa</h3>
                                    <p className="text-sm text-slate-500">Esta acción no se puede deshacer.</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                ¿Seguro que deseas eliminar <span className="font-semibold text-slate-900 dark:text-white">{deleteTarget.name}</span>?
                                Se perderán sus usuarios y datos asociados.
                            </p>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setDeleteTarget(null)}
                                    className="px-5 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-medium shadow-lg shadow-red-500/25 transition"
                                >
                                    {deleting ? 'Eliminando...' : 'Eliminar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4">
                {loading && (
                    <div className="text-center py-12 text-slate-400">Cargando empresas...</div>
                )}

                {tenants.map((t) => {
                    const code = normalizeCurrency(t.moneda);
                    return (
                        <div key={t.id} className="bg-white dark:bg-[#0f172a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:justify-between md:items-center gap-4 shadow-sm hover:border-blue-500/30 transition group">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 group-hover:text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition">
                                    <Building size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">{t.name}</h3>
                                    <p className="text-sm text-slate-500">
                                        Plan: <span className="font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded text-xs">{t.plan}</span>
                                        {' • '}<span className="text-slate-400">{t.slug}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-slate-500">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Moneda</span>
                                    <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                                        <Coins size={16} className="text-blue-500" /> {CURRENCIES[code].symbol} {code}
                                    </div>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Usuarios</span>
                                    <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                                        <Users size={16} /> {t._count?.users || 0}
                                    </div>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vehículos</span>
                                    <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                                        <Truck size={16} /> {t._count?.vehiculos || 0}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 pl-2 border-l border-slate-100 dark:border-slate-800">
                                    <button
                                        onClick={() => openEdit(t)}
                                        title="Editar empresa"
                                        className="p-2.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteTarget(t)}
                                        title="Eliminar empresa"
                                        className="p-2.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {tenants.length === 0 && !loading && !error && (
                    <div className="text-center py-12 text-slate-500">
                        <Building className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700 mb-3 opacity-50" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No hay empresas registradas</h3>
                        <p>Comienza creando una nueva empresa.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
