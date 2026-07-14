import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EsAdminGuard } from '../auth/es-admin.guard';

@Controller('roles')
@UseGuards(JwtAuthGuard, EsAdminGuard)
export class RolesController {
    constructor(private readonly rolesService: RolesService) { }

    @Get()
    findAll(@Req() req) {
        return this.rolesService.findAll(req.user.tenantId);
    }

    @Post()
    create(@Body() dto: CreateRolDto, @Req() req) {
        return this.rolesService.create(dto, req.user.tenantId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateRolDto, @Req() req) {
        return this.rolesService.update(id, dto, req.user.tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.rolesService.remove(id, req.user.tenantId);
    }
}
