
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { Truck, Navigation, Activity } from 'lucide-react';
import api from '../../lib/api';

const containerStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '0'
};

const defaultCenter = {
    lat: -12.0464, // Lima Default
    lng: -77.0428
};

interface LiveMapRealProps {
    deviceId: string;
    apiKey: string;
    vehiclePlate?: string;
    deviceName?: string;
}

const libraries: ("maps" | "places" | "drawing" | "geometry")[] = ["maps", "places", "drawing", "geometry"];

export function LiveMapReal({ deviceId, apiKey, vehiclePlate, deviceName }: LiveMapRealProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
    });

    const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);
    const [heading, setHeading] = useState<number>(0);
    const [speed, setSpeed] = useState<number>(0);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (deviceId) {
            fetchPosition();
            pollingRef.current = setInterval(fetchPosition, 5000); // 5 seconds poll
        }

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [deviceId]);

    const fetchPosition = async () => {
        try {
            // Fetch history with limit 1 to get latest
            const res = await api.get(`/gps/history/${deviceId}?limit=1`);
            if (res.data && res.data.length > 0) {
                const latest = res.data[0];
                const newPos = {
                    lat: parseFloat(latest.latitude),
                    lng: parseFloat(latest.longitude)
                };
                setPosition(newPos);
                setHeading(latest.heading || 0);
                setSpeed(latest.speed || 0); // Keep raw m/s for precise conversion
                // Mobile app usually sends m/s or km/h. Expo location is m/s. 
                // Let's assume m/s and convert to km/k: speed * 3.6
                // But let's check what we implemented in ingestion.

                setLastUpdate(new Date(latest.timestamp));

                // Auto-center map on first load or if following
                if (mapRef.current && !position) {
                    mapRef.current.panTo(newPos);
                }
            }
        } catch (error) {
            console.error("Error fetching GPS position", error);
        }
    };

    if (!isLoaded) return <div className="h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">Map Loading...</div>;

    return (
        <div className="relative h-full w-full">
            <GoogleMap
                mapContainerStyle={containerStyle}
                center={position || defaultCenter}
                zoom={14}
                onLoad={map => { mapRef.current = map; }}
                options={{
                    disableDefaultUI: false,
                    zoomControl: true,
                }}
            >
                {position && (
                    <Marker
                        position={position}
                        icon={{
                            url: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png', // Temporary Truck Icon
                            scaledSize: new google.maps.Size(48, 48),
                            anchor: new google.maps.Point(24, 24),
                            rotation: heading
                        }}
                    />
                )}
            </GoogleMap>

            {/* Info Panel */}
            <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur p-4 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center pointer-events-auto">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Truck size={16} />
                            {vehiclePlate ? `Vehículo: ${vehiclePlate}` : (deviceName || `ID: ${deviceId.substring(0, 6)}...`)}
                        </h3>
                        <p className="text-xs text-slate-500">
                            Última act: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Esperando data...'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                            {(speed * 3.6).toFixed(1)} <span className="text-xs">km/h</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
