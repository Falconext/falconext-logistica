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
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
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
import { APP_OPTIONS, SPEDIZIONE_OPTIONS, GASTO_TIPOS, GASTO_TIPOS_CON_PAGADOR, totalPagadoPorChofer, pagadorLabels, categoriaVehiculoLabel, CONSEGNA_ACTIONS, estadoConsegnaMeta, RETIRO_PRESETS, isCoords, isConsegnaRealizada, calcularIngresoSugerido, TarifasIngreso } from '../../constants/operaciones';
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

// Rango del mes en curso (primer y último día), en formato YYYY-MM-DD.
// Es el valor por defecto del filtro de fechas del supervisor.
const monthRangeISO = () => {
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

type GastoRow = { tipo: string; monto: string; descripcion: string; numero_mancato: string; comprobantes: string[]; pagado_por_chofer: boolean };

// Fecha/hora de un retiro adicional (paralelo a `retiros[]` por índice).
type RetiroDetalleRow = { fecha: string; hora: string };
const emptyRetiroDetalle = (): RetiroDetalleRow => ({ fecha: '', hora: '' });

// Detalle de un destino adicional (paralelo a `destinos[]` por índice). fecha/hora
// sirven para cualquier ruta; cliente/spedizione/km_facturable/ingreso solo se usan
// cuando la operación es "compactada" (2+ entregas reales de clientes distintos).
type DestinoDetalleRow = { fecha: string; hora: string; cliente: string; spedizione: string; km_facturable: string; ingreso: string };
const emptyDestinoDetalle = (): DestinoDetalleRow => ({ fecha: '', hora: '', cliente: '', spedizione: '', km_facturable: '', ingreso: '' });
const buildRetirosDetalle = (src: any): RetiroDetalleRow[] => {
  const arr = Array.isArray(src.retiros) ? src.retiros : [];
  const fromApi = Array.isArray(src.retiros_detalle) ? src.retiros_detalle : [];
  return arr.map((_: string, i: number) => ({ fecha: fromApi[i]?.fecha || '', hora: fromApi[i]?.hora || '' }));
};
const buildDestinosDetalle = (src: any): DestinoDetalleRow[] => {
  const arr = Array.isArray(src.destinos) ? src.destinos : [];
  const fromApi = Array.isArray(src.destinos_detalle) ? src.destinos_detalle : [];
  return arr.map((_: string, i: number) => ({
    fecha: fromApi[i]?.fecha || '',
    hora: fromApi[i]?.hora || '',
    cliente: fromApi[i]?.cliente || '',
    spedizione: fromApi[i]?.spedizione || '',
    km_facturable: fromApi[i]?.km_facturable != null ? String(fromApi[i].km_facturable) : '',
    ingreso: fromApi[i]?.ingreso != null ? String(fromApi[i].ingreso) : '',
  }));
};

interface FormState {
  vehiculo_id: string;
  trabajador_id: string;
  cliente: string;
  spedizione: string;
  retiro_lugar: string;
  retiro_fecha: string;
  retiro_hora: string;
  retiros: string[];
  retirosDetalle: RetiroDetalleRow[];
  entrega_lugar: string;
  entrega_fecha: string;
  entrega_hora: string;
  destinos: string[];
  destinosDetalle: DestinoDetalleRow[];
  nota: string;
  estado: string;
  // Datos de consegna
  km: string;
  // Ingreso por km facturable (DHL/AB Servis): el km_ida que informa el cliente
  // (no el km real GPS) + el monto a cobrar (sugerido por categoría, editable).
  km_facturable: string;
  ingreso_estimado: string;
  ciudad: string;
  app: string;
  reperibilita: boolean;
  // Navetta: traslado/lanzadera entre almacenes (no una entrega normal). El
  // ingreso sugerido pasa a ser SIEMPRE el fijo de navetta, sin importar km/categoría.
  es_navetta: boolean;
  compactado: boolean;
  estado_consegna: string;
  attesa: string;
  otros_datos: string;
  foto_bolla: string;
  // Rendición
  anticipo: string;
  abonos_ruta: number; // solo lectura: abonos que el chofer recibió en ruta (backend)
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
  retirosDetalle: [],
  entrega_lugar: '',
  entrega_fecha: todayISO(),
  entrega_hora: '',
  destinos: [],
  destinosDetalle: [],
  nota: '',
  estado: 'PENDIENTE',
  km: '',
  km_facturable: '',
  ingreso_estimado: '',
  ciudad: '',
  app: '',
  reperibilita: false,
  es_navetta: false,
  compactado: false,
  estado_consegna: '',
  attesa: '',
  otros_datos: '',
  foto_bolla: '',
  anticipo: '',
  abonos_ruta: 0,
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
  // Consegnas del chofer/supervisor: por defecto "Todos" (que ya excluye las
  // pendientes vía ocultarPendientes → en ruta + entregadas). Las pendientes se
  // trabajan desde "Mi Ruta".
  const [selectedEstado, setSelectedEstado] = useState<string | null>(null);
  const [soloSupervisores, setSoloSupervisores] = useState(false); // filtro: consegnas de supervisores
  const [soloMias, setSoloMias] = useState(false); // filtro: mis consegnas (del usuario logueado)
  // Filtros del supervisor: por rango de fechas, trabajador y spedizione (cada supervisor
  // suele estar asignado a una spedizione: Extras Alfredo / DHL / AB…).
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Por defecto el supervisor ve el mes en curso (1° → último día). El chofer sin filtro.
  const [fFrom, setFFrom] = useState(() => (canEditAll ? monthRangeISO().from : '')); // fecha desde (YYYY-MM-DD)
  const [fTo, setFTo] = useState(() => (canEditAll ? monthRangeISO().to : ''));       // fecha hasta (YYYY-MM-DD)
  const [fTrabajador, setFTrabajador] = useState(''); // id del trabajador
  const [fSpedizione, setFSpedizione] = useState('');  // valor de spedizione
  // Resumen personal (igual que el chofer): entregadas/canceladas + km del mes.
  const [miResumen, setMiResumen] = useState<{ total: number; entregadas: number; canceladas: number; km: number } | null>(null);
  // Recorridos activos indexados por operación → ETA de Maps en vivo en las tarjetas.
  const [activosById, setActivosById] = useState<Record<string, any>>({});

  const [detail, setDetail] = useState<Programacion | null>(null);
  // Abre el detalle con el item de la lista (rápido) y lo enriquece con el registro
  // completo (la lista no trae anticipo/abonos_ruta/gastos, necesarios para el Control del dinero).
  const openDetail = (r: Programacion) => {
    setDetail(r);
    api.get(`/programacion/${r.id}`).then((res) => {
      if (res.data) setDetail((cur) => (cur && cur.id === r.id ? { ...cur, ...res.data } : cur));
    }).catch(() => {});
  };
  const [attesaHorasEdit, setAttesaHorasEdit] = useState<string>(''); // supervisor: corregir horas de attesa
  const [attesaBusy, setAttesaBusy] = useState(false);
  const [wizardOp, setWizardOp] = useState<Programacion | null>(null); // chofer: flujo por pasos

  // Supervisor autoriza/rechaza la attesa declarada por el chofer (puede corregir horas).
  const decidirAttesa = async (estado: 'AUTORIZADO' | 'DENEGADO') => {
    if (!detail) return;
    setAttesaBusy(true);
    try {
      const horas = attesaHorasEdit !== '' ? Number(attesaHorasEdit) : undefined;
      const res = await api.patch(`/programacion/${detail.id}/attesa-autorizacion`, { estado, horas });
      setDetail(res.data || null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar la attesa.');
    } finally {
      setAttesaBusy(false);
    }
  };
  const [detailDeviceId, setDetailDeviceId] = useState<string>('');
  const [detailActivo, setDetailActivo] = useState<any>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Programacion | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  // Tarifas de la empresa (factor €/km por categoría, mínimo <35km, navetta) para
  // autocompletar el ingreso EN VIVO mientras se escribe el km facturable.
  const [tarifasConfig, setTarifasConfig] = useState<TarifasIngreso | null>(null);
  useEffect(() => {
    api.get('/registros/config').then((res) => setTarifasConfig(res.data ?? null)).catch(() => {});
  }, []);

  // Categoría del vehículo elegido (vehiculo_id guarda la PLACA, no el id).
  const categoriaDeVehiculo = (vehiculoId: string) =>
    vehiculos.find((v) => v.placa === vehiculoId || v.id === vehiculoId)?.categoria ?? null;

  // Sugerencia EN VIVO (solo para el hint informativo — no muta el form).
  const ingresoSugerido = useMemo(
    () => calcularIngresoSugerido(form.km_facturable, categoriaDeVehiculo(form.vehiculo_id), form.es_navetta, form.spedizione, tarifasConfig),
    [form.km_facturable, form.vehiculo_id, form.es_navetta, form.spedizione, vehiculos, tarifasConfig],
  );

  // Aplica la sugerencia al `ingreso_estimado` de un form ya actualizado (se llama
  // SOLO desde los handlers de km/vehículo/navetta/spedizione, nunca al precargar
  // un registro existente — así nunca pisa un ingreso ya guardado por el supervisor).
  const aplicarIngresoAuto = (f: FormState): FormState => {
    const sug = calcularIngresoSugerido(f.km_facturable, categoriaDeVehiculo(f.vehiculo_id), f.es_navetta, f.spedizione, tarifasConfig);
    return sug ? { ...f, ingreso_estimado: String(sug.monto) } : f;
  };

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
  // Al abrir el detalle, precargar las horas de attesa para el editor del supervisor.
  useEffect(() => {
    setAttesaHorasEdit(detail?.attesa_horas != null ? String(detail.attesa_horas) : '');
  }, [detail?.id]);

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

  // El supervisor necesita el catálogo de trabajadores/vehículos para el FILTRO
  // por trabajador (no solo al abrir el formulario). Se carga una vez al entrar.
  useEffect(() => {
    if (canEditAll) loadResources();
  }, [canEditAll, loadResources]);

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

  // Vista personal del chofer/supervisor ("Consegnas" / "Mis consegnas"): las
  // consegnas PENDIENTES (aún no aceptadas+iniciadas) NO se muestran aquí — solo
  // aparecen en "Mi Ruta". Aquí se ven las que ya están EN RUTA (recorrido activo)
  // o ENTREGADAS. Pedido del empresario.
  const ocultarPendientes = isChofer(user) || soloMias;

  // Opciones de spedizione para el filtro: las fijas del negocio + las que existan
  // realmente en los datos (por si aparece una nueva, ej. "Roma").
  const spedizioneOptions = useMemo(() => {
    const seen = new Map<string, string>();
    SPEDIZIONE_OPTIONS.forEach((o) => seen.set(o.value, o.label));
    items.forEach((r) => {
      const s = (r.spedizione || '').trim();
      if (s && !seen.has(s)) seen.set(s, s);
    });
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [items]);

  // ¿La operación pertenece al trabajador filtrado? (acepta UUID o código legacy).
  const matchTrabajador = useCallback((tid?: string | null) => {
    if (!fTrabajador) return true;
    if (tid === fTrabajador) return true;
    const w = trabajadores.find((t) => t.id === fTrabajador);
    return !!(w && tid && (tid === (w as any).id_trabajador));
  }, [fTrabajador, trabajadores]);

  // Fecha de la operación (retiro) en formato YYYY-MM-DD, para el filtro por rango.
  const opDateISO = (r: Programacion) => {
    const d = (r as any).fecha_retiro || r.fecha;
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
  };

  // El rango del mes por defecto no cuenta como "filtro activo" (es la vista base):
  // solo marcamos activos las fechas si difieren del mes en curso.
  const mr = canEditAll ? monthRangeISO() : { from: '', to: '' };
  const fechaCustom = fFrom !== mr.from || fTo !== mr.to; // ≠ mes en curso = filtro de fecha activo
  const activeFilterCount = (fechaCustom ? 1 : 0) + (fTrabajador ? 1 : 0) + (fSpedizione ? 1 : 0);
  // "Limpiar" vuelve a la vista base: mes en curso (supervisor) + sin trabajador/spedizione.
  const clearFilters = () => { setFFrom(mr.from); setFTo(mr.to); setFTrabajador(''); setFSpedizione(''); };

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
        (!soloMias || esMiaId(r.trabajador_id)) &&
        matchTrabajador(r.trabajador_id) &&
        (!fSpedizione || (r.spedizione || '').trim() === fSpedizione) &&
        (!fFrom || opDateISO(r) >= fFrom) &&
        (!fTo || opDateISO(r) <= fTo) &&
        (!ocultarPendientes || isConsegnaRealizada(r) || !!activosById[r.id])
    );
    return data.sort(
      (a, b) =>
        new Date(b.fecha_entrega || b.fecha).getTime() -
        new Date(a.fecha_entrega || a.fecha).getTime()
    );
  }, [items, query, soloSupervisores, esSupervisorId, soloMias, esMiaId, ocultarPendientes, activosById, matchTrabajador, fSpedizione, fFrom, fTo]);

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
    retirosDetalle: buildRetirosDetalle(src),
    entrega_lugar: src.lugar_entrega || '',
    entrega_fecha: src.fecha_entrega ? src.fecha_entrega.split('T')[0] : todayISO(),
    entrega_hora: '',
    destinos: Array.isArray(src.destinos) ? src.destinos : [],
    destinosDetalle: buildDestinosDetalle(src),
    nota: src.nota || '',
    estado: src.estado || 'PENDIENTE',
    km: src.km != null ? String(src.km) : '',
    km_facturable: src.km_facturable != null ? String(src.km_facturable) : '',
    ingreso_estimado: src.ingreso_estimado != null ? String(src.ingreso_estimado) : '',
    ciudad: src.ciudad || '',
    app: src.app || '',
    reperibilita: !!src.reperibilita,
    es_navetta: !!src.es_navetta,
    compactado: !!src.compactado,
    estado_consegna: src.estado_consegna || '',
    attesa: src.attesa || '',
    otros_datos: src.otros_datos || '',
    foto_bolla: src.foto_bolla || '',
    anticipo: src.anticipo != null ? String(src.anticipo) : '',
    abonos_ruta: Number(src.abonos_ruta) || 0,
    gastos: Array.isArray(src.gastos) ? src.gastos.map((g: any) => ({
      tipo: g.tipo || 'OTRO',
      monto: g.monto != null ? String(g.monto) : '',
      descripcion: g.descripcion || '',
      numero_mancato: g.numero_mancato || '',
      comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes : [],
      pagado_por_chofer: g.pagado_por_chofer !== false,
    })) : [],
  });

  const openEdit = (r: Programacion) => {
    // Bloqueo pedido por dirección: una consegna ya realizada (entregado /
    // consegnato) no se puede editar — pero SOLO para el chofer (autista).
    // Supervisores/administradores (canEditAll) sí pueden seguir editándola.
    if (isChofer(user) && isConsegnaRealizada(r)) {
      Alert.alert('Consegna realizada', 'Esta operación ya fue entregada (consegnato). Solo un supervisor o administrador puede editarla.');
      return;
    }
    setEditing(r);
    populate(r); // precarga rápida con lo que trae la lista
    setDetail(null);
    setFormVisible(true);
    loadResources();
    // Registro COMPLETO: la lista no trae nota/otros_datos/foto_bolla/gastos, y guardar
    // sin ellos los borraría. GET /programacion/:id trae todos los campos.
    api.get(`/programacion/${r.id}`).then((res) => {
      if (res.data) populate({ ...r, ...res.data });
    }).catch(() => {});
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

  // --- Destinos adicionales --- destinosDetalle es paralelo a destinos (mismo índice).
  const addDestino = () => setForm((f) => ({ ...f, destinos: [...f.destinos, ''], destinosDetalle: [...f.destinosDetalle, emptyDestinoDetalle()] }));
  const updateDestino = (i: number, val: string) => setForm((f) => ({ ...f, destinos: f.destinos.map((d, idx) => (idx === i ? val : d)) }));
  const removeDestino = (i: number) => setForm((f) => ({
    ...f,
    destinos: f.destinos.filter((_, idx) => idx !== i),
    destinosDetalle: f.destinosDetalle.filter((_, idx) => idx !== i),
  }));
  const updateDestinoDetalle = (i: number, patch: Partial<DestinoDetalleRow>) =>
    setForm((f) => ({ ...f, destinosDetalle: f.destinosDetalle.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));

  // Orígenes/retiros adicionales: mismo patrón que destinos. El primero es
  // `retiro_lugar`; estos son los almacenes intermedios (ej. B-service).
  const addRetiro = () => setForm((f) => ({ ...f, retiros: [...f.retiros, ''], retirosDetalle: [...f.retirosDetalle, emptyRetiroDetalle()] }));
  const updateRetiro = (i: number, val: string) => setForm((f) => ({ ...f, retiros: f.retiros.map((d, idx) => (idx === i ? val : d)) }));
  const removeRetiro = (i: number) => setForm((f) => ({
    ...f,
    retiros: f.retiros.filter((_, idx) => idx !== i),
    retirosDetalle: f.retirosDetalle.filter((_, idx) => idx !== i),
  }));
  const updateRetiroDetalle = (i: number, patch: Partial<RetiroDetalleRow>) =>
    setForm((f) => ({ ...f, retirosDetalle: f.retirosDetalle.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));

  // --- Gastos (rendición) ---
  const addGasto = () => setForm((f) => ({ ...f, gastos: [...f.gastos, { tipo: 'PEAJE', monto: '', descripcion: '', numero_mancato: '', comprobantes: [], pagado_por_chofer: true }] }));
  const updateGasto = (i: number, patch: Partial<GastoRow>) => setForm((f) => ({ ...f, gastos: f.gastos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
  const removeGasto = (i: number) => setForm((f) => ({ ...f, gastos: f.gastos.filter((_, idx) => idx !== i) }));
  // Costo total de la ruta (todos los gastos, los pague quien los pague).
  const totalGastos = form.gastos.reduce((s, g) => s + (g.monto !== '' ? Number(g.monto) || 0 : 0), 0);
  // Lo que el chofer pagó de su bolsillo (lo único que se le descuenta del anticipo).
  const gastadoChofer = totalPagadoPorChofer(form.gastos.map((g) => ({ ...g, monto: Number(g.monto) || 0 })));
  const gastadoEmpresa = totalGastos - gastadoChofer;
  const anticipoNum = form.anticipo !== '' ? Number(form.anticipo) || 0 : 0;
  const recibidoNum = anticipoNum + (form.abonos_ruta || 0);
  // "A devolver" = (bonifico + abonos en ruta) − solo lo que pagó el chofer (mancato/código no descuentan).
  const saldo = recibidoNum - gastadoChofer;

  const save = async () => {
    // Defensa: no permitir al chofer guardar cambios sobre una consegna ya
    // realizada (supervisores/admins sí pueden).
    if (isChofer(user) && editing && isConsegnaRealizada(editing)) {
      Alert.alert('Consegna realizada', 'Esta operación ya fue entregada (consegnato). Solo un supervisor o administrador puede editarla.');
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
      // retiros/destinos filtran las direcciones vacías; retirosDetalle/destinosDetalle
      // se filtran EXACTAMENTE igual (mismo índice) para que sigan alineados 1:1.
      const retirosFinal = form.retiros
        .map((addr, idx) => ({ addr: addr.trim(), det: form.retirosDetalle[idx] }))
        .filter((x) => x.addr);
      const destinosFinal = form.destinos
        .map((addr, idx) => ({ addr: addr.trim(), det: form.destinosDetalle[idx] }))
        .filter((x) => x.addr);

      const payload: Record<string, any> = {
        vehiculo_id: form.vehiculo_id,
        trabajador_id: form.trabajador_id,
        cliente: form.cliente,
        spedizione: form.spedizione || null,
        lugar_retiro: form.retiro_lugar,
        fecha_retiro: toIso(form.retiro_fecha, form.retiro_hora, '00:00'),
        hora_retiro: form.retiro_hora,
        retiros: retirosFinal.map((x) => x.addr),
        retiros_detalle: retirosFinal.map((x) => ({ fecha: x.det?.fecha || null, hora: x.det?.hora || null })),
        lugar_entrega: form.entrega_lugar,
        fecha_entrega: toIso(form.entrega_fecha, form.entrega_hora, '23:59'),
        destinos: destinosFinal.map((x) => x.addr),
        destinos_detalle: destinosFinal.map((x) => ({
          fecha: x.det?.fecha || null,
          hora: x.det?.hora || null,
          cliente: x.det?.cliente || null,
          spedizione: x.det?.spedizione || null,
          km_facturable: x.det && x.det.km_facturable !== '' ? Number(x.det.km_facturable) : null,
          ingreso: x.det && x.det.ingreso !== '' ? Number(x.det.ingreso) : null,
        })),
        nota: form.nota,
        km: form.km !== '' ? Number(form.km) : null,
        km_facturable: form.km_facturable !== '' ? Number(form.km_facturable) : null,
        ingreso_estimado: form.ingreso_estimado !== '' ? Number(form.ingreso_estimado) : null,
        ciudad: form.ciudad || null,
        app: form.app || null,
        reperibilita: form.reperibilita,
        es_navetta: form.es_navetta,
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
            // Solo peaje/combustible ofrecen la opción; el resto siempre lo paga el chofer.
            pagado_por_chofer: GASTO_TIPOS_CON_PAGADOR.includes(g.tipo) ? g.pagado_por_chofer : true,
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
      <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={() => (canEditAll ? openDetail(r) : setWizardOp(r))}>
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
            const pendientesCount = (counts.PENDIENTE || 0) + (counts.PENDING || 0);
            // En la vista personal, "Todos" no cuenta las pendientes (no se listan aquí).
            const totalAll = Object.values(counts).reduce((s, n) => s + n, 0) - (ocultarPendientes ? pendientesCount : 0);
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
              // En la vista personal (chofer/supervisor) no se ofrece el filtro
              // "Pendiente": esas consegnas se trabajan en "Mi Ruta", no aquí.
              ...ALL_ESTADOS.filter((e) => !(ocultarPendientes && e === 'PENDIENTE')).map((e) =>
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

        {canEditAll && (
          <View style={{ marginBottom: S.sm }}>
            <View style={styles.filtrosBar}>
              <TouchableOpacity style={styles.filtrosToggle} onPress={() => setFiltersOpen((v) => !v)} activeOpacity={0.7}>
                <SlidersHorizontal size={16} color={C.text} />
                <Text style={styles.filtrosToggleText}>Filtros{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text>
                {filtersOpen ? <ChevronUp size={16} color={C.textMuted} /> : <ChevronDown size={16} color={C.textMuted} />}
              </TouchableOpacity>
              {activeFilterCount > 0 && (
                <TouchableOpacity onPress={clearFilters} activeOpacity={0.7} style={styles.filtrosClearBtn}>
                  <Text style={styles.filtrosClearText}>Limpiar</Text>
                </TouchableOpacity>
              )}
            </View>
            {filtersOpen && (
              <View style={styles.filtrosPanel}>
                <View style={{ flexDirection: 'row', gap: S.sm }}>
                  <View style={{ flex: 1 }}>
                    <DatePicker label="Desde" value={fFrom} onChange={setFFrom} placeholder="AAAA-MM-DD" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <DatePicker label="Hasta" value={fTo} onChange={setFTo} placeholder="AAAA-MM-DD" />
                  </View>
                </View>
                <Select
                  label="Trabajador"
                  value={fTrabajador}
                  onChange={setFTrabajador}
                  placeholder="Todos"
                  searchable
                  options={[
                    { value: '', label: 'Todos' },
                    ...[...trabajadores]
                      .sort((a, b) => (a.nombre_completo || '').localeCompare(b.nombre_completo || ''))
                      .map((w) => ({ value: w.id, label: w.nombre_completo || '(sin nombre)' })),
                  ]}
                />
                <Select
                  label="Spedizione"
                  value={fSpedizione}
                  onChange={setFSpedizione}
                  placeholder="Todas"
                  searchable={false}
                  options={[{ value: '', label: 'Todas' }, ...spedizioneOptions]}
                />
              </View>
            )}
          </View>
        )}

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
                {/* Bloqueado solo para el chofer — supervisores/admins (canEditAll)
                    siguen pudiendo editar aunque ya esté consegnata. */}
                {isConsegnaRealizada(detail) && isChofer(user) ? (
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
              const stops = [...(detail.retiros || []), detail.lugar_entrega, ...(detail.destinos || [])].filter(Boolean) as string[];
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
            {detail.km != null && detail.km !== 0 ? <InfoRow label="KM (real, GPS)" value={`${detail.km} km`} /> : null}
            {detail.km_facturable != null ? <InfoRow label="Km facturable (ida)" value={`${detail.km_facturable} km`} /> : null}
            {detail.ingreso_estimado != null && detail.ingreso_estimado !== 0 ? <InfoRow label="Ingreso" value={formatMoney(detail.ingreso_estimado, moneda)} /> : null}
            {Array.isArray(detail.paradas_recorrido) && detail.paradas_recorrido.length > 0 ? (
              <View style={{ marginTop: S.sm, marginBottom: S.sm }}>
                <Text style={styles.formSection}>Paradas (km real GPS)</Text>
                {detail.paradas_recorrido.map((p) => (
                  <View key={p.id} style={styles.paradaRow}>
                    <Text style={styles.paradaLabel} numberOfLines={1}>
                      {p.orden}. {p.label}{p.es_retorno ? ' (retorno)' : ''}
                    </Text>
                    <Text style={styles.paradaMeta}>
                      {p.llegada_en ? fmtHoraIt(new Date(p.llegada_en)) : 'Sin llegar'}
                      {p.km_tramo != null ? ` · ${p.km_tramo.toFixed(1)} km` : ''}
                      {!p.es_retorno ? (p.llegada_en ? (p.entregado ? ' · Entregado' : ' · No entregado') : '') : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {detail.ciudad ? <InfoRow label="Ciudad" value={detail.ciudad} /> : null}
            {detail.app ? <InfoRow label="App" value={detail.app} /> : null}
            {/* Attesa con autorización: el supervisor ve las horas declaradas, puede
                corregirlas y AUTORIZAR/DENEGAR. En rojo mientras está PENDIENTE. */}
            {(() => {
              const horas = Number(detail.attesa_horas || 0);
              const est = (detail.attesa_estado || 'PENDIENTE').toUpperCase();
              if (!horas && est === 'PENDIENTE' && !detail.attesa) return null;
              const estColor = est === 'AUTORIZADO' ? C.success : est === 'DENEGADO' ? C.danger : C.warning;
              return (
                <View style={styles.attesaBox}>
                  <View style={styles.attesaHead}>
                    <Text style={styles.attesaTitle}>Attesa (espera en destino)</Text>
                    <Text style={[styles.attesaEstado, { color: estColor }]}>
                      {est === 'AUTORIZADO' ? 'Autorizada' : est === 'DENEGADO' ? 'Denegada' : 'Pendiente'}
                    </Text>
                  </View>
                  <Text style={styles.attesaHoras}>{horas} h ({Math.round(horas * 60)} min) · {formatMoney(horas >= 1 ? horas * 10 : 0, moneda)}</Text>
                  {horas > 0 && horas < 1 && (
                    <Text style={styles.attesaNota}>Menos de 1 hora: no se paga.</Text>
                  )}
                  {canEditAll && (
                    <>
                      <View style={styles.attesaEditRow}>
                        <Text style={styles.attesaEditLabel}>Corregir horas</Text>
                        <FormField
                          label=""
                          value={attesaHorasEdit}
                          onChangeText={setAttesaHorasEdit}
                          placeholder="0"
                          keyboardType="numeric"
                          style={{ width: 90 }}
                        />
                      </View>
                      <View style={styles.attesaBtns}>
                        <TouchableOpacity style={[styles.attesaBtn, { backgroundColor: C.success }]} disabled={attesaBusy} onPress={() => decidirAttesa('AUTORIZADO')} activeOpacity={0.8}>
                          <Text style={styles.attesaBtnText}>Autorizar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.attesaBtn, { backgroundColor: C.danger }]} disabled={attesaBusy} onPress={() => decidirAttesa('DENEGADO')} activeOpacity={0.8}>
                          <Text style={styles.attesaBtnText}>Denegar</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              );
            })()}
            {detail.compactado ? <InfoRow label="Compactado" value="Sí" /> : null}
            {detail.otros_datos ? <InfoRow label="Otros datos" value={detail.otros_datos} /> : null}
            {(() => {
              const anticipoD = Number(detail.anticipo) || 0;
              const abonosD = Number((detail as any).abonos_ruta) || 0;
              const gastosD = (detail.gastos || []) as any[];
              const totalD = gastosD.reduce((s, g) => s + (Number(g?.monto) || 0), 0);
              const choferD = totalPagadoPorChofer(gastosD);
              const empresaD = totalD - choferD;
              const recibidoD = anticipoD + abonosD;
              const saldoD = recibidoD - choferD;
              if (anticipoD === 0 && abonosD === 0 && gastosD.length === 0) return null;
              return (
                <View style={styles.saldoBox}>
                  <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Bonifico</Text><Text style={styles.saldoVal}>{formatMoney(anticipoD, moneda)}</Text></View>
                  {abonosD > 0 ? (
                    <View style={styles.saldoRow}><Text style={styles.saldoLabel}>+ Abonos en ruta</Text><Text style={styles.saldoVal}>{formatMoney(abonosD, moneda)}</Text></View>
                  ) : null}
                  <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Pagado por el chofer</Text><Text style={styles.saldoVal}>− {formatMoney(choferD, moneda)}</Text></View>
                  {empresaD > 0 ? (
                    <View style={styles.saldoRow}><Text style={[styles.saldoLabel, { color: C.textMuted }]}>Pagado por la empresa (no descuenta)</Text><Text style={[styles.saldoVal, { color: C.textMuted }]}>{formatMoney(empresaD, moneda)}</Text></View>
                  ) : null}
                  <View style={[styles.saldoRow, styles.saldoTotal]}>
                    <Text style={[styles.saldoLabel, { fontWeight: '700', color: saldoD < 0 ? C.danger : C.success }]}>{saldoD < 0 ? 'Excedido (falta)' : 'A devolver'}</Text>
                    <Text style={[styles.saldoVal, { fontWeight: '700', color: saldoD < 0 ? C.danger : C.success }]}>{formatMoney(Math.abs(saldoD), moneda)}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Costo total de la ruta: {formatMoney(totalD, moneda)}</Text>
                </View>
              );
            })()}
            {/* Costo del chofer (pago por horas + reperibilità + attesa): dato de
                compensación, visible solo con ve_finanzas (igual que Ganancias Dirección). */}
            {(user as any)?.ve_finanzas && detail.costo_chofer ? (() => {
              const cc = detail.costo_chofer!;
              return (
                <View style={styles.saldoBox}>
                  <Text style={[styles.saldoLabel, { fontWeight: '700', color: C.text, marginBottom: 4 }]}>Costo del chofer</Text>
                  {(cc.horas_dia > 0 || cc.horas_noche > 0) && (
                    <View style={styles.saldoRow}>
                      <Text style={styles.saldoLabel}>Horas ({cc.horas_dia}d + {cc.horas_noche}n)</Text>
                      <Text style={styles.saldoVal}>{formatMoney(cc.pago_horas, cc.moneda)}</Text>
                    </View>
                  )}
                  {cc.reperibilita && (
                    <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Reperibilità</Text><Text style={styles.saldoVal}>{formatMoney(cc.pago_reperibilita, cc.moneda)}</Text></View>
                  )}
                  {cc.attesa_autorizada && (
                    <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Attesa autorizada ({cc.attesa_horas}h)</Text><Text style={styles.saldoVal}>{formatMoney(cc.pago_attesa, cc.moneda)}</Text></View>
                  )}
                  {cc.gastos_chofer > 0 && (
                    <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Gastos pagados por él</Text><Text style={styles.saldoVal}>{formatMoney(cc.gastos_chofer, cc.moneda)}</Text></View>
                  )}
                  <View style={[styles.saldoRow, styles.saldoTotal]}>
                    <Text style={[styles.saldoLabel, { fontWeight: '700' }]}>Total</Text>
                    <Text style={[styles.saldoVal, { fontWeight: '700' }]}>{formatMoney(cc.total, cc.moneda)}</Text>
                  </View>
                </View>
              );
            })() : null}
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
          onChange={(v) => setForm((f) => aplicarIngresoAuto({ ...f, vehiculo_id: v }))}
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
          onChange={(v) => setForm((f) => aplicarIngresoAuto({ ...f, spedizione: v }))}
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
          <View key={i} style={styles.destinoCard}>
            <View style={styles.destinoRow}>
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
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <DatePicker
                  label="Fecha"
                  value={form.retirosDetalle[i]?.fecha || ''}
                  onChange={(v) => updateRetiroDetalle(i, { fecha: v })}
                  placeholder="AAAA-MM-DD"
                />
              </View>
              <FormField
                label="Hora"
                value={form.retirosDetalle[i]?.hora || ''}
                onChangeText={(t) => updateRetiroDetalle(i, { hora: t })}
                placeholder="HH:MM"
                style={{ flex: 1 }}
              />
            </View>
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

        <Text style={styles.fieldLabelSm}>¿Es compactada? (2+ entregas de clientes distintos en un solo viaje)</Text>
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
        {form.compactado && (
          <Text style={styles.compactadaHint}>
            Cada destino de abajo puede tener su propio Cliente, Spedizione, Km facturable e Ingreso.
          </Text>
        )}

        <Text style={styles.formSection}>Destinos adicionales</Text>
        {!form.compactado && form.destinos.length > 0 && (
          <Text style={styles.compactadaHint}>
            ¿Alguno de estos destinos es otra entrega con cliente distinto? Activa "¿Es compactada?" arriba.
          </Text>
        )}
        {form.destinos.map((d, i) => {
          const det = form.destinosDetalle[i];
          const sugerido = form.compactado
            ? calcularIngresoSugerido(det?.km_facturable, categoriaDeVehiculo(form.vehiculo_id), form.es_navetta, det?.spedizione || form.spedizione, tarifasConfig)
            : null;
          return (
            <View key={i} style={styles.destinoCard}>
              <View style={styles.destinoRow}>
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
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <DatePicker
                    label="Fecha"
                    value={det?.fecha || ''}
                    onChange={(v) => updateDestinoDetalle(i, { fecha: v })}
                    placeholder="AAAA-MM-DD"
                  />
                </View>
                <FormField
                  label="Hora límite"
                  value={det?.hora || ''}
                  onChangeText={(t) => updateDestinoDetalle(i, { hora: t })}
                  placeholder="HH:MM"
                  style={{ flex: 1 }}
                />
              </View>
              {form.compactado && (
                <View style={styles.compactadaBox}>
                  <Text style={styles.compactadaLabel}>Esta parada es otra entrega — sus propios datos</Text>
                  <View style={styles.dateRow}>
                    <FormField
                      label="Cliente"
                      value={det?.cliente || ''}
                      onChangeText={(t) => updateDestinoDetalle(i, { cliente: t })}
                      placeholder="Nombre del cliente"
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Select
                    label="Spedizione"
                    value={det?.spedizione || ''}
                    onChange={(v) => updateDestinoDetalle(i, { spedizione: v })}
                    options={SPEDIZIONE_OPTIONS}
                    placeholder="Selecciona spedizione"
                    clearable
                  />
                  <View style={styles.dateRow}>
                    <FormField
                      label="Km facturable"
                      value={det?.km_facturable || ''}
                      onChangeText={(t) => {
                        const sug = calcularIngresoSugerido(t, categoriaDeVehiculo(form.vehiculo_id), form.es_navetta, det?.spedizione || form.spedizione, tarifasConfig);
                        updateDestinoDetalle(i, { km_facturable: t, ...(sug ? { ingreso: String(sug.monto) } : {}) });
                      }}
                      placeholder="Km"
                      keyboardType="numeric"
                      style={{ flex: 1 }}
                    />
                    <FormField
                      label={`Ingreso (${moneda || 'EUR'})`}
                      value={det?.ingreso || ''}
                      onChangeText={(t) => updateDestinoDetalle(i, { ingreso: t })}
                      placeholder="0.00"
                      keyboardType="numeric"
                      style={{ flex: 1 }}
                    />
                  </View>
                  {sugerido ? (
                    <Text style={styles.sugeridoText}>
                      {sugerido.esNavetta
                        ? 'Auto: navetta, pago fijo'
                        : `Auto: ${categoriaVehiculoLabel(sugerido.categoria)}${sugerido.aplicaMinimo ? ', mínimo' : ` · ${sugerido.factor}€/km`}`} — puedes editarlo si varía
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
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

        {!lockOthers && (
          <View>
            <View style={styles.dateRow}>
              <FormField
                label="Km facturable (ida)"
                value={form.km_facturable}
                onChangeText={(t) => setForm((f) => aplicarIngresoAuto({ ...f, km_facturable: t }))}
                placeholder="Km que informa el cliente"
                keyboardType="numeric"
                style={{ flex: 1 }}
              />
              <FormField
                label={`Ingreso (${moneda || 'EUR'})`}
                value={form.ingreso_estimado}
                onChangeText={(t) => setForm({ ...form, ingreso_estimado: t })}
                placeholder="0.00"
                keyboardType="numeric"
                style={{ flex: 1 }}
              />
            </View>
            {ingresoSugerido ? (
              <Text style={styles.sugeridoText}>
                {ingresoSugerido.esNavetta
                  ? 'Auto: navetta, pago fijo'
                  : `Auto: ${categoriaVehiculoLabel(ingresoSugerido.categoria)}${ingresoSugerido.aplicaMinimo ? ', mínimo' : ` · ${ingresoSugerido.factor}€/km`}`} — puedes editarlo si varía
              </Text>
            ) : null}
          </View>
        )}

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

        <Text style={styles.fieldLabelSm}>¿Es navetta? (traslado entre almacenes, no entrega)</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !form.es_navetta && styles.toggleBtnActiveDark, lockOthers && { opacity: 0.55 }]}
            onPress={() => !lockOthers && setForm((f) => aplicarIngresoAuto({ ...f, es_navetta: false }))}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBtnText, !form.es_navetta && { color: '#fff' }]}>N</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, form.es_navetta && styles.toggleBtnActiveBlue, lockOthers && { opacity: 0.55 }]}
            onPress={() => !lockOthers && setForm((f) => aplicarIngresoAuto({ ...f, es_navetta: true }))}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBtnText, form.es_navetta && { color: '#fff' }]}>Y</Text>
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
            {GASTO_TIPOS_CON_PAGADOR.includes(g.tipo) && (() => {
              const labels = pagadorLabels(g.tipo);
              return (
                <View>
                  <Text style={styles.fieldLabelSm}>¿Quién lo pagó?</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, g.pagado_por_chofer && styles.toggleBtnActiveDark]}
                      onPress={() => updateGasto(i, { pagado_por_chofer: true })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.toggleBtnText, g.pagado_por_chofer && { color: '#fff' }]}>{labels.yes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleBtn, !g.pagado_por_chofer && styles.toggleBtnActiveBlue]}
                      onPress={() => updateGasto(i, { pagado_por_chofer: false })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.toggleBtnText, !g.pagado_por_chofer && { color: '#fff' }]}>{labels.no}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.pagadorHint}>{g.pagado_por_chofer ? labels.hintYes : labels.hintNo}</Text>
                </View>
              );
            })()}
            {g.tipo === 'PEAJE' && !g.pagado_por_chofer && (
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
          {form.abonos_ruta > 0 && (
            <View style={styles.saldoRow}>
              <Text style={styles.saldoLabel}>+ Abonos en ruta</Text>
              <Text style={styles.saldoVal}>{formatMoney(form.abonos_ruta, moneda)}</Text>
            </View>
          )}
          <View style={styles.saldoRow}>
            <Text style={styles.saldoLabel}>Pagado por el chofer</Text>
            <Text style={styles.saldoVal}>− {formatMoney(gastadoChofer, moneda)}</Text>
          </View>
          {gastadoEmpresa > 0 && (
            <View style={styles.saldoRow}>
              <Text style={styles.saldoLabel}>Pagado por la empresa (no descuenta)</Text>
              <Text style={[styles.saldoVal, { color: C.textMuted }]}>{formatMoney(gastadoEmpresa, moneda)}</Text>
            </View>
          )}
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
  attesaBox: { marginTop: S.sm, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: S.md, gap: 6 },
  attesaHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  attesaTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  attesaEstado: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  attesaHoras: { fontSize: 15, color: C.text, fontWeight: '600' },
  attesaNota: { fontSize: 12, color: C.warning, marginTop: 2 },
  attesaEditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginTop: 4 },
  attesaEditLabel: { fontSize: 13, color: C.textMuted },
  attesaBtns: { flexDirection: 'row', gap: S.sm, marginTop: 4 },
  attesaBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  attesaBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
  pagadorHint: { fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 15 },
  sugeridoText: { fontSize: 12, color: C.primary, fontWeight: '600', marginTop: 4, marginBottom: S.md, paddingHorizontal: 4 },
  filtrosBar: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  filtrosToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filtrosToggleText: { fontSize: 14, fontWeight: '600', color: C.text },
  filtrosClearBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  filtrosClearText: { fontSize: 13, fontWeight: '600', color: C.danger },
  filtrosPanel: { marginTop: S.sm, padding: S.md, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, gap: S.sm },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  gpsHint: { fontSize: 12, color: C.info, fontWeight: '600', marginTop: 4 },
  compactadaHint: { fontSize: 12, color: C.textMuted, marginTop: -4, marginBottom: S.md, lineHeight: 16 },
  destinoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: S.sm, marginBottom: S.sm },
  destinoRemove: { paddingBottom: 12, paddingHorizontal: 4 },
  destinoCard: { padding: S.md, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, marginBottom: S.sm },
  compactadaBox: { marginTop: S.sm, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  compactadaLabel: { fontSize: 11.5, fontWeight: '700', color: C.textMuted, marginBottom: S.sm, textTransform: 'uppercase' },
  paradaRow: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  paradaLabel: { fontSize: 13, fontWeight: '600', color: C.text },
  paradaMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
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
