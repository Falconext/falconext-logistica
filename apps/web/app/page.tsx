'use client';

import Link from "next/link";
import { motion } from "framer-motion";
import { Users, Truck, ArrowUpRight, Map, Wrench, Bell, TrendingUp, TrendingDown, DollarSign, Activity, Fuel, Receipt, Package, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuthStore } from "../lib/store";
import { canAccessModule, moduleForPath } from "../lib/modules";
import { useCurrency } from "../lib/useCurrency";
import { useT } from "../lib/i18n";
import { KpiCard } from "../components/mono/MonoCards";

const MotionDiv = motion.div as any;

interface DashboardStats {
    workers: { active: number; total: number; percentage: number };
    vehicles: { active: number; total: number; percentage: number };
    routes: { today: number; thisMonth: number };
    deliveries: { completed: number; pending: number; cancelled: number; successRate: number };
    clients: { active: number };
    maintenance: { thisMonth: number };
    alerts: { pending: number };
    costs: { fuel: number; tolls: number; maintenance: number; total: number; prevTotal: number; changePct: number | null; income: number; margin: number };
}

export default function Home() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();
    const { format } = useCurrency();
    const t = useT();

    useEffect(() => {
        Promise.all([api.get('/dashboard/alerts'), api.get('/dashboard/stats')])
            .then(([alertsRes, statsRes]) => { setAlerts(alertsRes.data); setStats(statsRes.data); })
            .catch(err => console.error('Failed to fetch dashboard data', err))
            .finally(() => setLoading(false));
    }, []);

    const expiredCount = alerts.filter(a => a.status === 'VENCIDO').length;
    const name = user?.email ? user.email.split('@')[0] : t('dashboard.defaultUserName');

    const canGo = (href: string) => canAccessModule(user, moduleForPath(href) || '');
    const accesos = [
        { href: '/trabajadores', icon: <Users size={16} />, label: t('dashboard.accesoPersonal') },
        { href: '/vehiculos', icon: <Truck size={16} />, label: t('dashboard.accesoFlota') },
        { href: '/mantenimiento', icon: <Wrench size={16} />, label: t('dashboard.accesoMantenimiento') },
        { href: '/alertas', icon: <Bell size={16} />, label: t('dashboard.accesoAlertas') },
    ].filter(a => canGo(a.href));

    const changePct = stats?.costs?.changePct ?? null;
    const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] } });

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-8 w-8 rounded-full border-[3px] border-slate-200 dark:border-slate-700 border-t-[#FFC933] animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto pb-6">
            {/* Welcome */}
            <div className="mb-6 sm:mb-7">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white capitalize">{t('dashboard.welcomeTitle', { name })}</h1>
                <p className="text-sm text-slate-400 mt-1">{t('dashboard.subtitle')}</p>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {[
                    { icon: DollarSign, tone: 'amber', label: t('dashboard.costsTitle'), value: format(stats?.costs?.total ?? 0), sub: changePct != null ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% ${t('dashboard.vsMesAnterior')}` : t('dashboard.esteMes') },
                    { icon: CheckCircle2, tone: 'emerald', label: t('dashboard.tasaExito'), value: `${stats?.deliveries?.successRate ?? 0}%`, sub: `${stats?.deliveries?.completed ?? 0} ${t('dashboard.entregasCompletadas').toLowerCase()}` },
                    { icon: Users, tone: 'blue', label: t('dashboard.personalActivo'), value: String(stats?.workers.active ?? 0), sub: t('dashboard.deTotal', { total: stats?.workers.total ?? 0 }) },
                    { icon: Truck, tone: 'violet', label: t('dashboard.flotaOperativa'), value: String(stats?.vehicles.active ?? 0), sub: t('dashboard.deTotal', { total: stats?.vehicles.total ?? 0 }) },
                ].map((k, i) => (
                    <MotionDiv key={i} {...enter(i)}><KpiCard {...k} /></MotionDiv>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Left column */}
                <div className="space-y-5">
                    <MotionDiv {...enter(4)}>
                        <Card icon={DollarSign} title={t('dashboard.costsTitle')} href="/reportes" actionLabel={t('dashboard.verReportes')}>
                            <div className="flex items-baseline gap-3 flex-wrap">
                                <span className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tabular-nums">{format(stats?.costs?.total ?? 0)}</span>
                                {changePct != null && (() => {
                                    const up = changePct > 0;
                                    const cls = up ? 'text-rose-500' : changePct < 0 ? 'text-emerald-500' : 'text-slate-400';
                                    const Icon = up ? TrendingUp : changePct < 0 ? TrendingDown : null;
                                    return (
                                        <span className={`flex items-center gap-1 text-sm font-semibold ${cls}`}>
                                            {Icon && <Icon size={15} />}{up ? '+' : ''}{changePct.toFixed(1)}%
                                            <span className="text-slate-400 font-normal">{t('dashboard.vsMesAnterior')}</span>
                                        </span>
                                    );
                                })()}
                            </div>
                            <div className="mt-4 space-y-2.5">
                                <CostRow icon={<Fuel size={15} />} label={t('dashboard.costFuel')} value={format(stats?.costs?.fuel ?? 0)} />
                                <CostRow icon={<Receipt size={15} />} label={t('dashboard.costTolls')} value={format(stats?.costs?.tolls ?? 0)} />
                                <CostRow icon={<Wrench size={15} />} label={t('dashboard.costMaintenance')} value={format(stats?.costs?.maintenance ?? 0)} />
                            </div>
                            {stats && stats.costs && stats.costs.income > 0 ? (
                                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">{t('dashboard.margen')}</span>
                                    <span className={`font-bold tabular-nums ${stats.costs.margin >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{format(stats.costs.margin)}</span>
                                </div>
                            ) : (
                                <p className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">{t('dashboard.sinIngresos')}</p>
                            )}
                        </Card>
                    </MotionDiv>

                    <MotionDiv {...enter(5)}>
                        <Card icon={Package} title={t('dashboard.operacionesTitle')} href={canGo('/operaciones') ? '/operaciones' : undefined} actionLabel={t('dashboard.verDetalles')}>
                            <div className="space-y-2.5">
                                <Row label={t('dashboard.entregasCompletadas')} value={`${stats?.deliveries?.completed ?? 0}`} />
                                <Row label={t('dashboard.entregasPendientes')} value={`${stats?.deliveries?.pending ?? 0}`} />
                            </div>
                            <div className="mt-4 flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-emerald-500 tabular-nums">{stats?.deliveries?.successRate ?? 0}%</span>
                                <span className="text-sm text-slate-400">{t('dashboard.tasaExito')}</span>
                            </div>
                        </Card>
                    </MotionDiv>

                    <MotionDiv {...enter(6)}>
                        <div className="grid grid-cols-2 gap-5">
                            <QuickCard icon={<Wrench size={16} />} label={t('dashboard.mantEsteMes')} value={stats?.maintenance.thisMonth ?? 0} href={canGo('/mantenimiento') ? '/mantenimiento' : undefined} />
                            <QuickCard icon={<Map size={16} />} label={t('dashboard.rutasHoy')} value={stats?.routes.today ?? 0} href={canGo('/operaciones') ? '/operaciones' : undefined} />
                        </div>
                    </MotionDiv>
                </div>

                {/* Right column */}
                <div className="space-y-5">
                    <MotionDiv {...enter(5)}>
                        <Card icon={Bell} title={t('dashboard.vencimientosTitle')} href={canGo('/alertas') ? '/alertas' : undefined} actionLabel={t('dashboard.verTodos')} badge={expiredCount > 0 ? t('dashboard.badgeVencidos', { count: expiredCount }) : undefined}>
                            {alerts.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 mb-3">
                                        <TrendingUp className="text-emerald-500" size={20} />
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.allOk')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-1 max-h-[320px] overflow-y-auto">
                                    {alerts.slice(0, 6).map((alert) => (
                                        <div key={alert.id} className="flex items-center gap-3 py-2.5 px-1">
                                            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                                                {alert.type === 'VEHICULO' ? <Truck size={16} /> : <Users size={16} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center gap-2">
                                                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{alert.entity}</h4>
                                                    <Badge tone={alert.status === 'VENCIDO' ? 'red' : 'amber'}>
                                                        {alert.daysRemaining < 0 ? t('dashboard.vencidoDias', { days: Math.abs(alert.daysRemaining) }) : t('dashboard.diasRestantes', { days: alert.daysRemaining })}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-slate-400 truncate mt-0.5">{alert.docName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </MotionDiv>

                    {accesos.length > 0 && (
                        <MotionDiv {...enter(6)}>
                            <Card icon={Activity} title={t('dashboard.accesosRapidosTitle')}>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {accesos.map((a) => (<AccessLink key={a.href} href={a.href} icon={a.icon} label={a.label} />))}
                                </div>
                            </Card>
                        </MotionDiv>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------- building blocks ---------- */

function Card({ icon: Icon, title, href, actionLabel, badge, children }: {
    icon: any; title: string; href?: string; actionLabel?: string; badge?: string; children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Icon size={16} className="text-slate-400 shrink-0" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
                    {badge && <Badge tone="red">{badge}</Badge>}
                </div>
                {href && actionLabel && (
                    <Link href={href} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-900 dark:hover:text-white transition">
                        {actionLabel}
                        <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center"><ArrowUpRight size={14} /></span>
                    </Link>
                )}
            </div>
            {children}
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{value}</span>
        </div>
    );
}

function CostRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="text-slate-400">{icon}</span>{label}</span>
            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{value}</span>
        </div>
    );
}

function QuickCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
    const inner = (
        <>
            <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">{icon}</div>
                {href && <ArrowUpRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition" />}
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</div>
            <div className="text-xs text-slate-400">{label}</div>
        </>
    );
    const cls = "rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
    if (!href) return <div className={cls}>{inner}</div>;
    return <Link href={href} className={`${cls} hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5 transition-all duration-300 group block`}>{inner}</Link>;
}

function AccessLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 px-3.5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 transition group">
            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition">{icon}</span>
            {label}
        </Link>
    );
}

function Badge({ tone, children }: { tone: 'red' | 'amber' | 'emerald' | 'blue'; children: React.ReactNode }) {
    const tones = {
        red: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
        amber: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
        blue: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    };
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${tones[tone]}`}>{children}</span>;
}
