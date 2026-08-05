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
        opts: { q?: string; area?: string; skip?: number; take?: number; ownerIds?: string[] } = {},
    ) {
        const { q, area, skip = 0, take = 10, ownerIds } = opts;

        const where: Prisma.CombustibleWhereInput = { tenant_id: tenantId };
        // Owner scoping: a "solo_propios" user only sees their own records.
        // Aceptamos UUID (nuevo) y código legacy para tolerar data no migrada.
        if (ownerIds?.length) where.trabajador_id = { in: ownerIds };
        if (q) {
            where.OR = [
                { targa: { contains: q } },
                { id_registro: { contains: q } },
                { metodo: { contains: q } },
            ];
        }
        if (area && area !== 'Todos') where.area = area;

        // Gastos de tipo COMBUSTIBLE registrados por choferes en operaciones. Se fusionan
        // en esta lista. No tienen 'area' → se incluyen sólo cuando no hay filtro de área.
        const gastoWhere: Prisma.GastoOperacionWhereInput = { tenant_id: tenantId, tipo: 'COMBUSTIBLE' };
        if (ownerIds?.length) gastoWhere.trabajador_id = { in: ownerIds };
        if (q) gastoWhere.OR = [
            { targa: { contains: q } },
            { descripcion: { contains: q } },
            { programacion: { cliente: { contains: q } } },
        ];
        const includeGastos = !area || area === 'Todos';

        const nativeSelect = { id: true, id_registro: true, trabajador_id: true, fecha: true, monto: true, targa: true, metodo: true, area: true, archivo: true } as const;
        const [nativeItems, agg, gastos, gastoAgg] = await this.prisma.$transaction([
            this.prisma.combustible.findMany({ where, orderBy: { fecha: 'desc' }, select: nativeSelect }),
            this.prisma.combustible.aggregate({ where, _sum: { monto: true } }),
            includeGastos
                ? this.prisma.gastoOperacion.findMany({
                    where: gastoWhere,
                    orderBy: { fecha: 'desc' },
                    include: { programacion: { select: { id: true, cliente: true, id_programacion: true } } },
                })
                : this.prisma.gastoOperacion.findMany({ where: { id: '__none__' } }),
            this.prisma.gastoOperacion.aggregate({ where: includeGastos ? gastoWhere : { id: '__none__' }, _sum: { monto: true } }),
        ]);

        const gastoRows = gastos.map((g: any) => ({
            id: `gasto:${g.id}`,
            _origen: 'operacion',
            programacion_id: g.programacion_id,
            id_registro: null,
            trabajador_id: g.trabajador_id,
            fecha: g.fecha,
            monto: g.monto,
            targa: g.targa,
            metodo: g.programacion?.cliente ? `Operación · ${g.programacion.cliente}` : 'Gasto de operación',
            area: null,
            archivo: (g.comprobantes && g.comprobantes[0]) || null,
            comprobantes: g.comprobantes || [],
        }));

        const merged = [...nativeItems.map((i) => ({ ...i, _origen: 'combustible' })), ...gastoRows]
            .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
        const total = merged.length;
        const items = merged.slice(skip, skip + take);
        const sum = (agg._sum.monto ?? 0) + (gastoAgg._sum.monto ?? 0);

        // Distinct areas for the tenant (ignoring current filter) so the dropdown is stable.
        const areaGroups: Array<{ area: string | null }> =
            await (this.prisma.combustible.groupBy as any)({
                by: ['area'],
                where: ownerIds?.length
                    ? { tenant_id: tenantId, trabajador_id: { in: ownerIds } }
                    : { tenant_id: tenantId },
            });
        const areas = areaGroups.map((g) => g.area).filter(Boolean) as string[];

        return { items, total, sum, areas };
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
