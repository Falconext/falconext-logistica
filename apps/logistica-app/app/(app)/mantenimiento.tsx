import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Wrench, Calendar, Pencil, Coins, ShieldAlert, ClipboardList, Gauge } from 'lucide-react-native';
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
import ImageUpload from '../../components/ImageUpload';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';
import type { Mantenimiento, Vehiculo } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

// El backend incluye la relación `vehiculo` en cada registro de /mantenimiento.
type MantenimientoItem = Mantenimiento & {
  vehiculo?: { placa?: string; marca_modelo?: string } | null;
};

const TIPOS = ['Preventivo', 'Correctivo', 'Emergencia'] as const;
type Tipo = (typeof TIPOS)[number];

const FILTROS = ['Todos', ...TIPOS] as const;

function tipoVariant(tipo?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (tipo) {
    case 'Preventivo':
      return 'success';
    case 'Correctivo':
      return 'warning';
    case 'Emergencia':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatDate(v?: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

type FormState = {
  vehiculo_id: string;
  tipo: Tipo;
  fecha: string;
  descripcion: string;
  costo: string;
  taller: string;
  kilometraje: string;
  evidence_url: string;
};

const emptyForm: FormState = {
  vehiculo_id: '',
  tipo: 'Preventivo',
  fecha: todayISO(),
  descripcion: '',
  costo: '',
  taller: '',
  kilometraje: '',
  evidence_url: '',
};

export default function MantenimientoScreen() {
  const { user } = useAuth();
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [items, setItems] = useState<MantenimientoItem[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todos');

  const [formVisible, setFormVisible] = useState(false);
  const [detail, setDetail] = useState<MantenimientoItem | null>(null);
  const [editing, setEditing] = useState<MantenimientoItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, vRes] = await Promise.all([
        api.get('/mantenimiento'),
        api.get('/vehiculos'),
      ]);
      setItems(Array.isArray(mRes.data) ? mRes.data : []);
      setVehiculos(Array.isArray(vRes.data) ? vRes.data : []);
    } catch (e) {
      console.error('Error cargando mantenimiento', e);
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
      items.filter((m) => {
        if (filtro !== 'Todos' && m.tipo !== filtro) return false;
        const q = query.toLowerCase();
        if (!q) return true;
        return (
          m.vehiculo?.placa?.toLowerCase().includes(q) ||
          m.descripcion?.toLowerCase().includes(q) ||
          m.taller?.toLowerCase().includes(q)
        );
      }),
    [items, filtro, query]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const costoTotal = items.reduce((s, m) => s + Number(m.costo || 0), 0);
    const emergencias = items.filter((m) => m.tipo === 'Emergencia').length;
    return { total, costoTotal, emergencias };
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Todos: items.length };
    TIPOS.forEach((t) => (c[t] = items.filter((m) => m.tipo === t).length));
    return c;
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEdit = (m: MantenimientoItem) => {
    setEditing(m);
    setForm({
      vehiculo_id: m.vehiculo_id || '',
      tipo: (TIPOS.includes(m.tipo as Tipo) ? (m.tipo as Tipo) : 'Preventivo'),
      fecha: m.fecha ? String(m.fecha).split('T')[0] : todayISO(),
      descripcion: m.descripcion || '',
      costo: m.costo != null ? String(m.costo) : '',
      taller: m.taller || '',
      kilometraje: m.kilometraje != null ? String(m.kilometraje) : '',
      evidence_url: m.evidence_url || '',
    });
    setDetail(null);
    setFormVisible(true);
  };

  const vehiculoLabel = (id?: string) => {
    const v = vehiculos.find((x) => x.id === id);
    return v ? `${v.placa}${v.marca_modelo ? ` · ${v.marca_modelo}` : ''}` : id || '—';
  };

  const save = async () => {
    if (!editing && !form.vehiculo_id) {
      Alert.alert('Falta el vehículo', 'Selecciona un vehículo.');
      return;
    }
    if (!form.descripcion.trim()) {
      Alert.alert('Falta la descripción', 'Describe el mantenimiento.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        // El backend solo permite actualizar costo, descripción, taller y kilometraje.
        await api.patch(`/mantenimiento/${editing.id}`, {
          costo: form.costo,
          descripcion: form.descripcion,
          taller: form.taller,
          kilometraje: form.kilometraje || undefined,
          evidence_url: form.evidence_url || undefined,
        });
      } else {
        await api.post('/mantenimiento', {
          vehiculo_id: form.vehiculo_id,
          tipo: form.tipo,
          fecha: form.fecha,
          descripcion: form.descripcion,
          costo: form.costo || '0',
          taller: form.taller,
          kilometraje: form.kilometraje,
          evidence_url: form.evidence_url || undefined,
        });
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el mantenimiento.');
    } finally {
      setSaving(false);
    }
  };

  const renderCard = ({ item: m }: { item: MantenimientoItem }) => (
    <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(m)}>
      <View style={styles.cardIcon}>
        <Wrench size={20} color={C.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.plate}>{m.vehiculo?.placa || 'Sin vehículo'}</Text>
          <Badge label={m.tipo || 'N/A'} variant={tipoVariant(m.tipo)} />
        </View>
        <Text style={styles.desc} numberOfLines={2}>
          {m.descripcion || 'Sin descripción'}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={13} color={C.textFaint} />
            <Text style={styles.meta}>{formatDate(m.fecha)}</Text>
          </View>
          {m.taller ? <Text style={styles.meta}>· {m.taller}</Text> : null}
          {m.kilometraje != null ? (
            <Text style={styles.meta}>· {Number(m.kilometraje).toLocaleString('es-ES')} km</Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.cost} numberOfLines={1}>{formatMoney(m.costo, user?.moneda)}</Text>
    </TouchableOpacity>
  );

  return (
    <Screen>
      <AppHeader title="Mantenimiento" subtitle={`${items.length} registros de flota`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Registros" value={stats.total} icon={ClipboardList} color={C.primary} />
          <StatCard label="Costo total" value={formatMoney(stats.costoTotal, user?.moneda)} icon={Coins} color={C.success} />
          <StatCard label="Emergencias" value={stats.emergencias} icon={ShieldAlert} color={C.danger} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por placa o descripción" />
        </View>

        <View style={styles.filterRow}>
          {FILTROS.map((f) => {
            const active = filtro === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFiltro(f)}
                activeOpacity={0.8}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>
                    {counts[f] ?? 0}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <LoadingState text="Cargando mantenimientos..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(m) => m.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="Sin registros"
                subtitle="Registra el primer mantenimiento con el botón +"
                icon={Wrench}
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
        title={detail?.vehiculo?.placa || 'Detalle'}
        footer={
          detail && (
            <Button title="Editar" icon={Pencil} variant="secondary" onPress={() => detail && openEdit(detail)} />
          )
        }
      >
        {detail && (
          <View>
            <View style={{ marginBottom: S.md }}>
              <Badge label={detail.tipo || 'N/A'} variant={tipoVariant(detail.tipo)} />
            </View>
            <InfoRow label="Vehículo" value={detail.vehiculo?.placa} />
            <InfoRow label="Modelo" value={detail.vehiculo?.marca_modelo} />
            <InfoRow label="Tipo" value={detail.tipo} />
            <InfoRow label="Fecha" value={formatDate(detail.fecha)} />
            <InfoRow label="Costo" value={formatMoney(detail.costo, user?.moneda)} />
            <InfoRow label="Taller" value={detail.taller} />
            <InfoRow
              label="Kilometraje"
              value={detail.kilometraje != null ? `${Number(detail.kilometraje).toLocaleString('es-ES')} km` : '—'}
            />
            <View style={styles.detailDesc}>
              <Text style={styles.detailDescLabel}>Descripción</Text>
              <Text style={styles.detailDescText}>{detail.descripcion || '—'}</Text>
            </View>
          </View>
        )}
      </FormModal>

      {/* Crear / editar */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editing ? 'Editar mantenimiento' : 'Nuevo mantenimiento'}
        footer={<Button title={editing ? 'Guardar cambios' : 'Registrar'} loading={saving} onPress={save} />}
      >
        {!editing && (
          <>
            <Select
              label="Vehículo *"
              value={form.vehiculo_id}
              onChange={(v) => setForm({ ...form, vehiculo_id: v })}
              options={vehiculos.map((v) => ({
                value: v.id,
                label: `${v.placa}${v.marca_modelo ? ` · ${v.marca_modelo}` : ''}`,
              }))}
              placeholder="Seleccionar vehículo"
            />

            <Select
              label="Tipo"
              value={form.tipo}
              onChange={(v) => setForm({ ...form, tipo: v as Tipo })}
              options={TIPOS.map((t) => ({ value: t, label: t }))}
              placeholder="Seleccionar tipo"
              searchable={false}
            />

            <DatePicker
              label="Fecha"
              value={form.fecha}
              onChange={(v) => setForm({ ...form, fecha: v })}
            />
          </>
        )}

        {editing && (
          <View style={styles.editHint}>
            <Gauge size={15} color={C.textMuted} />
            <Text style={styles.editHintText}>
              {vehiculoLabel(editing.vehiculo_id)} · {editing.tipo}
            </Text>
          </View>
        )}

        <FormField
          label="Descripción *"
          value={form.descripcion}
          onChangeText={(t) => setForm({ ...form, descripcion: t })}
          placeholder="Detalles del mantenimiento"
          multiline
        />
        <FormField
          label={`Costo (${formatMoney(0, user?.moneda).split(' ')[0]})`}
          value={form.costo}
          onChangeText={(t) => setForm({ ...form, costo: t })}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <FormField
          label="Taller / Proveedor"
          value={form.taller}
          onChangeText={(t) => setForm({ ...form, taller: t })}
          placeholder="Nombre del taller"
        />
        <FormField
          label="Kilometraje"
          value={form.kilometraje}
          onChangeText={(t) => setForm({ ...form, kilometraje: t })}
          placeholder="km"
          keyboardType="numeric"
        />
        <Text style={styles.selectLabel}>Evidencia</Text>
        <ImageUpload
          variant="wide"
          label="Subir evidencia"
          value={form.evidence_url}
          onChange={(url) => setForm({ ...form, evidence_url: url })}
          onClear={() => setForm({ ...form, evidence_url: '' })}
        />
      </FormModal>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: S.md,
    paddingVertical: 7,
    borderRadius: Theme.radius.full,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  chipTextActive: { color: C.textOnPrimary },
  chipCount: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: Theme.radius.full,
    backgroundColor: C.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipCountText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  chipCountTextActive: { color: C.textOnPrimary },
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
    backgroundColor: C.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  plate: { fontSize: 16, fontWeight: '700', color: C.text, flexShrink: 1 },
  desc: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: C.textFaint },
  cost: { fontSize: 15, fontWeight: '700', color: C.text },
  detailDesc: { marginTop: S.md },
  detailDescLabel: { fontSize: 13, color: C.textMuted, marginBottom: 4 },
  detailDescText: { fontSize: 15, color: C.text, lineHeight: 21 },
  selectLabel: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 6 },
  selectWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md },
  selectEmpty: { fontSize: 13, color: C.textFaint, fontStyle: 'italic' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: S.md,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  optionActive: { backgroundColor: C.primary, borderColor: C.primary },
  optionText: { fontSize: 13, fontWeight: '500', color: C.text },
  optionTextActive: { color: C.textOnPrimary },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: S.md,
    borderRadius: Theme.radius.md,
    backgroundColor: C.surfaceAlt,
    marginBottom: S.md,
  },
  editHintText: { fontSize: 13, color: C.textMuted, flexShrink: 1 },
});
