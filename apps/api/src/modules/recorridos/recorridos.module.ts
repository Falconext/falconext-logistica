import { Module } from '@nestjs/common';
import { RecorridosController } from './recorridos.controller';
import { RecorridosService } from './recorridos.service';
import { PrismaService } from '../../prisma.service';
import { GpsModule } from '../gps/gps.module';

@Module({
    imports: [GpsModule],
    controllers: [RecorridosController],
    providers: [RecorridosService, PrismaService],
    exports: [RecorridosService],
})
export class RecorridosModule { }
