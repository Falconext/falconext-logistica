'use client';

// Vista de CHOFER: "Mi Resumen" — su inicio personal. Entregas y gastos del mes,
// bonifico/saldo, accesos rápidos, consegnas asignadas y partes recientes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Package, Fuel, Navigation, MapPinned, CircleUser, ChevronRight, Clock,
    Route as RouteIcon, Moon, ClipboardList, Loader2, Hourglass, Wallet,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { useCurrency } from '../../lib/useCurrency';
import { KpiCard } from '../../components/mono/MonoCards';

const MotionDiv = motion.div as any;

interface Resumen {
    tarifas?: { giorno: number; notte: number; corte: number };
    totalPartes: number; km: number; oreMattina: number; oreSera: number; oreTotal: number;
    reperibilita?: number; attesaHoras?: number; gananciaEstimada: number;
    recientes: { id: string; fecha: string; operacion: string; targa?: string | null; km: number; oreMattina: number; oreSera: number; ganancia: number }[];
}
interface ResumenChofer {
    entregas: { total: number; entregadas: number; canceladas: number; pendientes: number; enRuta: number };
    gastos: { combustible: number; peajes: number; otros: number; total: number };
    anticipo: number; saldo: number; moneda: string;
}
interface Consegna { id: string; id_programacion?: string | null; cliente?: string | null; lugar_retiro?: string | null; lugar_entrega?: string | null; fecha?: string | null; estado?: string | null; }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const horasLabel = (h: number) => { const horas = Math.floor(h); const min = Math.round((h - horas) * 60); return min > 0 ? `${horas}h ${min}m` : `${horas}h`; };

function estadoBadge(estado?: string | null): { label: string; cls: string } {
    switch ((estado || '').toUpperCase()) {
        case 'COMPLETADO': case 'COMPLETED': return { label: 'Completado', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20' };
        case 'IN_TRANSIT': case 'EN_RUTA_IDA': case 'EN_RUTA_VUELTA': return { label: 'En ruta', cls: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20' };
        case 'EN_DESTINO': return { label: 'En destino', cls: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20' };
        case 'PENDING': case 'PENDIENTE': return { label: 'Pendiente', cls: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20' };
        default: return { label: estado || '—', cls: 'text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-500/10 dark:border-slate-700' };
    }
}

export default function MiResumenPage() {
    const user = useAuthStore((s) => s.user);
    const { format } = useCurrency();
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [chofer, setChofer] = useState<ResumenChofer | null>(null);
    const [consegnas, setConsegnas] = useState<Consegna[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [resRes, progRes, choferRes] = await Promise.all([
                api.get('/registros/mias/resumen').catch(() => null),
                api.get('/programacion', { params: { estados: 'PENDING,PENDIENTE,IN_TRANSIT,REPROGRAMADO', take: 5 } }).catch(() => null),
                api.get('/recorridos/mio/resumen').catch(() => null),
            ]);
            setResumen(resRes?.data ?? null);
            setChofer(choferRes?.data ?? null);
            const prog = progRes?.data;
            setConsegnas(Array.isArray(prog) ? prog : prog?.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const nombre = useMemo(() => (user?.nombre || user?.email?.split('@')[0] || 'Chofer').split(' ')[0], [user]);
    const mes = MESES[new Date().getMonth()];
    const saldo = chofer?.saldo ?? 0;
    const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] } });

    if (loading) {
        return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;
    }

    return (
        <div className="w-full pb-6 space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white capitalize">Hola, {nombre}</h1>
                <p className="text-sm text-slate-400 mt-1 capitalize">Tu resumen de {mes}</p>
            </div>

            {/* KPIs del mes (base del pago) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    { icon: RouteIcon, tone: 'blue', label: 'Km del mes', value: `${resumen?.km ?? 0} km`, sub: 'manejo real' },
                    { icon: Clock, tone: 'amber', label: 'Horas día', value: horasLabel(resumen?.oreMattina ?? 0), sub: 'diurnas' },
                    { icon: Moon, tone: 'violet', label: 'Horas noche', value: horasLabel(resumen?.oreSera ?? 0), sub: 'nocturnas' },
                    { icon: ClipboardList, tone: 'emerald', label: 'Reperibilità', value: String(resumen?.reperibilita ?? 0), sub: 'guardias' },
                    { icon: Hourglass, tone: 'rose', label: 'Attesa autorizadas', value: horasLabel(resumen?.attesaHoras ?? 0), sub: 'esperas' },
                ].map((k, i) => (
                    <MotionDiv key={k.label} {...enter(i)}><KpiCard {...k} /></MotionDiv>
                ))}
            </div>

            {/* Contenido en 3 columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                {/* Columna izquierda (2/3) */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Entregas del mes */}
                    <MotionDiv {...enter(5)}>
                        <SectionCard icon={Package} title={<>Entregas de <span className="capitalize">{mes}</span></>}>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <Tile label="Total" value={String(chofer?.entregas.total ?? 0)} color="text-slate-800 dark:text-white" />
                                <Tile label="Entregadas" value={String(chofer?.entregas.entregadas ?? 0)} color="text-emerald-600 dark:text-emerald-400" />
                                <Tile label="Canceladas" value={String(chofer?.entregas.canceladas ?? 0)} color="text-rose-500 dark:text-rose-400" />
                                <Tile label="Pendientes" value={String(chofer?.entregas.pendientes ?? 0)} color="text-amber-500 dark:text-amber-400" />
                            </div>
                        </SectionCard>
                    </MotionDiv>

                    {/* Mis consegnas */}
                    <MotionDiv {...enter(6)}>
                        <SectionCard icon={MapPinned} title="Mis consegnas" href="/mis-consegnas" actionLabel="Ver todas">
                            {consegnas.length === 0 ? (
                                <p className="text-sm text-slate-400 py-6 text-center">Sin consegnas pendientes.</p>
                            ) : (
                                <div className="space-y-2">
                                    {consegnas.map((cx) => {
                                        const b = estadoBadge(cx.estado);
                                        return (
                                            <Link key={cx.id} href="/mis-consegnas" className="flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{cx.cliente || cx.id_programacion || 'Consegna'}</div>
                                                    <div className="text-xs text-slate-400 truncate">{(cx.lugar_retiro || '—')} → {(cx.lugar_entrega || '—')}</div>
                                                </div>
                                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${b.cls}`}>{b.label}</span>
                                                <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    </MotionDiv>

                    {/* Partes recientes */}
                    {!!resumen?.recientes?.length && (
                        <MotionDiv {...enter(7)}>
                            <SectionCard icon={ClipboardList} title="Mis partes recientes" href="/parte-diario" actionLabel="Ver todos">
                                <div className="space-y-2">
                                    {resumen.recientes.map((r) => (
                                        <Link key={r.id} href="/parte-diario" className="flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{new Date(r.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {r.operacion}{r.targa ? ` · ${r.targa}` : ''}</div>
                                                <div className="text-xs text-slate-400">{r.km} km · {horasLabel(r.oreMattina)} día + {horasLabel(r.oreSera)} noche</div>
                                            </div>
                                            <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                        </Link>
                                    ))}
                                </div>
                            </SectionCard>
                        </MotionDiv>
                    )}
                </div>

                {/* Columna derecha (1/3) */}
                <div className="space-y-5">
                    {/* Gastos + saldo */}
                    <MotionDiv {...enter(6)}>
                        <SectionCard icon={Fuel} title={<>Gastos de <span className="capitalize">{mes}</span></>}>
                            <div className="grid grid-cols-2 gap-3">
                                <Tile label="Carburante" value={format(chofer?.gastos.combustible ?? 0)} color="text-sky-600 dark:text-sky-400" />
                                <Tile label="Peaje" value={format(chofer?.gastos.peajes ?? 0)} color="text-indigo-600 dark:text-indigo-400" />
                                <Tile label="Spesa" value={format(chofer?.gastos.otros ?? 0)} color="text-amber-600 dark:text-amber-400" />
                                <Tile label="Total" value={format(chofer?.gastos.total ?? 0)} color="text-rose-500 dark:text-rose-400" />
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-slate-400">Bonifico (adelanto)</span><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{format(chofer?.anticipo ?? 0)}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">Total gastos</span><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">− {format(chofer?.gastos.total ?? 0)}</span></div>
                                <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
                                    <span className={`flex items-center gap-1.5 font-bold ${saldo < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}><Wallet size={15} />{saldo < 0 ? 'Saldo (falta)' : 'Saldo a favor'}</span>
                                    <span className={`font-extrabold tabular-nums text-lg ${saldo < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{format(Math.abs(saldo))}</span>
                                </div>
                            </div>
                        </SectionCard>
                    </MotionDiv>

                    {/* Accesos rápidos */}
                    <MotionDiv {...enter(7)}>
                        <SectionCard icon={Navigation} title="Accesos rápidos">
                            <div className="grid grid-cols-3 gap-2.5">
                                <Quick href="/mi-ruta" icon={<Navigation size={20} />} label="Mi Ruta" />
                                <Quick href="/historial-mensual" icon={<MapPinned size={20} />} label="Historial" />
                                <Quick href="/mi-perfil" icon={<CircleUser size={20} />} label="Mi Perfil" />
                            </div>
                        </SectionCard>
                    </MotionDiv>
                </div>
            </div>
        </div>
    );
}

function SectionCard({ icon: Icon, title, href, actionLabel, children }: { icon: any; title: React.ReactNode; href?: string; actionLabel?: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Icon size={16} className="text-slate-400 shrink-0" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
                </div>
                {href && actionLabel && (
                    <Link href={href} className="text-xs font-medium text-slate-400 hover:text-slate-900 dark:hover:text-white transition shrink-0">{actionLabel}</Link>
                )}
            </div>
            {children}
        </div>
    );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 py-3 px-2 text-center">
            <div className={`text-base font-extrabold truncate tabular-nums ${color}`}>{value}</div>
            <div className="text-[11px] text-slate-400 font-semibold mt-0.5">{label}</div>
        </div>
    );
}

function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 py-3.5 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5 transition-all duration-300 text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 group">
            <span className="group-hover:scale-110 transition-transform">{icon}</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        </Link>
    );
}
