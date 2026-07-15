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
}
