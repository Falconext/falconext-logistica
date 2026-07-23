import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: { tenant: true, rol: true }
        });

        if (user && await bcrypt.compare(pass, user.password)) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    // Permisos efectivos: el rol asignado es la fuente principal.
    // SUPERADMIN (plataforma) siempre ve todo. Fallback legacy por role string.
    private efectivo(user: any): { esAdmin: boolean; modulos: string[]; soloPropios: boolean } {
        if (user.role === 'SUPERADMIN') return { esAdmin: true, modulos: [], soloPropios: false };
        if (user.rol) return { esAdmin: !!user.rol.es_admin, modulos: user.rol.modulos ?? [], soloPropios: !!user.rol.solo_propios };
        if (user.role === 'ADMIN') return { esAdmin: true, modulos: [], soloPropios: false };
        return { esAdmin: false, modulos: user.modulos ?? [], soloPropios: user.solo_propios ?? false };
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const ef = this.efectivo(user);

        const payload = {
            username: user.email,
            sub: user.id,
            role: user.role,
            tenantId: user.tenant_id,
            esAdmin: ef.esAdmin,
            modulos: ef.modulos,
            trabajadorId: user.trabajador_id ?? null,
            trabajadorCodigo: user.trabajador_codigo ?? null,
            soloPropios: ef.soloPropios
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                nombre: user.nombre,
                role: user.role,
                tenant: user.tenant.name,
                tenant_id: user.tenant.id,
                moneda: user.tenant.moneda, // PEN | USD | EUR
                es_admin: ef.esAdmin, // ve todos los módulos y administra
                modulos: ef.modulos, // módulos permitidos (efectivos del rol)
                rol_id: user.rol_id ?? null,
                rol_nombre: user.rol?.nombre ?? null,
                trabajador_id: user.trabajador_id,
                trabajador_codigo: user.trabajador_codigo,
                solo_propios: ef.soloPropios
            }
        };
    }
}
