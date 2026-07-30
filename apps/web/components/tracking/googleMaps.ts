'use client';

import { useJsApiLoader, Libraries } from '@react-google-maps/api';

// Clave pública de Google Maps (Maps JavaScript API + Geocoding + Directions).
// Definida en apps/web/.env.local como NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Referencia ESTABLE (module-level) para que useJsApiLoader no recargue el script.
// 'geometry' → cálculos esféricos; 'marker' no se usa (marcadores clásicos).
export const GOOGLE_MAPS_LIBRARIES: Libraries = ['geometry'];

// Hook único de carga del script. Todos los mapas lo usan con el MISMO id y
// libraries para compartir una sola carga del SDK en toda la app.
export function useGoogleMaps() {
    return useJsApiLoader({
        id: 'gmaps-script',
        googleMapsApiKey: GOOGLE_MAPS_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES,
    });
}
