export const Env = {
    // La URL de la API se define en el archivo .env (variable EXPO_PUBLIC_API_URL).
    // Backend desplegado en Vercel (Postgres en Neon) → URL pública estable.
    API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://falconext-logistica-api.vercel.app/api',

    // Clave de Google Maps (Maps JavaScript API + Geocoding + Directions) para los
    // mapas del WebView. Se define en apps/logistica-app/.env (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).
    // NO hardcodear la clave aquí.
    GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
};
