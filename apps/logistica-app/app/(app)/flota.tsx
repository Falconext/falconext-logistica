import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
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
import MapboxWebView from '../../components/MapboxWebView';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

// Umbral de conexión: una posición más reciente que esto se considera "en línea".
const ONLINE_MS = 10 * 60 * 1000; // "conectado" si reportó actividad hace <10 min (igual que Dispositivos)
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
  last_activity?: string | null;
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

// "Conectado" = el dispositivo reportó actividad hace poco. Se usa la MISMA
// lógica y ventana que la pantalla de Dispositivos GPS (last_activity, 10 min)
// para que el estado sea consistente entre ambas pantallas.
function isConnected(d: Device): boolean {
  if (!d.last_activity) return false;
  const t = new Date(d.last_activity).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= ONLINE_MS;
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
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [items, setItems] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  // Fuerza re-render periódico para actualizar "hace X min" y el estado en línea.
  const [, setTick] = useState(0);
  // Punto al que centrar el mapa al tocar una tarjeta.
  const [focus, setFocus] = useState<{ lng: number; lat: number; nonce: number } | undefined>();
  const focusNonce = useRef(0);

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
    const online = items.filter((d) => isConnected(d)).length;
    return { total: items.length, online };
  }, [items]);

  // Devices con posición válida para pintar en el mapa.
  const located = useMemo(() => {
    return items
      .map((d) => ({ d, pos: lastPosition(d) }))
      .filter(
        (x): x is { d: Device; pos: Position } =>
          !!x.pos &&
          Number.isFinite(x.pos.latitude) &&
          Number.isFinite(x.pos.longitude)
      );
  }, [items]);

  // Región inicial: encuadra los marcadores (o Lima por defecto).
  const initialRegion = useMemo(() => {
    if (located.length === 0) {
      return { latitude: -12.0464, longitude: -77.0428, latitudeDelta: 0.5, longitudeDelta: 0.5 };
    }
    const lats = located.map((x) => x.pos.latitude);
    const lngs = located.map((x) => x.pos.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02),
    };
  }, [located]);

  const renderCard = ({ item: d }: { item: Device }) => {
    const pos = lastPosition(d);
    const online = isConnected(d);
    const hasPos = !!pos && Number.isFinite(pos.latitude) && Number.isFinite(pos.longitude);
    return (
      <TouchableOpacity
        activeOpacity={hasPos ? 0.7 : 1}
        onPress={() => {
          if (hasPos) setFocus({ lng: pos!.longitude, lat: pos!.latitude, nonce: focusNonce.current++ });
        }}
        style={styles.card}
      >
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
      </TouchableOpacity>
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

        <MapboxWebView
          style={styles.map}
          fit
          mapStyle="streets"
          markers={located.map(({ d, pos }) => ({
            lng: pos.longitude,
            lat: pos.latitude,
            color: isConnected(d) ? '#16A34A' : '#94A3B8',
            popup: `<b>${deviceTitle(d)}</b><br/>${timeAgo(pos.timestamp)} · ${kmh(pos.speed)}`,
          }))}
          focus={focus}
        />

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

const makeStyles = () => StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  map: {
    height: 280,
    borderRadius: Theme.radius.lg,
    marginBottom: S.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
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
