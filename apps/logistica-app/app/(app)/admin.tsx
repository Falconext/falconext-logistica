import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ShieldCheck,
  Building2,
  Users,
  Truck,
  Plus,
  RefreshCw,
  CheckCircle2,
  FileSpreadsheet,
  Save,
  Server,
  Clock,
} from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  Card,
  StatCard,
  Badge,
  Button,
  Fab,
  FormModal,
  FormField,
  LoadingState,
  EmptyState,
  SectionTitle,
  InfoRow,
  Theme,
} from '../../components/ui';
import api from '../../services/api';

const C = Theme.colors;
const S = Theme.spacing;

interface TenantRow {
  id: string;
  name?: string;
  slug?: string;
  plan?: string;
  _count?: { users?: number; vehiculos?: number };
}

interface SheetsStatus {
  connected?: boolean;
  spreadsheetId?: string;
  serviceEmail?: string;
  lastSynced?: string;
}

interface TenantForm {
  name: string;
  slug: string;
  plan: string;
  adminEmail: string;
  adminPassword: string;
}

const emptyTenant: TenantForm = {
  name: '',
  slug: '',
  plan: 'FREE',
  adminEmail: '',
  adminPassword: '',
};

const PLANES = ['FREE', 'PRO', 'ENTERPRISE'];

function planVariant(plan?: string): 'success' | 'info' | 'warning' | 'neutral' {
  switch ((plan || '').toUpperCase()) {
    case 'ENTERPRISE':
      return 'success';
    case 'PRO':
      return 'info';
    case 'FREE':
      return 'warning';
    default:
      return 'neutral';
  }
}

// Extrae el ID de una URL de Google Sheets, o devuelve el valor tal cual.
function extractSpreadsheetId(val: string): string {
  const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : val;
}

export default function AdminScreen() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Crear empresa
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<TenantForm>(emptyTenant);
  const [saving, setSaving] = useState(false);

  // Integración Sheets
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.allSettled([
        api.get('/tenants'),
        api.get('/sheets/status'),
      ]);
      if (tRes.status === 'fulfilled') {
        setTenants(Array.isArray(tRes.value.data) ? tRes.value.data : []);
      }
      if (sRes.status === 'fulfilled') {
        const data: SheetsStatus = sRes.value.data || {};
        setStatus(data);
        if (data.spreadsheetId) setSpreadsheetId(data.spreadsheetId);
      }
    } catch (e) {
      console.error('Error cargando administración', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openCreate = () => {
    setForm(emptyTenant);
    setFormVisible(true);
  };

  const saveTenant = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      Alert.alert('Faltan datos', 'El nombre y el slug son obligatorios.');
      return;
    }
    if (!form.adminEmail.trim() || !form.adminPassword.trim()) {
      Alert.alert('Faltan datos', 'El email y la contraseña del admin son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/tenants', form);
      setFormVisible(false);
      setForm(emptyTenant);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo crear la empresa.');
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!spreadsheetId.trim()) {
      Alert.alert('Falta el ID', 'Ingresa el ID de la hoja de cálculo.');
      return;
    }
    setSavingConfig(true);
    try {
      await api.post('/sheets/config', { spreadsheetId: spreadsheetId.trim() });
      Alert.alert('Listo', 'Configuración guardada.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSavingConfig(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/sheets/sync');
      const count = res.data?.count;
      Alert.alert(
        'Sincronización exitosa',
        count != null ? `${count} filas procesadas.` : 'Datos sincronizados.'
      );
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Error al sincronizar. Verifica permisos.');
    } finally {
      setSyncing(false);
    }
  };

  const totalUsuarios = tenants.reduce((acc, t) => acc + (t._count?.users || 0), 0);
  const totalVehiculos = tenants.reduce((acc, t) => acc + (t._count?.vehiculos || 0), 0);
  const connected = !!status?.connected;

  if (loading) {
    return (
      <Screen>
        <AppHeader title="Administración" subtitle="Empresas e integraciones" />
        <LoadingState text="Cargando administración..." />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <AppHeader title="Administración" subtitle="Empresas e integraciones" />

      <View style={styles.body}>
        {/* KPIs */}
        <View style={styles.statsRow}>
          <StatCard label="Empresas" value={tenants.length} icon={Building2} color={C.primary} />
          <StatCard label="Usuarios" value={totalUsuarios} icon={Users} color={C.info} />
          <StatCard label="Vehículos" value={totalVehiculos} icon={Truck} color={C.success} />
        </View>

        {/* ------- Sección Empresas ------- */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <ShieldCheck size={18} color={C.primary} />
            <SectionTitle style={{ marginBottom: 0 }}>Empresas</SectionTitle>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.8}>
            <Plus size={16} color={C.textOnPrimary} />
            <Text style={styles.addBtnText}>Nueva</Text>
          </TouchableOpacity>
        </View>

        {tenants.length === 0 ? (
          <Card>
            <EmptyState
              title="Sin empresas"
              subtitle="Crea la primera empresa con el botón +"
              icon={Building2}
            />
          </Card>
        ) : (
          tenants.map((t) => (
            <Card key={t.id} style={styles.tenantCard}>
              <View style={styles.tenantTop}>
                <View style={styles.tenantIcon}>
                  <Building2 size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tenantName}>{t.name || 'Sin nombre'}</Text>
                  {!!t.slug && <Text style={styles.tenantSlug}>{t.slug}</Text>}
                </View>
                <Badge label={t.plan || 'FREE'} variant={planVariant(t.plan)} />
              </View>
              <View style={styles.tenantMeta}>
                <View style={styles.metaItem}>
                  <Users size={14} color={C.textMuted} />
                  <Text style={styles.metaText}>{t._count?.users || 0} usuarios</Text>
                </View>
                <View style={styles.metaItem}>
                  <Truck size={14} color={C.textMuted} />
                  <Text style={styles.metaText}>{t._count?.vehiculos || 0} vehículos</Text>
                </View>
              </View>
            </Card>
          ))
        )}

        {/* ------- Sección Integración Sheets ------- */}
        <View style={[styles.sectionTitleRow, { marginTop: S.xl, marginBottom: S.md }]}>
          <FileSpreadsheet size={18} color={C.primary} />
          <SectionTitle style={{ marginBottom: 0 }}>Integración Google Sheets</SectionTitle>
        </View>

        {/* Estado */}
        <Card style={{ marginBottom: S.md }}>
          <View style={styles.statusHead}>
            <View style={styles.sectionTitleRow}>
              <RefreshCw size={18} color={connected ? C.success : C.warning} />
              <Text style={styles.cardTitle}>Estado y acciones</Text>
            </View>
            <Badge
              label={connected ? 'Conectado' : 'No configurado'}
              variant={connected ? 'success' : 'warning'}
            />
          </View>

          <InfoRow label="Conexión" value={connected ? 'Conectado' : 'No configurado'} />
          <InfoRow
            label="Última sincronización"
            value={status?.lastSynced ? new Date(status.lastSynced).toLocaleString() : 'Nunca'}
          />

          <Button
            title={syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            icon={RefreshCw}
            loading={syncing}
            disabled={!connected}
            onPress={sync}
            style={{ marginTop: S.md }}
          />
          {!connected && (
            <Text style={styles.hint}>
              Configura y guarda el ID de la hoja antes de sincronizar.
            </Text>
          )}
        </Card>

        {/* Configuración */}
        <Card>
          <View style={styles.sectionTitleRow}>
            <FileSpreadsheet size={18} color={C.primary} />
            <Text style={styles.cardTitle}>Configuración</Text>
          </View>

          <FormField
            label="Spreadsheet ID"
            value={spreadsheetId}
            onChangeText={(t) => setSpreadsheetId(extractSpreadsheetId(t))}
            placeholder="Pega la URL o el ID de la hoja"
            autoCapitalize="none"
            style={{ marginTop: S.md }}
          />
          <Text style={styles.hint}>Copia el ID desde la URL de tu Google Sheet.</Text>

          <Button
            title="Guardar configuración"
            icon={Save}
            variant="secondary"
            loading={savingConfig}
            onPress={saveConfig}
            style={{ marginTop: S.sm }}
          />

          <View style={styles.serviceBox}>
            <View style={styles.sectionTitleRow}>
              <Server size={15} color={C.textMuted} />
              <Text style={styles.serviceLabel}>Email de servicio (dar acceso Editor)</Text>
            </View>
            <Text style={styles.serviceEmail} selectable>
              {status?.serviceEmail || 'No disponible'}
            </Text>
            <Text style={styles.hint}>
              Comparte tu hoja con este correo como Editor para permitir la sincronización.
            </Text>
          </View>

          {!!status?.spreadsheetId && (
            <View style={styles.currentBox}>
              <Clock size={14} color={C.textMuted} />
              <Text style={styles.currentText}>Hoja actual: {status.spreadsheetId}</Text>
            </View>
          )}
        </Card>
      </View>

      <Fab onPress={openCreate} />

      {/* Crear empresa */}
      <FormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title="Nueva empresa"
        footer={<Button title="Crear empresa" icon={CheckCircle2} loading={saving} onPress={saveTenant} />}
      >
        <FormField
          label="Nombre de la empresa *"
          value={form.name}
          onChangeText={(t) => setForm({ ...form, name: t })}
          placeholder="Ej. Logística Express"
        />
        <FormField
          label="Slug (URL) *"
          value={form.slug}
          onChangeText={(t) => setForm({ ...form, slug: t })}
          placeholder="logistica-express"
          autoCapitalize="none"
        />
        <FormField
          label="Email del admin *"
          value={form.adminEmail}
          onChangeText={(t) => setForm({ ...form, adminEmail: t })}
          placeholder="admin@empresa.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label="Contraseña del admin *"
          value={form.adminPassword}
          onChangeText={(t) => setForm({ ...form, adminPassword: t })}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Plan de suscripción</Text>
        <View style={styles.planRow}>
          {PLANES.map((p) => {
            const active = form.plan === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.planChip, active && styles.planChipActive]}
                onPress={() => setForm({ ...form, plan: p })}
                activeOpacity={0.8}
              >
                <Text style={[styles.planChipText, active && styles.planChipTextActive]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingTop: S.md },
  statsRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.primary,
    paddingHorizontal: S.md,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
  },
  addBtnText: { color: C.textOnPrimary, fontSize: 13, fontWeight: '600' },
  tenantCard: { marginBottom: S.sm },
  tenantTop: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  tenantIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantName: { fontSize: 16, fontWeight: '700', color: C.text },
  tenantSlug: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  tenantMeta: {
    flexDirection: 'row',
    gap: S.lg,
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  statusHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  hint: { fontSize: 12, color: C.textFaint, marginTop: 6, lineHeight: 16 },
  serviceBox: {
    marginTop: S.lg,
    backgroundColor: C.surfaceAlt,
    borderRadius: Theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: S.md,
    gap: 4,
  },
  serviceLabel: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  serviceEmail: {
    fontSize: 13,
    color: C.text,
    fontWeight: '600',
    marginTop: 4,
  },
  currentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: S.md,
  },
  currentText: { fontSize: 12, color: C.textMuted, flexShrink: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 6 },
  planRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  planChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  planChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  planChipText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  planChipTextActive: { color: C.textOnPrimary },
});
