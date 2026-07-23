import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { DocumentosService } from './documentos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('documentos')
@UseGuards(JwtAuthGuard)
export class DocumentosController {
    constructor(private readonly documentosService: DocumentosService) { }

    @Post()
    create(@Body() data: any, @Req() req) {
        return this.documentosService.create(data, req.user.tenantId);
    }

    @Get()
    findAll(@Req() req, @Query('entidad') entidad?: string, @Query('entidad_id') entidadId?: string) {
        if (req.user.soloPropios && req.user.trabajadorId) {
            // Usuario restringido: solo ve SUS documentos (los del trabajador vinculado),
            // ignorando los filtros de query entidad/entidad_id.
            return this.documentosService.findAll(req.user.tenantId, 'TRABAJADOR', req.user.trabajadorId);
        }
        return this.documentosService.findAll(req.user.tenantId, entidad, entidadId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any, @Req() req) {
        return this.documentosService.update(id, data, req.user.tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.documentosService.remove(id, req.user.tenantId);
    }
}
