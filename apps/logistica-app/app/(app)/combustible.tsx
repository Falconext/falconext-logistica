import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Fuel, Calendar, Pencil, Trash2, Coins, ClipboardList } from 'lucide-react-native';
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
import MultiFileUpload from '../../components/MultiFileUpload';
import ImageUpload from '../../components/ImageUpload';
import api from '../../services/api';
import { isChofer } from '../../constants/modules';
import { formatMoney } from '../../constants/currency';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { Trabajador, Vehiculo } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

// Modelo de un registro de combustible (según el backend /combustible).
type Combustible = {
  id: string;
  trabajador_id?: string | null;
  fecha?: string | null;
  monto?: number | null;
  targa?: string | null;
  metodo?: string | null;
  area?: string | null;
  mes?: string | null;
  archivo?: string | null;
  comprobantes?: string[];
  _origen?: string | null;
};

const AREAS = ['DHL', 'FARMACIA'] as const;

function areaVariant(area?: string | null): 'info' | 'success' | 'neutral' {
  switch (area) {
    case 'DHL':
      return 'info';
    case 'FARMACIA':
      return 'success';
    default:
      return 'neutral';
  }
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

type FormState = {
  targa: string;
  monto: string;
  metodo: string;
  area: string;
  fecha: string;
  trabajador_id: string;
  archivo: string;
};

const emptyForm: FormState = {
  targa: '',
  monto: '',
  metodo: '',
  area: '',
  fecha: todayISO(),
  trabajador_id: '',
  archivo: '',
};

export default function CombustibleScreen() {
  const { user } = useAuth();
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const moneda = user?.moneda;

  const [items, setItems] = useState<Combustible[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [detail, setDetail] = useState<Combustible | null>(null);
  const [editing, setEditing] = useState<Combustible | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cRes, tRes, vRes] = await Promise.all([
        api.get('/combustible', { params: { take: 100 } }),
        api.get('/trabajadores'),
        api.get('/vehiculos'),
      ]);
      const data = cRes.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? (Array.isArray(data.items) ? data.items.length : 0)));
      setSum(Number(data.sum ?? 0));
      setTrabajadores(Array.isArray(tRes.data) ? tRes.data : []);
      setVehiculos(Array.isArray(vRes.data) ? vRes.data : []);
    } catch (e) {
      console.error('Error cargando combustible', e);
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
    return items.filter(
      (c) =>
        c.targa?.toLowerCase().includes(q) ||
        c.area?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const trabajadorLabel = useCallback(
    (id?: string | null) => {
      if (!id) return '—';
      const t = trabajadores.find((x) => x.id === id);
      return t?.nombre_completo || id;
    },
    [trabajadores]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEdit = (c: Combustible) => {
    setEditing(c);
    setForm({
      targa: c.targa || '',
      monto: c.monto != null ? String(c.monto) : '',
      metodo: c.metodo || '',
      area: c.area || '',
      fecha: c.fecha ? String(c.fecha).split('T')[0] : todayISO(),
      trabajador_id: c.trabajador_id || '',
      archivo: c.archivo || '',
    });
    setDetail(null);
    setFormVisible(true);
  };

  // Sustento posterior de un combustible de operación (foto del ticket/código).
  const [sust, setSust] = useState<string[]>([]);
  const [savingSust, setSavingSust] = useState(false);
  const myCodes = [user?.trabajador_id, (user as any)?.trabajador_codigo].filter(Boolean) as string[];
  const canEditAll = !!user && !isChofer(user);
  const canSustentar = (c: Combustible | null) =>
    !!c && c._origen === 'operacion' && (canEditAll || (!!c.trabajador_id && myCodes.includes(c.trabajador_id)));
  const openDetail = (c: Combustible) => {
    setSust(c.comprobantes || []);
    setDetail(c);
  };
  const saveSustento = async () => {
    if (!detail) return;
    setSavingSust(true);
    try {
      await api.patch(`/programacion/gastos/${detail.id.replace(/^gasto:/, '')}/sustento`, { comprobantes: sust });
      setDetail(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el sustento.');
    } finally {
      setSavingSust(false);
    }
  };

  const save = async () => {
    if (!form.targa.trim()) {
      Alert.alert('Falta la placa', 'Ingresa la placa (targa) del vehículo.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        targa: form.targa.trim(),
        monto: form.monto,
        metodo: form.metodo,
        area: form.area,
        fecha: form.fecha,
        // Un chofer sin selector de conductor queda como dueño del registro (si no,
        // el backend lo guarda sin trabajador y él mismo deja de verlo en su lista).
        trabajador_id: form.trabajador_id || (isChofer(user) ? user?.trabajador_id : undefined) || undefined,
        archivo: form.archivo || null,
      };
      if (editing) {
        await api.patch(`/combustible/${editing.id}`, payload);
      } else {
        await api.post('/combustible', payload);
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: Combustible) => {
    Alert.alert('Eliminar registro', `¿Eliminar el consumo de ${c.targa || 'este vehículo'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/combustible/${c.id}`);
            setDetail(null);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const renderCard = ({ item: c }: { item: Combustible }) => {
    const isOperacion = c._origen === 'operacion';
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.card}
        onPress={() => openDetail(c)}
      >
        <View style={styles.cardIcon}>
          <Fuel size={20} color={C.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.plate}>{c.targa || 'Sin placa'}</Text>
            {isOperacion ? (
              <Badge label="Operación" variant="info" />
            ) : c.area ? (
              <Badge label={c.area} variant={areaVariant(c.area)} />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Calendar size={13} color={C.textFaint} />
              <Text style={styles.meta}>{formatDate(c.fecha)}</Text>
            </View>
            {c.metodo ? <Text style={styles.meta}>· {c.metodo}</Text> : null}
          </View>
        </View>
        <Text style={styles.cost} numberOfLines={1}>{formatMoney(c.monto, moneda)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      <AppHeader title="Combustible" subtitle={`${total} registros de consumo`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Registros" value={total} icon={ClipboardList} color={C.primary} />
          <StatCard label="Monto total" value={formatMoney(sum, moneda)} icon={Coins} color={C.success} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por placa o área" />
        </View>

        {loading ? (
          <LoadingState text="Cargando combustible..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="Sin registros"
                subtitle="Registra el primer consumo de combustible con el botón +"
                icon={Fuel}
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
        title={detail?.targa || 'Detalle'}
        footer={
          canSustentar(detail) ? (
            <Button title="Guardar sustento" loading={savingSust} onPress={saveSustento} />
          ) : detail && detail._origen !== 'operacion' ? (
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <Button title="Editar" icon={Pencil} variant="secondary" style={{ flex: 1 }} onPress={() => detail && openEdit(detail)} />
              <Button title="Eliminar" icon={Trash2} variant="danger" style={{ flex: 1 }} onPress={() => detail && remove(detail)} />
            </View>
          ) : null
        }
      >
        {detail && (
          <View>
            {detail.area ? (
              <View style={{ marginBottom: S.md }}>
                <Badge label={detail.area} variant={areaVariant(detail.area)} />
              </View>
            ) : null}
            <InfoRow label="Placa (targa)" value={detail.targa} />
            <InfoRow label="Monto" value={formatMoney(detail.monto, moneda)} />
            <InfoRow label="Método" value={detail.metodo} />
            <InfoRow label="Área" value={detail.area} />
            <InfoRow label="Fecha" value={formatDate(detail.fecha)} />
            <InfoRow label="Trabajador" value={trabajadorLabel(detail.trabajador_id)} />
            {detail._origen === 'operacion' ? (
              canSustentar(detail) ? (
                <View style={{ marginTop: S.md }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: S.xs }}>Sustento del combustible</Text>
                  <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: S.sm }}>Agrega la foto del ticket. El monto lo maneja el supervisor.</Text>
                  <MultiFileUpload value={sust} onChange={setSust} label="Agregar foto / comprobante" />
                </View>
              ) : (
                <InfoRow label="Comprobantes" value={`${(detail.comprobantes || []).length}`} />
              )
            ) : detail.archivo ? (
              <InfoRow label="Comprobante" value="Adjunto" />
            ) : null}
          </View>
        )}
      </FormModal>

      {/* Crear / editar */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editing ? 'Editar registro' : 'Nuevo registro'}
        footer={<Button title={editing ? 'Guardar cambios' : 'Registrar'} loading={saving} onPress={save} />}
      >
        <Select
          label="Placa (targa) *"
          value={form.targa}
          onChange={(v) => setForm({ ...form, targa: v })}
          options={vehiculos.map((v) => ({ value: v.placa, label: v.placa }))}
          placeholder="Selecciona un vehículo"
          searchable
        />
        <FormField
          label="Monto"
          value={form.monto}
          onChangeText={(t) => setForm({ ...form, monto: t })}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <FormField
          label="Método"
          value={form.metodo}
          onChangeText={(t) => setForm({ ...form, metodo: t })}
          placeholder="AUTOBOT / IP / etc."
        />

        <Select
          label="Área"
          value={form.area}
          onChange={(v) => setForm({ ...form, area: v })}
          options={AREAS.map((a) => ({ value: a, label: a }))}
          placeholder="Selecciona un área"
          searchable={false}
        />

        <DatePicker
          label="Fecha"
          value={form.fecha}
          onChange={(v) => setForm({ ...form, fecha: v })}
          placeholder="AAAA-MM-DD"
        />

        <Select
          label="Trabajador"
          value={form.trabajador_id}
          onChange={(v) => setForm({ ...form, trabajador_id: v })}
          options={trabajadores.map((t) => ({ value: t.id, label: t.nombre_completo }))}
          placeholder="Selecciona un trabajador"
          searchable
        />
        <ImageUpload label="Foto del ticket / comprobante" value={form.archivo || null} onChange={(url) => setForm({ ...form, archivo: url })} />
      </FormModal>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
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
    backgroundColor: C.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  plate: { fontSize: 16, fontWeight: '700', color: C.text, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: C.textFaint },
  cost: { fontSize: 15, fontWeight: '700', color: C.text },
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
});
