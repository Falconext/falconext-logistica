
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';

@Injectable()
export class VehiculosService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateVehiculoDto) {
        return this.prisma.vehiculo.create({
            data: {
                ...data,
                // Conversions if necessary
            },
        });
    }

    async findAll() {
        return this.prisma.vehiculo.findMany();
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
