
import { Controller, Get, Param, Patch, Body, Post, Delete, UseGuards, Req, Query } from '@nestjs/common';
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
        });
    }

    @Post()
    create(@Req() req, @Body() data: any) {
        return this.programacionService.create(data, req.user.tenantId);
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
