
import { Controller, Get, Param, Patch, Body, Post, Delete, UseGuards, Req, Query, ForbiddenException } from '@nestjs/common';
import { ProgramacionService } from './programacion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('programacion')
@UseGuards(JwtAuthGuard)
export class ProgramacionController {
    constructor(private readonly programacionService: ProgramacionService) { }

    @Get()
    findAll(@Req() req, @Query() query: any) {
        return this.programacionService.findAll(req.user.tenantId, {
            from: query.from,
            to: query.to,
            q: query.q,
            estados: query.estados ? String(query.estados).split(',').filter(Boolean) : undefined,
            skip: query.skip ? parseInt(query.skip, 10) || 0 : 0,
            take: query.take ? Math.min(parseInt(query.take, 10) || 60, 1000) : 60,
            // Owner scoping: restricted users (solo_propios) only see their own rows.
            // Se envían UUID y código: el vínculo migró a UUID pero puede quedar
            // data histórica por código durante la transición.
            ownerIds: req.user.soloPropios ? [req.user.trabajadorId, req.user.trabajadorCodigo].filter(Boolean) : undefined,
        });
    }

    @Post()
    create(@Req() req, @Body() data: any) {
        return this.programacionService.create(data, req.user.tenantId);
    }


    // Gastos de un tipo (PEAJE/COMBUSTIBLE) del tenant, para los módulos respectivos.
    // Debe ir antes de ':id' para que 'gastos' no se interprete como un id.
    @Get('gastos')
    findGastos(@Req() req, @Query('tipo') tipo: string) {
        return this.programacionService.findGastosByTipo(req.user.tenantId, tipo);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.programacionService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any, @Req() req) {
        return this.programacionService.update(id, data, { isChofer: !!req.user?.soloPropios });
    }

    // Autorizar / rechazar la attesa declarada. SOLO el supervisor (no el chofer).
    @Patch(':id/attesa-autorizacion')
    autorizarAttesa(@Param('id') id: string, @Body() body: any, @Req() req) {
        if (req.user?.soloPropios) {
            throw new ForbiddenException('Solo el supervisor puede autorizar la attesa.');
        }
        return this.programacionService.autorizarAttesa(id, req.user.tenantId, {
            estado: body.estado,
            horas: body.horas,
            usuarioId: req.user.userId,
        });
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    remove(@Param('id') id: string, @Req() req) {
        return this.programacionService.remove(id, req.user.tenantId);
    }
}
