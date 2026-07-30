import { Controller, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { PanelService } from './panel.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('panel')
@UseGuards(JwtAuthGuard)
export class PanelController {
    constructor(private readonly panelService: PanelService) { }

    // Tablero STATUS: personal por zona, flota y entregas activas.
    @Get('status')
    getStatus(@Req() req) {
        return this.panelService.getStatus(req.user.tenantId);
    }

    @Patch('trabajador/:id/disponibilidad')
    setTrabajador(@Param('id') id: string, @Body() body: { disponible: boolean }, @Req() req) {
        return this.panelService.setTrabajadorDisponible(id, !!body.disponible, req.user.tenantId);
    }

    @Patch('vehiculo/:id/disponibilidad')
    setVehiculo(@Param('id') id: string, @Body() body: { disponible: boolean }, @Req() req) {
        return this.panelService.setVehiculoDisponible(id, !!body.disponible, req.user.tenantId);
    }
}
