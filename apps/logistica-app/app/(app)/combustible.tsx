import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Fuel, Calendar, Pencil, Trash2, Coins, ClipboardList, User } from 'lucide-react-native';
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
import api from '../../services/api';
import { formatMoney } from '../../constants/currency';
import { useAuth } from '../../context/AuthContext';
import type { Trabajador } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

// Modelo de un registro de combustible (según el backend /combustible).
type Combustible = {
  id: string;
  id_registro?: string | null;
  trabajador_id?: string | null;
  fecha?: string | null;
  monto?: number | null;
  targa?: string | null;
  metodo?: string | null;
  area?: string | null;
  mes?: string | null;
  archivo?: string | null;
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
};

const emptyForm: FormState = {
  targa: '',
  monto: '',
  metodo: '',
  area: '',
  fecha: todayISO(),
  trabajador_id: '',
};

export default function CombustibleScreen() {
  const { user } = useAuth();
  const moneda = user?.moneda;

  const [items, setItems] = useState<Combustible[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
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
      const [cRes, tRes] = await Promise.all([
        api.get('/combustible', { params: { take: 100 } }),
        api.get('/trabajadores'),
      ]);
      const data = cRes.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? (Array.isArray(data.items) ? data.items.length : 0)));
      setSum(Number(data.sum ?? 0));
      setTrabajadores(Array.isArray(tRes.data) ? tRes.data : []);
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
    });
    setDetail(null);
    setFormVisible(true);
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
        trabajador_id: form.trabajador_id || undefined,
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

  const renderCard = ({ item: c }: { item: Combustible }) => (
    <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(c)}>
      <View style={styles.cardIcon}>
        <Fuel size={20} color={C.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.plate}>{c.targa || 'Sin placa'}</Text>
          {c.area ? <Badge label={c.area} variant={areaVariant(c.area)} /> : null}
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={13} color={C.textFaint} />
            <Text style={styles.meta}>{formatDate(c.fecha)}</Text>
          </View>
          {c.metodo ? <Text style={styles.meta}>· {c.metodo}</Text> : null}
        </View>
      </View>
      <Text style={styles.cost}>{formatMoney(c.monto, moneda)}</Text>
    </TouchableOpacity>
  );

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
        <FormField
          label="Placa (targa) *"
          value={form.targa}
          onChangeText={(t) => setForm({ ...form, targa: t })}
          placeholder="ABC-123"
          autoCapitalize="characters"
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

        <Text style={styles.selectLabel}>Área</Text>
        <View style={styles.selectWrap}>
          {AREAS.map((a) => {
            const active = form.area === a;
            return (
              <TouchableOpacity
                key={a}
                onPress={() => setForm({ ...form, area: active ? '' : a })}
                activeOpacity={0.8}
                style={[styles.option, active && styles.optionActive]}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{a}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FormField
          label="Fecha"
          value={form.fecha}
          onChangeText={(t) => setForm({ ...form, fecha: t })}
          placeholder="AAAA-MM-DD"
        />

        <Text style={styles.selectLabel}>Trabajador</Text>
        <View style={styles.selectWrap}>
          {trabajadores.length === 0 ? (
            <Text style={styles.selectEmpty}>No hay trabajadores disponibles</Text>
          ) : (
            trabajadores.map((t) => {
              const active = form.trabajador_id === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setForm({ ...form, trabajador_id: active ? '' : t.id })}
                  activeOpacity={0.8}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <User size={15} color={active ? C.textOnPrimary : C.textMuted} />
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {t.nombre_completo}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </FormModal>
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
