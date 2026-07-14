'use client';

import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { AlertTriangle, Clock, FileWarning, Shield, User, Calendar, ChevronRight, Filter, Bell } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';

interface DocumentAlert {
    trabajadorId: string;
    trabajadorNombre: string;
    cargo: string;
    documentType: string;
    documentLabel: string;
    expirationDate: string;
    daysRemaining: number;
    severity: 'critical' | 'warning' | 'info';
    entityType?: 'TRABAJADOR' | 'VEHICULO' | 'DOCUMENTO';
    entityId?: string;
    entityName?: string;
}

interface AlertSummary {
    critical: number;
    warning: number;
    info: number;
    total: number;
}

export default function AlertasPage() {
    const [alerts, setAlerts] = useState<DocumentAlert[]>([]);
    const [summary, setSummary] = useState<AlertSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

    useEffect(() => {
        async function fetchData() {
            try {
                const [alertsRes, summaryRes] = await Promise.all([
                    api.get('/alerts/documents?days=90'),
                    api.get('/alerts/summary')
                ]);
                setAlerts(alertsRes.data);
                setSummary(summaryRes.data);
            } catch (error) {
                console.error('Error fetching alerts:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const filteredAlerts = filter === 'all'
        ? alerts
        : alerts.filter(a => a.severity === filter);

    const severityConfig = {
        critical: {
            bg: 'bg-red-50 dark:bg-red-900/20',
            border: 'border-red-200 dark:border-red-800',
            text: 'text-red-700 dark:text-red-400',
            icon: 'text-red-500',
            badge: 'bg-red-500',
            label: 'Crítico'
        },
        warning: {
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            border: 'border-amber-200 dark:border-amber-800',
            text: 'text-amber-700 dark:text-amber-400',
            icon: 'text-amber-500',
            badge: 'bg-amber-500',
            label: 'Próximo'
        },
        info: {
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            border: 'border-blue-200 dark:border-blue-800',
            text: 'text-blue-700 dark:text-blue-400',
            icon: 'text-blue-500',
            badge: 'bg-blue-500',
            label: 'Planeado'
        }
    };

    const getDocumentIcon = (type: string) => {
        switch (type) {
            case 'passport': return '🛂';
            case 'license': return '🪪';
            case 'contract': return '📄';
            case 'residence': return '🏠';
            case 'id': return '🆔';
            case 'fiscal': return '💰';
            case 'translation': return '📝';
            case 'insurance': return '🛡️';
            case 'seguro': return '🛡️';
            case 'revision_tecnica': return '🔧';
            default: return '📋';
        }
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin"></div>
                    <span className="text-slate-500">Cargando alertas...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <Bell className="text-amber-500" />
                        Centro de Alertas
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Documentos próximos a vencer en los próximos 90 días
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div
                        onClick={() => setFilter('all')}
                        className={clsx(
                            "p-5 rounded-2xl border cursor-pointer transition-all",
                            filter === 'all'
                                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 ring-2 ring-slate-400"
                                : "bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Total</p>
                                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{summary.total}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <FileWarning className="text-slate-500" size={24} />
                            </div>
                        </div>
                    </div>

                    <div
                        onClick={() => setFilter('critical')}
                        className={clsx(
                            "p-5 rounded-2xl border cursor-pointer transition-all",
                            filter === 'critical'
                                ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 ring-2 ring-red-400"
                                : "bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-red-300"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-red-500 tracking-wider">Críticos</p>
                                <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{summary.critical}</p>
                                <p className="text-xs text-slate-500 mt-1">Menos de 15 días</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <AlertTriangle className="text-red-500" size={24} />
                            </div>
                        </div>
                    </div>

                    <div
                        onClick={() => setFilter('warning')}
                        className={clsx(
                            "p-5 rounded-2xl border cursor-pointer transition-all",
                            filter === 'warning'
                                ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 ring-2 ring-amber-400"
                                : "bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-amber-300"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-amber-500 tracking-wider">Próximos</p>
                                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{summary.warning}</p>
                                <p className="text-xs text-slate-500 mt-1">15-30 días</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <Clock className="text-amber-500" size={24} />
                            </div>
                        </div>
                    </div>

                    <div
                        onClick={() => setFilter('info')}
                        className={clsx(
                            "p-5 rounded-2xl border cursor-pointer transition-all",
                            filter === 'info'
                                ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 ring-2 ring-blue-400"
                                : "bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-blue-300"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-blue-500 tracking-wider">Planeados</p>
                                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{summary.info}</p>
                                <p className="text-xs text-slate-500 mt-1">30-90 días</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <Calendar className="text-blue-500" size={24} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Alerts List */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="font-bold text-slate-900 dark:text-white">
                        Documentos por Vencer ({filteredAlerts.length})
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Filter size={16} />
                        <span>Filtrado por: <strong className="text-slate-700 dark:text-slate-300">{filter === 'all' ? 'Todos' : severityConfig[filter].label}</strong></span>
                    </div>
                </div>

                {filteredAlerts.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/20 mb-4">
                            <Shield className="text-emerald-500" size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">¡Todo en orden!</h3>
                        <p className="text-slate-500 mt-1">No hay documentos próximos a vencer en esta categoría.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredAlerts.map((alert, idx) => {
                            const config = severityConfig[alert.severity];
                            // Route to the right detail page depending on entity.
                            const href = alert.entityType === 'VEHICULO'
                                ? `/vehiculos/${alert.trabajadorId}`
                                : alert.entityType === 'DOCUMENTO' && alert.cargo === 'VEHICULO'
                                    ? `/vehiculos/${alert.trabajadorId}`
                                    : `/trabajadores/${alert.trabajadorId}`;
                            return (
                                <div
                                    key={`${alert.entityType || 'T'}-${alert.trabajadorId}-${alert.documentType}-${idx}`}
                                    className={clsx(
                                        "p-4 flex items-center justify-between gap-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                                        config.bg
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={clsx("h-10 w-10 rounded-xl flex items-center justify-center text-xl", config.bg, config.border, "border")}>
                                            {getDocumentIcon(alert.documentType)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 dark:text-white">{alert.trabajadorNombre}</span>
                                                <span className={clsx("px-2 py-0.5 rounded-full text-xs font-bold", config.badge, "text-white")}>
                                                    {alert.daysRemaining} días
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                                                {alert.entityType && alert.entityType !== 'TRABAJADOR' && (
                                                    <>
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                                            {alert.entityType === 'VEHICULO' ? 'Vehículo' : 'Documento'}
                                                        </span>
                                                        <span>•</span>
                                                    </>
                                                )}
                                                <span>{alert.documentLabel}</span>
                                                <span>•</span>
                                                <span>{alert.cargo}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden md:block">
                                            <p className="text-xs text-slate-500 uppercase font-bold">Vence</p>
                                            <p className={clsx("font-mono font-bold", config.text)}>
                                                {new Date(alert.expirationDate).toLocaleDateString('es-ES', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                        <Link
                                            href={href}
                                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        >
                                            <ChevronRight size={20} />
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
