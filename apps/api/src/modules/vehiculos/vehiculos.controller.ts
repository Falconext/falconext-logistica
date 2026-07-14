import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { VehiculosService } from './vehiculos.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';

import { ProgramacionService } from '../../modules/programacion/programacion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('vehiculos')
@UseGuards(JwtAuthGuard)
export class VehiculosController {
    constructor(
        private readonly vehiculosService: VehiculosService,
        private readonly programacionService: ProgramacionService
    ) { }

    @Post()
    create(@Body() createVehiculoDto: CreateVehiculoDto, @Req() req) {
        return this.vehiculosService.create(createVehiculoDto, req.user.tenantId);
    }

    @Get()
    findAll(@Req() req) {
        return this.vehiculosService.findAll(req.user.tenantId);
    }

    @Get(':id/historial')
    async getHistory(@Param('id') id: string) {
        // First get the vehicle to know its PLACA or ID_FURGON
        const vehicle = await this.vehiculosService.findOne(id);
        if (!vehicle) return [];

        // Search by PLACA (most reliable connection to excel data based on seed)
        // or we might need to search by multiple fields if data is messy
        return this.programacionService.findByVehicleId(vehicle.placa);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.vehiculosService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateVehiculoDto: any) {
        return this.vehiculosService.update(id, updateVehiculoDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.vehiculosService.remove(id);
    }
}
