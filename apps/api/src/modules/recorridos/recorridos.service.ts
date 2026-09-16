import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { GASTO_SYNC_SELECT, GastoEntrante, aplicarPlanGastos, planificarSyncGastos } from '../../common/gastos-sync.util';
import { PrismaService } from '../../prisma.service';
import { GpsService } from '../gps/gps.service';
import { offsetRomaMin } from '../../common/tarifas-chofer.util';

// Estados que cuentan como recorrido "en curso".
const ACTIVOS = ['EN_RUTA_IDA', 'EN_DESTINO', 'EN_RUTA_VUELTA'];

type LatLng = { lat: number; lng: number };

@Injectable()
export class RecorridosService {
    constructor(private prisma: PrismaService, private gps: GpsService) { }

    // Key de Google del lado servidor (Directions + Geocoding). Debe ser una key SIN
    // restricción de referrer (restringida por IP o sin restricción) y con billing.
    // Todo el ruteo/geocoding va por Google (sin Mapbox).
    private googleKey() {
        return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_DIRECTIONS_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }

    // Geocodifica una dirección a coords con Google (best-effort; null si falla o no hay key).
    private async geocode(address?: string | null): Promise<LatLng | null> {
        if (!address?.trim()) return null;
        const gkey = this.googleKey();
        if (!gkey) return null;
        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=it&key=${gkey}`;
            const res = await fetch(url);
            const j: any = await res.json();
            const loc = j?.results?.[0]?.geometry?.location;
            if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') return { lat: loc.lat, lng: loc.lng };
        } catch (e) {
            console.warn('[Recorridos] geocode Google falló:', (e as any)?.message);
        }
        return null;
    }

    // ETA en minutos manejando de A a B (con tráfico), vía Google Directions. null si falla.
    private async etaMin(from: LatLng, to: LatLng): Promise<number | null> {
        const gkey = this.googleKey();
        if (!gkey) return null;
        try {
            const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&departure_time=now&key=${gkey}`;
            const res = await fetch(url);
            const j: any = await res.json();
            const leg = j?.routes?.[0]?.legs?.[0];
            const secs = leg?.duration_in_traffic?.value ?? leg?.duration?.value;
            if (typeof secs === 'number') return Math.round(secs / 60);
        } catch (e) {
            console.warn('[Recorridos] directions Google falló:', (e as any)?.message);
        }
        return null;
    }

    // Estimado (km + min) de una ruta por carretera con Google Directions, aceptando
    // direcciones de texto y waypoints. Suma todos los legs. null si falla o no hay key.
    // Se usa para el bucle completo origen→destinos→origen (respaldo del GPS real).
    private async directionsRoute(origin: string, waypoints: string[], destination: string): Promise<{ km: number; min: number } | null> {
        const gkey = this.googleKey();
        if (!gkey || !origin?.trim() || !destination?.trim()) return null;
        try {
            const wp = (waypoints || []).map((s) => (s || '').trim()).filter(Boolean);
            const wpParam = wp.length ? `&waypoints=${wp.map(encodeURIComponent).join('|')}` : '';
            const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${wpParam}&departure_time=now&region=it&key=${gkey}`;
            const res = await fetch(url);
            const j: any = await res.json();
            const legs = j?.routes?.[0]?.legs;
            if (!Array.isArray(legs) || !legs.length) return null;
            let meters = 0, secs = 0;
            for (const leg of legs) {
                meters += leg?.distance?.value || 0;
                secs += leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? 0;
            }
            return { km: Math.round((meters / 1000) * 10) / 10, min: Math.round(secs / 60) };
        } catch (e) {
            console.warn('[Recorridos] directionsRoute Google falló:', (e as any)?.message);
            return null;
        }
    }

    // Estimado de la RUTA COMPLETA de una operación (bucle origen→retiros→entrega→
    // destinos→origen) según Google Directions. Es el km/tiempo que se muestra sobre
    // el mapa en Operaciones y, por regla del empresario (2026-09-16), el que cuenta
    // para el recorrido y el mes del chofer. Se incluyen los RETIROS (almacenes
    // adicionales) igual que los destinos: si no, quedaba corto con recogidas
    // intermedias (los choferes lo reportaban como "no suman").
    async estimarRuta(prog: { lugar_retiro?: string | null; lugar_entrega?: string | null; retiros?: any; destinos?: any }): Promise<{ km: number; min: number } | null> {
        const retirosProg = Array.isArray(prog.retiros) ? prog.retiros : [];
        const destinosProg = Array.isArray(prog.destinos) ? prog.destinos : [];
        const loopStops = [...retirosProg, prog.lugar_entrega, ...destinosProg].map((s: any) => (s || '').trim()).filter(Boolean);
        if (!prog.lugar_retiro || !loopStops.length) return null;
        return this.directionsRoute(prog.lugar_retiro, loopStops, prog.lugar_retiro);
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
    // Velocidad máxima plausible (km/h): por encima es un salto de GPS (teleport)
    // y NO se cuenta. Un furgón de reparto no supera esto ni en autopista.
    private static readonly MAX_SPEED_KMH = 160;
    // Movimiento mínimo (km) entre dos fixes para contar: por debajo es jitter de
    // GPS con el vehículo parado (los fixes bailan unos metros). ~40 m.
    private static readonly MIN_SEGMENT_KM = 0.04;

    private async distanciaKm(deviceId: string | null, from: Date, to: Date): Promise<number | null> {
        if (!deviceId) return null;
        const pts = await this.prisma.position.findMany({
            where: { device_id: deviceId, timestamp: { gte: from, lte: to } },
            orderBy: { timestamp: 'asc' },
            select: { latitude: true, longitude: true, timestamp: true },
        });
        if (pts.length < 2) return 0;
        let km = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = this.haversineKm(
                { lat: Number(pts[i - 1].latitude), lng: Number(pts[i - 1].longitude) },
                { lat: Number(pts[i].latitude), lng: Number(pts[i].longitude) },
            );
            // Descartar jitter de GPS parado (movimientos ínfimos entre fixes).
            if (d < RecorridosService.MIN_SEGMENT_KM) continue;
            // Descartar teleports: si la velocidad implícita es imposible, es un
            // salto de GPS (coord basura), no distancia real.
            const dtH = (pts[i].timestamp.getTime() - pts[i - 1].timestamp.getTime()) / 3600000;
            if (dtH > 0 && d / dtH > RecorridosService.MAX_SPEED_KMH) continue;
            km += d;
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
                // El chofer debe ver sus consegnas asignadas (PENDIENTE), reprogramadas
                // y también las que ya inició/retiró (RETIRADO): antes RETIRADO no estaba
                // y la consegna en curso desaparecía de su lista. Se excluyen solo los
                // estados terminales (ENTREGADO, COMPLETADO, CANCELADO, ANULADO).
                estado: { in: ['PENDIENTE', 'PENDING', 'REPROGRAMADO', 'RETIRADO'] },
                fecha: { gte: desde },
            },
            orderBy: { fecha_entrega: 'asc' },
            select: {
                id: true, id_programacion: true, cliente: true,
                lugar_retiro: true, retiros: true, lugar_entrega: true, destinos: true,
                fecha_entrega: true, estado: true,
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
            include: { paradas: { orderBy: { orden: 'asc' } } },
        });
    }

    /**
     * Marca la llegada del chofer a una PARADA del recorrido y guarda su rendición
     * (anticipo + gastos) opcional. Si es la última parada pendiente, además marca
     * el recorrido como EN_DESTINO (para las métricas de la ida).
     */
    async llegadaParada(
        tenantId: string,
        recorridoId: string,
        paradaId: string,
        trabajadorId: string,
        body: { anticipo?: number; abono_de?: string; gastos?: any; nota?: string; entregado?: boolean; foto_bolla?: string[] },
    ) {
        const r = await this.getOwned(tenantId, recorridoId, trabajadorId);
        const parada = await this.prisma.recorridoParada.findFirst({
            where: { id: paradaId, recorrido_id: r.id, tenant_id: tenantId },
        });
        if (!parada) throw new NotFoundException('Parada no encontrada.');

        // La parada de RETORNO solo se marca en el tramo de vuelta (tras "Regresar").
        if (parada.es_retorno && r.estado !== 'EN_RUTA_VUELTA') {
            throw new BadRequestException('Primero pulsa "Regresar al origen" para volver a la base.');
        }

        const now = new Date();

        // Km/min GPS del TRAMO hasta esta parada (solo informativo, para comparar
        // tramo a tramo contra lo que reporta DHL — no toca ida_km/vuelta_km/total_km).
        let kmTramo: number | null = null;
        let minTramo: number | null = null;
        if (!parada.llegada_en) {
            let desde: Date | null;
            if (parada.es_retorno) {
                desde = r.retorno_en ?? r.iniciado_en;
            } else if (parada.orden === 1) {
                desde = r.iniciado_en;
            } else {
                const anterior = await this.prisma.recorridoParada.findFirst({
                    where: { recorrido_id: r.id, orden: parada.orden - 1 },
                    select: { llegada_en: true },
                });
                desde = anterior?.llegada_en ?? r.iniciado_en;
            }
            if (desde) {
                kmTramo = await this.distanciaKm(r.device_id, desde, now);
                minTramo = Math.round((now.getTime() - desde.getTime()) / 60000);
            }
        }

        await this.prisma.recorridoParada.update({
            where: { id: parada.id },
            data: {
                llegada_en: parada.llegada_en ?? now,
                anticipo: body?.anticipo != null ? Number(body.anticipo) : parada.anticipo,
                abono_de: body?.abono_de ?? parada.abono_de,
                gastos: body?.gastos ?? parada.gastos ?? undefined,
                nota: body?.nota ?? parada.nota,
                entregado: body?.entregado ?? parada.entregado,
                foto_bolla: body?.foto_bolla ?? parada.foto_bolla,
                km_tramo: parada.llegada_en ? undefined : kmTramo,
                min_tramo: parada.llegada_en ? undefined : minTramo,
            },
        });

        // Llegada a la parada de RETORNO = llegó al origen → cierra el recorrido
        // (calcula la vuelta, marca COMPLETADO y libera al chofer/vehículo).
        if (parada.es_retorno) {
            return this.finalizar(tenantId, r.id, trabajadorId);
        }

        // Los gastos (peajes mancato, combustible…) que el chofer rinde en la parada se
        // reflejan EN EL ACTO en la operación → aparecen en el panel de Peajes/Combustible
        // sin esperar al cierre del recorrido (antes solo se consolidaban al finalizar, y
        // si el recorrido quedaba sin cerrar el mancato no llegaba nunca al panel).
        if (r.programacion_id) {
            await this.consolidarGastosDesdeParadas(tenantId, r, now);
        }

        // ¿Quedan paradas de ENTREGA pendientes? (la de retorno no cuenta para la ida).
        // Si esta era la última entrega, cerramos el tramo de ida.
        const pendientes = await this.prisma.recorridoParada.count({
            where: { recorrido_id: r.id, llegada_en: null, es_retorno: false },
        });
        if (pendientes === 0 && r.estado === 'EN_RUTA_IDA') {
            const km = await this.distanciaKm(r.device_id, r.iniciado_en, now);
            await this.prisma.recorrido.update({
                where: { id: r.id },
                data: {
                    estado: 'EN_DESTINO',
                    llegada_en: now,
                    ida_km: km,
                    ida_min: Math.round((now.getTime() - r.iniciado_en.getTime()) / 60000),
                },
            });
        }

        return this.prisma.recorrido.findUnique({
            where: { id: r.id },
            include: { paradas: { orderBy: { orden: 'asc' } } },
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
        // Estimado de la RUTA COMPLETA: es lo que cuenta como km/tiempo del recorrido
        // al finalizar (ver estimarRuta / finalizar).
        const est = await this.estimarRuta(prog);

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
                esperado_km: est?.km ?? null,
                esperado_min: est?.min ?? null,
                estado: 'EN_RUTA_IDA',
            },
        });

        // Paradas del recorrido: destino principal (lugar_entrega) + destinos[]
        // adicionales, en orden. El chofer marcará la llegada de cada una.
        const destinos = Array.isArray((prog as any).destinos) ? (prog as any).destinos : [];
        const stops = [prog.lugar_entrega, ...destinos]
            .map((s: any) => (s || '').trim())
            .filter(Boolean);
        if (stops.length > 0) {
            const data: any[] = stops.map((label, i) => ({
                recorrido_id: recorrido.id,
                tenant_id: tenantId,
                orden: i + 1,
                label,
            }));
            // Retorno automático: el chofer siempre vuelve al origen (punto verde).
            // Se añade como parada final para cerrar la trazabilidad (ida + vuelta) y
            // poder registrar el peaje/gasto de regreso. Requiere un origen conocido.
            const origen = (prog.lugar_retiro || '').trim();
            if (origen) {
                data.push({
                    recorrido_id: recorrido.id,
                    tenant_id: tenantId,
                    orden: stops.length + 1,
                    label: origen,
                    es_retorno: true,
                });
            }
            await this.prisma.recorridoParada.createMany({ data });
        }

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

    /**
     * Consolida los gastos rendidos en las paradas del recorrido dentro de la
     * operación (GastoOperacion) por FUSIÓN — nunca delete+create:
     *  - un gasto ya consolidado conserva su fila (id, fecha real, estado de pago y
     *    fecha límite que el admin marcó en Peajes) aunque se vuelva a consolidar;
     *  - los gastos cargados directo en la operación (supervisor / rendición de
     *    cierre) NO se tocan;
     *  - solo se borra un gasto consolidado cuya parada ya no lo contiene (el chofer
     *    lo quitó al reabrir la parada).
     * Es idempotente: se llama en cada llegada a parada y al finalizar.
     */
    private async consolidarGastosDesdeParadas(
        tenantId: string,
        r: { id: string; programacion_id: string | null; trabajador_id: string | null; vehiculo_id: string | null },
        now: Date,
    ): Promise<{ abonosRuta: number }> {
        const paradas = await this.prisma.recorridoParada.findMany({
            where: { recorrido_id: r.id, tenant_id: tenantId },
            orderBy: { orden: 'asc' },
        });
        const abonosRuta = paradas.reduce((s, p) => s + (Number(p.anticipo) || 0), 0);
        // Recorrido legacy sin paradas: conserva los gastos que rindió el chofer al cierre.
        if (!r.programacion_id || paradas.length === 0) return { abonosRuta };
        const progId = r.programacion_id;

        const entrantes: GastoEntrante[] = paradas.flatMap((p) =>
            (Array.isArray(p.gastos) ? (p.gastos as any[]) : []).map((g: any) => ({
                programacion_id: progId,
                tipo: String(g.tipo || 'OTRO'),
                monto: Number(g.monto) || 0,
                // Fecha REAL del gasto = cuando el chofer llegó a esa parada (no la de cierre).
                fecha: p.llegada_en ?? now,
                descripcion: g.descripcion || (p.label ? `Parada · ${p.label}` : null),
                numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null,
                link_peaje: g.tipo === 'PEAJE' ? (g.link_peaje || null) : null,
                comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes.filter(Boolean) : [],
                pagado_por_chofer: g.pagado_por_chofer !== false,
                parada_id: p.id,
                trabajador_id: r.trabajador_id || null,
                targa: r.vehiculo_id || null,
                tenant_id: tenantId,
            })));
        const existentes = await this.prisma.gastoOperacion.findMany({
            where: { programacion_id: progId }, select: GASTO_SYNC_SELECT, orderBy: { creado_en: 'asc' },
        });
        const paradaIds = new Set(paradas.map((p) => p.id));
        const plan = planificarSyncGastos(existentes, entrantes, (row) => !!row.parada_id && paradaIds.has(row.parada_id));
        await aplicarPlanGastos(this.prisma, plan);
        return { abonosRuta };
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

        // ----- Total del recorrido = RUTA PLANEADA (regla del empresario, 2026-09-16):
        // el km y el tiempo que suman al mes son los del estimado de Google que se ve
        // sobre el mapa en Operaciones (esperado_km/esperado_min), NO el GPS. El celular
        // pierde tramos (batería, túneles, app en segundo plano) y dejaba a los choferes
        // con km recortados (p. ej. 23.8 km de un viaje de 132). El GPS se sigue
        // guardando (ida_km/vuelta_km, posiciones) como historial: Reporte de Ruta,
        // multas, consultas — pero no decide el pago. -----
        let estKm = Number(r.esperado_km) || 0;
        let estMin = Number(r.esperado_min) || 0;
        if (!(estKm > 0) && r.programacion_id) {
            // Al iniciar no se pudo estimar (Google caído / dirección no geocodificable):
            // se reintenta ahora para no cerrar sin km.
            const prog = await this.prisma.programacion.findFirst({ where: { id: r.programacion_id, tenant_id: tenantId } });
            const est = prog ? await this.estimarRuta(prog) : null;
            if (est) { estKm = est.km; estMin = est.min; data.esperado_km = est.km; data.esperado_min = est.min; }
        }
        // Respaldo si NO hay estimado: el GPS en movimiento (mismo cálculo que el
        // Reporte de Ruta). Queda marcado 'gps' para distinguirlo en pantalla.
        const conRuta = estKm > 0;
        const { distanceKm: gpsKm, movingMin } = !conRuta && r.device_id
            ? await this.gps.getTripKmForPay(r.device_id, r.iniciado_en, now)
            : { distanceKm: 0, movingMin: 0 };
        const finalKm = Math.round((conRuta ? estKm : gpsKm) * 10) / 10;
        const finalMin = Math.round(conRuta && estMin > 0 ? estMin : movingMin);
        data.total_km = finalKm;
        data.total_min = finalMin;
        data.manejo_min = finalMin;
        data.km_fuente = conRuta ? 'ruta' : 'gps';

        const updated = await this.prisma.recorrido.update({ where: { id: r.id }, data });

        if (r.programacion_id) {
            const progId = r.programacion_id;
            // ----- Consolidación FIEL desde las paradas (fuente de verdad) -----
            // Los abonos en ruta y el gasto del RETORNO ocurren DESPUÉS del CONSEGNATO,
            // así que aquí, al cierre, se vuelve a consolidar (por FUSIÓN, ver
            // consolidarGastosDesdeParadas) y se suman los abonos recibidos en ruta.
            const { abonosRuta } = await this.consolidarGastosDesdeParadas(tenantId, r, now);
            // Estampa el km/tiempo FIEL + los abonos de ruta en la operación (su detalle).
            await this.prisma.programacion.updateMany({
                where: { id: progId, tenant_id: tenantId },
                data: { estado: 'ENTREGADO', km: finalKm, tiempo_min: finalMin, abonos_ruta: abonosRuta },
            });
        }
        await this.prisma.trabajador.updateMany({ where: { id: r.trabajador_id, tenant_id: tenantId }, data: { disponible: true } });
        if (r.vehiculo_id) {
            await this.prisma.vehiculo.updateMany({ where: { id: r.vehiculo_id, tenant_id: tenantId }, data: { disponible: true } });
        }
        return updated;
    }

    // Instante "Iniciar" de una consegna que se marcó entregada SIN usar Mi Ruta:
    // fecha de la operación + hora de retiro (hora italiana). Sin hora de retiro,
    // 08:00. Es la base del corte día/noche de sus horas.
    private inicioDesdeProgramacion(prog: { fecha: Date; hora_retiro?: string | null }): Date {
        const m = /^(\d{1,2})[:.h](\d{2})/.exec(String(prog.hora_retiro || '').trim());
        const hh = m ? Math.min(23, parseInt(m[1], 10)) : 8;
        const mm = m ? Math.min(59, parseInt(m[2], 10)) : 0;
        const f = prog.fecha;
        const local = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), hh, mm);
        return new Date(local - offsetRomaMin(new Date(local)) * 60000);
    }

    /**
     * Consegna marcada entregada (ENTREGADO/CONSEGNATO) sin que el chofer haya
     * usado "Iniciar ruta": crea un recorrido COMPLETADO automático (auto=true) con
     * el estimado de la ruta como km/tiempo, para que igual sume a su mes. El mes
     * y el pago leen SOLO recorridos, así que sin esto la consegna no contaba.
     * Idempotente: si ya existe un recorrido (no cancelado) de la operación, no hace
     * nada. `aplicar=false` solo calcula (para el reproceso en modo prueba).
     */
    async asegurarRecorridoDeEntrega(
        tenantId: string,
        prog: { id: string; trabajador_id?: string | null; fecha: Date; hora_retiro?: string | null; lugar_retiro?: string | null; lugar_entrega?: string | null; retiros?: any; destinos?: any; km?: any; tiempo_min?: any },
        aplicar = true,
    ): Promise<{ creado: boolean; trabajador_id?: string; km?: number; min?: number; motivo?: string }> {
        if (!prog.trabajador_id) return { creado: false, motivo: 'sin chofer' };
        const existente = await this.prisma.recorrido.findFirst({
            where: { tenant_id: tenantId, programacion_id: prog.id, estado: { not: 'CANCELADO' } },
            select: { id: true },
        });
        if (existente) return { creado: false, motivo: 'ya tiene recorrido' };
        // trabajador_id de la operación puede ser UUID o código (G036).
        const trab = await this.prisma.trabajador.findFirst({
            where: { tenant_id: tenantId, OR: [{ id: prog.trabajador_id }, { id_trabajador: prog.trabajador_id }] },
            select: { id: true },
        });
        if (!trab) return { creado: false, motivo: 'chofer no encontrado' };
        const est = await this.estimarRuta(prog);
        if (!est) return { creado: false, motivo: 'sin estimado de ruta (direcciones)' };
        const iniciado = this.inicioDesdeProgramacion(prog);
        const finalizado = new Date(iniciado.getTime() + est.min * 60000);
        if (aplicar) {
            await this.prisma.recorrido.create({
                data: {
                    tenant_id: tenantId, trabajador_id: trab.id, programacion_id: prog.id, auto: true,
                    origen_label: prog.lugar_retiro ?? null, destino_label: prog.lugar_entrega ?? null,
                    estado: 'COMPLETADO', iniciado_en: iniciado, llegada_en: finalizado, finalizado_en: finalizado,
                    esperado_km: est.km, esperado_min: est.min,
                    total_km: est.km, total_min: est.min, manejo_min: est.min, km_fuente: 'ruta',
                },
            });
            // Km/tiempo de la operación solo si no los tenía (un km escrito a mano se respeta).
            const dataProg: any = {};
            if (!(Number(prog.km) > 0)) dataProg.km = est.km;
            if (!(Number(prog.tiempo_min) > 0)) dataProg.tiempo_min = est.min;
            if (Object.keys(dataProg).length) await this.prisma.programacion.updateMany({ where: { id: prog.id, tenant_id: tenantId }, data: dataProg });
        }
        return { creado: true, trabajador_id: trab.id, km: est.km, min: est.min };
    }

    /**
     * Un supervisor corrigió a mano el km/tiempo de la operación: se refleja en su
     * recorrido (total_km/total_min, km_fuente='manual') para que el mes del chofer
     * cuadre con lo corregido. El reproceso respeta los 'manual'.
     */
    async aplicarCorreccionManual(tenantId: string, programacionId: string, km?: number | null, tiempoMin?: number | null) {
        const r = await this.prisma.recorrido.findFirst({
            where: { tenant_id: tenantId, programacion_id: programacionId, estado: 'COMPLETADO' },
            orderBy: { finalizado_en: 'desc' },
            select: { id: true, total_km: true, total_min: true },
        });
        if (!r) return;
        const data: any = {};
        if (km != null && Number.isFinite(km) && Math.abs(km - (Number(r.total_km) || 0)) > 0.15) data.total_km = Math.round(km * 10) / 10;
        if (tiempoMin != null && Number.isFinite(tiempoMin) && Math.abs(tiempoMin - (Number(r.total_min) || 0)) > 0.5) {
            data.total_min = Math.round(tiempoMin); data.manejo_min = Math.round(tiempoMin);
        }
        if (!Object.keys(data).length) return;
        await this.prisma.recorrido.update({ where: { id: r.id }, data: { ...data, km_fuente: 'manual' } });
    }

    /**
     * Reproceso masivo (one-off, regla 2026-09-16): pasa TODOS los recorridos
     * completados del rango a km/tiempo = estimado de la ruta, y crea recorridos
     * automáticos para las consegnas entregadas sin recorrido. `aplicar=false`
     * (modo prueba) solo devuelve el antes/después por chofer sin escribir nada.
     * Respeta los recorridos marcados 'manual'.
     */
    async reprocesarKmRuta(opts: { desde: Date; hasta: Date; tenantId?: string; aplicar: boolean }) {
        const { desde, hasta, aplicar } = opts;
        const whereTenant = opts.tenantId ? { tenant_id: opts.tenantId } : {};
        const recorridos = await this.prisma.recorrido.findMany({
            where: { ...whereTenant, estado: 'COMPLETADO', finalizado_en: { gte: desde, lte: hasta } },
            orderBy: { finalizado_en: 'asc' },
        });
        const progIds = Array.from(new Set(recorridos.map((r) => r.programacion_id).filter(Boolean) as string[]));
        const progs = progIds.length ? await this.prisma.programacion.findMany({ where: { id: { in: progIds } } }) : [];
        const progById = new Map(progs.map((p) => [p.id, p]));

        type Fila = { recorrido_id: string; programacion_id: string | null; cliente: string | null; fecha: Date | null; km_antes: number; km_despues: number; min_antes: number; min_despues: number; fuente_antes: string | null; accion: string };
        const filas: Fila[] = [];
        const porChofer = new Map<string, { km_antes: number; km_despues: number; recorridos: number; auto_creados: number }>();
        const acc = (tid: string, antes: number, despues: number, auto = false) => {
            const c = porChofer.get(tid) || { km_antes: 0, km_despues: 0, recorridos: 0, auto_creados: 0 };
            c.km_antes += antes; c.km_despues += despues; c.recorridos += 1; if (auto) c.auto_creados += 1;
            porChofer.set(tid, c);
        };

        for (const r of recorridos) {
            const prog = r.programacion_id ? progById.get(r.programacion_id) : null;
            const kmAntes = Number(r.total_km) || 0;
            const minAntes = Number(r.total_min) || 0;
            if (r.km_fuente === 'manual') {
                filas.push({ recorrido_id: r.id, programacion_id: r.programacion_id, cliente: prog?.cliente ?? null, fecha: r.finalizado_en, km_antes: kmAntes, km_despues: kmAntes, min_antes: minAntes, min_despues: minAntes, fuente_antes: r.km_fuente, accion: 'respetado (manual)' });
                acc(r.trabajador_id, kmAntes, kmAntes);
                continue;
            }
            let estKm = Number(r.esperado_km) || 0;
            let estMin = Number(r.esperado_min) || 0;
            let recalculado = false;
            if (!(estKm > 0) && prog) {
                const est = await this.estimarRuta(prog);
                if (est) { estKm = est.km; estMin = est.min; recalculado = true; }
            }
            if (!(estKm > 0)) {
                filas.push({ recorrido_id: r.id, programacion_id: r.programacion_id, cliente: prog?.cliente ?? null, fecha: r.finalizado_en, km_antes: kmAntes, km_despues: kmAntes, min_antes: minAntes, min_despues: minAntes, fuente_antes: r.km_fuente, accion: 'sin estimado: se deja como está' });
                acc(r.trabajador_id, kmAntes, kmAntes);
                continue;
            }
            const kmDespues = Math.round(estKm * 10) / 10;
            const minDespues = Math.round(estMin > 0 ? estMin : minAntes);
            filas.push({ recorrido_id: r.id, programacion_id: r.programacion_id, cliente: prog?.cliente ?? null, fecha: r.finalizado_en, km_antes: kmAntes, km_despues: kmDespues, min_antes: minAntes, min_despues: minDespues, fuente_antes: r.km_fuente, accion: recalculado ? 'ruta (estimado recalculado)' : 'ruta' });
            acc(r.trabajador_id, kmAntes, kmDespues);
            if (aplicar) {
                await this.prisma.recorrido.update({
                    where: { id: r.id },
                    data: {
                        total_km: kmDespues, total_min: minDespues, manejo_min: minDespues, km_fuente: 'ruta',
                        ...(recalculado ? { esperado_km: estKm, esperado_min: estMin } : {}),
                    },
                });
                if (r.programacion_id) {
                    await this.prisma.programacion.updateMany({ where: { id: r.programacion_id }, data: { km: kmDespues, tiempo_min: minDespues } });
                }
            }
        }

        // Consegnas entregadas en el rango SIN recorrido → recorrido automático.
        const entregadas = await this.prisma.programacion.findMany({
            where: {
                ...whereTenant,
                fecha: { gte: desde, lte: hasta },
                OR: [{ estado_consegna: 'CONSEGNATO' }, { estado: { in: ['ENTREGADO', 'COMPLETED'] } }],
            },
            orderBy: { fecha: 'asc' },
        });
        const conRecorrido = new Set(
            (await this.prisma.recorrido.findMany({
                where: { programacion_id: { in: entregadas.map((p) => p.id) }, estado: { not: 'CANCELADO' } },
                select: { programacion_id: true },
            })).map((x) => x.programacion_id),
        );
        const autos: Array<{ programacion_id: string; cliente: string | null; fecha: Date; km?: number; min?: number; motivo?: string }> = [];
        for (const p of entregadas) {
            if (conRecorrido.has(p.id)) continue;
            const res = await this.asegurarRecorridoDeEntrega(p.tenant_id, p, aplicar);
            autos.push({ programacion_id: p.id, cliente: p.cliente, fecha: p.fecha, km: res.km, min: res.min, motivo: res.creado ? undefined : res.motivo });
            if (res.creado && res.trabajador_id) acc(res.trabajador_id, 0, res.km || 0, true);
        }

        const trabIds = Array.from(porChofer.keys());
        const trabs = trabIds.length ? await this.prisma.trabajador.findMany({ where: { id: { in: trabIds } }, select: { id: true, nombre_completo: true, id_trabajador: true } }) : [];
        const nombre = new Map(trabs.map((t) => [t.id, `${t.id_trabajador ? t.id_trabajador + ' · ' : ''}${t.nombre_completo}`]));
        const resumen = trabIds.map((id) => {
            const c = porChofer.get(id)!;
            return { trabajador: nombre.get(id) || id, recorridos: c.recorridos, auto_creados: c.auto_creados, km_antes: Math.round(c.km_antes * 10) / 10, km_despues: Math.round(c.km_despues * 10) / 10, diferencia: Math.round((c.km_despues - c.km_antes) * 10) / 10 };
        }).sort((a, b) => b.diferencia - a.diferencia);

        return {
            modo: aplicar ? 'APLICADO' : 'PRUEBA (sin cambios)',
            rango: { desde, hasta },
            totales: {
                recorridos: recorridos.length,
                km_antes: Math.round(resumen.reduce((s, x) => s + x.km_antes, 0) * 10) / 10,
                km_despues: Math.round(resumen.reduce((s, x) => s + x.km_despues, 0) * 10) / 10,
                consegnas_sin_recorrido: autos.length,
                auto_creados: autos.filter((a) => !a.motivo).length,
            },
            por_chofer: resumen,
            consegnas_sin_recorrido: autos,
            detalle: filas,
        };
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

        // Resolver nombres de chofer, placas y la operación (para cliente + hora límite).
        const trabIds = Array.from(new Set(recorridos.map((r) => r.trabajador_id)));
        const vehIds = Array.from(new Set(recorridos.map((r) => r.vehiculo_id).filter(Boolean) as string[]));
        const progIds = Array.from(new Set(recorridos.map((r) => r.programacion_id).filter(Boolean) as string[]));
        const [trabs, vehs, progs] = await Promise.all([
            this.prisma.trabajador.findMany({ where: { id: { in: trabIds } }, select: { id: true, nombre_completo: true, url_foto: true } }),
            vehIds.length ? this.prisma.vehiculo.findMany({ where: { id: { in: vehIds } }, select: { id: true, placa: true } }) : Promise.resolve([]),
            progIds.length ? this.prisma.programacion.findMany({ where: { id: { in: progIds } }, select: { id: true, cliente: true, fecha_entrega: true } }) : Promise.resolve([]),
        ]);
        const trabMap = new Map(trabs.map((t) => [t.id, t]));
        const vehMap = new Map(vehs.map((v) => [v.id, v]));
        const progMap = new Map(progs.map((p) => [p.id, p]));
        const now = Date.now();

        // Paradas intermedias (orígenes/destinos adicionales), para dibujar la
        // ruta real en el mapa en vez de una línea recta origen→destino.
        const recorridoIds = recorridos.map((r) => r.id);
        const paradas = await this.prisma.recorridoParada.findMany({
            where: { recorrido_id: { in: recorridoIds } },
            orderBy: { orden: 'asc' },
            select: { recorrido_id: true, orden: true, label: true, es_retorno: true, entregado: true },
        });
        const paradasMap = new Map<string, typeof paradas>();
        for (const p of paradas) {
            const list = paradasMap.get(p.recorrido_id) || [];
            list.push(p);
            paradasMap.set(p.recorrido_id, list);
        }

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

                const prog = r.programacion_id ? progMap.get(r.programacion_id) : null;
                // Minutos que faltan (o de retraso, si es negativo) para la hora límite de entrega.
                const restanEntregaMin = prog?.fecha_entrega
                    ? Math.round((new Date(prog.fecha_entrega).getTime() - now) / 60000)
                    : null;

                return {
                    id: r.id,
                    trabajador_id: r.trabajador_id,
                    cliente: prog?.cliente || null,
                    fecha_entrega: prog?.fecha_entrega || null,
                    // + = faltan min para la entrega; - = ya está retrasado.
                    restanEntregaMin,
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
                    paradas: (paradasMap.get(r.id) || []).map((p) => ({
                        orden: p.orden, label: p.label, es_retorno: p.es_retorno, entregado: p.entregado,
                    })),
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

    /** Resumen del chofer (SIN ganancias): entregas del mes por estado + gastos
     *  del mes (combustible/peajes). El empresario prefiere no mostrarle ingresos. */
    async resumenChofer(tenantId: string, trabajadorId: string) {
        const empty = {
            entregas: { total: 0, entregadas: 0, canceladas: 0, pendientes: 0, enRuta: 0 },
            gastos: { combustible: 0, peajes: 0, otros: 0, total: 0 },
            anticipo: 0,
            saldo: 0,
            moneda: 'EUR',
        };
        if (!trabajadorId) return empty;

        const trab = await this.prisma.trabajador.findFirst({
            where: { id: trabajadorId, tenant_id: tenantId },
            select: { id: true, id_trabajador: true },
        });
        const codigos = [trabajadorId, trab?.id_trabajador].filter(Boolean) as string[];

        // Inicio del mes en hora de Italia.
        const now = new Date();
        const off = this.tzOffsetMin(now);
        const localNow = new Date(now.getTime() + off * 60000);
        const startMes = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) - off * 60000);

        const [progs, gastos] = await Promise.all([
            this.prisma.programacion.findMany({
                where: { tenant_id: tenantId, trabajador_id: { in: codigos } },
                select: { estado: true, fecha_entrega: true, fecha: true, anticipo: true },
            }),
            this.prisma.gastoOperacion.findMany({
                where: { tenant_id: tenantId, trabajador_id: { in: codigos } },
                select: { tipo: true, monto: true, fecha: true, creado_en: true },
            }),
        ]);

        const entregas = { total: 0, entregadas: 0, canceladas: 0, pendientes: 0, enRuta: 0 };
        // Bonifico = suma de anticipos (dinero adelantado al chofer) del mes.
        let anticipo = 0;
        for (const p of progs) {
            const ref = p.fecha_entrega || p.fecha;
            if (!ref || new Date(ref) < startMes) continue;
            entregas.total++;
            anticipo += Number(p.anticipo) || 0;
            const e = (p.estado || 'PENDIENTE').toUpperCase();
            if (e === 'ENTREGADO') entregas.entregadas++;
            else if (e === 'CANCELADO') entregas.canceladas++;
            else if (e === 'RETIRADO' || e === 'IN_TRANSIT') entregas.enRuta++;
            else entregas.pendientes++;
        }

        const g = { combustible: 0, peajes: 0, otros: 0, total: 0 };
        for (const x of gastos) {
            const ref = x.fecha || x.creado_en;
            if (!ref || new Date(ref) < startMes) continue;
            const m = Number(x.monto) || 0;
            g.total += m;
            const t = (x.tipo || '').toUpperCase();
            if (t === 'COMBUSTIBLE') g.combustible += m;
            else if (t === 'PEAJE') g.peajes += m;
            else g.otros += m;
        }
        const r2 = (n: number) => Math.round(n * 100) / 100;
        return {
            entregas,
            gastos: { combustible: r2(g.combustible), peajes: r2(g.peajes), otros: r2(g.otros), total: r2(g.total) },
            anticipo: r2(anticipo),           // "Bonifico" — adelanto recibido
            saldo: r2(anticipo - g.total),    // "Saldo" — bonifico menos lo gastado
            moneda: 'EUR',
        };
    }
}
