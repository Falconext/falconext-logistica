import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class PeajesService {
    constructor(private prisma: PrismaService) { }

    create(data: any, tenantId: string) {
        return this.prisma.peaje.create({
            data: {
                id_multa: data.id_multa || null,
                estado: data.estado || null,
                fecha: data.fecha ? new Date(data.fecha) : null,
                hora: data.hora || null,
                targa: data.targa || null,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : null,
                trabajador_id: data.trabajador_id || null,
                comentarios: data.comentarios || null,
                archivo: data.archivo || null,
                recibo_pago: data.recibo_pago || null,
                tipo: data.tipo || null,
                mes: data.mes || null,
                fecha_recepcion: data.fecha_recepcion ? new Date(data.fecha_recepcion) : null,
                peaje_salida: data.peaje_salida || null,
                nota_autista: data.nota_autista || null,
                tenant_id: tenantId,
            }
        });
    }

    findAll(tenantId: string) {
        return this.prisma.peaje.findMany({
            where: { tenant_id: tenantId },
            orderBy: { fecha: 'desc' }
        });
    }

    update(id: string, data: any) {
        return this.prisma.peaje.update({
            where: { id },
            data: {
                id_multa: data.id_multa,
                estado: data.estado,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                hora: data.hora,
                targa: data.targa,
                monto: data.monto !== undefined && data.monto !== '' ? parseFloat(data.monto) : undefined,
                trabajador_id: data.trabajador_id,
                comentarios: data.comentarios,
                archivo: data.archivo,
                recibo_pago: data.recibo_pago,
                tipo: data.tipo,
                mes: data.mes,
                fecha_recepcion: data.fecha_recepcion ? new Date(data.fecha_recepcion) : undefined,
                peaje_salida: data.peaje_salida,
                nota_autista: data.nota_autista,
            }
        });
    }

    remove(id: string, tenantId: string) {
        return this.prisma.peaje.deleteMany({
            where: { id, tenant_id: tenantId }
        });
    }
}
