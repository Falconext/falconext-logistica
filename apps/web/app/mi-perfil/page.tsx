'use client';

// Vista de CHOFER: "Mi Perfil" — sus datos, contacto, actividad del mes y
// documentos con vencimiento. GET /trabajadores/mi/perfil + /documentos +
// /registros/mias/resumen.
import { useCallback, useEffect, useState } from 'react';
import { User as UserIcon, Clock, Route as RouteIcon, Moon, ClipboardList, Loader2, FileText, ExternalLink } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';

interface Perfil {
    nombre_completo?: string | null; cargo?: string | null; id_trabajador?: string | null;
    estado_laboral?: string | null; url_foto?: string | null;
    telefono?: string | null; email_personal?: string | null; direccion?: string | null;
    nacionalidad?: string | null; area_trabajo?: string | null;
    [k: string]: any;
}
interface Archivo { id: string; tipo?: string | null; nombre?: string | null; url: string; fecha_vencimiento?: string | null; }
interface Resumen { totalPartes: number; km: number; oreSera: number; oreTotal: number; }

const DOCS: [string, string, string][] = [
    ['Licencia de conducir', 'licencia_conducir', 'fecha_vencimiento_licencia'],
    ['Traducción de licencia', 'traduccion_licencia', 'fecha_vencimiento_traduccion'],
    ['Pasaporte', 'numero_pasaporte', 'fecha_vencimiento_pasaporte'],
    ['Documento de identidad', 'documento_identidad', 'fecha_vencimiento_identidad'],
    ['Permiso de residencia', 'permiso_residencia', 'fecha_vencimiento_residencia'],
    ['Código fiscal', 'codigo_fiscal', 'fecha_vencimiento_fiscal'],
    ['Contrato', 'tipo_contrato', 'fecha_vencimiento_contrato'],
];

const horasLabel = (h: number) => { const horas = Math.floor(h); const min = Math.round((h - horas) * 60); return min > 0 ? `${horas}h ${min}m` : `${horas}h`; };
const fmtFecha = (v?: string | null) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); };
function vencBadge(v?: string | null): { label: string; cls: string } | null {
    if (!v) return null; const d = new Date(v); if (isNaN(d.getTime())) return null;
    const dias = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (dias < 0) return { label: 'Vencido', cls: 'text-red-600 bg-red-50 border-red-200' };
    if (dias <= 30) return { label: `Vence en ${dias}d`, cls: 'text-amber-600 bg-amber-50 border-amber-200' };
    return { label: 'Vigente', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
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

    const docs = DOCS.map(([label, numKey, vencKey]) => ({ label, numero: (perfil?.[numKey] as string) || null, venc: (perfil?.[vencKey] as string) || null }))
        .filter((d) => d.numero || d.venc);

    const estado = perfil?.estado_laboral || 'Activo';

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
            <h1 className="text-xl font-extrabold text-slate-800">Mi Perfil</h1>

            {/* Identidad */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4">
                {perfil?.url_foto
                    ? <img src={perfil.url_foto} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                    : <div className="h-16 w-16 rounded-2xl bg-blue-100 grid place-items-center text-blue-600 text-2xl font-extrabold">{(perfil?.nombre_completo?.[0] || 'C').toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                    <div className="text-lg font-extrabold text-slate-800 truncate">{perfil?.nombre_completo || '—'}</div>
                    <div className="text-sm text-slate-500 truncate">{[perfil?.cargo, perfil?.id_trabajador].filter(Boolean).join(' · ') || 'Chofer'}</div>
                </div>
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${estado === 'Activo' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>{estado}</span>
            </div>

            {/* Contacto */}
            <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Contacto</h2>
                <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                    <Info label="Teléfono" value={perfil?.telefono} />
                    <Info label="Email" value={perfil?.email_personal || user?.email} />
                    <Info label="Dirección" value={perfil?.direccion} />
                    <Info label="Nacionalidad" value={perfil?.nacionalidad} />
                    <Info label="Área" value={perfil?.area_trabajo} />
                </div>
            </div>

            {/* Actividad del mes */}
            <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Actividad del mes</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat icon={<RouteIcon size={16} className="text-sky-500" />} label="Km del mes" value={`${resumen?.km ?? 0} km`} />
                    <Stat icon={<Clock size={16} className="text-blue-500" />} label="Horas de manejo" value={horasLabel(resumen?.oreTotal ?? 0)} />
                    <Stat icon={<Moon size={16} className="text-indigo-500" />} label="Horas noche" value={horasLabel(resumen?.oreSera ?? 0)} />
                    <Stat icon={<ClipboardList size={16} className="text-emerald-500" />} label="Partes" value={String(resumen?.totalPartes ?? 0)} />
                </div>
            </div>

            {/* Documentos del perfil */}
            {docs.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Mis documentos</h2>
                    <div className="space-y-2">
                        {docs.map((d, i) => {
                            const b = vencBadge(d.venc);
                            return (
                                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center gap-3">
                                    <FileText size={18} className="text-slate-400" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-slate-800 truncate">{d.label}</div>
                                        <div className="text-xs text-slate-500">{d.numero || '—'}{d.venc ? ` · vence ${fmtFecha(d.venc)}` : ''}</div>
                                    </div>
                                    {b && <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${b.cls}`}>{b.label}</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Archivos subidos */}
            {archivos.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Archivos</h2>
                    <div className="space-y-2">
                        {archivos.map((a) => {
                            const b = vencBadge(a.fecha_vencimiento);
                            return (
                                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center gap-3 hover:border-blue-300">
                                    <FileText size={18} className="text-slate-400" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-slate-800 truncate">{a.nombre || a.tipo || 'Documento'}</div>
                                        {a.fecha_vencimiento && <div className="text-xs text-slate-500">vence {fmtFecha(a.fecha_vencimiento)}</div>}
                                    </div>
                                    {b && <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${b.cls}`}>{b.label}</span>}
                                    <ExternalLink size={15} className="text-slate-300" />
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function Info({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-slate-700 text-right truncate">{value || '—'}</span>
        </div>
    );
}
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
            <div className="text-lg font-extrabold text-slate-800 mt-0.5">{value}</div>
        </div>
    );
}
