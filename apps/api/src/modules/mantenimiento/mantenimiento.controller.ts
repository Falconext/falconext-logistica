import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { MantenimientoService } from './mantenimiento.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('mantenimiento')
@UseGuards(JwtAuthGuard)
export class MantenimientoController {
    constructor(private readonly mantenimientoService: MantenimientoService) { }

    @Post()
    create(@Body() data: any, @Req() req) {
        return this.mantenimientoService.create(data, req.user.tenantId);
    }

    @Get()
    findAll(@Req() req) {
        return this.mantenimientoService.findAll(req.user.tenantId);
    }

    @Get('vehiculo/:id')
    findByVehicle(@Param('id') id: string) {
        return this.mantenimientoService.findByVehicleId(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.mantenimientoService.update(id, data);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.mantenimientoService.remove(id, req.user.tenantId);
    }
}
