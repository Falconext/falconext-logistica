import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { RegistrosService } from './registros.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EsAdminGuard } from '../auth/es-admin.guard';

@Controller('registros')
@UseGuards(JwtAuthGuard)
export class RegistrosController {
    constructor(private readonly registrosService: RegistrosService) { }

    // Tarifas de la empresa (diurna/nocturna + hora de corte). Lectura: cualquiera.
    @Get('config')
    getConfig(@Req() req) {
        return this.registrosService.getConfig(req.user.tenantId);
    }

    // Edición de tarifas: solo administradores.
    @Patch('config')
    @UseGuards(EsAdminGuard)
    updateConfig(@Body() body: any, @Req() req) {
        return this.registrosService.updateConfig(req.user.tenantId, body);
    }

    @Post()
    create(@Body() data: any, @Req() req) {
        return this.registrosService.create(data, {
            tenantId: req.user.tenantId,
            // El chofer (solo_propios) solo puede registrar partes a su propio nombre.
            forceTrabajadorId: req.user.soloPropios ? req.user.trabajadorId : undefined,
        });
    }

    @Get()
    findAll(@Req() req, @Query() query: any) {
        return this.registrosService.findAll(req.user.tenantId, {
            operacion: query.operacion,
            anio: query.anio ? parseInt(query.anio, 10) : undefined,
            mes: query.mes ? parseInt(query.mes, 10) : undefined,
            trabajadorId: query.trabajadorId,
            q: query.q,
            skip: query.skip ? parseInt(query.skip, 10) || 0 : 0,
            take: query.take ? Math.min(parseInt(query.take, 10) || 60, 500) : 60,
            // Owner scoping: el chofer solo ve sus propios partes.
            ownerTrabajadorId: req.user.soloPropios ? req.user.trabajadorId : undefined,
        });
    }

    // Resumen del chofer logueado (para "Mi Resumen" de la app): horas, km y
    // ganancia del período (por defecto, el mes en curso).
    @Get('mias/resumen')
    miResumen(@Req() req, @Query('from') from?: string, @Query('to') to?: string) {
        return this.registrosService.resumenChofer(req.user.tenantId, req.user.trabajadorId, from, to);
    }

    // Árbol de navegación (año → mes → chofer) con suma de km en cada nivel.
    @Get('arbol')
    arbol(@Req() req, @Query('operacion') operacion?: string) {
        return this.registrosService.arbol(req.user.tenantId, operacion);
    }

    // Resumen mensual por chofer (para el panel web "Resumen mes DHL"). Solo flota/RRHH.
    @Get('resumen-mes')
    resumenMes(@Req() req, @Query() query: any) {
        return this.registrosService.resumenMes(req.user.tenantId, {
            operacion: query.operacion,
            anio: query.anio ? parseInt(query.anio, 10) : undefined,
            mes: query.mes ? parseInt(query.mes, 10) : undefined,
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Req() req) {
        return this.registrosService.findOne(id, {
            tenantId: req.user.tenantId,
            ownerTrabajadorId: req.user.soloPropios ? req.user.trabajadorId : undefined,
        });
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any, @Req() req) {
        return this.registrosService.update(id, data, {
            tenantId: req.user.tenantId,
            // El chofer solo puede editar sus propios partes.
            ownerTrabajadorId: req.user.soloPropios ? req.user.trabajadorId : undefined,
        });
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.registrosService.remove(id, {
            tenantId: req.user.tenantId,
            ownerTrabajadorId: req.user.soloPropios ? req.user.trabajadorId : undefined,
        });
    }
}
