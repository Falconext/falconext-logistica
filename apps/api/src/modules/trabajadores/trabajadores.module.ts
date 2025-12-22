
import { Module } from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { TrabajadoresController } from './trabajadores.controller';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [TrabajadoresController],
    providers: [TrabajadoresService, PrismaService],
})
export class TrabajadoresModule { }
