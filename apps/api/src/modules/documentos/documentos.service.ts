import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DocumentosService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.documento.create({
            data: {
                entidad: data.entidad,
                entidad_id: data.entidad_id,
                tipo: data.tipo,
                nombre: data.nombre,
                url: data.url ?? null,
                fecha_vencimiento: data.fecha_vencimiento ? new Date(data.fecha_vencimiento) : null,
                tenant_id: tenantId,
            }
        });
    }

    /**
     * Actualiza un documento existente (p. ej. cambiar el escaneo o la fecha de
     * vencimiento sin crear un registro nuevo). Sólo aplica los campos enviados.
     */
    async update(id: string, data: any, tenantId: string) {
        const patch: any = {};
        if (data.tipo !== undefined) patch.tipo = data.tipo;
        if (data.nombre !== undefined) patch.nombre = data.nombre;
        if (data.url !== undefined) patch.url = data.url ?? null;
        if (data.fecha_vencimiento !== undefined) {
            patch.fecha_vencimiento = data.fecha_vencimiento ? new Date(data.fecha_vencimiento) : null;
        }
        const result = await this.prisma.documento.updateMany({
            where: { id, tenant_id: tenantId },
            data: patch,
        });
        return { updated: result.count };
    }

    findAll(tenantId: string, entidad?: string, entidadId?: string) {
        return this.prisma.documento.findMany({
            where: {
                tenant_id: tenantId,
                ...(entidad ? { entidad } : {}),
                ...(entidadId ? { entidad_id: entidadId } : {}),
            },
            orderBy: { creado_en: 'desc' }
        });
    }

    async remove(id: string, tenantId: string) {
        const result = await this.prisma.documento.deleteMany({
            where: { id, tenant_id: tenantId }
        });
        return { deleted: result.count };
    }
}
