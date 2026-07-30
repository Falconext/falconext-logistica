import { Module } from '@nestjs/common';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [GpsController],
    providers: [GpsService, PrismaService],
    exports: [GpsService],
})
export class GpsModule { }
