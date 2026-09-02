'use client';

import { useTheme } from 'next-themes';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { MonoTooltip } from './MonoTooltip';

interface Slice { name: string; value: number }
interface MonoDonutChartProps {
    data: Slice[];
    valueFormatter?: (n: any) => string;
    height?: number;
    centerLabel?: string;   // texto pequeño bajo el total (p. ej. "Total")
}

// Paleta categórica en orden fijo (identidad, no rango) — se refuerza con leyenda
// al lado, así la identidad nunca depende solo del color.
const PALETTE = ['#7C6BF5', '#3B82F6', '#10B981', '#F59E0B', '#F43F5E', '#06B6D4', '#94A3B8'];

// Donut monocromo-premium: aro con esquinas redondeadas + total al centro + leyenda
// con valor y porcentaje. Theme-aware.
export function MonoDonutChart({ data, valueFormatter, height = 208, centerLabel }: MonoDonutChartProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const rows = (data || []).filter((d) => (Number(d.value) || 0) > 0);
    const total = rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
    const fmt = valueFormatter || ((n: any) => `${n}`);

    if (rows.length === 0) {
        return <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>Sin datos.</div>;
    }

    return (
        <div className="flex items-center gap-4 sm:gap-6">
            <div className="relative shrink-0" style={{ width: height, height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%"
                            innerRadius="66%" outerRadius="100%" paddingAngle={2} cornerRadius={5}
                            stroke={isDark ? '#0B0B0C' : '#fff'} strokeWidth={2} isAnimationActive animationDuration={650}>
                            {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip content={<MonoTooltip isDark={isDark} formatter={fmt} />} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Total al centro */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white leading-none">{fmt(total)}</span>
                    {centerLabel && <span className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{centerLabel}</span>}
                </div>
            </div>
            {/* Leyenda con valor + % */}
            <div className="flex-1 min-w-0 space-y-2">
                {rows.slice(0, 6).map((r, i) => {
                    const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
                    return (
                        <div key={r.name + i} className="flex items-center gap-2 text-sm">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                            <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300">{r.name}</span>
                            <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{fmt(r.value)}</span>
                            <span className="tabular-nums text-xs text-slate-400 w-9 text-right">{pct}%</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
