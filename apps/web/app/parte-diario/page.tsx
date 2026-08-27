'use client';

// Vista de CHOFER: "Parte Diario". Portada de parte-diario.tsx del app.
// El chofer registra su jornada (km + horas de manejo día/noche + espera), que
// es la base de su pago. Aquí se lista el mes en curso, se ve el total y se
// crea/edita/elimina cada parte (POST/PATCH/DELETE /registros). Las tarifas y
// el total del período vienen de /registros/mias/resumen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Save, Trash2, Sun, Moon, Loader2, X, ClipboardList, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { useCurrency } from '../../lib/useCurrency';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import FileUpload from '../../components/FileUpload';
import { SPEDIZIONE_OPTIONS } from '../operaciones/constants';

const OPERACIONES = ['DHL', 'FARMACIA'] as const;
type Operacion = (typeof OPERACIONES)[number];

const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const numOr0 = (v: string) => {
    const n = parseFloat((v || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
const emptyForm = () => ({
    operacion: 'DHL' as Operacion,
    fecha: hoyISO(),
    km: '',
    citta_destino: '',
    ore_mattina: '',
    ore_sera: '',
    ore_attesa: '',
    consegna_realizada: true,
    cliente: '',
    spedizione: '',
    comentario: '',
    foto_bolla: '',
});
type FormState = ReturnType<typeof emptyForm>;

interface Tarifas { giorno: number; notte: number; corte: number }
interface Resumen {
    tarifas?: Tarifas; km?: number; oreDia?: number; oreNoche?: number;
    oreTotal?: number; totalPartes?: number; gananciaTotal?: number | null;
}

export default function ParteDiarioPage() {
    const user = useAuthStore((s) => s.user);
    const { format } = useCurrency();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [loading, setLoading] = useState(true);
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [registros, setRegistros] = useState<any[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm());
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
    const tarifas = resumen?.tarifas;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [res, list] = await Promise.all([
                api.get('/registros/mias/resumen').catch(() => null),
                api.get('/registros', { params: { take: 100, trabajadorId: user?.trabajador_id } }).catch(() => null),
            ]);
            if (res?.data) setResumen(res.data);
            const arr = Array.isArray(list?.data) ? list!.data : (list?.data?.items ?? []);
            setRegistros(arr);
        } finally {
            setLoading(false);
        }
    }, [user?.trabajador_id]);

    useEffect(() => { load(); }, [load]);

    const openNuevo = () => { setEditId(null); setForm(emptyForm()); setModalOpen(true); };
    const openEditar = (r: any) => {
        setEditId(r.id);
        setForm({
            operacion: r.operacion === 'FARMACIA' ? 'FARMACIA' : 'DHL',
            fecha: r.fecha ? String(r.fecha).split('T')[0] : hoyISO(),
            km: r.km != null ? String(r.km) : '',
            citta_destino: r.citta_destino || '',
            ore_mattina: r.ore_mattina != null ? String(r.ore_mattina) : '',
            ore_sera: r.ore_sera != null ? String(r.ore_sera) : '',
            ore_attesa: r.ore_attesa != null ? String(r.ore_attesa) : '',
            consegna_realizada: r.consegna_realizada !== false,
            cliente: r.cliente || '',
            spedizione: r.spedizione || '',
            comentario: r.comentario || '',
            foto_bolla: r.foto_bolla || '',
        });
        setModalOpen(true);
    };

    const gananciaDe = (r: { ore_mattina?: any; ore_sera?: any }) =>
        tarifas ? Math.round((Number(r.ore_mattina || 0) * tarifas.giorno + Number(r.ore_sera || 0) * tarifas.notte) * 100) / 100 : 0;

    const gananciaPreview = tarifas
        ? Math.round((numOr0(form.ore_mattina) * tarifas.giorno + numOr0(form.ore_sera) * tarifas.notte) * 100) / 100
        : 0;

    const guardar = async () => {
        if (!form.ore_mattina && !form.ore_sera && !form.km) {
            toast.error('Ingresa al menos los km o las horas de manejo.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                operacion: form.operacion,
                fecha: form.fecha,
                citta_destino: form.citta_destino.trim() || null,
                km: numOr0(form.km),
                ore_mattina: numOr0(form.ore_mattina),
                ore_sera: numOr0(form.ore_sera),
                ore_attesa: numOr0(form.ore_attesa),
                consegna_realizada: form.consegna_realizada,
                cliente: form.cliente.trim() || null,
                spedizione: form.spedizione.trim() || null,
                comentario: form.comentario.trim() || null,
                foto_bolla: form.foto_bolla || null,
            };
            if (editId) await api.patch(`/registros/${editId}`, payload);
            else await api.post('/registros', payload);
            toast.success(editId ? 'Parte actualizado' : 'Parte guardado');
            setModalOpen(false);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'No se pudo guardar el parte.');
        } finally {
            setSaving(false);
        }
    };

    const eliminar = async () => {
        if (!editId) return;
        if (!confirm('¿Seguro que deseas eliminar este parte?')) return;
        try {
            await api.delete(`/registros/${editId}`);
            toast.success('Parte eliminado');
            setModalOpen(false);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'No se pudo eliminar.');
        }
    };

    const corte = tarifas?.corte ?? 19;

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-50 grid place-items-center text-blue-600"><ClipboardList size={20} /></div>
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-800">Parte Diario</h1>
                        <p className="text-sm text-slate-500">Registra tus km y horas de manejo</p>
                    </div>
                </div>
                <button onClick={openNuevo} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
                    <Plus size={16} /> Nuevo parte
                </button>
            </div>

            {/* Resumen del mes */}
            {resumen && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Partes" value={String(resumen.totalPartes ?? registros.length)} />
                    <Stat label="KM" value={String(resumen.km ?? 0)} />
                    <Stat label="Horas" value={`${(resumen.oreTotal ?? 0)} h`} />
                    {resumen.gananciaTotal != null && <Stat label="Ganancia" value={format(resumen.gananciaTotal)} accent />}
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-slate-500 p-6"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
            ) : registros.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                    <ClipboardList className="mx-auto mb-2 text-slate-400" size={28} />
                    <p className="font-semibold text-slate-700">Sin partes este período</p>
                    <p className="text-sm">Toca «Nuevo parte» para registrar tu jornada.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {registros.map((r) => (
                        <button key={r.id} onClick={() => openEditar(r)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <Calendar size={14} className="text-slate-400" />
                                    {r.fecha ? String(r.fecha).split('T')[0] : '—'}
                                    <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-600">{r.operacion || 'DHL'}</span>
                                </div>
                                {tarifas && <span className="text-sm font-bold text-emerald-600">{format(gananciaDe(r))}</span>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                                <span>{Number(r.km || 0)} km</span>
                                <span className="flex items-center gap-1"><Sun size={12} className="text-amber-500" /> {Number(r.ore_mattina || 0)} h</span>
                                <span className="flex items-center gap-1"><Moon size={12} className="text-indigo-500" /> {Number(r.ore_sera || 0)} h</span>
                                {r.cliente && <span>{r.cliente}</span>}
                                {r.spedizione && <span>{r.spedizione}</span>}
                                <span className="flex items-center gap-1">
                                    {r.consegna_realizada !== false
                                        ? <><CheckCircle2 size={12} className="text-emerald-500" /> Consegna OK</>
                                        : <><XCircle size={12} className="text-red-400" /> No realizada</>}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Modal formulario */}
            {modalOpen && mounted && createPortal(
                <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                            <h2 className="font-bold text-slate-800">{editId ? 'Editar parte' : 'Parte del día'}</h2>
                            <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Operación */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Operación</label>
                                <div className="mt-1 flex gap-2 bg-slate-100 rounded-xl p-1">
                                    {OPERACIONES.map((op) => (
                                        <button key={op} type="button" onClick={() => set('operacion', op)}
                                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${form.operacion === op ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                            {op}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <DatePicker label="Fecha" value={form.fecha} onChange={(v) => set('fecha', v || hoyISO())} />

                            <Field label="KM total" value={form.km} onChange={(v) => set('km', v)} placeholder="0" numeric />

                            <div className="grid grid-cols-2 gap-3">
                                <Field
                                    label={`Horas de día · ${format(tarifas?.giorno)}/h`}
                                    hint={`hasta ${corte}:00`}
                                    value={form.ore_mattina} onChange={(v) => set('ore_mattina', v)} placeholder="0.0" numeric icon={<Sun size={13} className="text-amber-500" />}
                                />
                                <Field
                                    label={`Horas de noche · ${format(tarifas?.notte)}/h`}
                                    hint={`desde ${corte}:00`}
                                    value={form.ore_sera} onChange={(v) => set('ore_sera', v)} placeholder="0.0" numeric icon={<Moon size={13} className="text-indigo-500" />}
                                />
                            </div>

                            <Field label="Horas de espera (ore attesa)" value={form.ore_attesa} onChange={(v) => set('ore_attesa', v)} placeholder="0.0" numeric />

                            {/* Ganancia en vivo */}
                            <div className="rounded-xl bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                                <span className="text-sm font-medium text-white/80">Ganancia de este parte</span>
                                <span className="text-xl font-extrabold">{format(gananciaPreview)}</span>
                            </div>

                            {/* Consegna realizada */}
                            <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                                <div>
                                    <div className="text-sm font-semibold text-slate-700">¿Se realizó la consegna?</div>
                                    <div className="text-xs text-slate-400">Marca si se completó la entrega</div>
                                </div>
                                <input type="checkbox" checked={form.consegna_realizada} onChange={(e) => set('consegna_realizada', e.target.checked)} className="h-5 w-5 accent-emerald-600" />
                            </label>

                            <Field label="Cliente" value={form.cliente} onChange={(v) => set('cliente', v)} placeholder="Ej: DHL, OTRO…" />
                            <Select label="Spedizione" value={form.spedizione} onChange={(v) => set('spedizione', v)} options={SPEDIZIONE_OPTIONS} clearable placeholder="Selecciona spedizione" />
                            <Field label="Comentario final" value={form.comentario} onChange={(v) => set('comentario', v)} placeholder="Notas de la jornada" textarea />

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Foto de la bolla</label>
                                <FileUpload value={form.foto_bolla} onChange={(url) => set('foto_bolla', url)} onClear={() => set('foto_bolla', '')} label="Subir foto de la bolla" />
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button onClick={guardar} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60">
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {editId ? 'Guardar cambios' : 'Guardar parte'}
                                </button>
                                {editId && (
                                    <button onClick={eliminar} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 flex items-center gap-1.5">
                                        <Trash2 size={16} /> Eliminar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className={`rounded-2xl border p-4 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-lg font-extrabold ${accent ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</div>
        </div>
    );
}

function Field({ label, hint, value, onChange, placeholder, numeric, textarea, icon }: {
    label: string; hint?: string; value: string; onChange: (v: string) => void;
    placeholder?: string; numeric?: boolean; textarea?: boolean; icon?: React.ReactNode;
}) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">{icon}{label}{hint && <span className="normal-case font-normal text-slate-400">· {hint}</span>}</label>
            {textarea ? (
                <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            ) : (
                <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                    inputMode={numeric ? 'decimal' : undefined}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            )}
        </div>
    );
}
