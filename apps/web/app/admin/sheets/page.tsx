'use client';

import { useState, useEffect } from 'react';
import { Title, Text, Card, Metric, Button, TextInput } from '@tremor/react';
import { RefreshCw, Save, CheckCircle2, FileSpreadsheet, ExternalLink } from 'lucide-react';
import api from '../../../lib/api';
import { toast } from 'sonner';
import { useT } from '../../../lib/i18n';

export default function GoogleSheetsPage() {
    const t = useT();
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
        if (!spreadsheetId) return toast.error(t('admin.sheets.toasts.ingresaId'));
        try {
            await api.post('/sheets/config', { spreadsheetId });
            toast.success(t('admin.sheets.toasts.configGuardada'));
            fetchStatus();
        } catch (error) {
            toast.error(t('admin.sheets.toasts.errorGuardarConfig'));
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await api.post('/sheets/sync');
            const { count } = res.data;
            toast.success(t('admin.sheets.toasts.syncExitosa', { count }));
            fetchStatus();
        } catch (error) {
            console.error(error);
            toast.error(t('admin.sheets.toasts.errorSync'));
        } finally {
            setSyncing(false);
        }
    };

    if (loading) return <div className="p-8">{t('admin.sheets.cargando')}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <Title>{t('admin.sheets.titulo')}</Title>
                    <Text>{t('admin.sheets.subtitulo')}</Text>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CONFIGURATION CARD */}
                <Card decoration="top" decorationColor="blue">
                    <div className="flex items-center space-x-2 mb-4">
                        <FileSpreadsheet className="text-blue-500" size={24} />
                        <h3 className="font-bold text-slate-700 dark:text-slate-200">{t('admin.sheets.configuracion.titulo')}</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-500">{t('admin.sheets.configuracion.spreadsheetIdLabel')}</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <TextInput
                                    placeholder={t('admin.sheets.configuracion.spreadsheetIdPlaceholder')}
                                    value={spreadsheetId}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        // Extract ID if URL is pasted
                                        const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                                        setSpreadsheetId(match ? match[1] : val);
                                    }}
                                />
                                <Button icon={Save} variant="secondary" onClick={handleSaveConfig}>
                                    {t('admin.sheets.configuracion.guardar')}
                                </Button>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                {t('admin.sheets.configuracion.ayuda')}
                            </p>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                            <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">{t('admin.sheets.configuracion.seguridadTitulo')}</h4>
                            <ol className="list-decimal list-inside text-sm text-slate-500 space-y-1">
                                <li>{t('admin.sheets.configuracion.paso1')}</li>
                                <li>{t('admin.sheets.configuracion.paso2Pre')} <strong>{t('admin.sheets.configuracion.paso2Compartir')}</strong> (Share).</li>
                                <li>{t('admin.sheets.configuracion.paso3Pre')} <strong>{t('admin.sheets.configuracion.paso3Editor')}</strong>:</li>
                            </ol>
                            <div className="mt-2 p-2 bg-white dark:bg-black rounded border border-dashed border-slate-300 text-xs font-mono select-all">
                                {status?.serviceEmail || t('admin.sheets.configuracion.cargandoEmail')}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* STATUS & ACTIONS CARD */}
                <Card decoration="top" decorationColor={status?.connected ? 'emerald' : 'amber'}>
                    <div className="flex items-center space-x-2 mb-4">
                        <RefreshCw className={status?.connected ? 'text-emerald-500' : 'text-amber-500'} size={24} />
                        <h3 className="font-bold text-slate-700 dark:text-slate-200">{t('admin.sheets.estado.titulo')}</h3>
                    </div>

                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                            <span className="text-sm text-slate-500">{t('admin.sheets.estado.estadoConexion')}</span>
                            {status?.connected ? (
                                <span className="flex items-center text-emerald-600 font-bold text-sm">
                                    <CheckCircle2 size={16} className="mr-1" /> {t('admin.sheets.estado.conectado')}
                                </span>
                            ) : (
                                <span className="text-amber-500 font-bold text-sm">{t('admin.sheets.estado.noConfigurado')}</span>
                            )}
                        </div>

                        <div>
                            <Text>{t('admin.sheets.estado.ultimaSincronizacion')}</Text>
                            <Metric>
                                {status?.lastSynced
                                    ? new Date(status.lastSynced).toLocaleString()
                                    : t('admin.sheets.estado.nunca')}
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
                            {syncing ? t('admin.sheets.estado.sincronizando') : t('admin.sheets.estado.sincronizarAhora')}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
