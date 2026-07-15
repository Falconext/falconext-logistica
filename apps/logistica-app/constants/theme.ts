/**
 * Design system de la app de logística.
 * Mantiene `Colors` y `Fonts` (usados por hooks existentes) y añade el
 * objeto `Theme` con tokens de marca, espaciado, radios, tipografía y
 * colores semánticos que usan todas las pantallas.
 */

import { Platform } from 'react-native';

// ---- Paleta de marca (misma que la web: acción oscura + acento amarillo) ----
const brand = {
  primary: '#1a1a1c', // acción principal (botones oscuros, como la web)
  primaryDark: '#000000',
  primarySoft: '#F1F5F9', // fondo suave neutro
  accent: '#FFC933', // acento amarillo de marca (activos, resaltados)
  accentSoft: '#FEF3C7',
};

// Colores semánticos de estado (badges, alertas, KPIs)
const status = {
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  neutral: '#64748B',
  neutralSoft: '#F1F5F9',
};

// Paleta CLARA (por defecto).
const lightColors = {
  ...brand,
  ...status,
  background: '#F6F8FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E5E9F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  dark: '#111827',
  darkSurface: '#1F2937',
  overlay: 'rgba(15,23,42,0.45)',
};

// Paleta OSCURA (misma referencia visual que el tema oscuro de la web).
const darkColors = {
  ...lightColors,
  primary: '#FFC933', // en oscuro, la acción resalta en amarillo
  textOnPrimary: '#1a1a1c',
  primarySoft: '#1a2438',
  accentSoft: '#2a2410',
  successSoft: '#0f2a1c',
  warningSoft: '#2a220f',
  dangerSoft: '#2a1416',
  infoSoft: '#0f2033',
  neutralSoft: '#141d2e',
  background: '#080b14',
  surface: '#0f1522',
  surfaceAlt: '#141d2e',
  border: '#202a40',
  borderStrong: '#2a3550',
  text: '#e7ecf6',
  textMuted: '#7c89a6',
  textFaint: '#66728f',
  dark: '#e7ecf6',
  darkSurface: '#141d2e',
  overlay: 'rgba(0,0,0,0.6)',
};

export const Theme = {
  // colors es MUTABLE: setThemeMode() reescribe sus valores in-place, y el
  // árbol se remonta (ThemeContext) para que todas las pantallas lean el nuevo tema.
  colors: { ...lightColors },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
  },

  font: {
    // Familias de marca (cargadas en app/_layout). Usar en títulos con
    // fontFamily: Theme.font.family.displayBold, etc.
    family: {
      display: 'SpaceGrotesk_600SemiBold',
      displayBold: 'SpaceGrotesk_700Bold',
      body: 'Inter_400Regular',
      bodyMedium: 'Inter_500Medium',
      bodySemibold: 'Inter_600SemiBold',
      bodyBold: 'Inter_700Bold',
    },
    size: {
      xs: 11,
      sm: 13,
      md: 15,
      lg: 17,
      xl: 20,
      xxl: 26,
      display: 32,
    },
    weight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },

  shadow: {
    card: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    floating: {
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
  },
};

export type AppTheme = typeof Theme;
export type ThemeMode = 'light' | 'dark';

// Reescribe Theme.colors in-place con la paleta del modo. El ThemeContext
// llama a esto y luego remonta el árbol para que todo tome el nuevo tema.
export function setThemeMode(mode: ThemeMode) {
  Object.assign(Theme.colors, mode === 'dark' ? darkColors : lightColors);
}

// -------------------------------------------------------------------------
// Compatibilidad con los hooks/plantilla existentes de Expo
// -------------------------------------------------------------------------
const tintColorLight = brand.primary;
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
