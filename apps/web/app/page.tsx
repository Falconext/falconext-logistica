'use client';

import Link from "next/link";
import { Users, Truck, ArrowUpRight, AlertTriangle, Map, Wrench, Bell, Package, TrendingUp, DollarSign, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuthStore } from "../lib/store";
import { canAccessModule, moduleForPath } from "../lib/modules";

interface DashboardStats {
    workers: { active: number; total: number; percentage: number };
    vehicles: { active: number; total: number; percentage: number };
    routes: { today: number; thisMonth: number };
    deliveries: { completed: number; pending: number; cancelled: number; successRate: number };
    clients: { active: number };
    maintenance: { thisMonth: number };
    alerts: { pending: number };
}

export default function Home() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();

    useEffect(() => {
        Promise.all([
            api.get('/dashboard/alerts'),
            api.get('/dashboard/stats')
        ])
            .then(([alertsRes, statsRes]) => {
                setAlerts(alertsRes.data);
                setStats(statsRes.data);
            })
            .catch(err => console.error('Failed to fetch dashboard data', err))
            .finally(() => setLoading(false));
    }, []);

    const expiredCount = alerts.filter(a => a.status === 'VENCIDO').length;
    const warningCount = alerts.filter(a => a.status === 'POR_VENCER').length;
    const name = user?.email ? user.email.split('@')[0] : 'Usuario';

    // Solo enlazar a módulos que el usuario tenga permitidos (los admins ven todo).
    const canGo = (href: string) => canAccessModule(user, moduleForPath(href) || '');
    const accesos = [
        { href: '/trabajadores', icon: <Users size={16} />, label: 'Personal' },
        { href: '/vehiculos', icon: <Truck size={16} />, label: 'Flota' },
        { href: '/mantenimiento', icon: <Wrench size={16} />, label: 'Mantenimiento' },
        { href: '/alertas', icon: <Bell size={16} />, label: 'Alertas' },
    ].filter(a => canGo(a.href));

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-[#FFC933] animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
            {/* Welcome */}
            <div className="mb-7">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 capitalize">Bienvenido, {name}</h1>
                <p className="text-slate-500 mt-1">La plataforma para gestionar y rastrear tu operación logística.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Left column */}
                <div className="space-y-5">
                    {/* Operaciones (funds-like) */}
                    <Card icon={<DollarSign size={17} />} title="Operaciones del mes" href={canGo('/operaciones') ? '/operaciones' : undefined} actionLabel="Ver detalles">
                        <div className="space-y-2.5">
                            <Row label="Entregas completadas" value={`${stats?.deliveries?.completed ?? 0}`} />
                            <Row label="Entregas pendientes" value={`${stats?.deliveries?.pending ?? 0}`} />
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-emerald-500 tabular-nums">{stats?.deliveries?.successRate ?? 0}%</span>
                            <span className="text-sm text-slate-400">tasa de éxito</span>
                        </div>
                    </Card>

                    {/* Personal & Flota */}
                    <Card icon={<Users size={17} />} title="Personal y flota" href={canGo('/trabajadores') ? '/trabajadores' : undefined} actionLabel="Ver detalles">
                        <div className="grid grid-cols-2 gap-4">
                            <MiniStat icon={<Users size={15} />} label="Personal activo" value={`${stats?.workers.active ?? 0}`} sub={`de ${stats?.workers.total ?? 0}`} pct={stats?.workers.percentage} />
                            <MiniStat icon={<Truck size={15} />} label="Flota operativa" value={`${stats?.vehicles.active ?? 0}`} sub={`de ${stats?.vehicles.total ?? 0}`} pct={stats?.vehicles.percentage} />
                        </div>
                    </Card>

                    {/* Mantenimiento + rutas quick row */}
                    <div className="grid grid-cols-2 gap-5">
                        <QuickCard icon={<Wrench size={16} />} label="Mant. este mes" value={stats?.maintenance.thisMonth ?? 0} href={canGo('/mantenimiento') ? '/mantenimiento' : undefined} />
                        <QuickCard icon={<Map size={16} />} label="Rutas hoy" value={stats?.routes.today ?? 0} href={canGo('/operaciones') ? '/operaciones' : undefined} />
                    </div>
                </div>

                {/* Right column */}
                <div className="space-y-5">
                    {/* Alerts */}
                    <Card icon={<Bell size={17} />} title="Próximos vencimientos" href={canGo('/alertas') ? '/alertas' : undefined} actionLabel="Ver todos" badge={expiredCount > 0 ? `${expiredCount} vencidos` : undefined}>
                        {alerts.length === 0 ? (
                            <div className="text-center py-8">
                                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-emerald-50 mb-3">
                                    <TrendingUp className="text-emerald-500" size={20} />
                                </div>
                                <p className="text-sm text-slate-500">¡Todo en orden! No hay alertas pendientes.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 -mx-1 max-h-[320px] overflow-y-auto">
                                {alerts.slice(0, 6).map((alert) => (
                                    <div key={alert.id} className="flex items-center gap-3 py-2.5 px-1">
                                        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                            {alert.type === 'VEHICULO' ? <Truck size={16} /> : <Users size={16} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center gap-2">
                                                <h4 className="text-sm font-medium text-slate-900 truncate">{alert.entity}</h4>
                                                <Badge tone={alert.status === 'VENCIDO' ? 'red' : 'amber'}>
                                                    {alert.daysRemaining < 0 ? `Vencido ${Math.abs(alert.daysRemaining)}d` : `${alert.daysRemaining}d`}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-400 truncate mt-0.5">{alert.docName}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* Quick access — solo módulos permitidos */}
                    {accesos.length > 0 && (
                        <Card icon={<Activity size={17} />} title="Accesos rápidos">
                            <div className="grid grid-cols-2 gap-2.5">
                                {accesos.map((a) => (
                                    <AccessLink key={a.href} href={a.href} icon={a.icon} label={a.label} />
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------- building blocks ---------- */

function Card({ icon, title, href, actionLabel, badge, children }: {
    icon: React.ReactNode; title: string; href?: string; actionLabel?: string; badge?: string; children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#1a1a1c] text-white flex items-center justify-center">{icon}</div>
                    <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
                    {badge && <Badge tone="red">{badge}</Badge>}
                </div>
                {href && actionLabel && (
                    <Link href={href} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition">
                        {actionLabel}
                        <span className="w-7 h-7 rounded-lg bg-[#1a1a1c] text-white flex items-center justify-center">
                            <ArrowUpRight size={15} />
                        </span>
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
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
        </div>
    );
}

function MiniStat({ icon, label, value, sub, pct }: { icon: React.ReactNode; label: string; value: string; sub: string; pct?: number }) {
    return (
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
            <div className="flex items-center justify-between">
                <span className="text-slate-400">{icon}</span>
                {pct != null && <Badge tone="emerald">{pct}%</Badge>}
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">{label}</div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-slate-900 tabular-nums">{value}</span>
                <span className="text-xs text-slate-400">{sub}</span>
            </div>
        </div>
    );
}

function QuickCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
    const inner = (
        <>
            <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">{icon}</div>
                {href && <ArrowUpRight size={16} className="text-slate-300 group-hover:text-slate-500 transition" />}
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
        </>
    );
    const cls = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
    if (!href) return <div className={cls}>{inner}</div>;
    return (
        <Link href={href} className={`${cls} hover:border-slate-300 transition group`}>
            {inner}
        </Link>
    );
}

function AccessLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 px-3.5 py-3 text-sm font-medium text-slate-700 transition group">
            <span className="text-slate-500 group-hover:text-slate-900 transition">{icon}</span>
            {label}
        </Link>
    );
}

function Badge({ tone, children }: { tone: 'red' | 'amber' | 'emerald' | 'blue'; children: React.ReactNode }) {
    const tones = {
        red: 'bg-red-50 text-red-600 border-red-100',
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
    };
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${tones[tone]}`}>{children}</span>;
}
