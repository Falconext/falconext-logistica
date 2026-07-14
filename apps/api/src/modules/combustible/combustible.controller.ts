import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
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
    findAll(@Req() req) {
        return this.combustibleService.findAll(req.user.tenantId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.combustibleService.update(id, data);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.combustibleService.remove(id, req.user.tenantId);
    }
}
