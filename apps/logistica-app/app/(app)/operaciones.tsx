import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as Location from 'expo-location';
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
  Flag,
  Wallet,
  Plus,
  Trash2,
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
import ImageUpload from '../../components/ImageUpload';
import MultiFileUpload from '../../components/MultiFileUpload';
import MapboxWebView from '../../components/MapboxWebView';
import RouteReport from '../../components/RouteReport';
import ChoferWizard from '../../components/ChoferWizard';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../constants/currency';
import { APP_OPTIONS, GASTO_TIPOS, CONSEGNA_ACTIONS, estadoConsegnaMeta, RETIRO_PRESETS, isCoords } from '../../constants/operaciones';
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

// En BD pueden convivir códigos en español e inglés; cada filtro cubre sus variantes.
const ESTADO_VARIANTS: Record<string, string[]> = {
  PENDIENTE: ['PENDIENTE', 'PENDING'],
  RETIRADO: ['RETIRADO', 'IN_TRANSIT'],
  ENTREGADO: ['ENTREGADO', 'COMPLETED'],
  ANULADO: ['ANULADO', 'FAILED', 'CANCELLED'],
  REPROGRAMADO: ['REPROGRAMADO'],
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

const todayISO = () => new Date().toISOString().split('T')[0];

type GastoRow = { tipo: string; monto: string; descripcion: string; numero_mancato: string; comprobantes: string[] };

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
  destinos: string[];
  nota: string;
  estado: string;
  // Datos de consegna
  km: string;
  ciudad: string;
  app: string;
  compactado: boolean;
  estado_consegna: string;
  attesa: string;
  otros_datos: string;
  foto_bolla: string;
  // Rendición
  anticipo: string;
  gastos: GastoRow[];
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
  destinos: [],
  nota: '',
  estado: 'PENDIENTE',
  km: '',
  ciudad: '',
  app: '',
  compactado: false,
  estado_consegna: '',
  attesa: '',
  otros_datos: '',
  foto_bolla: '',
  anticipo: '',
  gastos: [],
});

export default function OperacionesScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const { user } = useAuth();
  // Solo admins editan todo. El chofer (rol USER) solo edita itinerario, estado de
  // consegna, bolla y gastos; el resto es de solo lectura, y no crea ni elimina.
  const canEditAll = !!user && (user.es_admin === true || user.role === 'ADMIN' || user.role === 'SUPERADMIN');
  const lockOthers = !canEditAll;
  const moneda = user?.moneda;
  const [items, setItems] = useState<Programacion[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedEstado, setSelectedEstado] = useState<string | null>(null);

  const [detail, setDetail] = useState<Programacion | null>(null);
  const [wizardOp, setWizardOp] = useState<Programacion | null>(null); // chofer: flujo por pasos
  const [detailDeviceId, setDetailDeviceId] = useState<string>('');
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Programacion | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);

  const load = useCallback(async () => {
    try {
      // /programacion devuelve { items, total, counts } (paginado). Filtra por estado
      // cuando hay un filtro activo (cubriendo variantes ES/EN del mismo estado).
      const params: Record<string, any> = { take: 100 };
      if (selectedEstado) params.estados = (ESTADO_VARIANTS[selectedEstado] || [selectedEstado]).join(',');
      const res = await api.get('/programacion', { params });
      const data = res.data;
      if (Array.isArray(data)) {
        setItems(data);
        setTotal(data.length);
        setCounts({});
      } else {
        setItems(data?.items ?? []);
        setTotal(data?.total ?? data?.items?.length ?? 0);
        setCounts(data?.counts ?? {});
      }
    } catch (e) {
      console.error('Error cargando operaciones', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedEstado]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Al abrir el detalle, resolvemos el dispositivo GPS del chofer (por su código) para
  // mostrar el historial de ruta de esa operación dentro del detalle.
  useEffect(() => {
    const code = detail?.trabajador_id;
    if (!code) { setDetailDeviceId(''); return; }
    let cancelled = false;
    setDetailDeviceId('');
    api.get(`/gps/trabajador/${encodeURIComponent(code)}/dispositivo`)
      .then((res) => { if (!cancelled) setDetailDeviceId(res.data?.deviceId || ''); })
      .catch(() => { if (!cancelled) setDetailDeviceId(''); });
    return () => { cancelled = true; };
  }, [detail?.trabajador_id, detail?.id]);

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

  // El trabajador_id de una operación puede venir como UUID o como código
  // (id_trabajador); mapeamos ambos al nombre para mostrarlo en vez del id.
  const trabajadorNombre = useCallback(
    (id?: string | null): string | null => {
      if (!id) return null;
      const w = trabajadores.find((t) => t.id === id || t.id_trabajador === id);
      return w?.nombre_completo || null;
    },
    [trabajadores]
  );

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
    // Los totales vienen del servidor (counts/total), no solo de la página cargada.
    const hasCounts = Object.keys(counts).length > 0;
    if (hasCounts) {
      return {
        total,
        pendientes: counts.PENDIENTE ?? 0,
        enRuta: counts.RETIRADO ?? 0,
        entregados: counts.ENTREGADO ?? 0,
      };
    }
    return {
      total: items.length,
      pendientes: items.filter((r) => (r.estado || 'PENDIENTE') === 'PENDIENTE').length,
      enRuta: items.filter((r) => r.estado === 'RETIRADO').length,
      entregados: items.filter((r) => r.estado === 'ENTREGADO').length,
    };
  }, [items, counts, total]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDetail(null);
    setFormVisible(true);
    loadResources();
  };

  const populate = (src: any) => setForm({
    vehiculo_id: src.vehiculo_id || '',
    trabajador_id: src.trabajador_id || '',
    cliente: src.cliente || '',
    retiro_lugar: src.lugar_retiro || '',
    retiro_fecha: src.fecha_retiro ? src.fecha_retiro.split('T')[0] : todayISO(),
    retiro_hora: src.hora_retiro || '',
    entrega_lugar: src.lugar_entrega || '',
    entrega_fecha: src.fecha_entrega ? src.fecha_entrega.split('T')[0] : todayISO(),
    entrega_hora: '',
    destinos: Array.isArray(src.destinos) ? src.destinos : [],
    nota: src.nota || '',
    estado: src.estado || 'PENDIENTE',
    km: src.km != null ? String(src.km) : '',
    ciudad: src.ciudad || '',
    app: src.app || '',
    compactado: !!src.compactado,
    estado_consegna: src.estado_consegna || '',
    attesa: src.attesa || '',
    otros_datos: src.otros_datos || '',
    foto_bolla: src.foto_bolla || '',
    anticipo: src.anticipo != null ? String(src.anticipo) : '',
    gastos: Array.isArray(src.gastos) ? src.gastos.map((g: any) => ({
      tipo: g.tipo || 'OTRO',
      monto: g.monto != null ? String(g.monto) : '',
      descripcion: g.descripcion || '',
      numero_mancato: g.numero_mancato || '',
      comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes : [],
    })) : [],
  });

  const openEdit = (r: Programacion) => {
    setEditing(r);
    populate(r); // precarga rápida con lo que trae la lista
    setDetail(null);
    setFormVisible(true);
    loadResources();
    // Registro COMPLETO: la lista no trae nota/otros_datos/foto_bolla/gastos, y guardar
    // sin ellos los borraría. GET /programacion/:id trae todos los campos.
    api.get(`/programacion/${r.id}`).then((res) => { if (res.data) populate({ ...r, ...res.data }); }).catch(() => {});
  };

  // Eliminar operación (solo responsables/admins). Corrige entregas hechas por error.
  const remove = (r: Programacion) => {
    Alert.alert(
      'Eliminar operación',
      `¿Eliminar esta operación${r.cliente ? ` de "${r.cliente}"` : ''}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await api.delete(`/programacion/${r.id}`);
              setDetail(null);
              load();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar la operación.');
            }
          },
        },
      ],
    );
  };

  // --- Origen: posición actual (GPS del teléfono) ---
  const usarPosicionActual = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos tu ubicación.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setForm((f) => ({ ...f, retiro_lugar: pos.coords.latitude + ',' + pos.coords.longitude }));
    } catch {
      Alert.alert('Ubicación no disponible', 'Activa el GPS e inténtalo de nuevo.');
    }
  };

  // --- Destinos adicionales ---
  const addDestino = () => setForm((f) => ({ ...f, destinos: [...f.destinos, ''] }));
  const updateDestino = (i: number, val: string) => setForm((f) => ({ ...f, destinos: f.destinos.map((d, idx) => (idx === i ? val : d)) }));
  const removeDestino = (i: number) => setForm((f) => ({ ...f, destinos: f.destinos.filter((_, idx) => idx !== i) }));

  // --- Gastos (rendición) ---
  const addGasto = () => setForm((f) => ({ ...f, gastos: [...f.gastos, { tipo: 'PEAJE', monto: '', descripcion: '', numero_mancato: '', comprobantes: [] }] }));
  const updateGasto = (i: number, patch: Partial<GastoRow>) => setForm((f) => ({ ...f, gastos: f.gastos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
  const removeGasto = (i: number) => setForm((f) => ({ ...f, gastos: f.gastos.filter((_, idx) => idx !== i) }));
  const totalGastos = form.gastos.reduce((s, g) => s + (g.monto !== '' ? Number(g.monto) || 0 : 0), 0);
  const anticipoNum = form.anticipo !== '' ? Number(form.anticipo) || 0 : 0;
  const saldo = anticipoNum - totalGastos;

  const save = async () => {
    // Únicos obligatorios: vehículo y conductor.
    if (!form.vehiculo_id || !form.trabajador_id) {
      Alert.alert('Faltan datos', 'Vehículo y Conductor son obligatorios.');
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
        destinos: form.destinos.map((s) => s.trim()).filter(Boolean),
        nota: form.nota,
        km: form.km !== '' ? Number(form.km) : null,
        ciudad: form.ciudad || null,
        app: form.app || null,
        compactado: form.compactado,
        estado_consegna: form.estado_consegna || null,
        attesa: form.attesa || null,
        otros_datos: form.otros_datos || null,
        foto_bolla: form.foto_bolla || null,
        anticipo: form.anticipo !== '' ? Number(form.anticipo) : null,
        gastos: form.gastos
          .filter((g) => g.tipo && (g.monto !== '' || g.comprobantes.length || g.descripcion || g.numero_mancato))
          .map((g) => ({
            tipo: g.tipo,
            monto: g.monto !== '' ? Number(g.monto) : 0,
            descripcion: g.descripcion || null,
            numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
            comprobantes: g.comprobantes,
          })),
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
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => (canEditAll ? setDetail(r) : setWizardOp(r))}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Package size={18} color={C.primary} />
          </View>
          <Text style={styles.client} numberOfLines={1}>
            {r.cliente || 'Operación'}
          </Text>
          <Badge label={meta.label} variant={meta.variant} />
        </View>

        {estadoConsegnaMeta(r.estado_consegna) && (
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Badge label={estadoConsegnaMeta(r.estado_consegna)!.label} variant={estadoConsegnaMeta(r.estado_consegna)!.variant} />
          </View>
        )}

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
              {r.trabajador_nombre || trabajadorNombre(r.trabajador_id) || 'Sin asignar'}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <CalendarClock size={12} color={C.textFaint} />
            <Text style={styles.meta}>{fmtDate(r.fecha_entrega || r.fecha)}</Text>
          </View>
          {!!r.app && (
            <View style={styles.metaItem}>
              <Package size={12} color={C.textFaint} />
              <Text style={styles.meta} numberOfLines={1}>{r.app}</Text>
            </View>
          )}
          {r.compactado && (
            <View style={styles.metaItem}>
              <Text style={[styles.meta, { color: C.info, fontWeight: '700' }]}>Compactado</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      <AppHeader title="Operaciones" subtitle={`${total} operaciones programadas`} />

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <StatCard label="Total" value={stats.total} icon={ClipboardList} color={C.primary} />
          <StatCard label="Pendientes" value={stats.pendientes} icon={CalendarClock} color={C.warning} />
          <StatCard label="En ruta" value={stats.enRuta} icon={Navigation} color={C.info} />
          <StatCard label="Entregados" value={stats.entregados} icon={CheckCircle2} color={C.success} />
        </View>

        <View style={{ marginBottom: S.sm }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar cliente, placa, destino..." />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: S.sm, paddingRight: S.md, alignItems: 'center' }}
          style={{ marginBottom: S.sm, height: 44, flexGrow: 0, flexShrink: 0 }}
        >
          {(() => {
            const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);
            const chip = (key: string | null, label: string, count: number) => {
              const active = selectedEstado === key;
              return (
                <TouchableOpacity
                  key={key || 'ALL'}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSelectedEstado(key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, active && { color: '#fff' }]}>
                    {label}{count ? ` · ${count}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            };
            return [
              chip(null, 'Todos', totalAll),
              ...ALL_ESTADOS.map((e) =>
                chip(e, estadoMeta(e).label, (ESTADO_VARIANTS[e] || [e]).reduce((s, v) => s + (counts[v] || 0), 0)),
              ),
            ];
          })()}
        </ScrollView>

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

      {canEditAll && <Fab onPress={openCreate} />}

      {/* Chofer: flujo por pasos (wizard) al tocar una operación */}
      <ChoferWizard
        visible={!!wizardOp}
        operacion={wizardOp}
        onClose={() => setWizardOp(null)}
        onSaved={() => { setWizardOp(null); load(); }}
      />

      {/* Detalle */}
      <FormModal
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.cliente || 'Operación'}
        footer={
          detail && (
            <View style={{ flexDirection: 'row', gap: S.md }}>
              <View style={{ flex: 1 }}>
                <Button title="Editar" icon={Pencil} variant="secondary" onPress={() => openEdit(detail)} />
              </View>
              {canEditAll && (
                <View style={{ flex: 1 }}>
                  <Button title="Eliminar" icon={Trash2} variant="danger" onPress={() => remove(detail)} />
                </View>
              )}
            </View>
          )
        }
      >
        {detail && (
          <View>
            {!!(detail.lugar_retiro && detail.lugar_entrega) && (() => {
              const stops = [detail.lugar_entrega, ...(detail.destinos || [])].filter(Boolean) as string[];
              return (
                <MapboxWebView
                  style={styles.mapBox}
                  route={{
                    originAddress: detail.lugar_retiro,
                    destinationAddress: stops[stops.length - 1] || detail.lugar_entrega,
                    waypoints: stops.slice(0, -1),
                  }}
                />
              );
            })()}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: S.md }}>
              <Badge label={estadoMeta(detail.estado).label} variant={estadoMeta(detail.estado).variant} />
              {estadoConsegnaMeta(detail.estado_consegna) && (
                <Badge label={estadoConsegnaMeta(detail.estado_consegna)!.label} variant={estadoConsegnaMeta(detail.estado_consegna)!.variant} />
              )}
            </View>
            <InfoRow label="Cliente" value={detail.cliente} />
            <InfoRow label="Origen (retiro)" value={detail.lugar_retiro} />
            <InfoRow label="Fecha retiro" value={fmtDate(detail.fecha_retiro || detail.fecha)} />
            <InfoRow label="Hora retiro" value={detail.hora_retiro} />
            <InfoRow label="Destino (entrega)" value={detail.lugar_entrega} />
            <InfoRow label="Fecha entrega" value={fmtDate(detail.fecha_entrega)} />
            <InfoRow label="ETA" value={detail.eta} />
            <InfoRow label="Vehículo" value={detail.vehiculo_id} />
            <InfoRow label="Conductor" value={detail.trabajador_nombre || trabajadorNombre(detail.trabajador_id) || 'Sin asignar'} />
            {detail.km != null && detail.km !== 0 ? <InfoRow label="KM" value={`${detail.km} km`} /> : null}
            {detail.ciudad ? <InfoRow label="Ciudad" value={detail.ciudad} /> : null}
            {detail.app ? <InfoRow label="App" value={detail.app} /> : null}
            {detail.attesa ? <InfoRow label="Attesa" value={detail.attesa} /> : null}
            {detail.compactado ? <InfoRow label="Compactado" value="Sí" /> : null}
            {detail.otros_datos ? <InfoRow label="Otros datos" value={detail.otros_datos} /> : null}
            {detail.anticipo != null && detail.anticipo !== 0 ? (
              <InfoRow label="Anticipo" value={formatMoney(detail.anticipo, moneda)} />
            ) : null}
            {detail.gastos && detail.gastos.length > 0 ? (
              <InfoRow
                label="Gastos"
                value={`${detail.gastos.length} · ${formatMoney(detail.gastos.reduce((s, g) => s + (g.monto || 0), 0), moneda)}`}
              />
            ) : null}
            <InfoRow label="Nota" value={detail.nota} />

            <Text style={styles.formSection}>Recorrido de la operación</Text>
            <RouteReport key={detail.id} programacionId={detail.id} />
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
        {lockOthers && (
          <View style={styles.roleBanner}>
            <Text style={styles.roleBannerText}>
              Como conductor puedes actualizar el estado, el origen/destino, la bolla y los gastos. El resto es de solo lectura.
            </Text>
          </View>
        )}

        <View style={styles.sectionRow}>
          <Flag size={16} color={C.info} />
          <Text style={styles.formSectionInline}>Estado de la consegna</Text>
        </View>
        <View style={styles.chipsWrap}>
          {CONSEGNA_ACTIONS.map(({ value, label, Icon }) => {
            const active = form.estado_consegna === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.estadoChip, active && styles.estadoChipActive]}
                onPress={() => setForm({ ...form, estado_consegna: active ? '' : value })}
                activeOpacity={0.7}
              >
                <Icon size={14} color={active ? '#fff' : C.textMuted} />
                <Text style={[styles.estadoChipText, active && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.formSection}>Recursos y cliente</Text>

        <Select
          label="Vehículo *"
          value={form.vehiculo_id}
          onChange={(v) => setForm({ ...form, vehiculo_id: v })}
          options={vehiculos.map((v) => ({ value: v.placa, label: v.marca_modelo ? `${v.placa} (${v.marca_modelo})` : v.placa }))}
          placeholder="Selecciona un vehículo"
          searchable
          disabled={lockOthers}
        />

        <Select
          label="Conductor *"
          value={form.trabajador_id}
          onChange={(v) => setForm({ ...form, trabajador_id: v })}
          options={trabajadores.map((w) => ({ value: w.id, label: w.nombre_completo }))}
          placeholder="Selecciona un conductor"
          searchable
          disabled={lockOthers}
        />

        <FormField
          label="Cliente / Destinatario"
          value={form.cliente}
          onChangeText={(t) => setForm({ ...form, cliente: t })}
          placeholder="Nombre del cliente"
          style={{ marginTop: S.md }}
          editable={!lockOthers}
        />

        <Text style={styles.formSection}>Origen (retiro)</Text>
        <View style={styles.chipsWrap}>
          {RETIRO_PRESETS.map((preset) => {
            const active = form.retiro_lugar === preset.value;
            return (
              <TouchableOpacity
                key={preset.value}
                style={[styles.estadoChip, active && styles.estadoChipActive]}
                onPress={() => setForm({ ...form, retiro_lugar: preset.value })}
                activeOpacity={0.7}
              >
                <Text style={[styles.estadoChipText, active && { color: '#fff' }]}>{preset.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.estadoChip}
            onPress={usarPosicionActual}
            activeOpacity={0.7}
          >
            <Text style={styles.estadoChipText}>📍 Posición actual</Text>
          </TouchableOpacity>
        </View>
        <FormField
          label="Dirección de retiro *"
          value={form.retiro_lugar}
          onChangeText={(t) => setForm({ ...form, retiro_lugar: t })}
          placeholder="Ej: Av. Javier Prado Este 4200, Surco"
          style={{ marginTop: S.sm }}
        />
        {isCoords(form.retiro_lugar) && (
          <Text style={styles.gpsHint}>📍 Posición actual (GPS)</Text>
        )}
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

        <Text style={styles.formSection}>Destinos adicionales</Text>
        {form.destinos.map((d, i) => (
          <View key={i} style={styles.destinoRow}>
            <FormField
              label={`Destino ${i + 2}`}
              value={d}
              onChangeText={(t) => updateDestino(i, t)}
              placeholder="Ej: Via Roma 10, Milano"
              style={{ flex: 1 }}
            />
            <TouchableOpacity style={styles.destinoRemove} onPress={() => removeDestino(i)} activeOpacity={0.7}>
              <Trash2 size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addGasto} onPress={addDestino} activeOpacity={0.7}>
          <Plus size={16} color={C.textMuted} />
          <Text style={styles.addGastoText}>Agregar destino</Text>
        </TouchableOpacity>

        <Text style={styles.formSection}>Datos de consegna</Text>
        <View style={styles.dateRow}>
          <FormField
            label="KM"
            value={form.km}
            onChangeText={(t) => setForm({ ...form, km: t })}
            placeholder="0"
            keyboardType="numeric"
            style={{ flex: 1 }}
            editable={!lockOthers}
          />
          <FormField
            label="Ciudad"
            value={form.ciudad}
            onChangeText={(t) => setForm({ ...form, ciudad: t })}
            placeholder="Ej: Milano"
            style={{ flex: 1 }}
            editable={!lockOthers}
          />
        </View>
        <Select
          label="App"
          value={form.app}
          onChange={(v) => setForm({ ...form, app: v })}
          options={APP_OPTIONS}
          placeholder="Selecciona una app"
          searchable
          clearable
          disabled={lockOthers}
        />
        <FormField
          label="Attesa"
          value={form.attesa}
          onChangeText={(t) => setForm({ ...form, attesa: t })}
          placeholder="Ej: 15 min (espera al cliente)"
          editable={!lockOthers}
        />
        <Text style={styles.fieldLabelSm}>¿Compactado?</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !form.compactado && styles.toggleBtnActiveDark, lockOthers && { opacity: 0.55 }]}
            onPress={() => !lockOthers && setForm({ ...form, compactado: false })}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBtnText, !form.compactado && { color: '#fff' }]}>N</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, form.compactado && styles.toggleBtnActiveBlue, lockOthers && { opacity: 0.55 }]}
            onPress={() => !lockOthers && setForm({ ...form, compactado: true })}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBtnText, form.compactado && { color: '#fff' }]}>Y</Text>
          </TouchableOpacity>
        </View>
        <FormField
          label="Otros datos de consegna"
          value={form.otros_datos}
          onChangeText={(t) => setForm({ ...form, otros_datos: t })}
          placeholder="Pega aquí el texto de la consegna (WhatsApp)..."
          multiline
          style={{ marginTop: S.md }}
          editable={!lockOthers}
        />

        <Text style={styles.formSection}>Foto de la bolla (DDT)</Text>
        <ImageUpload
          value={form.foto_bolla}
          onChange={(url) => setForm({ ...form, foto_bolla: url })}
          onClear={() => setForm({ ...form, foto_bolla: '' })}
          label="Subir foto de la bolla"
          variant="wide"
        />

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
              disabled={lockOthers}
            />
          </>
        )}

        <View style={styles.sectionRow}>
          <Wallet size={16} color={C.info} />
          <Text style={styles.formSectionInline}>Rendición / Gastos</Text>
        </View>
        <FormField
          label={`Anticipo recibido (${moneda || 'EUR'})`}
          value={form.anticipo}
          onChangeText={(t) => setForm({ ...form, anticipo: t })}
          placeholder="0.00"
          keyboardType="numeric"
        />

        {form.gastos.map((g, i) => (
          <View key={i} style={styles.gastoCard}>
            <Select
              label="Tipo"
              value={g.tipo}
              onChange={(v) => updateGasto(i, { tipo: v })}
              options={GASTO_TIPOS}
              searchable={false}
            />
            <FormField
              label={`Monto (${moneda || 'EUR'})`}
              value={g.monto}
              onChangeText={(t) => updateGasto(i, { monto: t })}
              placeholder="0.00"
              keyboardType="numeric"
            />
            {g.tipo === 'OTRO' && (
              <FormField
                label="Descripción"
                value={g.descripcion}
                onChangeText={(t) => updateGasto(i, { descripcion: t })}
                placeholder="¿En qué se gastó?"
              />
            )}
            {g.tipo === 'PEAJE' && (
              <FormField
                label="Nº de mancato"
                value={g.numero_mancato}
                onChangeText={(t) => updateGasto(i, { numero_mancato: t })}
                placeholder="Número de mancato pagamento"
              />
            )}
            <Text style={styles.fieldLabelSm}>Comprobante(s)</Text>
            <MultiFileUpload
              value={g.comprobantes}
              onChange={(urls) => updateGasto(i, { comprobantes: urls })}
            />
            <TouchableOpacity style={styles.removeGasto} onPress={() => removeGasto(i)} activeOpacity={0.7}>
              <Trash2 size={14} color={C.danger} />
              <Text style={styles.removeGastoText}>Quitar gasto</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addGasto} onPress={addGasto} activeOpacity={0.7}>
          <Plus size={16} color={C.textMuted} />
          <Text style={styles.addGastoText}>Agregar gasto</Text>
        </TouchableOpacity>

        <View style={styles.saldoBox}>
          <View style={styles.saldoRow}>
            <Text style={styles.saldoLabel}>Anticipo</Text>
            <Text style={styles.saldoVal}>{formatMoney(anticipoNum, moneda)}</Text>
          </View>
          <View style={styles.saldoRow}>
            <Text style={styles.saldoLabel}>Total gastado</Text>
            <Text style={styles.saldoVal}>− {formatMoney(totalGastos, moneda)}</Text>
          </View>
          <View style={[styles.saldoRow, styles.saldoTotal]}>
            <Text style={[styles.saldoLabel, { fontWeight: '700', color: saldo < 0 ? C.danger : C.success }]}>
              {saldo < 0 ? 'Excedido (falta)' : 'A devolver'}
            </Text>
            <Text style={[styles.saldoVal, { fontWeight: '700', color: saldo < 0 ? C.danger : C.success }]}>
              {formatMoney(Math.abs(saldo), moneda)}
            </Text>
          </View>
        </View>

        <FormField
          label="Notas adicionales"
          value={form.nota}
          onChangeText={(t) => setForm({ ...form, nota: t })}
          placeholder="Instrucciones especiales para el conductor..."
          multiline
          style={{ marginTop: S.md }}
          editable={!lockOthers}
        />
      </FormModal>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  body: { flex: 1, paddingHorizontal: S.lg, paddingTop: S.md },
  mapBox: {
    height: 200,
    borderRadius: Theme.radius.lg,
    overflow: 'hidden',
    marginBottom: S.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
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
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: S.lg,
    rowGap: S.sm,
    marginTop: S.md,
    paddingTop: S.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
  filterChip: { paddingHorizontal: S.md, paddingVertical: 8, borderRadius: Theme.radius.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: C.textMuted },

  roleBanner: { backgroundColor: C.warningSoft, borderRadius: Theme.radius.md, padding: S.md, marginBottom: S.sm },
  roleBannerText: { fontSize: 12, color: C.warning },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: S.lg, marginBottom: S.sm },
  formSectionInline: { fontSize: 13, fontWeight: '700', color: C.text, textTransform: 'uppercase' },
  fieldLabelSm: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginBottom: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  gpsHint: { fontSize: 12, color: C.info, fontWeight: '600', marginTop: 4 },
  destinoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: S.sm, marginBottom: S.sm },
  destinoRemove: { paddingBottom: 12, paddingHorizontal: 4 },
  estadoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, paddingVertical: 9, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  estadoChipActive: { backgroundColor: C.info, borderColor: C.info },
  estadoChipText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  toggleBtnActiveDark: { backgroundColor: C.primary, borderColor: C.primary },
  toggleBtnActiveBlue: { backgroundColor: C.info, borderColor: C.info },
  toggleBtnText: { fontSize: 15, fontWeight: '700', color: C.textMuted },
  gastoCard: { backgroundColor: C.surfaceAlt, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.sm },
  removeGasto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
  removeGastoText: { fontSize: 12, fontWeight: '600', color: C.danger },
  addGasto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Theme.radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderStrong, marginBottom: S.sm },
  addGastoText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  saldoBox: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: 6 },
  saldoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saldoTotal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 6, marginTop: 2 },
  saldoLabel: { fontSize: 13, color: C.textMuted },
  saldoVal: { fontSize: 13, color: C.text },
});
