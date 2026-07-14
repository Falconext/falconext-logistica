
import { Module } from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { TrabajadoresController } from './trabajadores.controller';
import { PrismaService } from '../../prisma.service';
import { ProgramacionModule } from '../programacion/programacion.module';

@Module({
    imports: [ProgramacionModule],
    controllers: [TrabajadoresController],
    providers: [TrabajadoresService, PrismaService],
})
export class TrabajadoresModule { }
