
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';

// Campos DateTime editables del modelo Vehiculo.
const DATE_FIELDS = ['fecha_vencimiento_seguro'];

// Los clientes envían la fecha como 'YYYY-MM-DD' (DatePicker) o '' (vacío). Prisma
// exige DateTime real: convierte a Date, y '' / inválido a null (si no, rompe con 500).
function coerceDates(data: any): any {
    const out = { ...data };
    for (const f of DATE_FIELDS) {
        if (f in out) {
            const v = out[f];
            out[f] = (v === '' || v == null) ? null : (isNaN(new Date(v).getTime()) ? null : new Date(v));
        }
    }
    return out;
}

@Injectable()
export class VehiculosService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateVehiculoDto, tenantId: string) {
        return this.prisma.vehiculo.create({
            data: {
                ...coerceDates(data),
                tenant_id: tenantId,
            },
        });
    }

    async findAll(tenantId: string) {
        return this.prisma.vehiculo.findMany({
            where: { tenant_id: tenantId }
        });
    }

    async findOne(id: string) {
        return this.prisma.vehiculo.findUnique({
            where: { id },
        });
    }

    async update(id: string, data: any) {
        return this.prisma.vehiculo.update({
            where: { id },
            data: coerceDates(data),
        });
    }

    async remove(id: string) {
        return this.prisma.vehiculo.delete({
            where: { id },
        });
    }
}
