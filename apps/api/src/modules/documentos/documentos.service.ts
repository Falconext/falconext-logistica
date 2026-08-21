import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

// Contexto del usuario para las reglas de auto-servicio del chofer.
type ReqUser = { soloPropios?: boolean; trabajadorId?: string | null };

@Injectable()
export class DocumentosService {
    constructor(private prisma: PrismaService) { }

    private esChofer(user?: ReqUser) {
        return !!(user?.soloPropios && user?.trabajadorId);
    }

    create(data: any, tenantId: string, user?: ReqUser) {
        // El chofer solo puede crear documentos SUYOS: forzamos entidad/entidad_id
        // a su propio trabajador (no confiamos en el body) y nunca bloqueado al crear.
        const chofer = this.esChofer(user);
        return this.prisma.documento.create({
            data: {
                entidad: chofer ? 'TRABAJADOR' : data.entidad,
                entidad_id: chofer ? String(user!.trabajadorId) : data.entidad_id,
                tipo: data.tipo,
                nombre: data.nombre,
                url: data.url ?? null,
                fecha_vencimiento: data.fecha_vencimiento ? new Date(data.fecha_vencimiento) : null,
                bloqueado: false,
                tenant_id: tenantId,
            }
        });
    }

    /**
     * Actualiza un documento existente (p. ej. cambiar el escaneo o la fecha de
     * vencimiento sin crear un registro nuevo). Sólo aplica los campos enviados.
     * Candado: el chofer solo edita SUS documentos mientras NO estén bloqueados,
     * y puede bloquearlos (confirmar) pero no desbloquearlos. El supervisor puede todo.
     */
    async update(id: string, data: any, tenantId: string, user?: ReqUser) {
        const doc = await this.prisma.documento.findFirst({ where: { id, tenant_id: tenantId } });
        if (!doc) throw new NotFoundException('Documento no encontrado.');

        if (this.esChofer(user)) {
            const propio = doc.entidad === 'TRABAJADOR' && doc.entidad_id === String(user!.trabajadorId);
            if (!propio) throw new ForbiddenException('Solo puedes gestionar tus propios documentos.');
            if (doc.bloqueado) throw new ForbiddenException('Documento bloqueado: solo el supervisor puede renovarlo.');
            // El chofer no puede desbloquear (solo el supervisor).
            if (data.bloqueado === false) throw new ForbiddenException('No puedes desbloquear un documento.');
        }

        const patch: any = {};
        if (data.tipo !== undefined) patch.tipo = data.tipo;
        if (data.nombre !== undefined) patch.nombre = data.nombre;
        if (data.url !== undefined) patch.url = data.url ?? null;
        if (data.fecha_vencimiento !== undefined) {
            patch.fecha_vencimiento = data.fecha_vencimiento ? new Date(data.fecha_vencimiento) : null;
        }
        if (data.bloqueado !== undefined) patch.bloqueado = !!data.bloqueado;
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

    async remove(id: string, tenantId: string, user?: ReqUser) {
        if (this.esChofer(user)) {
            const doc = await this.prisma.documento.findFirst({ where: { id, tenant_id: tenantId } });
            if (!doc) throw new NotFoundException('Documento no encontrado.');
            const propio = doc.entidad === 'TRABAJADOR' && doc.entidad_id === String(user!.trabajadorId);
            if (!propio) throw new ForbiddenException('Solo puedes gestionar tus propios documentos.');
            if (doc.bloqueado) throw new ForbiddenException('Documento bloqueado: solo el supervisor puede quitarlo.');
        }
        const result = await this.prisma.documento.deleteMany({
            where: { id, tenant_id: tenantId }
        });
        return { deleted: result.count };
    }
}
