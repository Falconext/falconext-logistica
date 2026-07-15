import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setThemeMode, ThemeMode } from '../constants/theme';

const KEY = 'theme_mode';

interface ThemeCtx {
  mode: ThemeMode;
  isDark: boolean;
  toggle: () => void;
  themeKey: number; // cambia al alternar tema -> fuerza remount del árbol
  ready: boolean;
}

const ThemeContext = createContext<ThemeCtx>({
  mode: 'light',
  isDark: false,
  toggle: () => {},
  themeKey: 0,
  ready: false,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [themeKey, setThemeKey] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(KEY)) as ThemeMode | null;
        const m: ThemeMode = saved === 'dark' ? 'dark' : 'light';
        setThemeMode(m);
        setMode(m);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      setThemeMode(next);
      AsyncStorage.setItem(KEY, next).catch(() => {});
      setThemeKey((k) => k + 1);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, isDark: mode === 'dark', toggle, themeKey, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}
