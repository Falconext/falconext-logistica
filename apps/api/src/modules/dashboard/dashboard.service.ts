
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

        // Active workers count
        const activeWorkers = await this.prisma.trabajador.count({
            where: {
                tenant_id: tenantId,
                estado_laboral: 'Activo'
            }
        });

        // Total workers count
        const totalWorkers = await this.prisma.trabajador.count({
            where: { tenant_id: tenantId }
        });

        // Active vehicles count
        const activeVehicles = await this.prisma.vehiculo.count({
            where: {
                tenant_id: tenantId,
                estado_vehiculo: 'Activo'
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
}
