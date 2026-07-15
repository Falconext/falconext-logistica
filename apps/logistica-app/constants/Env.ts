export const Env = {
    // La URL de la API se define en el archivo .env (variable EXPO_PUBLIC_API_URL).
    // Backend desplegado en Vercel (Postgres en Neon) → URL pública estable.
    API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://falconext-logistica-api.vercel.app/api',

    // Token de Mapbox: se define en apps/logistica-app/.env (EXPO_PUBLIC_MAPBOX_TOKEN).
    // NO hardcodear el token aquí (GitHub bloquea el push por secret-scanning).
    MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
};
