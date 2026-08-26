import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { CombustibleService } from './combustible.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('combustible')
@UseGuards(JwtAuthGuard)
export class CombustibleController {
    constructor(private readonly combustibleService: CombustibleService) { }

    @Post()
    create(@Body() data: any, @Req() req) {
        return this.combustibleService.create(data, req.user.tenantId);
    }

    @Get()
    findAll(@Req() req, @Query() query: any) {
        return this.combustibleService.findAll(req.user.tenantId, {
            q: query.q,
            area: query.area,
            from: query.from,
            to: query.to,
            trabajadorId: query.trabajadorId || undefined,
            spedizione: query.spedizione || undefined,
            skip: query.skip ? parseInt(query.skip, 10) || 0 : 0,
            take: query.take ? Math.min(parseInt(query.take, 10) || 10, 100) : 10,
            ownerIds: req.user.soloPropios ? [req.user.trabajadorId, req.user.trabajadorCodigo].filter(Boolean) : undefined,
        });
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any, @Req() req) {
        return this.combustibleService.update(id, data, req.user.tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.combustibleService.remove(id, req.user.tenantId);
    }
}
