
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('alerts')
    getAlerts(@Req() req: any) {
        const tenantId = req.user.tenantId;
        return this.dashboardService.getAlerts(tenantId);
    }

    @Get('stats')
    getStats(@Req() req: any) {
        const tenantId = req.user.tenantId;
        return this.dashboardService.getStats(tenantId);
    }

    @Get('reports')
    getReportsStats(@Req() req: any) {
        const tenantId = req.user.tenantId;
        const { from, to } = req.query;
        return this.dashboardService.getReportsStats(tenantId, from, to);
    }
}
