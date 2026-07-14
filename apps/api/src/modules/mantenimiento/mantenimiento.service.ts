import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MantenimientoService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.mantenimiento.create({
            data: {
                vehiculo_id: data.vehiculo_id,
                tipo: data.tipo,
                fecha: new Date(data.fecha),
                descripcion: data.descripcion,
                costo: parseFloat(data.costo),
                taller: data.taller,
                kilometraje: data.kilometraje ? parseInt(data.kilometraje) : null,
                tenant_id: tenantId,
            }
        });
    }

    findAll(tenantId: string) {
        return this.prisma.mantenimiento.findMany({
            where: { tenant_id: tenantId },
            include: { vehiculo: true },
            orderBy: { fecha: 'desc' }
        });
    }

    findByVehicleId(vehicleId: string) {
        return this.prisma.mantenimiento.findMany({
            where: { vehiculo_id: vehicleId },
            orderBy: { fecha: 'desc' }
        });
    }

    update(id: string, data: any) {
        return this.prisma.mantenimiento.update({
            where: { id },
            data: {
                costo: data.costo !== undefined ? parseFloat(data.costo) : undefined,
                descripcion: data.descripcion,
                taller: data.taller,
                kilometraje: data.kilometraje ? parseInt(data.kilometraje) : undefined,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.mantenimiento.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
