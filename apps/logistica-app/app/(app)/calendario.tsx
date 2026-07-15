import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CalendarDays, Truck, User, Clock, CalendarClock, ListChecks } from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  StatCard,
  Badge,
  SearchBar,
  FormModal,
  LoadingState,
  EmptyState,
  ErrorState,
  InfoRow,
  Theme,
} from '../../components/ui';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import type { Programacion } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Clave de día (YYYY-MM-DD) a partir de una fecha ISO, sin desfase de zona.
function dayKey(iso?: string): string {
  if (!iso) return 'sin-fecha';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'sin-fecha';
  return d.toISOString().split('T')[0];
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// Etiqueta legible para la cabecera de sección.
function labelForKey(key: string): string {
  if (key === 'sin-fecha') return 'Sin fecha asignada';
  const d = new Date(key + 'T00:00:00');
  if (isNaN(d.getTime())) return key;
  const wd = WEEKDAYS[d.getDay()];
  const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
  return `${cap} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

function estadoVariant(estado?: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const e = (estado || '').toUpperCase();
  if (e.includes('COMPLET') || e.includes('ENTREG') || e.includes('FINALIZ')) return 'success';
  if (e.includes('CURSO') || e.includes('PROCESO') || e.includes('TRANSIT')) return 'info';
  if (e.includes('PEND') || e.includes('PROGRAM')) return 'warning';
  if (e.includes('CANCEL') || e.includes('ANUL')) return 'danger';
  return 'neutral';
}

type Section = { title: string; key: string; data: Programacion[] };

export default function CalendarioScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [items, setItems] = useState<Programacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Programacion | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/programacion');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cargar el calendario.');
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
    if (!q) return items;
    return items.filter((r) =>
      [r.cliente, r.lugar_retiro, r.lugar_entrega, r.vehiculo_id, r.trabajador_id, r.estado]
        .some((v) => (v || '').toString().toLowerCase().includes(q))
    );
  }, [items, query]);

  // Agrupar por día y ordenar cronológicamente (fechas primero, sin fecha al final).
  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, Programacion[]>();
    for (const r of filtered) {
      const k = dayKey(r.fecha);
      const arr = groups.get(k);
      if (arr) arr.push(r);
      else groups.set(k, [r]);
    }
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'sin-fecha') return 1;
      if (b === 'sin-fecha') return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return keys.map((k) => ({ key: k, title: labelForKey(k), data: groups.get(k)! }));
  }, [filtered]);

  const stats = useMemo(() => {
    const tk = todayKey();
    const dias = new Set(items.map((r) => dayKey(r.fecha)).filter((k) => k !== 'sin-fecha'));
    const proximas = items.filter((r) => {
      const k = dayKey(r.fecha);
      return k !== 'sin-fecha' && k >= tk;
    }).length;
    return { total: items.length, dias: dias.size, proximas };
  }, [items]);

  const renderCard = ({ item: r }: { item: Programacion }) => (
    <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(r)}>
      <View style={styles.cardIcon}>
        <Truck size={18} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {r.cliente || r.vehiculo_id || 'Operación'}
          </Text>
          {!!r.estado && <Badge label={r.estado} variant={estadoVariant(r.estado)} />}
        </View>

        <View style={styles.route}>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: C.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>{r.lugar_retiro || 'Origen no especificado'}</Text>
          </View>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: C.danger }]} />
            <Text style={styles.routeText} numberOfLines={1}>{r.lugar_entrega || 'Destino no especificado'}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          {!!r.hora_retiro && (
            <View style={styles.meta}>
              <Clock size={12} color={C.textFaint} />
              <Text style={styles.metaText}>{r.hora_retiro}</Text>
            </View>
          )}
          {!!r.trabajador_id && (
            <View style={styles.meta}>
              <User size={12} color={C.textFaint} />
              <Text style={styles.metaText} numberOfLines={1}>{r.trabajador_id}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: { section: Section }) => {
    const isToday = section.key === todayKey();
    return (
      <View style={styles.sectionHeader}>
        <CalendarDays size={16} color={isToday ? C.primary : C.textMuted} />
        <Text style={[styles.sectionTitle, isToday && { color: C.primary }]}>{section.title}</Text>
        {isToday && <Badge label="Hoy" variant="info" />}
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    );
  };

  return (
    <Screen>
      <AppHeader title="Calendario" subtitle="Operaciones programadas" />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Operaciones" value={stats.total} icon={ListChecks} color={C.primary} />
          <StatCard label="Días con rutas" value={stats.dias} icon={CalendarDays} color={C.info} />
          <StatCard label="Próximas" value={stats.proximas} icon={CalendarClock} color={C.success} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar cliente, lugar o unidad" />
        </View>

        {loading ? (
          <LoadingState text="Cargando calendario..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => item.id || `${index}`}
            renderItem={renderCard}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="Sin operaciones"
                subtitle="No hay rutas programadas para mostrar."
                icon={CalendarDays}
              />
            }
          />
        )}
      </View>

      {/* Detalle de operación */}
      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.cliente || 'Operación'}
      >
        {detail && (
          <View>
            <InfoRow label="Fecha" value={detail.fecha ? labelForKey(dayKey(detail.fecha)) : '—'} />
            <InfoRow label="Estado" value={detail.estado} />
            <InfoRow label="Cliente" value={detail.cliente} />
            <InfoRow label="Vehículo" value={detail.vehiculo_id} />
            <InfoRow label="Trabajador" value={detail.trabajador_id} />
            <InfoRow label="Lugar de retiro" value={detail.lugar_retiro} />
            <InfoRow label="Fecha de retiro" value={detail.fecha_retiro} />
            <InfoRow label="Hora de retiro" value={detail.hora_retiro} />
            <InfoRow label="Lugar de entrega" value={detail.lugar_entrega} />
            <InfoRow label="Fecha de entrega" value={detail.fecha_entrega} />
            <InfoRow label="ETA" value={detail.eta} />
            <InfoRow
              label="Ingreso estimado"
              value={detail.ingreso_estimado != null ? `S/ ${Number(detail.ingreso_estimado).toLocaleString('es-PE')}` : '—'}
            />
            <InfoRow label="Nota" value={detail.nota} />
          </View>
        )}
      </FormModal>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
    marginBottom: S.sm,
  },
  sectionTitle: { fontSize: Theme.font.size.md, fontWeight: '700', color: C.text, flex: 1 },
  sectionCount: {
    fontSize: Theme.font.size.xs,
    fontWeight: '700',
    color: C.textMuted,
    backgroundColor: C.neutralSoft,
    paddingHorizontal: S.sm,
    paddingVertical: 2,
    borderRadius: Theme.radius.full,
    overflow: 'hidden',
  },
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  route: { marginTop: 6, gap: 3 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { fontSize: 13, color: C.textMuted, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: 6, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textFaint },
});
