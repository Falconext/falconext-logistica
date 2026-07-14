import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EsAdminGuard } from '../auth/es-admin.guard';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, EsAdminGuard)
export class UsuariosController {
    constructor(private readonly usuariosService: UsuariosService) { }

    @Get()
    findAll(@Req() req) {
        return this.usuariosService.findAll(req.user.tenantId);
    }

    @Post()
    create(@Body() dto: CreateUsuarioDto, @Req() req) {
        return this.usuariosService.create(dto, req.user.tenantId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateUsuarioDto, @Req() req) {
        return this.usuariosService.update(id, dto, req.user.tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.usuariosService.remove(id, req.user.tenantId, req.user.userId);
    }
}
