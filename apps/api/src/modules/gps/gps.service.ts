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

        const startTime = pts[0].t;
        const endTime = pts[pts.length - 1].t;
        const durationMs = endTime - startTime;

        // Detección de paradas: puntos que se quedan dentro de un radio pequeño
        // durante al menos STOP_MIN. Robusto ante el ruido del GPS.
        const STOP_RADIUS_M = 60;
        const STOP_MIN_MS = 3 * 60 * 1000; // 3 minutos
        const GAP_MERGE_KM = 0.15; // si entre dos paradas apenas se movió, es la misma
        const rawStops: any[] = [];
        let i = 0;
        while (i < pts.length) {
            let j = i;
            let sumLat = pts[i].lat, sumLng = pts[i].lng, cnt = 1;
            while (j + 1 < pts.length) {
                const dM = this.getDistanceFromLatLonInKm(pts[i].lat, pts[i].lng, pts[j + 1].lat, pts[j + 1].lng) * 1000;
                if (dM > STOP_RADIUS_M) break;
                j++; sumLat += pts[j].lat; sumLng += pts[j].lng; cnt++;
            }
            const dwellMs = pts[j].t - pts[i].t;
            if (dwellMs >= STOP_MIN_MS) {
                rawStops.push({ iStart: i, iEnd: j, sumLat, sumLng, cnt });
                i = j + 1;
            } else {
                i++;
            }
        }

        // Fusionar paradas contiguas si el vehículo casi no se movió entre ellas
        // (una sola parada real que el GPS partió por saltos de señal).
        const merged: any[] = [];
        for (const s of rawStops) {
            const prev = merged[merged.length - 1];
            if (prev) {
                const gapKm = cumDist[s.iStart] - cumDist[prev.iEnd];
                if (gapKm < GAP_MERGE_KM) {
                    prev.iEnd = s.iEnd;
                    prev.sumLat += s.sumLat; prev.sumLng += s.sumLng; prev.cnt += s.cnt;
                    continue;
                }
            }
            merged.push({ ...s });
        }

        const stops = merged.map(s => ({
            lat: s.sumLat / s.cnt,
            lng: s.sumLng / s.cnt,
            startTime: new Date(pts[s.iStart].t).toISOString(),
            endTime: new Date(pts[s.iEnd].t).toISOString(),
            durationMin: Math.round((pts[s.iEnd].t - pts[s.iStart].t) / 60000),
            _tStart: pts[s.iStart].t, _tEnd: pts[s.iEnd].t,
        }));

        const stoppedMs = stops.reduce((a, s) => a + (s._tEnd - s._tStart), 0);
        const movingMs = Math.max(0, durationMs - stoppedMs);
        const avgSpeedKmh = movingMs > 0 ? distanceKm / (movingMs / 3600000) : 0;

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

        // Tramos ("recorridos") entre hitos: Salida → Parada 1 → Parada 2 → … → Llegada.
        // Cada tramo trae su duración (la demora punto a punto) y distancia.
        const milestones = [
            { label: 'Salida', arr: startTime, dep: startTime },
            ...stops.map((s, idx) => ({ label: `Parada ${idx + 1}`, arr: s._tStart, dep: s._tEnd })),
            { label: 'Llegada', arr: endTime, dep: endTime },
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
            });
        }

        // Quitar campos internos de las paradas.
        const cleanStops = stops.map(({ _tStart, _tEnd, ...rest }) => rest);

        return {
            points: pts.length,
            distanceKm: Math.round(distanceKm * 100) / 100,
            durationMin: Math.round(durationMs / 60000),
            movingMin: Math.round(movingMs / 60000),
            stoppedMin: Math.round(stoppedMs / 60000),
            avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
            maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            stops: cleanStops,
            legs,
        };
    }
}
