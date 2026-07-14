import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MantenimientoService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.mantenimiento.create({
            data: {
                vehiculo_id: data.vehiculo_id,
                tipo: data.tipo,
                fecha: new Date(data.fecha),
                descripcion: data.descripcion,
                costo: parseFloat(data.costo),
                taller: data.taller,
                kilometraje: data.kilometraje ? parseInt(data.kilometraje) : null,
                tenant_id: tenantId,
            }
        });
    }

    async findAll(
        tenantId: string,
        opts: { q?: string; tipo?: string; skip?: number; take?: number } = {},
    ) {
        const { q, tipo, skip = 0, take = 10 } = opts;

        const baseWhere: Prisma.MantenimientoWhereInput = { tenant_id: tenantId };
        if (q) {
            baseWhere.OR = [
                { descripcion: { contains: q } },
                { vehiculo: { placa: { contains: q } } },
            ];
        }
        const itemsWhere: Prisma.MantenimientoWhereInput = { ...baseWhere };
        if (tipo && tipo !== 'Todos') itemsWhere.tipo = tipo;

        const [items, total] = await this.prisma.$transaction([
            this.prisma.mantenimiento.findMany({
                where: itemsWhere,
                include: { vehiculo: true },
                orderBy: { fecha: 'desc' },
                skip,
                take,
            }),
            this.prisma.mantenimiento.count({ where: itemsWhere }),
        ]);

        // groupBy cast to any: its `having` mapped type trips a known TS2615.
        const grouped: Array<{ tipo: string | null; _count: { _all: number } }> =
            await (this.prisma.mantenimiento.groupBy as any)({
                by: ['tipo'],
                where: baseWhere,
                _count: { _all: true },
            });
        const counts: Record<string, number> = { Todos: 0, Preventivo: 0, Correctivo: 0, Emergencia: 0 };
        grouped.forEach((g) => {
            counts.Todos += g._count._all;
            if (g.tipo && counts[g.tipo] !== undefined) counts[g.tipo] = g._count._all;
        });

        return { items, total, counts };
    }

    findByVehicleId(vehicleId: string) {
        return this.prisma.mantenimiento.findMany({
            where: { vehiculo_id: vehicleId },
            orderBy: { fecha: 'desc' }
        });
    }

    update(id: string, data: any) {
        return this.prisma.mantenimiento.update({
            where: { id },
            data: {
                costo: data.costo !== undefined ? parseFloat(data.costo) : undefined,
                descripcion: data.descripcion,
                taller: data.taller,
                kilometraje: data.kilometraje ? parseInt(data.kilometraje) : undefined,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.mantenimiento.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
