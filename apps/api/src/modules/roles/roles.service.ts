import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

@Injectable()
export class RolesService {
    constructor(private prisma: PrismaService) { }

    // Lista los roles del tenant con el número de usuarios asignados.
    async findAll(tenantId: string) {
        const roles = await this.prisma.rol.findMany({
            where: { tenant_id: tenantId },
            include: { _count: { select: { usuarios: true } } },
            orderBy: { creado_en: 'asc' },
        });
        return roles.map(({ _count, ...rol }) => ({
            ...rol,
            usuarios_count: _count.usuarios,
        }));
    }

    async create(dto: CreateRolDto, tenantId: string) {
        const existente = await this.prisma.rol.findFirst({
            where: { tenant_id: tenantId, nombre: dto.nombre },
        });
        if (existente) {
            throw new ConflictException('Ya existe un rol con ese nombre');
        }

        return this.prisma.rol.create({
            data: {
                nombre: dto.nombre,
                descripcion: dto.descripcion ?? null,
                modulos: dto.modulos ?? [],
                es_admin: dto.es_admin ?? false,
                solo_propios: dto.solo_propios ?? false,
                tenant_id: tenantId,
            },
        });
    }

    async update(id: string, dto: UpdateRolDto, tenantId: string) {
        const rol = await this.prisma.rol.findFirst({ where: { id, tenant_id: tenantId } });
        if (!rol) {
            throw new NotFoundException('Rol no encontrado');
        }

        // Si cambia el nombre, verificar que no colisione con otro rol del tenant.
        if (dto.nombre !== undefined && dto.nombre !== rol.nombre) {
            const existente = await this.prisma.rol.findFirst({
                where: { tenant_id: tenantId, nombre: dto.nombre },
            });
            if (existente) {
                throw new ConflictException('Ya existe un rol con ese nombre');
            }
        }

        const data: any = {};
        if (dto.nombre !== undefined) data.nombre = dto.nombre;
        if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
        if (dto.modulos !== undefined) data.modulos = dto.modulos;
        if (dto.es_admin !== undefined) data.es_admin = dto.es_admin;
        if (dto.solo_propios !== undefined) data.solo_propios = dto.solo_propios;

        return this.prisma.rol.update({ where: { id }, data });
    }

    async remove(id: string, tenantId: string) {
        const rol = await this.prisma.rol.findFirst({
            where: { id, tenant_id: tenantId },
            include: { _count: { select: { usuarios: true } } },
        });
        if (!rol) {
            throw new NotFoundException('Rol no encontrado');
        }
        if (rol._count.usuarios > 0) {
            throw new ConflictException('El rol tiene usuarios asignados');
        }

        await this.prisma.rol.delete({ where: { id } });
        return { id, deleted: true };
    }
}
