import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Receipt, Calendar, Pencil, Trash2, Coins, ClipboardList, Clock } from 'lucide-react-native';
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
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';
import type { Vehiculo } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

// El backend expone /peajes (multas/peajes de la flota). La lista responde
// con la forma paginada { items, total, counts }.
interface Peaje {
  id: string;
  id_multa?: string | null;
  estado?: string | null;
  fecha?: string | null;
  hora?: string | null;
  targa?: string | null;
  monto?: number | null;
  trabajador_id?: string | null;
  comentarios?: string | null;
  tipo?: string | null;
}

const ESTADOS = ['PENDIENTE', 'PAGADO', 'ANULADO'] as const;
type Estado = (typeof ESTADOS)[number];

const TIPOS = ['Peaje', 'Multa'] as const;

function estadoVariant(estado?: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  switch ((estado || '').toUpperCase()) {
    case 'PAGADO':
      return 'success';
    case 'PENDIENTE':
      return 'warning';
    case 'ANULADO':
      return 'neutral';
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
  estado: Estado;
  tipo: string;
  fecha: string;
  trabajador_id: string;
  comentarios: string;
};

const emptyForm: FormState = {
  targa: '',
  monto: '',
  estado: 'PENDIENTE',
  tipo: '',
  fecha: todayISO(),
  trabajador_id: '',
  comentarios: '',
};

export default function PeajesScreen() {
  const { user } = useAuth();
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const moneda = user?.moneda;

  const [items, setItems] = useState<Peaje[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [detail, setDetail] = useState<Peaje | null>(null);
  const [editing, setEditing] = useState<Peaje | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, vRes] = await Promise.all([
        api.get('/peajes', { params: { take: 100 } }),
        api.get('/vehiculos').catch(() => ({ data: [] })),
      ]);
      // La lista viene como { items, total, counts }; toleramos también un array plano.
      const data = pRes.data;
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setVehiculos(Array.isArray(vRes.data) ? vRes.data : []);
    } catch (e) {
      console.error('Error cargando peajes', e);
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
      (p) =>
        p.targa?.toLowerCase().includes(q) ||
        p.tipo?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const stats = useMemo(() => {
    const total = items.length;
    const montoTotal = items.reduce((s, p) => s + Number(p.monto || 0), 0);
    const pendientes = items.filter((p) => (p.estado || '').toUpperCase() === 'PENDIENTE').length;
    return { total, montoTotal, pendientes };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEdit = (p: Peaje) => {
    setEditing(p);
    setForm({
      targa: p.targa || '',
      monto: p.monto != null ? String(p.monto) : '',
      estado: (ESTADOS.includes((p.estado || '').toUpperCase() as Estado)
        ? ((p.estado || '').toUpperCase() as Estado)
        : 'PENDIENTE'),
      tipo: p.tipo || '',
      fecha: p.fecha ? String(p.fecha).split('T')[0] : todayISO(),
      trabajador_id: p.trabajador_id || '',
      comentarios: p.comentarios || '',
    });
    setDetail(null);
    setFormVisible(true);
  };

  const save = async () => {
    if (!form.targa.trim()) {
      Alert.alert('Falta la placa', 'La placa (targa) es obligatoria.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        targa: form.targa.trim(),
        monto: form.monto,
        estado: form.estado,
        tipo: form.tipo || undefined,
        fecha: form.fecha || undefined,
        trabajador_id: form.trabajador_id || undefined,
        comentarios: form.comentarios || undefined,
      };
      if (editing) {
        await api.patch(`/peajes/${editing.id}`, payload);
      } else {
        await api.post('/peajes', payload);
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: Peaje) => {
    Alert.alert('Eliminar registro', `¿Eliminar el peaje/multa de ${p.targa || 'la unidad'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/peajes/${p.id}`);
            setDetail(null);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const renderCard = ({ item: p }: { item: Peaje }) => (
    <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(p)}>
      <View style={styles.cardIcon}>
        <Receipt size={20} color={C.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.plate}>{p.targa || 'Sin placa'}</Text>
          <Badge label={p.estado || 'N/A'} variant={estadoVariant(p.estado)} />
        </View>
        <Text style={styles.desc} numberOfLines={1}>
          {p.tipo || 'Sin tipo'}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={13} color={C.textFaint} />
            <Text style={styles.meta}>{formatDate(p.fecha)}</Text>
          </View>
          {p.trabajador_id ? <Text style={styles.meta}>· {p.trabajador_id}</Text> : null}
        </View>
      </View>
      <Text style={styles.cost} numberOfLines={1}>{formatMoney(p.monto, moneda)}</Text>
    </TouchableOpacity>
  );

  return (
    <Screen>
      <AppHeader title="Peajes y multas" subtitle={`${items.length} registros`} back />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Registros" value={stats.total} icon={ClipboardList} color={C.primary} />
          <StatCard label="Monto total" value={formatMoney(stats.montoTotal, moneda)} icon={Coins} color={C.success} />
          <StatCard label="Pendientes" value={stats.pendientes} icon={Clock} color={C.warning} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por placa o tipo" />
        </View>

        {loading ? (
          <LoadingState text="Cargando peajes..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                title="Sin registros"
                subtitle="Registra el primer peaje o multa con el botón +"
                icon={Receipt}
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
          detail && (
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <Button title="Editar" icon={Pencil} variant="secondary" style={{ flex: 1 }} onPress={() => detail && openEdit(detail)} />
              <Button title="Eliminar" icon={Trash2} variant="danger" style={{ flex: 1 }} onPress={() => detail && remove(detail)} />
            </View>
          )
        }
      >
        {detail && (
          <View>
            <View style={{ marginBottom: S.md }}>
              <Badge label={detail.estado || 'N/A'} variant={estadoVariant(detail.estado)} />
            </View>
            <InfoRow label="Placa" value={detail.targa} />
            <InfoRow label="Tipo" value={detail.tipo} />
            <InfoRow label="Monto" value={formatMoney(detail.monto, moneda)} />
            <InfoRow label="Estado" value={detail.estado} />
            <InfoRow label="Fecha" value={formatDate(detail.fecha)} />
            <InfoRow label="Trabajador" value={detail.trabajador_id} />
            <InfoRow label="N° multa" value={detail.id_multa} />
            <View style={styles.detailDesc}>
              <Text style={styles.detailDescLabel}>Comentarios</Text>
              <Text style={styles.detailDescText}>{detail.comentarios || '—'}</Text>
            </View>
          </View>
        )}
      </FormModal>

      {/* Crear / editar */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editing ? 'Editar registro' : 'Nuevo peaje / multa'}
        footer={<Button title={editing ? 'Guardar cambios' : 'Registrar'} loading={saving} onPress={save} />}
      >
        {vehiculos.length > 0 && (
          <Select
            label="Vehículo"
            value={form.targa}
            onChange={(v) => setForm({ ...form, targa: v })}
            options={vehiculos.map((v) => ({ value: v.placa, label: v.placa }))}
            placeholder="Seleccionar vehículo"
          />
        )}

        <FormField
          label="Placa *"
          value={form.targa}
          onChangeText={(t) => setForm({ ...form, targa: t })}
          placeholder="ABC-123"
          autoCapitalize="characters"
        />

        <Select
          label="Estado"
          value={form.estado}
          onChange={(v) => setForm({ ...form, estado: v as Estado })}
          options={ESTADOS.map((e) => ({ value: e, label: e }))}
          placeholder="Seleccionar estado"
          searchable={false}
        />

        <Select
          label="Tipo"
          value={form.tipo}
          onChange={(v) => setForm({ ...form, tipo: v })}
          options={TIPOS.map((t) => ({ value: t, label: t }))}
          placeholder="Peaje / Multa"
          searchable={false}
        />
        <FormField
          label="Monto"
          value={form.monto}
          onChangeText={(t) => setForm({ ...form, monto: t })}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <DatePicker
          label="Fecha"
          value={form.fecha}
          onChange={(v) => setForm({ ...form, fecha: v })}
        />
        <FormField
          label="Trabajador (código)"
          value={form.trabajador_id}
          onChangeText={(t) => setForm({ ...form, trabajador_id: t })}
          placeholder="Código del trabajador"
        />
        <FormField
          label="Comentarios"
          value={form.comentarios}
          onChangeText={(t) => setForm({ ...form, comentarios: t })}
          placeholder="Notas adicionales"
          multiline
        />
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
    backgroundColor: C.warningSoft,
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
