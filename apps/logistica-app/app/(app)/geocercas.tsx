import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MapPin, Ruler, Layers, Circle as CircleIcon } from 'lucide-react-native';
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

// Contrato real del backend (ver apps/web/app/geocercas): /gps/geofences
interface Geofence {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  radius: number; // metros
}

interface FormState {
  name: string;
  description: string;
  latitude: string;
  longitude: string;
  radius: string;
}

const empty: FormState = {
  name: '',
  description: '',
  latitude: '-12.0464', // Lima por defecto
  longitude: '-77.0428',
  radius: '500',
};

function fmtCoord(n?: number): string {
  return typeof n === 'number' ? n.toFixed(5) : '—';
}

export default function GeocercasScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [items, setItems] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [detail, setDetail] = useState<Geofence | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/gps/geofences');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error cargando geocercas', e);
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

  const filtered = useMemo(
    () =>
      items.filter(
        (g) =>
          g.name?.toLowerCase().includes(query.toLowerCase()) ||
          g.description?.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const radioProm = total
      ? Math.round(items.reduce((acc, g) => acc + (g.radius || 0), 0) / total)
      : 0;
    const cobertura = Math.round(
      items.reduce((acc, g) => acc + Math.PI * Math.pow((g.radius || 0) / 1000, 2), 0)
    );
    return { total, radioProm, cobertura };
  }, [items]);

  // Geocercas con coordenadas válidas para el mapa.
  const located = useMemo(
    () =>
      items.filter(
        (g) => Number.isFinite(g.latitude) && Number.isFinite(g.longitude)
      ),
    [items]
  );

  const initialRegion = useMemo(() => {
    if (located.length === 0) {
      return { latitude: -12.0464, longitude: -77.0428, latitudeDelta: 0.5, longitudeDelta: 0.5 };
    }
    const lats = located.map((g) => g.latitude);
    const lngs = located.map((g) => g.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    // Amplía el encuadre según el radio máximo (m -> grados aprox).
    const maxRadiusDeg = Math.max(...located.map((g) => (g.radius || 0) / 111000), 0);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, maxRadiusDeg * 3, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.4, maxRadiusDeg * 3, 0.02),
    };
  }, [located]);

  const openCreate = () => {
    setForm(empty);
    setFormVisible(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert('Falta el nombre', 'El nombre de la geocerca es obligatorio.');
      return;
    }
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    const radius = Number(form.radius);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      Alert.alert('Coordenadas inválidas', 'Latitud y longitud deben ser números.');
      return;
    }
    if (Number.isNaN(radius) || radius <= 0) {
      Alert.alert('Radio inválido', 'El radio debe ser un número mayor a 0 (en metros).');
      return;
    }
    setSaving(true);
    try {
      await api.post('/gps/geofences', {
        name: form.name.trim(),
        description: form.description.trim(),
        latitude: lat,
        longitude: lng,
        radius,
      });
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo crear la geocerca.');
    } finally {
      setSaving(false);
    }
  };

  const renderCard = ({ item: g }: { item: Geofence }) => (
    <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(g)}>
      <View style={styles.cardIcon}>
        <MapPin size={20} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
          <Badge label="Activa" variant="success" />
        </View>
        <Text style={styles.desc} numberOfLines={1}>{g.description || 'Sin descripción'}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ruler size={13} color={C.textFaint} />
            <Text style={styles.meta}>{g.radius} m</Text>
          </View>
          <Text style={styles.meta}>{fmtCoord(g.latitude)}, {fmtCoord(g.longitude)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Screen>
      <AppHeader title="Geocercas" subtitle={`${items.length} zonas de control`} back />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Zonas" value={stats.total} icon={Layers} color={C.primary} />
          <StatCard label="Radio prom." value={`${stats.radioProm} m`} icon={CircleIcon} color={C.info} />
          <StatCard label="Cobertura" value={`${stats.cobertura} km²`} icon={Ruler} color={C.success} />
        </View>

        <MapboxWebView
          style={styles.map}
          fit
          mapStyle="streets"
          circles={located.map((g) => ({
            lng: g.longitude,
            lat: g.latitude,
            radius: g.radius || 0,
            color: '#2563EB',
          }))}
          markers={located.map((g) => ({
            lng: g.longitude,
            lat: g.latitude,
            color: '#2563EB',
            popup: `<b>${g.name}</b><br/>${g.description || (g.radius + ' m')}`,
          }))}
        />

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nombre o descripción" />
        </View>

        {loading ? (
          <LoadingState text="Cargando geocercas..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(g) => g.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState title="Sin geocercas" subtitle="Crea tu primera zona de control con el botón +" icon={MapPin} />
            }
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
            <InfoRow label="Nombre" value={detail.name} />
            <InfoRow label="Descripción" value={detail.description || '—'} />
            <InfoRow label="Radio" value={`${detail.radius} m`} />
            <InfoRow label="Latitud" value={fmtCoord(detail.latitude)} />
            <InfoRow label="Longitud" value={fmtCoord(detail.longitude)} />
            <InfoRow label="Estado" value="Activa" />
          </View>
        )}
      </FormModal>

      {/* Crear */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title="Nueva geocerca"
        footer={<Button title="Crear geocerca" loading={saving} onPress={save} />}
      >
        <FormField
          label="Nombre *"
          value={form.name}
          onChangeText={(t) => setForm({ ...form, name: t })}
          placeholder="Ej. Almacén Central"
        />
        <FormField
          label="Descripción"
          value={form.description}
          onChangeText={(t) => setForm({ ...form, description: t })}
          placeholder="Zona de carga y descarga"
          multiline
        />
        <FormField
          label="Latitud"
          value={form.latitude}
          onChangeText={(t) => setForm({ ...form, latitude: t })}
          placeholder="-12.0464"
          keyboardType="numeric"
        />
        <FormField
          label="Longitud"
          value={form.longitude}
          onChangeText={(t) => setForm({ ...form, longitude: t })}
          placeholder="-77.0428"
          keyboardType="numeric"
        />
        <FormField
          label="Radio (metros)"
          value={form.radius}
          onChangeText={(t) => setForm({ ...form, radius: t })}
          placeholder="500"
          keyboardType="numeric"
        />
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
  desc: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: 6, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: C.textFaint },
});
