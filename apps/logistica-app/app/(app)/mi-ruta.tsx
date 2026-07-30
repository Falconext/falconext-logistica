import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Navigation, MapPin, CornerUpLeft, Flag, Play, Package, Clock, Coffee } from 'lucide-react-native';
import { Screen, AppHeader, Card, Button, Badge, LoadingState, EmptyState, Theme } from '../../components/ui';
import api, { DEVICE_TOKEN_KEY } from '../../services/api';
import { startTracking, stopTracking } from '../../services/LocationService';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;

interface Recorrido {
  id: string;
  estado: 'EN_RUTA_IDA' | 'EN_DESTINO' | 'EN_RUTA_VUELTA' | 'COMPLETADO' | 'CANCELADO';
  origen_label?: string | null;
  destino_label?: string | null;
  iniciado_en: string;
  descanso_desde?: string | null;
}
interface Operacion {
  id: string;
  id_programacion?: string | null;
  cliente?: string | null;
  lugar_retiro?: string | null;
  lugar_entrega?: string | null;
  fecha_entrega?: string | null;
  estado?: string | null;
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
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recorridos/mio/activo');
      if (data && data.id) {
        setActivo(data);
        setOperaciones([]);
      } else {
        setActivo(null);
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
      await api.post('/recorridos/iniciar', { programacionId: op.id });
      if (!trackable) {
        // Cuenta no rastreable: la ruta arranca pero el supervisor no verá GPS.
        Alert.alert('Ruta iniciada · sin GPS', 'Tu cuenta no está habilitada para rastreo, así que el supervisor no verá tu ubicación ni el tiempo estimado. Pide al administrador que active «Será rastreado» en tu ficha.');
      } else {
        // El GPS es secundario: si falla (permiso denegado, Expo Go sin background),
        // la ruta ya quedó iniciada — no abortamos el flujo por eso.
        try {
          const ok = await startTracking();
          if (!ok) Alert.alert('GPS', 'Ruta iniciada, pero falta permiso de ubicación para rastrear. Actívalo para compartir tu posición.');
        } catch (gpsErr) {
          console.warn('[MiRuta] startTracking falló:', gpsErr);
          Alert.alert('GPS', 'Ruta iniciada, pero no se pudo activar el rastreo en este dispositivo.');
        }
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

  // ---- Recorrido en curso ----
  if (activo) {
    return (
      <Screen scroll padded>
        <AppHeader title="Mi Ruta" subtitle="Traslado en curso" />

        <Card style={[styles.activeCard, activo.descanso_desde && styles.restingCard]}>
          <View style={styles.stateRow}>
            {activo.descanso_desde
              ? <Coffee size={22} color={C.warning} />
              : <Navigation size={22} color={C.primary} />}
            <Text style={styles.stateTitle}>
              {activo.descanso_desde ? 'En descanso' : (ESTADO_LABEL[activo.estado] || activo.estado)}
            </Text>
          </View>

          <View style={styles.legRow}>
            <MapPin size={16} color={C.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.legLabel}>ORIGEN</Text>
              <Text style={styles.legValue}>{activo.origen_label || '—'}</Text>
            </View>
          </View>
          <View style={styles.legRow}>
            <MapPin size={16} color={C.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.legLabel}>DESTINO</Text>
              <Text style={styles.legValue}>{activo.destino_label || '—'}</Text>
            </View>
          </View>

          <View style={styles.sinceRow}>
            <Clock size={14} color={C.textMuted} />
            <Text style={styles.sinceText}>Iniciado {new Date(activo.iniciado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        </Card>

        <View style={{ gap: S.sm, marginTop: S.md }}>
          {activo.descanso_desde ? (
            // Descansando: solo reanudar (o cancelar).
            <>
              <Button title="REANUDAR RUTA" icon={Play} onPress={() => accion('reanudar')} loading={busy} />
              <Button title="Cancelar traslado" variant="ghost" onPress={confirmCancelar} disabled={busy} />
            </>
          ) : (
            <>
              {activo.estado === 'EN_RUTA_IDA' && (
                <Button title="LLEGUÉ AL DESTINO" icon={Flag} onPress={() => accion('llegada')} loading={busy} />
              )}
              {activo.estado === 'EN_DESTINO' && (
                <>
                  <Button title="REGRESAR AL ORIGEN" icon={CornerUpLeft} onPress={() => accion('regreso')} loading={busy} />
                  <Button title="Finalizar (sin retorno)" variant="secondary" onPress={() => accion('finalizar', { stop: true })} disabled={busy} />
                </>
              )}
              {activo.estado === 'EN_RUTA_VUELTA' && (
                <Button title="FINALIZAR RUTA" icon={Flag} onPress={() => accion('finalizar', { stop: true })} loading={busy} />
              )}
              {/* Descanso disponible mientras se está en ruta (tramos largos). */}
              {(activo.estado === 'EN_RUTA_IDA' || activo.estado === 'EN_RUTA_VUELTA') && (
                <Button title="Tomar descanso" icon={Coffee} variant="secondary" onPress={() => accion('descanso')} disabled={busy} />
              )}
              {activo.estado === 'EN_RUTA_IDA' && (
                <Button title="Cancelar traslado" variant="ghost" onPress={confirmCancelar} disabled={busy} />
              )}
            </>
          )}
        </View>

        <Text style={styles.hint}>
          {activo.descanso_desde
            ? 'Estás en descanso. El supervisor ve que estás pausado; reanuda cuando retomes la ruta.'
            : 'Tu ubicación se comparte con la central mientras la ruta está activa.'}
        </Text>
      </Screen>
    );
  }

  // ---- Sin recorrido: elegir operación ----
  return (
    <Screen scroll padded>
      <AppHeader title="Mi Ruta" subtitle="Elige una operación para iniciar" />
      {operaciones.length === 0 ? (
        <EmptyState icon={Package} title="Sin operaciones asignadas" subtitle="No tienes traslados pendientes por iniciar. Cuando te asignen uno, aparecerá aquí." />
      ) : (
        <View style={{ gap: S.sm, marginTop: S.sm }}>
          {operaciones.map((op) => (
            <Card key={op.id} style={styles.opCard}>
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
              <Button title="INICIAR RUTA" icon={Play} onPress={() => iniciar(op)} loading={busy} style={{ marginTop: S.sm }} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
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
    hint: { fontSize: 12, color: C.textFaint, textAlign: 'center', marginTop: S.md, lineHeight: 18 },
    opCard: { gap: 6 },
    opHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    opCliente: { fontSize: 15, fontWeight: '700', color: C.text },
    opAddr: { flex: 1, fontSize: 13, color: C.textMuted },
  });
