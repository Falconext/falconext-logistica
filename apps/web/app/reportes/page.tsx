'use client';

import { useState, useEffect } from 'react';
import {
    Card,
    Title,
    Text,
    AreaChart,
    BarChart,
    Metric,
    Flex,
    DateRangePicker,
    DateRangePickerValue,
    Subtitle,
    Grid
} from '@tremor/react';
import { BarChart3, Receipt, Users, Package, Calendar } from 'lucide-react';
import { es } from 'date-fns/locale';
import api from '../../lib/api'; // Correct path to API client
import { toast } from 'sonner';
import { useCurrency } from '../../lib/useCurrency';
import CostosReport from './CostosReport';

export default function ReportesPage() {
    const { format } = useCurrency();
    const [dateRange, setDateRange] = useState<DateRangePickerValue>({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    });

    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState({
        total_routes: 0,
        completed: 0,
        failed: 0,
        income: 0,
        active_clients: 0
    });
    const [charts, setCharts] = useState({
        evolution: [],
        workers: [],
        vehicles: []
    });

    useEffect(() => {
        fetchReports();
    }, [dateRange]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const params = {
                from: dateRange.from ? dateRange.from.toISOString() : undefined,
                to: dateRange.to ? dateRange.to.toISOString() : undefined
            };
            const response = await api.get('/dashboard/reports', { params });
            setKpis(response.data.kpis);
            setCharts(response.data.charts);
        } catch (error) {
            console.error('Error fetching reports:', error);
            toast.error('Error al cargar reportes');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">
                        Dashboard General
                    </h1>
                </div>
                <div className="flex gap-2">
                    <DateRangePicker
                        className="max-w-md mx-auto"
                        value={dateRange}
                        onValueChange={setDateRange}
                        locale={es}
                        placeholder="Seleccionar rango"
                        selectPlaceholder="Seleccionar"
                    />
                </div>
            </div>

            {/* KPI Cards Grid */}
            <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-6">
                <Card decoration="top" decorationColor="blue">
                    <Flex justifyContent="start" className="space-x-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <Receipt size={24} />
                        </div>
                        <div>
                            <Text>Rutas Totales</Text>
                            <Metric>{kpis.total_routes}</Metric>
                        </div>
                    </Flex>
                </Card>
                <Card decoration="top" decorationColor="emerald">
                    <Flex justifyContent="start" className="space-x-4">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                            <Users size={24} />
                        </div>
                        <div>
                            <Text>Clientes Activos</Text>
                            <Metric>{kpis.active_clients}</Metric>
                        </div>
                    </Flex>
                </Card>
                <Card decoration="top" decorationColor="amber">
                    <Flex justifyContent="start" className="space-x-4">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                            <Package size={24} />
                        </div>
                        <div>
                            <Text>Entregas Exitosas</Text>
                            <Metric>{kpis.completed}</Metric>
                        </div>
                    </Flex>
                </Card>
                <Card decoration="top" decorationColor="indigo">
                    <Flex justifyContent="start" className="space-x-4">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <Text>Ingresos Estimados</Text>
                            <Metric>{format(kpis.income)}</Metric>
                        </div>
                    </Flex>
                </Card>
            </Grid>

            {/* Main Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Evolution Chart */}
                <Card>
                    <Title>Evolución de Entregas</Title>
                    <Subtitle>Entregas realizadas vs fallidas en el periodo</Subtitle>
                    <AreaChart
                        className="h-72 mt-4"
                        data={charts.evolution}
                        index="date"
                        categories={["Entregas Realizadas", "Entregas Fallidas"]}
                        colors={["blue", "rose"]}
                        valueFormatter={(number) => `${number} u`}
                        yAxisWidth={40}
                        showAnimation={true}
                    />
                </Card>

                {/* Vertical Bar Chart (Workers) */}
                <Card>
                    <Title>Ranking de Conductores</Title>
                    <Subtitle>Top conductores por entregas completadas</Subtitle>
                    <BarChart
                        className="h-72 mt-4"
                        data={charts.workers}
                        index="name"
                        categories={["Entregas"]}
                        colors={["blue"]}
                        valueFormatter={(number) => `${number}`}
                        yAxisWidth={40}
                        layout="vertical"
                        showLegend={false}
                        showAnimation={true}
                    />
                </Card>
            </div>

            {/* Bottom Section */}
            <Card>
                <Title>Uso de Flota</Title>
                <Subtitle>Vehículos con mayor actividad (Rutas asignadas)</Subtitle>
                <BarChart
                    className="h-80 mt-6"
                    data={charts.vehicles}
                    index="name"
                    categories={["Viajes"]}
                    colors={["emerald"]}
                    valueFormatter={(number) => `${number} viajes`}
                    yAxisWidth={60}
                    showAnimation={true}
                />
            </Card>

            {/* Sección de Costos */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <CostosReport />
            </div>
        </div>
    );
}
