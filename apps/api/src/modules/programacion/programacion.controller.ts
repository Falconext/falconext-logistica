
import { Controller, Get, Param } from '@nestjs/common';
import { ProgramacionService } from './programacion.service';

@Controller('programacion')
export class ProgramacionController {
    constructor(private readonly programacionService: ProgramacionService) { }

    @Get()
    findAll() {
        return this.programacionService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.programacionService.findOne(id);
    }
}
