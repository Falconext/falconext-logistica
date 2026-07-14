
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';

@Injectable()
export class VehiculosService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateVehiculoDto, tenantId: string) {
        return this.prisma.vehiculo.create({
            data: {
                ...data,
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
            data,
        });
    }

    async remove(id: string) {
        return this.prisma.vehiculo.delete({
            where: { id },
        });
    }
}
