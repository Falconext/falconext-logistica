import { Tabs } from 'expo-router';
import { LayoutDashboard, Map, Truck, Users, LayoutGrid, Navigation, CircleUser, UserCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { canAccessModule, isChofer } from '../../constants/modules';

const C = Theme.colors;

export default function AppTabsLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const chofer = isChofer(user);
  // href:null oculta la pestaña de la barra si el usuario no tiene el módulo.
  const gate = (key: string) => (canAccessModule(user, key) ? undefined : null);

  // En Android (edge-to-edge) la barra del sistema tapa los tabs si no
  // sumamos el inset inferior. Mínimo 8 para que respire en iOS sin notch.
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textFaint,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          height: 58 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {/* Modo chofer: Inicio personal (Mi Resumen), Mi Ruta y Mi Perfil en la barra */}
      <Tabs.Screen name="mi-resumen" options={{ title: 'Inicio', href: chofer ? undefined : null, tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Inicio', href: gate('dashboard'), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="operaciones" options={{ title: chofer ? 'Consegnas' : 'Operaciones', href: gate('operaciones'), tabBarIcon: ({ color, size }) => <Map color={color} size={size} /> }} />
      {/* Mis consegnas: entregas del propio supervisor (metas). Misma pantalla de
          Operaciones abierta con ?mias=1. Oculta para el chofer (tiene Mi Resumen). */}
      <Tabs.Screen name="mis-consegnas" initialParams={{ mias: '1' }} options={{ title: 'Mis consegnas', href: chofer ? null : gate('operaciones'), tabBarIcon: ({ color, size }) => <UserCheck color={color} size={size} /> }} />
      <Tabs.Screen name="mi-ruta" options={{ title: 'Mi Ruta', href: chofer ? undefined : null, tabBarIcon: ({ color, size }) => <Navigation color={color} size={size} /> }} />
      <Tabs.Screen name="mi-perfil" options={{ title: 'Mi Perfil', href: chofer ? undefined : null, tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} /> }} />
      <Tabs.Screen name="parte-diario" options={{ href: null }} />
      <Tabs.Screen name="vehiculos" options={{ title: 'Vehículos', href: gate('vehiculos'), tabBarIcon: ({ color, size }) => <Truck color={color} size={size} /> }} />
      <Tabs.Screen name="trabajadores" options={{ title: 'Trabajadores', href: gate('trabajadores'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />

      {/* Módulos accesibles desde "Más" — ocultos de la barra inferior */}
      <Tabs.Screen name="panel" options={{ href: null }} />
      <Tabs.Screen name="recorridos" options={{ href: null }} />
      <Tabs.Screen name="mantenimiento" options={{ href: null }} />
      <Tabs.Screen name="peajes" options={{ href: null }} />
      <Tabs.Screen name="combustible" options={{ href: null }} />
      <Tabs.Screen name="calendario" options={{ href: null }} />
      <Tabs.Screen name="reportes" options={{ href: null }} />
      <Tabs.Screen name="alertas" options={{ href: null }} />
      <Tabs.Screen name="flota" options={{ href: null }} />
      <Tabs.Screen name="rastreo" options={{ href: null }} />
      <Tabs.Screen name="dispositivos" options={{ href: null }} />
      <Tabs.Screen name="historial" options={{ href: null }} />
      <Tabs.Screen name="geocercas" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="usuarios" options={{ href: null }} />
      <Tabs.Screen name="roles" options={{ href: null }} />
    </Tabs>
  );
}
