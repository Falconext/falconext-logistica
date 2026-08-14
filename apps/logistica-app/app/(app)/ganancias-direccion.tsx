// Ganancias (Dirección): cuánto va ganando cada chofer/supervisor en el mes.
// Solo visible a roles con ve_finanzas (Supervisor General, Dir. Operaciones,
// Dir. General). El backend ya bloquea el acceso si el rol no ve finanzas.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, AppHeader, Card, LoadingState, EmptyState, Theme } from '../../components/ui';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';

const C = Theme.colors; // objeto mutable: colores inline se releen en render
const S = Theme.spacing;

interface Fila {
  trabajadorId: string;
  nombre: string;
  cargo?: string | null;
  km: number;
  oreDia: number;
  oreNoche: number;
  oreTotal: number;
  reperibilita: number;
  pagoHoras: number;
  pagoReperibilita: number;
  gananciaTotal: number;
}
interface Data { desde: string; hasta: string; moneda: string; totalPagar: number; choferes: Fila[]; }

function horasLabel(h: number): string {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
}

export default function GananciasDireccionScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/registros/direccion/resumen');
      setData(res.data ?? null);
    } catch (e) {
      console.error('[ganancias-direccion]', e);
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const moneda = data?.moneda || 'EUR';

  if (loading) {
    return (
      <Screen padded>
        <AppHeader title="Ganancias" subtitle="Resumen de dirección" />
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
      <AppHeader title="Ganancias" subtitle="Cuánto va ganando cada chofer/supervisor" />

      <Card style={styles.totalCard}>
        <Text style={styles.totalLbl}>Total a pagar (mes)</Text>
        <Text style={styles.totalVal}>{formatMoney(data?.totalPagar ?? 0, moneda)}</Text>
      </Card>

      {(!data?.choferes || data.choferes.length === 0) ? (
        <EmptyState title="Sin actividad" subtitle="Aún no hay recorridos ni reperibilità este mes." />
      ) : (
        data.choferes.map((f) => (
          <Card key={f.trabajadorId} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.nombre} numberOfLines={1}>{f.nombre}</Text>
              <Text style={styles.ganancia}>{formatMoney(f.gananciaTotal, moneda)}</Text>
            </View>
            {!!f.cargo && <Text style={styles.cargo}>{f.cargo}</Text>}
            <View style={styles.metrics}>
              <Text style={styles.metric}>🕑 {horasLabel(f.oreDia)} día · {horasLabel(f.oreNoche)} noche</Text>
              <Text style={styles.metric}>🛣️ {f.km} km</Text>
              <Text style={styles.metric}>🔔 Reperibilità: {f.reperibilita} (+{formatMoney(f.pagoReperibilita, moneda)})</Text>
              <Text style={styles.metric}>Pago horas: {formatMoney(f.pagoHoras, moneda)}</Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  totalCard: { alignItems: 'center', paddingVertical: S.lg },
  totalLbl: { fontSize: 13, color: C.textMuted },
  totalVal: { fontSize: 28, fontWeight: '800', color: C.success, marginTop: 4 },
  row: { marginTop: S.sm },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm },
  nombre: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  ganancia: { fontSize: 16, fontWeight: '800', color: C.success },
  cargo: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  metrics: { marginTop: S.sm, gap: 4 },
  metric: { fontSize: 13, color: C.text },
});
