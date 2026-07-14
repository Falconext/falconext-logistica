'use client';

import { useParams, useRouter } from 'next/navigation';
import { HistoryMap } from '../../../../components/tracking/HistoryMap';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';

interface DeviceDetail {
    id: string;
    name: string;
    vehiculo?: {
        placa: string;
    };
}

export default function HistoryPage() {
    const params = useParams();
    const router = useRouter();
    const deviceId = params.id as string;
    const [device, setDevice] = useState<DeviceDetail | null>(null);

    useEffect(() => {
        if (deviceId) {
            api.get(`/gps/devices`).then(res => {
                const found = res.data.find((d: any) => d.id === deviceId);
                if (found) setDevice(found);
            });
        }
    }, [deviceId]);

    return (
        <div className="h-screen w-full flex flex-col bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            Historial de Ruta
                        </h1>
                        <p className="text-sm text-slate-500 truncate">
                            {device ? `${device.name} ${device.vehiculo ? `(${device.vehiculo.placa})` : ''}` : 'Cargando dispositivo...'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 p-2 sm:p-4 overflow-hidden">
                <HistoryMap
                    deviceId={deviceId}
                    apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                    deviceName={device?.name}
                    vehiclePlate={device?.vehiculo?.placa}
                />
            </div>
        </div>
    );
}
