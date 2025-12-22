
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';

@Injectable()
export class TrabajadoresService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateTrabajadorDto) {
        return this.prisma.trabajador.create({
            data: {
                ...data,
                fecha_nacimiento: data.fecha_nacimiento ? new Date(data.fecha_nacimiento) : null,
                fecha_vencimiento_pasaporte: data.fecha_vencimiento_pasaporte ? new Date(data.fecha_vencimiento_pasaporte) : null,
                // Helper to convert strings to dates would be ideal here for all date fields
            },
        });
    }

    async findAll() {
        return this.prisma.trabajador.findMany();
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
}
