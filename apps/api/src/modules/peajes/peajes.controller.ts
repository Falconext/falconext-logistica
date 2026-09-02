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

    @Post()
    create(@Body() data: any, @Req() req) {
        this.assertPuedeEditar(req);
        return this.peajesService.create(data, req.user.tenantId);
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
