// Historial mensual del chofer: km, entregas y horas por cada mes (acumulado).
// "Ellos siempre lo han visto así" — Julio, Agosto, Septiembre…
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Route, Package, Clock } from 'lucide-react-native';
import { Screen, AppHeader, Card, LoadingState, EmptyState, Theme } from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../constants/currency';

const C = Theme.colors;
const S = Theme.spacing;

interface Mes {
  anio: number;
  mes: number;
  label: string;
  km: number;
  entregas: number;
  oreTotal: number;
  reperibilita: number;
  gananciaTotal?: number;
}

function horasLabel(h: number): string {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
}

export default function HistorialMensualScreen() {
  const { user } = useAuth();
  const [meses, setMeses] = useState<Mes[]>([]);
  const [moneda, setMoneda] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        meses.map((m) => (
          <Card key={`${m.anio}-${m.mes}`} style={styles.row}>
            <Text style={styles.mesLabel}>{m.label}</Text>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Route size={15} color={C.info} />
                <Text style={styles.metricVal}>{m.km} km</Text>
              </View>
              <View style={styles.metric}>
                <Package size={15} color={C.success} />
                <Text style={styles.metricVal}>{m.entregas} entregas</Text>
              </View>
              <View style={styles.metric}>
                <Clock size={15} color={C.primary} />
                <Text style={styles.metricVal}>{horasLabel(m.oreTotal)}</Text>
              </View>
            </View>
            {veFinanzas && m.gananciaTotal != null && (
              <Text style={styles.ganancia}>{formatMoney(m.gananciaTotal, moneda)}</Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: S.sm, gap: S.sm },
  mesLabel: { fontSize: 16, fontWeight: '800', color: C.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricVal: { fontSize: 14, color: C.text, fontWeight: '600' },
  ganancia: { fontSize: 15, fontWeight: '800', color: C.success },
});
