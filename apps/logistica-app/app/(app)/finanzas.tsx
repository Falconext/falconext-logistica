// Finanzas (Dirección): rentabilidad por entrega — Ingreso (lo que paga el
// cliente) vs Gastado (costo del chofer: horas + reperibilità + attesa + gastos
// de ruta) = Rentabilidad. Resumen del panel /finanzas de la web, adaptado a
// celular. Solo visible a roles con ve_finanzas; el backend ya bloquea el acceso.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SlidersHorizontal, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react-native';
import { Screen, AppHeader, Card, StatCard, Badge, LoadingState, EmptyState, FormField, Theme } from '../../components/ui';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';
import { SPEDIZIONE_OPTIONS, categoriaVehiculoLabel } from '../../constants/operaciones';

const C = Theme.colors;
const S = Theme.spacing;

const monthRangeISO = () => {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

interface Fila {
  id: string;
  fecha: string;
  cliente?: string | null;
  spedizione?: string | null;
  lugar_entrega?: string | null;
  vehiculo_placa?: string | null;
  vehiculo_categoria?: string | null;
  trabajador_nombre?: string | null;
  km_facturable?: number | null;
  ingreso: number | null;
  costo_chofer: number;
  rentabilidad: number | null;
  rentabilidad_pct: number | null;
}
interface Resumen { operaciones: number; operaciones_con_ingreso: number; ingreso: number; costo: number; rentabilidad: number; rentabilidad_pct: number | null; }
interface Data { moneda: string; resumen: Resumen; items: Fila[]; }

export default function FinanzasScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const mr = useMemo(() => monthRangeISO(), []);
  const [desde, setDesde] = useState(mr.from);
  const [hasta, setHasta] = useState(mr.to);
  const [cliente, setCliente] = useState('');
  const [spedizione, setSpedizione] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/programacion/financiero', {
        params: { from: desde, to: hasta, cliente: cliente.trim() || undefined, spedizione: spedizione || undefined },
      });
      setData(res.data ?? null);
    } catch (e) {
      console.error('[finanzas]', e);
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [desde, hasta, cliente, spedizione]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const moneda = data?.moneda || 'EUR';
  const fechaCustom = desde !== mr.from || hasta !== mr.to;
  const activeFilterCount = (fechaCustom ? 1 : 0) + (cliente.trim() ? 1 : 0) + (spedizione ? 1 : 0);
  const clearFilters = () => { setDesde(mr.from); setHasta(mr.to); setCliente(''); setSpedizione(''); };

  const fmtFecha = (v: string) => {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  };

  if (loading) {
    return (
      <Screen padded>
        <AppHeader title="Finanzas" subtitle="Ingreso, costo y rentabilidad" />
        <LoadingState />
      </Screen>
    );
  }

  const resumen = data?.resumen;
  const rentPositiva = (resumen?.rentabilidad ?? 0) >= 0;

  return (
    <Screen
      scroll
      padded
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <AppHeader title="Finanzas" subtitle="Ingreso, costo y rentabilidad por entrega" />

      <View style={styles.statsRow}>
        <StatCard label="Ingreso" value={formatMoney(resumen?.ingreso ?? 0, moneda)} icon={TrendingUp} color={C.success} style={{ flex: 1 }} />
        <StatCard label="Gastado" value={formatMoney(resumen?.costo ?? 0, moneda)} icon={Wallet} color={C.danger} style={{ flex: 1 }} />
      </View>
      <View style={styles.statsRow}>
        <StatCard
          label="Rentabilidad"
          value={formatMoney(resumen?.rentabilidad ?? 0, moneda)}
          icon={rentPositiva ? TrendingUp : TrendingDown}
          color={rentPositiva ? C.success : C.danger}
          style={{ flex: 1 }}
        />
        <StatCard
          label="% Rentabilidad"
          value={resumen?.rentabilidad_pct != null ? `${resumen.rentabilidad_pct.toFixed(1)}%` : '—'}
          icon={Percent}
          color={rentPositiva ? C.success : C.danger}
          style={{ flex: 1 }}
        />
      </View>

      <View style={{ marginTop: S.md, marginBottom: S.sm }}>
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
                <DatePicker label="Desde" value={desde} onChange={setDesde} placeholder="AAAA-MM-DD" />
              </View>
              <View style={{ flex: 1 }}>
                <DatePicker label="Hasta" value={hasta} onChange={setHasta} placeholder="AAAA-MM-DD" />
              </View>
            </View>
            <FormField label="Cliente" value={cliente} onChangeText={setCliente} placeholder="Buscar por cliente..." />
            <Select
              label="Spedizione"
              value={spedizione}
              onChange={setSpedizione}
              placeholder="Todas"
              searchable={false}
              options={[{ value: '', label: 'Todas' }, ...SPEDIZIONE_OPTIONS]}
            />
          </View>
        )}
      </View>

      {!data?.items || data.items.length === 0 ? (
        <EmptyState title="Sin entregas" subtitle="No hay operaciones entregadas en este período." />
      ) : (
        data.items.map((it) => {
          const rentOk = (it.rentabilidad ?? 0) >= 0;
          return (
            <Card key={it.id} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.cliente} numberOfLines={1}>{it.cliente || it.lugar_entrega || 'Sin cliente'}</Text>
                <Text style={styles.fecha}>{fmtFecha(it.fecha)}</Text>
              </View>
              <View style={styles.rowMeta}>
                {!!it.spedizione && <Badge label={it.spedizione} variant="info" />}
                {!!it.vehiculo_placa && (
                  <Text style={styles.metaTxt}>
                    {it.vehiculo_placa}{it.vehiculo_categoria ? ` · ${categoriaVehiculoLabel(it.vehiculo_categoria)}` : ''}
                  </Text>
                )}
                {!!it.trabajador_nombre && <Text style={styles.metaTxt}>{it.trabajador_nombre}</Text>}
              </View>
              <View style={styles.montosRow}>
                <View style={styles.montoCol}>
                  <Text style={styles.montoLabel}>Ingreso</Text>
                  <Text style={styles.montoVal}>{it.ingreso != null ? formatMoney(it.ingreso, moneda) : '—'}</Text>
                </View>
                <View style={styles.montoCol}>
                  <Text style={styles.montoLabel}>Gastado</Text>
                  <Text style={[styles.montoVal, { color: C.danger }]}>{formatMoney(it.costo_chofer, moneda)}</Text>
                </View>
                <View style={styles.montoCol}>
                  <Text style={styles.montoLabel}>Rentabilidad</Text>
                  <Text style={[styles.montoVal, { fontWeight: '800', color: it.rentabilidad != null ? (rentOk ? C.success : C.danger) : C.textFaint }]}>
                    {it.rentabilidad != null ? formatMoney(it.rentabilidad, moneda) : '—'}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  filtrosBar: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  filtrosToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filtrosToggleText: { fontSize: 14, fontWeight: '600', color: C.text },
  filtrosClearBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  filtrosClearText: { fontSize: 13, fontWeight: '600', color: C.danger },
  filtrosPanel: { marginTop: S.sm, padding: S.md, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, gap: S.sm },
  row: { marginTop: S.sm },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm },
  cliente: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  fecha: { fontSize: 12, color: C.textMuted },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S.sm, marginTop: 6 },
  metaTxt: { fontSize: 12, color: C.textMuted },
  montosRow: { flexDirection: 'row', gap: S.md, marginTop: S.sm, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  montoCol: { flex: 1 },
  montoLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase' },
  montoVal: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 },
});
