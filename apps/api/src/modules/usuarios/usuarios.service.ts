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
    rol_id: true,
    rol: { select: { id: true, nombre: true, es_admin: true, solo_propios: true, modulos: true } },
    trabajador_id: true,
    trabajador_codigo: true,
    solo_propios: true,
    tenant_id: true,
    creado_en: true,
    actualizado_en: true,
};

@Injectable()
export class UsuariosService {
    constructor(private prisma: PrismaService) { }

    // Resuelve el trabajador vinculado -> devuelve {trabajador_id (uuid), trabajador_codigo}.
    // Si trabajadorId es null/'' se limpia el vínculo.
    private async resolveTrabajador(trabajadorId: string | null | undefined, tenantId: string) {
        if (trabajadorId === undefined) return undefined; // no tocar
        if (!trabajadorId) return { trabajador_id: null, trabajador_codigo: null };
        const t = await this.prisma.trabajador.findFirst({
            where: { id: trabajadorId, tenant_id: tenantId },
            select: { id: true, id_trabajador: true },
        });
        if (!t) throw new BadRequestException('Trabajador vinculado no válido');
        return { trabajador_id: t.id, trabajador_codigo: t.id_trabajador ?? null };
    }

    // Resuelve el rol asignado (validando que sea del tenant).
    private async resolveRol(rolId: string | null | undefined, tenantId: string) {
        if (rolId === undefined) return undefined; // no tocar
        if (!rolId) return null; // desasignar rol
        const r = await this.prisma.rol.findFirst({ where: { id: rolId, tenant_id: tenantId } });
        if (!r) throw new BadRequestException('Rol no válido');
        return r;
    }

    findAll(tenantId: string) {
        return this.prisma.user.findMany({
            where: { tenant_id: tenantId },
            select: userSelect,
            orderBy: { creado_en: 'desc' },
        });
    }

    async create(dto: CreateUsuarioDto, tenantId: string) {
        const existente = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existente) {
            throw new ConflictException('El email ya está registrado');
        }

        const hash = await bcrypt.hash(dto.password, 10);
        const vinculo = await this.resolveTrabajador(dto.trabajador_id, tenantId);
        const rol = await this.resolveRol(dto.rol_id, tenantId);
        // role string derivado del rol (para compatibilidad); nunca SUPERADMIN aquí.
        const roleStr = rol?.es_admin ? 'ADMIN' : 'USER';

        return this.prisma.user.create({
            data: {
                email: dto.email,
                password: hash,
                nombre: dto.nombre,
                role: roleStr,
                rol_id: rol?.id ?? null,
                modulos: [],
                solo_propios: rol?.solo_propios ?? false,
                trabajador_id: vinculo?.trabajador_id ?? null,
                trabajador_codigo: vinculo?.trabajador_codigo ?? null,
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

        const data: any = {};
        if (dto.nombre !== undefined) data.nombre = dto.nombre;
        if (dto.activo !== undefined) data.activo = dto.activo;
        if (dto.password) data.password = await bcrypt.hash(dto.password, 10);

        const vinculo = await this.resolveTrabajador(dto.trabajador_id, tenantId);
        if (vinculo !== undefined) {
            data.trabajador_id = vinculo.trabajador_id;
            data.trabajador_codigo = vinculo.trabajador_codigo;
        }

        const rol = await this.resolveRol(dto.rol_id, tenantId);
        if (rol !== undefined) {
            data.rol_id = rol?.id ?? null;
            data.solo_propios = rol?.solo_propios ?? false;
            // No degradar un SUPERADMIN; para el resto, derivar del rol.
            if (usuario.role !== 'SUPERADMIN') data.role = rol?.es_admin ? 'ADMIN' : 'USER';
        }

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
