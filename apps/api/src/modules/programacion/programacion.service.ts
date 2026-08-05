
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
        destinos: true,
        hora_retiro: true,
        km: true,
        ciudad: true,
        app: true,
        compactado: true,
        estado_consegna: true,
        attesa: true,
        estado: true,
        ingreso_estimado: true,
    };

    async findAll(
        tenantId: string,
        opts: { from?: string; to?: string; q?: string; estados?: string[]; skip?: number; take?: number; ownerIds?: string[] } = {},
    ) {
        const { from, to, q, estados, skip = 0, take = 60, ownerIds } = opts;

        // Base scope: always the caller's tenant, plus optional date window + search.
        const baseWhere: Prisma.ProgramacionWhereInput = { tenant_id: tenantId };
        // Owner scoping: restricted users only see their own trabajador's rows.
        // Aceptamos UUID (nuevo) y código legacy para tolerar data no migrada.
        if (ownerIds?.length) baseWhere.trabajador_id = { in: ownerIds };
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

        // Enriquecer cada operación con el NOMBRE del trabajador. En BD sólo se guarda
        // el código (`trabajador_id` = id_trabajador tipo 'G001'); resolvemos código → nombre
        // para que la UI muestre la persona en vez del código. Se acepta tanto id_trabajador
        // (código) como el UUID por robustez, igual que el dashboard.
        const codes = Array.from(
            new Set(items.map((i) => i.trabajador_id).filter((c): c is string => !!c)),
        );
        const nameByCode = new Map<string, string>();
        if (codes.length) {
            const trabajadores = await this.prisma.trabajador.findMany({
                where: {
                    tenant_id: tenantId,
                    OR: [{ id: { in: codes } }, { id_trabajador: { in: codes } }],
                },
                select: { id: true, id_trabajador: true, nombre_completo: true },
            });
            trabajadores.forEach((t) => {
                nameByCode.set(t.id, t.nombre_completo);
                if (t.id_trabajador) nameByCode.set(t.id_trabajador, t.nombre_completo);
            });
        }
        const enrichedItems = items.map((i) => ({
            ...i,
            trabajador_nombre: (i.trabajador_id && nameByCode.get(i.trabajador_id)) || null,
        }));

        return { items: enrichedItems, total, counts };
    }

    async findOne(id: string) {
        return this.prisma.programacion.findUnique({
            where: { id },
            include: { gastos: { orderBy: { creado_en: 'asc' } } },
        });
    }

    // Normaliza un gasto del frontend a la forma de la BD, denormalizando chofer/vehículo
    // desde la operación para poder listarlo luego en los módulos de Peaje/Combustible.
    private normalizeGasto(g: any, op: { id: string; trabajador_id?: string | null; vehiculo_id?: string | null }, tenantId: string) {
        return {
            programacion_id: op.id,
            tipo: String(g.tipo || 'OTRO'),
            monto: g.monto != null && g.monto !== '' ? Number(g.monto) : 0,
            fecha: g.fecha ? new Date(g.fecha) : null,
            descripcion: g.descripcion || null,
            numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
            comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes.filter(Boolean) : [],
            trabajador_id: op.trabajador_id || null,
            targa: op.vehiculo_id || null,
            tenant_id: tenantId,
        };
    }

    // Lista los gastos de un tipo (PEAJE/COMBUSTIBLE) del tenant, para reflejarlos en
    // los módulos respectivos. Incluye datos de la operación de origen.
    async findGastosByTipo(tenantId: string, tipo: string) {
        return this.prisma.gastoOperacion.findMany({
            where: { tenant_id: tenantId, tipo },
            orderBy: { fecha: 'desc' },
            include: { programacion: { select: { id: true, id_programacion: true, cliente: true } } },
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
        // `gastos` es una relación (array de objetos), no una columna: se maneja aparte.
        const { gastos, ...rest } = data;
        // Scope the new record to the caller's tenant (from the JWT). Fall back to
        // the first tenant only if no auth context is available (legacy callers).
        const resolvedTenant = tenantId
            || data.tenant_id
            || (await this.prisma.tenant.findFirst())?.id;

        const created = await this.prisma.programacion.create({
            data: {
                ...rest,
                // `fecha` es requerida en el modelo pero los clientes (app y web) sólo
                // envían fecha_retiro/fecha_entrega. La derivamos para no fallar el create.
                fecha: data.fecha || data.fecha_retiro || data.fecha_entrega || new Date(),
                // El default del modelo es 'PENDING' (inglés) pero los clientes usan
                // estados en español (PENDIENTE/RETIRADO/ENTREGADO...). Alineamos.
                estado: data.estado || 'PENDIENTE',
                tenant_id: resolvedTenant
            }
        });

        if (Array.isArray(gastos) && gastos.length) {
            await this.prisma.gastoOperacion.createMany({
                data: gastos.map((g) => this.normalizeGasto(g, created, resolvedTenant)),
            });
        }
        return this.findOne(created.id);
    }

    async update(id: string, data: any) {
        // Separamos los gastos (relación) del resto de columnas.
        const { gastos, ...rest } = data;
        const updated = await this.prisma.programacion.update({
            where: { id },
            data: rest,
        });

        // Si el cliente envía `gastos`, reemplazamos la lista completa de la operación.
        if (gastos !== undefined) {
            await this.prisma.$transaction([
                this.prisma.gastoOperacion.deleteMany({ where: { programacion_id: id } }),
                ...(Array.isArray(gastos) && gastos.length
                    ? [this.prisma.gastoOperacion.createMany({
                        data: gastos.map((g) => this.normalizeGasto(g, updated, updated.tenant_id)),
                    })]
                    : []),
            ]);
        }
        return this.findOne(id);
    }

    async remove(id: string, tenantId: string) {
        // Scoped by tenant: only delete records belonging to the caller's tenant
        return this.prisma.programacion.deleteMany({
            where: { id, tenant_id: tenantId },
        });
    }
}
