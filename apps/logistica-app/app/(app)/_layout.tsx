import { Tabs } from 'expo-router';
import { LayoutDashboard, Map, Truck, Users, LayoutGrid } from 'lucide-react-native';
import { Theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { canAccessModule } from '../../constants/modules';

const C = Theme.colors;

export default function AppTabsLayout() {
  const { user } = useAuth();
  // href:null oculta la pestaña de la barra si el usuario no tiene el módulo.
  const gate = (key: string) => (canAccessModule(user, key) ? undefined : null);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textFaint,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Inicio', href: gate('dashboard'), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="operaciones" options={{ title: 'Operaciones', href: gate('operaciones'), tabBarIcon: ({ color, size }) => <Map color={color} size={size} /> }} />
      <Tabs.Screen name="vehiculos" options={{ title: 'Vehículos', href: gate('vehiculos'), tabBarIcon: ({ color, size }) => <Truck color={color} size={size} /> }} />
      <Tabs.Screen name="trabajadores" options={{ title: 'Trabajadores', href: gate('trabajadores'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />

      {/* Módulos accesibles desde "Más" — ocultos de la barra inferior */}
      <Tabs.Screen name="mantenimiento" options={{ href: null }} />
      <Tabs.Screen name="peajes" options={{ href: null }} />
      <Tabs.Screen name="combustible" options={{ href: null }} />
      <Tabs.Screen name="calendario" options={{ href: null }} />
      <Tabs.Screen name="reportes" options={{ href: null }} />
      <Tabs.Screen name="alertas" options={{ href: null }} />
      <Tabs.Screen name="flota" options={{ href: null }} />
      <Tabs.Screen name="dispositivos" options={{ href: null }} />
      <Tabs.Screen name="geocercas" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="usuarios" options={{ href: null }} />
      <Tabs.Screen name="roles" options={{ href: null }} />
    </Tabs>
  );
}
