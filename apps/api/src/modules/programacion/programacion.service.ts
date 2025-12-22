
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ProgramacionService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.programacion.findMany({
            orderBy: {
                fecha: 'desc',
            },
            take: 100 // Limit for performance initially
        });
    }

    async findOne(id: string) {
        return this.prisma.programacion.findUnique({
            where: { id },
        });
    }
}
