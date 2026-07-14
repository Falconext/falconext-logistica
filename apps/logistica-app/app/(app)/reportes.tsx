import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  BarChart3,
  Receipt,
  Users,
  Package,
  XCircle,
  TrendingUp,
  Truck,
  Trophy,
  CalendarDays,
} from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  StatCard,
  Card,
  SectionTitle,
  LoadingState,
  EmptyState,
  ErrorState,
  Theme,
} from '../../components/ui';
import api from '../../services/api';

const C = Theme.colors;
const S = Theme.spacing;
const R = Theme.radius;

// ---- Tipos del contrato /dashboard/reports -------------------------------
interface ReportKpis {
  total_routes: number;
  completed: number;
  failed: number;
  income: number;
  active_clients: number;
}

interface EvolutionPoint {
  date: string;
  'Entregas Realizadas': number;
  'Entregas Fallidas': number;
}

interface WorkerRank {
  name: string;
  Entregas: number;
}

interface VehicleUsage {
  name: string;
  Viajes: number;
}

interface ReportsResponse {
  kpis: ReportKpis;
  charts: {
    evolution: EvolutionPoint[];
    workers: WorkerRank[];
    vehicles: VehicleUsage[];
  };
}

// ---- Periodos preestablecidos --------------------------------------------
type PeriodKey = 'thisMonth' | 'lastMonth' | 'thisYear';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes pasado' },
  { key: 'thisYear', label: 'Este año' },
];

function periodRange(key: PeriodKey): { from: Date; to: Date; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'lastMonth') {
    return {
      from: new Date(y, m - 1, 1),
      to: new Date(y, m, 0),
      label: 'Mes pasado',
    };
  }
  if (key === 'thisYear') {
    return {
      from: new Date(y, 0, 1),
      to: new Date(y, 11, 31),
      label: `Año ${y}`,
    };
  }
  return {
    from: new Date(y, m, 1),
    to: new Date(y, m + 1, 0),
    label: 'Este mes',
  };
}

const EMPTY_KPIS: ReportKpis = {
  total_routes: 0,
  completed: 0,
  failed: 0,
  income: 0,
  active_clients: 0,
};

const money = (n: number) => `S/ ${new Intl.NumberFormat('es-PE').format(Math.round(n || 0))}`;

const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};

export default function ReportesScreen() {
  const [period, setPeriod] = useState<PeriodKey>('thisMonth');
  const [kpis, setKpis] = useState<ReportKpis>(EMPTY_KPIS);
  const [evolution, setEvolution] = useState<EvolutionPoint[]>([]);
  const [workers, setWorkers] = useState<WorkerRank[]>([]);
  const [vehicles, setVehicles] = useState<VehicleUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (key: PeriodKey) => {
    setError(null);
    try {
      const { from, to } = periodRange(key);
      const res = await api.get<ReportsResponse>('/dashboard/reports', {
        params: { from: from.toISOString(), to: to.toISOString() },
      });
      const data = res.data;
      setKpis(data?.kpis ?? EMPTY_KPIS);
      setEvolution(Array.isArray(data?.charts?.evolution) ? data.charts.evolution : []);
      setWorkers(Array.isArray(data?.charts?.workers) ? data.charts.workers : []);
      setVehicles(Array.isArray(data?.charts?.vehicles) ? data.charts.vehicles : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudieron cargar los reportes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(period);
  };

  const selectPeriod = (key: PeriodKey) => {
    if (key === period) return;
    setPeriod(key);
    setLoading(true);
    load(key);
  };

  const periodLabel = useMemo(() => periodRange(period).label, [period]);

  const successRate = useMemo(() => {
    if (!kpis.total_routes) return 0;
    return Math.round((kpis.completed / kpis.total_routes) * 100);
  }, [kpis]);

  const maxWorker = useMemo(
    () => workers.reduce((mx, w) => Math.max(mx, w.Entregas || 0), 0),
    [workers]
  );
  const maxVehicle = useMemo(
    () => vehicles.reduce((mx, v) => Math.max(mx, v.Viajes || 0), 0),
    [vehicles]
  );
  const maxEvo = useMemo(
    () =>
      evolution.reduce(
        (mx, e) => Math.max(mx, (e['Entregas Realizadas'] || 0) + (e['Entregas Fallidas'] || 0)),
        0
      ),
    [evolution]
  );

  const hasData = kpis.total_routes > 0 || evolution.length > 0;

  return (
    <Screen>
      <AppHeader title="Reportes" subtitle="Indicadores de operación" />

      {loading ? (
        <LoadingState text="Cargando indicadores..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(period); }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {/* Selector de periodo */}
          <View style={styles.periodRow}>
            {PERIODS.map((p) => {
              const active = p.key === period;
              return (
                <TouchableOpacity
                  key={p.key}
                  activeOpacity={0.8}
                  onPress={() => selectPeriod(p.key)}
                  style={[styles.periodChip, active && styles.periodChipActive]}
                >
                  <Text style={[styles.periodText, active && styles.periodTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.periodMeta}>
            <CalendarDays size={13} color={C.textFaint} />
            <Text style={styles.periodMetaText}>{periodLabel}</Text>
          </View>

          {/* KPIs */}
          <View style={styles.statsRow}>
            <StatCard label="Rutas totales" value={kpis.total_routes} icon={Receipt} color={C.primary} />
            <StatCard label="Clientes activos" value={kpis.active_clients} icon={Users} color={C.success} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Entregas exitosas" value={kpis.completed} icon={Package} color={C.accent} />
            <StatCard label="Entregas fallidas" value={kpis.failed} icon={XCircle} color={C.danger} />
          </View>

          {/* Ingresos + tasa de éxito */}
          <View style={styles.highlightRow}>
            <Card style={styles.highlightCard}>
              <View style={[styles.hlIcon, { backgroundColor: C.primarySoft }]}>
                <TrendingUp size={20} color={C.primary} />
              </View>
              <Text style={styles.hlValue}>{money(kpis.income)}</Text>
              <Text style={styles.hlLabel}>Ingresos estimados</Text>
            </Card>
            <Card style={styles.highlightCard}>
              <View style={[styles.hlIcon, { backgroundColor: C.successSoft }]}>
                <BarChart3 size={20} color={C.success} />
              </View>
              <Text style={styles.hlValue}>{successRate}%</Text>
              <Text style={styles.hlLabel}>Tasa de éxito</Text>
            </Card>
          </View>

          {!hasData ? (
            <EmptyState
              title="Sin datos en el periodo"
              subtitle="No hay rutas registradas para el rango seleccionado."
              icon={BarChart3}
            />
          ) : (
            <>
              {/* Ranking de conductores */}
              <SectionTitle style={styles.section}>Ranking de conductores</SectionTitle>
              <Card>
                {workers.length === 0 ? (
                  <Text style={styles.rankEmpty}>Sin entregas completadas en el periodo.</Text>
                ) : (
                  workers.map((w, i) => (
                    <View key={`${w.name}-${i}`} style={styles.rankRow}>
                      <View style={styles.rankHead}>
                        <View style={styles.rankLeft}>
                          {i === 0 ? (
                            <Trophy size={15} color={C.accent} />
                          ) : (
                            <Text style={styles.rankPos}>{i + 1}</Text>
                          )}
                          <Text style={styles.rankName} numberOfLines={1}>{w.name}</Text>
                        </View>
                        <Text style={styles.rankValue}>{w.Entregas}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { backgroundColor: C.primary, width: `${maxWorker ? (w.Entregas / maxWorker) * 100 : 0}%` },
                          ]}
                        />
                      </View>
                    </View>
                  ))
                )}
              </Card>

              {/* Uso de flota */}
              <SectionTitle style={styles.section}>Uso de flota</SectionTitle>
              <Card>
                {vehicles.length === 0 ? (
                  <Text style={styles.rankEmpty}>Sin viajes asignados en el periodo.</Text>
                ) : (
                  vehicles.map((v, i) => (
                    <View key={`${v.name}-${i}`} style={styles.rankRow}>
                      <View style={styles.rankHead}>
                        <View style={styles.rankLeft}>
                          <Truck size={15} color={C.textMuted} />
                          <Text style={styles.rankName} numberOfLines={1}>{v.name}</Text>
                        </View>
                        <Text style={styles.rankValue}>{v.Viajes} viajes</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { backgroundColor: C.success, width: `${maxVehicle ? (v.Viajes / maxVehicle) * 100 : 0}%` },
                          ]}
                        />
                      </View>
                    </View>
                  ))
                )}
              </Card>

              {/* Evolución de entregas */}
              <SectionTitle style={styles.section}>Evolución de entregas</SectionTitle>
              <Card>
                {evolution.length === 0 ? (
                  <Text style={styles.rankEmpty}>Sin movimientos en el periodo.</Text>
                ) : (
                  <>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: C.primary }]} />
                        <Text style={styles.legendText}>Realizadas</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: C.danger }]} />
                        <Text style={styles.legendText}>Fallidas</Text>
                      </View>
                    </View>
                    {evolution.map((e, i) => {
                      const ok = e['Entregas Realizadas'] || 0;
                      const bad = e['Entregas Fallidas'] || 0;
                      const total = ok + bad;
                      return (
                        <View key={`${e.date}-${i}`} style={styles.evoRow}>
                          <Text style={styles.evoDate}>{shortDate(e.date)}</Text>
                          <View style={styles.evoBarTrack}>
                            <View
                              style={[
                                styles.evoSeg,
                                { backgroundColor: C.primary, flex: maxEvo ? ok : 0 },
                              ]}
                            />
                            <View
                              style={[
                                styles.evoSeg,
                                { backgroundColor: C.danger, flex: maxEvo ? bad : 0 },
                              ]}
                            />
                            <View style={{ flex: maxEvo ? Math.max(maxEvo - total, 0) : 1 }} />
                          </View>
                          <Text style={styles.evoValue}>{total}</Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: S.lg, paddingBottom: S.xxl },
  periodRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },
  periodChip: {
    flex: 1,
    height: 38,
    borderRadius: R.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  periodText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  periodTextActive: { color: C.textOnPrimary },
  periodMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: S.md },
  periodMetaText: { fontSize: 12, color: C.textFaint },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },
  highlightRow: { flexDirection: 'row', gap: S.sm, marginTop: S.xs, marginBottom: S.sm },
  highlightCard: { flex: 1 },
  hlIcon: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S.sm,
  },
  hlValue: { fontSize: 22, fontWeight: '700', color: C.text },
  hlLabel: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  section: { marginTop: S.lg, marginBottom: S.sm },
  rankEmpty: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: S.sm },
  rankRow: { marginBottom: S.md },
  rankHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  rankLeft: { flexDirection: 'row', alignItems: 'center', gap: S.sm, flex: 1, marginRight: S.sm },
  rankPos: {
    width: 18,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: C.textFaint,
  },
  rankName: { fontSize: 14, color: C.text, fontWeight: '500', flexShrink: 1 },
  rankValue: { fontSize: 14, fontWeight: '700', color: C.text },
  barTrack: { height: 8, borderRadius: R.full, backgroundColor: C.neutralSoft, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: R.full },
  legendRow: { flexDirection: 'row', gap: S.lg, marginBottom: S.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: R.full },
  legendText: { fontSize: 12, color: C.textMuted },
  evoRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm },
  evoDate: { width: 56, fontSize: 12, color: C.textMuted },
  evoBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: R.full,
    backgroundColor: C.neutralSoft,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  evoSeg: { height: 10 },
  evoValue: { width: 28, textAlign: 'right', fontSize: 12, fontWeight: '600', color: C.text },
});
