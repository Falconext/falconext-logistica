import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
    constructor(private alertsService: AlertsService) { }

    @Get('documents')
    async getExpiringDocuments(@Req() req: any, @Query('days') days?: string) {
        const tenantId = req.user.tenantId;
        const daysAhead = days ? parseInt(days) : 90;
        const ownerTrabajadorId = req.user.soloPropios ? req.user.trabajadorId : undefined;
        return this.alertsService.getExpiringDocuments(tenantId, daysAhead, ownerTrabajadorId);
    }

    @Get('summary')
    async getAlertsSummary(@Req() req: any) {
        const tenantId = req.user.tenantId;
        const ownerTrabajadorId = req.user.soloPropios ? req.user.trabajadorId : undefined;
        return this.alertsService.getAlertsSummary(tenantId, ownerTrabajadorId);
    }
}
