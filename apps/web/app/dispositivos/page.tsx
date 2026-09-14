"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import api from "../../lib/api";
import {
    Plus, Smartphone, Trash2, Copy, X, Truck, Clock, Pencil, AlertTriangle, User, Search,
    Radio, Gauge, Power, Navigation, Activity, WifiOff, Eye, EyeOff, MoreHorizontal, Satellite,
    MapPin, History, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { MapboxLiveMap as LiveMapReal } from "../../components/tracking/MapboxLiveMap";
import Select from "../../components/Select";
import { KpiCard } from "../../components/mono/MonoCards";
import { useT, useDateLocale } from "../../lib/i18n";

// framer-motion v10 + React 19: los tipos chocan, se castea (mismo patrón que /reportes).
const MotionDiv = motion.div as any;
const enter = (i: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] as any },
});

interface Position {
    latitude: number | string;
    longitude: number | string;
    speed: number | null;      // m/s (unidad interna; la UI muestra km/h)
    heading: number | null;
    ignition: boolean | null;
    timestamp: string;
}

interface Device {
    id: string;
    name: string;
    imei: string;
    token: string;
    model: string | null;
    last_activity: string | null;
    vehiculo_id: string | null;
    vehiculo?: { id: string; placa: string; marca_modelo: string } | null;
    trabajador_id: string | null;
    trabajador?: { id: string; nombre_completo: string; cargo?: string; url_foto?: string | null } | null;
    positions?: Position[];
}

// ---- Estado derivado de cada dispositivo -----------------------------------
// moving   → reporta velocidad (> 3 km/h) en la última posición
// ignition → motor encendido pero quieto
// parked   → última posición reciente (< 24 h) y motor apagado
// offline  → sin posición o más de 24 h sin reportar
type Status = "moving" | "ignition" | "parked" | "offline";
const OFFLINE_MS = 24 * 60 * 60 * 1000;
const MOVING_KMH = 3;

function deriveStatus(d: Device, now: number): { status: Status; kmh: number; ageMs: number | null; pos: Position | null } {
    const pos = d.positions?.[0] ?? null;
    if (!pos) return { status: "offline", kmh: 0, ageMs: null, pos: null };
    const ageMs = now - new Date(pos.timestamp).getTime();
    const kmh = Math.max(0, Math.round((pos.speed ?? 0) * 3.6));
    if (ageMs > OFFLINE_MS) return { status: "offline", kmh, ageMs, pos };
    if (kmh >= MOVING_KMH) return { status: "moving", kmh, ageMs, pos };
    if (pos.ignition) return { status: "ignition", kmh, ageMs, pos };
    return { status: "parked", kmh, ageMs, pos };
}

const STATUS_META: Record<Status, { dot: string; pill: string; bar: string; labelKey: string; pulse: boolean }> = {
    moving: { dot: "bg-emerald-500", pill: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20", bar: "from-emerald-400 to-emerald-600", labelKey: "enMovimiento", pulse: true },
    ignition: { dot: "bg-amber-500", pill: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20", bar: "from-amber-400 to-amber-500", labelKey: "motorEncendido", pulse: true },
    parked: { dot: "bg-blue-500", pill: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/20", bar: "from-blue-400 to-blue-600", labelKey: "estacionado", pulse: false },
    offline: { dot: "bg-rose-500", pill: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/20", bar: "from-rose-400 to-rose-500", labelKey: "sinSenal", pulse: false },
};

const isVelocity = (d: Device) => (d.model || "").toLowerCase().includes("velocity") || d.imei.startsWith("VF-");

function headingLabel(deg: number | null | undefined): string {
    if (deg == null || !Number.isFinite(Number(deg))) return "—";
    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return dirs[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8];
}

function timeAgo(ageMs: number | null, t: ReturnType<typeof useT>): string {
    if (ageMs == null) return t("dispositivos.lista.nunca");
    const min = Math.floor(ageMs / 60000);
    if (min < 1) return t("componentes.fleetMap.ahora");
    if (min < 60) return t("componentes.fleetMap.haceMin", { min });
    const h = Math.floor(min / 60);
    if (h < 24) return t("componentes.fleetMap.haceHoras", { h });
    return t("componentes.fleetMap.haceDias", { d: Math.floor(h / 24) });
}

function initials(name?: string | null): string {
    return (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

// Matrícula con estilo de targa italiana (banda azul + texto mono).
function Plate({ placa, size = "md" }: { placa: string; size?: "md" | "lg" }) {
    return (
        <span className={clsx(
            "inline-flex items-stretch rounded-md overflow-hidden border border-slate-300 dark:border-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-none",
            size === "lg" ? "text-base" : "text-[13px]"
        )}>
            <span className="bg-[#003399] text-white font-bold px-1.5 flex items-center text-[9px] tracking-tight">I</span>
            <span className="px-2.5 py-1 bg-white dark:bg-slate-100 text-slate-900 font-mono font-bold tracking-[0.18em] leading-none flex items-center">{placa}</span>
        </span>
    );
}

export default function DispositivosPage() {
    const t = useT();
    const dateLocale = useDateLocale();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastFetch, setLastFetch] = useState<Date | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | Status>("all");
    const [showModal, setShowModal] = useState(false);
    const [viewingDevice, setViewingDevice] = useState<Device | null>(null);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [tokenVisible, setTokenVisible] = useState<Set<string>>(new Set());
    const [menuFor, setMenuFor] = useState<string | null>(null);

    // Formulario (crear / editar)
    const [newName, setNewName] = useState("");
    const [newImei, setNewImei] = useState("");
    const [selectedVehiculo, setSelectedVehiculo] = useState("");
    const [vehiculos, setVehiculos] = useState<{ id: string; placa: string; marca_modelo: string }[]>([]);
    const [selectedTrabajador, setSelectedTrabajador] = useState("");
    const [trabajadores, setTrabajadores] = useState<{ id: string; nombre_completo: string; cargo: string }[]>([]);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchDevices();
        api.get("/vehiculos").then((r) => setVehiculos(r.data)).catch(() => { });
        api.get("/trabajadores").then((r) => setTrabajadores(r.data)).catch(() => { });
    }, []);

    // Refresco: cada 60 s se vuelven a pedir los dispositivos (el cron de Velocity
    // corre cada 5 min) y cada 30 s se recalculan los "hace X min". Se pausa cuando
    // la pestaña no está visible para no gastar compute.
    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 30_000);
        const poll = setInterval(() => { if (document.visibilityState === "visible") fetchDevices(true); }, 60_000);
        return () => { clearInterval(tick); clearInterval(poll); };
    }, []);

    // Cerrar el menú contextual al hacer clic fuera.
    useEffect(() => {
        if (!menuFor) return;
        const close = () => setMenuFor(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [menuFor]);

    const fetchDevices = async (silent = false) => {
        if (silent) setRefreshing(true);
        try {
            const res = await api.get("/gps/devices");
            setDevices(res.data);
            setNow(Date.now());
            setLastFetch(new Date());
        } catch (error) {
            console.error("Error fetching devices:", error);
            if (!silent) toast.error(t("dispositivos.lista.toasts.errorCargar"));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const enriched = useMemo(
        () => devices.map((d) => ({ d, ...deriveStatus(d, now) })),
        [devices, now]
    );

    const counts = useMemo(() => {
        const c = { all: enriched.length, moving: 0, ignition: 0, parked: 0, offline: 0, gps: 0, app: 0 };
        for (const e of enriched) {
            c[e.status]++;
            if (isVelocity(e.d)) c.gps++; else c.app++;
        }
        return c;
    }, [enriched]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const order: Record<Status, number> = { moving: 0, ignition: 1, parked: 2, offline: 3 };
        return enriched
            .filter((e) => filter === "all" || e.status === filter || (filter === "parked" && e.status === "ignition"))
            .filter((e) => !q || [e.d.name, e.d.imei, e.d.vehiculo?.placa, e.d.trabajador?.nombre_completo].some((v) => (v || "").toLowerCase().includes(q)))
            .sort((a, b) => order[a.status] - order[b.status] || (a.ageMs ?? Infinity) - (b.ageMs ?? Infinity));
    }, [enriched, filter, query]);

    const resetForm = () => { setNewName(""); setNewImei(""); setSelectedVehiculo(""); setSelectedTrabajador(""); };
    const openCreate = () => { setEditingDevice(null); resetForm(); setShowModal(true); };
    const openEdit = (device: Device) => {
        setEditingDevice(device);
        setNewName(device.name);
        setNewImei(device.imei);
        setSelectedVehiculo(device.vehiculo_id || "");
        setSelectedTrabajador(device.trabajador_id || "");
        setShowModal(true);
    };
    const closeModal = () => { setShowModal(false); setEditingDevice(null); resetForm(); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newImei) return;
        setCreating(true);
        try {
            const payload = { name: newName, imei: newImei, vehiculoId: selectedVehiculo || null, trabajadorId: selectedTrabajador || null };
            if (editingDevice) {
                await api.patch(`/gps/devices/${editingDevice.id}`, payload);
                toast.success(t("dispositivos.lista.toasts.actualizadoExitoso"));
            } else {
                await api.post("/gps/devices", { ...payload, vehiculoId: selectedVehiculo || undefined, trabajadorId: selectedTrabajador || undefined });
                toast.success(t("dispositivos.lista.toasts.creadoExitoso"));
            }
            closeModal();
            fetchDevices();
        } catch (error) {
            console.error(error);
            toast.error(editingDevice ? t("dispositivos.lista.toasts.errorActualizar") : t("dispositivos.lista.toasts.errorCrear"));
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingDevice) return;
        setDeleting(true);
        try {
            await api.delete(`/gps/devices/${deletingDevice.id}`);
            toast.success(t("dispositivos.lista.toasts.eliminadoExitoso"));
            setDeletingDevice(null);
            fetchDevices();
        } catch (error) {
            console.error(error);
            toast.error(t("dispositivos.lista.toasts.errorEliminar"));
        } finally {
            setDeleting(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t("dispositivos.lista.toasts.tokenCopiado"));
    };
    const toggleToken = (id: string) => setTokenVisible((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const FILTERS: { key: "all" | Status; labelKey: string; count: number; dot?: string }[] = [
        { key: "all", labelKey: "todos", count: counts.all },
        { key: "moving", labelKey: "enMovimiento", count: counts.moving, dot: STATUS_META.moving.dot },
        { key: "parked", labelKey: "detenidos", count: counts.parked + counts.ignition, dot: STATUS_META.parked.dot },
        { key: "offline", labelKey: "sinSenal", count: counts.offline, dot: STATUS_META.offline.dot },
    ];

    return (
        <div className="w-full space-y-6 sm:space-y-8">
            {/* Encabezado */}
            <MotionDiv {...enter(0)} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t("dispositivos.lista.titulo")}</h1>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            LIVE
                        </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1.5">{t("dispositivos.lista.subtituloPremium")}</p>
                </div>
                <div className="flex items-center gap-2">
                    {lastFetch && (
                        <button
                            onClick={() => fetchDevices(true)}
                            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2.5 py-2 rounded-lg transition"
                            title={t("dispositivos.lista.actualizado", { time: lastFetch.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) })}
                        >
                            <RefreshCw size={13} className={clsx(refreshing && "animate-spin")} />
                            {t("dispositivos.lista.actualizado", { time: lastFetch.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) })}
                        </button>
                    )}
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5"
                    >
                        <Plus size={16} />
                        {t("dispositivos.lista.nuevoDispositivo")}
                    </button>
                </div>
            </MotionDiv>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { icon: Satellite, tone: "blue", label: t("dispositivos.lista.kpis.total"), value: String(counts.all), sub: t("dispositivos.lista.kpis.totalSub", { gps: counts.gps, app: counts.app }) },
                    { icon: Activity, tone: "emerald", label: t("dispositivos.lista.kpis.enMovimiento"), value: String(counts.moving), sub: t("dispositivos.lista.kpis.enMovimientoSub") },
                    { icon: Power, tone: "amber", label: t("dispositivos.lista.kpis.detenidos"), value: String(counts.parked + counts.ignition), sub: t("dispositivos.lista.kpis.detenidosSub", { motor: counts.ignition }) },
                    { icon: WifiOff, tone: "rose", label: t("dispositivos.lista.kpis.sinSenal"), value: String(counts.offline), sub: t("dispositivos.lista.kpis.sinSenalSub") },
                ].map((k, i) => (
                    <MotionDiv key={k.label} {...enter(i + 1)}>
                        <KpiCard {...k} />
                    </MotionDiv>
                ))}
            </div>

            {/* Barra de búsqueda + filtros */}
            <MotionDiv {...enter(5)} className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("dispositivos.lista.buscarPlaceholder")}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    />
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-x-auto shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={clsx(
                                "flex items-center gap-2 shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-sm font-medium transition",
                                filter === f.key ? "bg-[#FFC933] text-[#1a1a1c]" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            )}
                        >
                            {f.dot && <span className={clsx("w-1.5 h-1.5 rounded-full", filter === f.key ? "bg-[#1a1a1c]/60" : f.dot)} />}
                            {t(`dispositivos.lista.filtros.${f.labelKey}`)}
                            <span className={clsx("min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-md text-[11px] font-bold", filter === f.key ? "bg-[#1a1a1c]/10 text-[#1a1a1c]" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>
                                {f.count}
                            </span>
                        </button>
                    ))}
                </div>
            </MotionDiv>

            {/* Grid de dispositivos */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-24 h-7 rounded-md bg-slate-100 dark:bg-slate-800" />
                                <div className="flex-1 h-4 rounded bg-slate-100 dark:bg-slate-800" />
                            </div>
                            <div className="grid grid-cols-3 gap-3 mt-5">
                                {[0, 1, 2].map((j) => <div key={j} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
                            </div>
                            <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 mt-4" />
                        </div>
                    ))}
                </div>
            ) : devices.length === 0 ? (
                <div className="text-center py-20 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                    <Smartphone size={44} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("dispositivos.lista.vacioTitulo")}</h3>
                    <p className="text-sm text-slate-400 mt-1">{t("dispositivos.lista.vacioDescripcion")}</p>
                </div>
            ) : visible.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                    <p className="text-sm text-slate-400">{t("dispositivos.lista.sinResultados")}</p>
                    <button onClick={() => { setFilter("all"); setQuery(""); }} className="mt-3 text-xs font-medium text-blue-600 hover:underline">{t("dispositivos.lista.limpiarFiltro")}</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {visible.map(({ d: device, status, kmh, ageMs, pos }, i) => {
                        const meta = STATUS_META[status];
                        const velocity = isVelocity(device);
                        const showToken = tokenVisible.has(device.id);
                        return (
                            <MotionDiv key={device.id} {...enter(Math.min(i, 8) + 6)}>
                                <div className="group relative h-full rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_40px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 transition-all duration-300 overflow-visible">
                                    {/* Barra de estado */}
                                    <div className={clsx("h-1 rounded-t-2xl bg-gradient-to-r", meta.bar)} />

                                    <div className="p-5">
                                        {/* Cabecera: placa + nombre + estado + menú */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    {device.vehiculo ? <Plate placa={device.vehiculo.placa} /> : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-400 border border-dashed border-slate-300 dark:border-slate-700">
                                                            <Truck size={11} /> {t("dispositivos.lista.sinVehiculo")}
                                                        </span>
                                                    )}
                                                    <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border", velocity
                                                        ? "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/20"
                                                        : "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700")}>
                                                        {velocity ? <Radio size={10} /> : <Smartphone size={10} />}
                                                        {velocity ? t("dispositivos.lista.fuente.velocity") : t("dispositivos.lista.fuente.appMovil")}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate">{device.name}</p>
                                                <p className="text-[11px] text-slate-400 font-mono truncate">{device.vehiculo?.marca_modelo || device.imei}</p>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap", meta.pill)}>
                                                    <span className="relative flex h-2 w-2">
                                                        {meta.pulse && <span className={clsx("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", meta.dot)} />}
                                                        <span className={clsx("relative inline-flex rounded-full h-2 w-2", meta.dot)} />
                                                    </span>
                                                    {t(`dispositivos.lista.estado.${meta.labelKey}`)}
                                                </span>
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === device.id ? null : device.id); }}
                                                        title={t("dispositivos.lista.mas")}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                                    >
                                                        <MoreHorizontal size={16} />
                                                    </button>
                                                    {menuFor === device.id && (
                                                        <div className="absolute right-0 mt-1 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.16)] py-1.5 z-20 animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                                                            <button onClick={() => { setMenuFor(null); openEdit(device); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                                                                <Pencil size={14} className="text-slate-400" /> {t("dispositivos.lista.editarDispositivoTitle")}
                                                            </button>
                                                            <button onClick={() => { setMenuFor(null); toggleToken(device.id); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                                                                {showToken ? <EyeOff size={14} className="text-slate-400" /> : <Eye size={14} className="text-slate-400" />}
                                                                {showToken ? t("dispositivos.lista.ocultarToken") : t("dispositivos.lista.mostrarToken")}
                                                            </button>
                                                            <button onClick={() => { setMenuFor(null); copyToClipboard(device.token); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                                                                <Copy size={14} className="text-slate-400" /> {t("dispositivos.lista.copiarToken")}
                                                            </button>
                                                            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                                            <button onClick={() => { setMenuFor(null); setDeletingDevice(device); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition">
                                                                <Trash2 size={14} /> {t("dispositivos.lista.eliminarDispositivoTitle")}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Métricas en vivo */}
                                        <div className="grid grid-cols-3 gap-2.5 mt-5">
                                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Gauge size={11} /> {t("dispositivos.lista.stats.velocidad")}</p>
                                                <p className={clsx("mt-1 text-2xl font-bold tabular-nums leading-none", status === "moving" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white")}>
                                                    {pos ? kmh : "—"}<span className="text-[11px] font-medium text-slate-400 ml-1">km/h</span>
                                                </p>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Power size={11} /> {t("dispositivos.lista.stats.motor")}</p>
                                                <p className={clsx("mt-1 text-sm font-bold leading-none pt-1.5", pos?.ignition ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white")}>
                                                    {pos == null || pos.ignition == null ? "—" : pos.ignition ? t("dispositivos.lista.motorOn") : t("dispositivos.lista.motorOff")}
                                                </p>
                                                {pos?.heading != null && (
                                                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                        <Navigation size={9} style={{ transform: `rotate(${Number(pos.heading)}deg)` }} /> {headingLabel(pos.heading)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Clock size={11} /> {t("dispositivos.lista.stats.ultimoReporte")}</p>
                                                <p className={clsx("mt-1 text-sm font-bold leading-none pt-1.5", status === "offline" ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white")}>
                                                    {timeAgo(ageMs, t)}
                                                </p>
                                                {pos && (
                                                    <p className="text-[10px] text-slate-400 mt-1 truncate" title={new Date(pos.timestamp).toLocaleString(dateLocale)}>
                                                        {new Date(pos.timestamp).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Conductor */}
                                        <div className="flex items-center gap-3 mt-4">
                                            {device.trabajador?.url_foto ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={device.trabajador.url_foto} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow" />
                                            ) : (
                                                <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold ring-2 ring-white dark:ring-slate-800 shadow", device.trabajador ? "bg-gradient-to-br from-blue-500 to-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400")}>
                                                    {device.trabajador ? initials(device.trabajador.nombre_completo) : <User size={14} />}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className={clsx("text-sm font-medium truncate", device.trabajador ? "text-slate-900 dark:text-white uppercase" : "text-slate-400 italic")}>
                                                    {device.trabajador?.nombre_completo || t("dispositivos.lista.sinChofer")}
                                                </p>
                                                {device.trabajador?.cargo && <p className="text-[11px] text-slate-400 truncate">{device.trabajador.cargo}</p>}
                                            </div>
                                            {pos && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${pos.latitude},${pos.longitude}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    title={`${t("dispositivos.lista.coordenadas")}: ${Number(pos.latitude).toFixed(5)}, ${Number(pos.longitude).toFixed(5)}`}
                                                    className="text-slate-300 hover:text-blue-500 transition"
                                                >
                                                    <MapPin size={15} />
                                                </a>
                                            )}
                                        </div>

                                        {/* Token (oculto por defecto) */}
                                        {showToken && (
                                            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                                                <code className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate select-all">{device.token}</code>
                                                <button onClick={() => copyToClipboard(device.token)} className="p-1 rounded-md text-slate-400 hover:text-blue-500 transition"><Copy size={13} /></button>
                                            </div>
                                        )}

                                        {/* Acciones */}
                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <button
                                                onClick={() => setViewingDevice(device)}
                                                className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-[0_6px_20px_rgba(37,99,235,0.25)] transition-all"
                                            >
                                                <Navigation size={15} /> {t("dispositivos.lista.verEnVivo")}
                                            </button>
                                            <a
                                                href={`/dispositivos/${device.id}/historial`}
                                                className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold transition"
                                            >
                                                <History size={15} /> {t("dispositivos.lista.historial")}
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </MotionDiv>
                        );
                    })}
                </div>
            )}

            {/* Modal mapa en vivo */}
            {viewingDevice && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setViewingDevice(null)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[88vh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-slate-200/70 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800 flex justify-between items-center gap-3">
                            <div className="min-w-0 flex items-center gap-3">
                                {viewingDevice.vehiculo && <Plate placa={viewingDevice.vehiculo.placa} size="lg" />}
                                <div className="min-w-0">
                                    <h2 className="font-bold text-base text-slate-900 dark:text-white truncate">{viewingDevice.name}</h2>
                                    <p className="text-xs text-slate-400 truncate">
                                        {viewingDevice.trabajador?.nombre_completo?.toUpperCase() || t("dispositivos.lista.imei", { imei: viewingDevice.imei })}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setViewingDevice(null)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition shrink-0">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 relative bg-slate-100 dark:bg-slate-950">
                            <LiveMapReal
                                deviceId={viewingDevice.id}
                                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
                                vehiclePlate={viewingDevice.vehiculo?.placa}
                                deviceName={viewingDevice.name}
                                workerName={viewingDevice.trabajador?.nombre_completo}
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal crear / editar */}
            {showModal && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0F172A] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto border border-slate-200/70 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-800">
                            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                {editingDevice ? t("dispositivos.lista.modal.editarTitulo") : t("dispositivos.lista.modal.crearTitulo")}
                            </h2>
                            <p className="text-sm text-slate-400 mt-1">
                                {editingDevice ? t("dispositivos.lista.modal.editarSubtitulo") : t("dispositivos.lista.modal.crearSubtitulo")}
                            </p>
                        </div>
                        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("dispositivos.lista.modal.nombreLabel")}</label>
                                <input type="text" required placeholder={t("dispositivos.lista.modal.nombrePlaceholder")}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
                                    value={newName} onChange={(e) => setNewName(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("dispositivos.lista.modal.identificadorLabel")}</label>
                                <input type="text" required placeholder={t("dispositivos.lista.modal.identificadorPlaceholder")}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all font-mono"
                                    value={newImei} onChange={(e) => setNewImei(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("dispositivos.lista.modal.vehiculoLabel")}</label>
                                <Select value={selectedVehiculo} onChange={(v) => setSelectedVehiculo(v)}
                                    options={vehiculos.map((v) => ({ value: v.id, label: `${v.placa} - ${v.marca_modelo}` }))}
                                    placeholder={t("dispositivos.lista.modal.vehiculoPlaceholder")} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("dispositivos.lista.modal.trabajadorLabel")}</label>
                                <Select value={selectedTrabajador} onChange={(v) => setSelectedTrabajador(v)}
                                    options={trabajadores.map((tr) => ({ value: tr.id, label: tr.cargo ? `${tr.nombre_completo} — ${tr.cargo}` : tr.nombre_completo }))}
                                    placeholder={t("dispositivos.lista.modal.trabajadorPlaceholder")} clearable />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={closeModal}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium">
                                    {t("dispositivos.lista.modal.cancelar")}
                                </button>
                                <button type="submit" disabled={creating}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {creating
                                        ? (editingDevice ? t("dispositivos.lista.modal.guardando") : t("dispositivos.lista.modal.creando"))
                                        : (editingDevice ? t("dispositivos.lista.modal.guardarCambios") : t("dispositivos.lista.modal.crearDispositivo"))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal eliminar */}
            {deletingDevice && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0F172A] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] overflow-hidden border border-slate-200/70 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                                    <AlertTriangle size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("dispositivos.lista.eliminarModal.titulo")}</h2>
                                    <p className="text-sm text-slate-400">{t("dispositivos.lista.eliminarModal.subtitulo")}</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {t("dispositivos.lista.eliminarModal.confirmacionPre")} <span className="font-semibold text-slate-900 dark:text-white">{deletingDevice.name}</span>{t("dispositivos.lista.eliminarModal.confirmacionPost")}
                            </p>
                            <div className="flex gap-3 pt-6">
                                <button type="button" onClick={() => setDeletingDevice(null)} disabled={deleting}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium disabled:opacity-50">
                                    {t("dispositivos.lista.eliminarModal.cancelar")}
                                </button>
                                <button type="button" onClick={handleDelete} disabled={deleting}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-[0_8px_24px_rgba(225,29,72,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {deleting ? t("dispositivos.lista.eliminarModal.eliminando") : t("dispositivos.lista.eliminarModal.eliminar")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
