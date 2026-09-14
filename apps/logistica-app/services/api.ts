// Cliente HTTP central de la app. Equivalente móvil de apps/web/lib/api.ts:
// axios con baseURL configurable e inyección automática del JWT guardado
// en AsyncStorage. Todas las pantallas importan este `api`.

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Env } from '../constants/Env';

export const AUTH_TOKEN_KEY = 'auth_token'; // JWT de usuario (login email/clave)
export const DEVICE_TOKEN_KEY = 'device_token'; // token de dispositivo (modo chofer)
export const USER_KEY = 'auth_user';

const api = axios.create({
  baseURL: Env.API_URL,
  timeout: 20000,
});

// AuthContext se registra aquí al montar para poder limpiar SU estado en memoria
// (token/user) cuando el interceptor de abajo detecta una sesión vencida — evita
// que la app "vuelva" a pantallas protegidas creyendo que sigue autenticada.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

// Inyecta el JWT en cada petición si existe.
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Sin token: la petición sale sin Authorization.
  }
  return config;
});

// El JWT expira a las 24h (ver apps/api auth.module.ts). Sin este interceptor el
// token vencido se queda guardado y CADA petición (incluyendo crear/guardar una
// operación) falla en silencio con 401 — el chofer solo ve "No se pudo guardar"
// sin saber que tiene que volver a iniciar sesión. Equivalente móvil del
// interceptor de apps/web/lib/api.ts.
let sesionVencidaMostrada = false;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        // Sin AuthContext montado todavía (arranque en frío): limpia el storage
        // directo para no dejar un token muerto que siga fallando en el próximo intento.
        await Promise.all([
          AsyncStorage.removeItem(AUTH_TOKEN_KEY),
          AsyncStorage.removeItem(USER_KEY),
          AsyncStorage.removeItem(DEVICE_TOKEN_KEY),
        ]);
        router.replace('/');
      }
      if (!sesionVencidaMostrada) {
        sesionVencidaMostrada = true;
        Alert.alert('Sesión vencida', 'Vuelve a iniciar sesión para continuar.', [
          { text: 'OK', onPress: () => { sesionVencidaMostrada = false; } },
        ]);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
