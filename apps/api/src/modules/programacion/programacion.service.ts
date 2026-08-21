
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { num, horasDeRecorrido, tarifasFromTenant, TARIFAS_TENANT_SELECT, TarifasChofer } from '../../common/tarifas-chofer.util';
import { ingresoSugerido, tarifasIngresoFromTenant, TARIFAS_INGRESO_TENANT_SELECT } from '../../common/ingreso-vehiculo.util';

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
        spedizione: true,
        reperibilita: true,
        lugar_retiro: true,
        retiros: true,
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
        attesa_horas: true,
        attesa_estado: true,
        attesa_autorizado_por: true,
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
        const op = await this.prisma.programacion.findUnique({
            where: { id },
            include: { gastos: { orderBy: { creado_en: 'asc' } } },
        });
        if (!op) return op;
        const [costo_chofer, ingreso_sugerido] = await Promise.all([
            this.costoChofer(op),
            this.ingresoSugerido(op),
        ]);
        return { ...op, costo_chofer, ingreso_sugerido };
    }

    // Panel financiero (Fase C): rentabilidad por operación en un período —
    // ingreso REAL (ingreso_estimado guardado, sin fallback al sugerido) menos
    // costo_chofer(). Solo operaciones con mercancía entregada. El controller
    // ya valida req.user.veFinanzas antes de llamar a este método.
    async financiero(
        tenantId: string,
        opts: { from?: string; to?: string; cliente?: string; spedizione?: string; trabajadorId?: string } = {},
    ) {
        const ahora = new Date();
        const desde = opts.from ? new Date(opts.from) : new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
        const hasta = opts.to ? new Date(opts.to) : ahora;

        const where: Prisma.ProgramacionWhereInput = {
            tenant_id: tenantId,
            fecha: { gte: desde, lte: hasta },
            // Consegnato y Entregado son el mismo hecho (ver syncEstadosEntrega):
            // solo entra al panel financiero lo que YA se entregó.
            OR: [{ estado_consegna: 'CONSEGNATO' }, { estado: { in: ['ENTREGADO', 'COMPLETED'] } }],
        };
        if (opts.cliente) where.cliente = { contains: opts.cliente, mode: 'insensitive' };
        if (opts.spedizione) where.spedizione = opts.spedizione;
        if (opts.trabajadorId) where.trabajador_id = opts.trabajadorId;

        const round2 = (n: number) => Math.round(n * 100) / 100;

        const [tenant, ops] = await Promise.all([
            this.prisma.tenant.findUnique({ where: { id: tenantId }, select: TARIFAS_TENANT_SELECT }),
            this.prisma.programacion.findMany({
                where,
                orderBy: { fecha: 'desc' },
                select: {
                    id: true, fecha: true, cliente: true, spedizione: true, lugar_entrega: true,
                    vehiculo_id: true, trabajador_id: true, km_facturable: true, ingreso_estimado: true,
                    reperibilita: true, attesa_estado: true, attesa_horas: true, tenant_id: true,
                    gastos: { select: { monto: true, pagado_por_chofer: true } },
                },
            }),
        ]);
        const tar = tarifasFromTenant(tenant);

        if (!ops.length) {
            return {
                desde, hasta, moneda: tar.moneda,
                resumen: { operaciones: 0, operaciones_con_ingreso: 0, ingreso: 0, costo: 0, rentabilidad: 0, rentabilidad_pct: null as number | null },
                porDia: [] as Array<{ fecha: string; ingreso: number; costo: number; rentabilidad: number; operaciones: number }>,
                items: [] as any[],
            };
        }

        // Resuelve trabajador/vehículo en batch (código o UUID, igual que findAll)
        // para no hacer una consulta por operación.
        const trabajadorCodes = Array.from(new Set(ops.map((o) => o.trabajador_id).filter((c): c is string => !!c)));
        const vehiculoCodes = Array.from(new Set(ops.map((o) => o.vehiculo_id).filter((c): c is string => !!c)));
        const [trabajadores, vehiculos, costos] = await Promise.all([
            trabajadorCodes.length
                ? this.prisma.trabajador.findMany({
                    where: { tenant_id: tenantId, OR: [{ id: { in: trabajadorCodes } }, { id_trabajador: { in: trabajadorCodes } }] },
                    select: { id: true, id_trabajador: true, nombre_completo: true },
                })
                : Promise.resolve([] as { id: string; id_trabajador: string | null; nombre_completo: string }[]),
            vehiculoCodes.length
                ? this.prisma.vehiculo.findMany({
                    where: { OR: [{ id: { in: vehiculoCodes } }, { placa: { in: vehiculoCodes } }] },
                    select: { id: true, placa: true, categoria: true },
                })
                : Promise.resolve([] as { id: string; placa: string; categoria: string | null }[]),
            // costoChofer() sigue haciendo 1 query de Recorrido por operación (no evitable
            // sin rehacer el modelo de datos), pero comparte la misma lectura de Tenant.
            Promise.all(ops.map((op) => this.costoChofer(op, tar))),
        ]);

        const nombreByCode = new Map<string, string>();
        trabajadores.forEach((t) => {
            nombreByCode.set(t.id, t.nombre_completo);
            if (t.id_trabajador) nombreByCode.set(t.id_trabajador, t.nombre_completo);
        });
        const vehiculoByCode = new Map<string, { placa: string; categoria: string | null }>();
        vehiculos.forEach((v) => {
            vehiculoByCode.set(v.id, { placa: v.placa, categoria: v.categoria });
            vehiculoByCode.set(v.placa, { placa: v.placa, categoria: v.categoria });
        });

        const items = ops.map((op, i) => {
            const costoTotal = costos[i].total;
            // Ingreso REAL guardado por el supervisor. null = aún no lo llenó (no se
            // rellena con el sugerido: eso es una decisión manual de la operación).
            const ingreso = op.ingreso_estimado != null ? op.ingreso_estimado : null;
            const rentabilidad = ingreso != null ? round2(ingreso - costoTotal) : null;
            const rentabilidad_pct = ingreso ? round2(((rentabilidad as number) / ingreso) * 100) : null;
            const veh = op.vehiculo_id ? vehiculoByCode.get(op.vehiculo_id) : undefined;
            return {
                id: op.id,
                fecha: op.fecha,
                cliente: op.cliente,
                spedizione: op.spedizione,
                lugar_entrega: op.lugar_entrega,
                vehiculo_placa: veh?.placa ?? op.vehiculo_id ?? null,
                vehiculo_categoria: veh?.categoria ?? null,
                trabajador_nombre: (op.trabajador_id && nombreByCode.get(op.trabajador_id)) || null,
                km_facturable: op.km_facturable ?? null,
                ingreso,
                costo_chofer: costoTotal,
                rentabilidad,
                rentabilidad_pct,
            };
        });

        let sumIngreso = 0, sumCosto = 0, sumRentabilidad = 0, conIngreso = 0;
        const porDiaMap = new Map<string, { fecha: string; ingreso: number; costo: number; rentabilidad: number; operaciones: number }>();
        for (const it of items) {
            sumCosto += it.costo_chofer;
            const key = new Date(it.fecha).toISOString().slice(0, 10);
            if (!porDiaMap.has(key)) porDiaMap.set(key, { fecha: key, ingreso: 0, costo: 0, rentabilidad: 0, operaciones: 0 });
            const d = porDiaMap.get(key)!;
            d.operaciones += 1;
            d.costo += it.costo_chofer;
            if (it.ingreso != null) {
                sumIngreso += it.ingreso;
                sumRentabilidad += it.rentabilidad ?? 0;
                conIngreso += 1;
                d.ingreso += it.ingreso;
                d.rentabilidad += it.rentabilidad ?? 0;
            }
        }

        const porDia = [...porDiaMap.values()]
            .map((d) => ({ ...d, ingreso: round2(d.ingreso), costo: round2(d.costo), rentabilidad: round2(d.rentabilidad) }))
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

        return {
            desde, hasta, moneda: tar.moneda,
            resumen: {
                operaciones: items.length,
                operaciones_con_ingreso: conIngreso,
                ingreso: round2(sumIngreso),
                costo: round2(sumCosto),
                rentabilidad: round2(sumRentabilidad),
                rentabilidad_pct: sumIngreso > 0 ? round2((sumRentabilidad / sumIngreso) * 100) : null,
            },
            porDia,
            items,
        };
    }

    // Ingreso SUGERIDO (no se guarda): km_facturable × factor de la categoría del
    // vehículo asignado. El supervisor lo usa o edita `ingreso_estimado` a mano.
    private async ingresoSugerido(op: { vehiculo_id?: string | null; km_facturable?: number | null; spedizione?: string | null; tenant_id: string }) {
        if (!op.vehiculo_id) return null;
        // El picker de vehículo guarda la PLACA (no el UUID) en `Programacion.vehiculo_id`
        // — igual que `trabajador_id` acepta código o UUID. Toleramos ambos formatos.
        const [vehiculo, tenant] = await Promise.all([
            this.prisma.vehiculo.findFirst({
                where: { tenant_id: op.tenant_id, OR: [{ id: op.vehiculo_id }, { placa: op.vehiculo_id }] },
                select: { categoria: true },
            }),
            this.prisma.tenant.findUnique({ where: { id: op.tenant_id }, select: TARIFAS_INGRESO_TENANT_SELECT }),
        ]);
        return ingresoSugerido(op, vehiculo?.categoria, tarifasIngresoFromTenant(tenant));
    }

    // Costo del chofer de ESTA operación: pago por horas de manejo (día/noche,
    // del recorrido GPS ligado a la operación) + reperibilità (fijo) + attesa
    // AUTORIZADA (€/h, solo si es ≥1h, misma regla que el resumen mensual) +
    // gastos de ruta que pagó el chofer de su bolsillo. Es el lado "Gastado" de
    // la rentabilidad (contraparte del "Ingreso" por km facturado al cliente).
    // `tarPrecalculada` permite a `financiero()` reusar UNA lectura de Tenant
    // para muchas operaciones en vez de repetirla por cada una (evita N+1).
    private async costoChofer(
        op: { id: string; tenant_id: string; reperibilita?: boolean | null; attesa_estado?: string | null; attesa_horas?: any; gastos?: Array<{ monto: any; pagado_por_chofer?: boolean | null }> },
        tarPrecalculada?: TarifasChofer,
    ) {
        const [tenant, recorrido] = await Promise.all([
            tarPrecalculada ? Promise.resolve(null) : this.prisma.tenant.findUnique({ where: { id: op.tenant_id }, select: TARIFAS_TENANT_SELECT }),
            this.prisma.recorrido.findFirst({
                where: { tenant_id: op.tenant_id, programacion_id: op.id },
                orderBy: { iniciado_en: 'desc' },
                select: { iniciado_en: true, llegada_en: true, retorno_en: true, finalizado_en: true, descanso_min: true },
            }),
        ]);
        const tar = tarPrecalculada ?? tarifasFromTenant(tenant);

        const { horasDia, horasNoche } = recorrido
            ? horasDeRecorrido(recorrido, tar.corte)
            : { horasDia: 0, horasNoche: 0 };
        const pagoHoras = Math.round((horasDia * tar.giorno + horasNoche * tar.notte) * 100) / 100;

        const reperibilita = !!op.reperibilita;
        const pagoReperibilita = reperibilita ? tar.reperibilita : 0;

        const attesaHoras = num(op.attesa_horas);
        const attesaAutorizada = op.attesa_estado === 'AUTORIZADO' && attesaHoras >= 1;
        const pagoAttesa = attesaAutorizada ? Math.round(attesaHoras * tar.attesaHora * 100) / 100 : 0;

        const gastosChofer = Math.round(
            (op.gastos || []).reduce((s, g) => s + (g.pagado_por_chofer !== false ? num(g.monto) : 0), 0) * 100,
        ) / 100;

        const total = Math.round((pagoHoras + pagoReperibilita + pagoAttesa + gastosChofer) * 100) / 100;

        return {
            horas_dia: horasDia, horas_noche: horasNoche, pago_horas: pagoHoras,
            reperibilita, pago_reperibilita: pagoReperibilita,
            attesa_horas: attesaHoras, attesa_autorizada: attesaAutorizada, pago_attesa: pagoAttesa,
            gastos_chofer: gastosChofer,
            total, moneda: tar.moneda,
        };
    }

    // Normaliza un gasto del frontend a la forma de la BD, denormalizando chofer/vehículo
    // desde la operación para poder listarlo luego en los módulos de Peaje/Combustible.
    private normalizeGasto(g: any, op: { id: string; trabajador_id?: string | null; vehiculo_id?: string | null; fecha?: Date | null; fecha_retiro?: Date | null; fecha_entrega?: Date | null }, tenantId: string) {
        return {
            programacion_id: op.id,
            tipo: String(g.tipo || 'OTRO'),
            monto: g.monto != null && g.monto !== '' ? Number(g.monto) : 0,
            // Sin fecha propia usa la de la operación, para que ordene con su fecha en los módulos.
            fecha: g.fecha ? new Date(g.fecha) : (op.fecha_entrega || op.fecha_retiro || op.fecha || null),
            descripcion: g.descripcion || null,
            numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
            link_peaje: g.tipo === 'PEAJE' ? (g.link_peaje || null) : null,
            comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes.filter(Boolean) : [],
            // Por defecto lo paga el chofer (comportamiento histórico). Solo es false
            // cuando se marca explícitamente como pagado por la empresa (mancato/código).
            pagado_por_chofer: g.pagado_por_chofer !== false,
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

    // Consegnato y Entregado son EL MISMO hecho (mercancía entregada). Hay dos
    // estados —uno "manual" (estado_consegna) y otro "principal" (estado)— y a
    // veces se actualiza uno y se olvida el otro, quedando desincronizados. Al
    // guardar, si uno marca "entregado" sincronizamos el otro automáticamente.
    private syncEstadosEntrega(data: any) {
        if (!data) return data;
        const consegna = String(data.estado_consegna || '').toUpperCase();
        const estado = String(data.estado || '').toUpperCase();
        if (consegna === 'CONSEGNATO') data.estado = 'ENTREGADO';
        else if (estado === 'ENTREGADO') data.estado_consegna = 'CONSEGNATO';
        return data;
    }

    async create(data: any, tenantId?: string) {
        this.syncEstadosEntrega(data);
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

    async update(id: string, data: any, opts?: { isChofer?: boolean }) {
        this.syncEstadosEntrega(data);
        // Separamos los gastos (relación) del resto de columnas.
        const { gastos, ...rest } = data;
        // La autorización de la attesa (estado/quién autorizó) NO se cambia por el
        // PATCH genérico: solo por el endpoint dedicado del supervisor.
        delete rest.attesa_estado;
        delete rest.attesa_autorizado_por;
        // Si se editan las horas de attesa, vuelve a requerir autorización del
        // supervisor (queda PENDIENTE) — lo edite el chofer o el propio supervisor.
        if (rest.attesa_horas !== undefined) {
            rest.attesa_horas = Number(rest.attesa_horas) || 0;
            rest.attesa_estado = 'PENDIENTE';
            rest.attesa_autorizado_por = null;
        }
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

    // Autoriza o rechaza la attesa declarada. Solo lo llama el supervisor (el
    // controller lo restringe). Puede corregir las horas en el mismo paso.
    async autorizarAttesa(id: string, tenantId: string, body: { estado: string; horas?: number; usuarioId?: string }) {
        const estado = String(body.estado || '').toUpperCase();
        if (!['AUTORIZADO', 'DENEGADO'].includes(estado)) {
            throw new BadRequestException('Estado inválido: usa AUTORIZADO o DENEGADO.');
        }
        const existente = await this.prisma.programacion.findFirst({ where: { id, tenant_id: tenantId } });
        if (!existente) throw new NotFoundException('Operación no encontrada.');
        const data: any = { attesa_estado: estado, attesa_autorizado_por: body.usuarioId || null };
        if (body.horas !== undefined) data.attesa_horas = Number(body.horas) || 0;
        await this.prisma.programacion.update({ where: { id }, data });
        return this.findOne(id);
    }

    async remove(id: string, tenantId: string) {
        // Scoped by tenant: only delete records belonging to the caller's tenant
        return this.prisma.programacion.deleteMany({
            where: { id, tenant_id: tenantId },
        });
    }
}
