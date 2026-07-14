import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { AuthProvider } from '../context/AuthContext';
import { Theme } from '../constants/theme';

const navTheme = {
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider value={navTheme}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="conductor" />
            </Stack>
            <StatusBar style="dark" />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
