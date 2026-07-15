import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Smartphone, Truck, Wifi, WifiOff, MapPin } from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  SearchBar,
  StatCard,
  Badge,
  Fab,
  FormModal,
  FormField,
  Button,
  LoadingState,
  EmptyState,
  InfoRow,
  Theme,
} from '../../components/ui';
import MapboxWebView from '../../components/MapboxWebView';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

// Forma real que devuelve el backend (GET /gps/devices).
interface DevicePosition {
  latitude?: number | null;
  longitude?: number | null;
  timestamp?: string | null;
  speed?: number | null;
  battery?: number | null;
}
interface Device {
  id: string;
  name: string;
  imei: string;
  token: string;
  model?: string | null;
  last_activity?: string | null;
  vehiculo_id?: string | null;
  vehiculo?: { id: string; placa: string; marca_modelo?: string | null } | null;
  positions?: DevicePosition[];
}

interface VehiculoOpt {
  id: string;
  placa: string;
  marca_modelo?: string | null;
}

const CONNECTED_WINDOW_MS = 10 * 60 * 1000; // 10 minutos => "conectado"

function isConnected(d: Device): boolean {
  if (!d.last_activity) return false;
  const t = new Date(d.last_activity).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= CONNECTED_WINDOW_MS;
}

function fmtDate(v?: string | null): string {
  if (!v) return 'Nunca';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function lastPosition(d: Device): DevicePosition | undefined {
  return d.positions && d.positions.length > 0 ? d.positions[0] : undefined;
}

export default function DispositivosScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [items, setItems] = useState<Device[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [detail, setDetail] = useState<Device | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImei, setNewImei] = useState('');
  const [selectedVehiculo, setSelectedVehiculo] = useState('');

  const load = useCallback(async () => {
    try {
      const [dev, veh] = await Promise.all([
        api.get('/gps/devices'),
        api.get('/vehiculos'),
      ]);
      setItems(Array.isArray(dev.data) ? dev.data : []);
      setVehiculos(Array.isArray(veh.data) ? veh.data : []);
    } catch (e) {
      console.error('Error cargando dispositivos', e);
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
    const q = query.toLowerCase();
    return items.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.imei?.toLowerCase().includes(q) ||
        d.vehiculo?.placa?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const stats = useMemo(() => {
    const conectados = items.filter(isConnected).length;
    const sinVehiculo = items.filter((d) => !d.vehiculo_id && !d.vehiculo).length;
    return { total: items.length, conectados, sinVehiculo };
  }, [items]);

  // Dispositivos con posición válida para el mapa.
  const located = useMemo(() => {
    return items
      .map((d) => ({ d, pos: lastPosition(d) }))
      .filter(
        (x): x is { d: Device; pos: DevicePosition & { latitude: number; longitude: number } } =>
          !!x.pos &&
          typeof x.pos.latitude === 'number' &&
          typeof x.pos.longitude === 'number' &&
          Number.isFinite(x.pos.latitude) &&
          Number.isFinite(x.pos.longitude)
      );
  }, [items]);

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

  const openCreate = () => {
    setNewName('');
    setNewImei('');
    setSelectedVehiculo('');
    setFormVisible(true);
  };

  const save = async () => {
    if (!newName.trim()) {
      Alert.alert('Falta el nombre', 'Ingresa el nombre del dispositivo.');
      return;
    }
    if (!newImei.trim()) {
      Alert.alert('Falta el identificador', 'Ingresa el IMEI o ID único del dispositivo.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/gps/devices', {
        name: newName.trim(),
        imei: newImei.trim(),
        vehiculoId: selectedVehiculo || undefined,
      });
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo crear el dispositivo.');
    } finally {
      setSaving(false);
    }
  };

  const renderCard = ({ item: d }: { item: Device }) => {
    const conectado = isConnected(d);
    return (
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(d)}>
        <View style={styles.cardIcon}>
          <Smartphone size={20} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.name} numberOfLines={1}>{d.name}</Text>
            <Badge label={conectado ? 'Conectado' : 'Sin actividad'} variant={conectado ? 'success' : 'neutral'} />
          </View>
          <Text style={styles.imei} numberOfLines={1}>{d.imei}</Text>
          <View style={styles.metaRow}>
            {d.vehiculo ? (
              <View style={styles.metaGood}>
                <Truck size={13} color={C.primary} />
                <Text style={styles.metaGoodText}>{d.vehiculo.placa}</Text>
              </View>
            ) : (
              <Text style={styles.metaMuted}>Sin vehículo asignado</Text>
            )}
          </View>
          <Text style={styles.lastConn}>Última conexión: {fmtDate(d.last_activity)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const detailPos = detail ? lastPosition(detail) : undefined;

  return (
    <Screen>
      <AppHeader title="Dispositivos GPS" subtitle={`${items.length} dispositivos registrados`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={Smartphone} color={C.primary} />
          <StatCard label="Conectados" value={stats.conectados} icon={Wifi} color={C.success} />
          <StatCard label="Sin vehículo" value={stats.sinVehiculo} icon={WifiOff} color={C.warning} />
        </View>

        <MapboxWebView
          style={styles.map}
          fit
          mapStyle="streets"
          markers={located.map(({ d, pos }) => ({
            lng: pos.longitude,
            lat: pos.latitude,
            color: isConnected(d) ? '#16A34A' : '#94A3B8',
            popup: `<b>${d.name}</b><br/>${d.vehiculo?.placa || d.imei}`,
          }))}
        />

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nombre, IMEI o placa" />
        </View>

        {loading ? (
          <LoadingState text="Cargando dispositivos..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(d) => d.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={<EmptyState title="Sin dispositivos" subtitle="Registra tu primer GPS o app móvil con el botón +" icon={Smartphone} />}
          />
        )}
      </View>

      <Fab onPress={openCreate} />

      {/* Detalle */}
      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name || 'Detalle'}
      >
        {detail && (
          <View>
            <View style={styles.detailBadgeRow}>
              <Badge
                label={isConnected(detail) ? 'Conectado' : 'Sin actividad'}
                variant={isConnected(detail) ? 'success' : 'neutral'}
              />
            </View>
            <InfoRow label="Nombre" value={detail.name} />
            <InfoRow label="Identificador (IMEI)" value={detail.imei} />
            <InfoRow label="Modelo" value={detail.model || '—'} />
            <InfoRow label="Vehículo" value={detail.vehiculo ? `${detail.vehiculo.placa}${detail.vehiculo.marca_modelo ? ` · ${detail.vehiculo.marca_modelo}` : ''}` : 'Sin asignar'} />
            <InfoRow label="Última conexión" value={fmtDate(detail.last_activity)} />
            <InfoRow label="Latitud" value={detailPos?.latitude != null ? String(detailPos.latitude) : '—'} />
            <InfoRow label="Longitud" value={detailPos?.longitude != null ? String(detailPos.longitude) : '—'} />
            <InfoRow label="Velocidad" value={detailPos?.speed != null ? `${detailPos.speed} km/h` : '—'} />
            <InfoRow label="Batería" value={detailPos?.battery != null ? `${detailPos.battery}%` : '—'} />

            <View style={styles.tokenBox}>
              <View style={styles.tokenHeader}>
                <MapPin size={14} color={C.textMuted} />
                <Text style={styles.tokenLabel}>Token de acceso</Text>
              </View>
              <Text style={styles.tokenValue} selectable>{detail.token}</Text>
            </View>
          </View>
        )}
      </FormModal>

      {/* Crear */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title="Nuevo dispositivo"
        footer={<Button title="Registrar dispositivo" loading={saving} onPress={save} />}
      >
        <FormField
          label="Nombre del dispositivo *"
          value={newName}
          onChangeText={setNewName}
          placeholder="Ej: Celular Juan Pérez"
        />
        <FormField
          label="Identificador (IMEI o ID único) *"
          value={newImei}
          onChangeText={setNewImei}
          placeholder="Ej: imei-123456789"
          autoCapitalize="none"
        />

        <Text style={styles.selectLabel}>Asignar vehículo (opcional)</Text>
        <View style={styles.chipWrap}>
          <TouchableOpacity
            style={[styles.chip, selectedVehiculo === '' && styles.chipActive]}
            onPress={() => setSelectedVehiculo('')}
          >
            <Text style={[styles.chipText, selectedVehiculo === '' && styles.chipTextActive]}>Sin asignar</Text>
          </TouchableOpacity>
          {vehiculos.map((v) => {
            const active = selectedVehiculo === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedVehiculo(v.id)}
              >
                <Truck size={13} color={active ? C.textOnPrimary : C.textMuted} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{v.placa}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormModal>
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
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  name: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  imei: { fontSize: 12, color: C.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaGood: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaGoodText: { fontSize: 12, color: C.primary, fontWeight: '600' },
  metaMuted: { fontSize: 12, color: C.textFaint, fontStyle: 'italic' },
  lastConn: { fontSize: 11, color: C.textFaint, marginTop: 6 },
  detailBadgeRow: { flexDirection: 'row', marginBottom: S.sm },
  tokenBox: {
    marginTop: S.md,
    backgroundColor: C.surfaceAlt,
    borderRadius: Theme.radius.md,
    padding: S.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  tokenHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tokenLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  tokenValue: { fontSize: 13, color: C.primary, fontWeight: '600' },
  selectLabel: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: S.md,
    paddingVertical: 8,
    borderRadius: Theme.radius.full,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  chipTextActive: { color: C.textOnPrimary },
});
