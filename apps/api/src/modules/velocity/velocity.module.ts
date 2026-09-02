import { Module } from '@nestjs/common';
import { VelocityController } from './velocity.controller';
import { VelocityService } from './velocity.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [VelocityController],
    providers: [VelocityService, PrismaService],
    exports: [VelocityService],
})
export class VelocityModule { }
