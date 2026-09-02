'use client';

import React from 'react';

// Tooltip del estilo "Mono Charts" (Amicro) — adaptado para recibir un formatter de
// valor simple. Autocontenido (solo React). Se usa en MonoAreaChart / MonoBarChart.
interface MonoTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    isDark?: boolean;
    indicator?: 'dot' | 'line';
    formatter?: (value: any, name?: string) => React.ReactNode;
}

export function MonoTooltip({ active, payload, label, isDark = false, indicator = 'dot', formatter }: MonoTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div
            className={`px-3 py-2 rounded-xl text-xs shadow-2xl backdrop-blur-md border pointer-events-none font-sans z-50 ${isDark
                ? 'bg-[#181818]/90 border-white/10 text-white shadow-black/60'
                : 'bg-white/95 border-neutral-200 text-neutral-900 shadow-neutral-300/50'
                }`}
        >
            {label && (
                <div className={`font-medium mb-1.5 pb-1 border-b tracking-tight ${isDark ? 'border-white/10 text-neutral-300' : 'border-neutral-200 text-neutral-600'}`}>
                    {label}
                </div>
            )}
            <div className="flex flex-col gap-1">
                {payload.map((item, idx) => {
                    const color = item.color || item.fill || (isDark ? '#FFFFFF' : '#000000');
                    const value = formatter
                        ? formatter(item.value, item.name)
                        : typeof item.value === 'number' ? item.value.toLocaleString() : item.value;
                    return (
                        <div key={idx} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                <span
                                    className={indicator === 'line' ? 'w-2.5 h-0.5 rounded-full' : 'w-2 h-2 rounded-full ring-1 ring-white/20'}
                                    style={{ backgroundColor: color }}
                                />
                                <span className={`font-normal ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{item.name || item.dataKey}:</span>
                            </div>
                            <span className="font-semibold tabular-nums">{value}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Paleta "mono": tinta (blanco en dark / casi-negro en light) + acentos sutiles para
// diferenciar series semánticas (p. ej. entregas fallidas) sin romper el look monocromo.
export const MONO_INK = (isDark: boolean) => (isDark ? '#FAFAFA' : '#09090B');
const MONO_ACCENTS: Record<string, string> = { rose: '#F43F5E', emerald: '#10B981', amber: '#F59E0B', blue: '#3B82F6', violet: '#7C6BF5' };
export type MonoAccent = 'ink' | 'rose' | 'emerald' | 'amber' | 'blue' | 'violet';
export function monoColor(accent: MonoAccent | undefined, isDark: boolean): string {
    return accent && accent !== 'ink' ? MONO_ACCENTS[accent] : MONO_INK(isDark);
}
