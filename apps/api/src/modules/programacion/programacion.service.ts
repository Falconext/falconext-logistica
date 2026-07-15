
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ProgramacionService {
    constructor(private prisma: PrismaService) { }

    // Only the columns the operaciones list/map actually render — keeps the
    // payload small (drops nota + audit timestamps + tenant_id).
    private static readonly LIST_SELECT = {
        id: true,
        fecha: true,
        id_programacion: true,
        vehiculo_id: true,
        trabajador_id: true,
        cliente: true,
        lugar_retiro: true,
        fecha_retiro: true,
        lugar_entrega: true,
        fecha_entrega: true,
        hora_retiro: true,
        estado: true,
        ingreso_estimado: true,
    };

    async findAll(
        tenantId: string,
        opts: { from?: string; to?: string; q?: string; estados?: string[]; skip?: number; take?: number; ownerCodigo?: string } = {},
    ) {
        const { from, to, q, estados, skip = 0, take = 60, ownerCodigo } = opts;

        // Base scope: always the caller's tenant, plus optional date window + search.
        const baseWhere: Prisma.ProgramacionWhereInput = { tenant_id: tenantId };
        // Owner scoping: restricted users only see programaciones for their own
        // trabajador (id_trabajador like 'G001'). ADMIN/SUPERADMIN pass undefined.
        if (ownerCodigo) baseWhere.trabajador_id = ownerCodigo;
        if (from || to) {
            baseWhere.fecha = {};
            if (from) (baseWhere.fecha as Prisma.DateTimeFilter).gte = new Date(from);
            if (to) (baseWhere.fecha as Prisma.DateTimeFilter).lte = new Date(to);
        }
        if (q) {
            baseWhere.OR = [
                { cliente: { contains: q } },
                { vehiculo_id: { contains: q } },
                { lugar_entrega: { contains: q } },
                { id_programacion: { contains: q } },
            ];
        }

        // The list also narrows by the visible estados; counts/total do NOT so the
        // "Capas" panel can show the full per-estado tally within the current scope.
        const itemsWhere: Prisma.ProgramacionWhereInput = { ...baseWhere };
        if (estados && estados.length) itemsWhere.estado = { in: estados };

        const [items, total] = await this.prisma.$transaction([
            this.prisma.programacion.findMany({
                where: itemsWhere,
                orderBy: { fecha: 'desc' },
                skip,
                take,
                select: ProgramacionService.LIST_SELECT,
            }),
            this.prisma.programacion.count({ where: itemsWhere }),
        ]);

        // Per-estado tally for the "Capas" panel. `groupBy` is cast to any because
        // its `having` mapped type trips a known TS2615 (circular reference) with
        // this TS version — the query itself is valid.
        const grouped: Array<{ estado: string; _count: { _all: number } }> =
            await (this.prisma.programacion.groupBy as any)({
                by: ['estado'],
                where: baseWhere,
                _count: { _all: true },
            });

        const counts: Record<string, number> = {};
        grouped.forEach((g) => { counts[g.estado] = g._count._all; });

        return { items, total, counts };
    }

    async findOne(id: string) {
        return this.prisma.programacion.findUnique({
            where: { id },
        });
    }

    async findByVehicleId(id_furgon_or_placa: string) {
        return this.prisma.programacion.findMany({
            where: {
                OR: [
                    { vehiculo_id: id_furgon_or_placa },
                    // In case the vehicle ID is stored differently or we want to match loose references
                ]
            },
            orderBy: {
                fecha: 'desc',
            }
        });
    }

    async findByDriverId(driverId: string) {
        return this.prisma.programacion.findMany({
            where: {
                trabajador_id: driverId
            },
            orderBy: {
                fecha: 'desc',
            }
        });
    }

    async create(data: any, tenantId?: string) {
        // Scope the new record to the caller's tenant (from the JWT). Fall back to
        // the first tenant only if no auth context is available (legacy callers).
        const resolvedTenant = tenantId
            || data.tenant_id
            || (await this.prisma.tenant.findFirst())?.id;

        return this.prisma.programacion.create({
            data: {
                ...data,
                // `fecha` es requerida en el modelo pero los clientes (app y web) sólo
                // envían fecha_retiro/fecha_entrega. La derivamos para no fallar el create.
                fecha: data.fecha || data.fecha_retiro || data.fecha_entrega || new Date(),
                // El default del modelo es 'PENDING' (inglés) pero los clientes usan
                // estados en español (PENDIENTE/RETIRADO/ENTREGADO...). Alineamos.
                estado: data.estado || 'PENDIENTE',
                tenant_id: resolvedTenant
            }
        });
    }

    async update(id: string, data: any) {
        return this.prisma.programacion.update({
            where: { id },
            data: data
        });
    }

    async remove(id: string, tenantId: string) {
        // Scoped by tenant: only delete records belonging to the caller's tenant
        return this.prisma.programacion.deleteMany({
            where: { id, tenant_id: tenantId },
        });
    }
}
