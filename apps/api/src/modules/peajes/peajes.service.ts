import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { fechaLimitePago } from '../../common/plazo-pago.util';

@Injectable()
export class PeajesService {
    constructor(private prisma: PrismaService) { }

    async create(data: any, tenantId: string) {
        // Peaje vinculado a una operación: NO se guarda como peaje suelto sino como
        // gasto de esa operación (GastoOperacion tipo PEAJE). Así entra al costo de
        // la ruta, al panel financiero y al reporte mensual — igual que si el
        // supervisor lo hubiera cargado desde el formulario de la operación.
        // Es lo que faltaba: los peajes "olvidados" se registraban desde Peajes y
        // quedaban sueltos, sin trazabilidad hacia la entrega.
        if (data.programacion_id) {
            return this.crearGastoDeOperacion(data, data.programacion_id, tenantId);
        }
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
                // Sin límite explícito: fecha + 14 días (regla de la empresa).
                fecha_limite_pago: data.fecha_limite_pago
                    ? new Date(data.fecha_limite_pago)
                    : fechaLimitePago(data.fecha),
                tenant_id: tenantId,
            }
        });
    }

    // Crea un GastoOperacion tipo PEAJE colgado de una operación, con los mismos
    // defaults que usa Operaciones (fecha de la op si no viene, límite +14, etc.).
    private async crearGastoDeOperacion(data: any, programacionId: string, tenantId: string) {
        const op = await this.prisma.programacion.findFirst({
            where: { id: programacionId, tenant_id: tenantId },
            select: { id: true, trabajador_id: true, vehiculo_id: true, fecha: true, fecha_retiro: true, fecha_entrega: true },
        });
        if (!op) throw new NotFoundException('La operación indicada no existe.');
        const fecha: Date = data.fecha ? new Date(data.fecha) : (op.fecha_entrega || op.fecha_retiro || op.fecha || new Date());
        const gasto = await this.prisma.gastoOperacion.create({
            data: {
                programacion_id: op.id,
                tipo: 'PEAJE',
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : 0,
                fecha,
                descripcion: data.comentarios || null,
                numero_mancato: data.id_multa || data.numero_mancato || null,
                link_peaje: data.link_peaje || null,
                comprobantes: Array.isArray(data.comprobantes) ? data.comprobantes.filter(Boolean) : (data.archivo ? [data.archivo] : []),
                estado: data.estado && data.estado !== 'PENDIENTE' ? data.estado : null,
                fecha_limite_pago: data.fecha_limite_pago ? new Date(data.fecha_limite_pago) : fechaLimitePago(fecha),
                // Registrado por el supervisor desde Peajes: por defecto lo paga el
                // chofer (histórico), salvo que se marque como mancato de la empresa.
                pagado_por_chofer: data.pagado_por_chofer !== false,
                // Prioridad: chofer/placa de la operación (fuente de verdad del viaje).
                trabajador_id: op.trabajador_id || data.trabajador_id || null,
                targa: op.vehiculo_id || data.targa || null,
                tenant_id: tenantId,
            },
        });
        // Misma forma que devuelve findAll para las filas de operación.
        return { ...gasto, id: `gasto:${gasto.id}`, _origen: 'operacion', programacion_id: op.id };
    }

    // Vincula un peaje SUELTO (tabla Peaje) a una operación: lo migra a
    // GastoOperacion y borra el suelto. Idempotente por diseño: si el id ya es
    // "gasto:…" es que ya está vinculado.
    async vincular(id: string, programacionId: string, tenantId: string) {
        if (!programacionId) throw new BadRequestException('Falta la operación a vincular.');
        if (id.startsWith('gasto:')) {
            // Ya es un gasto de operación: solo se permite moverlo de operación.
            const gastoId = id.slice('gasto:'.length);
            const op = await this.prisma.programacion.findFirst({ where: { id: programacionId, tenant_id: tenantId }, select: { id: true, trabajador_id: true, vehiculo_id: true } });
            if (!op) throw new NotFoundException('La operación indicada no existe.');
            const r = await this.prisma.gastoOperacion.updateMany({
                where: { id: gastoId, tenant_id: tenantId, tipo: 'PEAJE' },
                data: { programacion_id: op.id, trabajador_id: op.trabajador_id || undefined, targa: op.vehiculo_id || undefined },
            });
            if (!r.count) throw new NotFoundException('El peaje no existe.');
            return { ok: true, id, programacion_id: op.id, movido: true };
        }
        const peaje = await this.prisma.peaje.findFirst({ where: { id, tenant_id: tenantId } });
        if (!peaje) throw new NotFoundException('El peaje no existe.');
        const creado = await this.crearGastoDeOperacion({
            monto: peaje.monto, fecha: peaje.fecha, comentarios: peaje.comentarios,
            id_multa: peaje.id_multa, archivo: peaje.archivo, estado: peaje.estado,
            fecha_limite_pago: peaje.fecha_limite_pago, trabajador_id: peaje.trabajador_id, targa: peaje.targa,
        }, programacionId, tenantId);
        await this.prisma.peaje.delete({ where: { id: peaje.id } });
        return { ok: true, id: creado.id, programacion_id: programacionId, migrado: true };
    }

    // Operaciones recientes para el selector "Vincular a operación". Se ordenan
    // por cercanía a la fecha del peaje (si viene) y se pueden acotar por
    // chofer/placa, que es como el supervisor identifica el viaje.
    async operacionesCandidatas(tenantId: string, opts: { trabajadorId?: string; targa?: string; fecha?: string; q?: string; take?: number }) {
        const take = Math.min(Math.max(opts.take || 30, 1), 100);
        const where: Prisma.ProgramacionWhereInput = { tenant_id: tenantId };
        if (opts.trabajadorId) where.trabajador_id = opts.trabajadorId;
        if (opts.targa) where.vehiculo_id = { contains: opts.targa, mode: 'insensitive' };
        if (opts.q) where.OR = [
            { cliente: { contains: opts.q, mode: 'insensitive' } },
            { lugar_entrega: { contains: opts.q, mode: 'insensitive' } },
            { id_programacion: { contains: opts.q, mode: 'insensitive' } },
        ];
        // Ventana: ±30 días alrededor de la fecha del peaje; sin fecha, los últimos 60 días.
        const centro = opts.fecha ? new Date(opts.fecha) : new Date();
        const ms = 24 * 60 * 60 * 1000;
        where.fecha = opts.fecha
            ? { gte: new Date(centro.getTime() - 30 * ms), lte: new Date(centro.getTime() + 30 * ms) }
            : { gte: new Date(centro.getTime() - 60 * ms) };
        const ops = await this.prisma.programacion.findMany({
            where,
            orderBy: { fecha: 'desc' },
            take,
            select: { id: true, fecha: true, cliente: true, lugar_entrega: true, vehiculo_id: true, trabajador_id: true, estado_consegna: true, spedizione: true },
        });
        // Nombre del chofer (id UUID o código legacy).
        const codes = Array.from(new Set(ops.map((o) => o.trabajador_id).filter((c): c is string => !!c)));
        const nameByCode = new Map<string, string>();
        if (codes.length) {
            const ts = await this.prisma.trabajador.findMany({
                where: { tenant_id: tenantId, OR: [{ id: { in: codes } }, { id_trabajador: { in: codes } }] },
                select: { id: true, id_trabajador: true, nombre_completo: true },
            });
            ts.forEach((t) => { nameByCode.set(t.id, t.nombre_completo); if (t.id_trabajador) nameByCode.set(t.id_trabajador, t.nombre_completo); });
        }
        return ops.map((o) => ({ ...o, trabajador_nombre: (o.trabajador_id && nameByCode.get(o.trabajador_id)) || null }));
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
        // PAGO BONIFICO, VENCIDO, OBSERVACIÓN, …). Los agrupamos en 4 buckets para
        // que las pestañas Pendiente/Observado/Pagado/Anulado sumen bien.
        // OBSERVADO = peajes que por algún motivo no se pueden pagar todavía (el admin
        // los aparta para no mezclarlos con lo pendiente normal). Desconocido → Pendiente.
        const PAGADO_VALS = ['PAGADO', 'PAGADO POR AUTISTA', 'PAGO BONIFICO'];
        const ANULADO_VALS = ['ANULADO'];
        const OBSERVADO_VALS = ['OBSERVADO', 'OBSERVACIÓN', 'OBSERVACION'];
        const NO_PENDIENTE_VALS = [...PAGADO_VALS, ...ANULADO_VALS, ...OBSERVADO_VALS];
        const bucketOf = (e?: string | null): 'PAGADO' | 'ANULADO' | 'OBSERVADO' | 'PENDIENTE' => {
            const v = (e || '').trim().toUpperCase();
            if (PAGADO_VALS.includes(v)) return 'PAGADO';
            if (ANULADO_VALS.includes(v)) return 'ANULADO';
            if (OBSERVADO_VALS.includes(v)) return 'OBSERVADO';
            return 'PENDIENTE';
        };

        const itemsWhere: Prisma.PeajeWhereInput = { ...baseWhere };
        if (estado === 'PAGADO') itemsWhere.estado = { in: PAGADO_VALS };
        else if (estado === 'ANULADO') itemsWhere.estado = { in: ANULADO_VALS };
        else if (estado === 'OBSERVADO') itemsWhere.estado = { in: OBSERVADO_VALS };
        else if (estado === 'PENDIENTE') {
            // Pendiente = todo lo que no es pagado, anulado ni observado (incluye null).
            // Vía AND para no pisar el OR de búsqueda que pueda venir en baseWhere.
            itemsWhere.AND = [{ OR: [{ estado: { notIn: NO_PENDIENTE_VALS } }, { estado: null }] }];
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
        else if (estado === 'OBSERVADO') gastoItemsWhere.estado = { in: OBSERVADO_VALS };
        else if (estado === 'PENDIENTE') {
            gastoItemsWhere.AND = [{ OR: [{ estado: { notIn: NO_PENDIENTE_VALS } }, { estado: null }] }];
        }

        // Traemos los peajes nativos + gastos que matchean el filtro (sin paginar) para
        // poder fusionarlos y paginar el conjunto combinado en memoria.
        const nativeSelect = {
            id: true, targa: true, estado: true, comentarios: true, fecha: true, hora: true, tipo: true, monto: true,
            archivo: true, id_multa: true, recibo_pago: true, fecha_recepcion: true, fecha_limite_pago: true,
            trabajador_id: true,
            // Cuándo se subió el peaje al sistema (el admin da 48 h para subirlos).
            creado_en: true,
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
            trabajador_id: g.trabajador_id || null,
            // false = peaje MANCATO (lo paga la empresa, no se descuenta al chofer).
            pagado_por_chofer: g.pagado_por_chofer !== false,
            fecha: g.fecha,
            fecha_recepcion: g.fecha,
            fecha_limite_pago: g.fecha_limite_pago || null,
            creado_en: g.creado_en,
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

        // Nombre del AUTISTA (conductor) para la página actual: el trabajador_id puede
        // venir como UUID (nuevo) o como código legacy; resolvemos ambos. Solo para los
        // items visibles (evita traer nombres de toda la lista).
        const codes = Array.from(new Set(items.map((i: any) => i.trabajador_id).filter((c: any): c is string => !!c)));
        const nameByCode = new Map<string, string>();
        if (codes.length) {
            const ts = await this.prisma.trabajador.findMany({
                where: { tenant_id: tenantId, OR: [{ id: { in: codes } }, { id_trabajador: { in: codes } }] },
                select: { id: true, id_trabajador: true, nombre_completo: true },
            });
            ts.forEach((t) => {
                nameByCode.set(t.id, t.nombre_completo);
                if (t.id_trabajador) nameByCode.set(t.id_trabajador, t.nombre_completo);
            });
        }
        const itemsConAutista = items.map((i: any) => ({
            ...i,
            autista: (i.trabajador_id && nameByCode.get(i.trabajador_id)) || i.trabajador_id || null,
        }));

        // groupBy cast to any: its `having` mapped type trips a known TS2615.
        const grouped: Array<{ estado: string | null; _count: { _all: number } }> =
            await (this.prisma.peaje.groupBy as any)({
                by: ['estado'],
                where: baseWhere,
                _count: { _all: true },
            });
        const counts: Record<string, number> = { Todos: 0, PENDIENTE: 0, OBSERVADO: 0, PAGADO: 0, ANULADO: 0 };
        grouped.forEach((g) => {
            counts.Todos += g._count._all;
            counts[bucketOf(g.estado)] += g._count._all;
        });
        gastosParaContar.forEach((g) => {
            counts.Todos += 1;
            counts[bucketOf(g.estado)] += 1;
        });

        return { items: itemsConAutista, total, counts };
    }

    async update(id: string, data: any, tenantId?: string) {
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
        // Si cambia la fecha y el registro aún no tiene límite, se calcula (fecha +
        // 14). Un límite ya guardado no se pisa: pudo haberlo corregido el admin.
        let limiteAuto: Date | null | undefined;
        if (data.fecha && data.fecha_limite_pago === undefined) {
            const actual = await this.prisma.peaje.findFirst({
                where: tenantId ? { id, tenant_id: tenantId } : { id },
                select: { fecha_limite_pago: true },
            });
            if (actual && !actual.fecha_limite_pago) limiteAuto = fechaLimitePago(data.fecha);
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
                fecha_limite_pago: data.fecha_limite_pago ? new Date(data.fecha_limite_pago) : (limiteAuto ?? undefined),
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.peaje.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
