import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Env } from '../constants/Env';
import { DEVICE_TOKEN_KEY } from './api';

const LOCATION_TASK_NAME = 'background-location-task';
// Intención del usuario: "quiero estar rastreando". Persiste para reanudar el
// servicio tras cerrar la app, cambiar de pantalla o reabrir el teléfono.
const TRACKING_ENABLED_KEY = 'tracking_enabled';
// Última vez que el SO nos entregó un punto GPS (llegue o no a enviarse al
// servidor). Sirve para el aviso "sin señal GPS hace X min" durante la ruta:
// si esto deja de moverse, el rastreo se cortó (permiso revocado a mitad de
// viaje, app matada en segundo plano, etc.) — ver ChoferWizard.tsx.
const LAST_POSITION_AT_KEY = 'last_position_at';

// Buffer de puntos pendientes de enviar. En vez de 1 request HTTP por cada punto
// GPS (cada ~3 s → decenas de miles de requests/día por chofer, lo que agota el
// plan serverless), acumulamos y enviamos en LOTE. Reduce ~5-10x las invocaciones.
let pendingPoints: any[] = [];
let isFlushing = false;
let lastFlushAt = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

// Enviar el lote cuando pasen estos segundos o se acumulen estos puntos (lo que
// ocurra primero). 20 s ≈ 6-7 puntos por request → buena frescura en el mapa y
// gran ahorro de invocaciones. El historial NO pierde densidad: cada punto
// conserva su timestamp real.
const FLUSH_INTERVAL_MS = 20000;
const MAX_BATCH = 20;
const MAX_BUFFER = 1000; // tope defensivo si hay muchas fallas de red seguidas

// Opciones del servicio de ubicación. Centralizadas para que el arranque manual
// y la reanudación automática usen exactamente la misma configuración.
const LOCATION_OPTIONS: Location.LocationTaskOptions = {
    // Alta precisión con muestreo denso (~3 s / 5 m): puntos más juntos → distancia,
    // paradas y tramos mucho más exactos. Balance razonable de batería para jornada.
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 5,
    // iOS: tipo de actividad de conducción → el sistema no suspende el GPS y no
    // pausa las actualizaciones cuando el vehículo se detiene brevemente.
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS
    // Android: servicio en primer plano con notificación persistente → el SO no
    // mata el proceso aunque la app esté en segundo plano o cerrada de recientes.
    foregroundService: {
        notificationTitle: 'Logística Pro · Rastreo activo',
        notificationBody: 'Compartiendo tu ubicación con la central.',
        notificationColor: '#4F46E5',
        killServiceOnDestroy: false,
    },
};

// 1. Define the Background Task (Global Scope)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) {
        console.error('[Background] Error:', error);
        return;
    }
    if (data) {
        const { locations } = data;
        // locations is an array of location objects
        for (const loc of locations) {
            await processLocation(loc);
        }
    }
});

// Acumula un punto en el buffer y decide si toca enviar el lote. Funciona igual
// en primer plano y en segundo plano (el task de expo despierta el JS por cada
// punto, así que el flush por tamaño/tiempo se evalúa sin depender de timers).
const processLocation = async (location: Location.LocationObject) => {
    // Se registra ANTES del early-return: es la señal de que el SO SÍ está
    // entregando ubicación, independiente de si hay token o falla el envío.
    AsyncStorage.setItem(LAST_POSITION_AT_KEY, String(Date.now())).catch(() => { });

    const token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return;

    const payload = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        timestamp: new Date(location.timestamp),
        battery: 0,
        accuracy: location.coords.accuracy
    };

    pendingPoints.push(payload);
    if (pendingPoints.length > MAX_BUFFER) pendingPoints.shift();

    const elapsed = Date.now() - lastFlushAt;
    if (pendingPoints.length >= MAX_BATCH || elapsed >= FLUSH_INTERVAL_MS) {
        await flushBatch(token);
    }
};

// Envía TODOS los puntos acumulados en una sola petición (/gps/ingest-batch).
// Si falla (sin red), los devuelve al buffer para reintentar en el próximo flush.
const flushBatch = async (token: string) => {
    if (isFlushing || pendingPoints.length === 0) return;
    isFlushing = true;

    const batch = pendingPoints;
    pendingPoints = [];

    try {
        console.log(`[GPS] Enviando lote de ${batch.length} puntos...`);
        await axios.post(`${Env.API_URL}/gps/ingest-batch`, { token, positions: batch });
        lastFlushAt = Date.now();
    } catch (err) {
        console.error('[GPS] Falló el envío del lote, se reintentará:', err);
        // Reencolar al frente para no perder los puntos ni alterar el orden
        pendingPoints = [...batch, ...pendingPoints];
        if (pendingPoints.length > MAX_BUFFER) {
            pendingPoints = pendingPoints.slice(pendingPoints.length - MAX_BUFFER);
        }
    } finally {
        isFlushing = false;
    }
};

// Timer de respaldo: cuando el chofer está detenido no llegan puntos nuevos, así
// que el flush "por punto" no se dispara y el último tramo quedaría en el buffer.
// Este intervalo lo vacía periódicamente (fiable en primer plano; en segundo
// plano el propio task cubre el envío al llegar el siguiente punto).
const startFlushTimer = () => {
    if (flushTimer) return;
    flushTimer = setInterval(async () => {
        if (pendingPoints.length === 0) return;
        const token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
        if (token) await flushBatch(token);
    }, FLUSH_INTERVAL_MS);
};

const stopFlushTimer = () => {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
};

// Arranca las actualizaciones si no están ya corriendo. Idempotente.
const beginUpdates = async (): Promise<boolean> => {
    startFlushTimer();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) return true;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, LOCATION_OPTIONS);
    console.log('[GPS] Location updates iniciadas');
    return true;
};

export const startTracking = async (): Promise<boolean> => {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
        console.log('Foreground permission denied');
        return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
        // Para un chofer el rastreo en segundo plano es clave, pero si lo niega
        // igual arrancamos (funciona con la app abierta) y guardamos la intención.
        console.log('Background permission denied — se rastreará solo con la app abierta');
    }

    // Marca la intención ANTES de arrancar, para que la reanudación funcione
    // aunque el proceso muera justo después.
    await AsyncStorage.setItem(TRACKING_ENABLED_KEY, '1');
    await beginUpdates();
    console.log('Tracking started (Background Mode)');
    return true;
};

export const stopTracking = async (): Promise<void> => {
    // Limpia la intención: a partir de aquí NO se debe reanudar solo.
    await AsyncStorage.setItem(TRACKING_ENABLED_KEY, '0');
    stopFlushTimer();
    // Envío final para no perder los últimos puntos acumulados en el buffer.
    try {
        const token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
        if (token) await flushBatch(token);
    } catch { /* best-effort */ }
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('Tracking stopped');
    }
};

// ¿El usuario dejó el rastreo activado?
export const isTrackingDesired = async (): Promise<boolean> => {
    return (await AsyncStorage.getItem(TRACKING_ENABLED_KEY)) === '1';
};

// ¿Se concedió el permiso de ubicación en SEGUNDO PLANO ("Permitir siempre")?
// Sin él, el teléfono deja de reportar cuando la app se cierra o la pantalla se
// bloquea → el supervisor deja de ver al chofer en el mapa. Se usa para avisar
// al iniciar la ruta.
export const isBackgroundGranted = async (): Promise<boolean> => {
    try {
        const { status } = await Location.getBackgroundPermissionsAsync();
        return status === 'granted';
    } catch {
        return false;
    }
};

// Segundos desde el último punto GPS que el sistema operativo nos entregó
// (haya podido enviarse o no). null si nunca hubo uno registrado en este
// dispositivo. Usado para avisar al chofer EN VIVO si el rastreo se cortó a
// mitad de ruta, en vez de descubrirlo al final cuando ya no tiene remedio.
export const getSecondsSinceLastPosition = async (): Promise<number | null> => {
    try {
        const v = await AsyncStorage.getItem(LAST_POSITION_AT_KEY);
        if (!v) return null;
        return Math.max(0, Math.floor((Date.now() - Number(v)) / 1000));
    } catch {
        return null;
    }
};

// Reanuda el rastreo si el usuario lo tenía activo pero el servicio se cayó
// (app cerrada por el SO, reinicio del teléfono, cambio de red, etc.).
// Se llama al abrir la app y cada vez que vuelve a primer plano. NO vuelve a
// pedir permisos: si ya no los hay, se queda quieto y el usuario reactiva a mano.
export const resumeTrackingIfNeeded = async (): Promise<void> => {
    try {
        if (!(await isTrackingDesired())) return;
        const token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
        if (!token) return; // sin dispositivo asignado no hay a dónde reportar

        const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (running) return; // ya está vivo, nada que hacer

        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status !== 'granted') return; // permisos revocados: no insistir aquí

        await beginUpdates();
        console.log('[GPS] Rastreo reanudado automáticamente');
    } catch (e) {
        console.warn('[GPS] No se pudo reanudar el rastreo:', e);
    }
};
