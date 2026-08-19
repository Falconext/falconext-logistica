import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class GpsService {
    constructor(
        private prisma: PrismaService,
        private mailService: MailService
    ) { }

    // ... (rest of code)

    // Inside checkGeofences, modify the if (eventType) block:
    /* 
       Note: The tool cannot partial match easily inside a large method without context.
       I will use MultiReplace to target specific blocks.
    */

    async registerDevice(data: { imei: string, name: string, model?: string, tenantId: string, vehiculoId?: string, trabajadorId?: string }) {
        return this.prisma.device.create({
            data: {
                imei: data.imei,
                name: data.name,
                model: data.model,
                tenant_id: data.tenantId,
                vehiculo_id: data.vehiculoId,
                trabajador_id: data.trabajadorId || null
            }
        });
    }

    async getDevices(tenantId: string) {
        return this.prisma.device.findMany({
            where: { tenant_id: tenantId },
            include: {
                positions: { take: 1, orderBy: { timestamp: 'desc' } },
                vehiculo: true,
                trabajador: {
                    select: { id: true, nombre_completo: true, cargo: true, url_foto: true, telefono: true }
                }
            }
        });
    }

    // Device de un trabajador aceptando UUID o CÓDIGO (id_trabajador). Las operaciones
    // guardan el código, así que resolvemos código→UUID antes de buscar el dispositivo.
    async getDeviceForTrabajador(tenantId: string, idOrCode: string) {
        const trabajador = await this.prisma.trabajador.findFirst({
            where: { tenant_id: tenantId, OR: [{ id: idOrCode }, { id_trabajador: idOrCode }] },
            select: { id: true },
        });
        if (!trabajador) return { deviceId: null };
        const device = await this.prisma.device.findFirst({
            where: { tenant_id: tenantId, trabajador_id: trabajador.id },
            select: { id: true },
        });
        return { deviceId: device?.id || null };
    }

    // Última ubicación conocida de un trabajador (vía el dispositivo que tiene asignado).
    async getTrabajadorLocation(tenantId: string, trabajadorId: string) {
        const device = await this.prisma.device.findFirst({
            where: { tenant_id: tenantId, trabajador_id: trabajadorId },
            include: {
                vehiculo: { select: { placa: true } },
                positions: { take: 1, orderBy: { timestamp: 'desc' } }
            }
        });

        if (!device) return { device: null, position: null };

        const position = device.positions[0] || null;
        return {
            device: {
                id: device.id,
                name: device.name,
                last_activity: device.last_activity,
                vehiculo_placa: device.vehiculo?.placa || null
            },
            position
        };
    }

    async updateDevice(id: string, tenantId: string, data: { imei?: string, name?: string, model?: string, vehiculoId?: string, trabajadorId?: string }) {
        // Ensure the device belongs to this tenant before updating
        const device = await this.prisma.device.findFirst({
            where: { id, tenant_id: tenantId }
        });

        if (!device) {
            throw new NotFoundException('Device not found');
        }

        return this.prisma.device.update({
            where: { id: device.id },
            data: {
                imei: data.imei,
                name: data.name,
                model: data.model,
                vehiculo_id: data.vehiculoId,
                // Permite asignar o quitar (null) el trabajador cuando el campo viene en el body
                ...(data.trabajadorId !== undefined ? { trabajador_id: data.trabajadorId || null } : {})
            }
        });
    }

    async deleteDevice(id: string, tenantId: string) {
        // Ensure the device belongs to this tenant before deleting
        const device = await this.prisma.device.findFirst({
            where: { id, tenant_id: tenantId }
        });

        if (!device) {
            throw new NotFoundException('Device not found');
        }

        // Clean up related records first (no cascade defined at DB level)
        await this.prisma.$transaction([
            this.prisma.geofenceEvent.deleteMany({ where: { device_id: device.id } }),
            this.prisma.position.deleteMany({ where: { device_id: device.id } }),
            this.prisma.device.delete({ where: { id: device.id } })
        ]);

        return { success: true };
    }

    // Device del usuario autenticado (vía su trabajador vinculado).
    // Devuelve el token durable que la app usa para reportar en segundo plano.
    // Si el trabajador es rastreable y aún no tiene Device, lo crea al vuelo.
    async getMiDispositivo(tenantId: string, trabajadorId: string | null) {
        if (!trabajadorId) {
            return { trackable: false, token: null, deviceId: null, name: null, vehiculoId: null };
        }

        const trabajador = await this.prisma.trabajador.findFirst({
            where: { id: trabajadorId, tenant_id: tenantId },
        });

        if (!trabajador || !trabajador.trackable) {
            return { trackable: false, token: null, deviceId: null, name: null, vehiculoId: null };
        }

        let device = await this.prisma.device.findFirst({
            where: { tenant_id: tenantId, trabajador_id: trabajador.id },
        });

        if (!device) {
            device = await this.prisma.device.create({
                data: {
                    imei: `emp-${trabajador.id_trabajador || trabajador.id}`,
                    name: `Rastreo ${trabajador.nombre_completo}`,
                    tenant_id: tenantId,
                    trabajador_id: trabajador.id,
                },
            });
        }

        return {
            trackable: true,
            token: device.token,
            deviceId: device.id,
            name: device.name,
            vehiculoId: device.vehiculo_id,
        };
    }

    async verifyDeviceToken(token: string) {
        const device = await this.prisma.device.findUnique({
            where: { token: token }
        });
        return !!device;
    }

    async ingestPosition(token: string, data: { lat: number, lng: number, speed?: number, heading?: number, timestamp?: Date, battery?: number }) {
        // 1. Validate Device by Token
        const device = await this.prisma.device.findUnique({
            where: { token }
        });

        if (!device) {
            throw new NotFoundException('Invalid Device Token');
        }

        // 2. Save Position
        const position = await this.prisma.position.create({
            data: {
                device_id: device.id,
                latitude: data.lat,
                longitude: data.lng,
                speed: data.speed,
                heading: data.heading,
                battery: data.battery,
                timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
            }
        });

        // 3. Update Device Last Activity
        await this.prisma.device.update({
            where: { id: device.id },
            data: { last_activity: new Date() }
        });

        // 4. Check Geofences (Async, don't block response)
        this.checkGeofences(device.id, device.tenant_id, data.lat, data.lng).catch(err => console.error("Geofence Error:", err));

        return { success: true, positionId: position.id };
    }

    private async checkGeofences(deviceId: string, tenantId: string, lat: number, lng: number) {
        // Fetch active CIRCLE geofences for this tenant
        const geofences = await this.prisma.geofence.findMany({
            where: { tenant_id: tenantId, type: 'CIRCLE' }
        });

        for (const fence of geofences) {
            if (!fence.latitude || !fence.longitude || !fence.radius) continue;

            const distance = this.getDistanceFromLatLonInKm(lat, lng, fence.latitude, fence.longitude) * 1000; // Meters
            const isInside = distance <= fence.radius;

            // Check last known state to detect CHANGE (Enter/Exit)
            // Optimization: In a real system, cache the last state in Redis.
            // Here we query the last event for this specific fence & device.
            const lastEvent = await this.prisma.geofenceEvent.findFirst({
                where: { device_id: deviceId, geofence_id: fence.id },
                orderBy: { timestamp: 'desc' }
            });

            let eventType = null;

            if (isInside) {
                if (!lastEvent || lastEvent.event_type === 'EXIT') {
                    eventType = 'ENTER';
                }
            } else {
                if (lastEvent && lastEvent.event_type === 'ENTER') {
                    eventType = 'EXIT';
                }
            }

            if (eventType) {
                console.log(`[Geofence] Device ${deviceId} ${eventType} Fence ${fence.name}`);

                // Save Event
                await this.prisma.geofenceEvent.create({
                    data: {
                        device_id: deviceId,
                        geofence_id: fence.id,
                        event_type: eventType
                    }
                });

                // Fetch Vehicle/Device info for Email
                const deviceWithInfo = await this.prisma.device.findUnique({
                    where: { id: deviceId },
                    include: { vehiculo: true }
                });

                // Get User email (Tenant Admin) - For demo, sending to hardcoded or first user of tenant
                // Ideally, fetch Tenant's admin email.
                const adminUser = await this.prisma.user.findFirst({
                    where: { tenant_id: tenantId, role: 'ADMIN' }
                });

                if (adminUser) {
                    const plate = deviceWithInfo?.vehiculo?.placa || deviceWithInfo?.name || 'Desconocido';
                    const time = new Date().toLocaleTimeString();
                    const mapLink = `${process.env.FRONTEND_URL}/operaciones/dispositivos?device=${deviceId}`;

                    await this.mailService.sendGeofenceAlert(adminUser.email, {
                        vehiclePlate: plate,
                        geofenceName: fence.name,
                        eventType: eventType as 'ENTER' | 'EXIT',
                        time: time,
                        mapLink: mapLink
                    });
                }
            }
        }
    }

    private getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
            ;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d;
    }

    private deg2rad(deg: number) {
        return deg * (Math.PI / 180);
    }

    // ---- Enriquecimiento con Google (calles reales + tiempo esperado) ----
    // Key de servidor de Google (Directions), sin restricción de referrer. Todo el
    // ruteo va por Google (sin Mapbox).
    private googleKey(): string {
        return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_DIRECTIONS_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }

    // Tiempo ESPERADO (min) manejando de A a B con tráfico típico, vía Google. null si falla.
    private async directionsEta(from: { lng: number; lat: number }, to: { lng: number; lat: number }): Promise<number | null> {
        const gkey = this.googleKey();
        if (!gkey) return null;
        try {
            const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&departure_time=now&key=${gkey}`;
            const res = await fetch(url);
            const j: any = await res.json();
            const leg = j?.routes?.[0]?.legs?.[0];
            const secs = leg?.duration_in_traffic?.value ?? leg?.duration?.value;
            if (typeof secs === 'number') return secs / 60;
        } catch (e) {
            console.warn('[Google directions] falló:', (e as any)?.message);
        }
        return null;
    }

    // Token de Mapbox para el Map Matching (pega los puntos GPS a las calles reales).
    private mapboxToken(): string {
        return process.env.MAPBOX_TOKEN || '';
    }

    /**
     * Map Matching (Mapbox): ajusta la traza GPS cruda a la red de calles, para que
     * el historial siga las carreteras en vez de unir puntos con líneas rectas.
     * La API acepta máx. 100 coords por petición → se trocea. Devuelve la geometría
     * concatenada [lng,lat][] o null si no hay token / falla (fallback a puntos crudos).
     */
    private async mapMatch(points: { lng: number; lat: number }[]): Promise<[number, number][] | null> {
        const token = this.mapboxToken();
        if (!token || points.length < 2) return null;

        // Submuestreo suave: Mapbox limita a 100 coords/petición. Reducimos si hay
        // demasiados puntos para no cortar el recorrido en muchos trozos.
        const MAX = 100;
        const chunks: { lng: number; lat: number }[][] = [];
        for (let i = 0; i < points.length; i += MAX - 1) {
            // -1 de solape: el último punto de un chunk = primero del siguiente, para
            // que la geometría quede continua al concatenar.
            chunks.push(points.slice(i, i + MAX));
        }

        const out: [number, number][] = [];
        try {
            for (const chunk of chunks) {
                if (chunk.length < 2) continue;
                const coords = chunk.map((p) => `${p.lng},${p.lat}`).join(';');
                // radiuses: tolerancia de ajuste (m) por punto — 25 m absorbe el ruido GPS.
                const radiuses = chunk.map(() => 25).join(';');
                const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}` +
                    `?geometries=geojson&overview=full&tidy=true&radiuses=${radiuses}&access_token=${token}`;
                const res = await fetch(url);
                const j: any = await res.json();
                const g = j?.matchings?.[0]?.geometry?.coordinates as [number, number][] | undefined;
                if (Array.isArray(g) && g.length) {
                    // Evita duplicar el punto de solape entre chunks.
                    for (const c of g) {
                        const last = out[out.length - 1];
                        if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c);
                    }
                }
            }
        } catch (e) {
            console.warn('[Mapbox matching] falló:', (e as any)?.message);
            return null;
        }
        return out.length ? out : null;
    }

    async createGeofence(data: { name: string, description?: string, latitude: number, longitude: number, radius: number, tenantId: string }) {
        return this.prisma.geofence.create({
            data: {
                name: data.name,
                description: data.description,
                type: 'CIRCLE',
                latitude: data.latitude,
                longitude: data.longitude,
                radius: data.radius,
                tenant_id: data.tenantId
            }
        });
    }

    async getGeofences(tenantId: string) {
        return this.prisma.geofence.findMany({
            where: { tenant_id: tenantId }
        });
    }

    // Últimos eventos de entrada/salida de geocercas del tenant (para el Panel de Control).
    async getGeofenceEvents(tenantId: string, limit = 20) {
        const events = await this.prisma.geofenceEvent.findMany({
            where: { geofence: { tenant_id: tenantId } },
            orderBy: { timestamp: 'desc' },
            take: Math.min(Math.max(limit, 1), 100),
            include: {
                geofence: { select: { name: true } },
                device: {
                    select: {
                        name: true,
                        vehiculo: { select: { placa: true } },
                        trabajador: { select: { nombre_completo: true } },
                    },
                },
            },
        });
        return events.map((e) => ({
            id: e.id,
            event_type: e.event_type,
            timestamp: e.timestamp,
            geofence: e.geofence?.name || 'Geocerca',
            label: e.device?.trabajador?.nombre_completo || e.device?.vehiculo?.placa || e.device?.name || 'Dispositivo',
        }));
    }

    async updateGeofence(id: string, tenantId: string, data: { name?: string, description?: string, latitude?: number, longitude?: number, radius?: number }) {
        // Ensure the geofence belongs to this tenant before updating
        const geofence = await this.prisma.geofence.findFirst({
            where: { id, tenant_id: tenantId }
        });

        if (!geofence) {
            throw new NotFoundException('Geofence not found');
        }

        return this.prisma.geofence.update({
            where: { id: geofence.id },
            data: {
                name: data.name,
                description: data.description,
                latitude: data.latitude,
                longitude: data.longitude,
                radius: data.radius
            }
        });
    }

    async deleteGeofence(id: string, tenantId: string) {
        // Ensure the geofence belongs to this tenant before deleting
        const geofence = await this.prisma.geofence.findFirst({
            where: { id, tenant_id: tenantId }
        });

        if (!geofence) {
            throw new NotFoundException('Geofence not found');
        }

        // Clean up related events first (no cascade defined at DB level)
        await this.prisma.$transaction([
            this.prisma.geofenceEvent.deleteMany({ where: { geofence_id: geofence.id } }),
            this.prisma.geofence.delete({ where: { id: geofence.id } })
        ]);

        return { success: true };
    }
    async getHistory(deviceId: string, from: Date, to: Date, limit?: number) {
        return this.prisma.position.findMany({
            where: {
                device_id: deviceId,
                timestamp: {
                    gte: from,
                    lte: to
                }
            },
            orderBy: { timestamp: 'desc' }, // Latest first
            take: limit
        });
    }

    // Análisis de recorrido ("Reporte de Ruta") para un rango de fechas.
    // Convierte las posiciones crudas en métricas que le sirven a la empresa:
    // distancia recorrida, tiempo en movimiento vs detenido, paradas detectadas
    // (dónde y cuánto), velocidad promedio/máxima y el tiempo de cada tramo entre
    // paradas ("demora de un punto a otro").
    async getTripAnalysis(deviceId: string, from: Date, to: Date) {
        const positions = await this.prisma.position.findMany({
            where: { device_id: deviceId, timestamp: { gte: from, lte: to } },
            orderBy: { timestamp: 'asc' },
        });

        const pts = positions
            .map(p => ({
                lat: Number(p.latitude),
                lng: Number(p.longitude),
                speed: p.speed != null ? Number(p.speed) : 0, // m/s (crudo del dispositivo)
                t: new Date(p.timestamp).getTime(),
            }))
            .filter(p => !isNaN(p.lat) && !isNaN(p.lng));

        const empty = {
            points: pts.length,
            distanceKm: 0, durationMin: 0, movingMin: 0, stoppedMin: 0,
            avgSpeedKmh: 0, maxSpeedKmh: 0,
            startTime: pts[0] ? new Date(pts[0].t).toISOString() : null,
            endTime: pts.length ? new Date(pts[pts.length - 1].t).toISOString() : null,
            stops: [] as any[], legs: [] as any[],
        };
        if (pts.length < 2) return empty;

        // Distancia total + velocidad máxima (filtrando saltos absurdos del GPS).
        let distanceKm = 0;
        let maxSpeedKmh = 0;
        const cumDist: number[] = [0]; // km acumulados hasta el punto i
        for (let i = 1; i < pts.length; i++) {
            const d = this.getDistanceFromLatLonInKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
            distanceKm += d;
            cumDist[i] = distanceKm;
        }
        for (const p of pts) {
            const kmh = p.speed * 3.6;
            if (kmh > maxSpeedKmh && kmh < 200) maxSpeedKmh = kmh;
        }

        // Clasificar cada tramo por su VELOCIDAD REAL: movimiento vs detenido/idle.
        // Antes se contaba como "en movimiento" todo lo que no fuera una parada por
        // radio (60m/3min), pero la DERIVA del GPS con el vehículo quieto se escapa de
        // ese radio y se contaba como manejo (bug: 8h a 4.4 km/h = ruido, no ruta).
        // Ahora: por debajo de MOVING_MIN_KMH es detenido y NO suma tiempo ni distancia.
        const MOVING_MIN_KMH = 5;   // < 5 km/h => detenido (motor apagado / deriva GPS)
        const JUMP_MAX_KMH = 200;   // saltos irreales del GPS: ni movimiento ni distancia
        const STOP_MIN_MS = 3 * 60 * 1000; // una parada real dura >= 3 min
        const segs: { a: number; dtMs: number; km: number; moving: boolean }[] = [];
        for (let k = 1; k < pts.length; k++) {
            const dtMs = pts[k].t - pts[k - 1].t;
            if (dtMs <= 0) continue;
            const km = cumDist[k] - cumDist[k - 1];
            const kmh = km / (dtMs / 3600000);
            segs.push({ a: k, dtMs, km, moving: kmh >= MOVING_MIN_KMH && kmh < JUMP_MAX_KMH });
        }

        // Recortar idle inicial/final: el recorrido "real" va del primer al último
        // movimiento (el empresario quiere solo el tramo manejado, no el parqueo previo
        // ni el rato que el GPS siguió corriendo después de la entrega).
        const firstMove = segs.findIndex((s) => s.moving);
        let lastMove = -1;
        for (let k = segs.length - 1; k >= 0; k--) if (segs[k].moving) { lastMove = k; break; }

        let startTime = pts[0].t;
        let endTime = pts[pts.length - 1].t;
        let movingMs = 0;
        let stoppedMs = 0;
        distanceKm = 0; // recomputar: solo distancia recorrida EN MOVIMIENTO (sin deriva)
        const stops: any[] = [];
        if (firstMove !== -1) {
            const trimmed = segs.slice(firstMove, lastMove + 1);
            startTime = pts[trimmed[0].a - 1].t;
            endTime = pts[trimmed[trimmed.length - 1].a].t;
            // Agrupar tramos idle consecutivos (dentro del tramo real) en paradas.
            let g: { t0: number; t1: number; sumLat: number; sumLng: number; cnt: number } | null = null;
            const flush = () => {
                if (g && (g.t1 - g.t0) >= STOP_MIN_MS) {
                    stops.push({
                        lat: g.sumLat / g.cnt, lng: g.sumLng / g.cnt,
                        startTime: new Date(g.t0).toISOString(), endTime: new Date(g.t1).toISOString(),
                        durationMin: Math.round((g.t1 - g.t0) / 60000),
                        _tStart: g.t0, _tEnd: g.t1,
                    });
                }
                g = null;
            };
            for (const s of trimmed) {
                if (s.moving) {
                    movingMs += s.dtMs; distanceKm += s.km; flush();
                } else {
                    stoppedMs += s.dtMs;
                    const p0 = pts[s.a - 1], p1 = pts[s.a];
                    if (!g) g = { t0: p0.t, t1: p1.t, sumLat: p0.lat + p1.lat, sumLng: p0.lng + p1.lng, cnt: 2 };
                    else { g.t1 = p1.t; g.sumLat += p1.lat; g.sumLng += p1.lng; g.cnt++; }
                }
            }
            flush();
        }
        const durationMs = endTime - startTime;

        // Distancia recorrida dentro de una ventana de tiempo [a, b].
        const distInWindow = (a: number, b: number) => {
            let acc = 0;
            for (let k = 1; k < pts.length; k++) {
                if (pts[k].t <= a) continue;
                if (pts[k - 1].t >= b) break;
                acc += cumDist[k] - cumDist[k - 1];
            }
            return acc;
        };

        // Tramos ("recorridos") entre hitos: Salida → Parada 1 → … → Llegada.
        // Cada tramo trae su duración (la demora real) y distancia.
        const milestones = [
            { label: 'Salida', arr: startTime, dep: startTime, lat: pts[0].lat, lng: pts[0].lng },
            ...stops.map((s, idx) => ({ label: `Parada ${idx + 1}`, arr: s._tStart, dep: s._tEnd, lat: s.lat, lng: s.lng })),
            { label: 'Llegada', arr: endTime, dep: endTime, lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng },
        ];
        const legs: any[] = [];
        for (let k = 0; k < milestones.length - 1; k++) {
            const legStart = milestones[k].dep;
            const legEnd = milestones[k + 1].arr;
            const legMs = legEnd - legStart;
            if (legMs <= 0) continue;
            const legKm = distInWindow(legStart, legEnd);
            legs.push({
                from: milestones[k].label,
                to: milestones[k + 1].label,
                startTime: new Date(legStart).toISOString(),
                endTime: new Date(legEnd).toISOString(),
                durationMin: Math.round(legMs / 60000),
                distanceKm: Math.round(legKm * 100) / 100,
                avgSpeedKmh: legMs > 0 ? Math.round((legKm / (legMs / 3600000)) * 10) / 10 : 0,
                expectedMin: null as number | null, // tiempo que "debería" tardar (Mapbox)
                delayMin: null as number | null,    // real - esperado (+ = con demora)
                _from: { lat: milestones[k].lat, lng: milestones[k].lng },
                _to: { lat: milestones[k + 1].lat, lng: milestones[k + 1].lng },
            });
        }

        // --- Estimación de tiempo con Google (best-effort; si falla, se omite) ---
        // Tiempo ESPERADO por tramo (Directions con tráfico) vs real → demora.
        // (La distancia se mide del GPS denso: es el camino real, más fiable que
        //  un match con submuestreo que "corta camino".)
        let expectedMovingMin = 0;
        let hasExpected = false;
        let etaCalls = 0;
        for (const leg of legs) {
            if (leg.distanceKm < 0.2) continue;   // tramos triviales (ruido): no gastar llamada
            if (etaCalls >= 20) break;            // cota de latencia
            etaCalls++;
            const eta = await this.directionsEta(leg._from, leg._to);
            if (eta != null) {
                leg.expectedMin = Math.round(eta);
                leg.delayMin = Math.round(leg.durationMin - eta);
                expectedMovingMin += eta;
                hasExpected = true;
            }
        }
        legs.forEach(l => { delete l._from; delete l._to; });

        const avgSpeedKmhFinal = movingMs > 0 ? distanceKm / (movingMs / 3600000) : 0;

        // Quitar campos internos de las paradas.
        const cleanStops = stops.map(({ _tStart, _tEnd, ...rest }) => rest);

        // Map Matching (Mapbox): ajusta la traza a las calles reales para que el
        // historial siga las carreteras. Best-effort: si falla, el front cae a los
        // puntos GPS crudos (líneas rectas).
        const matched = await this.mapMatch(pts.map(p => ({ lng: p.lng, lat: p.lat })));

        return {
            points: pts.length,
            distanceKm: Math.round(distanceKm * 100) / 100,
            distanceSource: 'gps',
            durationMin: Math.round(durationMs / 60000),
            movingMin: Math.round(movingMs / 60000),
            stoppedMin: Math.round(stoppedMs / 60000),
            expectedMovingMin: hasExpected ? Math.round(expectedMovingMin) : null,
            delayMin: hasExpected ? Math.round(movingMs / 60000 - expectedMovingMin) : null,
            avgSpeedKmh: Math.round(avgSpeedKmhFinal * 10) / 10,
            maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            matchedGeometry: matched ? { type: 'LineString', coordinates: matched } : null,
            stops: cleanStops,
            legs,
        };
    }
}
