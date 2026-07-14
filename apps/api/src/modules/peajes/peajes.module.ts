import { Module } from '@nestjs/common';
import { PeajesController } from './peajes.controller';
import { PeajesService } from './peajes.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [PeajesController],
  providers: [PeajesService, PrismaService]
})
export class PeajesModule { }
