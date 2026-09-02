'use client';

import { useId } from 'react';
import { useTheme } from 'next-themes';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';
import { MonoTooltip, monoColor, type MonoAccent } from './MonoTooltip';
import type { MonoSeries } from './MonoAreaChart';

interface MonoBarChartProps {
    data: any[];
    index: string;                       // clave de categoría (p. ej. 'name')
    categories: MonoSeries[];            // por ahora una serie (magnitud)
    valueFormatter?: (n: any) => string;
    height?: number;
    horizontal?: boolean;                // barras horizontales (leaderboard)
    accent?: MonoAccent;                 // acento de la serie
    showValues?: boolean;                // etiqueta de valor al final de la barra
    highlightTop?: boolean;              // resalta la 1ª barra (más alta)
}

// Barras redondeadas con gradiente (estilo Mono premium): magnitud por una sola serie,
// value labels selectivos, theme-aware. Vertical (flota) u horizontal (leaderboard).
export function MonoBarChart({
    data, index, categories, valueFormatter, height = 220, horizontal = false, accent, showValues = true, highlightTop = false,
}: MonoBarChartProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const uid = useId().replace(/:/g, '');
    const axis = isDark ? '#8A8A93' : '#9A9AA5';
    const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)';
    const labelInk = isDark ? '#E5E5EA' : '#3F3F46';
    const serie = categories[0];
    const base = monoColor(accent ?? serie?.accent, isDark);
    const gid = `${uid}-barfill`;
    const gidTop = `${uid}-barfill-top`;

    return (
        <div className="w-full">
            <ResponsiveContainer width="100%" height={height}>
                <BarChart
                    data={data}
                    layout={horizontal ? 'vertical' : 'horizontal'}
                    margin={{ top: 14, right: horizontal ? 64 : 14, left: horizontal ? 6 : -14, bottom: 4 }}
                    barCategoryGap={horizontal ? '26%' : '32%'}
                >
                    <defs>
                        {/* Gradiente de profundidad: el acento fuerte hacia el extremo del dato. */}
                        <linearGradient id={gid} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
                            <stop offset="0%" stopColor={base} stopOpacity={horizontal ? 0.55 : 1} />
                            <stop offset="100%" stopColor={base} stopOpacity={horizontal ? 1 : 0.55} />
                        </linearGradient>
                        <linearGradient id={gidTop} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
                            <stop offset="0%" stopColor={base} stopOpacity={0.85} />
                            <stop offset="100%" stopColor={base} stopOpacity={1} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" horizontal={!horizontal} vertical={horizontal} stroke={grid} />
                    <XAxis
                        {...(horizontal
                            ? { type: 'number' as const, hide: true }
                            : { dataKey: index, type: 'category' as const, interval: 0, tickLine: false, axisLine: false, tickMargin: 10, tick: { fontSize: 11, fill: axis, fontWeight: 500 } })}
                    />
                    <YAxis
                        {...(horizontal
                            ? { dataKey: index, type: 'category' as const, width: 116, tickLine: false, axisLine: false, tickMargin: 8, tick: { fontSize: 11, fill: axis, fontWeight: 500 } }
                            : { type: 'number' as const, width: 34, tickLine: false, axisLine: false, tick: { fontSize: 11, fill: axis } })}
                    />
                    <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.035)' }} content={<MonoTooltip isDark={isDark} formatter={valueFormatter} />} />
                    <Bar
                        dataKey={serie.key}
                        name={serie.label || serie.key}
                        radius={horizontal ? [10, 10, 10, 10] : [10, 10, 4, 4]}
                        maxBarSize={horizontal ? 20 : 52}
                        isAnimationActive
                        animationDuration={650}
                    >
                        {data.map((_, i) => (
                            <Cell key={i} fill={`url(#${highlightTop && i === 0 ? gidTop : gid})`} />
                        ))}
                        {showValues && (
                            <LabelList
                                dataKey={serie.key}
                                position={horizontal ? 'right' : 'top'}
                                offset={horizontal ? 8 : 6}
                                formatter={(v: any) => (valueFormatter ? valueFormatter(v) : `${v}`)}
                                style={{ fill: labelInk, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                            />
                        )}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
