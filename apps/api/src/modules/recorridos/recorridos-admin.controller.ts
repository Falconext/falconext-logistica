import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { RecorridosService } from './recorridos.service';

// Operaciones administrativas one-off sobre recorridos. Sin JWT: se autentican con
// CRON_SECRET (mismo patrón que /gps/velocity/*), pensadas para correrse con curl
// desde la máquina del operador contra Vercel (tiene la BD y la key de Google).
@Controller('recorridos-admin')
export class RecorridosAdminController {
    constructor(private readonly service: RecorridosService) { }

    private assertCron(req: any) {
        const secret = process.env.CRON_SECRET;
        const auth = req.headers?.authorization || '';
        if (!secret || auth !== `Bearer ${secret}`) throw new UnauthorizedException('No autorizado.');
    }

    // Reproceso km/tiempo = estimado de la ruta (regla 2026-09-16).
    // Body: { desde: '2026-09-01', hasta: '2026-09-30', tenantId?: string, aplicar?: boolean }
    // Sin `aplicar: true` es modo PRUEBA: devuelve el antes/después sin escribir.
    @Post('reprocesar-km-ruta')
    async reprocesar(@Req() req: any, @Body() body: any) {
        this.assertCron(req);
        const desde = new Date(body?.desde);
        const hasta = body?.hasta ? new Date(body.hasta) : new Date();
        if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) throw new UnauthorizedException('Rango inválido.');
        // `hasta` como fecha (YYYY-MM-DD) → fin de ese día.
        if (typeof body?.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.hasta)) hasta.setUTCHours(23, 59, 59, 999);
        return this.service.reprocesarKmRuta({ desde, hasta, tenantId: body?.tenantId || undefined, aplicar: body?.aplicar === true });
    }
}
