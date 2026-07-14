
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';

@Injectable()
export class TrabajadoresService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateTrabajadorDto, tenantId: string) {
        return this.prisma.trabajador.create({
            data: {
                ...data,
                tenant_id: tenantId,
                fecha_nacimiento: data.fecha_nacimiento ? new Date(data.fecha_nacimiento) : null,
                fecha_vencimiento_pasaporte: data.fecha_vencimiento_pasaporte ? new Date(data.fecha_vencimiento_pasaporte) : null,
                // Helper to convert strings to dates would be ideal here for all date fields
            },
        });
    }

    async findAll(tenantId: string) {
        return this.prisma.trabajador.findMany({
            where: { tenant_id: tenantId }
        });
    }

    async findOne(id: string) {
        return this.prisma.trabajador.findUnique({
            where: { id },
        });
    }

    async update(id: string, data: any) {
        return this.prisma.trabajador.update({
            where: { id },
            data,
        });
    }

    async remove(id: string) {
        return this.prisma.trabajador.delete({
            where: { id },
        });
    }

    /**
     * Get worker's complete history: routes, tolls (peajes), and fuel (combustible)
     */
    async getHistorial(id: string, tenantId: string) {
        // First get the worker to get their id_trabajador
        const worker = await this.prisma.trabajador.findUnique({
            where: { id }
        });

        if (!worker) {
            return { rutas: [], peajes: [], combustible: [] };
        }

        const workerId = worker.id_trabajador; // This is the code like "G002"

        // Get routes where trabajador_id contains the worker's name
        const rutas = await this.prisma.programacion.findMany({
            where: {
                tenant_id: tenantId,
                OR: [
                    { trabajador_id: worker.nombre_completo },
                    { trabajador_id: workerId || 'NO_MATCH' }
                ]
            },
            orderBy: { fecha: 'desc' }
        });

        // Get peajes (tolls) by worker ID code
        const peajes = workerId ? await this.prisma.peaje.findMany({
            where: {
                tenant_id: tenantId,
                trabajador_id: workerId
            },
            orderBy: { fecha: 'desc' }
        }) : [];

        // Get combustible (fuel) by worker ID code
        const combustible = workerId ? await this.prisma.combustible.findMany({
            where: {
                tenant_id: tenantId,
                trabajador_id: workerId
            },
            orderBy: { fecha: 'desc' }
        }) : [];

        return { rutas, peajes, combustible };
    }
}
