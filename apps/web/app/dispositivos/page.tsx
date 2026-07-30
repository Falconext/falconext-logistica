
"use client";

import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Plus, Smartphone, Trash2, Copy, Map, X, Truck, Clock, Pencil, AlertTriangle, User } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { MapboxLiveMap as LiveMapReal } from "../../components/tracking/MapboxLiveMap";
import Select from "../../components/Select";
import { useT } from "../../lib/i18n";

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
    const t = useT();
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
            toast.error(t('dispositivos.lista.toasts.errorCargar'));
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
                toast.success(t('dispositivos.lista.toasts.actualizadoExitoso'));
            } else {
                await api.post("/gps/devices", {
                    ...payload,
                    vehiculoId: selectedVehiculo || undefined,
                    trabajadorId: selectedTrabajador || undefined,
                });
                toast.success(t('dispositivos.lista.toasts.creadoExitoso'));
            }
            closeModal();
            fetchDevices();
        } catch (error) {
            console.error(error);
            toast.error(editingDevice ? t('dispositivos.lista.toasts.errorActualizar') : t('dispositivos.lista.toasts.errorCrear'));
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingDevice) return;
        setDeleting(true);
        try {
            await api.delete(`/gps/devices/${deletingDevice.id}`);
            toast.success(t('dispositivos.lista.toasts.eliminadoExitoso'));
            setDeletingDevice(null);
            fetchDevices();
        } catch (error) {
            console.error(error);
            toast.error(t('dispositivos.lista.toasts.errorEliminar'));
        } finally {
            setDeleting(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('dispositivos.lista.toasts.tokenCopiado'));
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{t('dispositivos.lista.titulo')}</h1>
                    <p className="text-slate-500 mt-2">{t('dispositivos.lista.subtitulo')}</p>
                </div>
                <button
                    onClick={openCreate}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Plus size={20} />
                    {t('dispositivos.lista.nuevoDispositivo')}
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">{t('dispositivos.lista.cargando')}</div>
            ) : devices.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800">
                    <Smartphone size={48} className="mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">{t('dispositivos.lista.vacioTitulo')}</h3>
                    <p className="text-slate-500 mt-1">{t('dispositivos.lista.vacioDescripcion')}</p>
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
                                                <span className="text-[10px] text-slate-400 italic">{t('dispositivos.lista.sinVehiculo')}</span>
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
                                    )} title={device.last_activity ? t('dispositivos.lista.estadoConectado') : t('dispositivos.lista.estadoSinActividad')} />
                                    <button
                                        onClick={() => openEdit(device)}
                                        title={t('dispositivos.lista.editarDispositivoTitle')}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => setDeletingDevice(device)}
                                        title={t('dispositivos.lista.eliminarDispositivoTitle')}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">{t('dispositivos.lista.tokenAcceso')}</p>
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
                                    <Map size={16} /> {t('dispositivos.lista.verEnMapa')}
                                </button>

                                <a
                                    href={`/dispositivos/${device.id}/historial`}
                                    className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
                                >
                                    <Clock size={16} /> {t('dispositivos.lista.historial')}
                                </a>

                                <div className="text-xs text-slate-500 flex justify-between">
                                    <span>{t('dispositivos.lista.ultimaActividad')}</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                        {device.last_activity
                                            ? new Date(device.last_activity).toLocaleString()
                                            : t('dispositivos.lista.nunca')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Map Modal */}
            {viewingDevice && (
                <div className="fixed inset-0 top-[-32px] z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[88vh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 bg-white dark:bg-slate-900">
                            <div className="min-w-0">
                                <h2 className="font-bold text-base sm:text-lg dark:text-white flex items-center gap-2 truncate">
                                    <Smartphone size={18} className="text-blue-500 shrink-0" />
                                    <span className="truncate">{t('dispositivos.lista.rastreoEnVivo', { name: viewingDevice.name })}</span>
                                </h2>
                                <p className="text-xs text-slate-500 truncate">{t('dispositivos.lista.imei', { imei: viewingDevice.imei })}</p>
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
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0F172A] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                {editingDevice ? t('dispositivos.lista.modal.editarTitulo') : t('dispositivos.lista.modal.crearTitulo')}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {editingDevice
                                    ? t('dispositivos.lista.modal.editarSubtitulo')
                                    : t('dispositivos.lista.modal.crearSubtitulo')}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('dispositivos.lista.modal.nombreLabel')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder={t('dispositivos.lista.modal.nombrePlaceholder')}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('dispositivos.lista.modal.identificadorLabel')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder={t('dispositivos.lista.modal.identificadorPlaceholder')}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={newImei}
                                    onChange={(e) => setNewImei(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('dispositivos.lista.modal.vehiculoLabel')}
                                </label>
                                <Select
                                    value={selectedVehiculo}
                                    onChange={(v) => setSelectedVehiculo(v)}
                                    options={vehiculos.map(v => ({ value: v.id, label: `${v.placa} - ${v.marca_modelo}` }))}
                                    placeholder={t('dispositivos.lista.modal.vehiculoPlaceholder')}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('dispositivos.lista.modal.trabajadorLabel')}
                                </label>
                                <Select
                                    value={selectedTrabajador}
                                    onChange={(v) => setSelectedTrabajador(v)}
                                    options={trabajadores.map(tr => ({ value: tr.id, label: tr.cargo ? `${tr.nombre_completo} — ${tr.cargo}` : tr.nombre_completo }))}
                                    placeholder={t('dispositivos.lista.modal.trabajadorPlaceholder')}
                                    clearable
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                                >
                                    {t('dispositivos.lista.modal.cancelar')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creating
                                        ? (editingDevice ? t('dispositivos.lista.modal.guardando') : t('dispositivos.lista.modal.creando'))
                                        : (editingDevice ? t('dispositivos.lista.modal.guardarCambios') : t('dispositivos.lista.modal.crearDispositivo'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Confirmar Eliminación */}
            {deletingDevice && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0F172A] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] overflow-hidden border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-11 h-11 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                                    <AlertTriangle size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('dispositivos.lista.eliminarModal.titulo')}</h2>
                                    <p className="text-sm text-slate-500">{t('dispositivos.lista.eliminarModal.subtitulo')}</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {t('dispositivos.lista.eliminarModal.confirmacionPre')} <span className="font-semibold text-slate-900 dark:text-white">{deletingDevice.name}</span>{t('dispositivos.lista.eliminarModal.confirmacionPost')}
                            </p>
                            <div className="flex gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setDeletingDevice(null)}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium disabled:opacity-50"
                                >
                                    {t('dispositivos.lista.eliminarModal.cancelar')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-lg shadow-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deleting ? t('dispositivos.lista.eliminarModal.eliminando') : t('dispositivos.lista.eliminarModal.eliminar')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
