'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Title,
    Text,
    Subtitle,
    AreaChart,
    DonutChart,
    BarList,
    Grid,
} from '@tremor/react';
import { Fuel, Receipt, Wrench, Coins, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useCurrency } from '../../lib/useCurrency';
import DatePicker from '../../components/DatePicker';

const ACCENT = '#FFC933';

// ---- Formato de fecha local 'YYYY-MM-DD' (sin desfase por zona horaria) ----
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Por defecto: últimos 6 meses (desde el 1º del mes hace 5 meses hasta hoy).
function defaultRange() {
    const now = new Date();
    const to = toISO(now);
    const from = toISO(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    return { from, to };
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

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const exportToExcel = async () => {
        if (data.trend.length === 0 && data.topChoferes.length === 0) {
            return toast.error('No hay datos de costos para exportar');
        }
        try {
            const xlsx = await import('xlsx');
            const wb = xlsx.utils.book_new();

            const wsTrend = xlsx.utils.json_to_sheet(
                data.trend.map((t) => ({
                    Mes: t.mes,
                    Combustible: t.combustible,
                    'Peajes/Multas': t.peajes,
                    Mantenimiento: t.mantenimiento,
                    Total: t.total,
                }))
            );
            xlsx.utils.book_append_sheet(wb, wsTrend, 'Tendencia');

            const wsChoferes = xlsx.utils.json_to_sheet(
                data.topChoferes.map((c) => ({
                    Código: c.codigo,
                    Chofer: c.nombre,
                    Total: c.total,
                }))
            );
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

    const areaList = data.byArea.map((a) => ({ name: a.area, value: a.total }));
    const choferesList = data.topChoferes.map((c) => ({ name: c.nombre || c.codigo, value: c.total }));
    const vehiculosList = data.topVehiculos.map((v) => ({ name: v.targa, value: v.total }));

    const tiles = [
        { label: 'Costo Total', value: s.total, icon: Coins, tint: 'bg-[#FFC933]/15 text-[#8a6d1a]', accent: true },
        { label: 'Combustible', value: s.fuel, icon: Fuel, tint: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
        { label: 'Peajes / Multas', value: s.tolls, icon: Receipt, tint: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
        { label: 'Mantenimiento', value: s.maintenance, icon: Wrench, tint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
    ];

    return (
        <div className="space-y-6">
            {/* Encabezado de la sección + filtro de fechas + exportar */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Reporte de Costos</h2>
                    <p className="text-sm text-slate-500">Combustible, peajes/multas y mantenimiento en el período seleccionado.</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-44">
                        <DatePicker label="Desde" value={from} onChange={setFrom} clearable={false} max={to} />
                    </div>
                    <div className="w-44">
                        <DatePicker label="Hasta" value={to} onChange={setTo} clearable={false} min={from} />
                    </div>
                    <button
                        type="button"
                        onClick={exportToExcel}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFC933] text-[#1a1a1c] text-sm font-semibold hover:brightness-95 transition shadow-sm"
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
            </div>

            {/* Tiles de resumen */}
            <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4">
                {tiles.map((t) => (
                    <div
                        key={t.label}
                        className={`rounded-2xl border p-5 bg-white dark:bg-slate-900 ${t.accent ? 'border-[#FFC933]' : 'border-slate-200 dark:border-slate-800'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${t.tint}`}>
                                <t.icon size={20} />
                            </div>
                            <Text>{t.label}</Text>
                        </div>
                        <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                            {loading ? '—' : format(t.value)}
                        </div>
                    </div>
                ))}
            </Grid>

            {/* Nota de margen: solo si hay ingresos; si no, texto sutil */}
            {hasIncome ? (
                <div className="flex items-center gap-2 text-sm">
                    {s.margin >= 0 ? (
                        <TrendingUp size={16} className="text-emerald-500" />
                    ) : (
                        <TrendingDown size={16} className="text-rose-500" />
                    )}
                    <span className="text-slate-500">
                        Ingresos {format(s.income)} · Margen{' '}
                        <span className={s.margin >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                            {format(s.margin)}
                        </span>
                    </span>
                </div>
            ) : (
                <p className="text-xs text-slate-400">Sin ingresos registrados en el período · se muestran únicamente los costos.</p>
            )}

            {/* Tendencia + Área */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="rounded-2xl border-slate-200 lg:col-span-2">
                    <Title>Tendencia de costos por mes</Title>
                    <Subtitle>Evolución de combustible, peajes/multas y mantenimiento</Subtitle>
                    <AreaChart
                        className="h-72 mt-4"
                        data={data.trend}
                        index="mes"
                        categories={['combustible', 'peajes', 'mantenimiento']}
                        colors={['blue', 'rose', 'emerald']}
                        valueFormatter={(n) => format(n)}
                        yAxisWidth={64}
                        showAnimation
                    />
                </Card>

                <Card className="rounded-2xl border-slate-200">
                    <Title>Costos por área</Title>
                    <Subtitle>Distribución del gasto</Subtitle>
                    <DonutChart
                        className="h-52 mt-4"
                        data={areaList}
                        category="value"
                        index="name"
                        valueFormatter={(n) => format(n)}
                        colors={['amber', 'blue', 'rose', 'emerald', 'indigo', 'violet', 'cyan']}
                        showAnimation
                    />
                    <div className="mt-4">
                        <BarList data={areaList.slice(0, 5)} valueFormatter={(n) => format(n)} color="amber" />
                    </div>
                </Card>
            </div>

            {/* Top choferes + Top vehículos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border-slate-200">
                    <Title>Top choferes por multas / costos</Title>
                    <Subtitle>Mayor costo acumulado en el período</Subtitle>
                    {choferesList.length === 0 ? (
                        <Text className="mt-6">Sin datos.</Text>
                    ) : (
                        <BarList className="mt-4" data={choferesList.slice(0, 8)} valueFormatter={(n) => format(n)} color="rose" />
                    )}
                </Card>

                <Card className="rounded-2xl border-slate-200">
                    <Title>Top vehículos por costos</Title>
                    <Subtitle>Unidades con mayor gasto</Subtitle>
                    {vehiculosList.length === 0 ? (
                        <Text className="mt-6">Sin datos.</Text>
                    ) : (
                        <BarList className="mt-4" data={vehiculosList.slice(0, 8)} valueFormatter={(n) => format(n)} color="blue" />
                    )}
                </Card>
            </div>
        </div>
    );
}
