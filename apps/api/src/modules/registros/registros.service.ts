import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

// Un parte cruza el corte 19:00 (p. ej. 14:00→02:00): por eso las horas se
// registran en DOS campos y la ganancia SUMA ambos tramos con su tarifa.
function num(v: any): number {
    if (v === null || v === undefined || v === '') return 0;
    // Number() maneja number, string numérico y Prisma.Decimal (que es un objeto).
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// Los partes son "de un día": se guardan como medianoche UTC. Las ventanas de
// mes se construyen en UTC para no perder registros por el desfase horario.
function inicioMesUTC(anio: number, mes1a12: number): Date {
    return new Date(Date.UTC(anio, mes1a12 - 1, 1));
}

// Offset (min) que hay que sumar a un instante UTC para obtener la hora de pared
// en Italia (Europe/Rome). Maneja horario de verano (DST) automáticamente.
function offsetRomaMin(d: Date): number {
    const p = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d).reduce((a: any, x) => { a[x.type] = x.value; return a; }, {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second);
    return Math.round((asUTC - d.getTime()) / 60000);
}

// Reparte el tramo [start, end] en minutos de DÍA (06:00–19:00) y NOCHE (resto),
// en hora italiana. El pago diurno/nocturno depende de esto.
function minutosDiaNoche(start?: Date | null, end?: Date | null): { dia: number; noche: number } {
    if (!start || !end || end.getTime() <= start.getTime()) return { dia: 0, noche: 0 };
    const off = offsetRomaMin(start) * 60000; // offset ~constante en el tramo (DST a mitad de ruta: despreciable)
    let dia = 0, noche = 0;
    for (let t = start.getTime(); t < end.getTime(); t += 60000) {
        const h = new Date(t + off).getUTCHours();
        if (h >= 6 && h < 19) dia += 1; else noche += 1;
    }
    return { dia, noche };
}

@Injectable()
export class RegistrosService {
    constructor(private prisma: PrismaService) { }

    private normalizarOperacion(v: any): string {
        const s = (v || 'DHL').toString().trim().toUpperCase();
        return s === 'FARMACIA' ? 'FARMACIA' : 'DHL';
    }

    // Tarifas de la empresa (diurna/nocturna). Con defaults por si el registro es viejo.
    private async tarifas(tenantId: string) {
        const t = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { tarifa_ore_giorno: true, tarifa_ore_notte: true, hora_corte_notte: true, moneda: true },
        });
        return {
            giorno: num(t?.tarifa_ore_giorno ?? 10),
            notte: num(t?.tarifa_ore_notte ?? 12),
            corte: t?.hora_corte_notte ?? 19,
            moneda: t?.moneda ?? 'EUR',
        };
    }

    // Ganancia de un parte = horas diurnas × tarifa diurna + horas nocturnas × tarifa nocturna.
    private ganancia(reg: { ore_mattina: number | null; ore_sera: number | null }, tar: { giorno: number; notte: number }) {
        return Math.round((num(reg.ore_mattina) * tar.giorno + num(reg.ore_sera) * tar.notte) * 100) / 100;
    }

    private buildData(data: any): Prisma.RegistroServicioUncheckedCreateInput | any {
        return {
            trabajador_id: data.trabajador_id,
            vehiculo_id: data.vehiculo_id || null,
            targa: data.targa || null,
            fecha: data.fecha ? new Date(data.fecha) : new Date(),
            operacion: this.normalizarOperacion(data.operacion),
            km: data.km !== undefined && data.km !== '' ? num(data.km) : 0,
            ore_mattina: data.ore_mattina !== undefined && data.ore_mattina !== '' ? num(data.ore_mattina) : 0,
            ore_sera: data.ore_sera !== undefined && data.ore_sera !== '' ? num(data.ore_sera) : 0,
            ore_attesa: data.ore_attesa !== undefined && data.ore_attesa !== '' ? num(data.ore_attesa) : 0,
            repibilita: data.repibilita === true || data.repibilita === 'true' || data.repibilita === 'SI',
            consegna_realizada: data.consegna_realizada === undefined
                ? true
                : (data.consegna_realizada === true || data.consegna_realizada === 'true' || data.consegna_realizada === 'SI'),
            citta_destino: data.citta_destino || null,
            cliente: data.cliente || null,
            spedizione: data.spedizione || null,
            comentario: data.comentario || null,
            foto_bolla: data.foto_bolla || null,
        };
    }

    async create(data: any, ctx: { tenantId: string; forceTrabajadorId?: string }) {
        const trabajador_id = ctx.forceTrabajadorId ?? data.trabajador_id;
        if (!trabajador_id) throw new BadRequestException('Falta el trabajador del parte.');

        const reg = await this.prisma.registroServicio.create({
            data: { ...this.buildData({ ...data, trabajador_id }), tenant_id: ctx.tenantId },
        });
        const tar = await this.tarifas(ctx.tenantId);
        return { ...reg, ganancia: this.ganancia(reg, tar) };
    }

    async findAll(
        tenantId: string,
        opts: { operacion?: string; anio?: number; mes?: number; trabajadorId?: string; q?: string; skip?: number; take?: number; ownerTrabajadorId?: string } = {},
    ) {
        const { operacion, anio, mes, trabajadorId, q, skip = 0, take = 60, ownerTrabajadorId } = opts;

        const where: Prisma.RegistroServicioWhereInput = { tenant_id: tenantId };
        // El chofer (solo_propios) queda fijo a lo suyo; el admin puede filtrar por chofer.
        if (ownerTrabajadorId) where.trabajador_id = ownerTrabajadorId;
        else if (trabajadorId) where.trabajador_id = trabajadorId;
        if (operacion) where.operacion = this.normalizarOperacion(operacion);
        if (anio) {
            const desde = mes ? inicioMesUTC(anio, mes) : inicioMesUTC(anio, 1);
            const hasta = mes ? inicioMesUTC(anio, mes + 1) : inicioMesUTC(anio + 1, 1);
            where.fecha = { gte: desde, lt: hasta };
        }
        if (q) {
            where.OR = [
                { targa: { contains: q, mode: 'insensitive' } },
                { cliente: { contains: q, mode: 'insensitive' } },
            ];
        }

        const [items, total, tar] = await Promise.all([
            this.prisma.registroServicio.findMany({ where, orderBy: { fecha: 'desc' }, skip, take }),
            this.prisma.registroServicio.count({ where }),
            this.tarifas(tenantId),
        ]);

        // Nombre del trabajador para el listado (une por Trabajador.id).
        const ids = [...new Set(items.map((r) => r.trabajador_id).filter(Boolean))];
        const trabajadores = ids.length
            ? await this.prisma.trabajador.findMany({
                where: { id: { in: ids }, tenant_id: tenantId },
                select: { id: true, nombre_completo: true, url_foto: true },
            })
            : [];
        const porId = new Map(trabajadores.map((t) => [t.id, t]));

        return {
            items: items.map((r) => ({
                ...r,
                ganancia: this.ganancia(r, tar),
                trabajador_nombre: porId.get(r.trabajador_id)?.nombre_completo ?? null,
                trabajador_foto: porId.get(r.trabajador_id)?.url_foto ?? null,
            })),
            total,
            moneda: tar.moneda,
            tarifas: { giorno: tar.giorno, notte: tar.notte, corte: tar.corte },
        };
    }

    // Resumen del chofer para "Mi Resumen" de la app.
    // Métricas AUTOMÁTICAS de un trabajador en un rango: km y horas de manejo
    // (día/noche, sin descanso) desde los RECORRIDOS, + contador de reperibilità
    // (consegnas marcadas por el supervisor). Incluye los montos; el caller decide
    // si se muestran según el rol (ve_finanzas).
    private async calcularMetricas(
        tenantId: string, trabajadorId: string, desde: Date, hasta: Date,
        tar: { giorno: number; notte: number },
    ) {
        const [recorridos, reperibilita] = await Promise.all([
            this.prisma.recorrido.findMany({
                where: { tenant_id: tenantId, trabajador_id: trabajadorId, finalizado_en: { gte: desde, lte: hasta } },
                select: { ida_km: true, vuelta_km: true, iniciado_en: true, llegada_en: true, retorno_en: true, finalizado_en: true, descanso_min: true },
            }),
            this.prisma.programacion.count({
                where: { tenant_id: tenantId, trabajador_id: trabajadorId, reperibilita: true, fecha: { gte: desde, lte: hasta } },
            }),
        ]);

        let km = 0, diaMin = 0, nocheMin = 0;
        for (const r of recorridos) {
            km += num(r.ida_km) + num(r.vuelta_km);
            const ida = minutosDiaNoche(r.iniciado_en, r.llegada_en);
            const vuelta = minutosDiaNoche(r.retorno_en, r.finalizado_en);
            const diaEl = ida.dia + vuelta.dia;
            const nocheEl = ida.noche + vuelta.noche;
            const elapsed = diaEl + nocheEl;
            // Solo cuenta el manejo: se descuenta el descanso proporcionalmente.
            const factor = elapsed > 0 ? Math.max(0, elapsed - num(r.descanso_min)) / elapsed : 0;
            diaMin += diaEl * factor;
            nocheMin += nocheEl * factor;
        }

        const oreDia = Math.round((diaMin / 60) * 100) / 100;
        const oreNoche = Math.round((nocheMin / 60) * 100) / 100;
        const pagoHoras = Math.round((oreDia * tar.giorno + oreNoche * tar.notte) * 100) / 100;
        const pagoReperibilita = reperibilita * 10; // €10 fijo por cada reperibilità
        return {
            km: Math.round(km * 10) / 10,
            oreDia, oreNoche,
            oreTotal: Math.round((oreDia + oreNoche) * 100) / 100,
            reperibilita,
            recorridos: recorridos.length,
            pagoHoras,
            pagoReperibilita,
            gananciaTotal: Math.round((pagoHoras + pagoReperibilita) * 100) / 100,
        };
    }

    async resumenChofer(tenantId: string, trabajadorId: string | null, from?: string, to?: string) {
        if (!trabajadorId) throw new BadRequestException('Tu usuario no está vinculado a un trabajador.');

        const ahora = new Date();
        const desde = from ? new Date(from) : inicioMesUTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1);
        const hasta = to ? new Date(to) : ahora;
        const tar = await this.tarifas(tenantId);
        const m = await this.calcularMetricas(tenantId, trabajadorId, desde, hasta, tar);

        return {
            desde,
            hasta,
            moneda: tar.moneda,
            tarifas: { giorno: tar.giorno, notte: tar.notte, corte: tar.corte },
            km: m.km,
            oreDia: m.oreDia,
            oreNoche: m.oreNoche,
            oreTotal: m.oreTotal,
            // compat con el front actual (mattina=día, sera=noche):
            oreMattina: m.oreDia,
            oreSera: m.oreNoche,
            reperibilita: m.reperibilita,
            totalPartes: m.recorridos,
            // Montos: el controller los remueve si el rol NO ve finanzas.
            pagoHoras: m.pagoHoras,
            pagoReperibilita: m.pagoReperibilita,
            gananciaTotal: m.gananciaTotal,
            gananciaEstimada: m.gananciaTotal, // compat
            recientes: [] as any[],
        };
    }

    // Resumen para DIRECCIÓN (solo roles con ve_finanzas): cuánto va ganando cada
    // chofer/supervisor en el rango, con montos.
    async resumenDireccion(tenantId: string, from?: string, to?: string) {
        const ahora = new Date();
        const desde = from ? new Date(from) : inicioMesUTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1);
        const hasta = to ? new Date(to) : ahora;
        const [tar, trabajadores] = await Promise.all([
            this.tarifas(tenantId),
            this.prisma.trabajador.findMany({
                where: { tenant_id: tenantId },
                select: { id: true, nombre_completo: true, cargo: true },
            }),
        ]);
        const filas = await Promise.all(trabajadores.map(async (w) => {
            const m = await this.calcularMetricas(tenantId, w.id, desde, hasta, tar);
            return {
                trabajadorId: w.id, nombre: w.nombre_completo, cargo: w.cargo,
                km: m.km, oreDia: m.oreDia, oreNoche: m.oreNoche, oreTotal: m.oreTotal,
                reperibilita: m.reperibilita,
                pagoHoras: m.pagoHoras, pagoReperibilita: m.pagoReperibilita, gananciaTotal: m.gananciaTotal,
            };
        }));
        const conActividad = filas
            .filter((f) => f.oreTotal > 0 || f.km > 0 || f.reperibilita > 0)
            .sort((a, b) => b.gananciaTotal - a.gananciaTotal);
        const totalPagar = Math.round(conActividad.reduce((s, f) => s + f.gananciaTotal, 0) * 100) / 100;
        return { desde, hasta, moneda: tar.moneda, totalPagar, choferes: conActividad };
    }

    // Resumen mensual por chofer (panel web). Agrupa el período elegido por trabajador.
    async resumenMes(tenantId: string, opts: { operacion?: string; anio?: number; mes?: number }) {
        const ahora = new Date();
        const anio = opts.anio ?? ahora.getUTCFullYear();
        const mes = opts.mes ?? ahora.getUTCMonth() + 1;
        const desde = inicioMesUTC(anio, mes);
        const hasta = inicioMesUTC(anio, mes + 1);

        const where: Prisma.RegistroServicioWhereInput = {
            tenant_id: tenantId,
            fecha: { gte: desde, lt: hasta },
        };
        if (opts.operacion) where.operacion = this.normalizarOperacion(opts.operacion);

        const [registros, tar] = await Promise.all([
            this.prisma.registroServicio.findMany({ where }),
            this.tarifas(tenantId),
        ]);

        const ids = [...new Set(registros.map((r) => r.trabajador_id).filter(Boolean))];
        const trabajadores = ids.length
            ? await this.prisma.trabajador.findMany({
                where: { id: { in: ids }, tenant_id: tenantId },
                select: { id: true, nombre_completo: true, url_foto: true },
            })
            : [];
        const porId = new Map(trabajadores.map((t) => [t.id, t]));

        const acc = new Map<string, { trabajador_id: string; nombre: string; foto: string | null; partes: number; km: number; oreMattina: number; oreSera: number; ganancia: number }>();
        for (const r of registros) {
            const key = r.trabajador_id;
            if (!acc.has(key)) {
                acc.set(key, {
                    trabajador_id: key,
                    nombre: porId.get(key)?.nombre_completo ?? key,
                    foto: porId.get(key)?.url_foto ?? null,
                    partes: 0, km: 0, oreMattina: 0, oreSera: 0, ganancia: 0,
                });
            }
            const a = acc.get(key)!;
            a.partes += 1;
            a.km += num(r.km);
            a.oreMattina += num(r.ore_mattina);
            a.oreSera += num(r.ore_sera);
            a.ganancia += this.ganancia(r, tar);
        }

        const filas = [...acc.values()]
            .map((a) => ({
                ...a,
                km: Math.round(a.km * 10) / 10,
                oreMattina: Math.round(a.oreMattina * 100) / 100,
                oreSera: Math.round(a.oreSera * 100) / 100,
                oreTotal: Math.round((a.oreMattina + a.oreSera) * 100) / 100,
                ganancia: Math.round(a.ganancia * 100) / 100,
            }))
            .sort((x, y) => y.ganancia - x.ganancia);

        const totales = filas.reduce(
            (t, f) => ({ partes: t.partes + f.partes, km: t.km + f.km, ore: t.ore + f.oreTotal, ganancia: t.ganancia + f.ganancia }),
            { partes: 0, km: 0, ore: 0, ganancia: 0 },
        );

        return {
            anio, mes, moneda: tar.moneda,
            tarifas: { giorno: tar.giorno, notte: tar.notte, corte: tar.corte },
            filas,
            totales: {
                partes: totales.partes,
                km: Math.round(totales.km * 10) / 10,
                ore: Math.round(totales.ore * 100) / 100,
                ganancia: Math.round(totales.ganancia * 100) / 100,
            },
        };
    }

    async getConfig(tenantId: string) {
        const tar = await this.tarifas(tenantId);
        return { tarifa_ore_giorno: tar.giorno, tarifa_ore_notte: tar.notte, hora_corte_notte: tar.corte, moneda: tar.moneda };
    }

    async updateConfig(tenantId: string, body: any) {
        const data: any = {};
        if (body.tarifa_ore_giorno !== undefined && body.tarifa_ore_giorno !== '') data.tarifa_ore_giorno = num(body.tarifa_ore_giorno);
        if (body.tarifa_ore_notte !== undefined && body.tarifa_ore_notte !== '') data.tarifa_ore_notte = num(body.tarifa_ore_notte);
        if (body.hora_corte_notte !== undefined && body.hora_corte_notte !== '') {
            const h = Math.max(0, Math.min(23, Math.round(num(body.hora_corte_notte))));
            data.hora_corte_notte = h;
        }
        await this.prisma.tenant.update({ where: { id: tenantId }, data });
        return this.getConfig(tenantId);
    }

    async findOne(id: string, ctx: { tenantId: string; ownerTrabajadorId?: string }) {
        const reg = await this.assertPropietario(id, ctx.tenantId, ctx.ownerTrabajadorId);
        const tar = await this.tarifas(ctx.tenantId);
        return { ...reg, ganancia: this.ganancia(reg, tar) };
    }

    // Árbol año → mes → chofer con suma de km en cada nivel (panel de navegación
    // tipo el sistema viejo). Usa la fecha en UTC para agrupar por día/mes/año.
    async arbol(tenantId: string, operacion?: string) {
        const where: Prisma.RegistroServicioWhereInput = { tenant_id: tenantId };
        if (operacion) where.operacion = this.normalizarOperacion(operacion);

        const registros = await this.prisma.registroServicio.findMany({
            where,
            select: { fecha: true, km: true, trabajador_id: true },
        });

        const ids = [...new Set(registros.map((r) => r.trabajador_id).filter(Boolean))];
        const trabajadores = ids.length
            ? await this.prisma.trabajador.findMany({
                where: { id: { in: ids }, tenant_id: tenantId },
                select: { id: true, nombre_completo: true, url_foto: true },
            })
            : [];
        const porId = new Map(trabajadores.map((t) => [t.id, t]));

        // anio -> mes -> trabajador_id -> km
        const anios = new Map<number, { km: number; meses: Map<number, { km: number; choferes: Map<string, number> }> }>();
        for (const r of registros) {
            const f = new Date(r.fecha);
            const anio = f.getUTCFullYear();
            const mes = f.getUTCMonth() + 1;
            const km = num(r.km);
            if (!anios.has(anio)) anios.set(anio, { km: 0, meses: new Map() });
            const A = anios.get(anio)!;
            A.km += km;
            if (!A.meses.has(mes)) A.meses.set(mes, { km: 0, choferes: new Map() });
            const M = A.meses.get(mes)!;
            M.km += km;
            M.choferes.set(r.trabajador_id, (M.choferes.get(r.trabajador_id) || 0) + km);
        }

        const round1 = (n: number) => Math.round(n * 10) / 10;
        return [...anios.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([anio, A]) => ({
                anio,
                km: round1(A.km),
                meses: [...A.meses.entries()]
                    .sort((a, b) => b[0] - a[0])
                    .map(([mes, M]) => ({
                        mes,
                        km: round1(M.km),
                        choferes: [...M.choferes.entries()]
                            .map(([tid, km]) => ({
                                trabajador_id: tid,
                                nombre: porId.get(tid)?.nombre_completo ?? tid,
                                foto: porId.get(tid)?.url_foto ?? null,
                                km: round1(km),
                            }))
                            .sort((a, b) => b.km - a.km),
                    })),
            }));
    }

    private async assertPropietario(id: string, tenantId: string, ownerTrabajadorId?: string) {
        const reg = await this.prisma.registroServicio.findFirst({ where: { id, tenant_id: tenantId } });
        if (!reg) throw new NotFoundException('Parte no encontrado.');
        if (ownerTrabajadorId && reg.trabajador_id !== ownerTrabajadorId) {
            throw new ForbiddenException('No puedes modificar partes de otro trabajador.');
        }
        return reg;
    }

    async update(id: string, data: any, ctx: { tenantId: string; ownerTrabajadorId?: string }) {
        await this.assertPropietario(id, ctx.tenantId, ctx.ownerTrabajadorId);
        const patch = this.buildData({ ...data, trabajador_id: ctx.ownerTrabajadorId ?? data.trabajador_id });
        // El chofer no puede reasignar el parte a otro trabajador.
        if (ctx.ownerTrabajadorId) patch.trabajador_id = ctx.ownerTrabajadorId;
        const reg = await this.prisma.registroServicio.update({ where: { id }, data: patch });
        const tar = await this.tarifas(ctx.tenantId);
        return { ...reg, ganancia: this.ganancia(reg, tar) };
    }

    async remove(id: string, ctx: { tenantId: string; ownerTrabajadorId?: string }) {
        await this.assertPropietario(id, ctx.tenantId, ctx.ownerTrabajadorId);
        await this.prisma.registroServicio.delete({ where: { id } });
        return { id, deleted: true };
    }
}
