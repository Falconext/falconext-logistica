import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

// Panel DHL: torre de control operativa. Agrega personal (disponibilidad por zona),
// flota (disponibilidad) y entregas activas (con cuenta regresiva por fecha_entrega).
@Injectable()
export class PanelService {
    constructor(private prisma: PrismaService) { }

    // Estados que cuentan como "operación activa":
    //  - RETIRADO  → IN CONSEGNA (en ruta / en entrega)
    //  - PENDIENTE → IN SOSPESO (pendiente)
    private static readonly EN_CONSEGNA = ['RETIRADO', 'IN_TRANSIT'];
    private static readonly EN_SOSPESO = ['PENDIENTE', 'PENDING', 'REPROGRAMADO'];
    // Solo entregas recientes: evita arrastrar operaciones pendientes viejas (histórico).
    private static readonly VENTANA_DIAS = 30;

    async getStatus(tenantId: string) {
        const activos = [...PanelService.EN_CONSEGNA, ...PanelService.EN_SOSPESO];
        const desde = new Date(Date.now() - PanelService.VENTANA_DIAS * 86400000);

        const [trabajadores, vehiculos, activas] = await this.prisma.$transaction([
            this.prisma.trabajador.findMany({
                where: { tenant_id: tenantId },
                select: {
                    id: true, id_trabajador: true, nombre_completo: true, cargo: true,
                    url_foto: true, area_trabajo: true, estado_laboral: true, disponible: true,
                },
                orderBy: { nombre_completo: 'asc' },
            }),
            this.prisma.vehiculo.findMany({
                where: { tenant_id: tenantId },
                select: {
                    id: true, placa: true, marca_modelo: true, tipo_unidad: true,
                    id_interno_furgon: true, url_foto: true, estado_vehiculo: true, disponible: true,
                },
                orderBy: { placa: 'asc' },
            }),
            this.prisma.programacion.findMany({
                where: { tenant_id: tenantId, estado: { in: activos }, fecha: { gte: desde } },
                orderBy: { fecha_entrega: 'asc' },
                select: {
                    id: true, id_programacion: true, vehiculo_id: true, trabajador_id: true,
                    cliente: true, lugar_retiro: true, lugar_entrega: true,
                    fecha_retiro: true, fecha_entrega: true, estado: true,
                },
            }),
        ]);

        // Resolver código de conductor → nombre para las operaciones activas.
        const codes = Array.from(
            new Set(activas.map((a) => a.trabajador_id).filter((c): c is string => !!c)),
        );
        const nameByCode = new Map<string, string>();
        if (codes.length) {
            const ts = await this.prisma.trabajador.findMany({
                where: { tenant_id: tenantId, OR: [{ id: { in: codes } }, { id_trabajador: { in: codes } }] },
                select: { id: true, id_trabajador: true, nombre_completo: true },
            });
            ts.forEach((t) => {
                nameByCode.set(t.id, t.nombre_completo);
                if (t.id_trabajador) nameByCode.set(t.id_trabajador, t.nombre_completo);
            });
        }

        // Marcar quién/qué está ocupado por una operación activa.
        const busyWorkers = new Set(activas.map((a) => a.trabajador_id).filter(Boolean) as string[]);
        const busyVehiculos = new Set(activas.map((a) => a.vehiculo_id).filter(Boolean) as string[]);

        // PERSONAL agrupado por zona (area_trabajo).
        const zonaMap = new Map<string, any[]>();
        for (const t of trabajadores) {
            const zona = t.area_trabajo?.trim() || 'Sin zona';
            const enOperacion = busyWorkers.has(t.id) || (!!t.id_trabajador && busyWorkers.has(t.id_trabajador));
            const item = { ...t, enOperacion, disponibleReal: t.disponible && !enOperacion };
            if (!zonaMap.has(zona)) zonaMap.set(zona, []);
            zonaMap.get(zona)!.push(item);
        }
        const personal = Array.from(zonaMap.entries())
            .map(([zona, items]) => ({
                zona,
                total: items.length,
                disponibles: items.filter((t) => t.disponibleReal).length,
                trabajadores: items,
            }))
            .sort((a, b) => a.zona.localeCompare(b.zona));

        // FLOTA (lista plana con disponibilidad).
        const flota = vehiculos.map((v) => {
            const enOperacion =
                busyVehiculos.has(v.id) ||
                busyVehiculos.has(v.placa) ||
                (!!v.id_interno_furgon && busyVehiculos.has(v.id_interno_furgon));
            return { ...v, enOperacion, disponibleReal: v.disponible && !enOperacion };
        });

        // ENTREGAS activas con cuenta regresiva.
        const now = Date.now();
        const mapEntrega = (a: (typeof activas)[number]) => ({
            id: a.id,
            id_programacion: a.id_programacion,
            targa: a.vehiculo_id,
            autista: (a.trabajador_id && nameByCode.get(a.trabajador_id)) || a.trabajador_id || null,
            cliente: a.cliente,
            lugar_retiro: a.lugar_retiro,
            lugar_entrega: a.lugar_entrega,
            fecha_entrega: a.fecha_entrega,
            estado: a.estado,
            restanteMin: a.fecha_entrega
                ? Math.round((new Date(a.fecha_entrega).getTime() - now) / 60000)
                : null,
        });
        const enConsegna = activas
            .filter((a) => PanelService.EN_CONSEGNA.includes(a.estado))
            .map(mapEntrega);
        const enSospeso = activas
            .filter((a) => PanelService.EN_SOSPESO.includes(a.estado))
            .map(mapEntrega);

        return {
            personal,
            flota,
            entregas: { enConsegna, enSospeso },
            resumen: {
                personalTotal: trabajadores.length,
                personalDisponible: personal.reduce((s, z) => s + z.disponibles, 0),
                flotaTotal: vehiculos.length,
                flotaDisponible: flota.filter((v) => v.disponibleReal).length,
                entregasActivas: activas.length,
            },
        };
    }

    async setTrabajadorDisponible(id: string, disponible: boolean, tenantId: string) {
        await this.prisma.trabajador.updateMany({
            where: { id, tenant_id: tenantId },
            data: { disponible },
        });
        return { id, disponible };
    }

    async setVehiculoDisponible(id: string, disponible: boolean, tenantId: string) {
        await this.prisma.vehiculo.updateMany({
            where: { id, tenant_id: tenantId },
            data: { disponible },
        });
        return { id, disponible };
    }
}
