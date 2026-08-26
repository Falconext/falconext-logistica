import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Query, ForbiddenException } from '@nestjs/common';
import { PeajesService } from './peajes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('peajes')
@UseGuards(JwtAuthGuard)
export class PeajesController {
    constructor(private readonly peajesService: PeajesService) { }

    @Post()
    create(@Body() data: any, @Req() req) {
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
        // El estado (pagado/no pagado/anulado) lo decide administración: es quien
        // paga los mancato que no cubrió el chofer, y quien concilia lo importado.
        if (data.estado !== undefined && !req.user.esAdmin) {
            throw new ForbiddenException('Solo un administrador puede modificar el estado del peaje.');
        }
        return this.peajesService.update(id, data, req.user.tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.peajesService.remove(id, req.user.tenantId);
    }
}
