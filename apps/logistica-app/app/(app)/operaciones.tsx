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
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import {
  Package,
  MapPin,
  Truck,
  User,
  Pencil,
  CalendarClock,
  AlarmClock,
  ClipboardList,
  CheckCircle2,
  Navigation,
  Flag,
  Wallet,
  Plus,
  Trash2,
  Lock,
  Ban,
  Gauge,
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
import { etaInfo } from '../../constants/eta';
import ChoferWizard from '../../components/ChoferWizard';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../constants/currency';
import { isChofer } from '../../constants/modules';
import { APP_OPTIONS, SPEDIZIONE_OPTIONS, GASTO_TIPOS, CONSEGNA_ACTIONS, estadoConsegnaMeta, RETIRO_PRESETS, isCoords, isConsegnaRealizada } from '../../constants/operaciones';
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

// Hora (HH:MM) en horario de Italia — para "Arribo estimado" y "ETA máx" en la tarjeta.
const fmtHoraIt = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
};
const estadoMeta = (e?: string) => ESTADO_META[e || 'PENDIENTE'] || ESTADO_META.PENDIENTE;

// Estado "efectivo" para mostrar: `Consegnato` y `Entregado` son el mismo hecho
// (mercancía entregada). Si la consegna ya está realizada, mostramos "Entregado"
// aunque el estado principal no se haya actualizado, para no confundir con "Pendiente".
const estadoEfectivo = (r?: { estado?: string | null; estado_consegna?: string | null } | null) =>
  isConsegnaRealizada(r) ? 'ENTREGADO' : (r?.estado || 'PENDIENTE');

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
  spedizione: string;
  retiro_lugar: string;
  retiro_fecha: string;
  retiro_hora: string;
  retiros: string[];
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
  reperibilita: boolean;
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
  spedizione: '',
  retiro_lugar: '',
  retiro_fecha: todayISO(),
  retiro_hora: '',
  retiros: [],
  entrega_lugar: '',
  entrega_fecha: todayISO(),
  entrega_hora: '',
  destinos: [],
  nota: '',
  estado: 'PENDIENTE',
  km: '',
  ciudad: '',
  app: '',
  reperibilita: false,
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
  // Gestión completa (crear/editar/eliminar) para TODOS los que no son chofer:
  // admin y supervisores con el módulo de operaciones. Solo el chofer queda
  // restringido a su flujo (itinerario, estado, bolla y gastos).
  const canEditAll = !!user && !isChofer(user);
  const lockOthers = !canEditAll;
  const moneda = user?.moneda;
  // Al entrar desde el menú llegamos con un filtro pre-activado:
  //  ?mias=1 → «Mis consegnas» (las asignadas al usuario logueado)
  //  ?sup=1  → «Supervisores» (asignadas a cualquier supervisor)
  const { sup, mias } = useLocalSearchParams<{ sup?: string; mias?: string }>();
  const [items, setItems] = useState<Programacion[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedEstado, setSelectedEstado] = useState<string | null>(null);
  const [soloSupervisores, setSoloSupervisores] = useState(false); // filtro: consegnas de supervisores
  const [soloMias, setSoloMias] = useState(false); // filtro: mis consegnas (del usuario logueado)
  // Resumen personal (igual que el chofer): entregadas/canceladas + km del mes.
  const [miResumen, setMiResumen] = useState<{ total: number; entregadas: number; canceladas: number; km: number } | null>(null);
  // Recorridos activos indexados por operación → ETA de Maps en vivo en las tarjetas.
  const [activosById, setActivosById] = useState<Record<string, any>>({});

  const [detail, setDetail] = useState<Programacion | null>(null);
  const [wizardOp, setWizardOp] = useState<Programacion | null>(null); // chofer: flujo por pasos
  const [detailDeviceId, setDetailDeviceId] = useState<string>('');
  const [detailActivo, setDetailActivo] = useState<any>(null);
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
      // ETA en vivo (Maps): recorridos activos indexados por operación.
      try {
        const aRes = await api.get('/recorridos/activos');
        const arr = Array.isArray(aRes.data) ? aRes.data : [];
        const map: Record<string, any> = {};
        arr.forEach((a: any) => { if (a?.programacion_id) map[a.programacion_id] = a; });
        setActivosById(map);
      } catch { setActivosById({}); }
    } catch (e) {
      console.error('Error cargando operaciones', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedEstado]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Filtro pre-activado desde el menú. Solo aplica a supervisores/admin.
  useEffect(() => {
    if (mias === '1' && canEditAll) setSoloMias(true);
    if (sup === '1' && canEditAll) setSoloSupervisores(true);
  }, [mias, sup, canEditAll]);

  // Al activar "Mis consegnas" cargamos el mismo resumen que ve el chofer
  // (endpoints scopeados al trabajador del usuario, no dependen de solo_propios).
  useEffect(() => {
    if (!soloMias) return;
    let cancelled = false;
    (async () => {
      try {
        const [rr, reg] = await Promise.all([
          api.get('/recorridos/mio/resumen').catch(() => null),
          api.get('/registros/mias/resumen').catch(() => null),
        ]);
        if (cancelled) return;
        const e = rr?.data?.entregas || {};
        setMiResumen({
          total: e.total ?? 0,
          entregadas: e.entregadas ?? 0,
          canceladas: e.canceladas ?? 0,
          km: Number(reg?.data?.km ?? 0),
        });
      } catch { if (!cancelled) setMiResumen(null); }
    })();
    return () => { cancelled = true; };
  }, [soloMias]);

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

  // Recorrido activo de esta operación (para mostrar ETA en vivo + contómetro de entrega).
  useEffect(() => {
    if (!detail?.id) { setDetailActivo(null); return; }
    let cancelled = false;
    setDetailActivo(null);
    api.get('/recorridos/activos')
      .then((res) => {
        if (cancelled) return;
        const arr = Array.isArray(res.data) ? res.data : [];
        setDetailActivo(arr.find((a: any) => a.programacion_id === detail.id) || null);
      })
      .catch(() => { if (!cancelled) setDetailActivo(null); });
    return () => { cancelled = true; };
  }, [detail?.id]);

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

  // Una operación es "de supervisor" si su trabajador asignado tiene cargo de supervisor.
  const esSupervisorId = useCallback(
    (id?: string | null): boolean => {
      if (!id) return false;
      const w = trabajadores.find((t) => t.id === id || t.id_trabajador === id);
      return !!w && /supervis/i.test(w.cargo || '');
    },
    [trabajadores]
  );

  // Una operación es "mía" si está asignada al trabajador vinculado al usuario logueado.
  const misKeys = useMemo(
    () => [user?.trabajador_id, user?.trabajador_codigo].filter(Boolean) as string[],
    [user?.trabajador_id, user?.trabajador_codigo]
  );
  const esMiaId = useCallback(
    (id?: string | null): boolean => !!id && misKeys.includes(id),
    [misKeys]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const data = items.filter(
      (r) =>
        ((r.cliente?.toLowerCase() || '').includes(q) ||
          (r.vehiculo_id?.toLowerCase() || '').includes(q) ||
          (r.lugar_entrega?.toLowerCase() || '').includes(q) ||
          (r.lugar_retiro?.toLowerCase() || '').includes(q) ||
          (r.id_programacion?.toLowerCase() || '').includes(q)) &&
        (!soloSupervisores || esSupervisorId(r.trabajador_id)) &&
        (!soloMias || esMiaId(r.trabajador_id))
    );
    return data.sort(
      (a, b) =>
        new Date(b.fecha_entrega || b.fecha).getTime() -
        new Date(a.fecha_entrega || a.fecha).getTime()
    );
  }, [items, query, soloSupervisores, esSupervisorId, soloMias, esMiaId]);

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
    spedizione: src.spedizione || '',
    retiro_lugar: src.lugar_retiro || '',
    retiro_fecha: src.fecha_retiro ? src.fecha_retiro.split('T')[0] : todayISO(),
    retiro_hora: src.hora_retiro || '',
    retiros: Array.isArray(src.retiros) ? src.retiros : [],
    entrega_lugar: src.lugar_entrega || '',
    entrega_fecha: src.fecha_entrega ? src.fecha_entrega.split('T')[0] : todayISO(),
    entrega_hora: '',
    destinos: Array.isArray(src.destinos) ? src.destinos : [],
    nota: src.nota || '',
    estado: src.estado || 'PENDIENTE',
    km: src.km != null ? String(src.km) : '',
    ciudad: src.ciudad || '',
    app: src.app || '',
    reperibilita: !!src.reperibilita,
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
    // Bloqueo pedido por dirección: una consegna ya realizada (entregado /
    // consegnato) no se puede editar. Solo se permite eliminarla (admin).
    if (isConsegnaRealizada(r)) {
      Alert.alert('Consegna realizada', 'Esta operación ya fue entregada (consegnato). No se puede editar.');
      return;
    }
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

  // Orígenes/retiros adicionales: mismo patrón que destinos. El primero es
  // `retiro_lugar`; estos son los almacenes intermedios (ej. B-service).
  const addRetiro = () => setForm((f) => ({ ...f, retiros: [...f.retiros, ''] }));
  const updateRetiro = (i: number, val: string) => setForm((f) => ({ ...f, retiros: f.retiros.map((d, idx) => (idx === i ? val : d)) }));
  const removeRetiro = (i: number) => setForm((f) => ({ ...f, retiros: f.retiros.filter((_, idx) => idx !== i) }));

  // --- Gastos (rendición) ---
  const addGasto = () => setForm((f) => ({ ...f, gastos: [...f.gastos, { tipo: 'PEAJE', monto: '', descripcion: '', numero_mancato: '', comprobantes: [] }] }));
  const updateGasto = (i: number, patch: Partial<GastoRow>) => setForm((f) => ({ ...f, gastos: f.gastos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
  const removeGasto = (i: number) => setForm((f) => ({ ...f, gastos: f.gastos.filter((_, idx) => idx !== i) }));
  const totalGastos = form.gastos.reduce((s, g) => s + (g.monto !== '' ? Number(g.monto) || 0 : 0), 0);
  const anticipoNum = form.anticipo !== '' ? Number(form.anticipo) || 0 : 0;
  const saldo = anticipoNum - totalGastos;

  const save = async () => {
    // Defensa: no permitir guardar cambios sobre una consegna ya realizada.
    if (editing && isConsegnaRealizada(editing)) {
      Alert.alert('Consegna realizada', 'Esta operación ya fue entregada (consegnato). No se puede editar.');
      return;
    }
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
        spedizione: form.spedizione || null,
        lugar_retiro: form.retiro_lugar,
        fecha_retiro: toIso(form.retiro_fecha, form.retiro_hora, '00:00'),
        hora_retiro: form.retiro_hora,
        retiros: form.retiros.map((s) => s.trim()).filter(Boolean),
        lugar_entrega: form.entrega_lugar,
        fecha_entrega: toIso(form.entrega_fecha, form.entrega_hora, '23:59'),
        destinos: form.destinos.map((s) => s.trim()).filter(Boolean),
        nota: form.nota,
        km: form.km !== '' ? Number(form.km) : null,
        ciudad: form.ciudad || null,
        app: form.app || null,
        reperibilita: form.reperibilita,
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
    const meta = estadoMeta(estadoEfectivo(r));
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

        {/* Disponibilidad del chofer (Maps): solo con recorrido activo. En el
            regreso, el ETA es el tiempo hasta quedar libre para otra consegna. */}
        {(() => {
          const activo = activosById[r.id];
          if (!activo) return null;
          // El ETA (min) solo existe con posición GPS válida y ruta calculable.
          // Si no, mostramos igual el estado del recorrido para que el supervisor
          // sepa que el chofer va/vuelve (el ETA aparece en cuanto llega el GPS).
          const eta = activo.etaMin;
          let label: string | null = null;
          let color = C.info;
          if (activo.descansando) { label = 'Chofer en descanso'; color = C.warning; }
          else if (activo.estado === 'EN_RUTA_IDA') {
            if (eta != null) {
              // Arribo estimado = ahora + ETA de Maps (posición en vivo → destino).
              // Se compara con la hora límite (ETA) para ver si llega a tiempo.
              const arribo = new Date(Date.now() + eta * 60000);
              const dl = r.fecha_entrega ? new Date(r.fecha_entrega) : null;
              const late = dl ? arribo.getTime() > dl.getTime() : false;
              color = late ? C.danger : C.success;
              label = `Arribo ~${fmtHoraIt(arribo)}` + (dl ? ` · ETA máx ${fmtHoraIt(dl)}` : '');
            } else {
              label = 'En ruta al destino';
            }
          }
          else if (activo.estado === 'EN_DESTINO') { label = 'En destino (entregando)'; color = C.warning; }
          else if (activo.estado === 'EN_RUTA_VUELTA') { label = eta != null ? `Regresa · libre en ~${eta} min` : 'Regresando a base'; color = C.success; }
          if (!label) return null;
          return (
            <View style={[styles.etaChip, { backgroundColor: color + '14', borderColor: color + '44' }]}>
              <Navigation size={12} color={color} />
              <Text style={[styles.etaChipText, { color }]}>
                {label}{eta != null ? ' (Maps)' : ''}{activo.sinGps ? ' · sin GPS' : ''}
              </Text>
            </View>
          );
        })()}

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
      <AppHeader
        title={soloMias ? 'Mis consegnas' : 'Operaciones'}
        subtitle={soloMias ? `${filtered.length} entregas tuyas` : `${total} operaciones programadas`}
      />

      <View style={styles.body}>
        {soloMias ? (
          // Resumen personal del supervisor (mismas cifras que el chofer): base de sus metas.
          <View style={styles.statsRow}>
            <StatCard label="Entregadas" value={miResumen?.entregadas ?? 0} icon={CheckCircle2} color={C.success} />
            <StatCard label="Canceladas" value={miResumen?.canceladas ?? 0} icon={Ban} color={C.danger} />
            <StatCard label="Km del mes" value={Math.round(miResumen?.km ?? 0)} icon={Gauge} color={C.info} />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <StatCard label="Total" value={stats.total} icon={ClipboardList} color={C.primary} />
            <StatCard label="Pendientes" value={stats.pendientes} icon={CalendarClock} color={C.warning} />
            <StatCard label="En ruta" value={stats.enRuta} icon={Navigation} color={C.info} />
            <StatCard label="Entregados" value={stats.entregados} icon={CheckCircle2} color={C.success} />
          </View>
        )}

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
            const supCount = items.filter((r) => esSupervisorId(r.trabajador_id)).length;
            const miasCount = items.filter((r) => esMiaId(r.trabajador_id)).length;
            return [
              chip(null, 'Todos', totalAll),
              ...ALL_ESTADOS.map((e) =>
                chip(e, estadoMeta(e).label, (ESTADO_VARIANTS[e] || [e]).reduce((s, v) => s + (counts[v] || 0), 0)),
              ),
              // "Mis consegnas": las entregas del propio usuario (supervisor por metas).
              // Solo si su usuario está vinculado a un trabajador.
              canEditAll && misKeys.length > 0 ? (
                <TouchableOpacity
                  key="MIAS"
                  style={[styles.filterChip, soloMias && styles.filterChipActive]}
                  onPress={() => setSoloMias((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, soloMias && { color: '#fff' }]}>
                    Mis consegnas{miasCount ? ` · ${miasCount}` : ''}
                  </Text>
                </TouchableOpacity>
              ) : null,
              // Filtro por eje distinto (no estado): consegnas asignadas a supervisores.
              // Solo para supervisores/admin — no tiene sentido para el chofer.
              canEditAll ? (
                <TouchableOpacity
                  key="SUPERVISORES"
                  style={[styles.filterChip, soloSupervisores && styles.filterChipActive]}
                  onPress={() => setSoloSupervisores((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, soloSupervisores && { color: '#fff' }]}>
                    Supervisores{supCount ? ` · ${supCount}` : ''}
                  </Text>
                </TouchableOpacity>
              ) : null,
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
            <View style={{ gap: S.sm }}>
              {/* Supervisor que también es chofer: si la consegna está asignada a él,
                  puede operarla como chofer. Con recorrido activo permite CONTINUAR
                  (p. ej. regreso al origen) aunque la consegna ya esté consegnata. */}
              {esMiaId(detail.trabajador_id) && (!!activosById[detail.id] || !isConsegnaRealizada(detail)) && (
                <Button
                  title={activosById[detail.id] ? 'Continuar como chofer' : 'Operar como chofer (Iniciar ruta)'}
                  icon={Navigation}
                  onPress={() => { const op = detail; setDetail(null); setWizardOp(op); }}
                />
              )}
              <View style={{ flexDirection: 'row', gap: S.md }}>
                {isConsegnaRealizada(detail) ? (
                  <View style={[styles.lockNote, { flex: 1 }]}>
                    <Lock size={15} color={C.textMuted} />
                    <Text style={styles.lockNoteText}>Consegna realizada · edición bloqueada</Text>
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Button title="Editar" icon={Pencil} variant="secondary" onPress={() => openEdit(detail)} />
                  </View>
                )}
                {canEditAll && (
                  <View style={{ flex: 1 }}>
                    <Button title="Eliminar" icon={Trash2} variant="danger" onPress={() => remove(detail)} />
                  </View>
                )}
              </View>
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
              <Badge label={estadoMeta(estadoEfectivo(detail)).label} variant={estadoMeta(estadoEfectivo(detail)).variant} />
              {estadoConsegnaMeta(detail.estado_consegna) && (
                <Badge label={estadoConsegnaMeta(detail.estado_consegna)!.label} variant={estadoConsegnaMeta(detail.estado_consegna)!.variant} />
              )}
            </View>
            <InfoRow label="Cliente" value={detail.cliente} />
            <InfoRow label="Origen (retiro)" value={detail.lugar_retiro} />
            <InfoRow label="Fecha retiro" value={fmtDate(detail.fecha_retiro || detail.fecha)} />
            <InfoRow label="Hora retiro" value={detail.hora_retiro} />
            <InfoRow label="Destino (entrega)" value={detail.lugar_entrega} />
            <InfoRow label="ETA (entrega máx)" value={etaInfo(detail.fecha_entrega)?.deadline || fmtDate(detail.fecha_entrega)} />
            {(() => {
              // «Tiempo per arrivare»: ETA de viaje al destino en vivo (Maps), desde que el
              // chofer INICIÓ la ruta (EN_RUTA_IDA). Antes de arrancar no hay viaje que estimar,
              // así que cae al campo `eta` guardado (normalmente vacío → «—»).
              const enIda = detailActivo?.estado === 'EN_RUTA_IDA' && !detailActivo?.sinGps
                ? (detailActivo.etaMin ?? null) : null;
              const val = enIda != null
                ? `Llega ~${fmtHoraIt(new Date(Date.now() + enIda * 60000))} · ${enIda} min`
                : detail.eta;
              return <InfoRow label="ETA (tiempo per arrivare)" value={val} />;
            })()}
            <InfoRow label="Vehículo" value={detail.vehiculo_id} />
            <InfoRow label="Conductor" value={detail.trabajador_nombre || trabajadorNombre(detail.trabajador_id) || 'Sin asignar'} />
            {detail.km != null && detail.km !== 0 ? <InfoRow label="KM" value={`${detail.km} km`} /> : null}
            {detail.ciudad ? <InfoRow label="Ciudad" value={detail.ciudad} /> : null}
            {detail.app ? <InfoRow label="App" value={detail.app} /> : null}
            {detail.attesa ? <InfoRow label="Attesa" value={detail.attesa} /> : null}
            {detail.compactado ? <InfoRow label="Compactado" value="Sí" /> : null}
            {detail.otros_datos ? <InfoRow label="Otros datos" value={detail.otros_datos} /> : null}
            {detail.anticipo != null && detail.anticipo !== 0 ? (
              <InfoRow label="Bonifico" value={formatMoney(detail.anticipo, moneda)} />
            ) : null}
            {detail.gastos && detail.gastos.length > 0 ? (
              <InfoRow
                label="Gastos"
                value={`${detail.gastos.length} · ${formatMoney(detail.gastos.reduce((s, g) => s + (g.monto || 0), 0), moneda)}`}
              />
            ) : null}
            <InfoRow label="Nota" value={detail.nota} />

            {detailActivo && (
              <View style={styles.liveCard}>
                <View style={styles.liveRow}>
                  <Navigation size={16} color={C.info} />
                  <Text style={styles.liveText}>
                    {detailActivo.estado === 'EN_RUTA_IDA'
                      ? `Chofer llega en ~${detailActivo.disponibleEnMin ?? detailActivo.etaMin ?? '—'} min (Maps)`
                      : detailActivo.estado === 'EN_DESTINO'
                        ? 'Chofer en el destino'
                        : detailActivo.descansando
                          ? 'Chofer en descanso'
                          : `Disponible en ~${detailActivo.disponibleEnMin ?? detailActivo.etaMin ?? '—'} min`}
                  </Text>
                </View>
                {(() => {
                  const eta = etaInfo(detailActivo.fecha_entrega ?? detail.fecha_entrega);
                  if (!eta) return null;
                  return (
                    <View style={styles.liveRow}>
                      <AlarmClock size={16} color={eta.color} />
                      <Text style={[styles.liveText, { fontWeight: '700', color: eta.color }]}>
                        ETA · entrega máx {eta.deadline} — {eta.countdown}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}

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

        <Select
          label="Spedizione"
          value={form.spedizione}
          onChange={(v) => setForm({ ...form, spedizione: v })}
          options={SPEDIZIONE_OPTIONS}
          placeholder="Selecciona spedizione"
          clearable
          disabled={lockOthers}
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

        <Text style={styles.formSection}>Orígenes adicionales</Text>
        {form.retiros.map((r, i) => (
          <View key={i} style={styles.destinoRow}>
            <FormField
              label={`Retiro ${i + 2}`}
              value={r}
              onChangeText={(t) => updateRetiro(i, t)}
              placeholder="Ej: B-Service, Via ... (otro almacén)"
              style={{ flex: 1 }}
            />
            <TouchableOpacity style={styles.destinoRemove} onPress={() => removeRetiro(i)} activeOpacity={0.7}>
              <Trash2 size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addGasto} onPress={addRetiro} activeOpacity={0.7}>
          <Plus size={16} color={C.textMuted} />
          <Text style={styles.addGastoText}>Agregar retiro</Text>
        </TouchableOpacity>

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
        {/* La Attesa la registra el chofer al finalizar la consegna; por eso NO
            aparece al crear. Al EDITAR sí, para que el supervisor pueda corregirla. */}
        {editing && (
          <FormField
            label="Attesa"
            value={form.attesa}
            onChangeText={(t) => setForm({ ...form, attesa: t })}
            placeholder="Ej: 15 min (espera al cliente)"
            editable={!lockOthers}
          />
        )}
        <Text style={styles.fieldLabelSm}>¿Reperibilità (disponible on-call)?</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !form.reperibilita && styles.toggleBtnActiveDark, lockOthers && { opacity: 0.55 }]}
            onPress={() => !lockOthers && setForm({ ...form, reperibilita: false })}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBtnText, !form.reperibilita && { color: '#fff' }]}>N</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, form.reperibilita && styles.toggleBtnActiveBlue, lockOthers && { opacity: 0.55 }]}
            onPress={() => !lockOthers && setForm({ ...form, reperibilita: true })}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBtnText, form.reperibilita && { color: '#fff' }]}>Y</Text>
          </TouchableOpacity>
        </View>

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
          label={`Bonifico recibido (${moneda || 'EUR'})`}
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
            <Text style={styles.saldoLabel}>Bonifico</Text>
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
  etaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: S.sm, paddingVertical: 5, borderRadius: Theme.radius.full, backgroundColor: C.info + '14', borderWidth: 1, borderColor: C.info + '44' },
  etaChipText: { fontSize: 12, fontWeight: '700', color: C.info },
  liveCard: { gap: S.sm, backgroundColor: C.surfaceAlt, borderRadius: Theme.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.md, marginTop: S.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  liveText: { flex: 1, fontSize: 13, color: C.text },
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
  lockNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: S.md, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  lockNoteText: { fontSize: 13, fontWeight: '600', color: C.textMuted, textAlign: 'center' },
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
