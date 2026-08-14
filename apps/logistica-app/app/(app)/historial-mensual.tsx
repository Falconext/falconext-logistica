// Historial mensual del chofer: km, entregas y horas por cada mes (acumulado).
// Cada mes se puede DESPLEGAR para ver el detalle (los recorridos que lo suman).
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Route, Package, Clock, ChevronDown, ChevronUp, Sun, Moon, Bell, Timer } from 'lucide-react-native';
import { Screen, AppHeader, Card, LoadingState, EmptyState, Theme } from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';

const C = Theme.colors; // objeto mutable: los colores inline se releen en cada render
const S = Theme.spacing;

interface Mes {
  anio: number;
  mes: number;
  label: string;
  km: number;
  entregas: number;
  oreTotal: number;
  oreDia: number;
  oreNoche: number;
  reperibilita: number;
  attesaHoras: number;
  recorridos: number;
  pagoHoras?: number;
  pagoReperibilita?: number;
  pagoAttesa?: number;
  gananciaTotal?: number;
}
interface DetItem {
  fecha: string;
  cliente: string;
  origen?: string | null;
  destino?: string | null;
  km: number;
  oreDia: number;
  oreNoche: number;
}

function horasLabel(h?: number): string {
  const v = Number(h);
  const safe = Number.isFinite(v) ? v : 0;
  const horas = Math.floor(safe);
  const min = Math.round((safe - horas) * 60);
  return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
}

export default function HistorialMensualScreen() {
  const { user } = useAuth();
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [meses, setMeses] = useState<Mes[]>([]);
  const [moneda, setMoneda] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, DetItem[] | 'loading'>>({});
  const veFinanzas = !!(user as any)?.ve_finanzas;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/registros/mias/historial-mensual', { params: { meses: 6 } });
      setMeses(Array.isArray(res.data?.meses) ? res.data.meses : []);
      setMoneda(res.data?.moneda || 'EUR');
    } catch (e) {
      console.error('[historial-mensual]', e);
      setMeses([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const toggle = async (m: Mes) => {
    const key = `${m.anio}-${m.mes}`;
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (!detalle[key]) {
      setDetalle((d) => ({ ...d, [key]: 'loading' }));
      try {
        const res = await api.get('/registros/mias/mes-detalle', { params: { anio: m.anio, mes: m.mes } });
        setDetalle((d) => ({ ...d, [key]: Array.isArray(res.data?.items) ? res.data.items : [] }));
      } catch {
        setDetalle((d) => ({ ...d, [key]: [] }));
      }
    }
  };

  if (loading) {
    return (
      <Screen padded>
        <AppHeader title="Historial" subtitle="Tus meses de trabajo" back />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      padded
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <AppHeader title="Historial" subtitle="Tus km y entregas por mes" back />

      {meses.length === 0 ? (
        <EmptyState title="Sin historial" subtitle="Aún no hay meses con actividad registrada." />
      ) : (
        meses.map((m) => {
          const key = `${m.anio}-${m.mes}`;
          const isOpen = expanded === key;
          const det = detalle[key];
          return (
            <Card key={key} style={styles.row}>
              <TouchableOpacity onPress={() => toggle(m)} activeOpacity={0.7} style={styles.header}>
                <Text style={styles.mesLabel}>{m.label}</Text>
                {isOpen ? <ChevronUp size={20} color={C.textMuted} /> : <ChevronDown size={20} color={C.textMuted} />}
              </TouchableOpacity>
              <View style={styles.metrics}>
                <View style={styles.metric}><Route size={15} color={C.info} /><Text style={styles.metricVal}>{m.km} km</Text></View>
                <View style={styles.metric}><Package size={15} color={C.success} /><Text style={styles.metricVal}>{m.entregas} entregas</Text></View>
                <View style={styles.metric}><Clock size={15} color={C.primary} /><Text style={styles.metricVal}>{horasLabel(m.oreTotal)}</Text></View>
              </View>

              {isOpen && (
                <View style={styles.detail}>
                  {/* Desglose del total del mes */}
                  <Text style={styles.detailTitle}>¿Por qué este total?</Text>
                  <View style={styles.breakRow}><Sun size={14} color={C.warning} /><Text style={styles.breakLbl}>Horas día</Text><Text style={styles.breakVal}>{horasLabel(m.oreDia)}{veFinanzas ? ` · ${formatMoney((m.pagoHoras ?? 0) - 0, moneda)}` : ''}</Text></View>
                  <View style={styles.breakRow}><Moon size={14} color={C.accent} /><Text style={styles.breakLbl}>Horas noche</Text><Text style={styles.breakVal}>{horasLabel(m.oreNoche)}</Text></View>
                  <View style={styles.breakRow}><Bell size={14} color={C.success} /><Text style={styles.breakLbl}>Reperibilità</Text><Text style={styles.breakVal}>{m.reperibilita ?? 0}{veFinanzas ? ` · ${formatMoney(m.pagoReperibilita ?? 0, moneda)}` : ''}</Text></View>
                  <View style={styles.breakRow}><Timer size={14} color={C.info} /><Text style={styles.breakLbl}>Attesa (autorizada)</Text><Text style={styles.breakVal}>{horasLabel(m.attesaHoras)}{veFinanzas ? ` · ${formatMoney(m.pagoAttesa ?? 0, moneda)}` : ''}</Text></View>
                  {veFinanzas && m.gananciaTotal != null && (
                    <View style={[styles.breakRow, styles.totalRow]}><Text style={[styles.breakLbl, { fontWeight: '800', color: C.text }]}>Total</Text><Text style={[styles.breakVal, { fontWeight: '800', color: C.success }]}>{formatMoney(m.gananciaTotal, moneda)}</Text></View>
                  )}

                  {/* Lista de recorridos que suman el km */}
                  <Text style={[styles.detailTitle, { marginTop: S.sm }]}>Recorridos ({m.recorridos ?? 0})</Text>
                  {det === 'loading' ? (
                    <ActivityIndicator color={C.primary} style={{ marginVertical: S.sm }} />
                  ) : (det && det.length > 0) ? (
                    det.map((it, i) => (
                      <View key={i} style={styles.detItem}>
                        <Text style={styles.detCliente} numberOfLines={1}>{it.cliente}</Text>
                        <Text style={styles.detMeta}>
                          {new Date(it.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {it.km} km · {horasLabel(it.oreDia + it.oreNoche)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.detEmpty}>Sin recorridos este mes.</Text>
                  )}
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  row: { marginTop: S.sm, gap: S.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mesLabel: { fontSize: 16, fontWeight: '800', color: C.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricVal: { fontSize: 14, color: C.text, fontWeight: '600' },
  detail: { marginTop: S.sm, borderTopWidth: 1, borderTopColor: C.border, paddingTop: S.sm, gap: 4 },
  detailTitle: { fontSize: 13, fontWeight: '700', color: C.textMuted, marginBottom: 2 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  breakLbl: { flex: 1, fontSize: 13, color: C.text },
  breakVal: { fontSize: 13, color: C.text, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 6 },
  detItem: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border + '80' },
  detCliente: { fontSize: 13, fontWeight: '600', color: C.text },
  detMeta: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  detEmpty: { fontSize: 12, color: C.textMuted, fontStyle: 'italic', paddingVertical: 4 },
});
