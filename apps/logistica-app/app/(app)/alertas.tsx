import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FileWarning, AlertTriangle, Clock, Calendar, Shield } from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  SearchBar,
  StatCard,
  Badge,
  FormModal,
  LoadingState,
  EmptyState,
  ErrorState,
  InfoRow,
  Theme,
} from '../../components/ui';
import api from '../../services/api';

const C = Theme.colors;
const S = Theme.spacing;

type Severity = 'critical' | 'warning' | 'info';

interface DocumentAlert {
  trabajadorId: string;
  trabajadorNombre: string;
  cargo: string;
  documentType: string;
  documentLabel: string;
  expirationDate: string;
  daysRemaining: number;
  severity: Severity;
}

interface AlertSummary {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

type FilterKey = 'all' | Severity;

const severityMeta: Record<Severity, { label: string; variant: 'danger' | 'warning' | 'info' }> = {
  critical: { label: 'Crítico', variant: 'danger' },
  warning: { label: 'Próximo', variant: 'warning' },
  info: { label: 'Planeado', variant: 'info' },
};

const docIcon: Record<string, string> = {
  passport: '🛂',
  license: '🪪',
  contract: '📄',
  residence: '🏠',
  id: '🆔',
  fiscal: '💰',
  translation: '📝',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AlertasScreen() {
  const [alerts, setAlerts] = useState<DocumentAlert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [detail, setDetail] = useState<DocumentAlert | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [alertsRes, summaryRes] = await Promise.all([
        api.get('/alerts/documents?days=90'),
        api.get('/alerts/summary'),
      ]);
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      setSummary(summaryRes.data ?? null);
    } catch (e: any) {
      console.error('Error cargando alertas', e);
      setError(e?.response?.data?.message || 'No se pudieron cargar las alertas.');
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter((a) => {
      if (filter !== 'all' && a.severity !== filter) return false;
      if (!q) return true;
      return (
        a.trabajadorNombre?.toLowerCase().includes(q) ||
        a.documentLabel?.toLowerCase().includes(q) ||
        a.cargo?.toLowerCase().includes(q)
      );
    });
  }, [alerts, query, filter]);

  const renderCard = ({ item: a }: { item: DocumentAlert }) => {
    const meta = severityMeta[a.severity];
    return (
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(a)}>
        <View style={styles.cardIcon}>
          <Text style={styles.docEmoji}>{docIcon[a.documentType] ?? '📋'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.name} numberOfLines={1}>{a.trabajadorNombre}</Text>
            <Badge label={`${a.daysRemaining} días`} variant={meta.variant} />
          </View>
          <Text style={styles.docLabel}>{a.documentLabel}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{a.cargo || 'Sin cargo'}</Text>
            <Text style={styles.meta}>· Vence {fmtDate(a.expirationDate)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const FilterCard = ({
    label,
    value,
    icon,
    color,
    fkey,
  }: {
    label: string;
    value: number;
    icon: typeof FileWarning;
    color: string;
    fkey: FilterKey;
  }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.statWrap, filter === fkey && { borderColor: color, borderWidth: 1.5 }]}
      onPress={() => setFilter(filter === fkey ? 'all' : fkey)}
    >
      <StatCard label={label} value={value} icon={icon} color={color} />
    </TouchableOpacity>
  );

  return (
    <Screen>
      <AppHeader title="Centro de Alertas" subtitle="Documentos por vencer (90 días)" />

      <View style={styles.body}>
        {summary && (
          <View style={styles.statsRow}>
            <FilterCard label="Total" value={summary.total} icon={FileWarning} color={C.neutral} fkey="all" />
            <FilterCard label="Críticos" value={summary.critical} icon={AlertTriangle} color={C.danger} fkey="critical" />
            <FilterCard label="Próximos" value={summary.warning} icon={Clock} color={C.warning} fkey="warning" />
            <FilterCard label="Planeados" value={summary.info} icon={Calendar} color={C.info} fkey="info" />
          </View>
        )}

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nombre, documento o cargo" />
        </View>

        {loading ? (
          <LoadingState text="Cargando alertas..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(a, idx) => `${a.trabajadorId}-${a.documentType}-${idx}`}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="¡Todo en orden!"
                subtitle="No hay documentos próximos a vencer en esta categoría."
                icon={Shield}
              />
            }
          />
        )}
      </View>

      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.trabajadorNombre || 'Detalle'}
      >
        {detail && (
          <View>
            <View style={{ marginBottom: S.md }}>
              <Badge label={severityMeta[detail.severity].label} variant={severityMeta[detail.severity].variant} />
            </View>
            <InfoRow label="Trabajador" value={detail.trabajadorNombre} />
            <InfoRow label="Cargo" value={detail.cargo} />
            <InfoRow label="Documento" value={detail.documentLabel} />
            <InfoRow label="Fecha de vencimiento" value={fmtDate(detail.expirationDate)} />
            <InfoRow label="Días restantes" value={`${detail.daysRemaining} días`} />
          </View>
        )}
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md, flexWrap: 'wrap' },
  statWrap: { flexGrow: 1, flexBasis: '47%', borderRadius: Theme.radius.lg, borderColor: 'transparent', borderWidth: 1.5 },
  card: {
    flexDirection: 'row',
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Theme.shadow.card,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docEmoji: { fontSize: 22 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  name: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  docLabel: { fontSize: 14, color: C.text, marginTop: 2, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: C.textFaint },
});
