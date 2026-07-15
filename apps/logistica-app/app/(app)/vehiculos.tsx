import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Truck, Crosshair, Trash2, Pencil, ShieldAlert, Car, CheckCircle2 } from 'lucide-react-native';
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
import type { Vehiculo } from '../../types';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

const empty: Partial<Vehiculo> = {
  placa: '',
  marca_modelo: '',
  tipo_unidad: '',
  anio_fabricacion: undefined,
  estado_vehiculo: 'ACTIVO',
  poliza_seguro: '',
  fecha_vencimiento_seguro: '',
  revision_tecnica: '',
  kilometraje_actual: undefined,
  url_foto: '',
};

export default function VehiculosScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [items, setItems] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [detail, setDetail] = useState<Vehiculo | null>(null);
  const [editing, setEditing] = useState<Vehiculo | null>(null);
  const [form, setForm] = useState<Partial<Vehiculo>>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/vehiculos');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error cargando vehículos', e);
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
        (v) =>
          v.placa?.toLowerCase().includes(query.toLowerCase()) ||
          v.marca_modelo?.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  const stats = useMemo(() => {
    const activos = items.filter((v) => v.estado_vehiculo === 'ACTIVO').length;
    const sinSeguro = items.filter((v) => !v.poliza_seguro).length;
    return { total: items.length, activos, sinSeguro };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setFormVisible(true);
  };

  const openEdit = (v: Vehiculo) => {
    setEditing(v);
    setForm({ ...v });
    setDetail(null);
    setFormVisible(true);
  };

  const save = async () => {
    if (!form.placa?.trim()) {
      Alert.alert('Falta la placa', 'La placa es obligatoria.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        anio_fabricacion: form.anio_fabricacion ? Number(form.anio_fabricacion) : undefined,
        kilometraje_actual: form.kilometraje_actual ? Number(form.kilometraje_actual) : undefined,
      };
      if (editing) {
        await api.patch(`/vehiculos/${editing.id}`, payload);
      } else {
        await api.post('/vehiculos', payload);
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el vehículo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (v: Vehiculo) => {
    Alert.alert('Eliminar vehículo', `¿Eliminar la unidad ${v.placa}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/vehiculos/${v.id}`);
            setDetail(null);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const renderCard = ({ item: v }: { item: Vehiculo }) => {
    const activo = v.estado_vehiculo === 'ACTIVO';
    return (
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(v)}>
        <View style={styles.cardIcon}>
          <Truck size={20} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.plate}>{v.placa}</Text>
            <Badge label={activo ? 'Disponible' : 'No disponible'} variant={activo ? 'success' : 'warning'} />
          </View>
          <Text style={styles.model}>{v.marca_modelo || 'Sin modelo'}{v.tipo_unidad ? ` · ${v.tipo_unidad}` : ''}</Text>
          <View style={styles.metaRow}>
            {!v.poliza_seguro ? (
              <View style={styles.metaBad}>
                <ShieldAlert size={13} color={C.danger} />
                <Text style={styles.metaBadText}>Sin seguro</Text>
              </View>
            ) : (
              <Text style={styles.meta}>Seguro: {v.poliza_seguro}</Text>
            )}
            {v.anio_fabricacion ? <Text style={styles.meta}>· {v.anio_fabricacion}</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      <AppHeader title="Vehículos" subtitle={`${items.length} unidades en flota`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={Car} color={C.primary} />
          <StatCard label="Activos" value={stats.activos} icon={CheckCircle2} color={C.success} />
          <StatCard label="Sin seguro" value={stats.sinSeguro} icon={ShieldAlert} color={C.danger} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por placa o modelo" />
        </View>

        {loading ? (
          <LoadingState text="Cargando flota..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(v) => v.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={<EmptyState title="Sin vehículos" subtitle="Agrega tu primera unidad con el botón +" icon={Truck} />}
          />
        )}
      </View>

      <Fab onPress={openCreate} />

      {/* Detalle */}
      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.placa || 'Detalle'}
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
            <InfoRow label="Placa" value={detail.placa} />
            <InfoRow label="Marca / Modelo" value={detail.marca_modelo} />
            <InfoRow label="Tipo de unidad" value={detail.tipo_unidad} />
            <InfoRow label="Año" value={detail.anio_fabricacion} />
            <InfoRow label="Estado" value={detail.estado_vehiculo} />
            <InfoRow label="Póliza de seguro" value={detail.poliza_seguro} />
            <InfoRow label="Venc. seguro" value={detail.fecha_vencimiento_seguro} />
            <InfoRow label="Revisión técnica" value={detail.revision_tecnica} />
            <InfoRow label="Kilometraje" value={detail.kilometraje_actual} />
            <InfoRow label="ID interno" value={detail.id_interno_furgon} />
          </View>
        )}
      </FormModal>

      {/* Crear / editar */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editing ? 'Editar vehículo' : 'Nuevo vehículo'}
        footer={<Button title={editing ? 'Guardar cambios' : 'Crear vehículo'} loading={saving} onPress={save} />}
      >
        <View style={{ marginBottom: S.md }}>
          <ImageUpload
            variant="wide"
            label="Subir foto del vehículo"
            value={form.url_foto}
            onChange={(url) => setForm({ ...form, url_foto: url })}
            onClear={() => setForm({ ...form, url_foto: '' })}
          />
        </View>
        <FormField label="Placa *" value={form.placa || ''} onChangeText={(t) => setForm({ ...form, placa: t })} placeholder="ABC-123" autoCapitalize="characters" />
        <FormField label="Marca / Modelo" value={form.marca_modelo || ''} onChangeText={(t) => setForm({ ...form, marca_modelo: t })} placeholder="Volvo FH 460" />
        <FormField label="Tipo de unidad" value={form.tipo_unidad || ''} onChangeText={(t) => setForm({ ...form, tipo_unidad: t })} placeholder="Furgón / Tracto" />
        <FormField label="Año de fabricación" value={form.anio_fabricacion ? String(form.anio_fabricacion) : ''} onChangeText={(t) => setForm({ ...form, anio_fabricacion: t as any })} placeholder="2022" keyboardType="numeric" />
        <Select
          label="Estado"
          value={form.estado_vehiculo || ''}
          onChange={(v) => setForm({ ...form, estado_vehiculo: v })}
          placeholder="Selecciona el estado"
          searchable={false}
          options={[
            { value: 'ACTIVO', label: 'ACTIVO' },
            { value: 'INACTIVO', label: 'INACTIVO' },
          ]}
        />
        <FormField label="Póliza de seguro" value={form.poliza_seguro || ''} onChangeText={(t) => setForm({ ...form, poliza_seguro: t })} placeholder="N° de póliza" />
        <DatePicker
          label="Venc. seguro"
          value={form.fecha_vencimiento_seguro || ''}
          onChange={(v) => setForm({ ...form, fecha_vencimiento_seguro: v })}
          placeholder="Selecciona la fecha"
        />
        <FormField label="Revisión técnica" value={form.revision_tecnica || ''} onChangeText={(t) => setForm({ ...form, revision_tecnica: t })} placeholder="Vigencia" />
        <FormField label="Kilometraje actual" value={form.kilometraje_actual ? String(form.kilometraje_actual) : ''} onChangeText={(t) => setForm({ ...form, kilometraje_actual: t as any })} placeholder="120000" keyboardType="numeric" />
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
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  plate: { fontSize: 16, fontWeight: '700', color: C.text },
  model: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: C.textFaint },
  metaBad: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaBadText: { fontSize: 12, color: C.danger, fontWeight: '600' },
});
