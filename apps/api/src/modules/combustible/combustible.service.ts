import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class CombustibleService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.combustible.create({
            data: {
                id_registro: data.id_registro || null,
                trabajador_id: data.trabajador_id || null,
                fecha: data.fecha ? new Date(data.fecha) : null,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : null,
                targa: data.targa || null,
                metodo: data.metodo || null,
                area: data.area || null,
                mes: data.mes || null,
                archivo: data.archivo || null,
                tenant_id: tenantId,
            }
        });
    }

    findAll(tenantId: string) {
        return this.prisma.combustible.findMany({
            where: { tenant_id: tenantId },
            orderBy: { fecha: 'desc' }
        });
    }

    update(id: string, data: any) {
        return this.prisma.combustible.update({
            where: { id },
            data: {
                id_registro: data.id_registro,
                trabajador_id: data.trabajador_id,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : undefined,
                targa: data.targa,
                metodo: data.metodo,
                area: data.area,
                mes: data.mes,
                archivo: data.archivo,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.combustible.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
