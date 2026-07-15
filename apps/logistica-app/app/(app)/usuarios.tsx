import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { UserCog, Trash2, Pencil, ShieldCheck, User as UserIcon, Users, CheckCircle2, KeyRound } from 'lucide-react-native';
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
import { useAuth } from '../../context/AuthContext';

const C = Theme.colors;
const S = Theme.spacing;

interface Rol {
  id: string;
  nombre: string;
  descripcion?: string | null;
  modulos: string[];
  es_admin: boolean;
  solo_propios: boolean;
}

interface Usuario {
  id: string;
  email: string;
  nombre?: string | null;
  role: string;
  activo: boolean;
  rol_id?: string | null;
  rol?: Rol | null;
  trabajador_id?: string | null;
}

interface TrabajadorOpt {
  id: string;
  id_trabajador?: string | null;
  nombre_completo: string;
}

interface FormState {
  nombre: string;
  email: string;
  password: string;
  activo: boolean;
  rol_id: string;
  trabajador_id: string;
}

const emptyForm: FormState = {
  nombre: '',
  email: '',
  password: '',
  activo: true,
  rol_id: '',
  trabajador_id: '',
};

function isSuperadminUser(u?: Usuario | null): boolean {
  return (u?.role || '').toUpperCase() === 'SUPERADMIN';
}

export default function UsuariosScreen() {
  const { user: currentUser } = useAuth();

  const [items, setItems] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, r, t] = await Promise.all([
        api.get('/usuarios'),
        api.get('/roles'),
        api.get('/trabajadores'),
      ]);
      setItems(Array.isArray(u.data) ? u.data : []);
      setRoles(Array.isArray(r.data) ? r.data : []);
      setTrabajadores(Array.isArray(t.data) ? t.data : []);
    } catch (e) {
      console.error('Error cargando usuarios', e);
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
        (u) =>
          (u.nombre || '').toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  const stats = useMemo(() => {
    const activos = items.filter((u) => u.activo).length;
    const admins = items.filter((u) => isSuperadminUser(u) || u.rol?.es_admin).length;
    return { total: items.length, activos, admins };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEdit = (u: Usuario) => {
    setEditing(u);
    setForm({
      nombre: u.nombre || '',
      email: u.email || '',
      password: '',
      activo: u.activo ?? true,
      rol_id: u.rol_id || '',
      trabajador_id: u.trabajador_id || '',
    });
    setFormVisible(true);
  };

  const isEdit = !!editing;
  const isSuperadmin = isSuperadminUser(editing);
  const selectedRole = roles.find((r) => r.id === form.rol_id) || null;
  const needsTrabajador = !!selectedRole?.solo_propios;

  const save = async () => {
    if (!isEdit) {
      if (!form.email.trim()) {
        Alert.alert('Falta el email', 'El email es obligatorio.');
        return;
      }
      if (!form.password || form.password.length < 6) {
        Alert.alert('Contraseña inválida', 'La contraseña es obligatoria (mínimo 6 caracteres).');
        return;
      }
    } else if (form.password && form.password.length < 6) {
      Alert.alert('Contraseña inválida', 'La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (!isSuperadmin && !form.rol_id) {
      Alert.alert('Falta el rol', 'Selecciona un rol para el usuario.');
      return;
    }
    if (needsTrabajador && !form.trabajador_id) {
      Alert.alert('Falta el trabajador', 'Este rol ve solo sus propios registros: vincula al trabajador correspondiente.');
      return;
    }

    setSaving(true);
    try {
      const trabajador_id = form.trabajador_id || null;
      if (isEdit) {
        const payload: any = {
          nombre: form.nombre.trim() || null,
          activo: form.activo,
          trabajador_id,
        };
        if (!isSuperadmin) payload.rol_id = form.rol_id || null;
        if (form.password) payload.password = form.password;
        await api.patch(`/usuarios/${editing!.id}`, payload);
      } else {
        await api.post('/usuarios', {
          email: form.email.trim(),
          password: form.password,
          nombre: form.nombre.trim() || undefined,
          rol_id: form.rol_id || null,
          trabajador_id,
        });
      }
      setFormVisible(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'No se pudo guardar el usuario.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join(' ') : msg);
    } finally {
      setSaving(false);
    }
  };

  const remove = (u: Usuario) => {
    if (currentUser?.id === u.id) {
      Alert.alert('Acción no permitida', 'No puedes eliminar tu propio usuario.');
      return;
    }
    Alert.alert('Eliminar usuario', `¿Eliminar a ${u.nombre || u.email}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/usuarios/${u.id}`);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const renderCard = ({ item: u }: { item: Usuario }) => {
    const isSuper = isSuperadminUser(u);
    const admin = isSuper || !!u.rol?.es_admin;
    const rolNombre = isSuper ? 'Super Admin' : (u.rol?.nombre || 'Sin rol');
    const isSelf = currentUser?.id === u.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardIcon}>
          {admin ? <ShieldCheck size={20} color={C.primary} /> : <UserIcon size={20} color={C.primary} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={styles.name} numberOfLines={1}>{u.nombre || u.email.split('@')[0]}</Text>
            <Badge label={u.activo ? 'Activo' : 'Inactivo'} variant={u.activo ? 'success' : 'neutral'} />
          </View>
          <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
          <View style={styles.metaRow}>
            <Badge label={rolNombre} variant={admin ? 'warning' : 'info'} />
            {u.rol?.solo_propios ? <Text style={styles.metaTag}>solo lo suyo</Text> : null}
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(u)} hitSlop={6}>
            <Pencil size={16} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => remove(u)}
            disabled={isSelf}
            hitSlop={6}
          >
            <Trash2 size={16} color={isSelf ? C.textFaint : C.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <AppHeader title="Usuarios" subtitle={`${items.length} usuarios registrados`} back />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={Users} color={C.primary} />
          <StatCard label="Activos" value={stats.activos} icon={CheckCircle2} color={C.success} />
          <StatCard label="Admins" value={stats.admins} icon={ShieldCheck} color={C.warning} />
        </View>

        <View style={{ marginBottom: S.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nombre o email" />
        </View>

        {loading ? (
          <LoadingState text="Cargando usuarios..." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListEmptyComponent={<EmptyState title="Sin usuarios" subtitle="Crea el primer usuario con el botón +" icon={UserCog} />}
          />
        )}
      </View>

      <Fab onPress={openCreate} />

      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={isEdit ? 'Editar usuario' : 'Nuevo usuario'}
        footer={<Button title={isEdit ? 'Guardar cambios' : 'Crear usuario'} loading={saving} onPress={save} />}
      >
        <FormField
          label="Nombre"
          value={form.nombre}
          onChangeText={(t) => setForm({ ...form, nombre: t })}
          placeholder="Ej: Ana López"
        />

        {isEdit ? (
          <View style={styles.readonly}>
            <Text style={styles.readonlyLabel}>Email</Text>
            <Text style={styles.readonlyValue}>{form.email}</Text>
            <Text style={styles.hint}>El email no se puede modificar.</Text>
          </View>
        ) : (
          <FormField
            label="Email *"
            value={form.email}
            onChangeText={(t) => setForm({ ...form, email: t })}
            placeholder="correo@empresa.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}

        <FormField
          label={isEdit ? 'Contraseña' : 'Contraseña *'}
          value={form.password}
          onChangeText={(t) => setForm({ ...form, password: t })}
          placeholder={isEdit ? 'Dejar en blanco para no cambiar' : 'Mínimo 6 caracteres'}
          secureTextEntry
          autoCapitalize="none"
        />

        {/* Rol */}
        {isSuperadmin ? (
          <View style={styles.readonly}>
            <Text style={styles.readonlyLabel}>Rol</Text>
            <Text style={styles.readonlyValue}>SUPERADMIN (plataforma)</Text>
          </View>
        ) : (
          <View style={{ marginBottom: S.md }}>
            <Text style={styles.fieldLabel}>Rol *</Text>
            <View style={styles.chipWrap}>
              {roles.length === 0 ? (
                <Text style={styles.hint}>No hay roles disponibles. Crea uno primero.</Text>
              ) : (
                roles.map((r) => {
                  const active = form.rol_id === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setForm({ ...form, rol_id: r.id })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.nombre}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
            {selectedRole && (
              <Text style={styles.hint}>
                {selectedRole.es_admin
                  ? 'Administrador: ve todos los módulos.'
                  : `Verá ${selectedRole.modulos.length} módulo(s).`}
                {selectedRole.solo_propios ? ' Solo verá sus propios registros.' : ''}
              </Text>
            )}
          </View>
        )}

        {/* Estado activo */}
        <TouchableOpacity
          style={styles.toggleRow}
          activeOpacity={0.7}
          onPress={() => setForm({ ...form, activo: !form.activo })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Usuario activo</Text>
            <Text style={styles.hint}>Los usuarios inactivos no pueden iniciar sesión.</Text>
          </View>
          <View style={[styles.switch, form.activo && styles.switchOn]}>
            <View style={[styles.knob, form.activo && styles.knobOn]} />
          </View>
        </TouchableOpacity>

        {/* Trabajador vinculado */}
        {!isSuperadmin && (
          <View style={{ marginTop: S.md }}>
            <View style={styles.selLabelRow}>
              <KeyRound size={15} color={C.primary} />
              <Text style={styles.fieldLabel}>
                Trabajador vinculado{needsTrabajador ? ' *' : ''}
              </Text>
            </View>
            <View style={styles.chipWrap}>
              <TouchableOpacity
                style={[styles.chip, !form.trabajador_id && styles.chipActive]}
                onPress={() => setForm({ ...form, trabajador_id: '' })}
              >
                <Text style={[styles.chipText, !form.trabajador_id && styles.chipTextActive]}>Sin vincular</Text>
              </TouchableOpacity>
              {trabajadores.map((t) => {
                const active = form.trabajador_id === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setForm({ ...form, trabajador_id: t.id })}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t.nombre_completo}{t.id_trabajador ? ` (${t.id_trabajador})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {needsTrabajador
                ? 'Obligatorio: identifica de qué persona son los registros que verá.'
                : 'Opcional. Necesario solo si el rol restringe a "sus propios registros".'}
            </Text>
          </View>
        )}
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
  email: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaTag: { fontSize: 11, color: C.warning, fontWeight: '600' },
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
  fieldLabel: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 6 },
  selLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  chipTextActive: { color: C.textOnPrimary },
  hint: { fontSize: 12, color: C.textFaint, marginTop: 6 },
  readonly: {
    marginBottom: S.md,
    padding: S.md,
    borderRadius: Theme.radius.md,
    backgroundColor: C.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  readonlyLabel: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 4 },
  readonlyValue: { fontSize: 15, color: C.text, fontWeight: '600' },
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
});
