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
                fecha_limite_pago: data.fecha_limite_pago ? new Date(data.fecha_limite_pago) : null,
                tenant_id: tenantId,
            }
        });
    }

    async findAll(
        tenantId: string,
        opts: { q?: string; estado?: string; skip?: number; take?: number; ownerIds?: string[]; from?: string; to?: string; trabajadorId?: string; spedizione?: string } = {},
    ) {
        const { q, estado, skip = 0, take = 10, ownerIds, from, to, trabajadorId, spedizione } = opts;

        // Base scope = tenant + optional search/fecha/trabajador. Estado is applied
        // only to the list (not to the counts) so the tabs keep showing the full tally.
        const baseWhere: Prisma.PeajeWhereInput = { tenant_id: tenantId };
        // Owner scoping: restricted users (solo_propios) only see their own peajes.
        // Aceptamos UUID (nuevo) y código legacy para tolerar data no migrada.
        if (ownerIds?.length) baseWhere.trabajador_id = { in: ownerIds };
        if (trabajadorId) baseWhere.trabajador_id = trabajadorId;
        if (from || to) {
            baseWhere.fecha = {};
            if (from) (baseWhere.fecha as Prisma.DateTimeFilter).gte = new Date(from);
            if (to) (baseWhere.fecha as Prisma.DateTimeFilter).lte = new Date(to);
        }
        // El Peaje nativo (import legacy) no tiene vínculo a Programacion/spedizione:
        // si se filtra por spedizione, ningún registro nativo puede calzar.
        if (spedizione) baseWhere.id = '__none__';
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
        // Desde que un admin puede marcarles estado (PAGADO/ANULADO), se filtran/
        // bucketizan igual que los Peaje nativos.
        const gastoBaseWhere: Prisma.GastoOperacionWhereInput = { tenant_id: tenantId, tipo: 'PEAJE' };
        if (ownerIds?.length) gastoBaseWhere.trabajador_id = { in: ownerIds };
        if (trabajadorId) gastoBaseWhere.trabajador_id = trabajadorId;
        if (from || to) {
            gastoBaseWhere.fecha = {};
            if (from) (gastoBaseWhere.fecha as Prisma.DateTimeFilter).gte = new Date(from);
            if (to) (gastoBaseWhere.fecha as Prisma.DateTimeFilter).lte = new Date(to);
        }
        if (spedizione) gastoBaseWhere.programacion = { spedizione };
        if (q) gastoBaseWhere.OR = [
            { targa: { contains: q } },
            { descripcion: { contains: q } },
            { numero_mancato: { contains: q } },
            { programacion: { cliente: { contains: q } } },
        ];
        const gastoItemsWhere: Prisma.GastoOperacionWhereInput = { ...gastoBaseWhere };
        if (estado === 'PAGADO') gastoItemsWhere.estado = { in: PAGADO_VALS };
        else if (estado === 'ANULADO') gastoItemsWhere.estado = { in: ANULADO_VALS };
        else if (estado === 'PENDIENTE') {
            gastoItemsWhere.AND = [{ OR: [{ estado: { notIn: [...PAGADO_VALS, ...ANULADO_VALS] } }, { estado: null }] }];
        }

        // Traemos los peajes nativos + gastos que matchean el filtro (sin paginar) para
        // poder fusionarlos y paginar el conjunto combinado en memoria.
        const nativeSelect = {
            id: true, targa: true, estado: true, comentarios: true, fecha: true, hora: true, tipo: true, monto: true,
            archivo: true, id_multa: true, recibo_pago: true, fecha_recepcion: true, fecha_limite_pago: true,
        } as const;
        const [nativeItems, gastos, gastosParaContar] = await this.prisma.$transaction([
            this.prisma.peaje.findMany({ where: itemsWhere, orderBy: { fecha: 'desc' }, select: nativeSelect }),
            this.prisma.gastoOperacion.findMany({
                where: gastoItemsWhere,
                orderBy: { fecha: 'desc' },
                include: { programacion: { select: { id: true, cliente: true, id_programacion: true, spedizione: true } } },
            }),
            // Para los counts por tab, se necesita el estado de TODOS los gastos (sin
            // filtrar por tab) — igual que `grouped` hace para Peaje vía `baseWhere`.
            this.prisma.gastoOperacion.findMany({ where: gastoBaseWhere, select: { estado: true } }),
        ]);

        const gastoRows = gastos.map((g: any) => ({
            id: `gasto:${g.id}`,
            _origen: 'operacion',
            programacion_id: g.programacion_id,
            targa: g.targa,
            cliente: g.programacion?.cliente || null,
            spedizione: g.programacion?.spedizione || null,
            estado: g.estado || null,
            comentarios: [
                g.programacion?.cliente ? `Operación · ${g.programacion.cliente}` : 'Gasto de operación',
                g.numero_mancato ? `Mancato ${g.numero_mancato}` : null,
            ].filter(Boolean).join(' · '),
            id_multa: g.numero_mancato || null,
            numero_mancato: g.numero_mancato || null,
            link_peaje: g.link_peaje || null,
            // false = peaje MANCATO (lo paga la empresa, no se descuenta al chofer).
            pagado_por_chofer: g.pagado_por_chofer !== false,
            fecha: g.fecha,
            fecha_recepcion: g.fecha,
            fecha_limite_pago: g.fecha_limite_pago || null,
            hora: null,
            tipo: 'PEAJE',
            monto: g.monto,
            archivo: (g.comprobantes && g.comprobantes[0]) || null,
            comprobantes: g.comprobantes || [],
            recibo_pago: null,
        }));

        const merged = [...nativeItems.map((i) => ({ ...i, _origen: 'peaje', comprobantes: i.archivo ? [i.archivo] : [] })), ...gastoRows]
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
        gastosParaContar.forEach((g) => {
            counts.Todos += 1;
            counts[bucketOf(g.estado)] += 1;
        });

        return { items, total, counts };
    }

    update(id: string, data: any, tenantId?: string) {
        // Los peajes "mancato" (registrados desde una operación) usan el id prefijado
        // "gasto:<id>" — viven en GastoOperacion, no en Peaje. Solo se les permite
        // editar estado de pago y fecha límite (lo que pide el admin al liquidarlos).
        if (id.startsWith('gasto:')) {
            const gastoId = id.slice('gasto:'.length);
            return this.prisma.gastoOperacion.updateMany({
                where: tenantId ? { id: gastoId, tenant_id: tenantId, tipo: 'PEAJE' } : { id: gastoId, tipo: 'PEAJE' },
                data: {
                    estado: data.estado,
                    fecha_limite_pago: data.fecha_limite_pago ? new Date(data.fecha_limite_pago) : undefined,
                },
            });
        }
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
                fecha_limite_pago: data.fecha_limite_pago ? new Date(data.fecha_limite_pago) : undefined,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.peaje.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
