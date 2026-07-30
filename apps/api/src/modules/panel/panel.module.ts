import { Module } from '@nestjs/common';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [PanelController],
  providers: [PanelService, PrismaService],
})
export class PanelModule { }
