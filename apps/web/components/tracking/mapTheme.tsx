'use client';

import React from 'react';

export type MapPreset = 'day' | 'night';

// Estilos Google Maps por preset de luz. "day" = look suave/limpio (POIs atenuados,
// parecido al 'faded' anterior); "night" = modo oscuro clásico de Google.
export const DAY_STYLE: google.maps.MapTypeStyle[] = [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c7dcf0' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
];

export const NIGHT_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#1d2331' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1d2331' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ea0bf' }] },
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3244' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4256' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1522' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#232a3a' }] },
];

// Devuelve el array de estilos para el preset. Aplícalo con
// map.setOptions({ styles: stylesFor(preset) }).
export function stylesFor(preset: MapPreset): google.maps.MapTypeStyle[] {
    return preset === 'night' ? NIGHT_STYLE : DAY_STYLE;
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
