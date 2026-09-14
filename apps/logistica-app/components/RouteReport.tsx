import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, PanResponder } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Satellite,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  AlertTriangle,
} from 'lucide-react-native';
import { Theme } from './ui';
import MapboxWebView, { SpeedSegment } from './MapboxWebView';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

interface Stop { lat: number; lng: number; startTime: string; endTime: string; durationMin: number; }
interface Leg { from: string; to: string; startTime: string; endTime: string; durationMin: number; distanceKm: number; avgSpeedKmh: number; expectedMin?: number | null; delayMin?: number | null; }
interface Trip {
  points: number; distanceKm: number; distanceSource?: 'mapbox' | 'gps';
  durationMin: number; movingMin: number; stoppedMin: number;
  expectedMovingMin?: number | null; delayMin?: number | null;
  avgSpeedKmh: number; maxSpeedKmh: number;
  startTime: string | null; endTime: string | null;
  matchedGeometry?: { type: string; coordinates: [number, number][] } | null;
  stops: Stop[]; legs: Leg[];
}
// Posición GPS cruda con velocidad — solo se tiene en modo dispositivo/día (no en
// la traza de operación, que solo trae la línea). Necesaria para el Play.
interface RawPos { lng: number; lat: number; t: number; speedMs: number; }

function fmtDur(min: number): string {
  if (!min || min < 1) return '0 min';
  const h = Math.floor(min / 60); const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function fmtHora(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function fmtHoraMs(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function todayStr(): string { return new Date().toISOString().split('T')[0]; }
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}
function labelDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00'); const hoy = todayStr();
  if (dateStr === hoy) return 'Hoy';
  if (dateStr === shiftDay(hoy, -1)) return 'Ayer';
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' });
}

// ── Velocidad instantánea (mismo criterio que la web: MapboxHistoryMap) ──────
// El equipo manda velocidad en m/s; si no reporta (0) se estima con distancia/
// tiempo entre puntos consecutivos, marcada como "estimada" para no acusar al
// chofer con un pico de GPS que nunca ocurrió.
const MAX_KMH_VALIDA = 200;
const MAX_GAP_ESTIMACION_MS = 5 * 60 * 1000;
interface Velocidad { kmh: number; estimada: boolean; }
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function calcularVelocidades(history: RawPos[]): Velocidad[] {
  return history.map((p, i) => {
    const dev = p.speedMs * 3.6;
    if (p.speedMs > 0 && dev < MAX_KMH_VALIDA) return { kmh: dev, estimada: false };
    if (i === 0) return { kmh: 0, estimada: false };
    const prev = history[i - 1];
    const dtMs = p.t - prev.t;
    if (dtMs < 1000 || dtMs > MAX_GAP_ESTIMACION_MS) return { kmh: 0, estimada: false };
    const kmh = haversineKm(prev, p) / (dtMs / 3600000);
    if (!Number.isFinite(kmh) || kmh >= MAX_KMH_VALIDA) return { kmh: 0, estimada: false };
    return { kmh, estimada: true };
  });
}
type Banda = 'parado' | 'normal' | 'alta' | 'exceso';
const COLOR_BANDA: Record<Banda, string> = { parado: '#94A3B8', normal: '#16A34A', alta: '#F59E0B', exceso: '#DC2626' };
function bandaDe(kmh: number, umbral: number, estimada = false): Banda {
  if (kmh > umbral) return estimada ? 'alta' : 'exceso';
  if (kmh > umbral * 0.75) return 'alta';
  if (kmh > 2) return 'normal';
  return 'parado';
}
// Tramo continuo por encima del umbral — para saltar directo al momento del exceso.
interface Exceso { startIdx: number; maxIdx: number; maxKmh: number; startTime: number; endTime: number; }
function detectarExcesos(history: RawPos[], vel: Velocidad[], umbral: number): Exceso[] {
  const out: Exceso[] = [];
  let cur: Exceso | null = null;
  vel.forEach((v, i) => {
    if (v.kmh > umbral && !v.estimada) {
      if (!cur) cur = { startIdx: i, maxIdx: i, maxKmh: v.kmh, startTime: history[i].t, endTime: history[i].t };
      else { cur.endTime = history[i].t; if (v.kmh > cur.maxKmh) { cur.maxKmh = v.kmh; cur.maxIdx = i; } }
    } else if (cur) { out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out;
}
const UMBRAL_KEY = 'historyMap.umbralKmh';
const UMBRAL_DEFAULT = 130;
const UMBRAL_MIN = 30;
const UMBRAL_MAX = 200;

interface Props {
  deviceId?: string | null;
  programacionId?: string; // modo operación: muestra la traza del recorrido (iniciar→finalizar)
  initialDate?: string; // YYYY-MM-DD; por defecto hoy
  showDaySelector?: boolean;
}

/**
 * Reporte de ruta GPS de un dispositivo para un día: mapa + estadísticas + timeline
 * de tramos/paradas. En modo dispositivo (Historial) agrega el Play: la ruta se
 * pinta por velocidad y se puede reproducir para revisar un incidente puntual.
 * Reutilizable en Historial de Ruta y en el detalle de Operación.
 */
export default function RouteReport({ deviceId, programacionId, initialDate, showDaySelector = true }: Props) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const opMode = !!programacionId;

  const [dateStr, setDateStr] = useState<string>(initialDate || todayStr());
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [history, setHistory] = useState<RawPos[]>([]); // solo modo dispositivo
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [noRecorrido, setNoRecorrido] = useState(false);

  // ── Play ────────────────────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [umbral, setUmbral] = useState(UMBRAL_DEFAULT);
  useEffect(() => {
    AsyncStorage.getItem(UMBRAL_KEY).then((v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= UMBRAL_MIN && n <= UMBRAL_MAX) setUmbral(n);
    }).catch(() => {});
  }, []);
  const cambiarUmbral = (delta: number) => {
    setUmbral((prev) => {
      const n = Math.min(UMBRAL_MAX, Math.max(UMBRAL_MIN, prev + delta));
      AsyncStorage.setItem(UMBRAL_KEY, String(n)).catch(() => {});
      return n;
    });
  };

  const load = useCallback(async () => {
    if (!deviceId && !programacionId) { setLoading(false); return; }
    setLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);
    try {
      if (programacionId) {
        // Modo operación: traza del recorrido (acotada a iniciar→finalizar). Sin
        // velocidad por punto — el Play solo aplica al historial por dispositivo.
        const { data } = await api.get(`/recorridos/programacion/${programacionId}/traza`);
        setNoRecorrido(!data?.recorrido);
        const pts: [number, number][] = (data?.path || [])
          .map((p: any) => [Number(p.lng), Number(p.lat)] as [number, number])
          .filter((c: [number, number]) => !isNaN(c[0]) && !isNaN(c[1]));
        setCoords(pts);
        setHistory([]);
        setTrip(data?.analisis || null);
      } else {
        const start = new Date(dateStr + 'T00:00:00');
        const end = new Date(dateStr + 'T23:59:59');
        const p = { from: start.toISOString(), to: end.toISOString() };
        const [resHist, resTrip] = await Promise.all([
          api.get(`/gps/history/${deviceId}`, { params: p }),
          api.get(`/gps/history/${deviceId}/analisis`, { params: p }),
        ]);
        const raw: RawPos[] = (resHist.data || [])
          .map((d: any) => ({ lng: parseFloat(d.longitude), lat: parseFloat(d.latitude), t: new Date(d.timestamp).getTime(), speedMs: d.speed || 0 }))
          .filter((p: RawPos) => !isNaN(p.lat) && !isNaN(p.lng))
          .reverse(); // API viene DESC -> cronológico
        setHistory(raw);
        setCoords(raw.map((p) => [p.lng, p.lat]));
        setTrip(resTrip.data || null);
      }
    } catch (e) {
      console.error('Error cargando reporte de ruta', e);
      setTrip(null); setCoords([]); setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, programacionId, dateStr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const velocidades = useMemo(() => calcularVelocidades(history), [history]);
  const excesos = useMemo(() => detectarExcesos(history, velocidades, umbral), [history, velocidades, umbral]);

  // Segmentos coloreados por banda de velocidad: puntos consecutivos con la misma
  // banda se agrupan en un solo tramo (una polilínea por punto sería inviable).
  const speedSegments = useMemo<SpeedSegment[]>(() => {
    if (history.length < 2) return [];
    const segs: SpeedSegment[] = [];
    let i = 0;
    while (i < history.length - 1) {
      const banda = bandaDe(velocidades[i]?.kmh ?? 0, umbral, velocidades[i]?.estimada);
      let j = i;
      while (j < history.length - 1 && bandaDe(velocidades[j]?.kmh ?? 0, umbral, velocidades[j]?.estimada) === banda) j++;
      segs.push({
        path: history.slice(i, j + 1).map((p) => [p.lng, p.lat] as [number, number]),
        color: COLOR_BANDA[banda],
        weight: banda === 'exceso' ? 6 : 5,
      });
      i = j;
    }
    return segs;
  }, [history, velocidades, umbral]);

  const irAlPunto = useCallback((idx: number) => {
    setIsPlaying(false);
    setCurrentIndex(idx);
  }, []);

  // Bucle de reproducción — mismo ritmo que la web (1000ms / velocidad).
  useEffect(() => {
    if (!isPlaying || history.length === 0) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= history.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, 1000 / playbackSpeed);
    return () => clearInterval(id);
  }, [isPlaying, playbackSpeed, history.length]);

  const toggleSpeed = () => setPlaybackSpeed((prev) => (prev === 1 ? 5 : prev === 5 ? 10 : 1));

  const cursorPos = history[currentIndex] || null;
  const velActual = velocidades[currentIndex];
  const bandaActual: Banda = velActual ? bandaDe(velActual.kmh, umbral, velActual.estimada) : 'parado';
  const hasPlay = !opMode && history.length > 1;

  const markers = useMemo(() => {
    const ms: { lng: number; lat: number; color?: string; popup?: string }[] = [];
    if (coords.length > 0) {
      ms.push({ lng: coords[0][0], lat: coords[0][1], color: '#16A34A', popup: '<b>Salida</b>' });
      ms.push({ lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1], color: '#DC2626', popup: '<b>Llegada</b>' });
    }
    (trip?.stops || []).forEach((s, i) => {
      ms.push({ lng: s.lng, lat: s.lat, color: '#F97316', popup: `<b>Parada ${i + 1}</b><br/>${fmtHora(s.startTime)} – ${fmtHora(s.endTime)}<br/>Detenido: <b>${fmtDur(s.durationMin)}</b>` });
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

  const hasData = coords.length > 0 || (trip?.points ?? 0) > 0;

  // Firma de la ruta a dibujar. En iOS el WebView no siempre recarga cuando solo
  // cambia `source.html` (la traza llega async DESPUÉS de montar), así que forzamos
  // un remonte limpio del mapa cuando cambian las coordenadas para que `initMap`
  // vuelva a correr y pinte el polyline. Solo afecta a este mapa (no al live).
  // El umbral entra en la firma porque cambia los segmentos de color a dibujar.
  const mapKey = useMemo(() => {
    const geo = trip?.matchedGeometry?.coordinates;
    const src = geo?.length ? geo : coords;
    const first = src[0];
    const last = src[src.length - 1];
    return `${opMode ? 'op' : dateStr}-${src.length}-${first ? first.join(',') : ''}-${last ? last.join(',') : ''}-${hasPlay ? umbral : 'na'}`;
  }, [coords, trip?.matchedGeometry, opMode, dateStr, hasPlay, umbral]);

  // Sin dispositivo GPS asignado al chofer (evita el spinner infinito).
  if (!deviceId && !opMode) {
    return (
      <View style={styles.empty}>
        <Satellite size={28} color={C.textFaint} />
        <Text style={styles.emptyTitle}>Sin dispositivo GPS</Text>
        <Text style={styles.emptySub}>Este chofer no tiene rastreo GPS activo, así que no hay recorrido para mostrar.</Text>
      </View>
    );
  }

  // Modo operación sin recorrido: el chofer aún no inició la ruta de esta operación.
  if (opMode && noRecorrido && !loading && coords.length === 0) {
    return (
      <View style={styles.empty}>
        <Satellite size={28} color={C.textFaint} />
        <Text style={styles.emptyTitle}>Sin recorrido aún</Text>
        <Text style={styles.emptySub}>El chofer todavía no ha iniciado la ruta de esta operación. El recorrido aparecerá cuando dé "Iniciar ruta".</Text>
      </View>
    );
  }

  return (
    <View>
      {showDaySelector && !opMode && (
        <View style={styles.dateBar}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setDateStr((d) => shiftDay(d, -1))}>
            <ChevronLeft size={20} color={C.text} />
          </TouchableOpacity>
          <View style={styles.dateCenter}>
            <Text style={styles.dateLabel}>{labelDay(dateStr)}</Text>
            {trip?.startTime && <Text style={styles.dateSub}>{fmtHora(trip.startTime)} – {fmtHora(trip.endTime)}</Text>}
          </View>
          <TouchableOpacity
            style={[styles.dateBtn, dateStr >= todayStr() && { opacity: 0.35 }]}
            disabled={dateStr >= todayStr()}
            onPress={() => setDateStr((d) => shiftDay(d, 1))}
          >
            <ChevronRight size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* El mapa se monta SOLO cuando la data ya cargó, para que `initMap` corra con
          las coordenadas presentes. En iOS el WebView no recarga de forma fiable al
          cambiar `source.html`, así que montarlo con los datos listos es lo robusto. */}
      {loading ? (
        <View style={[styles.map, styles.mapLoading]}><ActivityIndicator color={C.primary} /></View>
      ) : hasData ? (
        <MapboxWebView
          key={mapKey}
          style={styles.map}
          mapStyle="streets"
          {...(hasPlay
            ? { speedTrack: { base: trip?.matchedGeometry?.coordinates?.length ? trip.matchedGeometry.coordinates : undefined, segments: speedSegments }, cursor: cursorPos ? { lng: cursorPos.lng, lat: cursorPos.lat } : null }
            : { route: { coordinates: (trip?.matchedGeometry?.coordinates?.length ? trip.matchedGeometry.coordinates : coords) }, markers, fit: true })}
        />
      ) : null}

      {loading ? null : !hasData ? (
        <View style={styles.empty}>
          <MapPin size={28} color={C.textFaint} />
          <Text style={styles.emptyTitle}>Sin recorrido este día</Text>
          <Text style={styles.emptySub}>No hay posiciones GPS registradas para {labelDay(dateStr).toLowerCase()}.</Text>
        </View>
      ) : (
        <>
          {hasPlay && (
            <PlayerCard
              styles={styles}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onReset={() => { setIsPlaying(false); setCurrentIndex(0); }}
              playbackSpeed={playbackSpeed}
              onToggleSpeed={toggleSpeed}
              currentIndex={currentIndex}
              total={history.length - 1}
              onScrub={setCurrentIndex}
              onScrubStart={() => setIsPlaying(false)}
              horaActual={cursorPos ? fmtHoraMs(cursorPos.t) : '--:--:--'}
              kmhActual={velActual ? Math.round(velActual.kmh) : 0}
              estimada={!!velActual?.estimada}
              banda={bandaActual}
              umbral={umbral}
              onUmbral={cambiarUmbral}
            />
          )}

          {hasPlay && excesos.length > 0 && (
            <View style={styles.excesosCard}>
              <View style={styles.excesosHeader}>
                <AlertTriangle size={15} color="#DC2626" />
                <Text style={styles.excesosTitle}>Excesos de velocidad</Text>
                <View style={styles.excesosCount}><Text style={styles.excesosCountText}>{excesos.length}</Text></View>
              </View>
              {excesos.map((e, i) => (
                <TouchableOpacity key={i} style={styles.excesoRow} onPress={() => irAlPunto(e.maxIdx)}>
                  <Text style={styles.excesoTime}>{fmtHoraMs(e.startTime)}</Text>
                  <Text style={styles.excesoKmh}>{Math.round(e.maxKmh)} km/h</Text>
                  <ChevronRight size={14} color={C.textFaint} />
                </TouchableOpacity>
              ))}
            </View>
          )}

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

          {trip && trip.legs.length > 0 && (
            <View style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <RouteIcon size={16} color={C.primary} />
                <Text style={styles.timelineTitle}>Recorrido del día</Text>
                {trip.delayMin != null && (
                  <Text style={[styles.delayBadge, trip.delayMin > 1 ? styles.delayBad : trip.delayMin < -1 ? styles.delayGood : styles.delayNeutral]}>
                    {trip.delayMin > 1 ? `+${trip.delayMin} min demora` : trip.delayMin < -1 ? `${Math.abs(trip.delayMin)} min más rápido` : 'En tiempo'}
                  </Text>
                )}
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
    </View>
  );
}

// ── Reproductor: play/pausa, velocidad, barra de progreso arrastrable y el
// dato en vivo del punto actual (hora, km/h, banda) + umbral editable. ──────
function PlayerCard({
  styles, isPlaying, onTogglePlay, onReset, playbackSpeed, onToggleSpeed,
  currentIndex, total, onScrub, onScrubStart, horaActual, kmhActual, estimada, banda, umbral, onUmbral,
}: {
  styles: ReturnType<typeof makeStyles>;
  isPlaying: boolean; onTogglePlay: () => void; onReset: () => void;
  playbackSpeed: number; onToggleSpeed: () => void;
  currentIndex: number; total: number; onScrub: (idx: number) => void; onScrubStart: () => void;
  horaActual: string; kmhActual: number; estimada: boolean; banda: Banda; umbral: number; onUmbral: (delta: number) => void;
}) {
  const trackWidth = useRef(1);
  const pct = total > 0 ? currentIndex / total : 0;

  const scrubTo = (x: number) => {
    const ratio = Math.min(1, Math.max(0, x / trackWidth.current));
    onScrub(Math.round(ratio * total));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { onScrubStart(); scrubTo(e.nativeEvent.locationX); },
      onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
    })
  ).current;

  const bandaLabel: Record<Banda, string> = { parado: 'Detenido', normal: 'Normal', alta: 'Alta', exceso: 'Exceso' };
  const bandaStyle: Record<Banda, any> = { parado: styles.bandaParado, normal: styles.bandaNormal, alta: styles.bandaAlta, exceso: styles.bandaExceso };

  return (
    <View style={styles.playerCard}>
      <View style={styles.playerTop}>
        <View style={styles.playerReadout}>
          <Text style={styles.playerKmh}>{kmhActual}<Text style={styles.playerKmhUnit}> km/h{estimada ? ' ≈' : ''}</Text></Text>
          <Text style={styles.playerHora}>{horaActual}</Text>
        </View>
        <View style={[styles.bandaPill, bandaStyle[banda]]}>
          <Text style={styles.bandaPillText}>{bandaLabel[banda]}</Text>
        </View>
      </View>

      <View
        style={styles.scrubTrack}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width || 1; }}
        {...pan.panHandlers}
      >
        <View style={[styles.scrubFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.scrubThumb, { left: `${pct * 100}%` }]} />
      </View>

      <View style={styles.playerControls}>
        <TouchableOpacity style={styles.playerBtn} onPress={onReset}>
          <RotateCcw size={16} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.playerBtn, styles.playerBtnMain]} onPress={onTogglePlay}>
          {isPlaying ? <Pause size={20} color="#1a1a1c" /> : <Play size={20} color="#1a1a1c" />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.playerBtn} onPress={onToggleSpeed}>
          <FastForward size={16} color={C.text} />
          <Text style={styles.playerSpeedText}>{playbackSpeed}x</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={styles.umbralLabel}>Umbral</Text>
        <TouchableOpacity style={styles.umbralBtn} onPress={() => onUmbral(-10)}><Text style={styles.umbralBtnText}>−</Text></TouchableOpacity>
        <Text style={styles.umbralValue}>{umbral}</Text>
        <TouchableOpacity style={styles.umbralBtn} onPress={() => onUmbral(10)}><Text style={styles.umbralBtnText}>+</Text></TouchableOpacity>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLOR_BANDA.normal }]} /><Text style={styles.legendText}>Normal</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLOR_BANDA.alta }]} /><Text style={styles.legendText}>Alta ≥ {Math.round(umbral * 0.75)}</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLOR_BANDA.exceso }]} /><Text style={styles.legendText}>Exceso &gt; {umbral}</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLOR_BANDA.parado }]} /><Text style={styles.legendText}>Detenido</Text></View>
      </View>
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.sm, marginBottom: S.md },
  dateBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 15, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  dateSub: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  map: { height: 300, borderRadius: Theme.radius.lg, marginBottom: S.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  mapLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 36, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 4 },
  emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingHorizontal: S.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md },
  statTile: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.md },
  statIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, color: C.textMuted },
  statValue: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 1 },
  timelineCard: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.md },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: S.md },
  timelineTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  legRow: { flexDirection: 'row', gap: S.md },
  legDotCol: { alignItems: 'center', width: 14 },
  legDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary, marginTop: 2 },
  legLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 2 },
  legTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  legTime: { fontSize: 12, color: C.textFaint, marginTop: 1 },
  legMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md, marginTop: 4 },
  legMeta: { fontSize: 12, color: C.textMuted },
  delayBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  delayBad: { color: '#E11D48', backgroundColor: '#E11D4818' },
  delayGood: { color: '#059669', backgroundColor: '#05966918' },
  delayNeutral: { color: C.textMuted, backgroundColor: C.surfaceAlt },
  stopPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#F9731618', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  stopPillText: { fontSize: 12, color: '#F97316', fontWeight: '600' },

  // Reproductor
  playerCard: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.md, marginBottom: S.md },
  playerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.sm },
  playerReadout: { flexDirection: 'row', alignItems: 'baseline', gap: S.sm },
  playerKmh: { fontSize: 24, fontWeight: '800', color: C.text },
  playerKmhUnit: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  playerHora: { fontSize: 13, color: C.textMuted, fontVariant: ['tabular-nums'] },
  bandaPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  bandaPillText: { fontSize: 11, fontWeight: '700' },
  bandaParado: { backgroundColor: '#94A3B822' },
  bandaNormal: { backgroundColor: '#16A34A22' },
  bandaAlta: { backgroundColor: '#F59E0B22' },
  bandaExceso: { backgroundColor: '#DC262622' },
  scrubTrack: { height: 28, justifyContent: 'center', marginBottom: S.sm },
  scrubFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: Theme.colors.accent },
  scrubThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: Theme.colors.accent, borderWidth: 2, borderColor: '#1a1a1c', marginLeft: -8, top: 6 },
  playerControls: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  playerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  playerBtnMain: { backgroundColor: Theme.colors.accent, width: 48, height: 48, borderRadius: 24 },
  playerSpeedText: { fontSize: 10, fontWeight: '700', color: C.text },
  umbralLabel: { fontSize: 11, color: C.textMuted, marginRight: 2 },
  umbralBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  umbralBtnText: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: -2 },
  umbralValue: { fontSize: 13, fontWeight: '700', color: C.text, minWidth: 30, textAlign: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md, marginTop: S.md, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: C.textMuted },

  // Excesos
  excesosCard: { backgroundColor: '#DC262610', borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DC262630', padding: S.md, marginBottom: S.md },
  excesosHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: S.sm },
  excesosTitle: { fontSize: 13, fontWeight: '700', color: C.text, flex: 1 },
  excesosCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  excesosCountText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  excesoRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 6 },
  excesoTime: { fontSize: 12, color: C.textMuted, fontVariant: ['tabular-nums'], flex: 1 },
  excesoKmh: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
});
