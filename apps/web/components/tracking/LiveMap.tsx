'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { toast } from 'sonner';
import { Truck, MapPin, Clock, Navigation, Zap, Route } from 'lucide-react';

const containerStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '0'
};

const center = {
    lat: 41.9028, // Rome default
    lng: 12.4964
};

interface LiveMapProps {
    originAddress: string;
    destinationAddress: string;
    apiKey: string;
    onArrival?: () => void;
    mapType?: 'roadmap' | 'satellite';
    /** Preview mode: show the static route only, skipping the animated-truck simulation (much lighter). */
    preview?: boolean;
}

const libraries: ("maps" | "places" | "drawing" | "geometry")[] = ["maps", "places", "drawing", "geometry"];

// Module-level cache so re-selecting a previously-viewed route is instant (no re-fetch)
const directionsCache = new Map<string, google.maps.DirectionsResult>();

export function LiveMap({ originAddress, destinationAddress, apiKey, onArrival, mapType = 'roadmap', preview = false }: LiveMapProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
    });

    const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
    const [currentPos, setCurrentPos] = useState<google.maps.LatLngLiteral | null>(null);
    const [progress, setProgress] = useState(0);
    const [eta, setEta] = useState<string>('');
    const [distance, setDistance] = useState<string>('');
    const [speed, setSpeed] = useState(0); // km/h simulation
    const [status, setStatus] = useState<'loading' | 'in_transit' | 'arriving' | 'arrived'>('loading');
    const [routeError, setRouteError] = useState<string | null>(null);

    const mapRef = useRef<google.maps.Map | null>(null);
    const requestRef = useRef<number | null>(null);
    const hasNotifiedArriving = useRef(false); // Prevent duplicate notifications

    useEffect(() => {
        if (!isLoaded || !originAddress || !destinationAddress) return;

        const cacheKey = `${originAddress}||${destinationAddress}`;

        setRouteError(null);

        // Instant hit from cache — no network, no toast
        const cached = directionsCache.get(cacheKey);
        if (cached) {
            setDirections(cached);
            setStatus('in_transit');
            if (cached.routes[0]?.legs[0]) {
                setEta(cached.routes[0].legs[0].duration?.text || '');
                setDistance(cached.routes[0].legs[0].distance?.text || '');
            }
            return;
        }

        let cancelled = false;
        const directionsService = new google.maps.DirectionsService();

        // Promise form + try/catch: when Google can't route the addresses it REJECTS with a
        // MapsRequestError (NOT_FOUND). Catching it here prevents the unhandled-error overlay.
        (async () => {
            try {
                const result = await directionsService.route({
                    origin: originAddress,
                    destination: destinationAddress,
                    travelMode: google.maps.TravelMode.DRIVING,
                });
                if (cancelled) return;
                directionsCache.set(cacheKey, result);
                setDirections(result);
                setStatus('in_transit');
                setRouteError(null);
                if (result.routes[0]?.legs[0]) {
                    setEta(result.routes[0].legs[0].duration?.text || '');
                    setDistance(result.routes[0].legs[0].distance?.text || '');
                }
            } catch (err: any) {
                if (cancelled) return;
                // Operation without valid map data — show a friendly notice, no crash.
                setDirections(null);
                setRouteError(err?.code || 'NOT_FOUND');
                console.warn('No se pudo trazar la ruta para esta operación (direcciones no válidas).');
            }
        })();

        return () => { cancelled = true; };
    }, [isLoaded, originAddress, destinationAddress]);

    // Simulation Loop with realistic speed
    useEffect(() => {
        if (preview) return; // Preview mode: no per-frame animation → no jank
        if (!directions || !directions.routes[0]?.overview_path) return;

        const path = directions.routes[0].overview_path;
        const totalSteps = 500; // Slower for better visualization
        let step = 0;
        let lastTime = performance.now();

        const animate = (currentTime: number) => {
            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;

            step++;
            const progressRatio = step / totalSteps;

            // Simulate varying speed (60-120 km/h)
            const simulatedSpeed = 60 + Math.sin(step * 0.05) * 30;
            setSpeed(Math.round(simulatedSpeed));

            const pathIndex = Math.floor(progressRatio * (path.length - 1));

            if (path[pathIndex]) {
                setCurrentPos({
                    lat: path[pathIndex].lat(),
                    lng: path[pathIndex].lng()
                });
                setProgress(Math.round(progressRatio * 100));

                // Update status based on progress - only notify ONCE
                if (progressRatio >= 0.9 && !hasNotifiedArriving.current) {
                    hasNotifiedArriving.current = true;
                    setStatus('arriving');
                    toast.warning('🚚 ¡Vehículo próximo a llegar!', {
                        description: 'Menos de 10% restante del recorrido',
                        duration: 4000
                    });
                }
            }

            if (step < totalSteps) {
                requestRef.current = requestAnimationFrame(animate);
            } else {
                setStatus('arrived');
                setProgress(100);
                toast.success('✅ ¡Entrega completada exitosamente!', {
                    description: `El vehículo ha llegado a: ${destinationAddress}`,
                    duration: 6000
                });
                onArrival?.();
            }
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [directions, destinationAddress, onArrival, preview]);

    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: mapType === 'satellite' ? [] : [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] }
        ]
    }), [mapType]);

    if (!isLoaded) {
        return (
            <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 animate-pulse flex flex-col items-center justify-center gap-4">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin"></div>
                    <Navigation className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500" size={24} />
                </div>
                <p className="text-slate-500 font-medium">Cargando mapa...</p>
            </div>
        );
    }

    const statusConfig = {
        loading: { color: 'bg-slate-500', text: 'Cargando...', pulse: true },
        in_transit: { color: 'bg-emerald-500', text: 'En Tránsito', pulse: true },
        arriving: { color: 'bg-amber-500', text: 'Llegando', pulse: true },
        arrived: { color: 'bg-blue-500', text: 'Entregado', pulse: false }
    };

    const currentStatus = statusConfig[status];

    return (
        <div className="relative h-full w-full">
            {routeError && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/95 backdrop-blur shadow-lg border border-amber-200 text-sm text-amber-700">
                    <MapPin size={15} className="text-amber-500" />
                    No se pudo trazar la ruta para estas direcciones.
                </div>
            )}
            <GoogleMap
                mapContainerStyle={containerStyle}
                center={center}
                zoom={10}
                onLoad={map => { mapRef.current = map; }}
                mapTypeId={mapType}
                options={mapOptions}
            >
                {directions && (
                    <DirectionsRenderer
                        directions={directions}
                        options={{
                            polylineOptions: {
                                strokeColor: '#3b82f6',
                                strokeWeight: 6,
                                strokeOpacity: 0.9
                            },
                            suppressMarkers: true
                        }}
                    />
                )}

                {/* Start Marker */}
                {directions?.routes[0]?.legs[0]?.start_location && (
                    <Marker
                        position={directions.routes[0].legs[0].start_location}
                        icon={{
                            url: 'data:image/svg+xml,' + encodeURIComponent(`
                                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#10b981" stroke="#fff" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">A</text>
                                </svg>
                            `),
                            scaledSize: new google.maps.Size(36, 36),
                            anchor: new google.maps.Point(18, 18)
                        }}
                    />
                )}

                {/* End Marker */}
                {directions?.routes[0]?.legs[0]?.end_location && (
                    <Marker
                        position={directions.routes[0].legs[0].end_location}
                        icon={{
                            url: 'data:image/svg+xml,' + encodeURIComponent(`
                                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#ef4444" stroke="#fff" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">B</text>
                                </svg>
                            `),
                            scaledSize: new google.maps.Size(36, 36),
                            anchor: new google.maps.Point(18, 18)
                        }}
                    />
                )}

                {/* Moving Vehicle */}
                {currentPos && (
                    <Marker
                        position={currentPos}
                        icon={{
                            url: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
                            scaledSize: new google.maps.Size(48, 48),
                            anchor: new google.maps.Point(24, 24)
                        }}
                    />
                )}
            </GoogleMap>

            {/* Premium Status Panel */}
            <div className="absolute top-4 left-4 right-4 z-10">
                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl">
                    <div className="flex items-center justify-between gap-6">
                        {/* Status */}
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className={`h-12 w-12 rounded-xl ${currentStatus.color} flex items-center justify-center shadow-lg`}>
                                    <Truck className="text-white" size={24} />
                                </div>
                                {currentStatus.pulse && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${currentStatus.color} opacity-75`}></span>
                                        <span className={`relative inline-flex rounded-full h-4 w-4 ${currentStatus.color}`}></span>
                                    </span>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Estado</p>
                                <p className="text-lg font-bold text-slate-900 dark:text-white">{currentStatus.text}</p>
                            </div>
                        </div>

                        {/* Speed */}
                        <div className="hidden md:block text-center px-4 border-l border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 text-amber-500">
                                <Zap size={16} />
                                <span className="text-xs font-bold uppercase tracking-wider">Velocidad</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{speed} <span className="text-sm text-slate-500">km/h</span></p>
                        </div>

                        {/* Distance */}
                        <div className="hidden md:block text-center px-4 border-l border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 text-blue-500">
                                <Route size={16} />
                                <span className="text-xs font-bold uppercase tracking-wider">Distancia</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{distance || '...'}</p>
                        </div>

                        {/* ETA */}
                        <div className="text-center px-4 border-l border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 text-emerald-500">
                                <Clock size={16} />
                                <span className="text-xs font-bold uppercase tracking-wider">ETA</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{eta || '...'}</p>
                        </div>

                        {/* Progress */}
                        <div className="flex-1 max-w-xs">
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-slate-500">Progreso</span>
                                <span className="text-blue-600 dark:text-blue-400">{progress}%</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out relative"
                                    style={{ width: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Route Info Banner */}
            <div className="absolute bottom-4 left-4 right-4 z-10">
                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-5 py-3 rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                        <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                        <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[200px]">{originAddress}</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-500">
                        <div className="h-px w-8 bg-blue-500"></div>
                        <Navigation size={16} />
                        <div className="h-px w-8 bg-blue-500"></div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[200px]">{destinationAddress}</span>
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
