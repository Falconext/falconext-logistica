// Notificaciones push (Expo). El chofer se entera al instante cuando el
// supervisor le asigna una consegna, aunque tenga el celular en el bolsillo:
// no depende de tener la app abierta ni de consultar al servidor cada X segundos.
//
// Flujo:
//   1. registerForPush(): pide permiso, obtiene el ExponentPushToken y lo
//      registra en el backend (POST /notificaciones/token). Se llama tras el
//      login y en cada arranque con sesión (Expo puede rotar el token).
//   2. El backend manda el push cuando asigna/cambia el chofer de una operación.
//   3. Al tocar la notificación, la app navega a la pantalla indicada en `data`.
//   4. unregisterPush(): en logout, da de baja el token para no recibir pushes
//      de otro usuario si alguien más entra en el mismo celular.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const PUSH_TOKEN_KEY = 'push_token';

// Cómo se muestra una notificación que llega con la app ABIERTA (en primer
// plano). Sin esto iOS la silencia. Se muestra igual que si estuviera cerrada.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  // El backend manda channelId 'consegnas': tiene que existir en el dispositivo
  // o Android usa el canal por defecto (sin sonido/vibración garantizados).
  await Notifications.setNotificationChannelAsync('consegnas', {
    name: 'Consegnas asignadas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

/** Pide permiso, obtiene el token y lo registra en el backend. Silencioso: nunca lanza. */
export async function registerForPush(): Promise<string | null> {
  try {
    // En simulador no hay push real; se evita el error de Expo.
    if (!Device.isDevice) return null;

    await ensureAndroidChannel();

    const { status: current } = await Notifications.getPermissionsAsync();
    let status = current;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return null;

    await api.post('/notificaciones/token', { token, platform: Platform.OS });
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.warn('[Push] registro falló', (e as any)?.message || e);
    return null;
  }
}

/** Da de baja el token en el backend (logout). Silencioso. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await api.delete('/notificaciones/token', { data: { token } }).catch(() => {});
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    }
  } catch { /* ignorar */ }
}

export type PushData = { tipo?: string; programacion_id?: string; [k: string]: unknown };

/**
 * Suscribe a "tocó una notificación" (app cerrada, en background o abierta) y a
 * "llegó una notificación con la app abierta". Devuelve la función para desuscribir.
 */
export function subscribePush(handlers: {
  onTap?: (data: PushData) => void;
  onReceive?: (data: PushData) => void;
}): () => void {
  const tapSub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = (resp.notification.request.content.data || {}) as PushData;
    handlers.onTap?.(data);
  });
  const recvSub = Notifications.addNotificationReceivedListener((notif) => {
    const data = (notif.request.content.data || {}) as PushData;
    handlers.onReceive?.(data);
  });
  return () => {
    tapSub.remove();
    recvSub.remove();
  };
}

/** Si la app se abrió DESDE una notificación (estaba cerrada), devuelve sus datos. */
export async function getInitialPushData(): Promise<PushData | null> {
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    if (!resp) return null;
    return (resp.notification.request.content.data || {}) as PushData;
  } catch {
    return null;
  }
}
