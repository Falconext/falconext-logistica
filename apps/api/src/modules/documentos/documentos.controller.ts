import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
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
        return this.documentosService.findAll(req.user.tenantId, entidad, entidadId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.documentosService.remove(id, req.user.tenantId);
    }
}
