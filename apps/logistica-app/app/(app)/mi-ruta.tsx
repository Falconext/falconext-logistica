import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Navigation, MapPin, CornerUpLeft, Flag, Play, Package, Clock, Coffee, Pencil, Camera, Save, CheckCircle2 } from 'lucide-react-native';
import { Screen, AppHeader, Card, Button, Badge, FormField, LoadingState, EmptyState, Theme } from '../../components/ui';
import api, { DEVICE_TOKEN_KEY } from '../../services/api';
import { startTracking, stopTracking, isBackgroundGranted } from '../../services/LocationService';
import { useTheme } from '../../context/ThemeContext';
import ChoferWizard from '../../components/ChoferWizard';
import MapboxWebView from '../../components/MapboxWebView';

const C = Theme.colors;
const S = Theme.spacing;

interface Recorrido {
  id: string;
  estado: 'EN_RUTA_IDA' | 'EN_DESTINO' | 'EN_RUTA_VUELTA' | 'COMPLETADO' | 'CANCELADO';
  origen_label?: string | null;
  destino_label?: string | null;
  iniciado_en: string;
  descanso_desde?: string | null;
  programacion_id?: string | null;
}
interface ConsegnaData {
  cliente?: string | null;
  spedizione?: string | null;
  vehiculo_id?: string | null;
  app?: string | null;
  ciudad?: string | null;
  otros_datos?: string | null;
  nota?: string | null;
}
interface Operacion {
  id: string;
  id_programacion?: string | null;
  cliente?: string | null;
  lugar_retiro?: string | null;
  lugar_entrega?: string | null;
  fecha_entrega?: string | null;
  estado?: string | null;
  estado_consegna?: string | null;
  retiros?: string[] | null;
  destinos?: string[] | null;
}

const ESTADO_LABEL: Record<string, string> = {
  EN_RUTA_IDA: 'En ruta al destino',
  EN_DESTINO: 'En el destino',
  EN_RUTA_VUELTA: 'Regresando al origen',
};

export default function MiRutaScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activo, setActivo] = useState<Recorrido | null>(null);
  const [trackingOp, setTrackingOp] = useState<Operacion | null>(null); // consegna del recorrido activo (para el wizard)
  const [dismissed, setDismissed] = useState(false); // el chofer cerró el wizard de traslado en curso
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [wizardOp, setWizardOp] = useState<Operacion | null>(null); // consegna aceptada → wizard

  // Flujo pedido: el chofer ACEPTA la consegna (se marca ACCETTATA para que el
  // supervisor sepa que la recibió) y recién ahí se abre la pantalla de la
  // consegna (ChoferWizard: datos, estado, direcciones, bolla).
  const aceptarYAbrir = useCallback(async (op: Operacion) => {
    try {
      await api.patch(`/programacion/${op.id}`, { estado_consegna: 'ACCETTATA' });
    } catch {
      // Si falla el guardado, igual abrimos el wizard (no bloquear al chofer).
    }
    setWizardOp(op);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setDismissed(false); // al recargar/entrar, el traslado en curso se muestra
    try {
      const { data } = await api.get('/recorridos/mio/activo');
      if (data && data.id) {
        setActivo(data);
        setOperaciones([]);
        // Reutilizamos el ChoferWizard (fase "en ruta") para el traslado en curso:
        // cargamos la consegna asociada y se la pasamos al wizard.
        if (data.programacion_id) {
          try {
            const res = await api.get(`/programacion/${data.programacion_id}`);
            if (res.data) setTrackingOp(res.data);
          } catch { }
        }
      } else {
        setActivo(null);
        setTrackingOp(null);
        const ops = await api.get('/recorridos/mias/operaciones');
        setOperaciones(Array.isArray(ops.data) ? ops.data : []);
      }
    } catch (e) {
      console.error('[MiRuta] load', e);
      setActivo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Asegura que el token del dispositivo esté guardado para que el GPS reporte.
  const ensureDeviceToken = async () => {
    try {
      const res = await api.get('/gps/mi-dispositivo');
      if (res.data?.trackable && res.data?.token) {
        await AsyncStorage.setItem(DEVICE_TOKEN_KEY, res.data.token);
        return true;
      }
    } catch (e) { console.warn('[MiRuta] mi-dispositivo', e); }
    return false;
  };

  const iniciar = async (op: Operacion) => {
    setBusy(true);
    try {
      const trackable = await ensureDeviceToken();

      if (trackable) {
        // GPS OBLIGATORIO ANTES de iniciar (por pedido del empresario: "que no se
        // pueda olvidar"). Se verifica y arranca el rastreo primero; solo si queda
        // activo se crea el recorrido. Si algo falta, se manda a Ajustes y NO se
        // inicia la ruta.
        const serviciosOn = await Location.hasServicesEnabledAsync();
        if (!serviciosOn) {
          Alert.alert('Activa la ubicación', 'Debes activar el GPS/ubicación del teléfono para iniciar la ruta.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        const ok = await startTracking();
        if (!ok) {
          Alert.alert('Rastreo GPS requerido', 'No puedes iniciar la ruta sin el rastreo GPS activo. Concede el permiso de ubicación e inténtalo de nuevo.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        if (!(await isBackgroundGranted())) {
          try { await Location.requestBackgroundPermissionsAsync(); } catch { /* noop */ }
          if (!(await isBackgroundGranted())) {
            Alert.alert(
              'Activa "Permitir siempre"',
              'Para iniciar la ruta, tu ubicación debe estar en "Permitir siempre" (así el supervisor te sigue aunque bloquees el teléfono). Ábrelo en Ajustes → Ubicación y vuelve a tocar Iniciar.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
              ],
            );
            try { await stopTracking(); } catch { /* noop */ }
            return;
          }
        }
      }

      // GPS ya activo (o cuenta no rastreable): recién ahora se crea el recorrido.
      await api.post('/recorridos/iniciar', { programacionId: op.id });
      if (!trackable) {
        Alert.alert('Ruta iniciada · sin GPS', 'Tu cuenta no está habilitada para rastreo, así que el supervisor no verá tu ubicación ni el tiempo estimado. Pide al administrador que active «Será rastreado» en tu ficha.');
      }
      await load();
    } catch (e: any) {
      Alert.alert('No se pudo iniciar', e?.response?.data?.message || 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const accion = async (path: string, opts?: { stop?: boolean }) => {
    if (!activo) return;
    setBusy(true);
    try {
      await api.post(`/recorridos/${activo.id}/${path}`);
      if (opts?.stop) await stopTracking();
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCancelar = () => {
    Alert.alert('Cancelar recorrido', '¿Seguro que quieres cancelar este traslado?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: () => accion('cancelar', { stop: true }) },
    ]);
  };

  if (loading) {
    return (
      <Screen padded>
        <AppHeader title="Mi Ruta" subtitle="Inicia y controla tu traslado" />
        <LoadingState text="Cargando tu ruta..." />
      </Screen>
    );
  }

  // ---- Recorrido en curso: se REUTILIZA el ChoferWizard (fase "en ruta"), que
  //      ya muestra el estado del traslado + "Datos de la consegna" + acciones
  //      (Llegué al destino / Tomar descanso / etc.). No duplicamos esa UI aquí.
  if (activo) {
    return (
      <>
        <Screen scroll padded>
          <AppHeader title="Mi Ruta" subtitle="Traslado en curso" />
          {dismissed && (
            <Card style={{ marginTop: S.md, gap: S.sm }}>
              <View style={styles.stateRow}>
                <Navigation size={22} color={C.primary} />
                <Text style={styles.stateTitle}>Tienes un traslado en curso</Text>
              </View>
              <Button title="VER TRASLADO" icon={Navigation} onPress={() => setDismissed(false)} />
            </Card>
          )}
        </Screen>
        <ChoferWizard
          visible={!!trackingOp && !dismissed}
          operacion={trackingOp as any}
          onClose={() => setDismissed(true)}
          onSaved={() => { setDismissed(true); load(); }}
        />
      </>
    );
  }

  // ---- Sin recorrido: elegir operación ----
  return (
    <>
      <Screen scroll padded>
        <AppHeader title="Mi Ruta" subtitle="Elige una consegna para aceptar" />
        {operaciones.length === 0 ? (
          <EmptyState icon={Package} title="Sin consegnas asignadas" subtitle="No tienes consegnas pendientes por aceptar. Cuando te asignen una, aparecerá aquí." />
        ) : (
          <View style={{ gap: S.sm, marginTop: S.sm }}>
            {operaciones.map((op) => (
              <OperacionCard key={op.id} op={op} onAceptar={aceptarYAbrir} />
            ))}
          </View>
        )}
      </Screen>
      <ChoferWizard
        visible={!!wizardOp}
        operacion={wizardOp as any}
        onClose={() => setWizardOp(null)}
        onSaved={() => { setWizardOp(null); load(); }}
      />
    </>
  );
}

// Tarjeta de una consegna asignada: muestra los datos y un único botón
// "ACEPTAR CONSEGNA". Al aceptar se abre el ChoferWizard (datos, estado,
// direcciones, bolla) — ahí el chofer ve/edita todo e inicia la consegna.
function OperacionCard({ op, onAceptar }: {
  op: Operacion;
  onAceptar: (op: Operacion) => void;
}) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);

  return (
    <Card style={styles.opCard}>
      <View style={styles.opHeader}>
        <Text style={styles.opCliente}>{op.cliente || 'Operación'}</Text>
        {!!op.estado && <Badge label={op.estado === 'REPROGRAMADO' ? 'Reprog.' : 'Pendiente'} variant="warning" />}
      </View>
      <View style={styles.legRow}>
        <MapPin size={15} color={C.success} />
        <Text style={styles.opAddr} numberOfLines={1}>{op.lugar_retiro || '—'}</Text>
      </View>
      <View style={styles.legRow}>
        <MapPin size={15} color={C.text} />
        <Text style={styles.opAddr} numberOfLines={1}>{op.lugar_entrega || '—'}</Text>
      </View>
      {/* Mapa de la ruta: origen → retiros → destino → destinos. */}
      {(() => {
        const stops = [...(op.retiros || []), op.lugar_entrega, ...(op.destinos || [])].map((s) => (s || '').trim()).filter(Boolean);
        if (!op.lugar_retiro || stops.length === 0) return null;
        return (
          <MapboxWebView
            style={styles.opMap}
            mapStyle="streets"
            route={{ originAddress: op.lugar_retiro, destinationAddress: stops[stops.length - 1], waypoints: stops.slice(0, -1) }}
            fit
          />
        );
      })()}
      <Button title="ACEPTAR CONSEGNA" icon={CheckCircle2} onPress={() => onAceptar(op)} style={{ marginTop: S.sm }} />
    </Card>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    activeCard: { gap: S.sm, marginTop: S.md, borderWidth: 1, borderColor: C.primary },
    restingCard: { borderColor: C.warning },
    stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    stateTitle: { fontSize: 18, fontWeight: '800', color: C.text },
    legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legLabel: { fontSize: 10, color: C.textMuted, fontWeight: '700' },
    legValue: { fontSize: 15, color: C.text, fontWeight: '600' },
    sinceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    sinceText: { fontSize: 12, color: C.textMuted },
    dataTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: S.sm },
    dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    dataKey: { fontSize: 13, color: C.textMuted },
    dataVal: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1, textAlign: 'right' },
    dataBox: { marginTop: S.sm, backgroundColor: C.surfaceAlt, borderRadius: 10, padding: S.sm },
    dataBoxLabel: { fontSize: 11, color: C.textMuted, textTransform: 'uppercase', marginBottom: 2 },
    dataBoxText: { fontSize: 14, color: C.text },
    hint: { fontSize: 12, color: C.textFaint, textAlign: 'center', marginTop: S.md, lineHeight: 18 },
    opCard: { gap: 6 },
    opHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    opCliente: { fontSize: 15, fontWeight: '700', color: C.text },
    opAddr: { flex: 1, fontSize: 13, color: C.textMuted },
    opMap: { height: 160, borderRadius: 12, overflow: 'hidden', marginTop: S.sm },
    opActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: S.sm },
    linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
    linkText: { fontSize: 13, color: C.primary, fontWeight: '600' },
  });
