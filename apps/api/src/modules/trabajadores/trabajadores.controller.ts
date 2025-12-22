
import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';

@Controller('trabajadores')
export class TrabajadoresController {
    constructor(private readonly trabajadoresService: TrabajadoresService) { }

    @Post()
    create(@Body() createTrabajadorDto: CreateTrabajadorDto) {
        return this.trabajadoresService.create(createTrabajadorDto);
    }

    @Get()
    findAll() {
        return this.trabajadoresService.findAll();
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
