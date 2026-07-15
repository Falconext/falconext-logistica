import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import 'react-native-reanimated';
import { AuthProvider } from '../context/AuthContext';
import { ThemeModeProvider, useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';

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

function ThemedStack() {
  const { themeKey, isDark, ready } = useTheme();
  if (!ready) return null;
  return (
    // key={themeKey} remonta el árbol al cambiar de tema para que todas las
    // pantallas relean Theme.colors (paleta ya reescrita in-place).
    <ThemeProvider key={themeKey} value={buildNavTheme()}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="conductor" />
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
