
"use client";

import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Plus, Smartphone, Trash2, Copy, Map, X, Truck, Clock, Pencil, AlertTriangle, User } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { LiveMapReal } from "../../components/tracking/LiveMapReal";
import Select from "../../components/Select";

interface Device {
    id: string;
    name: string;
    imei: string;
    token: string;
    model: string | null;
    last_activity: string | null;
    vehiculo_id: string | null;
    vehiculo?: {
        id: string;
        placa: string;
        marca_modelo: string;
    };
    trabajador_id: string | null;
    trabajador?: {
        id: string;
        nombre_completo: string;
        cargo?: string;
        url_foto?: string | null;
    } | null;
}

export default function DispositivosPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [viewingDevice, setViewingDevice] = useState<Device | null>(null);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Device Form (create / edit)
    const [newName, setNewName] = useState("");
    const [newImei, setNewImei] = useState("");
    const [selectedVehiculo, setSelectedVehiculo] = useState("");
    const [vehiculos, setVehiculos] = useState<{ id: string, placa: string, marca_modelo: string }[]>([]);
    const [selectedTrabajador, setSelectedTrabajador] = useState("");
    const [trabajadores, setTrabajadores] = useState<{ id: string, nombre_completo: string, cargo: string }[]>([]);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchDevices();
        fetchVehiculos();
        fetchTrabajadores();
    }, []);

    const fetchVehiculos = async () => {
        try {
            const res = await api.get("/vehiculos");
            setVehiculos(res.data);
        } catch (error) {
            console.error("Error fetching vehicles:", error);
        }
    };

    const fetchTrabajadores = async () => {
        try {
            const res = await api.get("/trabajadores");
            setTrabajadores(res.data);
        } catch (error) {
            console.error("Error fetching workers:", error);
        }
    };

    const fetchDevices = async () => {
        try {
            const res = await api.get("/gps/devices");
            setDevices(res.data);
        } catch (error) {
            console.error("Error fetching devices:", error);
            toast.error("Error al cargar dispositivos");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setNewName("");
        setNewImei("");
        setSelectedVehiculo("");
        setSelectedTrabajador("");
    };

    const openCreate = () => {
        setEditingDevice(null);
        resetForm();
        setShowModal(true);
    };

    const openEdit = (device: Device) => {
        setEditingDevice(device);
        setNewName(device.name);
        setNewImei(device.imei);
        setSelectedVehiculo(device.vehiculo_id || "");
        setSelectedTrabajador(device.trabajador_id || "");
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingDevice(null);
        resetForm();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newImei) return;

        setCreating(true);
        try {
            const payload = {
                name: newName,
                imei: newImei,
                vehiculoId: selectedVehiculo || null,
                trabajadorId: selectedTrabajador || null,
            };
            if (editingDevice) {
                await api.patch(`/gps/devices/${editingDevice.id}`, payload);
                toast.success("Dispositivo actualizado exitosamente");
            } else {
                await api.post("/gps/devices", {
                    ...payload,
                    vehiculoId: selectedVehiculo || undefined,
                    trabajadorId: selectedTrabajador || undefined,
                });
                toast.success("Dispositivo creado exitosamente");
            }
            closeModal();
            fetchDevices();
        } catch (error) {
            console.error(error);
            toast.error(editingDevice ? "Error al actualizar dispositivo" : "Error al crear dispositivo");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingDevice) return;
        setDeleting(true);
        try {
            await api.delete(`/gps/devices/${deletingDevice.id}`);
            toast.success("Dispositivo eliminado exitosamente");
            setDeletingDevice(null);
            fetchDevices();
        } catch (error) {
            console.error(error);
            toast.error("Error al eliminar dispositivo");
        } finally {
            setDeleting(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Token copiado al portapapeles");
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Dispositivos GPS</h1>
                    <p className="text-slate-500 mt-2">Gestiona los dispositivos y obtén sus tokens de acceso.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Plus size={20} />
                    Nuevo Dispositivo
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">Cargando...</div>
            ) : devices.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800">
                    <Smartphone size={48} className="mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">No hay dispositivos</h3>
                    <p className="text-slate-500 mt-1">Registra tu primer dispositivo GPS o App Móvil.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {devices.map((device) => (
                        <div key={device.id} className="bg-white dark:bg-slate-900/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Smartphone size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">{device.name}</h3>
                                        <p className="text-xs text-slate-500 font-mono mb-1">{device.imei}</p>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {device.vehiculo ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wide">
                                                    <Truck size={10} /> {device.vehiculo.placa}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 italic">Sin vehículo</span>
                                            )}
                                            {device.trabajador && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
                                                    <User size={10} /> {device.trabajador.nombre_completo}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Status Indicator */}
                                    <div className={clsx(
                                        "w-3 h-3 rounded-full",
                                        device.last_activity ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300 dark:bg-slate-700"
                                    )} title={device.last_activity ? "Conectado recientemente" : "Sin actividad reciente"} />
                                    <button
                                        onClick={() => openEdit(device)}
                                        title="Editar dispositivo"
                                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => setDeletingDevice(device)}
                                        title="Eliminar dispositivo"
                                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Token de Acceso</p>
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400 truncate select-all">{device.token}</code>
                                        <button onClick={() => copyToClipboard(device.token)} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-blue-500 transition-colors">
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setViewingDevice(device)}
                                    className="w-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Map size={16} /> Ver en Mapa
                                </button>

                                <a
                                    href={`/dispositivos/${device.id}/historial`}
                                    className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
                                >
                                    <Clock size={16} /> Historial
                                </a>

                                <div className="text-xs text-slate-500 flex justify-between">
                                    <span>Última actividad:</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                        {device.last_activity
                                            ? new Date(device.last_activity).toLocaleString()
                                            : 'Nunca'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Map Modal */}
            {viewingDevice && (
                <div className="fixed inset-0 z-50 top-[-32px] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] sm:h-[80vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 bg-white dark:bg-slate-900">
                            <div className="min-w-0">
                                <h2 className="font-bold text-base sm:text-lg dark:text-white flex items-center gap-2 truncate">
                                    <Smartphone size={18} className="text-blue-500 shrink-0" />
                                    <span className="truncate">Rastreo en Vivo: {viewingDevice.name}</span>
                                </h2>
                                <p className="text-xs text-slate-500 truncate">IMEI: {viewingDevice.imei}</p>
                            </div>
                            <button
                                onClick={() => setViewingDevice(null)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors shrink-0"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 relative bg-slate-100 dark:bg-slate-950">
                            <LiveMapReal
                                deviceId={viewingDevice.id}
                                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                                vehiclePlate={viewingDevice.vehiculo?.placa}
                                deviceName={viewingDevice.name}
                                workerName={viewingDevice.trabajador?.nombre_completo}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Crear Dispositivo */}
            {showModal && (
                <div className="fixed inset-0 top-[-32px] z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-[#0F172A] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
                        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                {editingDevice ? "Editar Dispositivo" : "Registrar Dispositivo"}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {editingDevice
                                    ? "Actualiza los datos del GPS o App Móvil"
                                    : "Crea un nuevo acceso para un GPS o App Móvil"}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Nombre del Dispositivo
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Celular Juan Perez"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Identificador (IMEI o ID Único)
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: imei-123456789"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={newImei}
                                    onChange={(e) => setNewImei(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Asignar Vehículo (Opcional)
                                </label>
                                <Select
                                    value={selectedVehiculo}
                                    onChange={(v) => setSelectedVehiculo(v)}
                                    options={vehiculos.map(v => ({ value: v.id, label: `${v.placa} - ${v.marca_modelo}` }))}
                                    placeholder="-- Sin asignar --"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Asignar Trabajador / Conductor (Opcional)
                                </label>
                                <Select
                                    value={selectedTrabajador}
                                    onChange={(v) => setSelectedTrabajador(v)}
                                    options={trabajadores.map(t => ({ value: t.id, label: t.cargo ? `${t.nombre_completo} — ${t.cargo}` : t.nombre_completo }))}
                                    placeholder="-- Sin asignar --"
                                    clearable
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creating
                                        ? (editingDevice ? "Guardando..." : "Creando...")
                                        : (editingDevice ? "Guardar Cambios" : "Crear Dispositivo")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Confirmar Eliminación */}
            {deletingDevice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-[#0F172A] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-11 h-11 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                                    <AlertTriangle size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Eliminar Dispositivo</h2>
                                    <p className="text-sm text-slate-500">Esta acción no se puede deshacer</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                ¿Seguro que deseas eliminar <span className="font-semibold text-slate-900 dark:text-white">{deletingDevice.name}</span>? Se perderá su token de acceso.
                            </p>
                            <div className="flex gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setDeletingDevice(null)}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-lg shadow-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deleting ? "Eliminando..." : "Eliminar"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
