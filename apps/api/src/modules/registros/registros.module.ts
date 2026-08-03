import { Module } from '@nestjs/common';
import { RegistrosController } from './registros.controller';
import { RegistrosService } from './registros.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [RegistrosController],
    providers: [RegistrosService, PrismaService],
})
export class RegistrosModule { }
