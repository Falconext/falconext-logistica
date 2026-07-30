import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Navigation, MapPin, CornerUpLeft, Clock, Timer, Coffee, WifiOff, History, ArrowUp, ArrowDown,
  Route as RouteIcon, Radio, X,
} from 'lucide-react-native';
import { Screen, AppHeader, Card, StatCard, Badge, Button, LoadingState, EmptyState, Theme } from '../../components/ui';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

const REFRESH_MS = 20000;

interface RecorridoActivo {
  id: string;
  trabajador: string;
  url_foto: string | null;
  placa: string | null;
  estado: 'EN_RUTA_IDA' | 'EN_DESTINO' | 'EN_RUTA_VUELTA' | 'EN_DESCANSO';
  descansando: boolean;
  descansoMin: number;
  origen: string | null;
  destino: string | null;
  iniciado_en: string;
  enTramoMin: number;
  etaMin: number | null;
  disponibleEnMin: number | null;
  sinGps: boolean;
}

interface RecorridoHistorial {
  id: string;
  trabajador: string;
  placa: string | null;
  cliente: string | null;
  origen: string | null;
  destino: string | null;
  estado: 'COMPLETADO' | 'CANCELADO';
  iniciado_en: string;
  finalizado_en: string | null;
  duracionMin: number | null;
  ida_min: number | null;
  ida_km: number | null;
  vuelta_min: number | null;
  vuelta_km: number | null;
  descanso_min: number;
  esperadoMin: number | null;
  desvioMin: number | null;
}

type EstadoActivo = RecorridoActivo['estado'];
const ESTADO_META: Record<EstadoActivo, { label: string; variant: 'info' | 'warning' }> = {
  EN_RUTA_IDA: { label: 'En ruta · ida', variant: 'info' },
  EN_DESTINO: { label: 'En destino', variant: 'warning' },
  EN_RUTA_VUELTA: { label: 'Regresando', variant: 'info' },
  EN_DESCANSO: { label: 'Descansando', variant: 'warning' },
};

function fmtMin(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function RecorridosScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);

  const [view, setView] = useState<'activos' | 'historial'>('activos');
  const [activos, setActivos] = useState<RecorridoActivo[]>([]);
  const [historial, setHistorial] = useState<RecorridoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const loadActivos = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/recorridos/activos');
      setActivos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[Recorridos] activos', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHistorial = useCallback(async () => {
    setLoadingHist(true);
    try {
      const { data } = await api.get('/recorridos/historial', { params: { limit: 50 } });
      setHistorial(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[Recorridos] historial', e);
    } finally {
      setLoadingHist(false);
    }
  }, []);

  // Carga inicial / al enfocar según la vista activa.
  useFocusEffect(useCallback(() => {
    if (view === 'activos') loadActivos();
    else loadHistorial();
  }, [view, loadActivos, loadHistorial]));

  // Auto-refresh cada 20s solo para activos.
  useEffect(() => {
    if (view !== 'activos') return;
    const id = setInterval(() => loadActivos(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [view, loadActivos]);

  // Tick cada 30s para que "en tramo" avance en pantalla.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(() => {
    if (view === 'activos') loadActivos(true);
    else loadHistorial();
  }, [view, loadActivos, loadHistorial]);

  const confirmCerrar = (r: RecorridoActivo) => {
    Alert.alert(
      'Cerrar recorrido',
      `¿Cerrar el recorrido de ${r.trabajador}? Úsalo solo si quedó atascado.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cerrar',
          style: 'destructive',
          onPress: async () => {
            setClosing(r.id);
            try {
              await api.post(`/recorridos/${r.id}/cerrar`);
              await loadActivos(true);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'No se pudo cerrar el recorrido.');
            } finally {
              setClosing(null);
            }
          },
        },
      ],
    );
  };

  const resumen = useMemo(() => ({
    total: activos.length,
    ida: activos.filter((r) => r.estado === 'EN_RUTA_IDA').length,
    vuelta: activos.filter((r) => r.estado === 'EN_RUTA_VUELTA').length,
    descanso: activos.filter((r) => r.estado === 'EN_DESCANSO').length,
  }), [activos]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing || loadingHist} onRefresh={onRefresh} tintColor={C.primary} />
  );

  if (loading && view === 'activos') {
    return (
      <Screen padded>
        <AppHeader title="Recorridos" subtitle="Traslados en curso de tus choferes" />
        <LoadingState text="Cargando recorridos..." />
      </Screen>
    );
  }

  return (
    <Screen scroll padded refreshControl={refreshControl}>
      <AppHeader title="Recorridos" subtitle="Traslados en curso de tus choferes" />

      {/* Segmentado Activos | Historial */}
      <View style={styles.segment}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.segmentBtn, view === 'activos' && styles.segmentBtnActive]}
          onPress={() => setView('activos')}
        >
          <Radio size={15} color={view === 'activos' ? C.text : C.textMuted} />
          <Text style={[styles.segmentText, view === 'activos' && styles.segmentTextActive]}>Activos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.segmentBtn, view === 'historial' && styles.segmentBtnActive]}
          onPress={() => setView('historial')}
        >
          <History size={15} color={view === 'historial' ? C.text : C.textMuted} />
          <Text style={[styles.segmentText, view === 'historial' && styles.segmentTextActive]}>Historial</Text>
        </TouchableOpacity>
      </View>

      {view === 'activos' ? (
        <>
          {/* KPIs */}
          <View style={styles.kpiRow}>
            <StatCard label="En curso" value={resumen.total} icon={RouteIcon} color={C.primary} />
            <StatCard label="En ruta" value={resumen.ida} icon={Navigation} color={C.info} />
          </View>
          <View style={styles.kpiRow}>
            <StatCard label="Regresando" value={resumen.vuelta} icon={CornerUpLeft} color={C.info} />
            <StatCard label="Descansando" value={resumen.descanso} icon={Coffee} color={C.warning} />
          </View>

          {activos.length === 0 ? (
            <EmptyState
              icon={RouteIcon}
              title="Sin recorridos en curso"
              subtitle="Cuando un chofer inicie una ruta, aparecerá aquí."
            />
          ) : (
            <View style={{ gap: S.sm, marginTop: S.sm }}>
              {activos.map((r) => {
                const meta = ESTADO_META[r.estado];
                return (
                  <Card key={r.id} style={styles.recCard}>
                    <View style={styles.recHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.chofer} numberOfLines={1}>{r.trabajador}</Text>
                        <Text style={styles.placa} numberOfLines={1}>{r.placa || 'Sin vehículo'}</Text>
                      </View>
                      <View style={styles.badgeCol}>
                        <Badge label={meta.label} variant={meta.variant} />
                        {r.sinGps && <Badge label="Sin GPS" variant="danger" />}
                      </View>
                    </View>

                    <View style={styles.legRow}>
                      <MapPin size={15} color={C.success} />
                      <Text style={styles.legText} numberOfLines={1}>{r.origen || '—'}</Text>
                    </View>
                    <View style={styles.legRow}>
                      <MapPin size={15} color={C.text} />
                      <Text style={styles.legText} numberOfLines={1}>{r.destino || '—'}</Text>
                    </View>

                    <View style={styles.metricRow}>
                      <View style={styles.metric}>
                        <Clock size={14} color={C.textMuted} />
                        <View>
                          <Text style={styles.metricLabel}>En tramo</Text>
                          <Text style={styles.metricValue}>{fmtMin(r.enTramoMin)}</Text>
                        </View>
                      </View>
                      <View style={styles.metric}>
                        {r.estado === 'EN_DESCANSO'
                          ? <Coffee size={14} color={C.warning} />
                          : <Timer size={14} color={C.info} />}
                        <View>
                          <Text style={styles.metricLabel}>
                            {r.estado === 'EN_DESCANSO' ? 'Descansando hace' : r.estado === 'EN_DESTINO' ? 'Estado' : 'Disponible en'}
                          </Text>
                          <Text style={[styles.metricValue, { color: r.estado === 'EN_DESCANSO' ? C.warning : C.info }]}>
                            {r.estado === 'EN_DESCANSO'
                              ? fmtMin(r.descansoMin)
                              : r.estado === 'EN_DESTINO'
                                ? 'En destino'
                                : `~${fmtMin(r.disponibleEnMin ?? r.etaMin)}`}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Button
                      title="Cerrar"
                      icon={X}
                      variant="ghost"
                      onPress={() => confirmCerrar(r)}
                      loading={closing === r.id}
                      style={styles.cerrarBtn}
                    />
                  </Card>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          {loadingHist && historial.length === 0 ? (
            <LoadingState text="Cargando historial..." />
          ) : historial.length === 0 ? (
            <EmptyState icon={History} title="Aún no hay recorridos finalizados" />
          ) : (
            <View style={{ gap: S.sm, marginTop: S.sm }}>
              {historial.map((r) => (
                <Card key={r.id} style={styles.recCard}>
                  <View style={styles.recHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chofer} numberOfLines={1}>{r.trabajador}</Text>
                      <Text style={styles.placa} numberOfLines={1}>{r.placa || r.cliente || '—'}</Text>
                    </View>
                    <Badge
                      label={r.estado === 'COMPLETADO' ? 'Completado' : 'Cancelado'}
                      variant={r.estado === 'COMPLETADO' ? 'success' : 'neutral'}
                    />
                  </View>

                  <View style={styles.legRow}>
                    <MapPin size={15} color={C.success} />
                    <Text style={styles.legText} numberOfLines={1}>{r.origen || '—'}</Text>
                  </View>
                  <View style={styles.legRow}>
                    <MapPin size={15} color={C.text} />
                    <Text style={styles.legText} numberOfLines={1}>{r.destino || '—'}</Text>
                  </View>

                  <View style={styles.histMetrics}>
                    <HistMetric label="Real (ida)" value={fmtMin(r.ida_min)} />
                    <HistMetric label="Esperado" value={fmtMin(r.esperadoMin)} />
                    <DesvioMetric min={r.desvioMin} />
                    <HistMetric label="Distancia" value={r.ida_km != null ? `${r.ida_km} km` : '—'} />
                    <HistMetric label="Descanso" value={r.descanso_min ? fmtMin(r.descanso_min) : '—'} />
                  </View>

                  {!!r.finalizado_en && (
                    <Text style={styles.finalizado}>
                      Finalizó {new Date(r.finalizado_en).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function HistMetric({ label, value }: { label: string; value: string }) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  return (
    <View style={styles.histMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

// Desvío esperado vs real: rojo si tardó más (↑), verde si llegó antes (↓).
function DesvioMetric({ min }: { min: number | null }) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  if (min == null) {
    return (
      <View style={styles.histMetric}>
        <Text style={styles.metricLabel}>Desvío</Text>
        <Text style={styles.metricValue}>—</Text>
      </View>
    );
  }
  const late = min > 0;
  const color = min === 0 ? C.textMuted : late ? C.danger : C.success;
  return (
    <View style={styles.histMetric}>
      <Text style={styles.metricLabel}>Desvío</Text>
      <View style={styles.desvioRow}>
        {min !== 0 && (late ? <ArrowUp size={13} color={color} /> : <ArrowDown size={13} color={color} />)}
        <Text style={[styles.metricValue, { color }]}>{min === 0 ? '0 min' : fmtMin(Math.abs(min))}</Text>
      </View>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    segment: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      marginTop: S.md,
      borderRadius: Theme.radius.md,
      backgroundColor: C.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: Theme.radius.sm,
    },
    segmentBtnActive: { backgroundColor: C.surface, ...Theme.shadow.card },
    segmentText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
    segmentTextActive: { color: C.text },
    kpiRow: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
    recCard: { gap: S.sm },
    recHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm },
    badgeCol: { alignItems: 'flex-end', gap: 4 },
    chofer: { fontSize: 15, fontWeight: '700', color: C.text },
    placa: { fontSize: 12, color: C.textMuted, marginTop: 1 },
    legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legText: { flex: 1, fontSize: 13, color: C.textMuted },
    metricRow: {
      flexDirection: 'row',
      gap: S.md,
      paddingTop: S.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    metric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    metricLabel: { fontSize: 10, color: C.textMuted, fontWeight: '700', textTransform: 'uppercase' },
    metricValue: { fontSize: 14, fontWeight: '700', color: C.text },
    cerrarBtn: { height: 40, alignSelf: 'flex-start', paddingHorizontal: S.md },
    histMetrics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: S.md,
      paddingTop: S.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    histMetric: { minWidth: 72 },
    desvioRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    finalizado: { fontSize: 11, color: C.textFaint, marginTop: 2 },
  });
