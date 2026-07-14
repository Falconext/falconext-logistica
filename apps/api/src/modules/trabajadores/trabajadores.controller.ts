
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { ProgramacionService } from '../../modules/programacion/programacion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('trabajadores')
@UseGuards(JwtAuthGuard)
export class TrabajadoresController {
    constructor(
        private readonly trabajadoresService: TrabajadoresService,
        private readonly programacionService: ProgramacionService
    ) { }

    @Post()
    create(@Body() createTrabajadorDto: CreateTrabajadorDto, @Req() req) {
        return this.trabajadoresService.create(createTrabajadorDto, req.user.tenantId);
    }

    @Get()
    findAll(@Req() req) {
        return this.trabajadoresService.findAll(req.user.tenantId);
    }

    @Get(':id/historial')
    async getHistory(@Param('id') id: string, @Req() req) {
        return this.trabajadoresService.getHistorial(id, req.user.tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.trabajadoresService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateTrabajadorDto: any) {
        return this.trabajadoresService.update(id, updateTrabajadorDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.trabajadoresService.remove(id);
    }
}
