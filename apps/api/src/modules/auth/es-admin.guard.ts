import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

// Permite el acceso solo a usuarios administradores (rol con es_admin, o
// SUPERADMIN/ADMIN legacy). Requiere JwtAuthGuard antes para tener req.user.
@Injectable()
export class EsAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if (user && user.esAdmin) return true;
        throw new ForbiddenException('Requiere permisos de administrador');
    }
}
