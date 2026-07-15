'use client';

import React from 'react';
import type mapboxgl from 'mapbox-gl';

// Estilo base "Standard" de Mapbox. Con el tema "faded" queda colorido pero suave,
// parecido a Google Maps. Soporta presets de luz (día/noche) sin recargar el estilo.
export const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

export type MapPreset = 'day' | 'night';

// Aplica el tema "faded" + el preset de luz. Debe llamarse cuando el estilo ya cargó
// (p.ej. dentro de map.on('style.load', ...)). El try/catch evita errores si aún no está listo.
export function applyFadedTheme(map: mapboxgl.Map, preset: MapPreset) {
    try {
        // @ts-ignore - setConfigProperty existe en mapbox-gl v3 (Standard style)
        map.setConfigProperty('basemap', 'theme', 'faded');
        // @ts-ignore
        map.setConfigProperty('basemap', 'lightPreset', preset);
    } catch {
        /* el estilo todavía no está listo */
    }
}

// Toggle Día / Noche reutilizable, con el mismo look en toda la app.
export function MapThemeToggle({ preset, onChange, className = '' }: {
    preset: MapPreset;
    onChange: (p: MapPreset) => void;
    className?: string;
}) {
    const btn = (p: MapPreset, label: string) => (
        <button
            type="button"
            onClick={() => onChange(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${preset === p ? 'bg-[#FFC933] text-[#1a1a1c]' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
        >
            {label}
        </button>
    );
    return (
        <div className={`z-10 flex items-center bg-white/95 dark:bg-[#0f1522]/95 backdrop-blur rounded-xl shadow-md border border-slate-200 dark:border-[#202a40] p-1 ${className}`}>
            {btn('day', 'Día')}
            {btn('night', 'Noche')}
        </div>
    );
}
