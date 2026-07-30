import { Module } from '@nestjs/common';
import { RecorridosController } from './recorridos.controller';
import { RecorridosService } from './recorridos.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [RecorridosController],
    providers: [RecorridosService, PrismaService],
})
export class RecorridosModule { }
