import { Module } from '@nestjs/common';
import { RecorridosController } from './recorridos.controller';
import { RecorridosAdminController } from './recorridos-admin.controller';
import { RecorridosService } from './recorridos.service';
import { PrismaService } from '../../prisma.service';
import { GpsModule } from '../gps/gps.module';

@Module({
    imports: [GpsModule],
    controllers: [RecorridosController, RecorridosAdminController],
    providers: [RecorridosService, PrismaService],
    exports: [RecorridosService],
})
export class RecorridosModule { }
