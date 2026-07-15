
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';

@Injectable()
export class TrabajadoresService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateTrabajadorDto, tenantId: string) {
        const trabajador = await this.prisma.trabajador.create({
            data: {
                ...data,
                tenant_id: tenantId,
                fecha_nacimiento: data.fecha_nacimiento ? new Date(data.fecha_nacimiento) : null,
                fecha_vencimiento_pasaporte: data.fecha_vencimiento_pasaporte ? new Date(data.fecha_vencimiento_pasaporte) : null,
                // Helper to convert strings to dates would be ideal here for all date fields
            },
        });

        if (trabajador.trackable) {
            await this.ensureDevice(trabajador);
        }

        return trabajador;
    }

    /**
     * Garantiza que un trabajador rastreable tenga un Device con token.
     * El token es la credencial durable que la app usa para reportar posición
     * en segundo plano (POST /gps/ingest). Idempotente: si ya existe, no crea otro.
     */
    private async ensureDevice(trabajador: { id: string; id_trabajador: string | null; nombre_completo: string; tenant_id: string }) {
        const existing = await this.prisma.device.findFirst({
            where: { tenant_id: trabajador.tenant_id, trabajador_id: trabajador.id },
        });
        if (existing) return existing;

        return this.prisma.device.create({
            data: {
                imei: `emp-${trabajador.id_trabajador || trabajador.id}`,
                name: `Rastreo ${trabajador.nombre_completo}`,
                tenant_id: trabajador.tenant_id,
                trabajador_id: trabajador.id,
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
        const trabajador = await this.prisma.trabajador.update({
            where: { id },
            data,
        });

        // Si se activó el rastreo en una edición, asegurar su Device.
        if (trabajador.trackable) {
            await this.ensureDevice(trabajador);
        }

        return trabajador;
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
