import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcrypt';
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
            include: { tenant: true }
        });

        if (user && await bcrypt.compare(pass, user.password)) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const payload = {
            username: user.email,
            sub: user.id,
            role: user.role,
            tenantId: user.tenant_id
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
                modulos: user.modulos // claves de módulos permitidos (ADMIN ven todos)
            }
        };
    }
}
