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

// Queue for offline storage
let locationQueue: any[] = [];
let isFlushing = false;

// Opciones del servicio de ubicación. Centralizadas para que el arranque manual
// y la reanudación automática usen exactamente la misma configuración.
const LOCATION_OPTIONS: Location.LocationTaskOptions = {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5000,
    distanceInterval: 10,
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

// Helper to process a single location (Shared by both FG and BG if needed)
const processLocation = async (location: Location.LocationObject) => {
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

    console.log('[GPS] New Point:', payload.lat, payload.lng);

    try {
        await axios.post(`${Env.API_URL}/gps/ingest`, {
            token: token,
            ...payload
        });

        // If success, try flush queue
        flushQueue(token);
    } catch (err) {
        console.error('[GPS] Upload Failed, Queuing:', err);
        locationQueue.push(payload);
        if (locationQueue.length > 1000) locationQueue.shift();
    }
};

const flushQueue = async (token: string) => {
    if (isFlushing || locationQueue.length === 0) return;
    isFlushing = true;

    console.log(`[Queue] Flushing ${locationQueue.length} points...`);
    const queueSnapshot = [...locationQueue];
    locationQueue = [];

    for (const data of queueSnapshot) {
        try {
            await axios.post(`${Env.API_URL}/gps/ingest`, { ...data, token });
        } catch (error) {
            console.error('[Queue] Failed to flush point.');
            const remaining = queueSnapshot.slice(queueSnapshot.indexOf(data));
            locationQueue = [...remaining, ...locationQueue];
            break;
        }
    }
    isFlushing = false;
};

// Arranca las actualizaciones si no están ya corriendo. Idempotente.
const beginUpdates = async (): Promise<boolean> => {
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
