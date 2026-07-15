import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import api, { AUTH_TOKEN_KEY, DEVICE_TOKEN_KEY, USER_KEY } from '../services/api';
import { Env } from '../constants/Env';
import { stopTracking } from '../services/LocationService';
import type { User } from '../types';

type AuthMode = 'user' | null;

interface AuthContextType {
  // Sesión única de usuario (email + clave, JWT). Todos entran así, incluidos
  // los choferes: el rastreo es ahora un módulo interno (ver app/(app)/rastreo).
  user: User | null;
  token: string | null;
  mode: AuthMode;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  mode: null,
  isAuthenticated: false,
  isLoading: true,
  loginUser: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restaura la sesión guardada al abrir la app.
  useEffect(() => {
    (async () => {
      try {
        const [jwt, userStr] = await Promise.all([
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (jwt) setToken(jwt);
        if (userStr) setUser(JSON.parse(userStr));
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

  const logout = useCallback(async () => {
    // Detener el rastreo en segundo plano y limpiar el token de dispositivo
    // antes de cerrar la sesión (evita que siga reportando con otra cuenta).
    try { await stopTracking(); } catch { /* noop */ }
    await Promise.all([
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(DEVICE_TOKEN_KEY),
    ]);
    setToken(null);
    setUser(null);
    router.replace('/');
  }, [router]);

  const mode: AuthMode = token ? 'user' : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        mode,
        isAuthenticated: !!token,
        isLoading,
        loginUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { Env };
