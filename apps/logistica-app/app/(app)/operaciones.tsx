import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Package,
  MapPin,
  Truck,
  User,
  Pencil,
  CalendarClock,
  ClipboardList,
  CheckCircle2,
  Navigation,
} from 'lucide-react-native';
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
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import api from '../../services/api';
import type { Programacion, Vehiculo, Trabajador } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ESTADO_META: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDIENTE: { label: 'Pendiente', variant: 'warning' },
  RETIRADO: { label: 'En ruta', variant: 'info' },
  ENTREGADO: { label: 'Entregado', variant: 'success' },
  ANULADO: { label: 'Anulado', variant: 'danger' },
  REPROGRAMADO: { label: 'Reprogramado', variant: 'neutral' },
};
const ALL_ESTADOS = Object.keys(ESTADO_META);
const estadoMeta = (e?: string) => ESTADO_META[e || 'PENDIENTE'] || ESTADO_META.PENDIENTE;

const fmtDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

const todayISO = () => new Date().toISOString().split('T')[0];

interface FormState {
  vehiculo_id: string;
  trabajador_id: string;
  cliente: string;
  retiro_lugar: string;
  retiro_fecha: string;
  retiro_hora: string;
  entrega_lugar: string;
  entrega_fecha: string;
  entrega_hora: string;
  nota: string;
  estado: string;
}

const emptyForm = (): FormState => ({
  vehiculo_id: '',
  trabajador_id: '',
  cliente: '',
  retiro_lugar: '',
  retiro_fecha: todayISO(),
  retiro_hora: '',
  entrega_lugar: '',
  entrega_fecha: todayISO(),
  entrega_hora: '',
  nota: '',
  estado: 'PENDIENTE',
});

export default function OperacionesScreen() {
  const [items, setItems] = useState<Programacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [detail, setDetail] = useState<Programacion | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Programacion | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/programacion');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error cargando operaciones', e);
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

  const loadResources = useCallback(async () => {
    try {
      const [vRes, wRes] = await Promise.all([
        api.get('/vehiculos'),
        api.get('/trabajadores'),
      ]);
      setVehiculos(Array.isArray(vRes.data) ? vRes.data : []);
      setTrabajadores(Array.isArray(wRes.data) ? wRes.data : []);
    } catch (e) {
      console.error('Error cargando recursos', e);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const data = items.filter(
      (r) =>
        (r.cliente?.toLowerCase() || '').includes(q) ||
        (r.vehiculo_id?.toLowerCase() || '').includes(q) ||
        (r.lugar_entrega?.toLowerCase() || '').includes(q) ||
        (r.lugar_retiro?.toLowerCase() || '').includes(q) ||
        (r.id_programacion?.toLowerCase() || '').includes(q)
    );
    return data.sort(
      (a, b) =>
        new Date(b.fecha_entrega || b.fecha).getTime() -
        new Date(a.fecha_entrega || a.fecha).getTime()
    );
  }, [items, query]);

  const stats = useMemo(() => {
    const total = items.length;
    const pendientes = items.filter((r) => (r.estado || 'PENDIENTE') === 'PENDIENTE').length;
    const enRuta = items.filter((r) => r.estado === 'RETIRADO').length;
    const entregados = items.filter((r) => r.estado === 'ENTREGADO').length;
    return { total, pendientes, enRuta, entregados };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDetail(null);
    setFormVisible(true);
    loadResources();
  };

  const openEdit = (r: Programacion) => {
    setEditing(r);
    setForm({
      vehiculo_id: r.vehiculo_id || '',
      trabajador_id: r.trabajador_id || '',
      cliente: r.cliente || '',
      retiro_lugar: r.lugar_retiro || '',
      retiro_fecha: r.fecha_retiro ? r.fecha_retiro.split('T')[0] : todayISO(),
      retiro_hora: r.hora_retiro || '',
      entrega_lugar: r.lugar_entrega || '',
      entrega_fecha: r.fecha_entrega ? r.fecha_entrega.split('T')[0] : todayISO(),
      entrega_hora: '',
      nota: r.nota || '',
      estado: r.estado || 'PENDIENTE',
    });
    setDetail(null);
    setFormVisible(true);
    loadResources();
  };

  const save = async () => {
    if (!form.vehiculo_id) {
      Alert.alert('Falta el vehículo', 'Selecciona un vehículo para la operación.');
      return;
    }
    if (!form.retiro_lugar.trim() || !form.entrega_lugar.trim()) {
      Alert.alert('Faltan direcciones', 'Indica el lugar de retiro y de entrega.');
      return;
    }
    setSaving(true);
    try {
      const toIso = (fecha: string, hora: string, fallback: string) => {
        if (!fecha) return null;
        const dt = new Date(`${fecha}T${hora || fallback}:00`);
        return isNaN(dt.getTime()) ? null : dt.toISOString();
      };
      const payload: Record<string, any> = {
        vehiculo_id: form.vehiculo_id,
        trabajador_id: form.trabajador_id,
        cliente: form.cliente,
        lugar_retiro: form.retiro_lugar,
        fecha_retiro: toIso(form.retiro_fecha, form.retiro_hora, '00:00'),
        hora_retiro: form.retiro_hora,
        lugar_entrega: form.entrega_lugar,
        fecha_entrega: toIso(form.entrega_fecha, form.entrega_hora, '23:59'),
        nota: form.nota,
      };
      if (editing) {
        payload.estado = form.estado;
        await api.patch(`/programacion/${editing.id}`, payload);
      } else {
        await api.post('/programacion', payload);
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar la operación.');
    } finally {
      setSaving(false);
    }
  };

  const renderCard = ({ item: r }: { item: Programacion }) => {
    const meta = estadoMeta(r.estado);
    return (
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(r)}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Package size={18} color={C.primary} />
          </View>
          <Text style={styles.client} numberOfLines={1}>
            {r.cliente || r.id_programacion || 'Operación'}
          </Text>
          <Badge label={meta.label} variant={meta.variant} />
        </View>

        <View style={styles.routeRow}>
          <View style={styles.routeSide}>
            <MapPin size={13} color={C.success} />
            <Text style={styles.routeText} numberOfLines={1}>
              {r.lugar_retiro?.split(',')[0] || 'Origen'}
            </Text>
          </View>
          <Navigation size={13} color={C.textFaint} />
          <View style={[styles.routeSide, { justifyContent: 'flex-end' }]}>
            <MapPin size={13} color={C.danger} />
            <Text style={[styles.routeText, { textAlign: 'right' }]} numberOfLines={1}>
              {r.lugar_entrega?.split(',')[0] || 'Destino'}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Truck size={12} color={C.textFaint} />
            <Text style={styles.meta}>{r.vehiculo_id || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <User size={12} color={C.textFaint} />
            <Text style={styles.meta} numberOfLines={1}>
              {r.trabajador_id || 'Sin asignar'}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <CalendarClock size={12} color={C.textFaint} />
            <Text style={styles.meta}>{fmtDate(r.fecha_entrega || r.fecha)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      <AppHeader title="Operaciones" subtitle={`${items.length} operaciones programadas`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={ClipboardList} color={C.primary} />
          <StatCard label="Pendientes" value={stats.pendientes} icon={CalendarClock} color={C.warning} />
          <StatCard label="En ruta" value={stats.enRuta} icon={Navigation} color={C.info} />
          <StatCard label="Entregados" value={stats.entregados} icon={CheckCircle2} color={C.success} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar cliente, placa, destino..." />
        </View>

        {loading ? (
          <LoadingState text="Cargando operaciones..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(r) => r.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="Sin operaciones"
                subtitle="Programa tu primera operación con el botón +"
                icon={Package}
              />
            }
          />
        )}
      </View>

      <Fab onPress={openCreate} />

      {/* Detalle */}
      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.cliente || 'Operación'}
        footer={
          detail && (
            <Button title="Editar" icon={Pencil} variant="secondary" onPress={() => detail && openEdit(detail)} />
          )
        }
      >
        {detail && (
          <View>
            <View style={{ marginBottom: S.md }}>
              <Badge label={estadoMeta(detail.estado).label} variant={estadoMeta(detail.estado).variant} />
            </View>
            <InfoRow label="ID" value={detail.id_programacion} />
            <InfoRow label="Cliente" value={detail.cliente} />
            <InfoRow label="Origen (retiro)" value={detail.lugar_retiro} />
            <InfoRow label="Fecha retiro" value={fmtDate(detail.fecha_retiro || detail.fecha)} />
            <InfoRow label="Hora retiro" value={detail.hora_retiro} />
            <InfoRow label="Destino (entrega)" value={detail.lugar_entrega} />
            <InfoRow label="Fecha entrega" value={fmtDate(detail.fecha_entrega)} />
            <InfoRow label="ETA" value={detail.eta} />
            <InfoRow label="Vehículo" value={detail.vehiculo_id} />
            <InfoRow label="Conductor" value={detail.trabajador_id || 'Sin asignar'} />
            <InfoRow label="Nota" value={detail.nota} />
          </View>
        )}
      </FormModal>

      {/* Crear / editar */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editing ? 'Editar operación' : 'Nueva operación'}
        footer={<Button title={editing ? 'Guardar cambios' : 'Crear operación'} loading={saving} onPress={save} />}
      >
        <Text style={styles.formSection}>Recursos y cliente</Text>

        <Select
          label="Vehículo *"
          value={form.vehiculo_id}
          onChange={(v) => setForm({ ...form, vehiculo_id: v })}
          options={vehiculos.map((v) => ({ value: v.placa, label: v.placa }))}
          placeholder="Selecciona un vehículo"
          searchable
        />

        <Select
          label="Conductor"
          value={form.trabajador_id}
          onChange={(v) => setForm({ ...form, trabajador_id: v })}
          options={trabajadores.map((w) => ({ value: w.nombre_completo, label: w.nombre_completo }))}
          placeholder="Selecciona un conductor"
          searchable
        />

        <FormField
          label="Cliente / Destinatario"
          value={form.cliente}
          onChangeText={(t) => setForm({ ...form, cliente: t })}
          placeholder="Nombre del cliente"
          style={{ marginTop: S.md }}
        />

        <Text style={styles.formSection}>Origen (retiro)</Text>
        <FormField
          label="Dirección de retiro *"
          value={form.retiro_lugar}
          onChangeText={(t) => setForm({ ...form, retiro_lugar: t })}
          placeholder="Ej: Av. Javier Prado Este 4200, Surco"
        />
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <DatePicker
              label="Fecha"
              value={form.retiro_fecha}
              onChange={(v) => setForm({ ...form, retiro_fecha: v })}
              placeholder="AAAA-MM-DD"
            />
          </View>
          <FormField
            label="Hora"
            value={form.retiro_hora}
            onChangeText={(t) => setForm({ ...form, retiro_hora: t })}
            placeholder="HH:MM"
            style={{ flex: 1 }}
          />
        </View>

        <Text style={styles.formSection}>Destino (entrega)</Text>
        <FormField
          label="Dirección de entrega *"
          value={form.entrega_lugar}
          onChangeText={(t) => setForm({ ...form, entrega_lugar: t })}
          placeholder="Ej: Aeropuerto Jorge Chávez, Callao"
        />
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <DatePicker
              label="Fecha"
              value={form.entrega_fecha}
              onChange={(v) => setForm({ ...form, entrega_fecha: v })}
              placeholder="AAAA-MM-DD"
            />
          </View>
          <FormField
            label="Hora"
            value={form.entrega_hora}
            onChangeText={(t) => setForm({ ...form, entrega_hora: t })}
            placeholder="HH:MM"
            style={{ flex: 1 }}
          />
        </View>

        {editing && (
          <>
            <Text style={styles.formSection}>Estado</Text>
            <Select
              label="Estado"
              value={form.estado}
              onChange={(v) => setForm({ ...form, estado: v })}
              options={ALL_ESTADOS.map((e) => ({ value: e, label: estadoMeta(e).label }))}
              placeholder="Selecciona un estado"
              searchable={false}
            />
          </>
        )}

        <FormField
          label="Notas adicionales"
          value={form.nota}
          onChangeText={(t) => setForm({ ...form, nota: t })}
          placeholder="Instrucciones especiales para el conductor..."
          multiline
          style={{ marginTop: S.md }}
        />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  card: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Theme.shadow.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  client: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
  },
  routeSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeText: { flex: 1, fontSize: 12, color: C.textMuted },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    marginTop: S.md,
    paddingTop: S.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  meta: { fontSize: 12, color: C.textFaint },
  formSection: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
    marginTop: S.lg,
    marginBottom: S.sm,
    textTransform: 'uppercase',
  },
  pickerLabel: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 6 },
  chipScroll: { marginBottom: S.sm },
  chip: {
    paddingHorizontal: S.md,
    paddingVertical: 8,
    borderRadius: Theme.radius.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    marginRight: S.sm,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.text, fontWeight: '500' },
  chipTextActive: { color: C.textOnPrimary },
  chipEmpty: { fontSize: 13, color: C.textFaint, paddingVertical: 8 },
  dateRow: { flexDirection: 'row', gap: S.md },
  estadoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
});
