'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, MapPin, Calendar, Clock, User, Truck, FileText, Package, Play, CheckCircle2, PauseCircle, Undo2, RefreshCw, Ban, Bell, Flag, Wallet, Plus, Trash2 } from 'lucide-react';
import { Programacion } from '../../types';
import api from '../../lib/api';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import FileUpload from '../../components/FileUpload';
import MultiFileUpload from '../../components/MultiFileUpload';
import { useCurrency } from '../../lib/useCurrency';
import { APP_OPTIONS, SPEDIZIONE_OPTIONS, ESTADO_CONSEGNA_META, RETIRO_PRESETS, isCoords, GASTO_TIPOS_CON_PAGADOR, pagadorLabels, categoriaVehiculoLabel, calcularIngresoSugerido, TarifasIngreso } from './constants';
import { useGoogleMaps } from '../../components/tracking/googleMaps';
import { fmtMin } from '../../components/tracking/MapboxRouteMap';

// Fila de gasto en el formulario (monto como string para el input).
type GastoRow = { tipo: string; monto: string; descripcion: string; numero_mancato: string; link_peaje: string; comprobantes: string[]; pagado_por_chofer: boolean };

// Fecha/hora de un retiro adicional (paralelo a `retiros[]` por índice).
type RetiroDetalleRow = { fecha: string; hora: string };
const emptyRetiroDetalle = (): RetiroDetalleRow => ({ fecha: '', hora: '' });

// Detalle de un destino adicional (paralelo a `destinos[]` por índice). fecha/hora
// sirven para cualquier ruta; cliente/spedizione/km_facturable/ingreso solo se usan
// cuando la operación es "compactada" (2+ entregas reales de clientes distintos).
type DestinoDetalleRow = { fecha: string; hora: string; cliente: string; spedizione: string; km_facturable: string; ingreso: string };
const emptyDestinoDetalle = (): DestinoDetalleRow => ({ fecha: '', hora: '', cliente: '', spedizione: '', km_facturable: '', ingreso: '' });
const buildRetirosDetalle = (src: any): RetiroDetalleRow[] => {
    const arr = Array.isArray(src.retiros) ? src.retiros : [];
    const fromApi = Array.isArray(src.retiros_detalle) ? src.retiros_detalle : [];
    return arr.map((_: string, i: number) => ({ fecha: fromApi[i]?.fecha || '', hora: fromApi[i]?.hora || '' }));
};
const buildDestinosDetalle = (src: any): DestinoDetalleRow[] => {
    const arr = Array.isArray(src.destinos) ? src.destinos : [];
    const fromApi = Array.isArray(src.destinos_detalle) ? src.destinos_detalle : [];
    return arr.map((_: string, i: number) => ({
        fecha: fromApi[i]?.fecha || '',
        hora: fromApi[i]?.hora || '',
        cliente: fromApi[i]?.cliente || '',
        spedizione: fromApi[i]?.spedizione || '',
        km_facturable: fromApi[i]?.km_facturable != null ? String(fromApi[i].km_facturable) : '',
        ingreso: fromApi[i]?.ingreso != null ? String(fromApi[i].ingreso) : '',
    }));
};

const GASTO_TIPOS = [
    { value: 'PEAJE', label: 'Peaje' },
    { value: 'COMBUSTIBLE', label: 'Combustible' },
    { value: 'PARKING', label: 'Parking' },
    { value: 'OTRO', label: 'Otro' },
];

// Acciones de estado de consegna que el chofer/admin marca según avanza la ruta.
// El value es el estado que se guarda; label/Icon son la UI del botón.
// Acciones de estado que el admin/chofer marca según avanza la ruta. Debe
// coincidir con CONSEGNA_ACTIONS del app (apps/logistica-app/constants/operaciones.ts).
const CONSEGNA_ACTIONS: { value: string; label: string; Icon: any }[] = [
    { value: 'RICHIESTA', label: 'Richiesta', Icon: Bell },
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
    // Consegna ya realizada: el chofer pierde toda edición (incl. estado/bolla).
    // Solo supervisores/administradores (canEditAll) pueden seguir editando.
    const consegnaBloqueada = lockOthers && initialData?.estado_consegna === 'CONSEGNATO';
    // Portal a <body>: sin esto el modal queda acotado al <main overflow-y-auto>
    // del layout en vez de cubrir todo el viewport.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const { currency } = useCurrency();
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(false); // Added
    // Tarifas de la empresa (factor €/km por categoría, mínimo <35km, navetta) para
    // autocompletar el ingreso EN VIVO mientras se escribe el km facturable.
    const [tarifasConfig, setTarifasConfig] = useState<TarifasIngreso | null>(null);
    useEffect(() => {
        api.get('/registros/config').then((res) => setTarifasConfig(res.data ?? null)).catch(() => {});
    }, []);

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
        // Orígenes adicionales (otros almacenes de retiro)
        retiros: [] as string[],
        retirosDetalle: [] as RetiroDetalleRow[],

        // Delivery
        entrega_lugar: '',
        entrega_fecha: new Date().toISOString().split('T')[0],
        entrega_hora: '',

        // Destinos adicionales (paradas tras el destino principal)
        destinos: [] as string[],
        destinosDetalle: [] as DestinoDetalleRow[],

        // Datos de consegna
        km: '',
        // Km de IDA que factura el cliente (DHL/AB Servis, informado por mensaje) —
        // distinto del `km` real (GPS) + el monto a cobrar (sugerido por categoría, editable).
        km_facturable: '',
        ingreso_estimado: '',
        ciudad: '',
        app: '',
        spedizione: '',
        compactado: false,
        es_navetta: false,
        estado_consegna: '',
        attesa: '',
        otros_datos: '',
        foto_bolla: '',

        // Rendición del chofer
        anticipo: '',
        gastos: [] as GastoRow[],

        nota: ''
    });

    // Categoría del vehículo elegido (vehiculo_id guarda la PLACA, no el id).
    const categoriaDeVehiculo = (vehiculoId: string) =>
        vehicles.find((v) => v.placa === vehiculoId || v.id === vehiculoId)?.categoria ?? null;

    // Sugerencia EN VIVO (solo para el hint informativo — no muta formData).
    const ingresoSugerido = useMemo(
        () => calcularIngresoSugerido(formData.km_facturable, categoriaDeVehiculo(formData.vehiculo_id), formData.es_navetta, formData.spedizione, tarifasConfig),
        [formData.km_facturable, formData.vehiculo_id, formData.es_navetta, formData.spedizione, vehicles, tarifasConfig],
    );

    // Aplica la sugerencia al `ingreso_estimado` de un formData ya actualizado (se
    // llama SOLO desde los handlers de km/vehículo/navetta/spedizione, nunca al
    // precargar un registro existente — así nunca pisa un ingreso ya guardado).
    const aplicarIngresoAuto = (f: typeof formData): typeof formData => {
        const sug = calcularIngresoSugerido(f.km_facturable, categoriaDeVehiculo(f.vehiculo_id), f.es_navetta, f.spedizione, tarifasConfig);
        return sug ? { ...f, ingreso_estimado: String(sug.monto) } : f;
    };

    // ── ETA por destino ──────────────────────────────────────────────────
    // Calcula el tiempo acumulado (por carretera) del origen a cada parada:
    // etaEntrega = origen → destino principal; etaDestinos[i] = hasta el destino i.
    const { isLoaded: mapsLoaded } = useGoogleMaps();
    const [etaEntrega, setEtaEntrega] = useState<string>('');
    const [etaDestinos, setEtaDestinos] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen || !mapsLoaded || typeof google === 'undefined') return;
        const origen = (formData.retiro_lugar || '').trim();
        const entrega = (formData.entrega_lugar || '').trim();
        const destinos = formData.destinos.map((d) => (d || '').trim()).filter(Boolean);
        if (!origen || !entrega) { setEtaEntrega(''); setEtaDestinos([]); return; }

        let cancelled = false;
        const stops = [entrega, ...destinos]; // paradas tras el origen, en orden
        const t = setTimeout(async () => {
            try {
                const svc = new google.maps.DirectionsService();
                const res = await svc.route({
                    origin: origen,
                    destination: stops[stops.length - 1],
                    waypoints: stops.slice(0, -1).map((location) => ({ location, stopover: true })),
                    travelMode: google.maps.TravelMode.DRIVING,
                });
                if (cancelled) return;
                const legs = res.routes?.[0]?.legs || [];
                let acc = 0;
                const cum = legs.map((l) => { acc += (l.duration?.value ?? 0) / 60; return acc; });
                setEtaEntrega(cum[0] != null ? fmtMin(cum[0]) : '');
                setEtaDestinos(destinos.map((_, i) => (cum[i + 1] != null ? fmtMin(cum[i + 1]) : '')));
            } catch {
                if (!cancelled) { setEtaEntrega(''); setEtaDestinos([]); }
            }
        }, 500);
        return () => { cancelled = true; clearTimeout(t); };
    }, [isOpen, mapsLoaded, formData.retiro_lugar, formData.entrega_lugar, formData.destinos.join('|')]);

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
                retiros: Array.isArray(src.retiros) ? src.retiros : [],
                retirosDetalle: buildRetirosDetalle(src),
                entrega_lugar: src.lugar_entrega || '',
                entrega_fecha: isoToDate(src.fecha_entrega) || today,
                entrega_hora: isoToTime(src.fecha_entrega),
                destinos: Array.isArray(src.destinos) ? src.destinos : [],
                destinosDetalle: buildDestinosDetalle(src),
                km: src.km != null ? String(src.km) : '',
                km_facturable: src.km_facturable != null ? String(src.km_facturable) : '',
                ingreso_estimado: src.ingreso_estimado != null ? String(src.ingreso_estimado) : '',
                ciudad: src.ciudad || '',
                app: src.app || '',
                spedizione: src.spedizione || '',
                compactado: !!src.compactado,
                es_navetta: !!src.es_navetta,
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
                    link_peaje: g.link_peaje || '',
                    comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes : [],
                    pagado_por_chofer: g.pagado_por_chofer !== false,
                })) : [],
                nota: src.nota || '',
            });
            // Precargamos rápido con lo que trae la lista y luego con el registro COMPLETO:
            // la lista (LIST_SELECT) no incluye nota/otros_datos/foto_bolla, y guardar sin
            // ellos los borraría. GET /programacion/:id trae todos los campos.
            let cancelled = false;
            populate(initialData);
            api.get(`/programacion/${initialData.id}`)
                .then((res) => {
                    if (cancelled || !res.data) return;
                    populate({ ...initialData, ...res.data });
                })
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
                retiros: [],
                retirosDetalle: [],
                entrega_lugar: '',
                entrega_fecha: today,
                entrega_hora: '',
                destinos: [],
                destinosDetalle: [],
                km: '',
                km_facturable: '',
                ingreso_estimado: '',
                ciudad: '',
                app: '',
                spedizione: '',
                compactado: false,
                es_navetta: false,
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

        // Defensa extra además del UI deshabilitado: un chofer no puede guardar
        // cambios sobre una consegna ya realizada.
        if (consegnaBloqueada) {
            toast.error('Esta consegna ya fue realizada. Solo un supervisor o administrador puede editarla.');
            return;
        }

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

            // retiros/destinos filtran las direcciones vacías; retirosDetalle/destinosDetalle
            // se filtran EXACTAMENTE igual (mismo índice) para que sigan alineados 1:1.
            const retirosFinal = formData.retiros
                .map((addr, idx) => ({ addr: addr.trim(), det: formData.retirosDetalle[idx] }))
                .filter((x) => x.addr);
            const destinosFinal = formData.destinos
                .map((addr, idx) => ({ addr: addr.trim(), det: formData.destinosDetalle[idx] }))
                .filter((x) => x.addr);

            const payload = {
                vehiculo_id: formData.vehiculo_id,
                trabajador_id: formData.trabajador_id,
                cliente: formData.cliente,
                lugar_retiro: formData.retiro_lugar,
                fecha_retiro: fechaRetiroIso,
                hora_retiro: formData.retiro_hora, // Legacy support
                retiros: retirosFinal.map((x) => x.addr),
                retiros_detalle: retirosFinal.map((x) => ({ fecha: x.det?.fecha || null, hora: x.det?.hora || null })),
                lugar_entrega: formData.entrega_lugar,
                fecha_entrega: fechaEntregaIso,
                destinos: destinosFinal.map((x) => x.addr),
                destinos_detalle: destinosFinal.map((x) => ({
                    fecha: x.det?.fecha || null,
                    hora: x.det?.hora || null,
                    cliente: x.det?.cliente || null,
                    spedizione: x.det?.spedizione || null,
                    km_facturable: x.det && x.det.km_facturable !== '' ? Number(x.det.km_facturable) : null,
                    ingreso: x.det && x.det.ingreso !== '' ? Number(x.det.ingreso) : null,
                })),
                km: formData.km !== '' ? Number(formData.km) : null,
                km_facturable: formData.km_facturable !== '' ? Number(formData.km_facturable) : null,
                ingreso_estimado: formData.ingreso_estimado !== '' ? Number(formData.ingreso_estimado) : null,
                ciudad: formData.ciudad || null,
                app: formData.app || null,
                spedizione: formData.spedizione || null,
                compactado: formData.compactado,
                es_navetta: formData.es_navetta,
                estado_consegna: formData.estado_consegna || null,
                attesa: formData.attesa || null,
                otros_datos: formData.otros_datos || null,
                foto_bolla: formData.foto_bolla || null,
                anticipo: formData.anticipo !== '' ? Number(formData.anticipo) : null,
                gastos: formData.gastos
                    .filter((g) => g.tipo && (g.monto !== '' || g.comprobantes.length || g.descripcion || g.numero_mancato || g.link_peaje))
                    .map((g) => ({
                        tipo: g.tipo,
                        monto: g.monto !== '' ? Number(g.monto) : 0,
                        descripcion: g.descripcion || null,
                        numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
                        link_peaje: g.tipo === 'PEAJE' ? (g.link_peaje || null) : null,
                        comprobantes: g.comprobantes,
                        pagado_por_chofer: GASTO_TIPOS_CON_PAGADOR.includes(g.tipo) ? g.pagado_por_chofer : true,
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
                retiros: [],
                retirosDetalle: [],
                entrega_lugar: '',
                entrega_fecha: '',
                entrega_hora: '',
                destinos: [],
                destinosDetalle: [],
                km: '',
                km_facturable: '',
                ingreso_estimado: '',
                ciudad: '',
                app: '',
                spedizione: '',
                compactado: false,
                es_navetta: false,
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

    // --- Destinos adicionales (paradas) --- destinosDetalle es paralelo a destinos.
    const addDestino = () => setFormData((f) => ({ ...f, destinos: [...f.destinos, ''], destinosDetalle: [...f.destinosDetalle, emptyDestinoDetalle()] }));
    const updateDestino = (i: number, val: string) => setFormData((f) => ({ ...f, destinos: f.destinos.map((d, idx) => (idx === i ? val : d)) }));
    const removeDestino = (i: number) => setFormData((f) => ({
        ...f,
        destinos: f.destinos.filter((_, idx) => idx !== i),
        destinosDetalle: f.destinosDetalle.filter((_, idx) => idx !== i),
    }));
    const updateDestinoDetalle = (i: number, patch: Partial<DestinoDetalleRow>) =>
        setFormData((f) => ({ ...f, destinosDetalle: f.destinosDetalle.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));

    // --- Orígenes adicionales (otros almacenes de retiro) --- mismo patrón que destinos.
    const addRetiro = () => setFormData((f) => ({ ...f, retiros: [...f.retiros, ''], retirosDetalle: [...f.retirosDetalle, emptyRetiroDetalle()] }));
    const updateRetiro = (i: number, val: string) => setFormData((f) => ({ ...f, retiros: f.retiros.map((d, idx) => (idx === i ? val : d)) }));
    const removeRetiro = (i: number) => setFormData((f) => ({
        ...f,
        retiros: f.retiros.filter((_, idx) => idx !== i),
        retirosDetalle: f.retirosDetalle.filter((_, idx) => idx !== i),
    }));
    const updateRetiroDetalle = (i: number, patch: Partial<RetiroDetalleRow>) =>
        setFormData((f) => ({ ...f, retirosDetalle: f.retirosDetalle.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));

    // --- Posición actual del conductor (usa su última ubicación GPS como origen) ---
    const usarPosicionActual = async () => {
        if (!formData.trabajador_id) {
            toast.error('Selecciona primero el conductor');
            return;
        }
        try {
            const res = await api.get(`/gps/trabajador/${formData.trabajador_id}/ubicacion`);
            const position = res.data?.position;
            if (position && position.latitude != null && position.longitude != null) {
                setFormData({ ...formData, retiro_lugar: `${position.latitude},${position.longitude}` });
                toast.success('Origen fijado en la posición actual del conductor');
            } else {
                toast.error('El conductor no tiene ubicación GPS reciente');
            }
        } catch {
            toast.error('El conductor no tiene ubicación GPS reciente');
        }
    };

    // --- Gastos (rendición) ---
    const addGasto = () => setFormData((f) => ({ ...f, gastos: [...f.gastos, { tipo: 'PEAJE', monto: '', descripcion: '', numero_mancato: '', link_peaje: '', comprobantes: [], pagado_por_chofer: true }] }));
    const updateGasto = (i: number, patch: Partial<GastoRow>) => setFormData((f) => ({ ...f, gastos: f.gastos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
    const removeGasto = (i: number) => setFormData((f) => ({ ...f, gastos: f.gastos.filter((_, idx) => idx !== i) }));
    // Costo total de la ruta (todos los gastos, los pague quien los pague).
    const totalGastos = formData.gastos.reduce((s, g) => s + (g.monto !== '' ? Number(g.monto) || 0 : 0), 0);
    // Solo lo que pagó el chofer se descuenta de su anticipo (mancato/código/pendiente no).
    const gastadoChofer = formData.gastos.reduce((s, g) => s + (g.pagado_por_chofer !== false && g.monto !== '' ? Number(g.monto) || 0 : 0), 0);
    const gastadoEmpresa = totalGastos - gastadoChofer;
    const anticipoNum = formData.anticipo !== '' ? Number(formData.anticipo) || 0 : 0;
    const saldo = anticipoNum - gastadoChofer;

    if (!isOpen || !mounted) return null;

    return createPortal(
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

                    {consegnaBloqueada ? (
                        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                            <Flag size={16} className="mt-0.5 shrink-0" />
                            <span>Esta consegna ya fue <b>realizada (Consegnato)</b> — la edición queda bloqueada. Solo un supervisor o administrador puede modificarla.</span>
                        </div>
                    ) : lockOthers && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                            <MapPin size={16} className="mt-0.5 shrink-0" />
                            <span>Como conductor puedes actualizar el <b>estado de la consegna</b> y el <b>origen/destino</b>. El resto de datos es de solo lectura.</span>
                        </div>
                    )}

                    {/* 0. Estado de la consegna — editable por todos (incl. chofer), salvo que ya esté Consegnato */}
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
                                        disabled={consegnaBloqueada}
                                        onClick={() => setFormData({ ...formData, estado_consegna: active ? '' : value })}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${active
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
                                onChange={(v) => setFormData((f) => aplicarIngresoAuto({ ...f, vehiculo_id: v }))}
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
                                    <div className="flex flex-wrap gap-1.5">
                                        {RETIRO_PRESETS.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, retiro_lugar: preset.value })}
                                                className="px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition"
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={usarPosicionActual}
                                            className="px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                        >
                                            📍 Posición actual
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Dirección</label>
                                        <input
                                            type="text"
                                            placeholder="Ej: Av. Javier Prado Este 4200, Surco"
                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                            value={formData.retiro_lugar}
                                            onChange={(e) => setFormData({ ...formData, retiro_lugar: e.target.value })}
                                        />
                                        {isCoords(formData.retiro_lugar) && (
                                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">📍 Posición actual (coordenadas)</p>
                                        )}
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
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Dirección</label>
                                            {etaEntrega && (
                                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-[11px] font-semibold" title="Tiempo estimado desde el origen">
                                                    <Clock size={12} /> {etaEntrega}
                                                </span>
                                            )}
                                        </div>
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

                        {/* Orígenes adicionales (otros almacenes de retiro) */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800">
                            <h4 className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold mb-3">
                                <MapPin size={16} className="text-emerald-500" />
                                Orígenes adicionales
                            </h4>
                            <div className="space-y-2">
                                {formData.retiros.map((r, i) => (
                                    <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400 w-5 shrink-0 text-center">{i + 2}</span>
                                            <input
                                                type="text"
                                                placeholder="Ej: B-Service, Via ... (otro almacén)"
                                                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                                value={r}
                                                onChange={(e) => updateRetiro(i, e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeRetiro(i)}
                                                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                                                aria-label="Quitar origen"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 pl-7">
                                            <DatePicker
                                                label="Fecha"
                                                value={formData.retirosDetalle[i]?.fecha || ''}
                                                onChange={(v) => updateRetiroDetalle(i, { fecha: v })}
                                            />
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                                                <input
                                                    type="time"
                                                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                                    value={formData.retirosDetalle[i]?.hora || ''}
                                                    onChange={(e) => updateRetiroDetalle(i, { hora: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addRetiro}
                                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-emerald-600 hover:border-emerald-400 text-sm font-medium transition"
                                >
                                    <Plus size={16} /> Agregar retiro
                                </button>
                            </div>
                        </div>

                        {/* COMPACTADA: se decide ANTES de llenar los destinos, para que cada
                            tarjeta de destino ya muestre sus campos de cliente/km/ingreso propios
                            mientras se llena, en vez de tener que activarlo y volver a subir. */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800">
                            <label className="text-xs font-bold text-slate-500 uppercase">¿Es compactada? (2+ entregas de clientes distintos en un solo viaje)</label>
                            <div className="grid grid-cols-2 gap-2 mt-1.5 max-w-xs">
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
                            {formData.compactado && (
                                <p className="text-xs text-slate-500 mt-2">Cada destino de abajo puede tener su propio Cliente, Spedizione, Km facturable e Ingreso.</p>
                            )}
                        </div>

                        {/* Destinos adicionales (paradas después del destino principal) */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800">
                            <h4 className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold mb-3">
                                <MapPin size={16} className="text-red-500" />
                                Destinos adicionales
                            </h4>
                            {!formData.compactado && formData.destinos.length > 0 && (
                                <p className="text-xs text-slate-500 -mt-2 mb-3">¿Alguno de estos destinos es otra entrega con cliente distinto? Activa "¿Es compactada?" arriba.</p>
                            )}
                            <div className="space-y-2">
                                {formData.destinos.map((dest, i) => {
                                    const det = formData.destinosDetalle[i];
                                    const sugerido = formData.compactado
                                        ? calcularIngresoSugerido(det?.km_facturable, categoriaDeVehiculo(formData.vehiculo_id), formData.es_navetta, det?.spedizione || formData.spedizione, tarifasConfig)
                                        : null;
                                    return (
                                        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 w-5 shrink-0 text-center">{i + 2}</span>
                                                <input
                                                    type="text"
                                                    placeholder="Dirección de la parada adicional"
                                                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                                    value={dest}
                                                    onChange={(e) => updateDestino(i, e.target.value)}
                                                />
                                                {etaDestinos[i] && (
                                                    <span className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-[11px] font-semibold" title="Tiempo estimado desde el origen">
                                                        <Clock size={12} /> {etaDestinos[i]}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => removeDestino(i)}
                                                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                                                    aria-label="Quitar destino"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pl-7">
                                                <DatePicker
                                                    label="Fecha"
                                                    value={det?.fecha || ''}
                                                    onChange={(v) => updateDestinoDetalle(i, { fecha: v })}
                                                />
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Hora límite</label>
                                                    <input
                                                        type="time"
                                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                                        value={det?.hora || ''}
                                                        onChange={(e) => updateDestinoDetalle(i, { hora: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            {formData.compactado && (
                                                <div className="pl-7 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Esta parada es otra entrega — sus propios datos</p>
                                                    <input
                                                        type="text"
                                                        placeholder="Cliente"
                                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                                        value={det?.cliente || ''}
                                                        onChange={(e) => updateDestinoDetalle(i, { cliente: e.target.value })}
                                                    />
                                                    <Select
                                                        label="Spedizione"
                                                        placeholder="-- Seleccionar --"
                                                        searchable
                                                        clearable
                                                        value={det?.spedizione || ''}
                                                        onChange={(v) => updateDestinoDetalle(i, { spedizione: v })}
                                                        options={SPEDIZIONE_OPTIONS}
                                                    />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            placeholder="Km facturable"
                                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-red-500/50"
                                                            value={det?.km_facturable || ''}
                                                            onChange={(e) => {
                                                                const sug = calcularIngresoSugerido(e.target.value, categoriaDeVehiculo(formData.vehiculo_id), formData.es_navetta, det?.spedizione || formData.spedizione, tarifasConfig);
                                                                updateDestinoDetalle(i, { km_facturable: e.target.value, ...(sug ? { ingreso: String(sug.monto) } : {}) });
                                                            }}
                                                        />
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            placeholder={`Ingreso (${currency})`}
                                                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-red-500/50"
                                                            value={det?.ingreso || ''}
                                                            onChange={(e) => updateDestinoDetalle(i, { ingreso: e.target.value })}
                                                        />
                                                    </div>
                                                    {sugerido && (
                                                        <p className="text-xs font-semibold text-blue-600">
                                                            {sugerido.esNavetta
                                                                ? 'Auto: navetta, pago fijo'
                                                                : `Auto: ${categoriaVehiculoLabel(sugerido.categoria)}${sugerido.aplicaMinimo ? ', mínimo' : ` · ${sugerido.factor}${currency}/km`}`} — puedes editarlo si varía
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={addDestino}
                                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:border-red-400 text-sm font-medium transition"
                                >
                                    <Plus size={16} /> Agregar destino
                                </button>
                            </div>
                        </div>

                        {/* Bolla / DDT de la operación. Solo la sube el CHOFER (modo lockOthers, y
                            solo mientras la consegna no esté ya realizada); el supervisor únicamente
                            puede verla si ya fue subida. */}
                        {lockOthers && !consegnaBloqueada ? (
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

                            {/* KM FACTURABLE (ida) — el que informa el cliente, distinto del KM real GPS */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Km facturable (ida)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="Km que informa el cliente"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.km_facturable}
                                    onChange={(e) => setFormData((f) => aplicarIngresoAuto({ ...f, km_facturable: e.target.value }))}
                                />
                            </div>

                            {/* INGRESO — se autocompleta al escribir el km facturable (km × factor de la
                                categoría del vehículo, o el fijo si es navetta / km corto); editable si varía. */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Ingreso ({currency})</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white"
                                    value={formData.ingreso_estimado}
                                    onChange={(e) => setFormData({ ...formData, ingreso_estimado: e.target.value })}
                                />
                                {ingresoSugerido && (
                                    <p className="text-xs font-semibold text-blue-600">
                                        {ingresoSugerido.esNavetta
                                            ? 'Auto: navetta, pago fijo'
                                            : `Auto: ${categoriaVehiculoLabel(ingresoSugerido.categoria)}${ingresoSugerido.aplicaMinimo ? ', mínimo' : ` · ${ingresoSugerido.factor}${currency}/km`}`} — puedes editarlo si varía
                                    </p>
                                )}
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

                            {/* SPEDIZIONE */}
                            <Select
                                label="Spedizione"
                                placeholder="-- Seleccionar --"
                                searchable
                                clearable
                                value={formData.spedizione}
                                onChange={(v) => setFormData((f) => aplicarIngresoAuto({ ...f, spedizione: v }))}
                                options={SPEDIZIONE_OPTIONS}
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

                            {/* NAVETTA: traslado/lanzadera entre almacenes, no una entrega — el ingreso
                                sugerido pasa a ser SIEMPRE el fijo de navetta, sin importar km/categoría. */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">¿Es navetta?</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData((f) => aplicarIngresoAuto({ ...f, es_navetta: false }))}
                                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition ${!formData.es_navetta
                                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                            : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100'}`}
                                    >
                                        N
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData((f) => aplicarIngresoAuto({ ...f, es_navetta: true }))}
                                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition ${formData.es_navetta
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
                                    {GASTO_TIPOS_CON_PAGADOR.includes(g.tipo) && (() => {
                                        const labels = pagadorLabels(g.tipo);
                                        return (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">¿Quién lo pagó?</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateGasto(i, { pagado_por_chofer: true })}
                                                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition ${g.pagado_por_chofer
                                                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                                            : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                                    >
                                                        {labels.yes}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateGasto(i, { pagado_por_chofer: false })}
                                                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition ${!g.pagado_por_chofer
                                                            ? 'bg-blue-600 text-white border-blue-600'
                                                            : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                                    >
                                                        {labels.no}
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-slate-400 leading-tight pt-0.5">
                                                    {g.pagado_por_chofer ? labels.hintYes : labels.hintNo}
                                                </p>
                                            </div>
                                        );
                                    })()}
                                    {g.tipo === 'PEAJE' && !g.pagado_por_chofer && (
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
                                    {g.tipo === 'PEAJE' && !g.pagado_por_chofer && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Link de peaje</label>
                                            <input
                                                type="url"
                                                placeholder="https://…"
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                value={g.link_peaje}
                                                onChange={(e) => updateGasto(i, { link_peaje: e.target.value })}
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
                                <span>Pagado por el chofer</span><span className="tabular-nums">− {currency} {gastadoChofer.toFixed(2)}</span>
                            </div>
                            {gastadoEmpresa > 0 && (
                                <div className="flex items-center justify-between text-slate-400">
                                    <span>Pagado por la empresa (no descuenta)</span><span className="tabular-nums">{currency} {gastadoEmpresa.toFixed(2)}</span>
                                </div>
                            )}
                            <div className={`flex items-center justify-between font-bold pt-1.5 border-t border-slate-100 dark:border-slate-800 ${saldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                <span>{saldo < 0 ? 'Excedido (falta)' : 'A devolver'}</span>
                                <span className="tabular-nums">{currency} {Math.abs(saldo).toFixed(2)}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 pt-1">Costo total de la ruta: {currency} {totalGastos.toFixed(2)}</p>
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
        </div>,
        document.body
    );
}
