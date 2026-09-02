'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Fuel, Receipt, Wrench, Coins, Download, TrendingUp, TrendingDown, LineChart, PieChart, Users, Truck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useCurrency } from '../../lib/useCurrency';
import DatePicker from '../../components/DatePicker';
import { KpiCard, ChartCard } from '../../components/mono/MonoCards';
import { MonoAreaChart } from '../../components/mono/MonoAreaChart';
import { MonoBarChart } from '../../components/mono/MonoBarChart';
import { MonoDonutChart } from '../../components/mono/MonoDonutChart';

const MotionDiv = motion.div as any;

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function defaultRange() {
    const now = new Date();
    return { from: toISO(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: toISO(now) };
}

interface CostsReport {
    summary: { fuel: number; tolls: number; maintenance: number; total: number; income: number; margin: number };
    trend: { mes: string; combustible: number; peajes: number; mantenimiento: number; total: number }[];
    byArea: { area: string; total: number }[];
    topVehiculos: { targa: string; total: number }[];
    topChoferes: { codigo: string; nombre: string; total: number }[];
}
const EMPTY: CostsReport = { summary: { fuel: 0, tolls: 0, maintenance: 0, total: 0, income: 0, margin: 0 }, trend: [], byArea: [], topVehiculos: [], topChoferes: [] };

export default function CostosReport() {
    const { format } = useCurrency();
    const def = defaultRange();
    const [from, setFrom] = useState<string>(def.from);
    const [to, setTo] = useState<string>(def.to);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<CostsReport>(EMPTY);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/dashboard/costs-report', { params: { from, to } });
            setData({ ...EMPTY, ...res.data });
        } catch (e) {
            console.error('Error fetching costs report:', e);
            toast.error('Error al cargar el reporte de costos');
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    // Resolución de nombres en el cliente: el reporte de costos trae códigos
    // (trabajador_id UUID / código, targa interna tipo "F097"); traemos las listas
    // de trabajadores y vehículos una vez y mapeamos a nombre de chofer / placa real.
    const [choferName, setChoferName] = useState<Record<string, string>>({});
    const [vehPlaca, setVehPlaca] = useState<Record<string, string>>({});
    useEffect(() => {
        let alive = true;
        Promise.all([
            api.get('/trabajadores').then((r) => r.data).catch(() => []),
            api.get('/vehiculos').then((r) => r.data).catch(() => []),
        ]).then(([trab, veh]) => {
            if (!alive) return;
            const cm: Record<string, string> = {};
            (Array.isArray(trab) ? trab : []).forEach((t: any) => {
                if (!t?.nombre_completo) return;
                if (t.id) cm[t.id] = t.nombre_completo;
                if (t.id_trabajador) cm[t.id_trabajador] = t.nombre_completo;
            });
            const vm: Record<string, string> = {};
            (Array.isArray(veh) ? veh : []).forEach((v: any) => {
                if (!v?.placa) return;
                vm[v.placa] = v.placa;
                if (v.id_interno_furgon) vm[v.id_interno_furgon] = v.placa;
                if (v.id) vm[v.id] = v.placa;
            });
            setChoferName(cm);
            setVehPlaca(vm);
        });
        return () => { alive = false; };
    }, []);

    const exportToExcel = async () => {
        if (data.trend.length === 0 && data.topChoferes.length === 0) return toast.error('No hay datos de costos para exportar');
        try {
            const xlsx = await import('xlsx');
            const wb = xlsx.utils.book_new();
            const wsTrend = xlsx.utils.json_to_sheet(data.trend.map((t) => ({ Mes: t.mes, Combustible: t.combustible, 'Peajes/Multas': t.peajes, Mantenimiento: t.mantenimiento, Total: t.total })));
            xlsx.utils.book_append_sheet(wb, wsTrend, 'Tendencia');
            const wsChoferes = xlsx.utils.json_to_sheet(data.topChoferes.map((c) => ({ Código: c.codigo, Chofer: c.nombre, Total: c.total })));
            xlsx.utils.book_append_sheet(wb, wsChoferes, 'Top Choferes');
            xlsx.writeFile(wb, 'Reporte_Costos.xlsx');
            toast.success('Excel generado');
        } catch (e) {
            console.error(e);
            toast.error('Error al generar el Excel');
        }
    };

    const s = data.summary;
    const hasIncome = s.income > 0;
    const pct = (v: number) => (s.total > 0 ? `${Math.round((v / s.total) * 100)}% del total` : 'sin costos');

    const areaList = useMemo(() => data.byArea.map((a) => ({ name: a.area, value: a.total })), [data.byArea]);
    const choferesList = useMemo(
        () => data.topChoferes.map((c) => ({ name: (choferName[c.codigo] || (c.nombre && c.nombre !== c.codigo ? c.nombre : '') || c.codigo).toUpperCase(), value: c.total })),
        [data.topChoferes, choferName],
    );
    const vehiculosList = useMemo(
        () => data.topVehiculos.map((v) => ({ name: (vehPlaca[v.targa] || v.targa).toUpperCase(), value: v.total })),
        [data.topVehiculos, vehPlaca],
    );

    const tiles = [
        { icon: Coins, tone: 'amber', label: 'Costo Total', value: format(s.total), sub: hasIncome ? `margen ${format(s.margin)}` : 'en el período' },
        { icon: Fuel, tone: 'blue', label: 'Combustible', value: format(s.fuel), sub: pct(s.fuel) },
        { icon: Receipt, tone: 'rose', label: 'Peajes / Multas', value: format(s.tolls), sub: pct(s.tolls) },
        { icon: Wrench, tone: 'emerald', label: 'Mantenimiento', value: format(s.maintenance), sub: pct(s.maintenance) },
    ];

    const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] } });

    return (
        <div className="space-y-5">
            {/* Encabezado + filtro + exportar */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Reporte de Costos</h2>
                    <p className="text-sm text-slate-400 mt-1">Combustible, peajes/multas y mantenimiento en el período seleccionado.</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-40"><DatePicker label="Desde" value={from} onChange={setFrom} clearable={false} max={to} /></div>
                    <div className="w-40"><DatePicker label="Hasta" value={to} onChange={setTo} clearable={false} min={from} /></div>
                    <button type="button" onClick={exportToExcel}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFC933] text-[#1a1a1c] text-sm font-semibold hover:brightness-95 transition shadow-sm">
                        <Download size={16} /> Exportar
                    </button>
                </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {tiles.map((t, i) => (
                    <MotionDiv key={t.label} {...enter(i)}>
                        <KpiCard icon={t.icon} tone={t.tone} label={t.label} value={loading ? '—' : t.value} sub={t.sub} />
                    </MotionDiv>
                ))}
            </div>

            {/* Nota de margen */}
            {hasIncome ? (
                <div className="flex items-center gap-2 text-sm">
                    {s.margin >= 0 ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-rose-500" />}
                    <span className="text-slate-500 dark:text-slate-400">
                        Ingresos {format(s.income)} · Margen <span className={s.margin >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{format(s.margin)}</span>
                    </span>
                </div>
            ) : (
                <p className="text-xs text-slate-400">Sin ingresos registrados en el período · se muestran únicamente los costos.</p>
            )}

            {/* Tendencia (stacked) + Distribución por área (donut) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <MotionDiv className="lg:col-span-3" {...enter(4)}>
                    <ChartCard title="Tendencia de costos por mes" subtitle="Composición mensual: combustible, peajes/multas y mantenimiento"
                        highlight={format(s.total)} badge={hasIncome ? `margen ${format(s.margin)}` : undefined} badgeTone={s.margin >= 0 ? 'emerald' : 'rose'} icon={LineChart}>
                        <MonoAreaChart
                            data={data.trend}
                            index="mes"
                            height={260}
                            stacked
                            categories={[
                                { key: 'combustible', label: 'Combustible', accent: 'blue', render: 'area' },
                                { key: 'peajes', label: 'Peajes / Multas', accent: 'amber', render: 'area' },
                                { key: 'mantenimiento', label: 'Mantenimiento', accent: 'emerald', render: 'area' },
                            ]}
                            valueFormatter={(n) => format(n)}
                        />
                    </ChartCard>
                </MotionDiv>

                <MotionDiv className="lg:col-span-2" {...enter(5)}>
                    <ChartCard title="Costos por área" subtitle="Distribución del gasto" icon={PieChart}>
                        <MonoDonutChart data={areaList} valueFormatter={(n) => format(n)} centerLabel="Total" />
                    </ChartCard>
                </MotionDiv>
            </div>

            {/* Top choferes + Top vehículos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <MotionDiv {...enter(6)}>
                    <ChartCard title="Top choferes por multas / costos" subtitle="Mayor costo acumulado en el período"
                        highlight={choferesList[0] ? format(choferesList[0].value) : '—'} badge={choferesList[0]?.name} badgeTone="rose" icon={Users}>
                        {choferesList.length === 0
                            ? <p className="text-sm text-slate-400 py-8 text-center">Sin datos.</p>
                            : <MonoBarChart data={choferesList.slice(0, 8)} index="name" height={260} horizontal accent="rose" categories={[{ key: 'value', label: 'Costo' }]} valueFormatter={(n) => format(n)} />}
                    </ChartCard>
                </MotionDiv>

                <MotionDiv {...enter(7)}>
                    <ChartCard title="Top vehículos por costos" subtitle="Unidades con mayor gasto"
                        highlight={vehiculosList[0] ? format(vehiculosList[0].value) : '—'} badge={vehiculosList[0]?.name} badgeTone="blue" icon={Truck}>
                        {vehiculosList.length === 0
                            ? <p className="text-sm text-slate-400 py-8 text-center">Sin datos.</p>
                            : <MonoBarChart data={vehiculosList.slice(0, 8)} index="name" height={260} horizontal accent="blue" categories={[{ key: 'value', label: 'Costo' }]} valueFormatter={(n) => format(n)} />}
                    </ChartCard>
                </MotionDiv>
            </div>
        </div>
    );
}
