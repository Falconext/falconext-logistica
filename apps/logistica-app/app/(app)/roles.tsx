import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { KeyRound, Trash2, Pencil, ShieldCheck, Crown, Lock, Users } from 'lucide-react-native';
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
  Theme,
} from '../../components/ui';
import api from '../../services/api';
import { MODULES } from '../../constants/modules';

const C = Theme.colors;
const S = Theme.spacing;

interface Rol {
  id: string;
  nombre: string;
  descripcion?: string | null;
  modulos: string[];
  es_admin: boolean;
  solo_propios: boolean;
  usuarios_count?: number;
}

interface FormState {
  nombre: string;
  descripcion: string;
  modulos: string[];
  es_admin: boolean;
  solo_propios: boolean;
}

const emptyForm: FormState = {
  nombre: '',
  descripcion: '',
  modulos: [],
  es_admin: false,
  solo_propios: false,
};

function tipoBadge(r: Rol): { label: string; variant: 'warning' | 'info' | 'neutral' } {
  if (r.es_admin) return { label: 'Administrador', variant: 'warning' };
  if (r.solo_propios) return { label: 'Restringido', variant: 'info' };
  return { label: 'Estándar', variant: 'neutral' };
}

export default function RolesScreen() {
  const [items, setItems] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Rol | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/roles');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error cargando roles', e);
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
        (r) =>
          r.nombre.toLowerCase().includes(query.toLowerCase()) ||
          (r.descripcion || '').toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  const stats = useMemo(() => {
    const admins = items.filter((r) => r.es_admin).length;
    const usuarios = items.reduce((acc, r) => acc + (r.usuarios_count ?? 0), 0);
    return { total: items.length, admins, usuarios };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEdit = (r: Rol) => {
    setEditing(r);
    setForm({
      nombre: r.nombre || '',
      descripcion: r.descripcion || '',
      modulos: Array.isArray(r.modulos) ? [...r.modulos] : [],
      es_admin: r.es_admin ?? false,
      solo_propios: r.solo_propios ?? false,
    });
    setFormVisible(true);
  };

  const isEdit = !!editing;
  const allSelected = form.modulos.length === MODULES.length;

  const toggleModule = (key: string) => {
    setForm((f) => ({
      ...f,
      modulos: f.modulos.includes(key) ? f.modulos.filter((m) => m !== key) : [...f.modulos, key],
    }));
  };

  const toggleAll = () => {
    setForm((f) => ({
      ...f,
      modulos: f.modulos.length === MODULES.length ? [] : MODULES.map((m) => m.key),
    }));
  };

  const save = async () => {
    if (!form.nombre.trim()) {
      Alert.alert('Falta el nombre', 'El nombre del rol es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      const modulos = form.es_admin ? [] : form.modulos;
      const solo_propios = form.es_admin ? false : form.solo_propios;
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        modulos,
        es_admin: form.es_admin,
        solo_propios,
      };
      if (isEdit) {
        await api.patch(`/roles/${editing!.id}`, payload);
      } else {
        await api.post('/roles', payload);
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'No se pudo guardar el rol.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join(' ') : msg);
    } finally {
      setSaving(false);
    }
  };

  const remove = (r: Rol) => {
    Alert.alert(
      'Eliminar rol',
      `¿Eliminar el rol ${r.nombre}?${(r.usuarios_count ?? 0) > 0 ? `\n\nTiene ${r.usuarios_count} usuario(s) asignado(s); el sistema podría impedir su eliminación.` : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/roles/${r.id}`);
              load();
            } catch (e: any) {
              if (e?.response?.status === 409) {
                Alert.alert('No se puede eliminar', 'Este rol tiene usuarios asignados. Reasígnalos antes de eliminarlo.');
              } else {
                Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar el rol.');
              }
            }
          },
        },
      ]
    );
  };

  const renderCard = ({ item: r }: { item: Rol }) => {
    const tb = tipoBadge(r);
    return (
      <View style={styles.card}>
        <View style={styles.cardIcon}>
          {r.es_admin ? <Crown size={20} color={C.primary} /> : r.solo_propios ? <Lock size={20} color={C.primary} /> : <ShieldCheck size={20} color={C.primary} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.name} numberOfLines={1}>{r.nombre}</Text>
            <Badge label={tb.label} variant={tb.variant} />
          </View>
          {r.descripcion ? <Text style={styles.desc} numberOfLines={1}>{r.descripcion}</Text> : null}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {r.es_admin ? 'Todos los módulos' : `${r.modulos?.length || 0} de ${MODULES.length} módulos`}
            </Text>
            <View style={styles.metaBad}>
              <Users size={13} color={C.textFaint} />
              <Text style={styles.meta}>{r.usuarios_count ?? 0} usuarios</Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(r)} hitSlop={6}>
            <Pencil size={16} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => remove(r)} hitSlop={6}>
            <Trash2 size={16} color={C.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <AppHeader title="Roles" subtitle={`${items.length} perfiles de acceso`} back />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={ShieldCheck} color={C.primary} />
          <StatCard label="Admins" value={stats.admins} icon={Crown} color={C.warning} />
          <StatCard label="Usuarios" value={stats.usuarios} icon={Users} color={C.success} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar rol" />
        </View>

        {loading ? (
          <LoadingState text="Cargando roles..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(r) => r.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={<EmptyState title="Sin roles" subtitle="Crea el primer rol con el botón +" icon={KeyRound} />}
          />
        )}
      </View>

      <Fab onPress={openCreate} />

      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={isEdit ? 'Editar rol' : 'Nuevo rol'}
        footer={<Button title={isEdit ? 'Guardar cambios' : 'Crear rol'} loading={saving} onPress={save} />}
      >
        <FormField
          label="Nombre *"
          value={form.nombre}
          onChangeText={(t) => setForm({ ...form, nombre: t })}
          placeholder="Ej: Supervisor de flota"
        />
        <FormField
          label="Descripción"
          value={form.descripcion}
          onChangeText={(t) => setForm({ ...form, descripcion: t })}
          placeholder="Ej: Gestión operativa y flota"
        />

        {/* Administrador */}
        <TouchableOpacity
          style={styles.toggleRow}
          activeOpacity={0.7}
          onPress={() => setForm({ ...form, es_admin: !form.es_admin })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Administrador (ve todo)</Text>
            <Text style={styles.hint}>Acceso total a los módulos y a la administración.</Text>
          </View>
          <View style={[styles.switch, form.es_admin && styles.switchOn]}>
            <View style={[styles.knob, form.es_admin && styles.knobOn]} />
          </View>
        </TouchableOpacity>

        {/* Solo sus propios registros */}
        {!form.es_admin && (
          <TouchableOpacity
            style={[styles.toggleRow, { marginTop: S.sm }]}
            activeOpacity={0.7}
            onPress={() => setForm({ ...form, solo_propios: !form.solo_propios })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Solo sus registros</Text>
              <Text style={styles.hint}>Peajes, combustible y operaciones — solo lo que le pertenece.</Text>
            </View>
            <View style={[styles.switch, form.solo_propios && styles.switchOn]}>
              <View style={[styles.knob, form.solo_propios && styles.knobOn]} />
            </View>
          </TouchableOpacity>
        )}

        {/* Módulos */}
        <View style={{ marginTop: S.md }}>
          <View style={styles.modHeader}>
            <View style={styles.selLabelRow}>
              <ShieldCheck size={16} color={C.primary} />
              <Text style={styles.modTitle}>Módulos permitidos</Text>
            </View>
            {!form.es_admin && (
              <TouchableOpacity onPress={toggleAll} hitSlop={6}>
                <Text style={styles.selectAll}>{allSelected ? 'Quitar todos' : 'Seleccionar todos'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {form.es_admin ? (
            <View style={styles.infoBox}>
              <Lock size={16} color={C.primary} />
              <Text style={styles.infoBoxText}>
                Los roles de administrador ven todos los módulos. No es necesario asignar permisos individuales.
              </Text>
            </View>
          ) : (
            MODULES.map((m) => {
              const checked = form.modulos.includes(m.key);
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.modRow, checked && styles.modRowActive]}
                  activeOpacity={0.7}
                  onPress={() => toggleModule(m.key)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.modName}>{m.name}</Text>
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
    alignItems: 'center',
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
  name: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  desc: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: C.textFaint },
  metaBad: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceAlt,
  },
  hint: { fontSize: 12, color: C.textFaint, marginTop: 4 },
  selLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    padding: S.md,
    borderRadius: Theme.radius.md,
    backgroundColor: C.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  switch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.border,
    padding: 2,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: C.primary },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    ...Theme.shadow.card,
  },
  knobOn: { alignSelf: 'flex-end' },
  modHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.sm,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  modTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  selectAll: { fontSize: 13, fontWeight: '600', color: C.primary },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    padding: S.md,
    borderRadius: Theme.radius.md,
    backgroundColor: C.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  infoBoxText: { flex: 1, fontSize: 13, color: C.textMuted },
  modRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    paddingVertical: 12,
    paddingHorizontal: S.md,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    marginBottom: 8,
  },
  modRowActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  checkboxOn: { backgroundColor: C.primary, borderColor: C.primary },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  modName: { fontSize: 14, color: C.text, fontWeight: '500' },
});
