
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { GASTO_SYNC_SELECT, aplicarPlanGastos, planificarSyncGastos } from '../../common/gastos-sync.util';
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
        opts: { from?: string; to?: string; q?: string; estados?: string[]; skip?: number; take?: number; ownerIds?: string[]; spedizione?: string; trabajadorId?: string } = {},
    ) {
        const { from, to, q, estados, skip = 0, take = 60, ownerIds, spedizione, trabajadorId } = opts;

        // Base scope: always the caller's tenant, plus optional date window + search.
        const baseWhere: Prisma.ProgramacionWhereInput = { tenant_id: tenantId };
        // Owner scoping: restricted users only see their own trabajador's rows.
        // Aceptamos UUID (nuevo) y código legacy para tolerar data no migrada.
        if (ownerIds?.length) baseWhere.trabajador_id = { in: ownerIds };
        // Filtro explícito por trabajador (además/en vez del owner scoping de choferes).
        if (trabajadorId) baseWhere.trabajador_id = trabajadorId;
        if (spedizione) baseWhere.spedizione = spedizione;
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
        const [costo_chofer, ingreso_sugerido, paradas_recorrido] = await Promise.all([
            this.costoChofer(op),
            this.ingresoSugerido(op),
            this.paradasDeRuta(op),
        ]);
        return { ...op, costo_chofer, ingreso_sugerido, paradas_recorrido };
    }

    // Paradas del recorrido MÁS RECIENTE ligado a esta operación, con su km/min real
    // de GPS por tramo (RecorridoParada.km_tramo/min_tramo) — para comparar tramo a
    // tramo contra lo que reporta el cliente. null si el chofer nunca usó "Mi Ruta".
    private async paradasDeRuta(op: { id: string; tenant_id: string }) {
        const recorrido = await this.prisma.recorrido.findFirst({
            where: { tenant_id: op.tenant_id, programacion_id: op.id },
            orderBy: { iniciado_en: 'desc' },
            select: {
                paradas: {
                    orderBy: { orden: 'asc' },
                    select: { id: true, orden: true, label: true, es_retorno: true, llegada_en: true, entregado: true, km_tramo: true, min_tramo: true },
                },
            },
        });
        return recorrido?.paradas ?? null;
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
                    compactado: true, destinos: true, destinos_detalle: true,
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

        // Una "compactada" (op.compactado) son 2+ entregas REALES de clientes
        // distintos hechas en un solo viaje (ej: aeropuerto=AB 50km, San Miguel=DHL
        // 100km) — no un mandado aparte. El reporte tiene que desglosarlas en una
        // fila POR ENTREGA (cada una con su propio cliente/spedizione/km/ingreso)
        // para poder cruzarlas contra lo que reporta cada cliente por separado.
        // El costo del chofer (Gastado) es del viaje completo, no se puede repartir
        // con criterio real — se muestra UNA sola vez, en la fila principal, para
        // que sumar la columna no infle el total ni lo duplique.
        const items = ops.flatMap((op, i) => {
            const costoTotal = costos[i].total;
            const veh = op.vehiculo_id ? vehiculoByCode.get(op.vehiculo_id) : undefined;
            const trabajadorNombre = (op.trabajador_id && nombreByCode.get(op.trabajador_id)) || null;

            // Ingreso REAL guardado por el supervisor. null = aún no lo llenó (no se
            // rellena con el sugerido: eso es una decisión manual de la operación).
            const ingresoPrincipal = op.ingreso_estimado != null ? op.ingreso_estimado : null;
            const rentabilidadPrincipal = ingresoPrincipal != null ? round2(ingresoPrincipal - costoTotal) : null;
            const rentabilidadPctPrincipal = ingresoPrincipal
                ? round2(((rentabilidadPrincipal as number) / ingresoPrincipal) * 100) : null;

            const filaPrincipal = {
                id: op.id,
                fecha: op.fecha,
                cliente: op.cliente,
                spedizione: op.spedizione,
                lugar_entrega: op.lugar_entrega,
                vehiculo_placa: veh?.placa ?? op.vehiculo_id ?? null,
                vehiculo_categoria: veh?.categoria ?? null,
                trabajador_nombre: trabajadorNombre,
                km_facturable: op.km_facturable ?? null,
                ingreso: ingresoPrincipal,
                costo_chofer: costoTotal,
                rentabilidad: rentabilidadPrincipal,
                rentabilidad_pct: rentabilidadPctPrincipal,
                compactado: !!op.compactado,
            };

            const destinosArr = Array.isArray(op.destinos) ? op.destinos : [];
            const detalleArr: any[] = Array.isArray(op.destinos_detalle) ? op.destinos_detalle : [];
            if (!op.compactado || !detalleArr.length) return [filaPrincipal];

            const filasExtra = detalleArr
                .map((d, idx) => {
                    if (!d || (d.km_facturable == null && d.ingreso == null && !d.cliente && !d.spedizione)) return null;
                    const ingresoD = d.ingreso != null ? Number(d.ingreso) : null;
                    return {
                        id: `${op.id}-c${idx + 1}`,
                        fecha: op.fecha,
                        cliente: d.cliente || op.cliente,
                        spedizione: d.spedizione || op.spedizione,
                        lugar_entrega: destinosArr[idx] || op.lugar_entrega,
                        vehiculo_placa: veh?.placa ?? op.vehiculo_id ?? null,
                        vehiculo_categoria: veh?.categoria ?? null,
                        trabajador_nombre: trabajadorNombre,
                        km_facturable: d.km_facturable != null ? Number(d.km_facturable) : null,
                        ingreso: ingresoD,
                        costo_chofer: 0,
                        rentabilidad: null as number | null,
                        rentabilidad_pct: null as number | null,
                        compactado: true,
                    };
                })
                .filter((f): f is NonNullable<typeof f> => f !== null);

            return [filaPrincipal, ...filasExtra];
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
    private async ingresoSugerido(op: { vehiculo_id?: string | null; km_facturable?: number | null; spedizione?: string | null; es_navetta?: boolean | null; tenant_id: string }) {
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
            // Sin fecha propia usa la de la operación, para que ordene con su fecha en los
            // módulos. Último respaldo: HOY (nunca null — un gasto sin fecha quedaba fuera
            // de cualquier filtro por rango en Peajes/Combustible y "desaparecía").
            fecha: g.fecha ? new Date(g.fecha) : (op.fecha_entrega || op.fecha_retiro || op.fecha || new Date()),
            fecha_explicita: !!g.fecha,
            descripcion: g.descripcion || null,
            numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
            link_peaje: g.tipo === 'PEAJE' ? (g.link_peaje || null) : null,
            comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes.filter(Boolean) : [],
            // Por defecto lo paga el chofer (comportamiento histórico). Solo es false
            // cuando se marca explícitamente como pagado por la empresa (mancato/código).
            pagado_por_chofer: g.pagado_por_chofer !== false,
            // Parada del recorrido de la que salió (la app nueva lo manda; null si es manual).
            parada_id: typeof g.parada_id === 'string' && g.parada_id ? g.parada_id : null,
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

    /**
     * Sustento posterior de un gasto de operación (pedido de Gamonal, audio 2026-09-03):
     * el chofer suele registrar el peaje/combustible sin foto por el apuro, y luego el
     * panel solo le dejaba VER. Aquí puede completar comprobantes (+ nº de mancato y link
     * si es PEAJE) de SUS propios gastos; supervisores/admins de cualquiera del tenant.
     * No permite tocar monto/tipo/estado (eso sigue siendo del supervisor/admin).
     */
    async sustentarGasto(
        gastoId: string,
        tenantId: string,
        user: { soloPropios?: boolean; trabajadorId?: string | null; trabajadorCodigo?: string | null },
        body: { comprobantes?: string[]; numero_mancato?: string | null; link_peaje?: string | null },
    ) {
        const gasto = await this.prisma.gastoOperacion.findFirst({ where: { id: gastoId, tenant_id: tenantId } });
        if (!gasto) throw new NotFoundException('Gasto no encontrado.');
        if (!['PEAJE', 'COMBUSTIBLE'].includes(gasto.tipo)) {
            throw new BadRequestException('Solo se pueden sustentar peajes y combustibles.');
        }
        if (user.soloPropios) {
            const mios = [user.trabajadorId, user.trabajadorCodigo].filter(Boolean);
            if (!gasto.trabajador_id || !mios.includes(gasto.trabajador_id)) {
                throw new ForbiddenException('Solo puedes sustentar tus propios gastos.');
            }
        }
        const data: any = {};
        if (Array.isArray(body.comprobantes)) {
            data.comprobantes = body.comprobantes.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim());
        }
        if (gasto.tipo === 'PEAJE') {
            if (body.numero_mancato !== undefined) data.numero_mancato = String(body.numero_mancato || '').trim() || null;
            if (body.link_peaje !== undefined) data.link_peaje = String(body.link_peaje || '').trim() || null;
        }
        if (!Object.keys(data).length) throw new BadRequestException('Nada que actualizar.');

        const updated = await this.prisma.gastoOperacion.update({ where: { id: gasto.id }, data });

        // Espejo en la parada de origen (RecorridoParada.gastos JSON): si el recorrido
        // sigue activo y se vuelve a consolidar, la parada es la fuente de verdad y
        // pisaría los comprobantes recién agregados. Se actualiza la entrada equivalente.
        if (gasto.parada_id) {
            const parada = await this.prisma.recorridoParada.findFirst({ where: { id: gasto.parada_id, tenant_id: tenantId } });
            if (parada && Array.isArray(parada.gastos)) {
                const clave = (g: any) => `${String(g?.tipo || 'OTRO').toUpperCase()}|${(Number(g?.monto) || 0).toFixed(2)}|${String(g?.numero_mancato || '').trim().toLowerCase()}`;
                const objetivo = clave({ tipo: gasto.tipo, monto: gasto.monto, numero_mancato: gasto.numero_mancato });
                let hecho = false;
                const gastos = (parada.gastos as any[]).map((g) => {
                    if (hecho || clave(g) !== objetivo) return g;
                    hecho = true;
                    return { ...g, ...data };
                });
                if (hecho) await this.prisma.recorridoParada.update({ where: { id: parada.id }, data: { gastos } });
            }
        }
        return updated;
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

    // Si viene destinos_facturacion (un desglose por CADA destino de la operación,
    // principal incluido — índice 0 = lugar_entrega, índice i = destinos[i-1]),
    // km_facturable/ingreso_estimado dejan de ser lo que se escribió antes y pasan a
    // ser la SUMA del desglose. Es una recomputación PURA a partir del arreglo (no
    // incremental sobre el valor guardado), a propósito: así guardar dos veces
    // seguidas nunca duplica el total. Si no viene el arreglo (operación de un solo
    // destino, caso de siempre), no se toca nada — financiero()/costoChofer()/
    // reportes siguen leyendo un solo total por operación sin enterarse de que por
    // dentro puede haber varios destinos.
    private aplicarDestinosFacturacion(data: any) {
        if (!data || !Array.isArray(data.destinos_facturacion)) return data;
        const entradas = data.destinos_facturacion;
        const conValor = entradas.some((e: any) => e && (e.km_facturable != null || e.ingreso != null));
        if (!conValor) return data;
        const round2 = (n: number) => Math.round(n * 100) / 100;
        data.km_facturable = round2(entradas.reduce((s: number, e: any) => s + (Number(e?.km_facturable) || 0), 0));
        data.ingreso_estimado = round2(entradas.reduce((s: number, e: any) => s + (Number(e?.ingreso) || 0), 0));
        return data;
    }

    async create(data: any, tenantId?: string) {
        this.syncEstadosEntrega(data);
        this.aplicarDestinosFacturacion(data);
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
            await aplicarPlanGastos(this.prisma, planificarSyncGastos(
                [],
                gastos.map((g) => this.normalizeGasto(g, created, resolvedTenant)),
                () => false,
            ));
        }
        return this.findOne(created.id);
    }

    async update(id: string, data: any, opts?: { isChofer?: boolean }) {
        this.syncEstadosEntrega(data);
        this.aplicarDestinosFacturacion(data);
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

        // Si el cliente envía `gastos`, la lista del formulario es la lista completa de la
        // operación — pero se aplica por FUSIÓN (no delete+create): un gasto que sigue en la
        // lista conserva su id, su fecha real y el estado de pago/fecha límite que el admin
        // ya marcó en Peajes. Solo se borra lo que el usuario quitó del formulario.
        if (gastos !== undefined) {
            const existentes = await this.prisma.gastoOperacion.findMany({
                where: { programacion_id: id }, select: GASTO_SYNC_SELECT, orderBy: { creado_en: 'asc' },
            });
            const entrantes = Array.isArray(gastos) ? gastos.map((g) => this.normalizeGasto(g, updated, updated.tenant_id)) : [];
            await aplicarPlanGastos(this.prisma, planificarSyncGastos(existentes, entrantes, () => true));
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
