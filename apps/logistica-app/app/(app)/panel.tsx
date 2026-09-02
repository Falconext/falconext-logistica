import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  Users, Truck, Package, Navigation, PauseCircle, MapPin, Clock, AlertTriangle,
  CheckCircle2, XCircle,
} from 'lucide-react-native';
import { Screen, AppHeader, Card, StatCard, LoadingState, EmptyState, Theme } from '../../components/ui';
import api from '../../services/api';
import { useLivePolling } from '../../hooks/useLivePolling';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

const REFRESH_MS = 30000;

interface Trabajador {
  id: string;
  nombre_completo: string;
  cargo?: string | null;
  url_foto?: string | null;
  area_trabajo?: string | null;
  disponible: boolean;
  enOperacion: boolean;
  disponibleReal: boolean;
  estadoRecorrido?: string | null; // EN_RUTA_IDA | EN_DESTINO | EN_RUTA_VUELTA | EN_DESCANSO
  libreEnMin?: number | null;      // min hasta quedar libre (solo en el regreso, según Maps)
  etaSinGps?: boolean;
}
interface ZonaPersonal {
  zona: string;
  total: number;
  disponibles: number;
  trabajadores: Trabajador[];
}
interface Vehiculo {
  id: string;
  placa: string;
  marca_modelo?: string | null;
  tipo_unidad?: string | null;
  url_foto?: string | null;
  disponible: boolean;
  enOperacion: boolean;
  disponibleReal: boolean;
}
interface Entrega {
  id: string;
  id_programacion?: string | null;
  targa?: string | null;
  autista?: string | null;
  cliente?: string | null;
  lugar_retiro?: string | null;
  lugar_entrega?: string | null;
  fecha_entrega?: string | null;
  estado?: string | null;
  restanteMin?: number | null;
}
interface PanelStatus {
  personal: ZonaPersonal[];
  flota: Vehiculo[];
  entregas: { enConsegna: Entrega[]; enSospeso: Entrega[] };
  resumen: {
    personalTotal: number;
    personalDisponible: number;
    flotaTotal: number;
    flotaDisponible: number;
    entregasActivas: number;
  };
}

// Placa "PLACA - MODELO" → solo la placa (datos legacy).
const soloPlaca = (raw?: string | null) => (raw || '').trim().split(/\s+/)[0] || '—';

type Tone = 'late' | 'soon' | 'ok' | 'none';

// Minutos → "Xd Yh" / "Yh Zm" / "Zm".
function fmtMin(abs: number): string {
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Estado del chofer según su recorrido en curso. En el regreso muestra el ETA
// (según Maps) hasta quedar libre: le sirve al supervisor para reasignar.
function recorridoLabel(t: Trabajador): string | null {
  const gps = t.etaSinGps ? ' · sin GPS' : '';
  switch (t.estadoRecorrido) {
    case 'EN_RUTA_VUELTA':
      return t.libreEnMin != null ? `libre en ~${t.libreEnMin} min${gps}` : `regresando${gps}`;
    case 'EN_RUTA_IDA': return `en ruta al destino${gps}`;
    case 'EN_DESTINO': return 'en destino';
    case 'EN_DESCANSO': return 'en descanso';
    default: return null;
  }
}

// Cuenta regresiva de una entrega, recalculada en cliente para que avance sin refetch.
function fmtRestante(e: Entrega, nowMs: number): { text: string; tone: Tone } {
  if (!e.fecha_entrega) return { text: 'Sin fecha', tone: 'none' };
  const min = Math.round((new Date(e.fecha_entrega).getTime() - nowMs) / 60000);
  const parts = fmtMin(Math.abs(min));
  if (min < 0) return { text: `Atrasado ${parts}`, tone: 'late' };
  if (min <= 120) return { text: `En ${parts}`, tone: 'soon' };
  return { text: `En ${parts}`, tone: 'ok' };
}

const TONE_COLOR: Record<Tone, { bg: string; fg: string }> = {
  late: { bg: C.dangerSoft, fg: C.danger },
  soon: { bg: C.warningSoft, fg: C.warning },
  ok: { bg: C.successSoft, fg: C.success },
  none: { bg: C.neutralSoft, fg: C.neutral },
};

export default function PanelScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<PanelStatus | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [tab, setTab] = useState<'consegna' | 'sospeso'>('consegna');
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const { data: status } = await api.get<PanelStatus>('/panel/status');
      setData(status);
      setNow(Date.now());
    } catch (e) {
      console.error('[Panel] load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresco consciente del costo: solo consulta con la app en primer plano;
  // al volver a primer plano refresca al instante. En segundo plano no consulta
  // (Neon puede suspenderse). Ver hooks/useLivePolling.
  useLivePolling(() => load(true), REFRESH_MS);
  // Tick de reloj (cosmético, no consulta a la API).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Toggle de disponibilidad (personal o vehículo). Optimista: revierte con reload al fallar.
  const toggleDisponible = useCallback(async (kind: 'trabajador' | 'vehiculo', id: string, next: boolean) => {
    setBusy((s) => new Set(s).add(id));
    setData((prev) => {
      if (!prev) return prev;
      if (kind === 'trabajador') {
        const personal = prev.personal.map((z) => {
          const trabajadores = z.trabajadores.map((t) =>
            t.id === id ? { ...t, disponible: next, disponibleReal: next && !t.enOperacion } : t);
          return { ...z, trabajadores, disponibles: trabajadores.filter((t) => t.disponibleReal).length };
        });
        return { ...prev, personal, resumen: { ...prev.resumen, personalDisponible: personal.reduce((s, z) => s + z.disponibles, 0) } };
      }
      const flota = prev.flota.map((v) =>
        v.id === id ? { ...v, disponible: next, disponibleReal: next && !v.enOperacion } : v);
      return { ...prev, flota, resumen: { ...prev.resumen, flotaDisponible: flota.filter((v) => v.disponibleReal).length } };
    });
    try {
      await api.patch(`/panel/${kind}/${id}/disponibilidad`, { disponible: next });
    } catch (e) {
      console.error('[Panel] toggle', e);
      load(true);
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [load]);

  if (loading) {
    return (
      <Screen padded>
        <AppHeader title="Panel de Control" subtitle="Torre operativa · disponibilidad y entregas" />
        <LoadingState text="Cargando panel..." />
      </Screen>
    );
  }

  const r = data?.resumen;
  const enConsegna = data?.entregas.enConsegna ?? [];
  const enSospeso = data?.entregas.enSospeso ?? [];
  const entregasTab = tab === 'consegna' ? enConsegna : enSospeso;

  return (
    <Screen scroll padded refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />}>
      <AppHeader title="Panel de Control" subtitle="Torre operativa · disponibilidad y entregas" />

      {/* KPIs */}
      <View style={styles.kpiRow}>
        <StatCard label="Personal disp." value={`${r?.personalDisponible ?? 0}/${r?.personalTotal ?? 0}`} icon={Users} color={C.success} />
        <StatCard label="Flota disp." value={`${r?.flotaDisponible ?? 0}/${r?.flotaTotal ?? 0}`} icon={Truck} color={C.info} />
        <StatCard label="Entregas activas" value={r?.entregasActivas ?? 0} icon={Package} color={C.warning} />
      </View>

      {/* Entregas: segmented + lista */}
      <Text style={styles.sectionTitle}>Entregas</Text>
      <View style={styles.segment}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.segmentBtn, tab === 'consegna' && styles.segmentBtnActive]}
          onPress={() => setTab('consegna')}
        >
          <Navigation size={15} color={tab === 'consegna' ? C.textOnPrimary : C.textMuted} />
          <Text style={[styles.segmentText, tab === 'consegna' && styles.segmentTextActive]}>In Consegna ({enConsegna.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.segmentBtn, tab === 'sospeso' && styles.segmentBtnActive]}
          onPress={() => setTab('sospeso')}
        >
          <PauseCircle size={15} color={tab === 'sospeso' ? C.textOnPrimary : C.textMuted} />
          <Text style={[styles.segmentText, tab === 'sospeso' && styles.segmentTextActive]}>In Sospeso ({enSospeso.length})</Text>
        </TouchableOpacity>
      </View>

      {entregasTab.length === 0 ? (
        <EmptyState
          icon={Package}
          title={tab === 'consegna' ? 'Sin entregas en ruta' : 'Sin entregas pendientes'}
          subtitle="Aparecerán aquí cuando haya movimiento."
        />
      ) : (
        <View style={{ gap: S.sm }}>
          {entregasTab.map((e) => {
            const rest = fmtRestante(e, now);
            const tc = TONE_COLOR[rest.tone];
            return (
              <Card key={e.id} style={styles.entregaCard}>
                <View style={styles.entregaIcon}>
                  <Package size={16} color={C.textMuted} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.entregaTop}>
                    <Text style={styles.entregaPlaca} numberOfLines={1}>{soloPlaca(e.targa)}</Text>
                    <Text style={styles.entregaAutista} numberOfLines={1}>{e.autista || 'Sin conductor'}</Text>
                  </View>
                  <Text style={styles.entregaSub} numberOfLines={1}>
                    {e.cliente ? `${e.cliente} · ` : ''}{e.lugar_entrega || 'Sin destino'}
                  </Text>
                </View>
                <View style={[styles.countdown, { backgroundColor: tc.bg }]}>
                  {rest.tone === 'late'
                    ? <AlertTriangle size={12} color={tc.fg} />
                    : <Clock size={12} color={tc.fg} />}
                  <Text style={[styles.countdownText, { color: tc.fg }]}>{rest.text}</Text>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* Personal por zona */}
      <Text style={styles.sectionTitle}>Personal por zona</Text>
      {(data?.personal ?? []).length === 0 ? (
        <EmptyState icon={Users} title="Sin personal" />
      ) : (
        <View style={{ gap: S.md }}>
          {(data?.personal ?? []).map((z) => (
            <Card key={z.zona} style={{ gap: S.sm }}>
              <View style={styles.zonaHeader}>
                <View style={styles.zonaTitleRow}>
                  <MapPin size={15} color={C.textMuted} />
                  <Text style={styles.zonaTitle} numberOfLines={1}>{z.zona}</Text>
                </View>
                <Text style={styles.zonaCount}>
                  <Text style={styles.zonaCountHi}>{z.disponibles}</Text>/{z.total} disp.
                </Text>
              </View>
              {z.trabajadores.map((t) => (
                <View key={t.id} style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{t.nombre_completo}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {t.cargo || 'Sin cargo'}
                      {t.enOperacion && !recorridoLabel(t) && <Text style={styles.enRuta}> · en ruta</Text>}
                      {!!recorridoLabel(t) && <Text style={[styles.enRuta, t.libreEnMin != null && { color: C.success }]}> · {recorridoLabel(t)}</Text>}
                    </Text>
                  </View>
                  <AvailabilityPill
                    disponible={t.disponible}
                    busy={busy.has(t.id)}
                    onToggle={(next) => toggleDisponible('trabajador', t.id, next)}
                    styles={styles}
                  />
                </View>
              ))}
            </Card>
          ))}
        </View>
      )}

      {/* Flota */}
      <Text style={styles.sectionTitle}>Flota ({data?.flota.length ?? 0})</Text>
      {(data?.flota ?? []).length === 0 ? (
        <EmptyState icon={Truck} title="Sin vehículos" />
      ) : (
        <View style={{ gap: S.sm }}>
          {(data?.flota ?? []).map((v) => (
            <Card key={v.id} style={styles.row}>
              <View style={styles.vehIcon}>
                <Truck size={16} color={C.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>{v.placa}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {v.marca_modelo || v.tipo_unidad || 'Vehículo'}
                  {v.enOperacion && <Text style={styles.enRuta}> · en ruta</Text>}
                </Text>
              </View>
              <AvailabilityPill
                disponible={v.disponible}
                busy={busy.has(v.id)}
                onToggle={(next) => toggleDisponible('vehiculo', v.id, next)}
                styles={styles}
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

// Pill de disponibilidad tocable (verde disponible / rojo no disponible).
function AvailabilityPill({
  disponible, busy, onToggle, styles,
}: {
  disponible: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const bg = disponible ? C.successSoft : C.dangerSoft;
  const fg = disponible ? C.success : C.danger;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={busy}
      onPress={() => onToggle(!disponible)}
      style={[styles.pill, { backgroundColor: bg }, busy && { opacity: 0.6 }]}
    >
      {busy
        ? <ActivityIndicator size="small" color={fg} />
        : disponible
          ? <CheckCircle2 size={13} color={fg} />
          : <XCircle size={13} color={fg} />}
      <Text style={[styles.pillText, { color: fg }]}>{disponible ? 'Disponible' : 'No disponible'}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    kpiRow: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: S.xl, marginBottom: S.sm },
    // Segmented control de entregas.
    segment: { flexDirection: 'row', gap: 4, backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 4, marginBottom: S.md },
    segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 9 },
    segmentBtnActive: { backgroundColor: C.primary },
    segmentText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
    segmentTextActive: { color: C.textOnPrimary },
    // Fila de entrega.
    entregaCard: { flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.md },
    entregaIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    entregaTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    entregaPlaca: { fontSize: 14, fontWeight: '700', color: C.text, flexShrink: 1 },
    entregaAutista: { fontSize: 12, color: C.textFaint, flexShrink: 1 },
    entregaSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    countdown: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
    countdownText: { fontSize: 11, fontWeight: '700' },
    // Zona de personal.
    zonaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, paddingBottom: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    zonaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    zonaTitle: { fontSize: 14, fontWeight: '700', color: C.text, textTransform: 'capitalize', flexShrink: 1 },
    zonaCount: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
    zonaCountHi: { color: C.success, fontWeight: '800' },
    // Fila genérica (trabajador / vehículo).
    row: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
    rowName: { fontSize: 14, fontWeight: '600', color: C.text },
    rowSub: { fontSize: 12, color: C.textMuted, marginTop: 1 },
    enRuta: { color: C.info, fontWeight: '700' },
    vehIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    // Pill de disponibilidad.
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, minWidth: 96, justifyContent: 'center' },
    pillText: { fontSize: 11, fontWeight: '700' },
  });
