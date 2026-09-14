import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Query, ForbiddenException } from '@nestjs/common';
import { PeajesService } from './peajes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('peajes')
@UseGuards(JwtAuthGuard)
export class PeajesController {
    constructor(private readonly peajesService: PeajesService) { }

    // La edición de peajes (crear/editar/borrar/estado) es solo para supervisores en
    // adelante. Los autistas (solo_propios) únicamente ven SUS peajes (findAll ya los
    // filtra por ownerIds) y no pueden mutarlos.
    private assertPuedeEditar(req: any) {
        if (req.user.soloPropios) {
            throw new ForbiddenException('Solo un supervisor o administrador puede editar los peajes.');
        }
    }

    // Identidad del chofer (UUID y código legacy) para acotar lo "propio".
    private ownerIds(req: any): string[] {
        return [req.user.trabajadorId, req.user.trabajadorCodigo].filter(Boolean);
    }

    // Excepción a la regla de "solo supervisores": un CHOFER sí puede registrar
    // un peaje olvidado, pero únicamente si lo vincula a una operación SUYA
    // (así entra al costo de su consegna). No puede crear peajes sueltos ni
    // fijar estado de pago; el chofer y la placa salen de la operación.
    @Post()
    create(@Body() data: any, @Req() req) {
        if (req.user.soloPropios) {
            if (!data?.programacion_id) {
                throw new ForbiddenException('Como chofer solo puedes registrar un peaje vinculándolo a una de tus consegnas.');
            }
            const { estado, pagado_por_chofer, trabajador_id, ...resto } = data;
            return this.peajesService.create(resto, req.user.tenantId, { soloDeTrabajador: this.ownerIds(req) });
        }
        return this.peajesService.create(data, req.user.tenantId);
    }

    // Operaciones recientes para vincular un peaje (debe ir antes de ':id').
    // El chofer solo ve las suyas (se ignora cualquier trabajadorId que mande).
    @Get('operaciones-candidatas')
    operacionesCandidatas(@Req() req, @Query() query: any) {
        return this.peajesService.operacionesCandidatas(req.user.tenantId, {
            trabajadorId: query.trabajadorId || undefined,
            targa: query.targa || undefined,
            fecha: query.fecha || undefined,
            q: query.q || undefined,
            take: query.take ? parseInt(query.take, 10) : undefined,
            soloDeTrabajador: req.user.soloPropios ? this.ownerIds(req) : undefined,
        });
    }

    // Vincula un peaje ya registrado (suelto) a una operación. El chofer solo
    // puede vincular un peaje SUYO a una operación SUYA.
    @Post(':id/vincular')
    vincular(@Param('id') id: string, @Body() body: { programacion_id: string }, @Req() req) {
        return this.peajesService.vincular(id, body?.programacion_id, req.user.tenantId,
            req.user.soloPropios ? { soloDeTrabajador: this.ownerIds(req) } : undefined);
    }

    @Get()
    findAll(@Req() req, @Query() query: any) {
        return this.peajesService.findAll(req.user.tenantId, {
            q: query.q,
            estado: query.estado,
            from: query.from,
            to: query.to,
            trabajadorId: query.trabajadorId || undefined,
            spedizione: query.spedizione || undefined,
            skip: query.skip ? parseInt(query.skip, 10) || 0 : 0,
            take: query.take ? Math.min(parseInt(query.take, 10) || 10, 100) : 10,
            ownerIds: req.user.soloPropios ? [req.user.trabajadorId, req.user.trabajadorCodigo].filter(Boolean) : undefined,
        });
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any, @Req() req) {
        // Supervisores en adelante pueden editar el peaje, incluido su estado
        // (pagado/no pagado/anulado). Los autistas no editan.
        this.assertPuedeEditar(req);
        return this.peajesService.update(id, data, req.user.tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        this.assertPuedeEditar(req);
        return this.peajesService.remove(id, req.user.tenantId);
    }
}
