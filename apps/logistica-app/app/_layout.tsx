import { useEffect } from 'react';
import { AppState } from 'react-native';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { AuthProvider } from '../context/AuthContext';
import { ThemeModeProvider, useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
// Importar el servicio DEFINE la tarea de fondo en el arranque (necesario para
// que el SO pueda relanzar la app y seguir rastreando aunque se haya cerrado).
import { resumeTrackingIfNeeded } from '../services/LocationService';
import { subscribePush, getInitialPushData, type PushData } from '../services/PushService';
import { markActivity } from '../hooks/useLivePolling';

function buildNavTheme() {
  return {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: Theme.colors.background,
      primary: Theme.colors.primary,
      card: Theme.colors.surface,
      text: Theme.colors.text,
      border: Theme.colors.border,
    },
  };
}

// Al tocar un push "consegna asignada", el chofer aterriza en Mi Ruta (donde
// acepta la consegna); desde cualquier otro push, en Operaciones con la
// operación abierta. Se usa desde el árbol de navegación (necesita el router).
function usePushNavigation() {
  const router = useRouter();
  useEffect(() => {
    const go = (data: PushData) => {
      if (!data) return;
      if (data.tipo === 'consegna_asignada') {
        router.push('/(app)/mi-ruta' as any);
      } else if (data.programacion_id) {
        router.push({ pathname: '/(app)/operaciones', params: { op: String(data.programacion_id) } } as any);
      }
    };
    // Abierta DESDE la notificación (app estaba cerrada).
    getInitialPushData().then((d) => { if (d) go(d); });
    // Tocada con la app en background o abierta.
    return subscribePush({ onTap: go });
  }, [router]);
}

function ThemedStack() {
  const { themeKey, isDark, ready } = useTheme();
  usePushNavigation();
  if (!ready) return null;
  return (
    // key={themeKey} remonta el árbol al cambiar de tema para que todas las
    // pantallas relean Theme.colors (paleta ya reescrita in-place).
    <ThemeProvider key={themeKey} value={buildNavTheme()}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Fuentes de marca (paquetes locales, carga rápida). Se renderiza igual si
  // aún no cargan (fallback a la fuente del sistema).
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // Vigilante del rastreo: reanuda el servicio si el chofer lo tenía activo, al
  // abrir la app y cada vez que vuelve a primer plano. Así, si el SO lo mató o
  // el teléfono se reinició, se vuelve a encender solo en cuanto se abre la app.
  useEffect(() => {
    resumeTrackingIfNeeded();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resumeTrackingIfNeeded();
    });
    return () => sub.remove();
  }, []);

  return (
    // onTouchStart en la raíz: cualquier toque marca "usuario activo" para la
    // guardia de inactividad del polling (ver hooks/useLivePolling). No captura
    // el evento, solo lo observa.
    <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={markActivity}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeModeProvider>
            <ThemedStack />
          </ThemeModeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
