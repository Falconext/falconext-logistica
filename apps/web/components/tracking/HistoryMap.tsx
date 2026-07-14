'use client';

import React, { useEffect, useState, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker } from '@react-google-maps/api';
import { Play, Pause, FastForward, Calendar as CalendarIcon, Truck, Map as MapIcon, RotateCcw } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

const containerStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '16px'
};

const defaultCenter = {
    lat: -12.0464, // Lima Default
    lng: -77.0428
};

const polylineOptions = {
    strokeColor: '#3B82F6', // Blue 500
    strokeOpacity: 0.8,
    strokeWeight: 4,
};

interface HistoryMapProps {
    deviceId: string;
    apiKey: string;
    deviceName?: string;
    vehiclePlate?: string;
}

interface Position {
    lat: number;
    lng: number;
    timestamp: Date;
    speed: number;
    heading: number;
}

const libraries: ("maps" | "places" | "drawing" | "geometry")[] = ["maps", "places", "drawing", "geometry"];

export function HistoryMap({ deviceId, apiKey, deviceName, vehiclePlate }: HistoryMapProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
    });

    const [history, setHistory] = useState<Position[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    // Playback State
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 5x, 10x

    const mapRef = useRef<google.maps.Map | null>(null);
    const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch History when Date or Device changes
    useEffect(() => {
        if (deviceId) {
            fetchHistory();
        }
    }, [deviceId, selectedDate]);

    // Handle Playback Loop
    useEffect(() => {
        if (isPlaying && history.length > 0) {
            playbackTimerRef.current = setInterval(() => {
                setCurrentIndex(prev => {
                    if (prev >= history.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000 / playbackSpeed); // Adjust interval based on speed
        } else {
            if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
        }

        return () => {
            if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
        };
    }, [isPlaying, playbackSpeed, history.length]);

    // Auto-center map when history loads
    useEffect(() => {
        if (history.length > 0 && mapRef.current) {
            const bounds = new google.maps.LatLngBounds();
            history.forEach(pos => bounds.extend(pos));
            mapRef.current.fitBounds(bounds);
        }
    }, [history]);

    const fetchHistory = async () => {
        setLoading(true);
        setIsPlaying(false);
        setCurrentIndex(0);
        try {
            const start = new Date(selectedDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(selectedDate);
            end.setHours(23, 59, 59, 999);

            const res = await api.get(`/gps/history/${deviceId}`, {
                params: {
                    from: start.toISOString(),
                    to: end.toISOString()
                }
            });

            // API returns DESC (latest first). We need ASC (oldest first) for playback.
            const rawData = res.data;
            const formattedData: Position[] = rawData.map((d: any) => ({
                lat: parseFloat(d.latitude),
                lng: parseFloat(d.longitude),
                timestamp: new Date(d.timestamp),
                speed: d.speed || 0,
                heading: d.heading || 0
            })).reverse(); // Reverse to get chronological order

            setHistory(formattedData);
            if (formattedData.length === 0) {
                toast.info("No hay historial para la fecha seleccionada");
            }
        } catch (error) {
            console.error("Error fetching history:", error);
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        setCurrentIndex(val);
        // If user drags slider, maybe pause? Or keep playing. Let's keep state.
    };

    const toggleSpeed = () => {
        setPlaybackSpeed(prev => prev === 1 ? 5 : prev === 5 ? 10 : 1);
    };

    if (!isLoaded) return <div className="h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">Map Loading...</div>;

    const currentPos = history[currentIndex];

    return (
        <div className="relative h-full w-full flex flex-col gap-4">

            {/* Controls Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                        <CalendarIcon size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase">Fecha de Rastreo</p>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent font-medium text-slate-900 dark:text-white outline-none cursor-pointer"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="text-right mr-4">
                        <p className="text-xs text-slate-500">Puntos</p>
                        <p className="font-bold text-slate-900 dark:text-white">{history.length}</p>
                    </div>
                    {/* Device Info */}
                    <div className="text-right border-l pl-4 border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500">{vehiclePlate || 'Dispositivo'}</p>
                        <p className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{deviceName || deviceId}</p>
                    </div>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={defaultCenter} // Will be overridden by bounds
                    zoom={12}
                    onLoad={map => { mapRef.current = map; }}
                    options={{ disableDefaultUI: false }}
                >
                    {history.length > 0 && <Polyline path={history} options={polylineOptions} />}

                    {/* Current Playback Marker */}
                    {currentPos && (
                        <Marker
                            position={currentPos}
                            icon={{
                                url: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
                                scaledSize: new google.maps.Size(48, 48),
                                anchor: new google.maps.Point(24, 24),
                                rotation: currentPos.heading
                            }}
                            zIndex={100}
                        />
                    )}

                    {/* Start/End Markers */}
                    {history.length > 0 && (
                        <>
                            <Marker
                                position={history[0]}
                                label={{ text: "A", color: "white", className: "bg-green-600 p-1 rounded font-bold" }}
                                title="Inicio"
                            />
                            <Marker
                                position={history[history.length - 1]}
                                label={{ text: "B", color: "white", className: "bg-red-600 p-1 rounded font-bold" }}
                                title="Fin"
                            />
                        </>
                    )}
                </GoogleMap>

                {/* Overlaid Playback Controls */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-10">
                    <div className="flex items-center gap-4 mb-2">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-lg shadow-blue-500/30"
                        >
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                        </button>

                        <button
                            onClick={toggleSpeed}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                        >
                            <FastForward size={14} /> {playbackSpeed}x
                        </button>

                        <button
                            onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title="Reiniciar"
                        >
                            <RotateCcw size={16} />
                        </button>

                        <div className="flex-1 text-center">
                            <p className="text-xs text-slate-500 font-mono">
                                {currentPos ? currentPos.timestamp.toLocaleTimeString() : '--:--:--'}
                            </p>
                        </div>
                    </div>

                    <input
                        type="range"
                        min="0"
                        max={history.length - 1}
                        value={currentIndex}
                        onChange={handleSeek}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        disabled={history.length === 0}
                    />
                </div>
            </div>
        </div>
    );
}
