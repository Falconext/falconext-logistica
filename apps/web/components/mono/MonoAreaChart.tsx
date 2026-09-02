'use client';

import { useId } from 'react';
import { useTheme } from 'next-themes';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MonoTooltip, monoColor, type MonoAccent } from './MonoTooltip';

export interface MonoSeries {
    key: string;                      // dataKey en cada fila de `data`
    label?: string;                   // nombre mostrado (leyenda/tooltip)
    accent?: MonoAccent;              // 'ink' (default) o un acento
    render?: 'area' | 'line';         // área rellena (default) o línea fina
}

interface MonoAreaChartProps {
    data: any[];
    index: string;                       // clave del eje X (p. ej. 'date')
    categories: MonoSeries[];            // una o varias series
    valueFormatter?: (n: any) => string;
    height?: number;
    curve?: 'monotone' | 'natural';
    xTickFormatter?: (v: any) => string;
    stacked?: boolean;                   // apila las series de área (composición del total)
}

// Área/línea monocroma con gradiente suave (estilo Mono premium), theme-aware.
// Soporta varias series; cada una área rellena o línea. Leyenda propia arriba.
export function MonoAreaChart({ data, index, categories, valueFormatter, height = 240, curve = 'monotone', xTickFormatter, stacked = false }: MonoAreaChartProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const uid = useId().replace(/:/g, '');
    const axis = isDark ? '#8A8A93' : '#9A9AA5';
    const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)';

    return (
        <div className="w-full">
            {/* Leyenda (identidad no depende solo del color) */}
            {categories.length > 1 && (
                <div className="flex items-center gap-4 mb-3 px-1">
                    {categories.map((c) => {
                        const col = monoColor(c.accent, isDark);
                        return (
                            <div key={c.key} className="flex items-center gap-1.5">
                                <span className="inline-block rounded-full" style={{ width: 9, height: c.render === 'line' ? 3 : 9, backgroundColor: col }} />
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{c.label || c.key}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            <ResponsiveContainer width="100%" height={height}>
                <ComposedChart data={data} margin={{ top: 10, right: 14, left: -14, bottom: 0 }}>
                    <defs>
                        {categories.map((c, i) => {
                            const col = monoColor(c.accent, isDark);
                            return (
                                <linearGradient key={c.key} id={`${uid}-a${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={col} stopOpacity={isDark ? 0.42 : 0.30} />
                                    <stop offset="72%" stopColor={col} stopOpacity={0.04} />
                                    <stop offset="100%" stopColor={col} stopOpacity={0} />
                                </linearGradient>
                            );
                        })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={grid} />
                    <XAxis dataKey={index} tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} tick={{ fontSize: 11, fill: axis, fontWeight: 500 }} tickFormatter={xTickFormatter} />
                    <YAxis tickLine={false} axisLine={false} width={34} tick={{ fontSize: 11, fill: axis }} />
                    <Tooltip cursor={{ stroke: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)', strokeWidth: 1 }} content={<MonoTooltip isDark={isDark} formatter={valueFormatter} />} />
                    {categories.map((c, i) => {
                        const col = monoColor(c.accent, isDark);
                        if (c.render === 'line') {
                            return (
                                <Line key={c.key} type={curve} dataKey={c.key} name={c.label || c.key} stroke={col} strokeWidth={2}
                                    dot={false} activeDot={{ r: 4, fill: col, stroke: isDark ? '#0B0B0C' : '#fff', strokeWidth: 2 }} />
                            );
                        }
                        return (
                            <Area key={c.key} type={curve} dataKey={c.key} name={c.label || c.key} stroke={col} strokeWidth={2.25}
                                stackId={stacked ? 'mono' : undefined}
                                fill={stacked ? col : `url(#${uid}-a${i})`}
                                fillOpacity={stacked ? (isDark ? 0.55 : 0.85) : 1}
                                dot={false}
                                activeDot={{ r: 4, fill: col, stroke: isDark ? '#0B0B0C' : '#fff', strokeWidth: 2 }} />
                        );
                    })}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
