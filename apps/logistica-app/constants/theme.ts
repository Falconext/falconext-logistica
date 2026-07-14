/**
 * Design system de la app de logística.
 * Mantiene `Colors` y `Fonts` (usados por hooks existentes) y añade el
 * objeto `Theme` con tokens de marca, espaciado, radios, tipografía y
 * colores semánticos que usan todas las pantallas.
 */

import { Platform } from 'react-native';

// ---- Paleta de marca ----------------------------------------------------
const brand = {
  primary: '#2563EB', // azul acción (coincide con la web)
  primaryDark: '#1D4ED8',
  primarySoft: '#EFF6FF',
  accent: '#F59E0B', // dorado, para resaltar / premium
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

export const Theme = {
  colors: {
    ...brand,
    ...status,

    // Superficies (tema claro, look SaaS empresarial)
    background: '#F6F8FB',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFC',
    border: '#E5E9F0',
    borderStrong: '#CBD5E1',

    // Texto
    text: '#0F172A',
    textMuted: '#64748B',
    textFaint: '#94A3B8',
    textOnPrimary: '#FFFFFF',

    // Navegación / sidebar oscuro (para headers/tab de marca)
    dark: '#111827',
    darkSurface: '#1F2937',
    overlay: 'rgba(15,23,42,0.45)',
  },

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
