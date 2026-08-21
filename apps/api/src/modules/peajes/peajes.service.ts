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
        opts: { q?: string; estado?: string; skip?: number; take?: number; ownerIds?: string[] } = {},
    ) {
        const { q, estado, skip = 0, take = 10, ownerIds } = opts;

        // Base scope = tenant + optional search. Estado is applied only to the list
        // (not to the counts) so the tabs keep showing the full per-estado tally.
        const baseWhere: Prisma.PeajeWhereInput = { tenant_id: tenantId };
        // Owner scoping: restricted users (solo_propios) only see their own peajes.
        // Aceptamos UUID (nuevo) y código legacy para tolerar data no migrada.
        if (ownerIds?.length) baseWhere.trabajador_id = { in: ownerIds };
        if (q) {
            baseWhere.OR = [
                { targa: { contains: q } },
                { id_multa: { contains: q } },
                { comentarios: { contains: q } },
            ];
        }
        // Los estados en BD son texto libre (PAGADO, NO PAGADO, PAGADO POR AUTISTA,
        // PAGO BONIFICO, VENCIDO, OBSERVACIÓN, …). Los agrupamos en 3 buckets para
        // que las pestañas Pendiente/Pagado/Anulado sumen bien. Desconocido → Pendiente.
        const PAGADO_VALS = ['PAGADO', 'PAGADO POR AUTISTA', 'PAGO BONIFICO'];
        const ANULADO_VALS = ['ANULADO'];
        const bucketOf = (e?: string | null): 'PAGADO' | 'ANULADO' | 'PENDIENTE' => {
            const v = (e || '').trim().toUpperCase();
            if (PAGADO_VALS.includes(v)) return 'PAGADO';
            if (ANULADO_VALS.includes(v)) return 'ANULADO';
            return 'PENDIENTE';
        };

        const itemsWhere: Prisma.PeajeWhereInput = { ...baseWhere };
        if (estado === 'PAGADO') itemsWhere.estado = { in: PAGADO_VALS };
        else if (estado === 'ANULADO') itemsWhere.estado = { in: ANULADO_VALS };
        else if (estado === 'PENDIENTE') {
            // Pendiente = todo lo que no es pagado ni anulado (incluye null).
            // Vía AND para no pisar el OR de búsqueda que pueda venir en baseWhere.
            itemsWhere.AND = [{ OR: [{ estado: { notIn: [...PAGADO_VALS, ...ANULADO_VALS] } }, { estado: null }] }];
        }

        // Gastos de tipo PEAJE registrados por choferes en operaciones. Se fusionan
        // en esta lista (mapeados a la forma de un peaje) para que aparezcan aquí.
        // No tienen estado propio → cuentan como PENDIENTE. Se excluyen si el filtro
        // pide sólo PAGADO/ANULADO.
        const gastoWhere: Prisma.GastoOperacionWhereInput = { tenant_id: tenantId, tipo: 'PEAJE' };
        if (ownerIds?.length) gastoWhere.trabajador_id = { in: ownerIds };
        if (q) gastoWhere.OR = [
            { targa: { contains: q } },
            { descripcion: { contains: q } },
            { numero_mancato: { contains: q } },
            { programacion: { cliente: { contains: q } } },
        ];
        const includeGastos = !estado || estado === 'Todos' || estado === 'PENDIENTE';

        // Traemos los peajes nativos que matchean el filtro (sin paginar) para poder
        // fusionarlos con los gastos y paginar el conjunto combinado en memoria.
        const nativeSelect = { id: true, targa: true, estado: true, comentarios: true, fecha: true, hora: true, tipo: true, monto: true, archivo: true } as const;
        const [nativeItems, gastos, gastoCount] = await this.prisma.$transaction([
            this.prisma.peaje.findMany({ where: itemsWhere, orderBy: { fecha: 'desc' }, select: nativeSelect }),
            includeGastos
                ? this.prisma.gastoOperacion.findMany({
                    where: gastoWhere,
                    orderBy: { fecha: 'desc' },
                    include: { programacion: { select: { id: true, cliente: true, id_programacion: true } } },
                })
                : this.prisma.gastoOperacion.findMany({ where: { id: '__none__' } }),
            this.prisma.gastoOperacion.count({ where: gastoWhere }),
        ]);

        const gastoRows = gastos.map((g: any) => ({
            id: `gasto:${g.id}`,
            _origen: 'operacion',
            programacion_id: g.programacion_id,
            targa: g.targa,
            estado: null,
            comentarios: [
                g.programacion?.cliente ? `Operación · ${g.programacion.cliente}` : 'Gasto de operación',
                g.numero_mancato ? `Mancato ${g.numero_mancato}` : null,
            ].filter(Boolean).join(' · '),
            numero_mancato: g.numero_mancato || null,
            link_peaje: g.link_peaje || null,
            // false = peaje MANCATO (lo paga la empresa, no se descuenta al chofer).
            pagado_por_chofer: g.pagado_por_chofer !== false,
            fecha: g.fecha,
            hora: null,
            tipo: 'PEAJE',
            monto: g.monto,
            archivo: (g.comprobantes && g.comprobantes[0]) || null,
            comprobantes: g.comprobantes || [],
        }));

        const merged = [...nativeItems.map((i) => ({ ...i, _origen: 'peaje' })), ...gastoRows]
            .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
        const total = merged.length;
        const items = merged.slice(skip, skip + take);

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
            counts[bucketOf(g.estado)] += g._count._all;
        });
        // Los gastos de operación cuentan como PENDIENTE (y suman al total).
        counts.Todos += gastoCount;
        counts.PENDIENTE += gastoCount;

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
