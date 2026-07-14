import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
    constructor(private tenantsService: TenantsService) { }

    @Post()
    @Roles('SUPERADMIN')
    create(@Body() createTenantDto: CreateTenantDto) {
        return this.tenantsService.create(createTenantDto);
    }

    @Get()
    @Roles('SUPERADMIN')
    findAll() {
        return this.tenantsService.findAll();
    }

    @Get(':id')
    @Roles('SUPERADMIN')
    findOne(@Param('id') id: string) {
        return this.tenantsService.findOne(id);
    }

    @Patch(':id')
    @Roles('SUPERADMIN')
    update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
        return this.tenantsService.update(id, updateTenantDto);
    }

    @Delete(':id')
    @Roles('SUPERADMIN')
    remove(@Param('id') id: string) {
        return this.tenantsService.remove(id);
    }
}
