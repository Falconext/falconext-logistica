import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

// Campos seguros a devolver (NUNCA incluir password)
const userSelect = {
    id: true,
    email: true,
    nombre: true,
    role: true,
    activo: true,
    modulos: true,
    tenant_id: true,
    creado_en: true,
    actualizado_en: true,
};

@Injectable()
export class UsuariosService {
    constructor(private prisma: PrismaService) { }

    findAll(tenantId: string) {
        return this.prisma.user.findMany({
            where: { tenant_id: tenantId },
            select: userSelect,
            orderBy: { creado_en: 'desc' },
        });
    }

    async create(dto: CreateUsuarioDto, tenantId: string) {
        if (dto.role !== 'ADMIN' && dto.role !== 'USER') {
            throw new BadRequestException('Rol no permitido');
        }

        const existente = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existente) {
            throw new ConflictException('El email ya está registrado');
        }

        const hash = await bcrypt.hash(dto.password, 10);

        return this.prisma.user.create({
            data: {
                email: dto.email,
                password: hash,
                nombre: dto.nombre,
                role: dto.role,
                modulos: dto.modulos ?? [],
                tenant_id: tenantId,
            },
            select: userSelect,
        });
    }

    async update(id: string, dto: UpdateUsuarioDto, tenantId: string) {
        const usuario = await this.prisma.user.findFirst({ where: { id, tenant_id: tenantId } });
        if (!usuario) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (dto.role !== undefined && dto.role !== 'ADMIN' && dto.role !== 'USER') {
            throw new BadRequestException('Rol no permitido');
        }

        const data: any = {};
        if (dto.nombre !== undefined) data.nombre = dto.nombre;
        if (dto.role !== undefined) data.role = dto.role;
        if (dto.modulos !== undefined) data.modulos = dto.modulos;
        if (dto.activo !== undefined) data.activo = dto.activo;
        if (dto.password) data.password = await bcrypt.hash(dto.password, 10);

        return this.prisma.user.update({
            where: { id },
            data,
            select: userSelect,
        });
    }

    async remove(id: string, tenantId: string, currentUserId: string) {
        if (id === currentUserId) {
            throw new ForbiddenException('No puedes eliminar tu propio usuario');
        }

        const usuario = await this.prisma.user.findFirst({ where: { id, tenant_id: tenantId } });
        if (!usuario) {
            throw new NotFoundException('Usuario no encontrado');
        }

        await this.prisma.user.delete({ where: { id } });
        return { id, deleted: true };
    }
}
