'use client';

// Vista de CHOFER: "Mi Ruta". Portada del flujo del app móvil (mi-ruta.tsx):
//  1. Si no hay recorrido activo → lista las consegnas asignadas para ACEPTAR.
//  2. Al aceptar → PATCH estado_consegna=ACCETTATA y se muestra el detalle con
//     el botón "Iniciar ruta" (POST /recorridos/iniciar).
//  3. Si hay recorrido activo → panel "traslado en curso" con las acciones por
//     estado (llegada / descanso / reanudar / regreso / finalizar / cancelar).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Navigation, MapPin, Package, CheckCircle2, Play, Flag, CornerUpLeft, Coffee,
    RefreshCw, Ban, Loader2, Truck, Clock, Plus, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { MapboxRouteMap } from '../../components/tracking/MapboxRouteMap';
import { estadoConsegnaMeta } from '../operaciones/constants';

interface Parada {
    id: string;
    orden: number;
    label: string;
    llegada_en?: string | null;
    anticipo?: number | null;
    gastos?: any;
    nota?: string | null;
}
interface Recorrido {
    id: string;
    estado: 'EN_RUTA_IDA' | 'EN_DESTINO' | 'EN_RUTA_VUELTA' | 'COMPLETADO' | 'CANCELADO';
    origen_label?: string | null;
    destino_label?: string | null;
    iniciado_en: string;
    descanso_desde?: string | null;
    programacion_id?: string | null;
    paradas?: Parada[];
}
interface Operacion {
    id: string;
    cliente?: string | null;
    lugar_retiro?: string | null;
    lugar_entrega?: string | null;
    estado?: string | null;
    estado_consegna?: string | null;
    retiros?: string[] | null;
    destinos?: string[] | null;
    spedizione?: string | null;
    app?: string | null;
    ciudad?: string | null;
    km?: number | null;
    otros_datos?: string | null;
    nota?: string | null;
}

const ESTADO_LABEL: Record<string, string> = {
    EN_RUTA_IDA: 'En ruta al destino',
    EN_DESTINO: 'En el destino',
    EN_RUTA_VUELTA: 'Regresando al origen',
};

export default function MiRutaPage() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [activo, setActivo] = useState<Recorrido | null>(null);
    const [trackingOp, setTrackingOp] = useState<Operacion | null>(null);
    const [operaciones, setOperaciones] = useState<Operacion[]>([]);
    const [selected, setSelected] = useState<Operacion | null>(null); // consegna aceptada → detalle
    const [rendicionParada, setRendicionParada] = useState<Parada | null>(null); // parada en la que se registra la llegada

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/recorridos/mio/activo');
            if (data && data.id) {
                setActivo(data);
                setOperaciones([]);
                setSelected(null);
                if (data.programacion_id) {
                    try {
                        const res = await api.get(`/programacion/${data.programacion_id}`);
                        if (res.data) setTrackingOp(res.data);
                    } catch { /* noop */ }
                }
            } else {
                setActivo(null);
                setTrackingOp(null);
                const ops = await api.get('/recorridos/mias/operaciones');
                setOperaciones(Array.isArray(ops.data) ? ops.data : []);
            }
        } catch (e) {
            console.error('[MiRuta] load', e);
            setActivo(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Aceptar la consegna: se marca ACCETTATA (el supervisor ve que la recibió)
    // y se abre el detalle para iniciar la ruta.
    const aceptar = async (op: Operacion) => {
        try {
            await api.patch(`/programacion/${op.id}`, { estado_consegna: 'ACCETTATA' });
        } catch { /* no bloquear al chofer si falla el guardado */ }
        setSelected({ ...op, estado_consegna: 'ACCETTATA' });
    };

    const iniciar = async (op: Operacion) => {
        setBusy(true);
        try {
            await api.post('/recorridos/iniciar', { programacionId: op.id });
            toast.success('Ruta iniciada');
            setSelected(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'No se pudo iniciar la ruta');
        } finally {
            setBusy(false);
        }
    };

    const accion = async (path: string, label: string) => {
        if (!activo) return;
        setBusy(true);
        try {
            await api.post(`/recorridos/${activo.id}/${path}`);
            toast.success(label);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'No se pudo completar la acción');
        } finally {
            setBusy(false);
        }
    };

    // Marca la llegada a una parada + su rendición (anticipo/gastos) opcional.
    const llegarParada = async (parada: Parada, rendicion?: { anticipo?: number; gastos?: any; nota?: string }) => {
        if (!activo) return;
        setBusy(true);
        try {
            await api.post(`/recorridos/${activo.id}/paradas/${parada.id}/llegada`, rendicion || {});
            toast.success(`Llegada registrada: ${parada.label}`);
            setRendicionParada(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'No se pudo registrar la llegada');
        } finally {
            setBusy(false);
        }
    };

    // Paradas del recorrido activo y la próxima pendiente (la que toca marcar).
    const paradas = (activo?.paradas || []).slice().sort((a, b) => a.orden - b.orden);
    const proximaParada = paradas.find((p) => !p.llegada_en) || null;
    const todasLlegadas = paradas.length > 0 && paradas.every((p) => p.llegada_en);

    const routeStops = (op: Operacion) =>
        [...(op.retiros || []), op.lugar_entrega, ...(op.destinos || [])]
            .map((s) => (s || '').trim())
            .filter(Boolean);

    if (loading) {
        return (
            <div className="p-6 flex items-center gap-2 text-slate-500">
                <Loader2 className="animate-spin" size={18} /> Cargando tu ruta…
            </div>
        );
    }

    // ── Recorrido en curso ───────────────────────────────────────────────
    if (activo) {
        const enDescanso = !!activo.descanso_desde;
        return (
            <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
                <Header title="Mi Ruta" subtitle="Traslado en curso" />
                <div className="rounded-2xl border border-blue-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Navigation className="text-blue-600" size={22} />
                        <span className="text-lg font-extrabold text-slate-800">
                            {ESTADO_LABEL[activo.estado] || activo.estado}
                        </span>
                        {enDescanso && <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200">En descanso</span>}
                    </div>
                    <div className="text-sm text-slate-600 space-y-1">
                        <div className="flex items-center gap-2"><MapPin size={14} className="text-emerald-500" /> {activo.origen_label || trackingOp?.lugar_retiro || '—'}</div>
                        <div className="flex items-center gap-2"><MapPin size={14} className="text-slate-700" /> {activo.destino_label || trackingOp?.lugar_entrega || '—'}</div>
                    </div>

                    {trackingOp?.lugar_retiro && routeStops(trackingOp).length > 0 && (
                        <div className="h-64 rounded-xl overflow-hidden border border-slate-200">
                            <MapboxRouteMap
                                originAddress={trackingOp.lugar_retiro}
                                destinationAddress={routeStops(trackingOp).slice(-1)[0]}
                                waypoints={routeStops(trackingOp).slice(0, -1)}
                                showLegs
                            />
                        </div>
                    )}

                    {/* Paradas: el chofer marca la llegada de cada destino y registra su rendición */}
                    {paradas.length > 0 && (
                        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                            {paradas.map((p) => {
                                const llegó = !!p.llegada_en;
                                const esProxima = proximaParada?.id === p.id;
                                return (
                                    <div key={p.id} className="flex items-center gap-3 p-3">
                                        <div className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${llegó ? 'bg-emerald-500 text-white' : esProxima ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                            {llegó ? '✓' : p.orden}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 truncate">{p.label}</div>
                                            {llegó
                                                ? <div className="text-xs text-emerald-600 flex items-center gap-1"><Clock size={11} /> Llegada {new Date(p.llegada_en!).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}{(p.gastos?.length || p.anticipo) ? ' · rendición ✓' : ''}</div>
                                                : esProxima
                                                    ? <div className="text-xs text-blue-600">Próxima parada</div>
                                                    : <div className="text-xs text-slate-400">Pendiente</div>}
                                        </div>
                                        {!llegó && esProxima && (
                                            <button onClick={() => setRendicionParada(p)} disabled={busy}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60">
                                                <Flag size={13} /> Llegar a {p.label.split(',')[0].slice(0, 18)}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                        {/* Sin paradas (recorridos legacy): botón único de llegada */}
                        {paradas.length === 0 && activo.estado === 'EN_RUTA_IDA' && (
                            <ActionBtn onClick={() => accion('llegada', 'Llegaste al destino')} disabled={busy} icon={Flag} label="Llegué al destino" />
                        )}
                        {/* Regresar: disponible cuando todas las paradas están marcadas (o estado EN_DESTINO) */}
                        {(activo.estado === 'EN_DESTINO' || (paradas.length > 0 && todasLlegadas && activo.estado === 'EN_RUTA_IDA')) && (
                            <ActionBtn onClick={() => accion('regreso', 'Regresando al origen')} disabled={busy} icon={CornerUpLeft} label="Regresar al origen" />
                        )}
                        {activo.estado === 'EN_RUTA_VUELTA' && (
                            <ActionBtn onClick={() => accion('finalizar', 'Recorrido finalizado')} disabled={busy} icon={CheckCircle2} label="Finalizar recorrido" variant="success" />
                        )}
                        {enDescanso
                            ? <ActionBtn onClick={() => accion('reanudar', 'Descanso finalizado')} disabled={busy} icon={RefreshCw} label="Reanudar" />
                            : <ActionBtn onClick={() => accion('descanso', 'En descanso')} disabled={busy} icon={Coffee} label="Tomar descanso" variant="warning" />}
                        <ActionBtn onClick={() => { if (confirm('¿Seguro que quieres cancelar este traslado?')) accion('cancelar', 'Recorrido cancelado'); }} disabled={busy} icon={Ban} label="Cancelar" variant="danger" />
                    </div>
                </div>

                {rendicionParada && (
                    <RendicionParadaModal
                        parada={rendicionParada}
                        busy={busy}
                        onClose={() => setRendicionParada(null)}
                        onConfirm={(rendicion) => llegarParada(rendicionParada, rendicion)}
                    />
                )}
            </div>
        );
    }

    // ── Detalle de consegna aceptada (iniciar ruta) ──────────────────────
    if (selected) {
        const stops = routeStops(selected);
        return (
            <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
                <Header title="Consegna aceptada" subtitle="Revisa los datos e inicia la ruta" />
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-slate-800">{selected.cliente || 'Operación'}</span>
                        {estadoConsegnaMeta(selected.estado_consegna) && (
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${estadoConsegnaMeta(selected.estado_consegna)!.badge}`}>
                                {estadoConsegnaMeta(selected.estado_consegna)!.label}
                            </span>
                        )}
                    </div>
                    <DataRow label="Retiro" value={selected.lugar_retiro} icon={MapPin} iconClass="text-emerald-500" />
                    <DataRow label="Entrega" value={selected.lugar_entrega} icon={MapPin} iconClass="text-slate-700" />
                    {(selected.spedizione || selected.app || selected.ciudad) && (
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            {selected.spedizione && <span className="flex items-center gap-1"><Package size={13} /> {selected.spedizione}</span>}
                            {selected.app && <span>{selected.app}</span>}
                            {selected.ciudad && <span>{selected.ciudad}</span>}
                        </div>
                    )}
                    {selected.otros_datos && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2">{selected.otros_datos}</p>}

                    {selected.lugar_retiro && stops.length > 0 && (
                        <div className="h-56 rounded-xl overflow-hidden border border-slate-200">
                            <MapboxRouteMap originAddress={selected.lugar_retiro} destinationAddress={stops.slice(-1)[0]} waypoints={stops.slice(0, -1)} showLegs />
                        </div>
                    )}

                    <div className="flex gap-2 pt-1">
                        <ActionBtn onClick={() => iniciar(selected)} disabled={busy} icon={Play} label="Iniciar ruta" variant="success" />
                        <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Volver</button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Sin recorrido: elegir consegna ───────────────────────────────────
    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
            <Header title="Mi Ruta" subtitle="Elige una consegna para aceptar" />
            {operaciones.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                    <Package className="mx-auto mb-2 text-slate-400" size={28} />
                    <p className="font-semibold text-slate-700">Sin consegnas asignadas</p>
                    <p className="text-sm">Cuando te asignen una, aparecerá aquí.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {operaciones.map((op) => {
                        const stops = routeStops(op);
                        return (
                            <div key={op.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800">{op.cliente || 'Operación'}</span>
                                    {op.estado && <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200">{op.estado === 'REPROGRAMADO' ? 'Reprog.' : 'Pendiente'}</span>}
                                </div>
                                <DataRow label="" value={op.lugar_retiro} icon={MapPin} iconClass="text-emerald-500" />
                                <DataRow label="" value={op.lugar_entrega} icon={MapPin} iconClass="text-slate-700" />
                                {op.lugar_retiro && stops.length > 0 && (
                                    <div className="h-44 rounded-xl overflow-hidden border border-slate-200">
                                        <MapboxRouteMap originAddress={op.lugar_retiro} destinationAddress={stops.slice(-1)[0]} waypoints={stops.slice(0, -1)} showLegs />
                                    </div>
                                )}
                                <ActionBtn onClick={() => aceptar(op)} disabled={busy} icon={CheckCircle2} label="Aceptar consegna" variant="success" full />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 grid place-items-center text-blue-600"><Truck size={20} /></div>
            <div>
                <h1 className="text-xl font-extrabold text-slate-800">{title}</h1>
                <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
        </div>
    );
}

function DataRow({ label, value, icon: Icon, iconClass }: { label: string; value?: string | null; icon: any; iconClass?: string }) {
    return (
        <div className="flex items-center gap-2 text-sm text-slate-600">
            <Icon size={15} className={iconClass} />
            {label && <span className="text-slate-400">{label}:</span>}
            <span className="truncate">{value || '—'}</span>
        </div>
    );
}

function ActionBtn({ onClick, disabled, icon: Icon, label, variant = 'primary', full }: {
    onClick: () => void; disabled?: boolean; icon: any; label: string;
    variant?: 'primary' | 'success' | 'warning' | 'danger'; full?: boolean;
}) {
    const cls = {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        warning: 'bg-amber-500 hover:bg-amber-600 text-white',
        danger: 'bg-red-600 hover:bg-red-700 text-white',
    }[variant];
    return (
        <button onClick={onClick} disabled={disabled}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${cls} ${full ? 'w-full' : ''}`}>
            {disabled ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />} {label}
        </button>
    );
}

// Modal de rendición al LLEGAR a una parada. Los gastos y el anticipo son
// OPCIONALES (no obligatorios), pero se le recuerda al chofer registrarlos.
const GASTO_TIPOS = [
    { value: 'PEAJE', label: 'Peaje' },
    { value: 'COMBUSTIBLE', label: 'Combustible' },
    { value: 'PARKING', label: 'Parking' },
    { value: 'OTRO', label: 'Otro' },
];
function RendicionParadaModal({ parada, busy, onClose, onConfirm }: {
    parada: Parada; busy: boolean; onClose: () => void;
    onConfirm: (rendicion: { anticipo?: number; gastos?: any; nota?: string }) => void;
}) {
    const [anticipo, setAnticipo] = useState('');
    const [nota, setNota] = useState('');
    const [gastos, setGastos] = useState<{ tipo: string; monto: string; descripcion: string }[]>([]);

    const addGasto = () => setGastos((g) => [...g, { tipo: 'PEAJE', monto: '', descripcion: '' }]);
    const setGasto = (i: number, campo: string, v: string) => setGastos((g) => g.map((x, idx) => idx === i ? { ...x, [campo]: v } : x));
    const rmGasto = (i: number) => setGastos((g) => g.filter((_, idx) => idx !== i));

    const confirmar = () => {
        const gastosLimpios = gastos
            .filter((g) => Number(g.monto) > 0)
            .map((g) => ({ tipo: g.tipo, monto: Number(g.monto), descripcion: g.descripcion.trim() || null }));
        onConfirm({
            anticipo: anticipo ? Number(anticipo) : undefined,
            gastos: gastosLimpios.length ? gastosLimpios : undefined,
            nota: nota.trim() || undefined,
        });
    };

    const sinDatos = !anticipo && gastos.every((g) => !Number(g.monto)) && !nota.trim();

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-slate-800">Llegada a destino</h2>
                        <p className="text-xs text-slate-500 truncate max-w-[240px]">{parada.label}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <p className="text-sm text-slate-600">Registra la <b>rendición / gastos</b> de esta parada. Es opcional, pero se recomienda hacerlo en cada punto.</p>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Anticipo recibido (opcional)</label>
                        <input value={anticipo} onChange={(e) => setAnticipo(e.target.value)} inputMode="decimal" placeholder="0.00"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-500 uppercase">Gastos (opcional)</label>
                            <button onClick={addGasto} className="text-xs text-blue-600 font-semibold flex items-center gap-1"><Plus size={13} /> Agregar</button>
                        </div>
                        {gastos.map((g, i) => (
                            <div key={i} className="flex gap-2">
                                <select value={g.tipo} onChange={(e) => setGasto(i, 'tipo', e.target.value)} className="px-2 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                                    {GASTO_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <input value={g.monto} onChange={(e) => setGasto(i, 'monto', e.target.value)} inputMode="decimal" placeholder="0.00"
                                    className="w-20 px-2 py-2 rounded-xl border border-slate-200 text-sm" />
                                <input value={g.descripcion} onChange={(e) => setGasto(i, 'descripcion', e.target.value)} placeholder="Descripción"
                                    className="flex-1 px-2 py-2 rounded-xl border border-slate-200 text-sm" />
                                <button onClick={() => rmGasto(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Nota (opcional)</label>
                        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Observaciones de la parada"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>

                    {sinDatos && <p className="text-xs text-amber-600">No registraste rendición. Puedes continuar igual, pero se recomienda anotar los gastos de esta parada.</p>}

                    <div className="flex gap-2 pt-1">
                        <button onClick={confirmar} disabled={busy} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirmar llegada
                        </button>
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
