'use client';

// Vista de CHOFER: "Mi Perfil" — sus datos, contacto, actividad del mes y
// documentos con vencimiento. GET /trabajadores/mi/perfil + /documentos +
// /registros/mias/resumen.
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Route as RouteIcon, Moon, ClipboardList, Loader2, FileText, ExternalLink, Phone, Mail, MapPin, Globe, Briefcase, Hash, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { KpiCard } from '../../components/mono/MonoCards';

const MotionDiv = motion.div as any;

interface Perfil {
    nombre_completo?: string | null; cargo?: string | null; id_trabajador?: string | null;
    estado_laboral?: string | null; url_foto?: string | null;
    telefono?: string | null; email_personal?: string | null; direccion?: string | null;
    nacionalidad?: string | null; area_trabajo?: string | null;
    [k: string]: any;
}
interface Archivo { id: string; tipo?: string | null; nombre?: string | null; url: string; fecha_vencimiento?: string | null; bloqueado?: boolean; entidad?: string | null; entidad_id?: string | null; }
interface Resumen { totalPartes: number; km: number; oreSera: number; oreTotal: number; }

type DocType = { key: string; label: string; legacyNum?: string; legacyVenc?: string };
const DOC_TYPES: DocType[] = [
    { key: 'PATENTE', label: 'Licencia de conducir', legacyNum: 'licencia_conducir', legacyVenc: 'fecha_vencimiento_licencia' },
    { key: 'TRADUZIONE_PATENTE', label: 'Traducción de licencia', legacyNum: 'traduccion_licencia', legacyVenc: 'fecha_vencimiento_traduccion' },
    { key: 'PASSAPORTO', label: 'Pasaporte', legacyNum: 'numero_pasaporte', legacyVenc: 'fecha_vencimiento_pasaporte' },
    { key: 'CARTA_IDENTITA', label: 'Documento de identidad', legacyNum: 'documento_identidad', legacyVenc: 'fecha_vencimiento_identidad' },
    { key: 'SOGGIORNO', label: 'Permiso de residencia', legacyNum: 'permiso_residencia', legacyVenc: 'fecha_vencimiento_residencia' },
    { key: 'CODICE_FISCALE', label: 'Código fiscal', legacyNum: 'codigo_fiscal', legacyVenc: 'fecha_vencimiento_fiscal' },
    { key: 'CONTRATTO', label: 'Contrato', legacyNum: 'tipo_contrato', legacyVenc: 'fecha_vencimiento_contrato' },
    { key: 'PERMESSO_TRASPORTO', label: 'Permiso de transporte' },
    { key: 'RESPONSIVA', label: 'Carta responsiva' },
    { key: 'UNILAV', label: 'Contrato de trabajo (Unilav)' },
    { key: 'TREDICESIMA_QUATTORDICESIMA', label: '13ma / 14ma' },
];

const horasLabel = (h: number) => { const horas = Math.floor(h); const min = Math.round((h - horas) * 60); return min > 0 ? `${horas}h ${min}m` : `${horas}h`; };
const fmtFecha = (v?: string | null) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); };
function vencBadge(v?: string | null): { label: string; cls: string; dot: string } | null {
    if (!v) return null; const d = new Date(v); if (isNaN(d.getTime())) return null;
    const dias = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (dias < 0) return { label: 'Vencido', cls: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20', dot: 'bg-rose-500' };
    if (dias <= 30) return { label: `Vence en ${dias}d`, cls: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20', dot: 'bg-amber-500' };
    return { label: 'Vigente', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20', dot: 'bg-emerald-500' };
}

export default function MiPerfilPage() {
    const user = useAuthStore((s) => s.user);
    const [perfil, setPerfil] = useState<Perfil | null>(null);
    const [archivos, setArchivos] = useState<Archivo[]>([]);
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [perfilRes, docsRes] = await Promise.all([
                api.get('/trabajadores/mi/perfil').catch(() => null),
                api.get('/documentos').catch(() => null),
            ]);
            setPerfil(perfilRes?.data ?? null);
            setArchivos(Array.isArray(docsRes?.data) ? docsRes!.data : []);
        } finally {
            setLoading(false);
        }
        try {
            const r = await api.get('/registros/mias/resumen');
            setResumen(r.data ?? null);
        } catch { /* sin resumen */ }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;
    }

    // SOLO los documentos del PROPIO chofer: el endpoint /documentos trae todos los del
    // tenant (incluidos los de VEHÍCULOS —Libretto, Assicurazione— y los de otros
    // trabajadores). Filtramos a entidad TRABAJADOR con nuestro id, para no cruzar data.
    const myIds = new Set<string>([perfil?.id, perfil?.id_trabajador, (user as any)?.trabajador_id].filter(Boolean) as string[]);
    const misArchivos = archivos.filter((a) => (a.entidad || '').toUpperCase() === 'TRABAJADOR' && a.entidad_id != null && myIds.has(a.entidad_id));

    // Archivo subido por tipo (el primero de cada tipo). Fuente principal del documento.
    const archivoByTipo = new Map<string, Archivo>();
    for (const a of misArchivos) {
        const k = (a.tipo || '').toUpperCase();
        if (k && !archivoByTipo.has(k)) archivoByTipo.set(k, a);
    }
    // Lista ÚNICA: una fila por documento (archivo subido → fecha + "Abrir"; si no,
    // respaldo al campo antiguo del perfil). Un solo estado por documento.
    const docs = DOC_TYPES.map((dt) => {
        const archivo = archivoByTipo.get(dt.key) || null;
        const legacyNum = dt.legacyNum ? (perfil?.[dt.legacyNum] as string) || null : null;
        const legacyVenc = dt.legacyVenc ? (perfil?.[dt.legacyVenc] as string) || null : null;
        return { label: dt.label, numero: legacyNum, venc: archivo?.fecha_vencimiento || legacyVenc || null, url: archivo?.url || null };
    }).filter((d) => d.numero || d.venc || d.url);
    const catalogados = new Set(DOC_TYPES.map((d) => d.key));
    const extras = misArchivos
        .filter((a) => !catalogados.has((a.tipo || '').toUpperCase()))
        .map((a) => ({ label: a.nombre || a.tipo || 'Documento', numero: null as string | null, venc: a.fecha_vencimiento || null, url: a.url || null }));
    const allDocs = [...docs, ...extras];

    const estado = perfil?.estado_laboral || 'Activo';
    const activo = estado.toLowerCase() === 'activo';
    const nombre = (perfil?.nombre_completo || '—').toUpperCase();
    const inicial = (perfil?.nombre_completo?.[0] || 'C').toUpperCase();
    const vigentes = allDocs.filter((d) => vencBadge(d.venc)?.label === 'Vigente').length;

    const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] } });

    return (
        <div className="w-full pb-6 space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Mi Perfil</h1>
                <p className="text-sm text-slate-400 mt-1">Tu información, actividad del mes y documentos.</p>
            </div>

            {/* Hero identidad */}
            <MotionDiv {...enter(0)}>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-blue-500/10 via-violet-500/10 to-transparent" />
                    <div className="relative flex items-center gap-4 sm:gap-5">
                        {perfil?.url_foto
                            ? <img src={perfil.url_foto} alt="" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white dark:ring-slate-800 shadow-sm shrink-0" />
                            : <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 grid place-items-center text-white text-3xl font-extrabold ring-2 ring-white dark:ring-slate-800 shadow-sm shrink-0">{inicial}</div>}
                        <div className="flex-1 min-w-0">
                            <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">{nombre}</div>
                            <div className="text-sm text-slate-400 truncate mt-0.5">{[perfil?.cargo, perfil?.id_trabajador].filter(Boolean).join(' · ') || 'Chofer'}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                {perfil?.telefono && <Chip icon={Phone} text={perfil.telefono} />}
                                {(perfil?.email_personal || user?.email) && <Chip icon={Mail} text={perfil?.email_personal || user?.email || ''} />}
                            </div>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${activo
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20'
                            : 'text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-500/10 dark:border-slate-700'}`}>
                            <ShieldCheck size={13} /> {estado}
                        </span>
                    </div>
                </div>
            </MotionDiv>

            {/* Actividad del mes */}
            <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5 px-0.5">Actividad del mes</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { icon: RouteIcon, tone: 'blue', label: 'Km del mes', value: `${resumen?.km ?? 0} km`, sub: 'manejo real' },
                        { icon: Clock, tone: 'violet', label: 'Horas de manejo', value: horasLabel(resumen?.oreTotal ?? 0), sub: 'total del mes' },
                        { icon: Moon, tone: 'amber', label: 'Horas noche', value: horasLabel(resumen?.oreSera ?? 0), sub: 'nocturnas' },
                        { icon: ClipboardList, tone: 'emerald', label: 'Partes', value: String(resumen?.totalPartes ?? 0), sub: 'registrados' },
                    ].map((k, i) => (
                        <MotionDiv key={k.label} {...enter(i + 1)}>
                            <KpiCard {...k} />
                        </MotionDiv>
                    ))}
                </div>
            </div>

            {/* Contacto + Documentos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <MotionDiv className="lg:col-span-1" {...enter(5)}>
                    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">Contacto</h2>
                        <div className="space-y-1">
                            <InfoRow icon={Phone} label="Teléfono" value={perfil?.telefono} />
                            <InfoRow icon={Mail} label="Email" value={perfil?.email_personal || user?.email} />
                            <InfoRow icon={MapPin} label="Dirección" value={perfil?.direccion} />
                            <InfoRow icon={Globe} label="Nacionalidad" value={perfil?.nacionalidad} />
                            <InfoRow icon={Briefcase} label="Área" value={perfil?.area_trabajo} />
                            <InfoRow icon={Hash} label="Código" value={perfil?.id_trabajador} />
                        </div>
                    </div>
                </MotionDiv>

                <MotionDiv className="lg:col-span-2" {...enter(6)}>
                    <div className="h-full rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <h2 className="text-base font-bold text-slate-900 dark:text-white">Mis documentos</h2>
                            {allDocs.length > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400">
                                    {vigentes}/{allDocs.length} vigentes
                                </span>
                            )}
                        </div>
                        {allDocs.length === 0 ? (
                            <p className="text-sm text-slate-400 py-8 text-center">Aún no hay documentos registrados.</p>
                        ) : (
                            <div className="space-y-2">
                                {allDocs.map((d, i) => {
                                    const b = vencBadge(d.venc);
                                    return (
                                        <div key={i} className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3.5 flex items-center gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0"><FileText size={16} /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{d.label}</div>
                                                <div className="text-xs text-slate-400 truncate">{d.venc ? `Vence ${fmtFecha(d.venc)}` : 'Sin fecha'}</div>
                                            </div>
                                            {b && (
                                                <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${b.cls}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} /> {b.label}
                                                </span>
                                            )}
                                            {d.url
                                                ? <a href={d.url} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"><ExternalLink size={14} /> Abrir</a>
                                                : <span className="shrink-0 text-xs text-slate-300 dark:text-slate-600">Sin archivo</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </MotionDiv>
            </div>
        </div>
    );
}

function Chip({ icon: Icon, text }: { icon: any; text: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 max-w-[220px]">
            <Icon size={13} className="shrink-0 text-slate-400" /> <span className="truncate">{text}</span>
        </span>
    );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
    return (
        <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0"><Icon size={15} /></div>
            <span className="text-sm text-slate-400 w-24 shrink-0">{label}</span>
            <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200 text-right truncate">{value || '—'}</span>
        </div>
    );
}
