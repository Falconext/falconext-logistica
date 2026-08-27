'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GeofencesMap, GeofenceEditorMap } from '../../components/tracking/MapboxGeofences';
import { Plus, Trash, MapPin, X, Save, AlertCircle, Pencil } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';
import { useT } from '../../lib/i18n';

const defaultCenter = { lat: 45.4642, lng: 9.1900 }; // Milano

// Interfaces
interface Geofence {
    id: string;
    name: string;
    description?: string;
    latitude: number;
    longitude: number;
    radius: number; // meters
}

export default function GeocercasPage() {
    const t = useT();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [geofences, setGeofences] = useState<Geofence[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);

    // Geofence Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newCenter, setNewCenter] = useState<{ lat: number, lng: number }>(defaultCenter);
    const [newRadius, setNewRadius] = useState<number>(500); // 500m default
    const [editorCenter, setEditorCenter] = useState<{ lat: number, lng: number }>(defaultCenter); // map center at open time

    // Delete confirmation state
    const [deleteTarget, setDeleteTarget] = useState<Geofence | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchGeofences();
    }, []);

    const fetchGeofences = async () => {
        try {
            const res = await api.get('/gps/geofences');
            setGeofences(res.data);
        } catch (error) {
            console.error(error);
            toast.error(t('geocercas.toasts.errorCargar'));
        } finally {
            setLoading(false);
        }
    };

    const openCreate = () => {
        setEditingId(null);
        setNewName("");
        setNewDesc("");
        setNewCenter(defaultCenter);
        setEditorCenter(defaultCenter);
        setNewRadius(500);
        setShowModal(true);
    };

    const openEdit = (gf: Geofence) => {
        setEditingId(gf.id);
        setNewName(gf.name);
        setNewDesc(gf.description || "");
        setNewCenter({ lat: gf.latitude, lng: gf.longitude });
        setEditorCenter({ lat: gf.latitude, lng: gf.longitude });
        setNewRadius(gf.radius);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!newName) return toast.error(t('geocercas.toasts.nombreObligatorio'));

        const payload = {
            name: newName,
            description: newDesc,
            latitude: newCenter.lat,
            longitude: newCenter.lng,
            radius: newRadius,
        };

        setSaving(true);
        try {
            if (editingId) {
                await api.patch(`/gps/geofences/${editingId}`, payload);
                toast.success(t('geocercas.toasts.actualizadoExitoso'));
            } else {
                await api.post('/gps/geofences', payload);
                toast.success(t('geocercas.toasts.creadoExitoso'));
            }
            setShowModal(false);
            setEditingId(null);
            setNewName("");
            setNewDesc("");
            fetchGeofences();
        } catch (error) {
            console.error(error);
            toast.error(editingId ? t('geocercas.toasts.errorActualizar') : t('geocercas.toasts.errorCrear'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/gps/geofences/${deleteTarget.id}`);
            toast.success(t('geocercas.toasts.eliminadoExitoso'));
            setDeleteTarget(null);
            fetchGeofences();
        } catch (error) {
            console.error(error);
            toast.error(t('geocercas.toasts.errorEliminar'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] lg:h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('geocercas.header.titulo')}</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('geocercas.header.subtitulo')}</p>
                </div>
                <button
                    onClick={openCreate}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Plus size={20} />
                    {t('geocercas.header.nuevaGeocerca')}
                </button>
            </div>

            <div className="flex-1 p-4 sm:p-6 flex flex-col lg:flex-row gap-4 lg:gap-6 overflow-hidden">
                {/* Geofence List Sidebar */}
                <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-y-auto p-4 flex flex-col gap-3 max-h-[35vh] lg:max-h-none shrink-0">
                    {loading ? (
                        <p className="text-slate-500 text-center py-10">{t('geocercas.lista.cargando')}</p>
                    ) : geofences.length === 0 ? (
                        <div className="text-center py-10 opacity-60">
                            <MapPin size={48} className="mx-auto mb-2 text-slate-300" />
                            <p>{t('geocercas.lista.vacio')}</p>
                        </div>
                    ) : (
                        geofences.map(gf => (
                            <div key={gf.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600 group">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        {gf.name}
                                    </h3>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openEdit(gf)} title={t('geocercas.lista.editarTitle')} className="text-slate-400 hover:text-blue-600">
                                            <Pencil size={16} />
                                        </button>
                                        <button onClick={() => setDeleteTarget(gf)} title={t('geocercas.lista.eliminarTitle')} className="text-slate-400 hover:text-red-500">
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mb-2">{gf.description || t('geocercas.lista.sinDescripcion')}</p>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono bg-white dark:bg-slate-900/50 p-2 rounded-lg">
                                    <span>{t('geocercas.lista.radio', { radius: gf.radius })}</span>
                                    <span>{t('geocercas.lista.lat', { value: gf.latitude.toFixed(4) })}</span>
                                    <span>{t('geocercas.lista.lng', { value: gf.longitude.toFixed(4) })}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Map Visualization */}
                <div className="flex-1 min-h-[45vh] lg:min-h-0 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-2 overflow-hidden relative">
                    <GeofencesMap geofences={geofences} />
                </div>
            </div>

            {/* Create Geofence Modal */}
            {showModal && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-4xl h-[88vh] sm:h-[80vh] flex flex-col shadow-2xl overflow-hidden relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        {/* Close Button */}
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-4 right-4 z-10 bg-white/80 dark:bg-slate-800/80 p-2 rounded-full hover:bg-slate-100 transition-colors"
                        >
                            <X size={20} className="text-slate-600 dark:text-slate-300" />
                        </button>

                        <div className="flex flex-col md:flex-row h-full">
                            {/* Editor Panel */}
                            <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto max-h-[50vh] md:max-h-none shrink-0">
                                <h2 className="text-xl font-bold mb-6 text-slate-900 dark:text-white">{editingId ? t('geocercas.modal.editarTitulo') : t('geocercas.modal.nuevaTitulo')}</h2>

                                <div className="space-y-4 flex-1">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('geocercas.modal.nombreLabel')}</label>
                                        <input
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            placeholder={t('geocercas.modal.nombrePlaceholder')}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('geocercas.modal.descripcionLabel')}</label>
                                        <input
                                            value={newDesc}
                                            onChange={(e) => setNewDesc(e.target.value)}
                                            placeholder={t('geocercas.modal.descripcionPlaceholder')}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <hr className="border-slate-100 dark:border-slate-800" />

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('geocercas.modal.radioLabel')} <span className="text-blue-600 font-bold">{newRadius}m</span></label>
                                        <input
                                            type="range"
                                            min="50"
                                            max="5000"
                                            step="50"
                                            value={newRadius}
                                            onChange={(e) => setNewRadius(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                    </div>

                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex gap-3 items-start">
                                        <AlertCircle size={18} className="text-blue-600 mt-0.5 shrink-0" />
                                        <p className="text-xs text-blue-800 dark:text-blue-200">
                                            {t('geocercas.modal.ayudaMapa')}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    <Save size={18} />
                                    {saving ? t('geocercas.modal.guardando') : (editingId ? t('geocercas.modal.actualizarGeocerca') : t('geocercas.modal.guardarGeocerca'))}
                                </button>
                            </div>

                            {/* Map Editor */}
                            <div className="flex-1 relative min-h-[35vh] md:min-h-0">
                                <GeofenceEditorMap
                                    center={newCenter}
                                    radius={newRadius}
                                    onCenterChange={(lat, lng) => setNewCenter({ lat, lng })}
                                />
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-11 h-11 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <Trash size={20} className="text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white">{t('geocercas.eliminarModal.titulo')}</h3>
                                <p className="text-sm text-slate-500">{t('geocercas.eliminarModal.subtitulo')}</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                            {t('geocercas.eliminarModal.confirmacionPre')} <span className="font-semibold text-slate-900 dark:text-white">{deleteTarget.name}</span>{t('geocercas.eliminarModal.confirmacionPost')}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                            >
                                {t('geocercas.eliminarModal.cancelar')}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {deleting ? t('geocercas.eliminarModal.eliminando') : t('geocercas.eliminarModal.eliminar')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
