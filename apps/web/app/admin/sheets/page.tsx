'use client';

import { useState, useEffect } from 'react';
import { Title, Text, Card, Metric, Button, TextInput } from '@tremor/react';
import { RefreshCw, Save, CheckCircle2, FileSpreadsheet, ExternalLink } from 'lucide-react';
import api from '../../../lib/api';
import { toast } from 'sonner';

export default function GoogleSheetsPage() {
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Config State
    const [spreadsheetId, setSpreadsheetId] = useState('');
    const [status, setStatus] = useState<any>(null);

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await api.get('/sheets/status');
            setStatus(res.data);
            if (res.data.spreadsheetId) setSpreadsheetId(res.data.spreadsheetId);
        } catch (error) {
            console.error('Error fetching sheets status:', error);
            // toast.error('Error al cargar estado');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        if (!spreadsheetId) return toast.error('Ingresa el ID de la hoja');
        try {
            await api.post('/sheets/config', { spreadsheetId });
            toast.success('Configuración guardada');
            fetchStatus();
        } catch (error) {
            toast.error('Error al guardar configuración');
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await api.post('/sheets/sync');
            const { count } = res.data;
            toast.success(`Sincronización exitosa: ${count} filas procesadas`);
            fetchStatus();
        } catch (error) {
            console.error(error);
            toast.error('Error al sincronizar. Verifica permisos.');
        } finally {
            setSyncing(false);
        }
    };

    if (loading) return <div className="p-8">Cargando integración...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <Title>Integración con Google Sheets</Title>
                    <Text>Conecta tu hoja de cálculo privada para sincronizar rutas automáticamente.</Text>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CONFIGURATION CARD */}
                <Card decoration="top" decorationColor="blue">
                    <div className="flex items-center space-x-2 mb-4">
                        <FileSpreadsheet className="text-blue-500" size={24} />
                        <h3 className="font-bold text-slate-700 dark:text-slate-200">Configuración</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-500">Spreadsheet ID</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <TextInput
                                    placeholder="docs.google.com/spreadsheets/d/ID_AQUI/edit"
                                    value={spreadsheetId}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        // Extract ID if URL is pasted
                                        const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                                        setSpreadsheetId(match ? match[1] : val);
                                    }}
                                />
                                <Button icon={Save} variant="secondary" onClick={handleSaveConfig}>
                                    Guardar
                                </Button>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Copia el ID desde la URL de tu Google Sheet.
                            </p>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                            <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">Instrucciones de Seguridad:</h4>
                            <ol className="list-decimal list-inside text-sm text-slate-500 space-y-1">
                                <li>Abre tu Google Sheet.</li>
                                <li>Haz clic en el botón <strong>Compartir</strong> (Share).</li>
                                <li>Agrega este email como <strong>Editor</strong>:</li>
                            </ol>
                            <div className="mt-2 p-2 bg-white dark:bg-black rounded border border-dashed border-slate-300 text-xs font-mono select-all">
                                {status?.serviceEmail || 'Cargando email de servicio...'}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* STATUS & ACTIONS CARD */}
                <Card decoration="top" decorationColor={status?.connected ? 'emerald' : 'amber'}>
                    <div className="flex items-center space-x-2 mb-4">
                        <RefreshCw className={status?.connected ? 'text-emerald-500' : 'text-amber-500'} size={24} />
                        <h3 className="font-bold text-slate-700 dark:text-slate-200">Estado y Acciones</h3>
                    </div>

                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                            <span className="text-sm text-slate-500">Estado Conexión</span>
                            {status?.connected ? (
                                <span className="flex items-center text-emerald-600 font-bold text-sm">
                                    <CheckCircle2 size={16} className="mr-1" /> Conectado
                                </span>
                            ) : (
                                <span className="text-amber-500 font-bold text-sm">No Configurado</span>
                            )}
                        </div>

                        <div>
                            <Text>Última Sincronización</Text>
                            <Metric>
                                {status?.lastSynced
                                    ? new Date(status.lastSynced).toLocaleString()
                                    : 'Nunca'}
                            </Metric>
                        </div>

                        <Button
                            size="xl"
                            className="w-full"
                            icon={RefreshCw}
                            loading={syncing}
                            disabled={!status?.connected}
                            onClick={handleSync}
                        >
                            {syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
