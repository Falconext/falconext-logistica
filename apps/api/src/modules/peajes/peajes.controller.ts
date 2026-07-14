import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { PeajesService } from './peajes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('peajes')
@UseGuards(JwtAuthGuard)
export class PeajesController {
    constructor(private readonly peajesService: PeajesService) { }

    @Post()
    create(@Body() data: any, @Req() req) {
        return this.peajesService.create(data, req.user.tenantId);
    }

    @Get()
    findAll(@Req() req, @Query() query: any) {
        return this.peajesService.findAll(req.user.tenantId, {
            q: query.q,
            estado: query.estado,
            skip: query.skip ? parseInt(query.skip, 10) || 0 : 0,
            take: query.take ? Math.min(parseInt(query.take, 10) || 10, 100) : 10,
        });
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.peajesService.update(id, data);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.peajesService.remove(id, req.user.tenantId);
    }
}
