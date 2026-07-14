import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Radio, Wifi, Gauge, MapPin, Clock, User, Truck } from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  SearchBar,
  StatCard,
  Badge,
  LoadingState,
  EmptyState,
  Theme,
} from '../../components/ui';
import api from '../../services/api';

const C = Theme.colors;
const S = Theme.spacing;

// Umbral de conexión: una posición más reciente que esto se considera "en línea".
const ONLINE_MS = 5 * 60 * 1000;
const REFRESH_MS = 12 * 1000;

type Position = {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed?: number;
};

type Device = {
  id: string;
  name?: string;
  vehiculo?: { placa?: string } | null;
  trabajador?: { nombre_completo?: string } | null;
  positions?: Position[];
};

// Devuelve la posición más reciente de un device (por timestamp).
function lastPosition(d: Device): Position | undefined {
  const pos = d.positions;
  if (!pos || pos.length === 0) return undefined;
  return pos.reduce((a, b) =>
    new Date(b.timestamp).getTime() > new Date(a.timestamp).getTime() ? b : a
  );
}

function isOnline(p?: Position): boolean {
  if (!p) return false;
  return Date.now() - new Date(p.timestamp).getTime() < ONLINE_MS;
}

// "hace X min" a partir de un timestamp.
function timeAgo(timestamp?: string): string {
  if (!timestamp) return 'sin datos';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0) return 'ahora';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'hace unos segundos';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

function kmh(speed?: number): string {
  const v = typeof speed === 'number' && Number.isFinite(speed) ? speed : 0;
  return `${(v * 3.6).toFixed(0)} km/h`;
}

function deviceTitle(d: Device): string {
  return (
    d.trabajador?.nombre_completo ||
    d.vehiculo?.placa ||
    d.name ||
    'Dispositivo'
  );
}

export default function FlotaScreen() {
  const [items, setItems] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  // Fuerza re-render periódico para actualizar "hace X min" y el estado en línea.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/gps/devices');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error cargando flota', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Auto-refresco cada 12s mientras la pantalla está montada.
  useEffect(() => {
    const timer = setInterval(() => {
      load();
      setTick((t) => t + 1);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((d) => {
      const nombre = d.trabajador?.nombre_completo?.toLowerCase() || '';
      const placa = d.vehiculo?.placa?.toLowerCase() || '';
      const name = d.name?.toLowerCase() || '';
      return nombre.includes(q) || placa.includes(q) || name.includes(q);
    });
  }, [items, query]);

  const stats = useMemo(() => {
    const online = items.filter((d) => isOnline(lastPosition(d))).length;
    return { total: items.length, online };
  }, [items]);

  const renderCard = ({ item: d }: { item: Device }) => {
    const pos = lastPosition(d);
    const online = isOnline(pos);
    return (
      <View style={styles.card}>
        <View style={[styles.cardIcon, { backgroundColor: online ? C.successSoft : C.neutralSoft }]}>
          <Radio size={20} color={online ? C.success : C.neutral} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.title} numberOfLines={1}>
              {deviceTitle(d)}
            </Text>
            <Badge label={online ? 'En línea' : 'Desconectado'} variant={online ? 'success' : 'neutral'} />
          </View>

          <View style={styles.subRow}>
            {d.vehiculo?.placa ? (
              <View style={styles.metaChip}>
                <Truck size={12} color={C.textFaint} />
                <Text style={styles.meta}>{d.vehiculo.placa}</Text>
              </View>
            ) : null}
            {d.trabajador?.nombre_completo && (d.vehiculo?.placa || d.name) ? (
              <View style={styles.metaChip}>
                <User size={12} color={C.textFaint} />
                <Text style={styles.meta} numberOfLines={1}>
                  {d.trabajador.nombre_completo}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.statsLine}>
            <View style={styles.metaChip}>
              <Clock size={12} color={C.textFaint} />
              <Text style={styles.meta}>{timeAgo(pos?.timestamp)}</Text>
            </View>
            <View style={styles.metaChip}>
              <Gauge size={12} color={C.textFaint} />
              <Text style={styles.meta}>{kmh(pos?.speed)}</Text>
            </View>
          </View>

          <View style={styles.coordRow}>
            <MapPin size={12} color={C.textFaint} />
            <Text style={styles.coord}>
              {pos
                ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`
                : 'Sin ubicación registrada'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <AppHeader title="Flota en Vivo" subtitle={`${stats.online} de ${items.length} en línea`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Dispositivos" value={stats.total} icon={Radio} color={C.primary} />
          <StatCard label="En línea" value={stats.online} icon={Wifi} color={C.success} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por chofer o placa" />
        </View>

        {loading ? (
          <LoadingState text="Cargando flota..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(d) => d.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="Sin dispositivos"
                subtitle="No hay unidades con GPS conectadas por ahora."
                icon={Radio}
              />
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: 4, flexWrap: 'wrap' },
  statsLine: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: 6, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: C.textMuted },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  coord: { fontSize: 12, color: C.textFaint, fontVariant: ['tabular-nums'] },
});
