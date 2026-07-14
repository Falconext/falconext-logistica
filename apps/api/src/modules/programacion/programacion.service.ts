
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ProgramacionService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.programacion.findMany({
            orderBy: {
                fecha: 'desc',
            },
            take: 5000 // Increased to support full dataset for frontend grouping
        });
    }

    async findOne(id: string) {
        return this.prisma.programacion.findUnique({
            where: { id },
        });
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

    async create(data: any) {
        // Find default tenant if needed, or assume tenant_id is passed or injected
        // For now, hardcode or fetch a default tenant for the user/seed
        // Ideally ID comes from auth context. Using first tenant for simplicity as before.
        const tenant = await this.prisma.tenant.findFirst();

        return this.prisma.programacion.create({
            data: {
                ...data,
                tenant_id: data.tenant_id || tenant?.id
            }
        });
    }

    async update(id: string, data: any) {
        return this.prisma.programacion.update({
            where: { id },
            data: data
        });
    }

    async remove(id: string, tenantId: string) {
        // Scoped by tenant: only delete records belonging to the caller's tenant
        return this.prisma.programacion.deleteMany({
            where: { id, tenant_id: tenantId },
        });
    }
}
