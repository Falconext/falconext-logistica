// Mi Resumen — inicio personal del chofer (reemplaza el dashboard de empresa).
// Muestra lo que le interesa a él: ganancia estimada del mes (horas de manejo ×
// tarifa por hora), sus horas/km, sus consegnas asignadas y accesos a Mi Ruta,
// el mapa de sus recorridos y su perfil.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Clock,
  Route,
  Moon,
  ClipboardList,
  Navigation,
  MapPinned,
  ChevronRight,
  Package,
  CircleUser,
  PlusCircle,
} from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  Card,
  StatCard,
  Badge,
  LoadingState,
  SectionTitle,
  EmptyState,
  Theme,
} from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';

const C = Theme.colors;
const S = Theme.spacing;
const F = Theme.font;
const R = Theme.radius;

interface Resumen {
  moneda?: string;
  tarifas?: { giorno: number; notte: number; corte: number };
  totalPartes: number;
  km: number;
  oreMattina: number;
  oreSera: number;
  oreTotal: number;
  gananciaEstimada: number;
  recientes: { id: string; fecha: string; operacion: string; targa?: string | null; km: number; oreMattina: number; oreSera: number; ganancia: number }[];
}

interface Consegna {
  id: string;
  id_programacion?: string | null;
  cliente?: string | null;
  lugar_retiro?: string | null;
  lugar_entrega?: string | null;
  fecha?: string | null;
  estado?: string | null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Las horas de manejo (ore guida) se registran en decimales (p. ej. 5.5 = 5h 30m).
function horasLabel(h: number): string {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
}

function estadoBadge(estado?: string | null): { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' } {
  switch ((estado || '').toUpperCase()) {
    case 'COMPLETADO':
    case 'COMPLETED':
      return { label: 'Completado', variant: 'success' };
    case 'IN_TRANSIT':
    case 'EN_RUTA_IDA':
    case 'EN_RUTA_VUELTA':
      return { label: 'En ruta', variant: 'info' };
    case 'EN_DESTINO':
      return { label: 'En destino', variant: 'info' };
    case 'PENDING':
    case 'PENDIENTE':
      return { label: 'Pendiente', variant: 'warning' };
    default:
      return { label: estado || '—', variant: 'neutral' };
  }
}

export default function MiResumenScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const router = useRouter();
  const { user } = useAuth();

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [consegnas, setConsegnas] = useState<Consegna[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const [resRes, progRes] = await Promise.all([
        api.get('/registros/mias/resumen'),
        api.get('/programacion', { params: { estados: 'PENDING,PENDIENTE,IN_TRANSIT,REPROGRAMADO', take: 5 } }),
      ]);
      setResumen(resRes.data ?? null);
      const prog = progRes.data;
      setConsegnas(Array.isArray(prog) ? prog : prog?.data ?? []);
    } catch {
      // Silencioso: pull-to-refresh permite reintentar.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Dispositivo GPS del chofer (para abrir el Historial de Ruta con datos).
    try {
      const dev = await api.get('/gps/mi-dispositivo');
      setDeviceId(dev.data?.deviceId || '');
    } catch { /* el chofer puede no tener dispositivo */ }
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

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const nombre = (user?.nombre || user?.email?.split('@')[0] || 'Chofer').split(' ')[0];
  const mes = MESES[new Date().getMonth()];
  const moneda = resumen?.moneda || user?.moneda;
  const tarifas = resumen?.tarifas;

  return (
    <Screen
      scroll
      padded
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <AppHeader title={`Hola, ${nombre}`} subtitle={`Tu resumen de ${mes}`} />

      {/* Ganancia del mes (horas de manejo × tarifa) */}
      <Card style={styles.earningsCard}>
        <Text style={styles.earningsLabel}>Ganancia estimada · {mes}</Text>
        <Text style={styles.earningsValue}>{formatMoney(resumen?.gananciaEstimada ?? 0, moneda)}</Text>
        {tarifas ? (
          <Text style={styles.earningsHint}>
            {horasLabel(resumen?.oreMattina ?? 0)} día × {formatMoney(tarifas.giorno, moneda)}  +  {horasLabel(resumen?.oreSera ?? 0)} noche × {formatMoney(tarifas.notte, moneda)}
          </Text>
        ) : (
          <Text style={styles.earningsHint}>Registra tus partes del día para ver tu ganancia.</Text>
        )}
      </Card>

      {/* Registrar parte del día */}
      <TouchableOpacity style={styles.parteBtn} activeOpacity={0.85} onPress={() => router.push('/(app)/parte-diario' as any)}>
        <PlusCircle size={20} color="#fff" />
        <Text style={styles.parteBtnText}>Registrar parte del día</Text>
      </TouchableOpacity>

      {/* Métricas personales */}
      <View style={styles.statsRow}>
        <StatCard label="Horas de manejo" value={horasLabel(resumen?.oreTotal ?? 0)} icon={Clock} color={C.primary} style={{ flex: 1 }} />
        <StatCard label="Km del mes" value={`${resumen?.km ?? 0} km`} icon={Route} color={C.info} style={{ flex: 1 }} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Horas noche" value={horasLabel(resumen?.oreSera ?? 0)} icon={Moon} color={C.accent} style={{ flex: 1 }} />
        <StatCard label="Partes registrados" value={resumen?.totalPartes ?? 0} icon={ClipboardList} color={C.success} style={{ flex: 1 }} />
      </View>

      {/* Accesos rápidos */}
      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quick} activeOpacity={0.7} onPress={() => router.push('/(app)/mi-ruta' as any)}>
          <Navigation size={20} color={C.primary} />
          <Text style={styles.quickText}>Mi Ruta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(app)/historial', params: { deviceId } } as any)}>
          <MapPinned size={20} color={C.info} />
          <Text style={styles.quickText}>Mapa recorrido</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} activeOpacity={0.7} onPress={() => router.push('/(app)/mi-perfil' as any)}>
          <CircleUser size={20} color={C.accent} />
          <Text style={styles.quickText}>Mi Perfil</Text>
        </TouchableOpacity>
      </View>

      {/* Consegnas asignadas */}
      <SectionTitle style={{ marginTop: S.lg }}>Mis consegnas</SectionTitle>
      {consegnas.length === 0 ? (
        <EmptyState icon={Package} title="Sin consegnas pendientes" subtitle="Cuando te asignen una, aparecerá aquí." />
      ) : (
        consegnas.map((cx) => {
          const b = estadoBadge(cx.estado);
          return (
            <TouchableOpacity key={cx.id} activeOpacity={0.7} onPress={() => router.push('/(app)/operaciones' as any)}>
              <Card style={styles.consegna}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.consegnaCliente} numberOfLines={1}>{cx.cliente || cx.id_programacion || 'Consegna'}</Text>
                  <Text style={styles.consegnaRuta} numberOfLines={1}>
                    {(cx.lugar_retiro || '—') + '  →  ' + (cx.lugar_entrega || '—')}
                  </Text>
                  {!!cx.fecha && (
                    <Text style={styles.consegnaFecha}>{new Date(cx.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</Text>
                  )}
                </View>
                <Badge label={b.label} variant={b.variant} />
                <ChevronRight size={18} color={C.textFaint} />
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      {/* Partes recientes */}
      {!!resumen?.recientes?.length && (
        <>
          <SectionTitle style={{ marginTop: S.lg }}>Mis partes recientes</SectionTitle>
          {resumen.recientes.map((r) => (
            <TouchableOpacity key={r.id} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(app)/parte-diario', params: { id: r.id } } as any)}>
              <Card style={styles.consegna}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.consegnaCliente} numberOfLines={1}>
                    {new Date(r.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} · {r.operacion}{r.targa ? ` · ${r.targa}` : ''}
                  </Text>
                  <Text style={styles.consegnaRuta}>
                    {r.km} km · {horasLabel(r.oreMattina)} día + {horasLabel(r.oreSera)} noche
                  </Text>
                </View>
                <Text style={styles.parteGanancia}>{formatMoney(r.ganancia, moneda)}</Text>
                <ChevronRight size={18} color={C.textFaint} />
              </Card>
            </TouchableOpacity>
          ))}
        </>
      )}
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  earningsCard: {
    marginTop: S.md,
    backgroundColor: C.primary,
    padding: S.lg,
  },
  earningsLabel: { color: '#ffffffCC', fontSize: F.size.sm, fontWeight: '600', textTransform: 'capitalize' },
  earningsValue: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 },
  earningsHint: { color: '#ffffffB3', fontSize: F.size.sm, marginTop: 6, lineHeight: 18 },
  parteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: R.lg,
    paddingVertical: 14,
    marginTop: S.md,
  },
  parteBtnText: { color: '#fff', fontSize: F.size.md, fontWeight: '700' },
  parteGanancia: { fontSize: F.size.md, fontWeight: '800', color: C.success },
  statsRow: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  quickRow: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingVertical: S.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  quickText: { fontSize: F.size.xs, fontWeight: '600', color: C.text },
  consegna: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.sm,
  },
  consegnaCliente: { fontSize: F.size.md, fontWeight: '700', color: C.text },
  consegnaRuta: { fontSize: F.size.sm, color: C.textMuted, marginTop: 2 },
  consegnaFecha: { fontSize: F.size.xs, color: C.textFaint, marginTop: 2 },
});
