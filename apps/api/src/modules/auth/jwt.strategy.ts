import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'secretKey', // TODO: Move to env
        });
    }

    async validate(payload: any) {
        return {
            userId: payload.sub,
            email: payload.username,
            role: payload.role,
            tenantId: payload.tenantId,
            esAdmin: payload.esAdmin ?? (payload.role === 'SUPERADMIN' || payload.role === 'ADMIN'),
            trabajadorId: payload.trabajadorId ?? null,
            trabajadorCodigo: payload.trabajadorCodigo ?? null,
            soloPropios: payload.soloPropios ?? false,
        };
    }
}
