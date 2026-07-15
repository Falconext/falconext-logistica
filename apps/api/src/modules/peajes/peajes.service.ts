import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class PeajesService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.peaje.create({
            data: {
                id_multa: data.id_multa || null,
                estado: data.estado || null,
                fecha: data.fecha ? new Date(data.fecha) : null,
                hora: data.hora || null,
                targa: data.targa || null,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : null,
                trabajador_id: data.trabajador_id || null,
                comentarios: data.comentarios || null,
                archivo: data.archivo || null,
                recibo_pago: data.recibo_pago || null,
                tipo: data.tipo || null,
                mes: data.mes || null,
                fecha_recepcion: data.fecha_recepcion ? new Date(data.fecha_recepcion) : null,
                peaje_salida: data.peaje_salida || null,
                nota_autista: data.nota_autista || null,
                tenant_id: tenantId,
            }
        });
    }

    async findAll(
        tenantId: string,
        opts: { q?: string; estado?: string; skip?: number; take?: number; ownerCodigo?: string } = {},
    ) {
        const { q, estado, skip = 0, take = 10, ownerCodigo } = opts;

        // Base scope = tenant + optional search. Estado is applied only to the list
        // (not to the counts) so the tabs keep showing the full per-estado tally.
        const baseWhere: Prisma.PeajeWhereInput = { tenant_id: tenantId };
        // Owner scoping: restricted users (solo_propios) only see their own peajes.
        if (ownerCodigo) baseWhere.trabajador_id = ownerCodigo;
        if (q) {
            baseWhere.OR = [
                { targa: { contains: q } },
                { id_multa: { contains: q } },
                { comentarios: { contains: q } },
            ];
        }
        const itemsWhere: Prisma.PeajeWhereInput = { ...baseWhere };
        if (estado && estado !== 'Todos') itemsWhere.estado = estado;

        const [items, total] = await this.prisma.$transaction([
            this.prisma.peaje.findMany({ where: itemsWhere, orderBy: { fecha: 'desc' }, skip, take }),
            this.prisma.peaje.count({ where: itemsWhere }),
        ]);

        // groupBy cast to any: its `having` mapped type trips a known TS2615.
        const grouped: Array<{ estado: string | null; _count: { _all: number } }> =
            await (this.prisma.peaje.groupBy as any)({
                by: ['estado'],
                where: baseWhere,
                _count: { _all: true },
            });
        const counts: Record<string, number> = { Todos: 0, PENDIENTE: 0, PAGADO: 0, ANULADO: 0 };
        grouped.forEach((g) => {
            counts.Todos += g._count._all;
            if (g.estado && counts[g.estado] !== undefined) counts[g.estado] = g._count._all;
        });

        return { items, total, counts };
    }

    update(id: string, data: any, tenantId?: string) {
        // updateMany permite filtrar por tenant además del id (aislamiento multi-empresa):
        // sólo actualiza si el peaje pertenece al tenant del usuario.
        return this.prisma.peaje.updateMany({
            where: tenantId ? { id, tenant_id: tenantId } : { id },
            data: {
                id_multa: data.id_multa,
                estado: data.estado,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                hora: data.hora,
                targa: data.targa,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : undefined,
                trabajador_id: data.trabajador_id,
                comentarios: data.comentarios,
                archivo: data.archivo,
                recibo_pago: data.recibo_pago,
                tipo: data.tipo,
                mes: data.mes,
                fecha_recepcion: data.fecha_recepcion ? new Date(data.fecha_recepcion) : undefined,
                peaje_salida: data.peaje_salida,
                nota_autista: data.nota_autista,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.peaje.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
