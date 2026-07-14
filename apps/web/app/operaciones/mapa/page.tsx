'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveMapReal } from '../../../components/tracking/LiveMapReal';
import api from '../../../lib/api';
import { Search } from 'lucide-react';

interface Device {
    id: string;
    name: string;
    token: string;
    vehiculo?: {
        placa: string;
    };
}

export default function MapaPage() {
    const searchParams = useSearchParams();
    const initialDeviceId = searchParams.get('device');

    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(initialDeviceId);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDevices() {
            try {
                const res = await api.get('/gps/devices');
                setDevices(res.data);
                if (!selectedDeviceId && res.data.length > 0) {
                    setSelectedDeviceId(res.data[0].id);
                }
            } catch (error) {
                console.error('Error fetching devices:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchDevices();
    }, []);

    const selectedDevice = devices.find(d => d.id === selectedDeviceId);

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            {/* Header / Selector */}
            <div className="bg-white dark:bg-[#0f172a] p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
                <h1 className="text-xl font-bold text-slate-800 dark:text-white">Mapa en Vivo (GPS Real)</h1>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Search className="text-slate-400" size={18} />
                    <select
                        value={selectedDeviceId || ''}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="flex-1 md:w-64 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="" disabled>Seleccionar Vehículo</option>
                        {devices.map(dev => (
                            <option key={dev.id} value={dev.id}>
                                {dev.vehiculo?.placa ? `${dev.vehiculo.placa} - ${dev.name}` : dev.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-inner">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 animate-pulse">
                        Cargando dispositivos...
                    </div>
                ) : selectedDeviceId ? (
                    <LiveMapReal
                        deviceId={selectedDeviceId}
                        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDJ-Y0SukxfjbACOUjPY7CoV6qnaQkKSZg"}
                        vehiclePlate={selectedDevice?.vehiculo?.placa}
                        deviceName={selectedDevice?.name}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 text-slate-400">
                        <Search size={48} className="opacity-20" />
                        <p>Selecciona un dispositivo para ver su ubicación en tiempo real.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
