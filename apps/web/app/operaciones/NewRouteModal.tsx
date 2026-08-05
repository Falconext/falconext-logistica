'use client';

import { useState, useEffect } from 'react';
import { X, Save, Loader2, MapPin, Calendar, Clock, User, Truck, FileText, Package, Play, CheckCircle2, PauseCircle, Undo2, RefreshCw, Ban, Flag, Wallet, Plus, Trash2 } from 'lucide-react';
import { Programacion } from '../../types';
import api from '../../lib/api';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import FileUpload from '../../components/FileUpload';
import MultiFileUpload from '../../components/MultiFileUpload';
import { useCurrency } from '../../lib/useCurrency';
import { APP_OPTIONS, ESTADO_CONSEGNA_META } from './constants';

// Fila de gasto en el formulario (monto como string para el input).
type GastoRow = { tipo: string; monto: string; descripcion: string; numero_mancato: string; comprobantes: string[] };

const GASTO_TIPOS = [
    { value: 'PEAJE', label: 'Peaje' },
    { value: 'COMBUSTIBLE', label: 'Combustible' },
    { value: 'PARKING', label: 'Parking' },
    { value: 'OTRO', label: 'Otro' },
];

// Acciones de estado de consegna que el chofer/admin marca según avanza la ruta.
// El value es el estado que se guarda; label/Icon son la UI del botón.
const CONSEGNA_ACTIONS: { value: string; label: string; Icon: any }[] = [
    { value: 'IN_CONSEGNA', label: 'Iniciar consegna', Icon: Play },
    { value: 'CONSEGNATO', label: 'Consegnato', Icon: CheckCircle2 },
    { value: 'IN_SOSPESO', label: 'In Sospeso', Icon: PauseCircle },
    { value: 'RITIRATO', label: 'Ritirato', Icon: Undo2 },
    { value: 'RISCHEDULATO', label: 'Rischedulato', Icon: RefreshCw },
    { value: 'ANNULLATO', label: 'Annullato', Icon: Ban },
];
import { toast } from 'sonner';

interface NewRouteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: Programacion | null;
    // Si es false (chofer/autista), sólo se puede editar el Itinerario (origen/destino);
    // el resto de secciones queda de solo lectura.
    canEditAll?: boolean;
}

// Descompone un ISO en fecha/hora LOCALES (para que redondee con el submit, que
// interpreta `fecha`T`hora` en zona local). Devuelve '' si el valor es inválido/vacío.
const isoToDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const isoToTime = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
};

// Los datos legacy guardan vehiculo_id como "PLACA - MODELO" ("FG133WJ - FIAT FIORINO");
// el Select usa solo la placa como value. Extraemos la placa (primer token) para que
// preseleccione y, al guardar, quede normalizado a la placa.
const extractPlaca = (raw?: string): string => {
    if (!raw) return '';
    return raw.trim().split(/\s+/)[0];
};

export default function NewRouteModal({ isOpen, onClose, onSuccess, initialData, canEditAll = true }: NewRouteModalProps) {
    const lockOthers = !canEditAll; // chofer: bloquea todo menos el itinerario
    const { currency } = useCurrency();
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(false); // Added

    // Initial state with separate Date/Time for Pickup (Retiro) and Delivery (Entrega)
    const [formData, setFormData] = useState({
        // Resources
        vehiculo_id: '',
        trabajador_id: '',
        cliente: '',

        // Pickup
        retiro_lugar: '',
        retiro_fecha: new Date().toISOString().split('T')[0],
        retiro_hora: '',

        // Delivery
        entrega_lugar: '',
        entrega_fecha: new Date().toISOString().split('T')[0],
        entrega_hora: '',

        // Datos de consegna
        km: '',
        ciudad: '',
        app: '',
        compactado: false,
        estado_consegna: '',
        attesa: '',
        otros_datos: '',
        foto_bolla: '',

        // Rendición del chofer
        anticipo: '',
        gastos: [] as GastoRow[],

        nota: ''
    });

    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                try {
                    const [vRes, wRes] = await Promise.all([
                        api.get('/vehiculos'),
                        api.get('/trabajadores')
                    ]);
                    setVehicles(vRes.data);
                    setWorkers(wRes.data);
                } catch (error) {
                    toast.error('Error cargando recursos');
                }
            };
            fetchData();
        }
    }, [isOpen]);

    // Precargar el formulario al abrir: en modo edición con los datos de la operación,
    // en modo creación con los valores por defecto (reset). El ISO guardado se descompone
    // en fecha (YYYY-MM-DD) y hora (HH:mm) locales para que redondee bien al reenviar.
    useEffect(() => {
        if (!isOpen) return;
        const today = new Date().toISOString().split('T')[0];
        if (initialData?.id) {
            // `src` puede ser el item de la lista (resumido) o el registro completo.
            // trabajador_id guarda el UUID del Trabajador (data legacy puede traer el código).
            const populate = (src: any) => setFormData({
                vehiculo_id: extractPlaca(src.vehiculo_id),
                trabajador_id: src.trabajador_id || '',
                cliente: src.cliente || '',
                retiro_lugar: src.lugar_retiro || '',
                retiro_fecha: isoToDate(src.fecha_retiro) || today,
                retiro_hora: src.hora_retiro || isoToTime(src.fecha_retiro),
                entrega_lugar: src.lugar_entrega || '',
                entrega_fecha: isoToDate(src.fecha_entrega) || today,
                entrega_hora: isoToTime(src.fecha_entrega),
                km: src.km != null ? String(src.km) : '',
                ciudad: src.ciudad || '',
                app: src.app || '',
                compactado: !!src.compactado,
                estado_consegna: src.estado_consegna || '',
                attesa: src.attesa || '',
                otros_datos: src.otros_datos || '',
                foto_bolla: src.foto_bolla || '',
                anticipo: src.anticipo != null ? String(src.anticipo) : '',
                gastos: Array.isArray(src.gastos) ? src.gastos.map((g: any) => ({
                    tipo: g.tipo || 'OTRO',
                    monto: g.monto != null ? String(g.monto) : '',
                    descripcion: g.descripcion || '',
                    numero_mancato: g.numero_mancato || '',
                    comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes : [],
                })) : [],
                nota: src.nota || '',
            });
            // Precargamos rápido con lo que trae la lista y luego con el registro COMPLETO:
            // la lista (LIST_SELECT) no incluye nota/otros_datos/foto_bolla, y guardar sin
            // ellos los borraría. GET /programacion/:id trae todos los campos.
            let cancelled = false;
            populate(initialData);
            api.get(`/programacion/${initialData.id}`)
                .then((res) => { if (!cancelled && res.data) populate({ ...initialData, ...res.data }); })
                .catch(() => { /* se queda con los datos de la lista */ });
            return () => { cancelled = true; };
        } else {
            setFormData({
                vehiculo_id: '',
                trabajador_id: '',
                cliente: '',
                retiro_lugar: '',
                retiro_fecha: today,
                retiro_hora: '',
                entrega_lugar: '',
                entrega_fecha: today,
                entrega_hora: '',
                km: '',
                ciudad: '',
                app: '',
                compactado: false,
                estado_consegna: '',
                attesa: '',
                otros_datos: '',
                foto_bolla: '',
                anticipo: '',
                gastos: [],
                nota: '',
            });
        }
    }, [isOpen, initialData]);

    // Normaliza el conductor preseleccionado al UUID de la opción cuando cargan los
    // trabajadores. `initialData.trabajador_id` puede venir como UUID (nuevo) o como
    // código legacy ('G059') o incluso el nombre; las opciones del Select usan `w.id`
    // (UUID), así que resolvemos para que muestre el nombre y guarde el UUID correcto.
    useEffect(() => {
        if (!isOpen || !workers.length || !initialData?.trabajador_id) return;
        const raw = initialData.trabajador_id;
        const w = workers.find(
            (x) => x.id === raw || x.id_trabajador === raw || x.nombre_completo === raw,
        );
        if (w) setFormData((prev) => (prev.trabajador_id === w.id ? prev : { ...prev, trabajador_id: w.id }));
    }, [isOpen, workers, initialData]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        // Únicos campos obligatorios: vehículo y chofer.
        if (!formData.vehiculo_id || !formData.trabajador_id) {
            toast.error('Vehículo y Conductor son obligatorios');
            return;
        }

        setSubmitting(true);
        try {
            // Combine Date + Time for ISO (retiro_fecha siempre tiene default de hoy)
            const retiroFecha = formData.retiro_fecha || new Date().toISOString().split('T')[0];
            const fechaRetiroIso = new Date(`${retiroFecha}T${formData.retiro_hora || '00:00'}:00`).toISOString();

            // For Delivery, we might not have a separate time input in UI yet, but let's be safe.
            // If explicit time added later, use it. For now default to end of day or similar if needed, 
            // but relying on what we have.
            const fechaEntregaIso = formData.entrega_fecha ? new Date(`${formData.entrega_fecha}T${formData.entrega_hora || '23:59'}:00`).toISOString() : null;

            const payload = {
                vehiculo_id: formData.vehiculo_id,
                trabajador_id: formData.trabajador_id,
                cliente: formData.cliente,
                lugar_retiro: formData.retiro_lugar,
                fecha_retiro: fechaRetiroIso,
                hora_retiro: formData.retiro_hora, // Legacy support
                lugar_entrega: formData.entrega_lugar,
                fecha_entrega: fechaEntregaIso,
                km: formData.km !== '' ? Number(formData.km) : null,
                ciudad: formData.ciudad || null,
                app: formData.app || null,
                compactado: formData.compactado,
                estado_consegna: formData.estado_consegna || null,
                attesa: formData.attesa || null,
                otros_datos: formData.otros_datos || null,
                foto_bolla: formData.foto_bolla || null,
                anticipo: formData.anticipo !== '' ? Number(formData.anticipo) : null,
                gastos: formData.gastos
                    .filter((g) => g.tipo && (g.monto !== '' || g.comprobantes.length || g.descripcion || g.numero_mancato))
                    .map((g) => ({
                        tipo: g.tipo,
                        monto: g.monto !== '' ? Number(g.monto) : 0,
                        descripcion: g.descripcion || null,
                        numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
                        comprobantes: g.comprobantes,
                    })),
                nota: formData.nota
            };

            if (initialData?.id) {
                // EDIT MODE
                await api.patch(`/programacion/${initialData.id}`, payload);
                toast.success('Ruta actualizada exitosamente');
            } else {
                // CREATE MODE
                await api.post('/programacion', payload);
                toast.success('Ruta creada exitosamente');
            }

            onSuccess();
            onClose();
            // Reset form
            setFormData({
                vehiculo_id: '',
                trabajador_id: '',
                cliente: '',
                retiro_lugar: '',
                retiro_fecha: '',
                retiro_hora: '',
                entrega_lugar: '',
                entrega_fecha: '',
                entrega_hora: '',
                km: '',
                ciudad: '',
                app: '',
                compactado: false,
                estado_consegna: '',
                attesa: '',
                otros_datos: '',
                foto_bolla: '',
                anticipo: '',
                gastos: [],
                nota: ''
            });

        } catch (error: any) {
            console.error(error);
            toast.error(initialData ? 'Error al actualizar ruta' : 'Error al crear ruta');
        } finally {
            setSubmitting(false);
        }
    };

    // --- Gastos (rendición) ---
    const addGasto = () => setFormData((f) => ({ ...f, gastos: [...f.gastos, { tipo: 'PEAJE', monto: '', descripcion: '', numero_mancato: '', comprobantes: [] }] }));
    const updateGasto = (i: number, patch: Partial<GastoRow>) => setFormData((f) => ({ ...f, gastos: f.gastos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
    const removeGasto = (i: number) => setFormData((f) => ({ ...f, gastos: f.gastos.filter((_, idx) => idx !== i) }));
    const totalGastos = formData.gastos.reduce((s, g) => s + (g.monto !== '' ? Number(g.monto) || 0 : 0), 0);
    const anticipoNum = formData.anticipo !== '' ? Number(formData.anticipo) || 0 : 0;
    const saldo = anticipoNum - totalGastos;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#0f172a] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{initialData?.id ? 'Editar Ruta' : 'Nueva Ruta'}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{lockOthers ? 'Solo puedes editar el origen y el destino' : (initialData?.id ? 'Actualizar viaje y recursos asignados' : 'Programar viaje y asignar recursos')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 sm:space-y-8 flex-1 overflow-y-auto min-h-0">

                    {lockOthers && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                            <MapPin size={16} className="mt-0.5 shrink-0" />
                            <span>Como conductor puedes actualizar el <b>estado de la consegna</b> y el <b>origen/destino</b>. El resto de datos es de solo lectura.</span>
                        </div>
                    )}

                    {/* 0. Estado de la consegna — editable por todos (incl. chofer) */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <Flag size={18} className="text-blue-500" />
                            <span>Estado de la consegna</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {CONSEGNA_ACTIONS.map(({ value, label, Icon }) => {
                                const active = formData.estado_consegna === value;
                                const meta = ESTADO_CONSEGNA_META[value];
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, estado_consegna: active ? '' : value })}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition ${active
                                            ? `${meta.badge} ring-1 ring-current`
                                            : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    >
                                        <Icon size={15} /> {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 1. Resources & Client */}
                    <fieldset disabled={lockOthers} className="space-y-4 min-w-0 p-0 m-0 border-0 disabled:opacity-70">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <Truck size={18} className="text-blue-500" />
                            <span>Recursos y Cliente</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select
                                label="Vehículo *"
                                placeholder="-- Seleccionar --"
                                value={formData.vehiculo_id}
                                onChange={(v) => setFormData({ ...formData, vehiculo_id: v })}
                                options={vehicles.map(v => ({ value: v.placa, label: `${v.placa} (${v.marca_modelo})` }))}
                            />
                            <Select
                                label="Conductor *"
                                placeholder="-- Seleccionar --"
                                value={formData.trabajador_id}
                                onChange={(v) => setFormData({ ...formData, trabajador_id: v })}
                                options={workers.map(w => ({ value: w.id, label: w.nombre_completo }))}
                            />
                            <div className="col-span-1 md:col-span-2 space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Cliente / Destinatario</label>
                                <input
                                    type="text"
                                    placeholder="Nombre del cliente"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.cliente}
                                    onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                                />
                            </div>
                        </div>
                    </fieldset>

                    {/* 2. Itinerary (Split Cards for Pickup/Delivery) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <MapPin size={18} className="text-blue-500" />
                            <span>Itinerario de Ruta</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* ORIGIN (RETIRO) */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                <h4 className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold mb-4">
                                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg"><MapPin size={16} /></div>
                                    Origen (Retiro)
                                </h4>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Dirección</label>
                                        <input
                                            type="text"
                                            placeholder="Ej: Av. Javier Prado Este 4200, Surco"
                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                            value={formData.retiro_lugar}
                                            onChange={(e) => setFormData({ ...formData, retiro_lugar: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <DatePicker
                                                label="Fecha"
                                                value={formData.retiro_fecha}
                                                onChange={(v) => setFormData({ ...formData, retiro_fecha: v })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                                            <input
                                                type="time"
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                                value={formData.retiro_hora}
                                                onChange={(e) => setFormData({ ...formData, retiro_hora: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* DESTINATION (ENTREGA) */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 relative overflow-hidden group hover:border-red-500/30 transition-colors">
                                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                                <h4 className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold mb-4">
                                    <div className="bg-red-100 dark:bg-red-900/30 p-1.5 rounded-lg"><MapPin size={16} /></div>
                                    Destino (Entrega)
                                </h4>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Dirección</label>
                                        <input
                                            type="text"
                                            placeholder="Ej: Aeropuerto Jorge Chávez, Callao"
                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                            value={formData.entrega_lugar}
                                            onChange={(e) => setFormData({ ...formData, entrega_lugar: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <DatePicker
                                                label="Fecha"
                                                value={formData.entrega_fecha}
                                                onChange={(v) => setFormData({ ...formData, entrega_fecha: v })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                                            <input
                                                type="time"
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                                value={formData.entrega_hora}
                                                onChange={(e) => setFormData({ ...formData, entrega_hora: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bolla / DDT de la operación. Solo la sube el CHOFER (modo lockOthers);
                            el supervisor únicamente puede verla si ya fue subida. */}
                        {lockOthers ? (
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800">
                                <h4 className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold mb-3">
                                    <FileText size={16} className="text-blue-500" />
                                    Foto de la bolla (DDT)
                                </h4>
                                <FileUpload
                                    variant="wide"
                                    accept="image/*,application/pdf"
                                    label="Subir foto de la bolla"
                                    value={formData.foto_bolla || undefined}
                                    onChange={(url) => setFormData({ ...formData, foto_bolla: url })}
                                    onClear={() => setFormData({ ...formData, foto_bolla: '' })}
                                />
                            </div>
                        ) : formData.foto_bolla ? (
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800">
                                <h4 className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold mb-3">
                                    <FileText size={16} className="text-blue-500" />
                                    Foto de la bolla (DDT)
                                </h4>
                                <a href={formData.foto_bolla} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
                                    <FileText size={14} /> Ver bolla subida por el chofer
                                </a>
                            </div>
                        ) : null}
                    </div>

                    {/* 3. Datos de consegna */}
                    <fieldset disabled={lockOthers} className="space-y-4 min-w-0 p-0 m-0 border-0 disabled:opacity-70">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <Package size={18} className="text-blue-500" />
                            <span>Datos de Consegna</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* KM */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">KM</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.km}
                                    onChange={(e) => setFormData({ ...formData, km: e.target.value })}
                                />
                            </div>

                            {/* CIUDAD */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Ciudad</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Milano"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.ciudad}
                                    onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                                />
                            </div>

                            {/* APP */}
                            <Select
                                label="App"
                                placeholder="-- Seleccionar --"
                                searchable
                                clearable
                                value={formData.app}
                                onChange={(v) => setFormData({ ...formData, app: v })}
                                options={APP_OPTIONS}
                            />

                            {/* Estado consegna se controla arriba con los botones de acción */}

                            {/* ATTESA */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Attesa</label>
                                <input
                                    type="text"
                                    placeholder="Ej: 15 min (espera al cliente)"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.attesa}
                                    onChange={(e) => setFormData({ ...formData, attesa: e.target.value })}
                                />
                            </div>

                            {/* COMPACTADO */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">¿Compactado?</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, compactado: false })}
                                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition ${!formData.compactado
                                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                            : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100'}`}
                                    >
                                        N
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, compactado: true })}
                                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition ${formData.compactado
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100'}`}
                                    >
                                        Y
                                    </button>
                                </div>
                            </div>

                            {/* OTROS DATOS DE CONSEGNA (pegado desde WhatsApp) */}
                            <div className="col-span-1 md:col-span-2 space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Otros datos de consegna</label>
                                <textarea
                                    rows={3}
                                    placeholder="Pega aquí el texto de la consegna (por ejemplo, desde WhatsApp)..."
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-900 dark:text-white resize-none text-sm"
                                    value={formData.otros_datos}
                                    onChange={(e) => setFormData({ ...formData, otros_datos: e.target.value })}
                                ></textarea>
                            </div>
                        </div>
                    </fieldset>

                    {/* 3.5 Rendición / Gastos del trayecto — editable por todos (incl. chofer) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                            <Wallet size={18} className="text-blue-500" />
                            <span>Rendición / Gastos</span>
                        </div>

                        {/* Anticipo */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Anticipo recibido ({currency})</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.anticipo}
                                    onChange={(e) => setFormData({ ...formData, anticipo: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Lista de gastos */}
                        <div className="space-y-3">
                            {formData.gastos.map((g, i) => (
                                <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 sm:p-4 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo</label>
                                            <Select
                                                value={g.tipo}
                                                onChange={(v) => updateGasto(i, { tipo: v })}
                                                options={GASTO_TIPOS}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Monto ({currency})</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                placeholder="0.00"
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                value={g.monto}
                                                onChange={(e) => updateGasto(i, { monto: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    {g.tipo === 'OTRO' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Descripción</label>
                                            <input
                                                type="text"
                                                placeholder="¿En qué se gastó?"
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                value={g.descripcion}
                                                onChange={(e) => updateGasto(i, { descripcion: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    {g.tipo === 'PEAJE' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Nº de mancato</label>
                                            <input
                                                type="text"
                                                placeholder="Número de mancato pagamento"
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                value={g.numero_mancato}
                                                onChange={(e) => updateGasto(i, { numero_mancato: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Comprobante(s)</label>
                                        <MultiFileUpload
                                            value={g.comprobantes}
                                            onChange={(urls) => updateGasto(i, { comprobantes: urls })}
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => removeGasto(i)}
                                            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition"
                                        >
                                            <Trash2 size={14} /> Quitar gasto
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                onClick={addGasto}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:border-blue-400 text-sm font-medium transition"
                            >
                                <Plus size={16} /> Agregar gasto
                            </button>
                        </div>

                        {/* Resumen */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 text-sm space-y-1.5">
                            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                <span>Anticipo</span><span className="tabular-nums">{currency} {anticipoNum.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                <span>Total gastado</span><span className="tabular-nums">− {currency} {totalGastos.toFixed(2)}</span>
                            </div>
                            <div className={`flex items-center justify-between font-bold pt-1.5 border-t border-slate-100 dark:border-slate-800 ${saldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                <span>{saldo < 0 ? 'Excedido (falta)' : 'A devolver'}</span>
                                <span className="tabular-nums">{currency} {Math.abs(saldo).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* 4. Notes */}
                    <fieldset disabled={lockOthers} className="space-y-4 min-w-0 p-0 m-0 border-0 disabled:opacity-70">
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <FileText size={16} /> Notas Adicionales
                            </label>
                            <textarea
                                rows={2}
                                placeholder="Instrucciones especiales para el conductor..."
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-900 dark:text-white resize-none text-sm"
                                value={formData.nota}
                                onChange={(e) => setFormData({ ...formData, nota: e.target.value })}
                            ></textarea>
                        </div>
                    </fieldset>
                </form>

                {/* Action Bar: barra fija FUERA del área scrolleable, para que nunca
                    tape el contenido al hacer scroll (antes iba dentro del form con
                    sticky y con doble scroll se montaba encima del itinerario). */}
                <div className="shrink-0 p-4 sm:p-6 flex justify-end gap-3 bg-white dark:bg-[#0f172a] border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={submitting}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                    >
                        {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        {initialData?.id ? 'Guardar Cambios' : 'Crear Ruta'}
                    </button>
                </div>
            </div>
        </div>
    );
}
