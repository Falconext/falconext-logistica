// Cliente HTTP central de la app. Equivalente móvil de apps/web/lib/api.ts:
// axios con baseURL configurable e inyección automática del JWT guardado
// en AsyncStorage. Todas las pantallas importan este `api`.

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Env } from '../constants/Env';

export const AUTH_TOKEN_KEY = 'auth_token'; // JWT de usuario (login email/clave)
export const DEVICE_TOKEN_KEY = 'device_token'; // token de dispositivo (modo chofer)
export const USER_KEY = 'auth_user';

const api = axios.create({
  baseURL: Env.API_URL,
  timeout: 20000,
});

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

export default api;
