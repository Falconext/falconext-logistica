import { Controller, Get, Post, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { RecorridosService } from './recorridos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('recorridos')
@UseGuards(JwtAuthGuard)
export class RecorridosController {
    constructor(private readonly service: RecorridosService) { }

    // ---- Supervisor (web) ----
    @Get('activos')
    activos(@Req() req) {
        return this.service.activos(req.user.tenantId);
    }

    @Get('historial')
    historial(@Req() req, @Query('limit') limit?: string) {
        return this.service.historial(req.user.tenantId, limit ? parseInt(limit, 10) : 30);
    }

    @Get(':id')
    detalle(@Param('id') id: string, @Req() req) {
        return this.service.detalle(req.user.tenantId, id);
    }

    @Get(':id/traza')
    traza(@Param('id') id: string, @Req() req) {
        return this.service.traza(req.user.tenantId, id);
    }

    // Traza del recorrido de una operación (para el detalle de Operaciones).
    @Get('programacion/:programacionId/traza')
    trazaByProgramacion(@Param('programacionId') programacionId: string, @Req() req) {
        return this.service.trazaByProgramacion(req.user.tenantId, programacionId);
    }

    // Cierre forzado por el supervisor de un recorrido atascado.
    @Post(':id/cerrar')
    cerrar(@Param('id') id: string, @Req() req) {
        return this.service.cerrarPorSupervisor(req.user.tenantId, id);
    }

    // ---- Chofer (app móvil) ----
    @Get('mias/operaciones')
    operaciones(@Req() req) {
        return this.service.operacionesDisponibles(req.user.tenantId, req.user.trabajadorId);
    }

    @Get('mio/activo')
    miActivo(@Req() req) {
        return this.service.activoDeTrabajador(req.user.tenantId, req.user.trabajadorId);
    }

    // Resumen de ganancias por hora del chofer (hoy/semana/mes/total).
    @Get('mio/pago')
    miPago(@Req() req) {
        return this.service.resumenPago(req.user.tenantId, req.user.trabajadorId);
    }

    @Post('iniciar')
    iniciar(@Body() body: { programacionId: string }, @Req() req) {
        return this.service.iniciar(req.user.tenantId, req.user.trabajadorId, body.programacionId);
    }

    @Post(':id/llegada')
    llegada(@Param('id') id: string, @Req() req) {
        return this.service.llegada(req.user.tenantId, id, req.user.trabajadorId);
    }

    @Post(':id/descanso')
    descanso(@Param('id') id: string, @Req() req) {
        return this.service.descanso(req.user.tenantId, id, req.user.trabajadorId);
    }

    @Post(':id/reanudar')
    reanudar(@Param('id') id: string, @Req() req) {
        return this.service.reanudar(req.user.tenantId, id, req.user.trabajadorId);
    }

    @Post(':id/regreso')
    regreso(@Param('id') id: string, @Req() req) {
        return this.service.regreso(req.user.tenantId, id, req.user.trabajadorId);
    }

    @Post(':id/finalizar')
    finalizar(@Param('id') id: string, @Req() req) {
        return this.service.finalizar(req.user.tenantId, id, req.user.trabajadorId);
    }

    @Post(':id/cancelar')
    cancelar(@Param('id') id: string, @Req() req) {
        return this.service.cancelar(req.user.tenantId, id, req.user.trabajadorId);
    }
}
