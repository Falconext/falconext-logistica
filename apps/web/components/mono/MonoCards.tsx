'use client';

import React from 'react';

// Piezas de presentación premium compartidas por el dashboard de Reportes y el
// Reporte de Costos: tarjeta KPI y tarjeta contenedora de chart (header con métrica
// destacada + badge). Un solo lugar → look consistente en toda la página.

export const TONE: Record<string, { tile: string; badge: string }> = {
    blue: { tile: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400', badge: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400' },
    emerald: { tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', badge: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
    violet: { tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400', badge: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400' },
    amber: { tile: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', badge: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' },
    rose: { tile: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', badge: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400' },
    slate: { tile: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300', badge: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-300' },
};

export function KpiCard({ icon: Icon, tone, label, value, sub }: { icon: any; tone: string; label: string; value: string; sub?: string }) {
    const c = TONE[tone] || TONE.blue;
    return (
        <div className="group h-full rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-300">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.tile}`}>
                <Icon size={20} />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
            {sub && <p className="mt-1.5 text-xs text-slate-400 truncate capitalize">{sub}</p>}
        </div>
    );
}

export function ChartCard({
    title, subtitle, highlight, badge, badgeTone = 'blue', icon: Icon, children, className = '',
}: { title: string; subtitle?: string; highlight?: string; badge?: string; badgeTone?: string; icon?: any; children: React.ReactNode; className?: string }) {
    const c = TONE[badgeTone] || TONE.blue;
    return (
        <div className={`h-full rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
            <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {Icon && <Icon size={16} className="text-slate-400 shrink-0" />}
                        <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{title}</h2>
                    </div>
                    {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
                </div>
                {(highlight || badge) && (
                    <div className="text-right shrink-0">
                        {highlight && <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">{highlight}</p>}
                        {badge && (
                            <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold max-w-[180px] truncate ${c.badge}`}>
                                {badge}
                            </span>
                        )}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}
