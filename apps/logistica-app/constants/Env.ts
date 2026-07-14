export const Env = {
    // La URL de la API se define en el archivo .env (variable EXPO_PUBLIC_API_URL).
    // - Desarrollo local: el celular debe estar en la MISMA red WiFi que la PC.
    //   Usa la IP LAN de tu PC + puerto 3005, p.ej. http://192.168.18.114:3005/api
    // - Acceso remoto (chofer en la calle): usa un túnel ngrok apuntando al puerto 3005
    //   y actualiza EXPO_PUBLIC_API_URL con la URL pública.
    API_URL: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.18.114:3005/api',
};
