import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Users,
  Truck,
  Wrench,
  Map,
  Bell,
  Package,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  ChevronRight,
  ArrowUpRight,
  Fuel,
  Receipt,
  Coins,
} from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  Card,
  StatCard,
  Badge,
  LoadingState,
  SectionTitle,
  Theme,
} from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';

const C = Theme.colors;
const S = Theme.spacing;
const F = Theme.font;
const R = Theme.radius;

// Contrato de /dashboard/stats (ver apps/web/app/page.tsx)
interface DashboardStats {
  workers: { active: number; total: number; percentage: number };
  vehicles: { active: number; total: number; percentage: number };
  routes: { today: number; thisMonth: number };
  deliveries: { completed: number; pending: number; cancelled: number; successRate: number };
  clients: { active: number };
  maintenance: { thisMonth: number };
  alerts: { pending: number };
  costs?: {
    fuel: number;
    tolls: number;
    maintenance: number;
    total: number;
    prevTotal: number;
    changePct: number | null;
    income: number;
    margin: number;
  };
}

// Contrato de /dashboard/alerts (ver apps/web/app/page.tsx)
interface DashboardAlert {
  id: string;
  status?: string; // VIGENTE | POR_VENCER | VENCIDO
  type?: string; // VEHICULO | TRABAJADOR | ...
  entity?: string;
  docName?: string;
  daysRemaining?: number;
}

const ACCESOS: { label: string; icon: any; route: string; color: string }[] = [
  { label: 'Personal', icon: Users, route: '/(app)/trabajadores', color: C.primary },
  { label: 'Flota', icon: Truck, route: '/(app)/vehiculos', color: C.info },
  { label: 'Operaciones', icon: Map, route: '/(app)/operaciones', color: C.success },
  { label: 'Mantenimiento', icon: Wrench, route: '/(app)/mantenimiento', color: C.warning },
  { label: 'Alertas', icon: Bell, route: '/(app)/alertas', color: C.danger },
  { label: 'Reportes', icon: TrendingUp, route: '/(app)/reportes', color: C.accent },
];

export default function DashboardScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const router = useRouter();
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsRes, alertsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/alerts'),
      ]);
      setStats(statsRes.data ?? null);
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
    } catch (e) {
      console.error('Error cargando dashboard', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const name = user?.email ? user.email.split('@')[0] : 'Usuario';
  const expiredCount = alerts.filter((a) => a.status === 'VENCIDO').length;

  const go = (route: string) => router.push(route as any);

  if (loading) {
    return (
      <Screen>
        <AppHeader title="Inicio" subtitle="Resumen de operación" />
        <LoadingState text="Cargando panel..." />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Inicio" subtitle="Resumen de operación" showBell onBell={() => go('/(app)/alertas')} />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Bienvenida */}
        <View style={styles.welcome}>
          <Text style={styles.hello}>Bienvenido,</Text>
          <Text style={styles.helloName}>{name}</Text>
          <Text style={styles.helloSub}>La plataforma para gestionar y rastrear tu operación logística.</Text>
        </View>

        {/* KPIs principales */}
        <View style={styles.statsRow}>
          <StatCard
            label="Personal activo"
            value={`${stats?.workers.active ?? 0}/${stats?.workers.total ?? 0}`}
            icon={Users}
            color={C.primary}
          />
          <StatCard
            label="Flota operativa"
            value={`${stats?.vehicles.active ?? 0}/${stats?.vehicles.total ?? 0}`}
            icon={Truck}
            color={C.info}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Rutas hoy" value={stats?.routes.today ?? 0} icon={Map} color={C.success} />
          <StatCard label="Mant. mes" value={stats?.maintenance.thisMonth ?? 0} icon={Wrench} color={C.warning} />
        </View>

        {/* Operaciones del mes */}
        <Card style={styles.opCard}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <View style={[styles.cardIcon, { backgroundColor: C.dark }]}>
                <DollarSign size={16} color="#fff" />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>Operaciones del mes</Text>
            </View>
            <TouchableOpacity style={styles.linkBtn} onPress={() => go('/(app)/operaciones')} hitSlop={8}>
              <Text style={styles.linkText}>Ver detalles</Text>
              <ArrowUpRight size={15} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.opRow}>
            <View style={styles.opStat}>
              <CheckCircle2 size={16} color={C.success} />
              <Text style={styles.opValue}>{stats?.deliveries.completed ?? 0}</Text>
              <Text style={styles.opLabel}>Completadas</Text>
            </View>
            <View style={styles.opStat}>
              <Clock size={16} color={C.warning} />
              <Text style={styles.opValue}>{stats?.deliveries.pending ?? 0}</Text>
              <Text style={styles.opLabel}>Pendientes</Text>
            </View>
            <View style={styles.opStat}>
              <Package size={16} color={C.neutral} />
              <Text style={styles.opValue}>{stats?.deliveries.cancelled ?? 0}</Text>
              <Text style={styles.opLabel}>Canceladas</Text>
            </View>
          </View>

          <View style={styles.rateRow}>
            <Text style={styles.rateValue}>{stats?.deliveries.successRate ?? 0}%</Text>
            <Text style={styles.rateLabel}>tasa de éxito</Text>
          </View>
        </Card>

        {/* Costos del mes */}
        {(() => {
          const costs = stats?.costs;
          const pct = costs?.changePct ?? null;
          // Costo: color INVERSO. Más costo = malo (rojo), menos = bueno (verde).
          const up = pct != null && pct > 0;
          const down = pct != null && pct < 0;
          const pctColor = up ? C.danger : down ? C.success : C.textFaint;
          const PctIcon = up ? TrendingUp : down ? TrendingDown : null;
          return (
            <Card style={styles.opCard}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: C.dark }]}>
                    <Coins size={16} color="#fff" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Costos del mes</Text>
                </View>
                <TouchableOpacity style={styles.linkBtn} onPress={() => go('/(app)/reportes')} hitSlop={8}>
                  <Text style={styles.linkText}>Ver reportes</Text>
                  <ArrowUpRight size={15} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.costTotalRow}>
                <Text style={styles.costTotal}>{formatMoney(costs?.total ?? 0, user?.moneda)}</Text>
                {pct != null && (
                  <View style={styles.costPct}>
                    {PctIcon && <PctIcon size={14} color={pctColor} />}
                    <Text style={[styles.costPctText, { color: pctColor }]}>
                      {up ? '+' : ''}{pct.toFixed(1)}%
                    </Text>
                    <Text style={styles.costPctSub}>vs mes anterior</Text>
                  </View>
                )}
              </View>

              <View style={styles.costBreakdown}>
                <View style={styles.costRow}>
                  <View style={styles.costRowLeft}>
                    <Fuel size={15} color={C.info} />
                    <Text style={styles.costLabel}>Combustible</Text>
                  </View>
                  <Text style={styles.costValue}>{formatMoney(costs?.fuel ?? 0, user?.moneda)}</Text>
                </View>
                <View style={styles.costRow}>
                  <View style={styles.costRowLeft}>
                    <Receipt size={15} color={C.danger} />
                    <Text style={styles.costLabel}>Peajes / Multas</Text>
                  </View>
                  <Text style={styles.costValue}>{formatMoney(costs?.tolls ?? 0, user?.moneda)}</Text>
                </View>
                <View style={styles.costRow}>
                  <View style={styles.costRowLeft}>
                    <Wrench size={15} color={C.success} />
                    <Text style={styles.costLabel}>Mantenimiento</Text>
                  </View>
                  <Text style={styles.costValue}>{formatMoney(costs?.maintenance ?? 0, user?.moneda)}</Text>
                </View>
              </View>

              {costs && costs.income > 0 ? (
                <View style={styles.marginRow}>
                  <Text style={styles.marginLabel}>Margen</Text>
                  <Text style={[styles.marginValue, { color: costs.margin >= 0 ? C.success : C.danger }]}>
                    {formatMoney(costs.margin, user?.moneda)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.marginEmpty}>Sin ingresos registrados</Text>
              )}
            </Card>
          );
        })()}

        {/* Accesos rápidos */}
        <SectionTitle style={styles.section}>Accesos rápidos</SectionTitle>
        <View style={styles.accessGrid}>
          {ACCESOS.map((a) => {
            const Icon = a.icon;
            return (
              <TouchableOpacity key={a.label} style={styles.accessItem} activeOpacity={0.7} onPress={() => go(a.route)}>
                <View style={[styles.accessIcon, { backgroundColor: a.color + '1A' }]}>
                  <Icon size={18} color={a.color} />
                </View>
                <Text style={styles.accessLabel}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Próximos vencimientos */}
        <View style={styles.alertsHead}>
          <SectionTitle style={{ marginBottom: 0 }}>Próximos vencimientos</SectionTitle>
          {expiredCount > 0 && <Badge label={`${expiredCount} vencidos`} variant="danger" />}
        </View>

        {alerts.length === 0 ? (
          <Card style={styles.okCard}>
            <View style={styles.okIcon}>
              <TrendingUp size={20} color={C.success} />
            </View>
            <Text style={styles.okText}>¡Todo en orden! No hay alertas pendientes.</Text>
          </Card>
        ) : (
          <Card style={{ padding: 0 }}>
            {alerts.slice(0, 6).map((alert, i) => {
              const vencido = (alert.daysRemaining ?? 0) < 0 || alert.status === 'VENCIDO';
              const dias = alert.daysRemaining ?? 0;
              const AIcon = alert.type === 'VEHICULO' ? Truck : Users;
              return (
                <View
                  key={alert.id ?? String(i)}
                  style={[styles.alertRow, i > 0 && styles.alertBorder]}
                >
                  <View style={styles.alertIcon}>
                    <AIcon size={16} color={C.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.alertEntity} numberOfLines={1}>
                      {alert.entity || 'Sin nombre'}
                    </Text>
                    {!!alert.docName && (
                      <Text style={styles.alertDoc} numberOfLines={1}>
                        {alert.docName}
                      </Text>
                    )}
                  </View>
                  <Badge
                    label={dias < 0 ? `Vencido ${Math.abs(dias)}d` : `${dias}d`}
                    variant={vencido ? 'danger' : 'warning'}
                  />
                </View>
              );
            })}
            <TouchableOpacity style={styles.viewAll} onPress={() => go('/(app)/alertas')} activeOpacity={0.7}>
              <Text style={styles.viewAllText}>Ver todas las alertas</Text>
              <ChevronRight size={16} color={C.primary} />
            </TouchableOpacity>
          </Card>
        )}

        <View style={{ height: S.xl }} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.xxl },
  welcome: { marginBottom: S.lg },
  hello: { fontSize: F.size.md, color: C.textMuted },
  helloName: { fontSize: F.size.xxl, fontWeight: F.weight.bold, color: C.text, textTransform: 'capitalize' },
  helloSub: { fontSize: F.size.sm, color: C.textMuted, marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },

  opCard: { marginTop: S.sm, marginBottom: S.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  cardHeadLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm },
  cardIcon: { width: 34, height: 34, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flexShrink: 1, fontSize: F.size.md, fontWeight: F.weight.bold, color: C.text },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: S.sm },
  linkText: { fontSize: F.size.sm, color: C.textMuted },

  opRow: { flexDirection: 'row', gap: S.sm },
  opStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: C.surfaceAlt,
    borderRadius: R.md,
    paddingVertical: S.md,
    gap: 4,
  },
  opValue: { fontSize: F.size.xl, fontWeight: F.weight.bold, color: C.text },
  opLabel: { fontSize: F.size.xs, color: C.textMuted },

  rateRow: { flexDirection: 'row', alignItems: 'baseline', gap: S.sm, marginTop: S.md },
  rateValue: { fontSize: F.size.xxl, fontWeight: F.weight.bold, color: C.success },
  rateLabel: { fontSize: F.size.sm, color: C.textMuted },

  costTotalRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: S.sm },
  costTotal: { fontSize: F.size.display, fontWeight: F.weight.bold, color: C.text },
  costPct: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costPctText: { fontSize: F.size.sm, fontWeight: F.weight.semibold },
  costPctSub: { fontSize: F.size.xs, color: C.textFaint },
  costBreakdown: { marginTop: S.md, gap: S.sm },
  costRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  costRowLeft: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  costLabel: { fontSize: F.size.sm, color: C.textMuted },
  costValue: { fontSize: F.size.md, fontWeight: F.weight.semibold, color: C.text },
  marginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  marginLabel: { fontSize: F.size.sm, color: C.textMuted },
  marginValue: { fontSize: F.size.md, fontWeight: F.weight.bold },
  marginEmpty: {
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    fontSize: F.size.xs,
    color: C.textFaint,
  },

  section: { marginTop: S.sm, marginBottom: S.md },
  accessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.lg },
  accessItem: {
    width: '31.5%',
    flexGrow: 1,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingVertical: S.md,
    alignItems: 'center',
    gap: S.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Theme.shadow.card,
  },
  accessIcon: { width: 40, height: 40, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  accessLabel: { fontSize: F.size.sm, fontWeight: F.weight.medium, color: C.text },

  alertsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: S.sm,
    marginBottom: S.md,
  },

  okCard: { alignItems: 'center', paddingVertical: S.xl, gap: S.sm },
  okIcon: {
    width: 44,
    height: 44,
    borderRadius: R.full,
    backgroundColor: C.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: { fontSize: F.size.sm, color: C.textMuted, textAlign: 'center' },

  alertRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md },
  alertBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: R.md,
    backgroundColor: C.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertEntity: { fontSize: F.size.md, fontWeight: F.weight.medium, color: C.text },
  alertDoc: { fontSize: F.size.xs, color: C.textFaint, marginTop: 2 },

  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: S.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  viewAllText: { fontSize: F.size.sm, fontWeight: F.weight.semibold, color: C.primary },
});
