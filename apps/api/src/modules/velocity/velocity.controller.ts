import { Controller, Get, Post, Query, Req, UseGuards, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { VelocityService } from './velocity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('gps/velocity')
export class VelocityController {
    constructor(private readonly velocity: VelocityService) { }

    private assertAdmin(req: any) {
        if (!req.user?.esAdmin) throw new ForbiddenException('Solo un administrador puede operar la integración de Velocity Fleet.');
    }

    // Diagnóstico: valida el token contra la API real y devuelve status + cuerpo crudo.
    // Úsalo tras desplegar para confirmar que el entorno (Vercel) sí alcanza Velocity.
    @UseGuards(JwtAuthGuard)
    @Get('test')
    async test(@Req() req: any) {
        this.assertAdmin(req);
        return this.velocity.testConnection();
    }

    // Vista previa CRUDA de las posiciones de un cliente (para ver los nombres reales
    // de los campos que devuelve Velocity antes de afinar el mapeo).
    @UseGuards(JwtAuthGuard)
    @Get('positions')
    async positions(@Req() req: any, @Query('customer') customer: string) {
        this.assertAdmin(req);
        if (!customer) return { error: 'Falta ?customer=<id> (usa /gps/velocity/test para ver los customerIds).' };
        return this.velocity.fetchDevicePositions(customer);
    }

    // Disparo MANUAL del sync (admin autenticado).
    @UseGuards(JwtAuthGuard)
    @Post('sync')
    async syncManual(@Req() req: any) {
        this.assertAdmin(req);
        return this.velocity.sync();
    }

    // Diagnóstico protegido por CRON_SECRET (sin JWT): permite validar la conexión
    // haciéndole curl a NUESTRA API desde cualquier red que la alcance (útil cuando la
    // máquina del operador tiene un firewall que bloquea velocityfleet.com directo pero
    // sí llega a nuestro dominio en Vercel, que a su vez sale limpio hacia Velocity).
    @Get('diag')
    async diag(@Req() req: any) {
        this.assertCron(req);
        return this.velocity.testConnection();
    }

    private assertCron(req: any) {
        const secret = process.env.CRON_SECRET;
        const auth = req.headers?.authorization || '';
        if (!secret || auth !== `Bearer ${secret}`) throw new UnauthorizedException('No autorizado.');
    }

    // Disparo por CRON (Vercel Cron / scheduler externo). No usa JWT: se autentica con
    // CRON_SECRET. Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. Si el secreto
    // no está configurado, se rechaza para no dejar el endpoint abierto.
    @Get('cron')
    async cron(@Req() req: any) {
        this.assertCron(req);
        return this.velocity.sync();
    }
}
