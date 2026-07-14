
import { Controller, Get, Param, Patch, Body, Post, Delete, UseGuards, Req } from '@nestjs/common';
import { ProgramacionService } from './programacion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('programacion')
export class ProgramacionController {
    constructor(private readonly programacionService: ProgramacionService) { }

    @Get()
    findAll() {
        return this.programacionService.findAll();
    }

    @Post()
    create(@Body() data: any) {
        return this.programacionService.create(data);
    }


    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.programacionService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.programacionService.update(id, data);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    remove(@Param('id') id: string, @Req() req) {
        return this.programacionService.remove(id, req.user.tenantId);
    }
}
