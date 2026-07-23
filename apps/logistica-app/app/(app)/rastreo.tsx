import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import { Power, Navigation, MapPin, ShieldAlert } from 'lucide-react-native';
import { Screen, AppHeader, Card, Theme } from '../../components/ui';
import api, { DEVICE_TOKEN_KEY } from '../../services/api';
import { startTracking, stopTracking } from '../../services/LocationService';
import { useTheme } from '../../context/ThemeContext';

const LOCATION_TASK_NAME = 'background-location-task';
const C = Theme.colors;
const S = Theme.spacing;

export default function RastreoScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);

  const [loading, setLoading] = useState(true);
  const [trackable, setTrackable] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [busy, setBusy] = useState(false);

  // Obtiene el dispositivo del usuario logueado. Si es rastreable, guarda su
  // token durable en AsyncStorage para que la tarea en segundo plano reporte.
  const loadDevice = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/gps/mi-dispositivo');
      const d = res.data || {};
      if (d.trackable && d.token) {
        setTrackable(true);
        setDeviceName(d.name || null);
        await AsyncStorage.setItem(DEVICE_TOKEN_KEY, d.token);
      } else {
        setTrackable(false);
        setDeviceName(null);
        await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
      }
    } catch (e) {
      setTrackable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    const reg = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    setIsTracking(reg);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDevice();
      checkStatus();
    }, [loadDevice, checkStatus])
  );

  const toggle = async () => {
    setBusy(true);
    try {
      if (isTracking) {
        await stopTracking();
      } else {
        const ok = await startTracking();
        if (!ok) {
          Alert.alert('Permiso denegado', 'Necesitamos permiso de ubicación para activar el rastreo.');
          return;
        }
      }
      await checkStatus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll padded>
      <AppHeader title="Rastreo" subtitle="Comparte tu ubicación en tiempo real" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : !trackable ? (
        <Card style={styles.disabledCard}>
          <ShieldAlert size={40} color={C.textMuted} />
          <Text style={styles.disabledTitle}>Rastreo no habilitado</Text>
          <Text style={styles.disabledDesc}>
            Tu cuenta no está marcada como rastreable. Pide al administrador que active
            «Será rastreado» en tu ficha de trabajador.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: S.lg, marginTop: S.md }}>
          <Card style={[styles.statusCard, isTracking ? styles.statusActive : styles.statusInactive]}>
            <View style={styles.statusHeader}>
              <Navigation size={28} color={isTracking ? C.success : C.textMuted} />
              <Text style={[styles.statusTitle, { color: isTracking ? C.success : C.textMuted }]}>
                {isTracking ? 'Rastreando' : 'Inactivo'}
              </Text>
            </View>
            <Text style={styles.statusDesc}>
              {isTracking
                ? 'Tu ubicación se está enviando en segundo plano, aunque uses otras pantallas.'
                : 'El servicio de rastreo está detenido.'}
            </Text>
            {!!deviceName && <Text style={styles.deviceName}>Dispositivo: {deviceName}</Text>}
          </Card>

          <TouchableOpacity
            style={[styles.mainButton, isTracking ? styles.stopButton : styles.startButton]}
            onPress={toggle}
            activeOpacity={0.85}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Power size={44} color="#fff" />
                <Text style={styles.mainButtonText}>
                  {isTracking ? 'DETENER RASTREO' : 'INICIAR RASTREO'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Card style={styles.infoRow}>
            <MapPin size={22} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>MODO GPS</Text>
              <Text style={styles.infoValue}>Segundo plano</Text>
            </View>
          </Card>
        </View>
      )}
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    center: { paddingVertical: 80, alignItems: 'center' },
    disabledCard: { alignItems: 'center', gap: S.sm, paddingVertical: S.xl, marginTop: S.md },
    disabledTitle: { fontSize: 17, fontWeight: '700', color: C.text },
    disabledDesc: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
    statusCard: { borderWidth: 1 },
    statusActive: { borderColor: C.success },
    statusInactive: { borderColor: C.border },
    statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    statusTitle: { fontSize: 19, fontWeight: '700' },
    statusDesc: { fontSize: 14, color: C.textMuted, lineHeight: 20 },
    deviceName: { fontSize: 13, color: C.textFaint, marginTop: 8 },
    mainButton: {
      alignSelf: 'center',
      width: 220,
      height: 220,
      borderRadius: 110,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 14,
      ...Theme.shadow.floating,
    },
    startButton: { backgroundColor: C.primary },
    stopButton: { backgroundColor: C.danger },
    mainButtonText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 1 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
    infoLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase' },
    infoValue: { fontSize: 15, color: C.text, fontWeight: '700' },
  });
