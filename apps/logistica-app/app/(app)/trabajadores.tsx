import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Users, UserCheck, IdCard, Trash2, Pencil, User, Phone } from 'lucide-react-native';
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
  SectionTitle,
  Theme,
} from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../constants/currency';
import type { Trabajador } from '../../types';

const C = Theme.colors;
const S = Theme.spacing;

const empty: Partial<Trabajador> = {
  nombre_completo: '',
  cargo: '',
  estado_laboral: 'Activo',
  telefono: '',
  email_personal: '',
  area_trabajo: '',
  licencia_conducir: '',
  fecha_vencimiento_licencia: '',
  numero_pasaporte: '',
  sueldo_base: '',
};

const isActivo = (estado?: string) => (estado || '').toLowerCase() === 'activo';

const formatSueldo = (v?: string | number, moneda?: string | null) => {
  if (v === undefined || v === null || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return String(v);
  return formatMoney(n, moneda);
};

export default function TrabajadoresScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<Trabajador[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [detail, setDetail] = useState<Trabajador | null>(null);
  const [editing, setEditing] = useState<Trabajador | null>(null);
  const [form, setForm] = useState<Partial<Trabajador>>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/trabajadores');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error cargando trabajadores', e);
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
      (t) =>
        t.nombre_completo?.toLowerCase().includes(q) ||
        t.cargo?.toLowerCase().includes(q) ||
        t.id_trabajador?.toLowerCase().includes(q) ||
        t.area_trabajo?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const stats = useMemo(() => {
    const activos = items.filter((t) => isActivo(t.estado_laboral)).length;
    const conLicencia = items.filter((t) => !!t.licencia_conducir).length;
    return { total: items.length, activos, conLicencia };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setFormVisible(true);
  };

  const openEdit = (t: Trabajador) => {
    setEditing(t);
    setForm({ ...t });
    setDetail(null);
    setFormVisible(true);
  };

  const save = async () => {
    if (!form.nombre_completo?.trim()) {
      Alert.alert('Falta el nombre', 'El nombre completo es obligatorio.');
      return;
    }
    if (!form.cargo?.trim()) {
      Alert.alert('Falta el cargo', 'El cargo es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      const sueldoStr = form.sueldo_base !== undefined && form.sueldo_base !== null ? String(form.sueldo_base).trim() : '';
      const payload: Record<string, any> = {
        nombre_completo: form.nombre_completo?.trim(),
        cargo: form.cargo?.trim(),
        estado_laboral: form.estado_laboral?.trim() || undefined,
        telefono: form.telefono?.trim() || undefined,
        email_personal: form.email_personal?.trim() || undefined,
        area_trabajo: form.area_trabajo?.trim() || undefined,
        licencia_conducir: form.licencia_conducir?.trim() || undefined,
        fecha_vencimiento_licencia: form.fecha_vencimiento_licencia?.trim() || undefined,
        numero_pasaporte: form.numero_pasaporte?.trim() || undefined,
        sueldo_base: sueldoStr ? Number(sueldoStr) : undefined,
      };
      if (editing) {
        await api.patch(`/trabajadores/${editing.id}`, payload);
      } else {
        await api.post('/trabajadores', payload);
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el trabajador.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (t: Trabajador) => {
    Alert.alert('Eliminar trabajador', `¿Eliminar a ${t.nombre_completo}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/trabajadores/${t.id}`);
            setDetail(null);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const renderCard = ({ item: t }: { item: Trabajador }) => {
    const activo = isActivo(t.estado_laboral);
    return (
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => setDetail(t)}>
        <View style={styles.avatar}>
          <User size={20} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.name} numberOfLines={1}>{t.nombre_completo}</Text>
            <Badge label={t.estado_laboral || 'Inactivo'} variant={activo ? 'success' : 'neutral'} />
          </View>
          <Text style={styles.role} numberOfLines={1}>
            {t.cargo || 'Sin cargo'}{t.area_trabajo ? ` · ${t.area_trabajo}` : ''}
          </Text>
          <View style={styles.metaRow}>
            {t.telefono ? (
              <View style={styles.metaItem}>
                <Phone size={12} color={C.textFaint} />
                <Text style={styles.meta}>{t.telefono}</Text>
              </View>
            ) : null}
            {t.sueldo_base ? <Text style={styles.meta}>· {formatSueldo(t.sueldo_base, user?.moneda)}</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      <AppHeader title="Personal" subtitle={`${items.length} trabajadores`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={Users} color={C.primary} />
          <StatCard label="Activos" value={stats.activos} icon={UserCheck} color={C.success} />
          <StatCard label="Con licencia" value={stats.conLicencia} icon={IdCard} color={C.info} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nombre, cargo o área" />
        </View>

        {loading ? (
          <LoadingState text="Cargando personal..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(t) => t.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={<EmptyState title="Sin trabajadores" subtitle="Agrega tu primer miembro con el botón +" icon={Users} />}
          />
        )}
      </View>

      <Fab onPress={openCreate} />

      {/* Detalle */}
      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.nombre_completo || 'Detalle'}
        footer={
          detail ? (
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <Button title="Editar" icon={Pencil} variant="secondary" style={{ flex: 1 }} onPress={() => detail && openEdit(detail)} />
              <Button title="Eliminar" icon={Trash2} variant="danger" style={{ flex: 1 }} onPress={() => detail && remove(detail)} />
            </View>
          ) : undefined
        }
      >
        {detail && (
          <View>
            <SectionTitle>Información general</SectionTitle>
            <InfoRow label="Nombre" value={detail.nombre_completo} />
            <InfoRow label="ID" value={detail.id_trabajador} />
            <InfoRow label="Cargo" value={detail.cargo} />
            <InfoRow label="Estado" value={detail.estado_laboral} />
            <InfoRow label="Área" value={detail.area_trabajo} />
            <InfoRow label="Sueldo base" value={formatSueldo(detail.sueldo_base, user?.moneda)} />

            <SectionTitle style={{ marginTop: S.lg }}>Contacto</SectionTitle>
            <InfoRow label="Teléfono" value={detail.telefono} />
            <InfoRow label="Email" value={detail.email_personal} />
            <InfoRow label="Dirección" value={detail.direccion} />

            <SectionTitle style={{ marginTop: S.lg }}>Documentación</SectionTitle>
            <InfoRow label="Licencia" value={detail.licencia_conducir} />
            <InfoRow label="Venc. licencia" value={detail.fecha_vencimiento_licencia} />
            <InfoRow label="Pasaporte" value={detail.numero_pasaporte} />
            <InfoRow label="Venc. pasaporte" value={detail.fecha_vencimiento_pasaporte} />
            <InfoRow label="Nacionalidad" value={detail.nacionalidad} />
          </View>
        )}
      </FormModal>

      {/* Crear / editar */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editing ? 'Editar trabajador' : 'Nuevo trabajador'}
        footer={<Button title={editing ? 'Guardar cambios' : 'Crear trabajador'} loading={saving} onPress={save} />}
      >
        <FormField label="Nombre completo *" value={form.nombre_completo || ''} onChangeText={(t) => setForm({ ...form, nombre_completo: t })} placeholder="Juan Pérez" autoCapitalize="words" />
        <FormField label="Cargo *" value={form.cargo || ''} onChangeText={(t) => setForm({ ...form, cargo: t })} placeholder="Chofer" autoCapitalize="words" />
        <FormField label="Estado laboral" value={form.estado_laboral || ''} onChangeText={(t) => setForm({ ...form, estado_laboral: t })} placeholder="Activo / Inactivo" autoCapitalize="words" />
        <FormField label="Área de trabajo" value={form.area_trabajo || ''} onChangeText={(t) => setForm({ ...form, area_trabajo: t })} placeholder="Operaciones" />
        <FormField label="Teléfono" value={form.telefono || ''} onChangeText={(t) => setForm({ ...form, telefono: t })} placeholder="+51 999 999 999" keyboardType="phone-pad" />
        <FormField label="Email personal" value={form.email_personal || ''} onChangeText={(t) => setForm({ ...form, email_personal: t })} placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none" />
        <FormField label="Licencia de conducir" value={form.licencia_conducir || ''} onChangeText={(t) => setForm({ ...form, licencia_conducir: t })} placeholder="N° de licencia" autoCapitalize="characters" />
        <FormField label="Venc. licencia (AAAA-MM-DD)" value={form.fecha_vencimiento_licencia || ''} onChangeText={(t) => setForm({ ...form, fecha_vencimiento_licencia: t })} placeholder="2026-12-31" autoCapitalize="none" />
        <FormField label="N° pasaporte" value={form.numero_pasaporte || ''} onChangeText={(t) => setForm({ ...form, numero_pasaporte: t })} placeholder="Pasaporte" autoCapitalize="characters" />
        <FormField label="Sueldo base" value={form.sueldo_base !== undefined && form.sueldo_base !== null ? String(form.sueldo_base) : ''} onChangeText={(t) => setForm({ ...form, sueldo_base: t })} placeholder="1500" keyboardType="numeric" />
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Theme.radius.full,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  name: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  role: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: C.textFaint },
});
