import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SheetsService } from './sheets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma.service';

@Controller('sheets')
@UseGuards(JwtAuthGuard)
export class SheetsController {
    constructor(
        private readonly syncService: SyncService,
        private readonly sheetsService: SheetsService,
        private readonly prisma: PrismaService
    ) { }

    @Post('sync')
    async syncNow(@Req() req: any) {
        const tenantId = req.user.tenantId;
        return this.syncService.syncSheet(tenantId);
    }

    @Post('config')
    async updateConfig(@Req() req: any, @Body() body: { spreadsheetId: string }) {
        const tenantId = req.user.tenantId;
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { google_sheet_id: body.spreadsheetId }
        });
        return { success: true };
    }

    @Get('status')
    async getStatus(@Req() req: any) {
        const tenantId = req.user.tenantId;
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { google_sheet_id: true, last_synced: true }
        });

        const serviceEmail = await this.sheetsService.getServiceAccountEmail();

        return {
            connected: !!tenant?.google_sheet_id,
            spreadsheetId: tenant?.google_sheet_id,
            lastSynced: tenant?.last_synced,
            serviceEmail
        };
    }
}
