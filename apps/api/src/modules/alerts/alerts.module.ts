import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [AlertsController],
    providers: [AlertsService, PrismaService],
    exports: [AlertsService],
})
export class AlertsModule { }
