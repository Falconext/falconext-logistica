// Parte diario del chofer: registra su jornada (km + ore guida) — la base de su
// pago. Las horas van en DOS campos porque un turno puede cruzar las 19:00
// (p. ej. 14:00→02:00): horas de día (tarifa diurna) + horas de noche (nocturna),
// y la ganancia SUMA ambos tramos.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sun, Moon, Save, Trash2 } from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  Card,
  FormField,
  Button,
  LoadingState,
  Theme,
} from '../../components/ui';
import DatePicker from '../../components/DatePicker';
import ImageUpload from '../../components/ImageUpload';
import Select from '../../components/Select';
import { SPEDIZIONE_OPTIONS } from '../../constants/operaciones';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney } from '../../constants/currency';

const C = Theme.colors;
const S = Theme.spacing;
const F = Theme.font;
const R = Theme.radius;

const OPERACIONES = ['DHL', 'FARMACIA'] as const;

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const numOr0 = (v: string) => {
  const n = parseFloat((v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function ParteDiarioScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id;

  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [tarifas, setTarifas] = useState<{ giorno: number; notte: number; corte: number } | null>(null);

  const [form, setForm] = useState({
    operacion: 'DHL' as (typeof OPERACIONES)[number],
    fecha: hoyISO(),
    targa: '',
    citta_destino: '',
    km: '',
    ore_mattina: '',
    ore_sera: '',
    ore_attesa: '',
    repibilita: false,
    consegna_realizada: true,
    cliente: '',
    spedizione: '',
    comentario: '',
    foto_bolla: '',
  });
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    try {
      // tarifas para el cálculo en vivo (vienen en el resumen del chofer)
      const resumen = await api.get('/registros/mias/resumen');
      if (resumen.data?.tarifas) setTarifas(resumen.data.tarifas);

      if (editId) {
        const { data } = await api.get(`/registros/${editId}`);
        setForm({
          operacion: (data.operacion === 'FARMACIA' ? 'FARMACIA' : 'DHL'),
          fecha: data.fecha ? String(data.fecha).split('T')[0] : hoyISO(),
          targa: data.targa || '',
          km: data.km != null ? String(data.km) : '',
          citta_destino: data.citta_destino || '',
          ore_mattina: data.ore_mattina != null ? String(data.ore_mattina) : '',
          ore_sera: data.ore_sera != null ? String(data.ore_sera) : '',
          ore_attesa: data.ore_attesa != null ? String(data.ore_attesa) : '',
          repibilita: !!data.repibilita,
          consegna_realizada: data.consegna_realizada !== false,
          cliente: data.cliente || '',
          spedizione: data.spedizione || '',
          comentario: data.comentario || '',
          foto_bolla: data.foto_bolla || '',
        });
      }
    } catch {
      // Silencioso.
    } finally {
      setLoading(false);
    }
  }, [editId]);

  useEffect(() => {
    load();
  }, [load]);

  const moneda = user?.moneda;
  const gananciaPreview =
    tarifas ? Math.round((numOr0(form.ore_mattina) * tarifas.giorno + numOr0(form.ore_sera) * tarifas.notte) * 100) / 100 : 0;

  const guardar = async () => {
    if (!form.ore_mattina && !form.ore_sera && !form.km) {
      Alert.alert('Falta información', 'Ingresa al menos los km o las horas de manejo.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        operacion: form.operacion,
        fecha: form.fecha,
        targa: form.targa.trim().toUpperCase() || null,
        citta_destino: form.citta_destino.trim() || null,
        km: numOr0(form.km),
        ore_mattina: numOr0(form.ore_mattina),
        ore_sera: numOr0(form.ore_sera),
        ore_attesa: numOr0(form.ore_attesa),
        repibilita: form.repibilita,
        consegna_realizada: form.consegna_realizada,
        cliente: form.cliente.trim() || null,
        spedizione: form.spedizione.trim() || null,
        comentario: form.comentario.trim() || null,
        foto_bolla: form.foto_bolla || null,
      };
      if (editId) await api.patch(`/registros/${editId}`, payload);
      else await api.post('/registros', payload);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo guardar el parte.');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = () => {
    if (!editId) return;
    Alert.alert('Eliminar parte', '¿Seguro que deseas eliminar este parte?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/registros/${editId}`);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={editId ? 'Editar parte' : 'Parte del día'} subtitle="Registra tus km y horas de manejo" back />
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxl }} showsVerticalScrollIndicator={false}>
        {/* Operación DHL / Farmacia */}
        <Text style={styles.label}>Operación</Text>
        <View style={styles.segment}>
          {OPERACIONES.map((op) => {
            const active = form.operacion === op;
            return (
              <TouchableOpacity key={op} style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={() => set('operacion', op)} activeOpacity={0.8}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{op}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <DatePicker label="Fecha" value={form.fecha} onChange={(v) => set('fecha', v || hoyISO())} />

        {/* Targa del furgón y Ciudad/destino se ocultan al chofer: la app ya los
            tiene/deriva (van a la consegna en "Nueva operación"). Se mantienen en
            el estado del form (opcionales, se guardan como null) para no romper el
            guardado ni la edición. Pedido del video (B6). */}

        <FormField label="KM total" value={form.km} onChangeText={(t) => set('km', t)} placeholder="0" keyboardType="numeric" />

        {/* Horas de manejo: día y noche (se suman) */}
        <View style={styles.hoursRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.hoursHead}>
              <Sun size={15} color={C.warning} />
              <Text style={styles.hoursTitle}>Horas de día</Text>
            </View>
            <FormField label={`hasta ${tarifas?.corte ?? 19}:00 · ${formatMoney(tarifas?.giorno, moneda)}/h`} value={form.ore_mattina} onChangeText={(t) => set('ore_mattina', t)} placeholder="0.0" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.hoursHead}>
              <Moon size={15} color={C.accent} />
              <Text style={styles.hoursTitle}>Horas de noche</Text>
            </View>
            <FormField label={`desde ${tarifas?.corte ?? 19}:00 · ${formatMoney(tarifas?.notte, moneda)}/h`} value={form.ore_sera} onChangeText={(t) => set('ore_sera', t)} placeholder="0.0" keyboardType="numeric" />
          </View>
        </View>

        <FormField label="Horas de espera (ore attesa)" value={form.ore_attesa} onChangeText={(t) => set('ore_attesa', t)} placeholder="0.0" keyboardType="numeric" />

        {/* Ganancia calculada en vivo (solo horas de manejo; la espera no se paga) */}
        <Card style={styles.previewCard}>
          <Text style={styles.previewLabel}>Ganancia de este parte</Text>
          <Text style={styles.previewValue}>{formatMoney(gananciaPreview, moneda)}</Text>
        </Card>

        {/* Reperibilità: la marca SOLO el supervisor al crear la operación
            (Nueva operación). El chofer no la activa — por eso se quitó de aquí. */}

        {/* ¿Se realizó la consegna? */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>¿Se realizó la consegna?</Text>
            <Text style={styles.switchHint}>Marca si se completó la entrega</Text>
          </View>
          <Switch value={form.consegna_realizada} onValueChange={(v) => set('consegna_realizada', v)} trackColor={{ true: C.success }} />
        </View>

        <FormField label="Cliente" value={form.cliente} onChangeText={(t) => set('cliente', t)} placeholder="Ej: DHL, OTRO..." />
        <Select
          label="Spedizione"
          value={form.spedizione}
          onChange={(v) => set('spedizione', v)}
          options={SPEDIZIONE_OPTIONS}
          placeholder="Selecciona spedizione"
          clearable
        />
        <FormField label="Comentario final" value={form.comentario} onChangeText={(t) => set('comentario', t)} placeholder="Notas de la jornada" multiline />

        <Text style={styles.label}>Foto de la bolla</Text>
        <ImageUpload value={form.foto_bolla} onChange={(url) => set('foto_bolla', url)} onClear={() => set('foto_bolla', '')} label="Subir foto de la bolla" variant="wide" />

        <View style={{ height: S.md }} />
        <Button title={editId ? 'Guardar cambios' : 'Guardar parte'} onPress={guardar} loading={saving} icon={Save} />

        {editId && (
          <TouchableOpacity style={styles.deleteBtn} onPress={eliminar} activeOpacity={0.7}>
            <Trash2 size={16} color={C.danger} />
            <Text style={styles.deleteText}>Eliminar parte</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  label: { fontSize: F.size.sm, fontWeight: '700', color: C.textMuted, marginBottom: 6, marginTop: 2 },
  segment: { flexDirection: 'row', backgroundColor: C.surfaceAlt, borderRadius: R.lg, padding: 4, marginBottom: S.md },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: R.md, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: C.surface, ...Theme.shadow.card },
  segmentText: { fontSize: F.size.sm, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: C.primary },
  hoursRow: { flexDirection: 'row', gap: S.sm },
  hoursHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  hoursTitle: { fontSize: F.size.sm, fontWeight: '700', color: C.text },
  previewCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.primary, paddingVertical: S.md, paddingHorizontal: S.lg, marginBottom: S.md },
  previewLabel: { color: '#ffffffCC', fontSize: F.size.sm, fontWeight: '600' },
  previewValue: { color: '#fff', fontSize: F.size.xl, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm, marginBottom: S.sm },
  switchLabel: { fontSize: F.size.md, fontWeight: '600', color: C.text },
  switchHint: { fontSize: F.size.xs, color: C.textMuted, marginTop: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: S.md, marginTop: S.sm },
  deleteText: { color: C.danger, fontSize: F.size.sm, fontWeight: '600' },
});
