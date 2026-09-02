'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
// framer-motion v10 fricciona con los tipos de React 19; alias sin tipos para el motion.div.
const MotionDiv = motion.div as any;
import { Receipt, Users, Package, Calendar, TrendingUp, Truck, Trophy, Loader2 } from 'lucide-react';
import DatePicker from '../../components/DatePicker';
import api from '../../lib/api';
import { toast } from 'sonner';
import { useCurrency } from '../../lib/useCurrency';
import { useT } from '../../lib/i18n';
import CostosReport from './CostosReport';
// Charts "Mono" (estilo Amicro/Mono Charts) sobre recharts: monocromo, redondeado,
// con gradientes y value labels. Theme-aware.
import { MonoAreaChart } from '../../components/mono/MonoAreaChart';
import { MonoBarChart } from '../../components/mono/MonoBarChart';
import { KpiCard, ChartCard } from '../../components/mono/MonoCards';

const REALIZADAS = 'Entregas Realizadas';
const FALLIDAS = 'Entregas Fallidas';

// Fecha local 'YYYY-MM-DD' (sin desfase de zona horaria).
const pad2 = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function ReportesPage() {
    const t = useT();
    const { format } = useCurrency();
    const _now = new Date();
    // Por defecto: mes actual (del 1 al último día).
    const [from, setFrom] = useState<string>(toISODate(new Date(_now.getFullYear(), _now.getMonth(), 1)));
    const [to, setTo] = useState<string>(toISODate(new Date(_now.getFullYear(), _now.getMonth() + 1, 0)));

    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState({ total_routes: 0, completed: 0, failed: 0, income: 0, active_clients: 0 });
    const [charts, setCharts] = useState<{ evolution: any[]; workers: any[]; vehicles: any[] }>({ evolution: [], workers: [], vehicles: [] });

    useEffect(() => { fetchReports(); /* eslint-disable-next-line */ }, [from, to]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const params = {
                from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
                to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
            };
            const response = await api.get('/dashboard/reports', { params });
            setKpis(response.data.kpis);
            setCharts(response.data.charts);
        } catch (error) {
            console.error('Error fetching reports:', error);
            toast.error(t('reportes.toastErrorCargar'));
        } finally {
            setLoading(false);
        }
    };

    // ---- Métricas derivadas para los headers de cada chart ----
    const stats = useMemo(() => {
        const ev = charts.evolution || [];
        const realizadas = ev.reduce((a, r) => a + (Number(r[REALIZADAS]) || 0), 0);
        const fallidas = ev.reduce((a, r) => a + (Number(r[FALLIDAS]) || 0), 0);
        const tasa = realizadas + fallidas > 0 ? Math.round((realizadas / (realizadas + fallidas)) * 100) : 0;
        const topWorker = (charts.workers || [])[0] || null;
        const viajes = (charts.vehicles || []).reduce((a, r) => a + (Number(r.Viajes) || 0), 0);
        const flotaActiva = (charts.vehicles || []).filter((r) => (Number(r.Viajes) || 0) > 0).length;
        return { realizadas, fallidas, tasa, topWorker, viajes, flotaActiva };
    }, [charts]);

    const fmtDay = (v: any) => {
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };

    const enter = (i: number) => ({
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as any },
    });

    return (
        <div className="max-w-[1400px] mx-auto pb-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-7">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t('reportes.titulo')}</h1>
                    <p className="text-sm text-slate-400 mt-1">{t('reportes.evolucionSubtitulo')}</p>
                </div>
                <div className="flex items-end gap-2">
                    {loading && <Loader2 size={16} className="animate-spin text-slate-400 mb-3" />}
                    <div className="w-40"><DatePicker label="Desde" value={from} onChange={setFrom} clearable={false} max={to} /></div>
                    <div className="w-40"><DatePicker label="Hasta" value={to} onChange={setTo} clearable={false} min={from} /></div>
                </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {[
                    { icon: Receipt, tone: 'blue', label: t('reportes.kpiRutasTotales'), value: String(kpis.total_routes), sub: `${stats.tasa}% ${t('reportes.kpiEntregasExitosas').toLowerCase()}` },
                    { icon: Users, tone: 'emerald', label: t('reportes.kpiClientesActivos'), value: String(kpis.active_clients), sub: t('reportes.rankingSubtitulo') },
                    { icon: Package, tone: 'violet', label: t('reportes.kpiEntregasExitosas'), value: String(kpis.completed), sub: `${stats.fallidas} ${FALLIDAS.toLowerCase()}` },
                    { icon: Calendar, tone: 'amber', label: t('reportes.kpiIngresosEstimados'), value: format(kpis.income), sub: t('reportes.flotaSubtitulo') },
                ].map((k, i) => (
                    <MotionDiv key={i} {...enter(i)}>
                        <KpiCard {...k} />
                    </MotionDiv>
                ))}
            </div>

            {/* Charts principales */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <MotionDiv className="lg:col-span-3" {...enter(4)}>
                    <ChartCard
                        title={t('reportes.evolucionTitulo')}
                        subtitle={t('reportes.evolucionSubtitulo')}
                        highlight={`${stats.tasa}%`}
                        badge={t('reportes.kpiEntregasExitosas')}
                        badgeTone="emerald"
                        icon={TrendingUp}
                    >
                        <MonoAreaChart
                            data={charts.evolution}
                            index="date"
                            height={252}
                            xTickFormatter={fmtDay}
                            categories={[
                                { key: REALIZADAS, label: t('reportes.kpiEntregasExitosas'), accent: 'emerald', render: 'area' },
                                { key: FALLIDAS, label: FALLIDAS, accent: 'rose', render: 'line' },
                            ]}
                            valueFormatter={(n) => t('reportes.unidadesFormato', { n })}
                        />
                    </ChartCard>
                </MotionDiv>

                <MotionDiv className="lg:col-span-2" {...enter(5)}>
                    <ChartCard
                        title={t('reportes.rankingTitulo')}
                        subtitle={t('reportes.rankingSubtitulo')}
                        highlight={stats.topWorker ? String(stats.topWorker.Entregas ?? '') : '—'}
                        badge={stats.topWorker?.name || ''}
                        badgeTone="violet"
                        icon={Trophy}
                    >
                        <MonoBarChart
                            data={charts.workers}
                            index="name"
                            height={252}
                            horizontal
                            highlightTop
                            accent="violet"
                            categories={[{ key: 'Entregas' }]}
                            valueFormatter={(n) => `${n}`}
                        />
                    </ChartCard>
                </MotionDiv>
            </div>

            {/* Flota */}
            <MotionDiv className="mt-5" {...enter(6)}>
                <ChartCard
                    title={t('reportes.flotaTitulo')}
                    subtitle={t('reportes.flotaSubtitulo')}
                    highlight={String(stats.viajes)}
                    badge={`${stats.flotaActiva} ${t('reportes.kpiRutasTotales').toLowerCase()}`}
                    badgeTone="emerald"
                    icon={Truck}
                >
                    <MonoBarChart
                        data={charts.vehicles}
                        index="name"
                        height={300}
                        accent="emerald"
                        categories={[{ key: 'Viajes' }]}
                        valueFormatter={(n) => t('reportes.viajesFormato', { n })}
                    />
                </ChartCard>
            </MotionDiv>

            {/* Sección de Costos */}
            <div className="mt-8 pt-6 border-t border-slate-200/70 dark:border-slate-800">
                <CostosReport />
            </div>
        </div>
    );
}
