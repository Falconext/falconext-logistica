import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [NotificacionesController],
    providers: [NotificacionesService, PrismaService],
    exports: [NotificacionesService],
})
export class NotificacionesModule { }
