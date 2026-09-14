import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

// Notificaciones push a la app móvil vía Expo Push Service.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
//
// Flujo: la app pide permiso, obtiene su ExponentPushToken y lo registra aquí
// (POST /notificaciones/token). Cuando pasa algo relevante para un chofer (p. ej.
// le asignan una consegna) el backend manda el push a todos sus tokens. Si Expo
// responde DeviceNotRegistered (app desinstalada / token rotado) se borra el token.
//
// Sin dependencias nuevas: Node 22 trae fetch nativo.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

export interface PushPayload {
    title: string;
    body: string;
    // Datos que la app recibe al tocar la notificación (para navegar a la pantalla).
    data?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class NotificacionesService {
    private readonly logger = new Logger('Notificaciones');

    constructor(private prisma: PrismaService) { }

    // ---- Registro de tokens ----------------------------------------------

    async registrarToken(userId: string, tenantId: string, token: string, platform?: string) {
        const t = (token || '').trim();
        if (!EXPO_TOKEN_RE.test(t)) {
            return { ok: false, reason: 'Token de push inválido (se esperaba ExponentPushToken[...]).' };
        }
        // Un token identifica UN dispositivo. Si otro usuario inició sesión en el
        // mismo celular, el token pasa a ese usuario (así no le llegan pushes ajenos).
        await this.prisma.pushToken.upsert({
            where: { token: t },
            create: { token: t, user_id: userId, tenant_id: tenantId, platform: platform || null },
            update: { user_id: userId, tenant_id: tenantId, platform: platform || null },
        });
        return { ok: true };
    }

    async eliminarToken(token: string) {
        const t = (token || '').trim();
        if (!t) return { ok: false };
        await this.prisma.pushToken.deleteMany({ where: { token: t } });
        return { ok: true };
    }

    // ---- Envío --------------------------------------------------------------

    // Manda un push a todos los dispositivos de un usuario. Best-effort: nunca
    // lanza — un push que falla no debe romper la operación que lo disparó.
    async enviarAUsuario(userId: string, payload: PushPayload): Promise<{ enviados: number }> {
        const tokens = await this.prisma.pushToken.findMany({ where: { user_id: userId }, select: { token: true } });
        if (!tokens.length) return { enviados: 0 };
        return this.enviarATokens(tokens.map((x) => x.token), payload);
    }

    // Resuelve el/los usuario(s) de la app vinculados a un trabajador y les manda
    // el push. El vínculo puede ser por UUID (`trabajador_id`) o por código legacy
    // (`trabajador_codigo`, p. ej. "G001"); se aceptan ambos.
    async enviarATrabajador(trabajadorRef: string, tenantId: string, payload: PushPayload): Promise<{ enviados: number }> {
        const ref = (trabajadorRef || '').trim();
        if (!ref) return { enviados: 0 };
        const users = await this.prisma.user.findMany({
            where: {
                tenant_id: tenantId,
                activo: true,
                OR: [{ trabajador_id: ref }, { trabajador_codigo: ref }],
            },
            select: { id: true },
        });
        if (!users.length) return { enviados: 0 };
        const tokens = await this.prisma.pushToken.findMany({
            where: { user_id: { in: users.map((u) => u.id) } },
            select: { token: true },
        });
        if (!tokens.length) return { enviados: 0 };
        return this.enviarATokens(tokens.map((x) => x.token), payload);
    }

    private async enviarATokens(tokens: string[], payload: PushPayload): Promise<{ enviados: number }> {
        const messages = tokens.map((to) => ({
            to,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            sound: 'default',
            priority: 'high',
            channelId: 'consegnas', // Android: canal con sonido/vibración (lo crea la app)
        }));
        try {
            const res = await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(messages),
                signal: AbortSignal.timeout(10000),
            });
            const json: any = await res.json().catch(() => ({}));
            const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
            // Limpieza de tokens muertos: Expo lo indica en el ticket.
            const muertos: string[] = [];
            tickets.forEach((t, i) => {
                if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') muertos.push(tokens[i]);
            });
            if (muertos.length) {
                await this.prisma.pushToken.deleteMany({ where: { token: { in: muertos } } });
                this.logger.log(`Tokens de push eliminados (DeviceNotRegistered): ${muertos.length}`);
            }
            const ok = tickets.filter((t) => t?.status === 'ok').length;
            if (!res.ok) this.logger.warn(`Expo push HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
            return { enviados: ok };
        } catch (e: any) {
            this.logger.warn(`Push falló: ${e?.message || e}`);
            return { enviados: 0 };
        }
    }
}
