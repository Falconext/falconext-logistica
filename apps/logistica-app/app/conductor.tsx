
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Dimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { startTracking, stopTracking } from '../services/LocationService';
import * as TaskManager from 'expo-task-manager';
import { MapPin, Power, LogOut, Navigation } from 'lucide-react-native';

const LOCATION_TASK_NAME = 'background-location-task';

export default function DashboardScreen() {
    const { deviceToken: token, logout } = useAuth();
    const [isTracking, setIsTracking] = useState(false);
    const [statusText, setStatusText] = useState('Inactivo');

    // Check status on mount
    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        setIsTracking(isRegistered);
        setStatusText(isRegistered ? 'Rastreando' : 'Inactivo');
    };

    const toggleTracking = async () => {
        if (isTracking) {
            await stopTracking();
        } else {
            const success = await startTracking();
            if (!success) {
                Alert.alert('Error', 'Permisos de ubicación denegados');
                return;
            }
        }
        await checkStatus();
    };

    const handleLogout = () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro? Se detendrá el rastreo.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Salir',
                    style: 'destructive',
                    onPress: async () => {
                        await stopTracking();
                        await logout();
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Hola, Conductor</Text>
                    <Text style={styles.token}>ID: {token?.substring(0, 8)}...</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                    <LogOut size={24} color="#64748B" />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <View style={[styles.statusCard, isTracking ? styles.statusActive : styles.statusInactive]}>
                    <View style={styles.statusHeader}>
                        <Navigation size={32} color={isTracking ? '#10B981' : '#64748B'} />
                        <Text style={[styles.statusTitle, { color: isTracking ? '#10B981' : '#64748B' }]}>
                            {statusText}
                        </Text>
                    </View>
                    <Text style={styles.statusDesc}>
                        {isTracking
                            ? "Tu ubicación se está enviando al servidor."
                            : "El servicio de rastreo está detenido."}
                    </Text>
                </View>

                <TouchableOpacity
                    style={[styles.mainButton, isTracking ? styles.stopButton : styles.startButton]}
                    onPress={toggleTracking}
                    activeOpacity={0.8}
                >
                    <Power size={48} color="white" />
                    <Text style={styles.mainButtonText}>
                        {isTracking ? "DETENER RASTREO" : "INICIAR RASTREO"}
                    </Text>
                </TouchableOpacity>

                <View style={styles.infoContainer}>
                    <View style={styles.infoItem}>
                        <MapPin size={24} color="#4F46E5" />
                        <View style={styles.infoText}>
                            <Text style={styles.infoLabel}>Modo GPS</Text>
                            <Text style={styles.infoValue}>Segundo Plano</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        paddingTop: 60,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        marginBottom: 32,
    },
    greeting: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0F172A',
    },
    token: {
        fontSize: 14,
        color: '#64748B',
        fontFamily: 'SpaceMono',
    },
    logoutBtn: {
        padding: 8,
        backgroundColor: 'white',
        borderRadius: 12,
        shadowColor: 'black',
        shadowOpacity: 0.05,
        shadowRadius: 5,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    statusCard: {
        width: '100%',
        padding: 24,
        borderRadius: 24,
        marginBottom: 40,
        borderWidth: 1,
    },
    statusActive: {
        backgroundColor: '#ECFDF5',
        borderColor: '#10B981',
    },
    statusInactive: {
        backgroundColor: '#F1F5F9',
        borderColor: '#E2E8F0',
    },
    statusHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    statusTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    statusDesc: {
        color: '#475569',
        fontSize: 16,
    },
    mainButton: {
        width: 240,
        height: 240,
        borderRadius: 120,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
        gap: 16,
        marginBottom: 40,
    },
    startButton: {
        backgroundColor: '#4F46E5',
    },
    stopButton: {
        backgroundColor: '#EF4444',
    },
    mainButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1,
    },
    infoContainer: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    infoText: {

    },
    infoLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    infoValue: {
        fontSize: 16,
        color: '#0F172A',
        fontWeight: 'bold',
    },
});
