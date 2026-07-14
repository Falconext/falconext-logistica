import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Env } from '../constants/Env';

const LOCATION_TASK_NAME = 'background-location-task';

// Queue for offline storage
let locationQueue: any[] = [];
let isFlushing = false;

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
    const token = await AsyncStorage.getItem('device_token');
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

export const startTracking = async () => {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
        console.log('Foreground permission denied');
        return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
        console.log('Background permission denied');
        // Fallback to foreground? Or return false. 
        // For a driver app, background is crucial.
        // return false; 
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
        console.log('Task already running');
        return true;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
        foregroundService: {
            notificationTitle: "Logística Pro",
            notificationBody: "Rastreando ubicación en segundo plano...",
            notificationColor: "#4F46E5"
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true // iOS
    });

    console.log('Tracking started (Background Mode)');
    return true;
};

export const stopTracking = async () => {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('Tracking stopped');
    }
};
