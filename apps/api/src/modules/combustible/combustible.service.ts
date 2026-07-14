import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class CombustibleService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.combustible.create({
            data: {
                id_registro: data.id_registro || null,
                trabajador_id: data.trabajador_id || null,
                fecha: data.fecha ? new Date(data.fecha) : null,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : null,
                targa: data.targa || null,
                metodo: data.metodo || null,
                area: data.area || null,
                mes: data.mes || null,
                archivo: data.archivo || null,
                tenant_id: tenantId,
            }
        });
    }

    async findAll(
        tenantId: string,
        opts: { q?: string; area?: string; skip?: number; take?: number; trabajadorCodigo?: string } = {},
    ) {
        const { q, area, skip = 0, take = 10, trabajadorCodigo } = opts;

        const where: Prisma.CombustibleWhereInput = { tenant_id: tenantId };
        // Owner scoping: a "solo_propios" user only sees their own records.
        if (trabajadorCodigo) where.trabajador_id = trabajadorCodigo;
        if (q) {
            where.OR = [
                { targa: { contains: q } },
                { id_registro: { contains: q } },
                { metodo: { contains: q } },
            ];
        }
        if (area && area !== 'Todos') where.area = area;

        const [items, total, agg] = await this.prisma.$transaction([
            this.prisma.combustible.findMany({ where, orderBy: { fecha: 'desc' }, skip, take }),
            this.prisma.combustible.count({ where }),
            this.prisma.combustible.aggregate({ where, _sum: { monto: true } }),
        ]);

        // Distinct areas for the tenant (ignoring current filter) so the dropdown is stable.
        const areaGroups: Array<{ area: string | null }> =
            await (this.prisma.combustible.groupBy as any)({
                by: ['area'],
                where: trabajadorCodigo
                    ? { tenant_id: tenantId, trabajador_id: trabajadorCodigo }
                    : { tenant_id: tenantId },
            });
        const areas = areaGroups.map((g) => g.area).filter(Boolean) as string[];

        return { items, total, sum: agg._sum.monto ?? 0, areas };
    }

    update(id: string, data: any) {
        return this.prisma.combustible.update({
            where: { id },
            data: {
                id_registro: data.id_registro,
                trabajador_id: data.trabajador_id,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : undefined,
                targa: data.targa,
                metodo: data.metodo,
                area: data.area,
                mes: data.mes,
                archivo: data.archivo,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.combustible.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
