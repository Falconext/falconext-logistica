
import { Module } from '@nestjs/common';
import { ProgramacionService } from './programacion.service';
import { ProgramacionController } from './programacion.controller';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [ProgramacionController],
    providers: [ProgramacionService, PrismaService],
    exports: [ProgramacionService],
})
export class ProgramacionModule { }
