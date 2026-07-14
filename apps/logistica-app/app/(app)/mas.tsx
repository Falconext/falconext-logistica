import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Wrench,
  CalendarDays,
  BarChart3,
  Bell,
  ShieldCheck,
  Map,
  Briefcase,
  LogOut,
  ChevronRight,
  Receipt,
  Fuel,
  Radio,
  LucideIcon,
} from 'lucide-react-native';
import { Screen, AppHeader, Card, Theme } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { canAccessModule, isAdmin as isAdminUser } from '../../constants/modules';

const C = Theme.colors;
const S = Theme.spacing;

interface Item {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  color: string;
  adminOnly?: boolean;
}

const items: Item[] = [
  { key: 'mantenimiento', label: 'Mantenimiento', desc: 'Servicios y reparaciones', href: '/(app)/mantenimiento', icon: Wrench, color: '#0EA5E9' },
  { key: 'peajes', label: 'Peajes / Multas', desc: 'Peajes y multas de la flota', href: '/(app)/peajes', icon: Receipt, color: '#EA580C' },
  { key: 'combustible', label: 'Combustible', desc: 'Cargas de combustible', href: '/(app)/combustible', icon: Fuel, color: '#0D9488' },
  { key: 'calendario', label: 'Calendario', desc: 'Vista de programación', href: '/(app)/calendario', icon: CalendarDays, color: '#8B5CF6' },
  { key: 'reportes', label: 'Reportes', desc: 'Indicadores y KPIs', href: '/(app)/reportes', icon: BarChart3, color: '#F59E0B' },
  { key: 'flota', label: 'Flota en Vivo', desc: 'Choferes en el mapa', href: '/(app)/flota', icon: Radio, color: '#2563EB' },
  { key: 'alertas', label: 'Alertas', desc: 'Vencimientos de documentos', href: '/(app)/alertas', icon: Bell, color: '#DC2626' },
  { key: 'dispositivos', label: 'Dispositivos GPS', desc: 'Rastreadores de flota', href: '/(app)/dispositivos', icon: ShieldCheck, color: '#16A34A' },
  { key: 'geocercas', label: 'Geocercas', desc: 'Zonas y eventos', href: '/(app)/geocercas', icon: Map, color: '#0891B2' },
  { key: 'admin', label: 'Admin Empresas', desc: 'Tenants e integraciones', href: '/(app)/admin', icon: Briefcase, color: '#64748B', adminOnly: true },
];

export default function MasScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = isAdminUser(user);

  const confirmLogout = () => {
    Alert.alert('Cerrar sesión', '¿Deseas salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout() },
    ]);
  };

  // Solo módulos permitidos por el rol; admin además ve la sección de empresas.
  const visible = items.filter((i) => (i.adminOnly ? isAdmin : canAccessModule(user, i.key)));

  return (
    <Screen scroll padded>
      <AppHeader title="Más" subtitle="Módulos y ajustes" />

      {/* Perfil */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.md }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.email?.[0] || 'U').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.email?.split('@')[0] || 'Usuario'}</Text>
          <Text style={styles.role}>{user?.rol_nombre || (user?.role ? user.role.toLowerCase() : 'usuario')}</Text>
        </View>
        <TouchableOpacity onPress={confirmLogout} style={styles.logoutBtn} hitSlop={8}>
          <LogOut size={18} color={C.danger} />
        </TouchableOpacity>
      </Card>

      <View style={{ height: S.lg }} />

      {visible.map((item) => (
        <TouchableOpacity
          key={item.href}
          activeOpacity={0.7}
          onPress={() => router.push(item.href as any)}
          style={styles.row}
        >
          <View style={[styles.rowIcon, { backgroundColor: item.color + '1A' }]}>
            <item.icon size={20} color={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowDesc}>{item.desc}</Text>
          </View>
          <ChevronRight size={20} color={C.textFaint} />
        </TouchableOpacity>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  role: { fontSize: 13, color: C.textMuted, textTransform: 'capitalize' },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  rowDesc: { fontSize: 13, color: C.textMuted, marginTop: 1 },
});
