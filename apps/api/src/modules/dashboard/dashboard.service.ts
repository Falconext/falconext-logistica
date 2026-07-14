
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getAlerts(tenantId?: string) {
        const today = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        const whereClause = tenantId ? { tenant_id: tenantId } : {};

        // Fetch Vehicles with expiring insurance
        const expiringVehicles = await this.prisma.vehiculo.findMany({
            where: {
                fecha_vencimiento_seguro: {
                    lte: thirtyDaysFromNow,
                    // not: null // Implicit in lte usually, but good to be safe if Prisma complains, though lte filters out nulls usually
                }
            }
        });

        // Fetch Workers with expiring documents
        const expiringWorkers = await this.prisma.trabajador.findMany({
            where: {
                OR: [
                    { fecha_vencimiento_licencia: { lte: thirtyDaysFromNow } },
                    { fecha_vencimiento_pasaporte: { lte: thirtyDaysFromNow } },
                    { fecha_vencimiento_residencia: { lte: thirtyDaysFromNow } },
                    { fecha_vencimiento_identidad: { lte: thirtyDaysFromNow } },
                ]
            }
        });

        const alerts = [];

        // Process Vehicles
        for (const v of expiringVehicles) {
            if (v.fecha_vencimiento_seguro) {
                const days = Math.ceil((v.fecha_vencimiento_seguro.getTime() - today.getTime()) / (1000 * 3600 * 24));
                const isExpired = days < 0;
                alerts.push({
                    id: `v-${v.id}`,
                    type: 'VEHICULO',
                    entity: v.placa,
                    docName: 'Seguro',
                    date: v.fecha_vencimiento_seguro,
                    daysRemaining: days,
                    status: isExpired ? 'VENCIDO' : 'POR_VENCER',
                    severity: isExpired ? 'high' : (days < 7 ? 'medium' : 'low') // high=red, medium=orange, low=yellow
                });
            }
        }

        // Process Workers
        for (const w of expiringWorkers) {
            this.checkAndAddAlert(alerts, w, 'Licencia', w.fecha_vencimiento_licencia, today);
            this.checkAndAddAlert(alerts, w, 'Pasaporte', w.fecha_vencimiento_pasaporte, today);
            this.checkAndAddAlert(alerts, w, 'Residencia', w.fecha_vencimiento_residencia, today);
            this.checkAndAddAlert(alerts, w, 'Identidad', w.fecha_vencimiento_identidad, today);
        }

        // Sort by severity (high first) and then by days remaining (lowest first)
        return alerts.sort((a, b) => {
            if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
            return 0;
        });
    }

    private checkAndAddAlert(alerts: any[], worker: any, docName: string, date: Date | null, today: Date) {
        if (!date) return;

        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        if (date <= thirtyDaysFromNow) {
            const days = Math.ceil((date.getTime() - today.getTime()) / (1000 * 3600 * 24));
            const isExpired = days < 0;
            alerts.push({
                id: `w-${worker.id}-${docName}`,
                type: 'TRABAJADOR',
                entity: worker.nombre_completo,
                docName: docName,
                date: date,
                daysRemaining: days,
                status: isExpired ? 'VENCIDO' : 'POR_VENCER',
                severity: isExpired ? 'high' : (days < 7 ? 'medium' : 'low')
            });
        }
    }

    async getStats(tenantId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        // Active workers count (valores reales en BD: ACTIVO / INACTIVO)
        const activeWorkers = await this.prisma.trabajador.count({
            where: {
                tenant_id: tenantId,
                estado_laboral: { equals: 'ACTIVO', mode: 'insensitive' }
            }
        });

        // Total workers count
        const totalWorkers = await this.prisma.trabajador.count({
            where: { tenant_id: tenantId }
        });

        // Active vehicles count (valores reales en BD: DISPONIBLE / NO DISPONIBLE)
        const activeVehicles = await this.prisma.vehiculo.count({
            where: {
                tenant_id: tenantId,
                estado_vehiculo: { equals: 'DISPONIBLE', mode: 'insensitive' }
            }
        });

        // Total vehicles count
        const totalVehicles = await this.prisma.vehiculo.count({
            where: { tenant_id: tenantId }
        });

        // Routes scheduled for today
        const routesToday = await this.prisma.programacion.count({
            where: {
                tenant_id: tenantId,
                fecha: {
                    gte: today,
                    lt: tomorrow
                }
            }
        });

        // Total routes this month
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const routesThisMonth = await this.prisma.programacion.count({
            where: {
                tenant_id: tenantId,
                fecha: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        // Delivery stats by state (Spanish states from sync)
        const deliveredThisMonth = await this.prisma.programacion.count({
            where: {
                tenant_id: tenantId,
                estado: 'ENTREGADO',
                fecha: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        const pendingThisMonth = await this.prisma.programacion.count({
            where: {
                tenant_id: tenantId,
                estado: 'PENDIENTE',
                fecha: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        const cancelledThisMonth = await this.prisma.programacion.count({
            where: {
                tenant_id: tenantId,
                estado: 'ANULADO',
                fecha: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        // Maintenance this month
        const maintenanceThisMonth = await this.prisma.mantenimiento.count({
            where: {
                tenant_id: tenantId,
                fecha: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        // Pending alerts (documents expiring in 30 days)
        const pendingAlerts = await this.prisma.trabajador.count({
            where: {
                tenant_id: tenantId,
                OR: [
                    { fecha_vencimiento_licencia: { lte: thirtyDaysFromNow } },
                    { fecha_vencimiento_pasaporte: { lte: thirtyDaysFromNow } },
                    { fecha_vencimiento_residencia: { lte: thirtyDaysFromNow } },
                    { fecha_vencimiento_contrato: { lte: thirtyDaysFromNow } },
                ]
            }
        });

        // Unique clients this month
        const clientsRaw = await this.prisma.programacion.findMany({
            where: {
                tenant_id: tenantId,
                fecha: { gte: startOfMonth, lte: endOfMonth }
            },
            select: { cliente: true }
        });
        const uniqueClients = new Set(clientsRaw.map(r => r.cliente).filter(Boolean)).size;

        // ----- Costos y rentabilidad (mes actual vs mes anterior) -----
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

        const sumField = async (model: 'combustible' | 'peaje' | 'mantenimiento' | 'programacion', field: string, from: Date, to: Date) => {
            const res = await (this.prisma[model] as any).aggregate({
                _sum: { [field]: true },
                where: { tenant_id: tenantId, fecha: { gte: from, lte: to } },
            });
            return Number(res._sum[field] || 0);
        };

        const [fuel, tolls, maint, income] = await Promise.all([
            sumField('combustible', 'monto', startOfMonth, endOfMonth),
            sumField('peaje', 'monto', startOfMonth, endOfMonth),
            sumField('mantenimiento', 'costo', startOfMonth, endOfMonth),
            sumField('programacion', 'ingreso_estimado', startOfMonth, endOfMonth),
        ]);
        const [fuelPrev, tollsPrev, maintPrev] = await Promise.all([
            sumField('combustible', 'monto', lastMonthStart, lastMonthEnd),
            sumField('peaje', 'monto', lastMonthStart, lastMonthEnd),
            sumField('mantenimiento', 'costo', lastMonthStart, lastMonthEnd),
        ]);
        const totalCost = fuel + tolls + maint;
        const prevTotalCost = fuelPrev + tollsPrev + maintPrev;

        return {
            workers: {
                active: activeWorkers,
                total: totalWorkers,
                percentage: totalWorkers > 0 ? Math.round((activeWorkers / totalWorkers) * 100) : 0
            },
            vehicles: {
                active: activeVehicles,
                total: totalVehicles,
                percentage: totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0
            },
            routes: {
                today: routesToday,
                thisMonth: routesThisMonth
            },
            deliveries: {
                completed: deliveredThisMonth,
                pending: pendingThisMonth,
                cancelled: cancelledThisMonth,
                successRate: routesThisMonth > 0 ? Math.round((deliveredThisMonth / routesThisMonth) * 100) : 0
            },
            clients: {
                active: uniqueClients
            },
            maintenance: {
                thisMonth: maintenanceThisMonth
            },
            alerts: {
                pending: pendingAlerts
            },
            costs: {
                fuel,
                tolls,
                maintenance: maint,
                total: totalCost,
                prevTotal: prevTotalCost,
                // variación % vs mes anterior (null si no hay base)
                changePct: prevTotalCost > 0 ? Math.round(((totalCost - prevTotalCost) / prevTotalCost) * 100) : null,
                income,
                margin: income - totalCost
            }
        };
    }


    async getReportsStats(tenantId: string, from?: string, to?: string) {
        // Parse dates or use defaults (Current Month)
        const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const dateTo = to ? new Date(to) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

        // 1. Overall Stats
        const routes = await this.prisma.programacion.findMany({
            where: {
                tenant_id: tenantId,
                fecha: {
                    gte: dateFrom,
                    lte: dateTo
                }
            },
            include: {
                tenant: true
            }
        });

        const totalRoutes = routes.length;
        // Spanish states: ENTREGADO, ANULADO, PENDIENTE, REPROGRAMADO, RETIRADO
        const completedRoutes = routes.filter(r => r.estado === 'ENTREGADO').length;
        const failedRoutes = routes.filter(r => r.estado === 'ANULADO').length;
        const rescheduledRoutes = routes.filter(r => r.estado === 'REPROGRAMADO').length;
        const pickedUpRoutes = routes.filter(r => r.estado === 'RETIRADO').length;
        const pendingRoutes = routes.filter(r => r.estado === 'PENDIENTE').length;

        const totalIncome = routes.reduce((sum, r) => sum + (r.ingreso_estimado || 0), 0);

        // 2. Evolution Chart (AreaChart) - Daily grouping
        const evolutionMap = new Map<string, { completed: number; failed: number }>();

        routes.forEach(r => {
            const dateKey = r.fecha.toISOString().split('T')[0]; // YYYY-MM-DD
            if (!evolutionMap.has(dateKey)) {
                evolutionMap.set(dateKey, { completed: 0, failed: 0 });
            }
            const entry = evolutionMap.get(dateKey);
            if (r.estado === 'ENTREGADO') entry.completed++;
            if (r.estado === 'ANULADO') entry.failed++;
        });

        // Convert Map to Array sorted by date
        const evolutionChart = Array.from(evolutionMap.entries())
            .map(([date, counts]) => ({
                date,
                "Entregas Realizadas": counts.completed,
                "Entregas Fallidas": counts.failed
            }))
            .sort((a, b) => a.date.localeCompare(b.date));


        // 3. Worker Ranking (BarChart)
        const workerStats = new Map<string, number>();

        routes.forEach(r => {
            if (r.trabajador_id && r.estado === 'ENTREGADO') {
                workerStats.set(r.trabajador_id, (workerStats.get(r.trabajador_id) || 0) + 1);
            }
        });

        // Resolve names (optimize by fetching only needed IDs)
        const workerIds = Array.from(workerStats.keys());
        const workerNamesMap = new Map<string, string>();
        if (workerIds.length > 0) {
            const workers = await this.prisma.trabajador.findMany({
                where: {
                    OR: [
                        { id: { in: workerIds } },
                        { id_trabajador: { in: workerIds } } // Handle custom IDs if used
                    ],
                    tenant_id: tenantId
                },
                select: { id: true, id_trabajador: true, nombre_completo: true }
            });
            workers.forEach(w => {
                workerNamesMap.set(w.id, w.nombre_completo);
                if (w.id_trabajador) workerNamesMap.set(w.id_trabajador, w.nombre_completo);
            });
        }

        const workerRanking = Array.from(workerStats.entries())
            .map(([id, count]) => ({
                name: workerNamesMap.get(id) || id || 'Desconocido',
                "Entregas": count
            }))
            .sort((a, b) => b.Entregas - a.Entregas)
            .slice(0, 10); // Top 10


        // 4. Vehicle Stats (BarChart) - KM (Simulated sum or count of routes)
        // Since we don't track exact KM per route in DB yet (only GPS), let's use "Viajes Realizados" for now as proxy for usage
        // Or if we had a distance field in Programacion, we could sum it.
        // Let's use route count for now as "Uso de Furgón".
        const vehicleStats = new Map<string, number>();
        routes.forEach(r => {
            if (r.vehiculo_id) {
                vehicleStats.set(r.vehiculo_id, (vehicleStats.get(r.vehiculo_id) || 0) + 1);
            }
        });

        // Resolve Placa (similar to workers)
        const vehicleIds = Array.from(vehicleStats.keys());
        const vehiclePlacasMap = new Map<string, string>();
        if (vehicleIds.length > 0) {
            const vehicles = await this.prisma.vehiculo.findMany({
                where: {
                    OR: [
                        { id: { in: vehicleIds } },
                        { placa: { in: vehicleIds } } // Handle raw license plates if stored directly
                    ],
                    tenant_id: tenantId
                },
                select: { id: true, placa: true }
            });
            vehicles.forEach(v => {
                vehiclePlacasMap.set(v.id, v.placa);
                vehiclePlacasMap.set(v.placa, v.placa);
            });
        }

        const vehicleUsage = Array.from(vehicleStats.entries())
            .map(([id, count]) => ({
                name: vehiclePlacasMap.get(id) || id || 'Desconocido',
                "Viajes": count
            }))
            .sort((a, b) => b.Viajes - a.Viajes)
            .slice(0, 10);


        return {
            kpis: {
                total_routes: totalRoutes,
                completed: completedRoutes,
                failed: failedRoutes,
                income: totalIncome,
                active_clients: new Set(routes.map(r => r.cliente).filter(Boolean)).size // Distinct clients
            },
            charts: {
                evolution: evolutionChart,
                workers: workerRanking,
                vehicles: vehicleUsage
            }
        };
    }

    // ----- Reporte de costos filtrable por rango de fechas -----
    async getCostsReport(tenantId: string, from?: string, to?: string) {
        const now = new Date();
        const toDate = to ? new Date(to) : now;
        // por defecto: últimos 6 meses
        const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const range = { gte: fromDate, lte: toDate };

        const [combustibles, peajes, mantenimientos, programaciones] = await Promise.all([
            this.prisma.combustible.findMany({ where: { tenant_id: tenantId, fecha: range }, select: { fecha: true, monto: true, targa: true, area: true, trabajador_id: true } }),
            this.prisma.peaje.findMany({ where: { tenant_id: tenantId, fecha: range }, select: { fecha: true, monto: true, targa: true, trabajador_id: true } }),
            this.prisma.mantenimiento.findMany({ where: { tenant_id: tenantId, fecha: range }, select: { fecha: true, costo: true, vehiculo: { select: { placa: true } } } }),
            this.prisma.programacion.findMany({ where: { tenant_id: tenantId, fecha: range }, select: { ingreso_estimado: true } }),
        ]);

        const monthKey = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null);
        const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const fuel = combustibles.reduce((s, r) => s + (r.monto || 0), 0);
        const tolls = peajes.reduce((s, r) => s + (r.monto || 0), 0);
        const maintenance = mantenimientos.reduce((s, r) => s + (r.costo || 0), 0);
        const income = programaciones.reduce((s, r) => s + (r.ingreso_estimado || 0), 0);
        const total = fuel + tolls + maintenance;

        // Tendencia por mes
        const trendMap: Record<string, { combustible: number; peajes: number; mantenimiento: number }> = {};
        const bump = (d: Date | null, k: 'combustible' | 'peajes' | 'mantenimiento', v: number) => {
            const key = monthKey(d); if (!key) return;
            (trendMap[key] ??= { combustible: 0, peajes: 0, mantenimiento: 0 })[k] += v || 0;
        };
        combustibles.forEach(r => bump(r.fecha, 'combustible', r.monto || 0));
        peajes.forEach(r => bump(r.fecha, 'peajes', r.monto || 0));
        mantenimientos.forEach(r => bump(r.fecha, 'mantenimiento', r.costo || 0));
        const trend = Object.entries(trendMap).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => {
            const [y, m] = key.split('-');
            return { mes: `${MES[Number(m) - 1]} ${y.slice(2)}`, ...v, total: v.combustible + v.peajes + v.mantenimiento };
        });

        // Costo por área (combustible)
        const areaMap: Record<string, number> = {};
        combustibles.forEach(r => { const a = (r.area || 'Sin área').trim(); areaMap[a] = (areaMap[a] || 0) + (r.monto || 0); });
        const byArea = Object.entries(areaMap).map(([area, total]) => ({ area, total })).sort((a, b) => b.total - a.total);

        // Top vehículos por costo (combustible + peajes por targa)
        const vehMap: Record<string, number> = {};
        [...combustibles, ...peajes].forEach(r => { const t = (r.targa || '—').trim(); vehMap[t] = (vehMap[t] || 0) + (r.monto || 0); });
        const topVehiculos = Object.entries(vehMap).map(([targa, total]) => ({ targa, total })).sort((a, b) => b.total - a.total).slice(0, 8);

        // Top choferes por multas/peajes (trabajador_id = código)
        const chofMap: Record<string, number> = {};
        peajes.forEach(r => { const c = (r.trabajador_id || '—').trim(); chofMap[c] = (chofMap[c] || 0) + (r.monto || 0); });
        const codes = Object.keys(chofMap).filter(c => c !== '—');
        const trabajadores = await this.prisma.trabajador.findMany({ where: { tenant_id: tenantId, id_trabajador: { in: codes } }, select: { id_trabajador: true, nombre_completo: true } });
        const nombreByCode: Record<string, string> = {};
        trabajadores.forEach(t => { if (t.id_trabajador) nombreByCode[t.id_trabajador] = t.nombre_completo; });
        const topChoferes = Object.entries(chofMap).map(([codigo, total]) => ({ codigo, nombre: nombreByCode[codigo] || codigo, total })).sort((a, b) => b.total - a.total).slice(0, 8);

        return {
            summary: { fuel, tolls, maintenance, total, income, margin: income - total },
            trend,
            byArea,
            topVehiculos,
            topChoferes,
        };
    }
}
