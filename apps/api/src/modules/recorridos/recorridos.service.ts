import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { GpsService } from '../gps/gps.service';

// Estados que cuentan como recorrido "en curso".
const ACTIVOS = ['EN_RUTA_IDA', 'EN_DESTINO', 'EN_RUTA_VUELTA'];

type LatLng = { lat: number; lng: number };

@Injectable()
export class RecorridosService {
    constructor(private prisma: PrismaService, private gps: GpsService) { }

    private token() {
        return process.env.MAPBOX_TOKEN || '';
    }

    // Geocodifica una dirección a coords (best-effort; null si falla o no hay token).
    private async geocode(address?: string | null): Promise<LatLng | null> {
        const token = this.token();
        if (!token || !address?.trim()) return null;
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${token}`;
            const res = await fetch(url);
            const j: any = await res.json();
            const c = j?.features?.[0]?.center;
            if (Array.isArray(c) && c.length === 2) return { lng: c[0], lat: c[1] };
        } catch (e) {
            console.warn('[Recorridos] geocode falló:', (e as any)?.message);
        }
        return null;
    }

    // ETA en minutos manejando de A a B (con tráfico). null si falla.
    private async etaMin(from: LatLng, to: LatLng): Promise<number | null> {
        const token = this.token();
        if (!token) return null;
        try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${token}`;
            const res = await fetch(url);
            const j: any = await res.json();
            if (j?.routes?.length) return Math.round(j.routes[0].duration / 60);
        } catch (e) {
            console.warn('[Recorridos] directions falló:', (e as any)?.message);
        }
        return null;
    }

    private haversineKm(a: LatLng, b: LatLng): number {
        const R = 6371;
        const dLat = ((b.lat - a.lat) * Math.PI) / 180;
        const dLng = ((b.lng - a.lng) * Math.PI) / 180;
        const lat1 = (a.lat * Math.PI) / 180;
        const lat2 = (b.lat * Math.PI) / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    // Distancia recorrida (km) por un device entre dos instantes, sumando posiciones.
    private async distanciaKm(deviceId: string | null, from: Date, to: Date): Promise<number | null> {
        if (!deviceId) return null;
        const pts = await this.prisma.position.findMany({
            where: { device_id: deviceId, timestamp: { gte: from, lte: to } },
            orderBy: { timestamp: 'asc' },
            select: { latitude: true, longitude: true },
        });
        if (pts.length < 2) return 0;
        let km = 0;
        for (let i = 1; i < pts.length; i++) {
            km += this.haversineKm(
                { lat: Number(pts[i - 1].latitude), lng: Number(pts[i - 1].longitude) },
                { lat: Number(pts[i].latitude), lng: Number(pts[i].longitude) },
            );
        }
        return Math.round(km * 10) / 10;
    }

    private async latestPosition(deviceId: string | null): Promise<(LatLng & { timestamp: Date }) | null> {
        if (!deviceId) return null;
        const p = await this.prisma.position.findFirst({
            where: { device_id: deviceId },
            orderBy: { timestamp: 'desc' },
            select: { latitude: true, longitude: true, timestamp: true },
        });
        if (!p) return null;
        return { lat: Number(p.latitude), lng: Number(p.longitude), timestamp: p.timestamp };
    }

    // Device del trabajador (para reportar GPS y sacar el vehículo asignado).
    private async deviceDe(tenantId: string, trabajadorId: string) {
        return this.prisma.device.findFirst({
            where: { tenant_id: tenantId, trabajador_id: trabajadorId },
            select: { id: true, vehiculo_id: true },
        });
    }

    /** Operaciones asignadas al chofer que aún puede iniciar (pendientes/reprogramadas). */
    async operacionesDisponibles(tenantId: string, trabajadorId: string) {
        // Usuario sin trabajador vinculado (p.ej. admin): no es chofer → nada que iniciar.
        if (!trabajadorId) return [];
        // El trabajador puede estar referenciado por su id o por su código id_trabajador.
        const trab = await this.prisma.trabajador.findFirst({
            where: { id: trabajadorId, tenant_id: tenantId },
            select: { id: true, id_trabajador: true },
        });
        const codigos = [trabajadorId, trab?.id_trabajador].filter(Boolean) as string[];
        const desde = new Date(Date.now() - 30 * 86400000);
        return this.prisma.programacion.findMany({
            where: {
                tenant_id: tenantId,
                trabajador_id: { in: codigos },
                estado: { in: ['PENDIENTE', 'PENDING', 'REPROGRAMADO'] },
                fecha: { gte: desde },
            },
            orderBy: { fecha_entrega: 'asc' },
            select: {
                id: true, id_programacion: true, cliente: true,
                lugar_retiro: true, lugar_entrega: true, fecha_entrega: true, estado: true,
            },
            take: 50,
        });
    }

    /** Recorrido activo del chofer (para restaurar el estado de la UI móvil). */
    async activoDeTrabajador(tenantId: string, trabajadorId: string) {
        if (!trabajadorId) return null; // usuario sin trabajador → sin recorrido activo
        return this.prisma.recorrido.findFirst({
            where: { tenant_id: tenantId, trabajador_id: trabajadorId, estado: { in: ACTIVOS } },
            orderBy: { iniciado_en: 'desc' },
        });
    }

    /** Iniciar ruta: crea el recorrido, marca la operación en ruta y al chofer ocupado. */
    async iniciar(tenantId: string, trabajadorId: string, programacionId: string) {
        if (!trabajadorId) throw new BadRequestException('Tu usuario no está vinculado a un trabajador.');
        const yaActivo = await this.activoDeTrabajador(tenantId, trabajadorId);
        if (yaActivo) throw new BadRequestException('Ya tienes un recorrido en curso.');

        const prog = await this.prisma.programacion.findFirst({
            where: { id: programacionId, tenant_id: tenantId },
        });
        if (!prog) throw new NotFoundException('Operación no encontrada.');

        const device = await this.deviceDe(tenantId, trabajadorId);
        const [oGeo, dGeo] = await Promise.all([
            this.geocode(prog.lugar_retiro),
            this.geocode(prog.lugar_entrega),
        ]);
        // "Esperado": ETA por carretera origen→destino al iniciar (base del esperado vs real).
        const esperadoIda = oGeo && dGeo ? await this.etaMin(oGeo, dGeo) : null;

        const recorrido = await this.prisma.recorrido.create({
            data: {
                tenant_id: tenantId,
                trabajador_id: trabajadorId,
                device_id: device?.id ?? null,
                vehiculo_id: device?.vehiculo_id ?? null,
                programacion_id: prog.id,
                origen_label: prog.lugar_retiro,
                destino_label: prog.lugar_entrega,
                origen_lat: oGeo?.lat ?? null,
                origen_lng: oGeo?.lng ?? null,
                destino_lat: dGeo?.lat ?? null,
                destino_lng: dGeo?.lng ?? null,
                esperado_ida_min: esperadoIda,
                estado: 'EN_RUTA_IDA',
            },
        });

        // Integraciones: operación "en ruta" (aparece En Consegna) + chofer/vehículo ocupados.
        await this.prisma.programacion.update({ where: { id: prog.id }, data: { estado: 'RETIRADO' } });
        await this.prisma.trabajador.updateMany({ where: { id: trabajadorId, tenant_id: tenantId }, data: { disponible: false } });
        if (device?.vehiculo_id) {
            await this.prisma.vehiculo.updateMany({ where: { id: device.vehiculo_id, tenant_id: tenantId }, data: { disponible: false } });
        }
        return recorrido;
    }

    private async getOwned(tenantId: string, id: string, trabajadorId?: string) {
        const r = await this.prisma.recorrido.findFirst({
            where: { id, tenant_id: tenantId, ...(trabajadorId ? { trabajador_id: trabajadorId } : {}) },
        });
        if (!r) throw new NotFoundException('Recorrido no encontrado.');
        return r;
    }

    /** Llegué al destino: cierra el tramo de ida y calcula sus métricas. */
    async llegada(tenantId: string, id: string, trabajadorId: string) {
        const r = await this.getOwned(tenantId, id, trabajadorId);
        if (r.estado !== 'EN_RUTA_IDA') throw new BadRequestException('El recorrido no está en ruta de ida.');
        const now = new Date();
        const km = await this.distanciaKm(r.device_id, r.iniciado_en, now);
        return this.prisma.recorrido.update({
            where: { id: r.id },
            data: {
                estado: 'EN_DESTINO',
                llegada_en: now,
                ida_km: km,
                ida_min: Math.round((now.getTime() - r.iniciado_en.getTime()) / 60000),
            },
        });
    }

    /** Tomar descanso: pausa el tramo actual (ida o vuelta). */
    async descanso(tenantId: string, id: string, trabajadorId: string) {
        const r = await this.getOwned(tenantId, id, trabajadorId);
        if (r.estado !== 'EN_RUTA_IDA' && r.estado !== 'EN_RUTA_VUELTA') {
            throw new BadRequestException('Solo puedes descansar mientras estás en ruta.');
        }
        if (r.descanso_desde) throw new BadRequestException('Ya estás descansando.');
        return this.prisma.recorrido.update({
            where: { id: r.id },
            data: { descanso_desde: new Date() },
        });
    }

    /** Reanudar: cierra el descanso y acumula el tiempo pausado. */
    async reanudar(tenantId: string, id: string, trabajadorId: string) {
        const r = await this.getOwned(tenantId, id, trabajadorId);
        if (!r.descanso_desde) throw new BadRequestException('No hay un descanso activo.');
        const min = Math.round((Date.now() - r.descanso_desde.getTime()) / 60000);
        return this.prisma.recorrido.update({
            where: { id: r.id },
            data: { descanso_desde: null, descanso_min: (r.descanso_min || 0) + min },
        });
    }

    /** Regresar: abre el tramo de vuelta hacia el origen. */
    async regreso(tenantId: string, id: string, trabajadorId: string) {
        const r = await this.getOwned(tenantId, id, trabajadorId);
        if (r.estado !== 'EN_DESTINO') throw new BadRequestException('Solo puedes regresar tras llegar al destino.');
        return this.prisma.recorrido.update({
            where: { id: r.id },
            data: { estado: 'EN_RUTA_VUELTA', retorno_en: new Date() },
        });
    }

    /** Finalizar: cierra el recorrido, marca la operación entregada y libera al chofer. */
    async finalizar(tenantId: string, id: string, trabajadorId: string) {
        const r = await this.getOwned(tenantId, id, trabajadorId);
        if (!ACTIVOS.includes(r.estado)) throw new BadRequestException('El recorrido ya está cerrado.');
        const now = new Date();

        const data: any = { estado: 'COMPLETADO', finalizado_en: now };
        if (r.estado === 'EN_RUTA_VUELTA' && r.retorno_en) {
            data.vuelta_km = await this.distanciaKm(r.device_id, r.retorno_en, now);
            data.vuelta_min = Math.round((now.getTime() - r.retorno_en.getTime()) / 60000);
        } else if (r.estado === 'EN_RUTA_IDA') {
            // Finalizó sin marcar llegada: cerramos la ida con lo transcurrido.
            data.ida_km = await this.distanciaKm(r.device_id, r.iniciado_en, now);
            data.ida_min = Math.round((now.getTime() - r.iniciado_en.getTime()) / 60000);
        }
        const updated = await this.prisma.recorrido.update({ where: { id: r.id }, data });

        if (r.programacion_id) {
            await this.prisma.programacion.updateMany({ where: { id: r.programacion_id, tenant_id: tenantId }, data: { estado: 'ENTREGADO' } });
        }
        await this.prisma.trabajador.updateMany({ where: { id: r.trabajador_id, tenant_id: tenantId }, data: { disponible: true } });
        if (r.vehiculo_id) {
            await this.prisma.vehiculo.updateMany({ where: { id: r.vehiculo_id, tenant_id: tenantId }, data: { disponible: true } });
        }
        return updated;
    }

    /** Cancelar: aborta el recorrido y libera al chofer (sin marcar entregado). */
    async cancelar(tenantId: string, id: string, trabajadorId: string) {
        const r = await this.getOwned(tenantId, id, trabajadorId);
        if (!ACTIVOS.includes(r.estado)) throw new BadRequestException('El recorrido ya está cerrado.');
        const updated = await this.prisma.recorrido.update({
            where: { id: r.id },
            data: { estado: 'CANCELADO', finalizado_en: new Date() },
        });
        await this.prisma.trabajador.updateMany({ where: { id: r.trabajador_id, tenant_id: tenantId }, data: { disponible: true } });
        if (r.vehiculo_id) {
            await this.prisma.vehiculo.updateMany({ where: { id: r.vehiculo_id, tenant_id: tenantId }, data: { disponible: true } });
        }
        return updated;
    }

    /** Cierre forzado por el supervisor (recorrido atascado/olvidado). No exige
     *  ser el dueño; cierra como CANCELADO y libera al chofer y su vehículo. */
    async cerrarPorSupervisor(tenantId: string, id: string) {
        const r = await this.prisma.recorrido.findFirst({ where: { id, tenant_id: tenantId } });
        if (!r) throw new NotFoundException('Recorrido no encontrado.');
        if (!ACTIVOS.includes(r.estado)) throw new BadRequestException('El recorrido ya está cerrado.');
        const updated = await this.prisma.recorrido.update({
            where: { id: r.id },
            data: { estado: 'CANCELADO', finalizado_en: new Date(), descanso_desde: null },
        });
        await this.prisma.trabajador.updateMany({ where: { id: r.trabajador_id, tenant_id: tenantId }, data: { disponible: true } });
        if (r.vehiculo_id) {
            await this.prisma.vehiculo.updateMany({ where: { id: r.vehiculo_id, tenant_id: tenantId }, data: { disponible: true } });
        }
        return updated;
    }

    /** Tablero del supervisor: recorridos en curso con ETA y tiempo transcurrido. */
    async activos(tenantId: string) {
        const recorridos = await this.prisma.recorrido.findMany({
            where: { tenant_id: tenantId, estado: { in: ACTIVOS } },
            orderBy: { iniciado_en: 'asc' },
        });
        if (recorridos.length === 0) return [];

        // Resolver nombres de chofer y placas en lote.
        const trabIds = Array.from(new Set(recorridos.map((r) => r.trabajador_id)));
        const vehIds = Array.from(new Set(recorridos.map((r) => r.vehiculo_id).filter(Boolean) as string[]));
        const [trabs, vehs] = await Promise.all([
            this.prisma.trabajador.findMany({ where: { id: { in: trabIds } }, select: { id: true, nombre_completo: true, url_foto: true } }),
            vehIds.length ? this.prisma.vehiculo.findMany({ where: { id: { in: vehIds } }, select: { id: true, placa: true } }) : Promise.resolve([]),
        ]);
        const trabMap = new Map(trabs.map((t) => [t.id, t]));
        const vehMap = new Map(vehs.map((v) => [v.id, v]));
        const now = Date.now();

        return Promise.all(
            recorridos.map(async (r) => {
                const pos = await this.latestPosition(r.device_id);
                // Objetivo actual según el tramo.
                const target: LatLng | null =
                    r.estado === 'EN_RUTA_IDA' && r.destino_lat != null && r.destino_lng != null
                        ? { lat: r.destino_lat, lng: r.destino_lng }
                        : r.estado === 'EN_RUTA_VUELTA' && r.origen_lat != null && r.origen_lng != null
                            ? { lat: r.origen_lat, lng: r.origen_lng }
                            : null;
                // Descansando: el chofer pausó el tramo. Congela ETA/disponibilidad.
                const descansando = !!r.descanso_desde;
                const eta = !descansando && pos && target ? await this.etaMin(pos, target) : null;

                const inicioTramo =
                    r.estado === 'EN_RUTA_VUELTA' && r.retorno_en ? r.retorno_en :
                        r.estado === 'EN_DESTINO' && r.llegada_en ? r.llegada_en : r.iniciado_en;

                return {
                    id: r.id,
                    trabajador: trabMap.get(r.trabajador_id)?.nombre_completo || 'Chofer',
                    url_foto: trabMap.get(r.trabajador_id)?.url_foto || null,
                    placa: r.vehiculo_id ? vehMap.get(r.vehiculo_id)?.placa || null : null,
                    // Estado visible: EN_DESCANSO sobreescribe el tramo mientras está pausado.
                    estado: descansando ? 'EN_DESCANSO' : r.estado,
                    tramo: r.estado, // el tramo real (para saber a dónde reanuda)
                    descansando,
                    // Minutos del descanso actual (si descansa) o total acumulado.
                    descansoMin: descansando
                        ? Math.round((now - new Date(r.descanso_desde!).getTime()) / 60000)
                        : Math.round(r.descanso_min || 0),
                    origen: r.origen_label,
                    destino: r.destino_label,
                    origen_lat: r.origen_lat, origen_lng: r.origen_lng,
                    destino_lat: r.destino_lat, destino_lng: r.destino_lng,
                    programacion_id: r.programacion_id,
                    iniciado_en: r.iniciado_en,
                    // Minutos en el tramo actual.
                    enTramoMin: Math.round((now - new Date(inicioTramo).getTime()) / 60000),
                    // ETA al objetivo del tramo (min). Null si descansa o en destino.
                    etaMin: eta,
                    // Cuándo estará disponible (min): ETA del tramo, null si descansa/en destino.
                    disponibleEnMin: descansando || r.estado === 'EN_DESTINO' ? null : eta,
                    posicion: pos ? { lat: pos.lat, lng: pos.lng, timestamp: pos.timestamp } : null,
                    // Sin GPS: sin posición o última posición vieja (>5 min) → el
                    // supervisor sabe que no se está compartiendo ubicación (ETA no fiable).
                    sinGps: !pos || (now - new Date(pos.timestamp).getTime() > 5 * 60000),
                    ida_km: r.ida_km, ida_min: r.ida_min,
                };
            }),
        );
    }

    async detalle(tenantId: string, id: string) {
        return this.getOwned(tenantId, id);
    }

    /** Traza detallada de un recorrido: recorrido + ruta GPS real + análisis (distancia,
     *  tiempos, paradas) reusando getTripAnalysis sobre la ventana del recorrido. */
    // Traza del recorrido más reciente de una operación (para mostrarla en su detalle).
    // Devuelve el recorrido acotado a iniciar→finalizar (no el GPS del día completo).
    async trazaByProgramacion(tenantId: string, programacionId: string) {
        const r = await this.prisma.recorrido.findFirst({
            where: { tenant_id: tenantId, programacion_id: programacionId },
            orderBy: { iniciado_en: 'desc' },
            select: { id: true },
        });
        if (!r) return { recorrido: null, path: [], analisis: null };
        return this.traza(tenantId, r.id);
    }

    async traza(tenantId: string, id: string) {
        const r = await this.getOwned(tenantId, id);
        const hasta = r.finalizado_en ?? new Date();
        let path: { lat: number; lng: number; t: string }[] = [];
        let analisis: any = null;
        if (r.device_id) {
            const positions = await this.prisma.position.findMany({
                where: { device_id: r.device_id, timestamp: { gte: r.iniciado_en, lte: hasta } },
                orderBy: { timestamp: 'asc' },
                select: { latitude: true, longitude: true, timestamp: true },
            });
            path = positions
                .map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude), t: p.timestamp.toISOString() }))
                .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
            analisis = await this.gps.getTripAnalysis(r.device_id, r.iniciado_en, hasta);
        }
        return {
            recorrido: {
                id: r.id, estado: r.estado,
                origen: r.origen_label, destino: r.destino_label,
                origen_lat: r.origen_lat, origen_lng: r.origen_lng,
                destino_lat: r.destino_lat, destino_lng: r.destino_lng,
                iniciado_en: r.iniciado_en, finalizado_en: r.finalizado_en,
                ida_km: r.ida_km, ida_min: r.ida_min, vuelta_km: r.vuelta_km, vuelta_min: r.vuelta_min,
                descanso_min: Math.round(r.descanso_min || 0), esperado_ida_min: r.esperado_ida_min,
            },
            path,
            analisis,
        };
    }

    /** Historial de recorridos cerrados con comparativa esperado vs real. */
    async historial(tenantId: string, limit = 30) {
        const recorridos = await this.prisma.recorrido.findMany({
            where: { tenant_id: tenantId, estado: { in: ['COMPLETADO', 'CANCELADO'] } },
            orderBy: { finalizado_en: 'desc' },
            take: Math.min(Math.max(limit, 1), 200),
        });
        if (recorridos.length === 0) return [];

        // Resolver nombres/placas y las programaciones (para el tiempo esperado).
        const trabIds = Array.from(new Set(recorridos.map((r) => r.trabajador_id)));
        const vehIds = Array.from(new Set(recorridos.map((r) => r.vehiculo_id).filter(Boolean) as string[]));
        const progIds = Array.from(new Set(recorridos.map((r) => r.programacion_id).filter(Boolean) as string[]));
        const [trabs, vehs, progs] = await Promise.all([
            this.prisma.trabajador.findMany({ where: { id: { in: trabIds } }, select: { id: true, nombre_completo: true } }),
            vehIds.length ? this.prisma.vehiculo.findMany({ where: { id: { in: vehIds } }, select: { id: true, placa: true } }) : Promise.resolve([]),
            progIds.length ? this.prisma.programacion.findMany({ where: { id: { in: progIds } }, select: { id: true, fecha_retiro: true, fecha_entrega: true, cliente: true } }) : Promise.resolve([]),
        ]);
        const trabMap = new Map(trabs.map((t) => [t.id, t.nombre_completo]));
        const vehMap = new Map(vehs.map((v) => [v.id, v.placa]));
        const progMap = new Map(progs.map((p) => [p.id, p]));

        return recorridos.map((r) => {
            const prog = r.programacion_id ? progMap.get(r.programacion_id) : null;
            // Esperado (min): ETA por carretera guardada al iniciar; si falta, cae al
            // planificado de la operación (retiro → entrega).
            const esperadoMin =
                r.esperado_ida_min != null
                    ? Math.round(r.esperado_ida_min)
                    : prog?.fecha_retiro && prog?.fecha_entrega
                        ? Math.round((new Date(prog.fecha_entrega).getTime() - new Date(prog.fecha_retiro).getTime()) / 60000)
                        : null;
            // Real de la ida (min): del inicio a la llegada al destino.
            const realIdaMin = r.ida_min ?? null;
            const desvioMin = esperadoMin != null && realIdaMin != null ? realIdaMin - esperadoMin : null;
            const duracionMin =
                r.finalizado_en ? Math.round((new Date(r.finalizado_en).getTime() - new Date(r.iniciado_en).getTime()) / 60000) : null;

            return {
                id: r.id,
                trabajador: trabMap.get(r.trabajador_id) || 'Chofer',
                placa: r.vehiculo_id ? vehMap.get(r.vehiculo_id) || null : null,
                cliente: prog?.cliente || null,
                origen: r.origen_label,
                destino: r.destino_label,
                estado: r.estado, // COMPLETADO | CANCELADO
                iniciado_en: r.iniciado_en,
                finalizado_en: r.finalizado_en,
                duracionMin,
                ida_min: r.ida_min, ida_km: r.ida_km,
                vuelta_min: r.vuelta_min, vuelta_km: r.vuelta_km,
                descanso_min: Math.round(r.descanso_min || 0),
                esperadoMin,
                desvioMin, // + = tardó más de lo planificado
            };
        });
    }

    // ===================== Pago por hora del chofer =====================
    // Tarifas (euros/hora). Noche = 19:00–06:00 (hora local de Italia).
    private static readonly TARIFA_DIA = 10;
    private static readonly TARIFA_NOCHE = 12;
    private static readonly NOCHE_DESDE_H = 19; // 19:00
    private static readonly NOCHE_HASTA_H = 6;  // 06:00

    /** Offset (min) de una zona horaria respecto a UTC en un instante dado (respeta DST). */
    private tzOffsetMin(date: Date, tz = 'Europe/Rome'): number {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        const p: any = {};
        for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
        const h = +p.hour === 24 ? 0 : +p.hour;
        const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second);
        return (asUTC - date.getTime()) / 60000;
    }

    /** Reparte los minutos del intervalo en diurnos/nocturnos según la hora local de Italia. */
    private splitDiaNoche(start: Date, end: Date): { diaMin: number; nocheMin: number } {
        const totalMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
        if (totalMin === 0) return { diaMin: 0, nocheMin: 0 };
        const off = this.tzOffsetMin(start);
        const localStartMin = Math.floor(start.getTime() / 60000) + off;
        let diaMin = 0, nocheMin = 0;
        const D = RecorridosService.NOCHE_DESDE_H, H = RecorridosService.NOCHE_HASTA_H;
        for (let i = 0; i < totalMin; i++) {
            const minuteOfDay = ((((localStartMin + i) % 1440) + 1440) % 1440);
            const hour = Math.floor(minuteOfDay / 60);
            if (hour >= D || hour < H) nocheMin++; else diaMin++;
        }
        return { diaMin, nocheMin };
    }

    /** Resumen de ganancias del chofer: horas trabajadas (total − descansos) por
     *  franja día/noche y su pago, en hoy / semana / mes / total. */
    async resumenPago(tenantId: string, trabajadorId: string) {
        const TARIFA_DIA = RecorridosService.TARIFA_DIA;
        const TARIFA_NOCHE = RecorridosService.TARIFA_NOCHE;
        const meta = {
            tarifaDia: TARIFA_DIA, tarifaNoche: TARIFA_NOCHE, moneda: 'EUR',
            nocheDesde: '19:00', nocheHasta: '06:00',
        };
        const mk = () => ({ recorridos: 0, minutos: 0, diaMin: 0, nocheMin: 0, ganancia: 0 });
        const round = (b: any) => ({
            recorridos: b.recorridos,
            horas: Math.round((b.minutos / 60) * 10) / 10,
            horasDia: Math.round((b.diaMin / 60) * 10) / 10,
            horasNoche: Math.round((b.nocheMin / 60) * 10) / 10,
            ganancia: Math.round(b.ganancia * 100) / 100,
        });
        if (!trabajadorId) {
            const z = round(mk());
            return { hoy: z, semana: z, mes: z, total: z, ...meta };
        }

        const recorridos = await this.prisma.recorrido.findMany({
            where: { tenant_id: tenantId, trabajador_id: trabajadorId, estado: 'COMPLETADO', finalizado_en: { not: null } },
            select: { iniciado_en: true, finalizado_en: true, descanso_min: true },
        });

        // Límites de tiempo en hora local de Italia (hoy / lunes de esta semana / 1° del mes).
        const now = new Date();
        const off = this.tzOffsetMin(now);
        const localNow = new Date(now.getTime() + off * 60000);
        const y = localNow.getUTCFullYear(), mo = localNow.getUTCMonth(), da = localNow.getUTCDate();
        const isoDow = localNow.getUTCDay() === 0 ? 7 : localNow.getUTCDay();
        const localMidnight = (Y: number, M: number, Dd: number) => new Date(Date.UTC(Y, M, Dd, 0, 0, 0) - off * 60000);
        const startHoy = localMidnight(y, mo, da);
        const startSemana = localMidnight(y, mo, da - (isoDow - 1));
        const startMes = localMidnight(y, mo, 1);

        const buckets = { hoy: mk(), semana: mk(), mes: mk(), total: mk() };
        const add = (b: any, workedMin: number, diaMin: number, nocheMin: number) => {
            b.recorridos += 1; b.minutos += workedMin; b.diaMin += diaMin; b.nocheMin += nocheMin;
            b.ganancia += (diaMin / 60) * TARIFA_DIA + (nocheMin / 60) * TARIFA_NOCHE;
        };

        for (const r of recorridos) {
            if (!r.finalizado_en) continue;
            const start = new Date(r.iniciado_en);
            const end = new Date(r.finalizado_en);
            const totalMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
            if (totalMin === 0) continue;
            const descanso = Math.min(totalMin, Math.round(r.descanso_min || 0));
            const workedMin = totalMin - descanso;
            const { diaMin: dGross, nocheMin: nGross } = this.splitDiaNoche(start, end);
            const factor = workedMin / totalMin; // prorratea el descanso entre franjas
            const diaMin = dGross * factor;
            const nocheMin = nGross * factor;
            add(buckets.total, workedMin, diaMin, nocheMin);
            if (end >= startHoy) add(buckets.hoy, workedMin, diaMin, nocheMin);
            if (end >= startSemana) add(buckets.semana, workedMin, diaMin, nocheMin);
            if (end >= startMes) add(buckets.mes, workedMin, diaMin, nocheMin);
        }

        return {
            hoy: round(buckets.hoy), semana: round(buckets.semana),
            mes: round(buckets.mes), total: round(buckets.total), ...meta,
        };
    }
}
