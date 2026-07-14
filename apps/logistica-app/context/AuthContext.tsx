import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import api, { AUTH_TOKEN_KEY, DEVICE_TOKEN_KEY, USER_KEY } from '../services/api';
import { Env } from '../constants/Env';
import type { User } from '../types';

type AuthMode = 'user' | 'device' | null;

interface AuthContextType {
  // Sesión de usuario (admin/supervisor, login email+clave, JWT)
  user: User | null;
  token: string | null;
  // Sesión de dispositivo (modo chofer, token GPS)
  deviceToken: string | null;
  mode: AuthMode;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<void>;
  loginDevice: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  deviceToken: null,
  mode: null,
  isAuthenticated: false,
  isLoading: true,
  loginUser: async () => {},
  loginDevice: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restaura la sesión guardada al abrir la app.
  useEffect(() => {
    (async () => {
      try {
        const [jwt, userStr, dev] = await Promise.all([
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(DEVICE_TOKEN_KEY),
        ]);
        if (jwt) setToken(jwt);
        if (userStr) setUser(JSON.parse(userStr));
        if (dev) setDeviceToken(dev);
      } catch (e) {
        console.error('No se pudo restaurar la sesión', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const loginUser = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { access_token, user: u } = res.data;
    if (!access_token) throw new Error('Respuesta de login inválida');
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, access_token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u ?? {}));
    setToken(access_token);
    setUser(u ?? null);
    router.replace('/(app)/dashboard' as any);
  }, [router]);

  const loginDevice = useCallback(async (deviceTok: string) => {
    const ok = await verifyDeviceToken(deviceTok);
    if (!ok) throw new Error('Token inválido. Verifique e intente nuevamente.');
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, deviceTok);
    setDeviceToken(deviceTok);
    router.replace('/conductor' as any);
  }, [router]);

  const logout = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(DEVICE_TOKEN_KEY),
    ]);
    setToken(null);
    setUser(null);
    setDeviceToken(null);
    router.replace('/');
  }, [router]);

  const mode: AuthMode = token ? 'user' : deviceToken ? 'device' : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        deviceToken,
        mode,
        isAuthenticated: !!token,
        isLoading,
        loginUser,
        loginDevice,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Valida el token de dispositivo contra el backend (modo chofer).
async function verifyDeviceToken(deviceTok: string): Promise<boolean> {
  try {
    const res = await api.get(`/gps/verify/${deviceTok}`);
    return !!(res.data && (res.data.valid ?? res.data.ok ?? true));
  } catch {
    return false;
  }
}

export { Env };
