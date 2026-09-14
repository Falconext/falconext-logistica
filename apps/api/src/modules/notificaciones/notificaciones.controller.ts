import { Controller, Post, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificacionesController {
    constructor(private readonly service: NotificacionesService) { }

    // La app registra su token de push al iniciar sesión (y en cada arranque,
    // por si Expo lo rotó). Idempotente.
    @Post('token')
    registrar(@Req() req, @Body() body: { token: string; platform?: string }) {
        return this.service.registrarToken(req.user.userId, req.user.tenantId, body?.token, body?.platform);
    }

    // Al cerrar sesión la app da de baja su token para no recibir pushes de otro.
    @Delete('token')
    eliminar(@Body() body: { token: string }) {
        return this.service.eliminarToken(body?.token);
    }

    // Prueba: se manda un push a uno mismo (útil para validar en el celular).
    @Post('test')
    test(@Req() req) {
        return this.service.enviarAUsuario(req.user.userId, {
            title: 'Gamonal Driver',
            body: 'Las notificaciones están funcionando en este celular.',
            data: { tipo: 'test' },
        });
    }
}
