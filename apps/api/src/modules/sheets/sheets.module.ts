import { Module } from '@nestjs/common';
import { SheetsService } from './sheets.service';
import { SyncService } from './sync.service';
import { PrismaService } from '../../prisma.service';

import { SheetsController } from './sheets.controller';

@Module({
    controllers: [SheetsController],
    providers: [SheetsService, SyncService, PrismaService],
    exports: [SheetsService, SyncService]
})
export class SheetsModule { }
