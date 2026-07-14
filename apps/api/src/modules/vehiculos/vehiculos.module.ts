import { Module } from '@nestjs/common';
import { VehiculosService } from './vehiculos.service';
import { VehiculosController } from './vehiculos.controller';
import { PrismaService } from '../../prisma.service';
import { ProgramacionModule } from '../programacion/programacion.module';

@Module({
    imports: [ProgramacionModule],
    controllers: [VehiculosController],
    providers: [VehiculosService, PrismaService],
})
export class VehiculosModule { }
