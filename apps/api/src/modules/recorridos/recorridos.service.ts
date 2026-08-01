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
    // Resumen personal del chofer para "Mi Resumen": agrega horas de manejo,
    // km y descansos de sus recorridos, y estima la ganancia del período con
    // la tarifa_hora del trabajador. Período por defecto: mes en curso.
    async miResumen(tenantId: string, trabajadorId: string | null, from?: string, to?: string) {
        if (!trabajadorId) throw new BadRequestException('Tu usuario no está vinculado a un trabajador.');

        const ahora = new Date();
        const desde = from ? new Date(from) : new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const hasta = to ? new Date(to) : ahora;

        const [recorridos, trabajador] = await Promise.all([
            this.prisma.recorrido.findMany({
                where: {
                    tenant_id: tenantId,
                    trabajador_id: trabajadorId,
                    iniciado_en: { gte: desde, lte: hasta },
                },
                orderBy: { iniciado_en: 'desc' },
            }),
            this.prisma.trabajador.findFirst({
                where: { id: trabajadorId, tenant_id: tenantId },
                select: { tarifa_hora: true, nombre_completo: true },
            }),
        ]);

        let minutosManejo = 0;
        let km = 0;
        let descansoMin = 0;
        let completados = 0;
        for (const r of recorridos) {
            minutosManejo += (r.ida_min ?? 0) + (r.vuelta_min ?? 0);
            km += (r.ida_km ?? 0) + (r.vuelta_km ?? 0);
            descansoMin += r.descanso_min ?? 0;
            if (r.estado === 'COMPLETADO') completados++;
        }

        const tarifaHora = Number(trabajador?.tarifa_hora ?? 0);
        const gananciaEstimada = Math.round((minutosManejo / 60) * tarifaHora * 100) / 100;

        return {
            desde,
            hasta,
            totalRecorridos: recorridos.length,
            completados,
            minutosManejo: Math.round(minutosManejo),
            km: Math.round(km * 10) / 10,
            descansoMin: Math.round(descansoMin),
            tarifaHora,
            gananciaEstimada,
            recientes: recorridos.slice(0, 5).map((r) => ({
                id: r.id,
                destino: r.destino_label,
                estado: r.estado,
                iniciado_en: r.iniciado_en,
                km: Math.round(((r.ida_km ?? 0) + (r.vuelta_km ?? 0)) * 10) / 10,
                minutos: Math.round((r.ida_min ?? 0) + (r.vuelta_min ?? 0)),
            })),
        };
    }
}
