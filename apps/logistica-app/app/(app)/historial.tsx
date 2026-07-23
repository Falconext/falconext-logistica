import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  Route as RouteIcon,
  Clock,
  Navigation,
  Timer,
  Gauge,
  TrendingUp,
  MapPin,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { Screen, AppHeader, Theme } from '../../components/ui';
import MapboxWebView from '../../components/MapboxWebView';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

interface Stop {
  lat: number;
  lng: number;
  startTime: string;
  endTime: string;
  durationMin: number;
}
interface Leg {
  from: string;
  to: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  distanceKm: number;
  avgSpeedKmh: number;
}
interface Trip {
  points: number;
  distanceKm: number;
  durationMin: number;
  movingMin: number;
  stoppedMin: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  startTime: string | null;
  endTime: string | null;
  stops: Stop[];
  legs: Leg[];
}

function fmtDur(min: number): string {
  if (!min || min < 1) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function fmtHora(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}
function labelDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const hoy = todayStr();
  if (dateStr === hoy) return 'Hoy';
  if (dateStr === shiftDay(hoy, -1)) return 'Ayer';
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' });
}

export default function HistorialScreen() {
  const params = useLocalSearchParams<{ deviceId?: string; name?: string; placa?: string }>();
  const deviceId = params.deviceId || '';
  const { themeKey, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);

  const [dateStr, setDateStr] = useState<string>(todayStr());
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const start = new Date(dateStr + 'T00:00:00');
      const end = new Date(dateStr + 'T23:59:59');
      const p = { from: start.toISOString(), to: end.toISOString() };
      const [resHist, resTrip] = await Promise.all([
        api.get(`/gps/history/${deviceId}`, { params: p }),
        api.get(`/gps/history/${deviceId}/analisis`, { params: p }),
      ]);
      const pts: [number, number][] = (resHist.data || [])
        .map((d: any) => [parseFloat(d.longitude), parseFloat(d.latitude)] as [number, number])
        .filter((c: [number, number]) => !isNaN(c[0]) && !isNaN(c[1]))
        .reverse(); // API DESC -> cronológico
      setCoords(pts);
      setTrip(resTrip.data || null);
    } catch (e) {
      console.error('Error cargando historial', e);
      setTrip(null);
      setCoords([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, dateStr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markers = useMemo(() => {
    const ms: { lng: number; lat: number; color?: string; popup?: string }[] = [];
    if (coords.length > 0) {
      ms.push({ lng: coords[0][0], lat: coords[0][1], color: '#16A34A', popup: '<b>Salida</b>' });
      ms.push({ lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1], color: '#DC2626', popup: '<b>Llegada</b>' });
    }
    (trip?.stops || []).forEach((s, i) => {
      ms.push({
        lng: s.lng,
        lat: s.lat,
        color: '#F97316',
        popup: `<b>Parada ${i + 1}</b><br/>${fmtHora(s.startTime)} – ${fmtHora(s.endTime)}<br/>Detenido: <b>${fmtDur(s.durationMin)}</b>`,
      });
    });
    return ms;
  }, [coords, trip]);

  const stats = [
    { icon: RouteIcon, label: 'Distancia', value: `${trip?.distanceKm ?? 0} km`, color: '#3B82F6' },
    { icon: Clock, label: 'Duración', value: fmtDur(trip?.durationMin ?? 0), color: '#8B5CF6' },
    { icon: Navigation, label: 'En movimiento', value: fmtDur(trip?.movingMin ?? 0), color: '#10B981' },
    { icon: Timer, label: 'Detenido', value: fmtDur(trip?.stoppedMin ?? 0), color: '#F97316' },
    { icon: Gauge, label: 'Vel. promedio', value: `${trip?.avgSpeedKmh ?? 0} km/h`, color: '#06B6D4' },
    { icon: TrendingUp, label: 'Vel. máxima', value: `${trip?.maxSpeedKmh ?? 0} km/h`, color: '#F43F5E' },
  ];

  const hasData = coords.length > 0;

  return (
    <Screen>
      <AppHeader
        title="Historial de Ruta"
        subtitle={params.placa ? `${params.name || 'Dispositivo'} · ${params.placa}` : params.name || 'Recorrido del día'}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Selector de día */}
        <View style={styles.dateBar}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setDateStr((d) => shiftDay(d, -1))}>
            <ChevronLeft size={20} color={C.text} />
          </TouchableOpacity>
          <View style={styles.dateCenter}>
            <Text style={styles.dateLabel}>{labelDay(dateStr)}</Text>
            {trip?.startTime && (
              <Text style={styles.dateSub}>{fmtHora(trip.startTime)} – {fmtHora(trip.endTime)}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.dateBtn, dateStr >= todayStr() && { opacity: 0.35 }]}
            disabled={dateStr >= todayStr()}
            onPress={() => setDateStr((d) => shiftDay(d, 1))}
          >
            <ChevronRight size={20} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* Mapa con la ruta */}
        <MapboxWebView
          style={styles.map}
          mapStyle="streets"
          route={hasData ? { coordinates: coords } : undefined}
          markers={markers}
          fit
        />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : !hasData ? (
          <View style={styles.empty}>
            <MapPin size={28} color={C.textFaint} />
            <Text style={styles.emptyTitle}>Sin recorrido este día</Text>
            <Text style={styles.emptySub}>No hay posiciones GPS registradas para {labelDay(dateStr).toLowerCase()}.</Text>
          </View>
        ) : (
          <>
            {/* Métricas */}
            <View style={styles.statsGrid}>
              {stats.map((s) => (
                <View key={s.label} style={styles.statTile}>
                  <View style={[styles.statIcon, { backgroundColor: s.color + '22' }]}>
                    <s.icon size={16} color={s.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
                    <Text style={styles.statValue} numberOfLines={1}>{s.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Timeline de tramos */}
            {trip && trip.legs.length > 0 && (
              <View style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                  <RouteIcon size={16} color={C.primary} />
                  <Text style={styles.timelineTitle}>Recorrido del día</Text>
                </View>
                {trip.legs.map((leg, idx) => {
                  const stopAfter = trip.stops[idx];
                  const last = idx === trip.legs.length - 1;
                  return (
                    <View key={idx} style={styles.legRow}>
                      <View style={styles.legDotCol}>
                        <View style={styles.legDot} />
                        {!last && <View style={styles.legLine} />}
                      </View>
                      <View style={{ flex: 1, paddingBottom: last ? 0 : S.md }}>
                        <Text style={styles.legTitle}>{leg.from} → {leg.to}</Text>
                        <Text style={styles.legTime}>{fmtHora(leg.startTime)} – {fmtHora(leg.endTime)}</Text>
                        <View style={styles.legMetaRow}>
                          <Text style={styles.legMeta}>⏱ {fmtDur(leg.durationMin)}</Text>
                          <Text style={styles.legMeta}>📍 {leg.distanceKm} km</Text>
                          <Text style={styles.legMeta}>⚡ {leg.avgSpeedKmh} km/h</Text>
                        </View>
                        {stopAfter && (
                          <View style={styles.stopPill}>
                            <MapPin size={12} color="#F97316" />
                            <Text style={styles.stopPillText}>Parada {idx + 1} · detenido {fmtDur(stopAfter.durationMin)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: S.sm,
    marginTop: S.md,
    marginBottom: S.md,
  },
  dateBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 15, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  dateSub: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  map: {
    height: 300,
    borderRadius: Theme.radius.lg,
    marginBottom: S.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 36, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 4 },
  emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingHorizontal: S.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md },
  statTile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: S.md,
  },
  statIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, color: C.textMuted },
  statValue: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 1 },
  timelineCard: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: S.md,
  },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: S.md },
  timelineTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  legRow: { flexDirection: 'row', gap: S.md },
  legDotCol: { alignItems: 'center', width: 14 },
  legDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary, marginTop: 2 },
  legLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 2 },
  legTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  legTime: { fontSize: 12, color: C.textFaint, marginTop: 1 },
  legMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md, marginTop: 4 },
  legMeta: { fontSize: 12, color: C.textMuted },
  stopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#F9731618',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  stopPillText: { fontSize: 12, color: '#F97316', fontWeight: '600' },
});
