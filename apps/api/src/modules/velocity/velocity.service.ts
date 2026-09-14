import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

// Integración con la API de Radius / Velocity Fleet (telemetría de los GPS de los
// carros). Es un modelo de POLLING: se piden las "posiciones live" por cliente y se
// vuelcan a nuestro modelo Position/Device, de modo que Rastreo, Historial y el
// Reporte de Ruta funcionen sin cambios (ya leen Position).
//
// API (deducida del SDK oficial chrisjohnleah/velocity-fleet-api):
//   Base:  https://www.velocityfleet.com
//   Auth (VERIFICADO 2026-09-13): el "API Token" del portal (Cuenta → Configuraciones
//          → Integración API, producto Telemática; un UUID) es un REFRESH token. Se
//          canjea por un JWT con
//            POST /vapi/v1/accounts/users/oauth2/refresh/  { "token": "<API token>" }
//              → { "token": "<JWT>" }   (exp ≈ 44 días; lo cacheamos en memoria)
//          y el JWT va en `Authorization: Bearer <JWT>`. Usar el UUID directo como
//          Bearer/Token da 401 (por eso fallaba el diag inicial).
//   GET  /vapi/v1/accounts/users/customers/  → { <customerId>: { name, product:{"2":"Telematics"} } }
//   POST /api/mobile/kinesis/device-live-positions/?customer=<id>
//          → { device_count, devices:[{ id, vehicle_registration, lat, lon, speed (km/h),
//              ignition:"Y"|"N", direction, timestamp:"<epoch s>", street, town, private }],
//              device_groups:[{ name, devices:[...misma forma, REPETIDOS] }] }
//          Deduplicar por `id`. `private:true` viene con lat/lon 0 → ignorar.
//   Ojo: Django exige el slash final (APPEND_SLASH → 301 si falta).
//
// Config por variables de entorno:
//   VELOCITY_FLEET_TOKEN            → API Token del portal (forma recomendada)
//   VELOCITY_FLEET_CLIENT_ID/_SECRET/_REFRESH_TOKEN → alternativa OAuth2 en /o/token/ (no verificada)
//   VELOCITY_FLEET_BASE_URL        → override del host (opcional)

interface RawDevice {
    id?: number | string;
    vehicle_registration?: string; vehicleRegistration?: string; registration?: string; reg?: string; vrm?: string;
    lat?: number | string; latitude?: number | string;
    lon?: number | string; lng?: number | string; longitude?: number | string;
    speed?: number | string;
    ignition?: boolean | string; ignitionOn?: boolean;
    occurredAt?: string | number; occurred_at?: string | number; timestamp?: string | number; time?: string | number;
    heading?: number | string; bearing?: number | string; direction?: number | string;
    private?: boolean;
    [k: string]: any;
}

@Injectable()
export class VelocityService {
    private readonly logger = new Logger('VelocityFleet');
    private readonly baseUrl = (process.env.VELOCITY_FLEET_BASE_URL || 'https://www.velocityfleet.com').replace(/\/+$/, '');
    // Token OAuth cacheado en memoria (solo cuando se usa el flujo refresh).
    private cachedAccess: { token: string; expiresAt: number } | null = null;

    constructor(private prisma: PrismaService) { }

    // ---- Auth ---------------------------------------------------------------

    private async getAccessToken(): Promise<string> {
        if (this.cachedAccess && this.cachedAccess.expiresAt > Date.now() + 60_000) {
            return this.cachedAccess.token;
        }

        // 1) API Token del portal (UUID) → canje por JWT (forma verificada).
        const apiToken = (process.env.VELOCITY_FLEET_TOKEN || '').trim();
        if (apiToken) {
            const res = await fetch(`${this.baseUrl}/vapi/v1/accounts/users/oauth2/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ token: apiToken }),
                signal: AbortSignal.timeout(15000),
            });
            const json: any = await res.json().catch(() => ({}));
            if (!res.ok || !json.token) {
                throw new Error(`Canje del API Token falló (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
            }
            this.cachedAccess = { token: json.token, expiresAt: this.jwtExpiry(json.token) };
            return json.token;
        }

        // 2) Flujo OAuth2 refresh_token (django-oauth-toolkit en /o/token/). No verificado.
        const clientId = process.env.VELOCITY_FLEET_CLIENT_ID;
        const clientSecret = process.env.VELOCITY_FLEET_CLIENT_SECRET;
        const refresh = process.env.VELOCITY_FLEET_REFRESH_TOKEN;
        if (!clientId || !refresh) {
            throw new Error('Falta configuración: define VELOCITY_FLEET_TOKEN (API Token del portal) o VELOCITY_FLEET_CLIENT_ID + VELOCITY_FLEET_REFRESH_TOKEN.');
        }
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId });
        if (clientSecret) body.set('client_secret', clientSecret);
        const res = await fetch(`${this.baseUrl}/o/token/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body,
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok || !json.access_token) {
            throw new Error(`OAuth refresh falló (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
        }
        this.cachedAccess = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
        return json.access_token;
    }

    // Llamada base: agrega Authorization, asegura slash final y devuelve status + cuerpo.
    private async call(path: string, init?: RequestInit): Promise<{ status: number; ok: boolean; body: any }> {
        const url = `${this.baseUrl}${path}`;
        const doFetch = async () => {
            const token = await this.getAccessToken();
            return fetch(url, {
                ...init,
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
                signal: AbortSignal.timeout(20000),
            });
        };
        let res = await doFetch();
        // JWT vencido o revocado → se descarta el caché y se reintenta una vez.
        if (res.status === 401 && this.cachedAccess) {
            this.cachedAccess = null;
            res = await doFetch();
        }
        const text = await res.text();
        let body: any;
        try { body = text ? JSON.parse(text) : null; } catch { body = text; }
        return { status: res.status, ok: res.ok, body };
    }

    // ---- Diagnóstico --------------------------------------------------------

    // Descubrimiento de auth + endpoints para el API Token opaco de Velocity. Corre
    // TODO en PARALELO con timeout por request (evita el timeout de la función de 60s).
    // Diagnóstico. `tokenOverride`/`hostOverride` permiten probar otro token u otro
    // host sin tocar las env vars (p. ej. un token recién creado en el portal).
    async testConnection(tokenOverride?: string, hostOverride?: string) {
        const token = (tokenOverride || process.env.VELOCITY_FLEET_TOKEN || '').trim();
        const base = (hostOverride ? `https://${hostOverride.replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : this.baseUrl);
        const probe = async (label: string, path: string, headers: Record<string, string>, method: string = 'GET') => {
            try {
                const res = await fetch(`${base}${path}`, { method, headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(6000) });
                const text = await res.text();
                return { label, path, status: res.status, ok: res.ok, body: text.slice(0, 140) } as any;
            } catch (e: any) { return { label, path, error: (e?.message || String(e)).slice(0, 50) } as any; }
        };
        const cust = '/vapi/v1/accounts/users/customers/';
        // Todos los esquemas de auth razonables para un API token opaco (UUID).
        const headerSchemes: Array<[string, Record<string, string>]> = [
            ['Bearer', { Authorization: `Bearer ${token}` }],
            ['Token', { Authorization: `Token ${token}` }],
            ['Api-Key', { Authorization: `Api-Key ${token}` }],
            ['ApiKey', { Authorization: `ApiKey ${token}` }],
            ['X-API-Key', { 'X-API-Key': token }],
            ['X-Api-Token', { 'X-Api-Token': token }],
            ['X-Auth-Token', { 'X-Auth-Token': token }],
            ['api-token', { 'api-token': token }],
        ];
        const schemeJobs = headerSchemes.map(([name, h]) => probe(`cust:${name}`, cust, h));
        // Rutas públicas candidatas (el API Token no es para las del app móvil).
        const paths = ['/vapi/v1/vehicles/', '/vapi/v1/devices/', '/vapi/v1/positions/', '/vapi/v1/device-positions/', '/vapi/v1/tracking/', '/vapi/v1/fleet/', '/api/v1/vehicles/', '/api/v1/positions/', '/api/v1/', '/vapi/v1/', '/api/', '/v1/', '/v1/vehicles/', '/v1/positions/'];
        const discJobs = paths.flatMap((p) => [
            probe(`Token ${p}`, p, { Authorization: `Token ${token}` }),
            probe(`Bearer ${p}`, p, { Authorization: `Bearer ${token}` }),
            probe(`X-API-Key ${p}`, p, { 'X-API-Key': token }),
        ]);
        // Flujo real (canje → JWT → clientes → posiciones). Es lo que usa el sync;
        // si esto sale ok:true la integración está operativa.
        const viaJwt = await (async () => {
            try {
                const res = await fetch(`${base}/vapi/v1/accounts/users/oauth2/refresh/`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ token }), signal: AbortSignal.timeout(9000),
                });
                const j: any = await res.json().catch(() => ({}));
                if (!res.ok || !j.token) return { ok: false, step: 'canje', status: res.status, body: JSON.stringify(j).slice(0, 160) };
                const H = { Accept: 'application/json', Authorization: `Bearer ${j.token}` };
                const cr = await fetch(`${base}/vapi/v1/accounts/users/customers/`, { headers: H, signal: AbortSignal.timeout(9000) });
                const cj: any = await cr.json().catch(() => ({}));
                if (!cr.ok || typeof cj !== 'object') return { ok: false, step: 'customers', status: cr.status, body: JSON.stringify(cj).slice(0, 160) };
                const customers = Object.entries(cj).map(([id, v]: [string, any]) => ({ id, name: v?.name, product: v?.product }));
                const positions: any[] = [];
                for (const c of customers) {
                    const pr = await fetch(`${base}/api/mobile/kinesis/device-live-positions/?customer=${encodeURIComponent(c.id)}`, { method: 'POST', headers: H, signal: AbortSignal.timeout(9000) });
                    const pj: any = await pr.json().catch(() => ({}));
                    const devs: any[] = Array.isArray(pj?.devices) ? pj.devices : [];
                    positions.push({ customer: c.id, status: pr.status, device_count: pj?.device_count ?? devs.length, placas: devs.map((d) => d?.vehicle_registration).filter(Boolean).slice(0, 30) });
                }
                return { ok: true, customers, positions };
            } catch (e: any) { return { ok: false, step: 'excepcion', error: (e?.message || String(e)).slice(0, 120) }; }
        })();

        const all = await Promise.all([...schemeJobs, ...discJobs]);
        const schemes = all.slice(0, schemeJobs.length);
        const discovery = all.slice(schemeJobs.length);
        // Solo lo interesante: JSON (no HTML de la SPA) o status distinto de 401/403/404.
        const isHtml = (d: any) => /<!doctype html|<html/i.test(d.body || '');
        const interesting = discovery.filter((d) => (d.ok && !isHtml(d)) || (d.status && ![200, 401, 403, 404].includes(d.status)));
        const hit = all.find((d) => d.ok && !isHtml(d)) || null;
        return { base, tokenSet: !!token, tokenPreview: token ? token.slice(0, 8) + '…' : null, viaJwt, hit, schemes, interesting };
    }

    // Lee la documentación (api-docs.velocityfleet.com) desde el server (egress limpio)
    // para descubrir la URL del spec OpenAPI → endpoints + auth reales del API Token.
    async fetchDocs() {
        const D = 'https://api-docs.velocityfleet.com';
        let html = '';
        try {
            const res = await fetch(`${D}/`, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(9000) });
            html = await res.text();
        } catch (e: any) { return { error: (e?.message || String(e)).slice(0, 100) }; }

        // Referencias a script/spec en TODO el HTML (no truncado).
        const scripts = Array.from(html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)).map((m) => m[1]);
        const links = Array.from(html.matchAll(/(?:href|data-url|spec-url|data-spec-url)=["']([^"']+)["']/gi)).map((m) => m[1]);
        const specUrls = Array.from(html.matchAll(/[^"' ]*(?:openapi|swagger|spec|redoc|scalar)[^"' ]*\.(?:json|yaml|js)/gi)).map((m) => m[0]);
        // ¿El spec está EMBEBIDO? Buscamos marcadores OpenAPI en el HTML.
        const embI = html.search(/"openapi"\s*:/i);
        const pathsI = html.search(/"paths"\s*:/i);
        const embedded = embI >= 0 ? html.slice(Math.max(0, embI - 40), embI + 1200) : null;
        // Tag scalar/redoc con config.
        const scalarTag = (html.match(/<script[^>]*id=["']api-reference["'][^>]*>/i) || [])[0] || null;
        return {
            len: html.length,
            scripts: Array.from(new Set(scripts)).slice(0, 30),
            links: Array.from(new Set(links)).slice(0, 30),
            specUrls: Array.from(new Set(specUrls)).slice(0, 20),
            embeddedFound: embI >= 0 || pathsI >= 0,
            scalarTag,
            embeddedPreview: embedded,
        };
    }

    // Fetch crudo de una URL de velocityfleet (solo ese dominio) para inspección.
    // Canje del API Token (UUID del portal "Integración API") por un access token.
    // Es lo que hace el login de api-docs.velocityfleet.com: POST oauth2/verify
    // con { token } (+ campos hCaptcha, que aquí probamos con y sin).
    async verifyApiToken(token: string) {
        const url = `${this.baseUrl}/vapi/v1/accounts/users/oauth2/verify/`;
        const attempt = async (label: string, body: Record<string, unknown>) => {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(9000),
                });
                const text = await res.text();
                let json: any = null; try { json = JSON.parse(text); } catch { /* html/text */ }
                // No devolver secretos completos: solo forma y prefijos.
                const shape = json && typeof json === 'object'
                    ? Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === 'string' ? `${v.slice(0, 12)}…(${v.length})` : v]))
                    : text.slice(0, 200);
                return { label, status: res.status, ok: res.ok, shape };
            } catch (e: any) { return { label, error: (e?.message || String(e)).slice(0, 80) }; }
        };
        const t = token.trim();
        return {
            tokenPreview: t.slice(0, 8) + '…',
            results: await Promise.all([
                attempt('solo token', { token: t }),
                attempt('token + hcaptcha vacío', { token: t, hcaptcha_token: null, hcaptcha_score: null, hcaptcha_reason: null }),
                attempt('api_token', { api_token: t }),
            ]),
        };
    }

    // Temporal (descubrimiento): proxy genérico hacia *.velocityfleet.com con método,
    // headers y body libres; devuelve también los headers de respuesta (Set-Cookie)
    // para poder reproducir el login por cookie de api-docs.velocityfleet.com.
    async proxyFetch(input: { url: string; method?: string; headers?: Record<string, string>; body?: string }) {
        const { url, method = 'GET', headers = {}, body } = input || ({} as any);
        if (!/^https?:\/\/[^/]*velocityfleet\.com/i.test(url || '')) return { error: 'solo velocityfleet.com' };
        try {
            const res = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
            const resHeaders: Record<string, string> = {};
            res.headers.forEach((v, k) => { resHeaders[k] = v; });
            const setCookie = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [];
            const text = await res.text();
            return { url, status: res.status, headers: resHeaders, setCookie, len: text.length, body: text.slice(0, 60000) };
        } catch (e: any) { return { url, error: (e?.message || String(e)).slice(0, 120) }; }
    }

    async rawFetch(url: string) {
        if (!/^https?:\/\/[^/]*velocityfleet\.com/i.test(url)) return { error: 'solo velocityfleet.com' };
        try {
            const res = await fetch(url, { headers: { Accept: '*/*', Authorization: `Token ${process.env.VELOCITY_FLEET_TOKEN || ''}` }, signal: AbortSignal.timeout(9000) });
            const ct = res.headers.get('content-type') || '';
            const text = await res.text();
            return { url, status: res.status, ct, len: text.length, body: text.slice(0, 5000) };
        } catch (e: any) { return { url, error: (e?.message || String(e)).slice(0, 100) }; }
    }

    // ---- Lectura de la API --------------------------------------------------

    // Lista los ids de cliente vinculados al token. La respuesta es un objeto
    // { "<id>": {...} }; devolvemos las claves.
    async listCustomerIds(): Promise<string[]> {
        const r = await this.call('/vapi/v1/accounts/users/customers/');
        if (!r.ok || !r.body || typeof r.body !== 'object' || Array.isArray(r.body)) {
            throw new Error(`No se pudo listar clientes (HTTP ${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
        }
        return Object.keys(r.body);
    }

    // Posiciones live de un cliente. Aplana devices[] y deviceGroups[].devices[].
    // Retorno `any[]` a propósito: no exponer el tipo interno RawDevice en la firma
    // pública (nest build genera .d.ts y TS4053 se queja de un tipo no nombrable).
    async fetchDevicePositions(customerId: string): Promise<any[]> {
        const r = await this.call(`/api/mobile/kinesis/device-live-positions/?customer=${encodeURIComponent(customerId)}`, { method: 'POST' });
        if (!r.ok) {
            throw new Error(`Posiciones cliente ${customerId} fallaron (HTTP ${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
        }
        const b = r.body || {};
        const flat: RawDevice[] = [];
        if (Array.isArray(b.devices)) flat.push(...b.devices);
        for (const key of ['device_groups', 'deviceGroups']) {
            if (Array.isArray(b[key])) for (const g of b[key]) if (Array.isArray(g?.devices)) flat.push(...g.devices);
        }
        // Los grupos repiten los mismos devices que la lista plana → dedupe por id
        // (o por matrícula si no hay id).
        const seen = new Set<string>();
        return flat.filter((d) => {
            const k = String(d?.id ?? d?.vehicle_registration ?? d?.vehicleRegistration ?? '');
            if (!k || seen.has(k)) return false;
            seen.add(k); return true;
        });
    }

    // ---- Sync (poller) ------------------------------------------------------

    // Trae las posiciones live de todos los clientes y las vuelca a Position/Device,
    // mapeando cada vehicleRegistration → nuestro Vehiculo por placa. Devuelve un
    // resumen (insertadas, sin-match) para el cron y para depurar.
    async sync() {
        const customerIds = await this.listCustomerIds();

        // Índice placa-normalizada → vehículo (una sola query; el token es de una
        // cuenta, pero mapeamos sobre todos los vehículos por si hay varios tenants).
        const vehiculos = await this.prisma.vehiculo.findMany({ select: { id: true, placa: true, tenant_id: true } });
        const vehByPlaca = new Map<string, { id: string; placa: string; tenant_id: string }>();
        for (const v of vehiculos) vehByPlaca.set(this.normPlaca(v.placa), v);

        let matched = 0, inserted = 0, skippedOld = 0;
        const unmatched = new Set<string>();
        let devicesVistos = 0;

        for (const customerId of customerIds) {
            let devices: RawDevice[] = [];
            try {
                devices = await this.fetchDevicePositions(customerId);
            } catch (e: any) {
                this.logger.warn(`Cliente ${customerId}: ${e?.message || e}`);
                continue;
            }
            for (const d of devices) {
                devicesVistos++;
                const regRaw = d.vehicle_registration || d.vehicleRegistration || d.registration || d.reg || d.vrm || '';
                const lat = Number(d.lat ?? d.latitude);
                const lon = Number(d.lon ?? d.lng ?? d.longitude);
                if (!regRaw || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                // `private:true` (modo privado del chofer) llega con 0,0 → no es una posición.
                if (d.private === true || (lat === 0 && lon === 0)) continue;

                const veh = vehByPlaca.get(this.normPlaca(regRaw));
                if (!veh) { unmatched.add(String(regRaw)); continue; }
                matched++;

                const ts = this.parseTs(d.occurredAt ?? d.occurred_at ?? d.timestamp ?? d.time);
                const speed = d.speed != null ? Number(d.speed) : null;
                const heading = d.heading != null ? Number(d.heading) : d.bearing != null ? Number(d.bearing) : d.direction != null ? Number(d.direction) : null;
                const ignition = typeof d.ignition === 'boolean' ? d.ignition
                    : typeof d.ignition === 'string' ? /^(y|yes|on|true|1)$/i.test(d.ignition)
                    : typeof d.ignitionOn === 'boolean' ? d.ignitionOn : null;

                // Device por vehículo (imei estable derivado de la placa). Se crea/actualiza
                // y se enlaza al vehículo para que Rastreo lo muestre en la pestaña Vehículos.
                const imei = `VF-${this.normPlaca(regRaw)}`;
                let device = await this.prisma.device.findUnique({ where: { imei } });
                if (!device) {
                    device = await this.prisma.device.create({
                        data: { imei, name: `GPS ${veh.placa}`, model: 'VelocityFleet', tenant_id: veh.tenant_id, vehiculo_id: veh.id },
                    });
                } else if (device.vehiculo_id !== veh.id || device.tenant_id !== veh.tenant_id) {
                    device = await this.prisma.device.update({ where: { id: device.id }, data: { vehiculo_id: veh.id, tenant_id: veh.tenant_id } });
                }

                // Dedupe: la posición live es una foto del momento. Solo insertamos si es
                // MÁS NUEVA que la última guardada de ese device (evita repetir el mismo punto).
                const last = await this.prisma.position.findFirst({
                    where: { device_id: device.id },
                    orderBy: { timestamp: 'desc' },
                    select: { timestamp: true },
                });
                if (last && ts.getTime() <= new Date(last.timestamp).getTime()) { skippedOld++; continue; }

                await this.prisma.position.create({
                    data: {
                        device_id: device.id,
                        latitude: lat, longitude: lon,
                        speed: speed != null && Number.isFinite(speed) ? speed : undefined,
                        heading: heading != null && Number.isFinite(heading) ? heading : undefined,
                        ignition: ignition ?? undefined,
                        timestamp: ts,
                    },
                });
                inserted++;

                await this.prisma.device.update({ where: { id: device.id }, data: { last_activity: new Date() } });
                await this.prisma.vehiculo.update({
                    where: { id: veh.id },
                    data: { ultima_latitud: lat, ultima_longitud: lon, ultima_actualizacion: ts },
                }).catch(() => { /* no bloquear el sync por el espejo en vehiculo */ });
            }
        }

        const resumen = { customers: customerIds.length, devicesVistos, matched, inserted, skippedOld, unmatched: Array.from(unmatched) };
        this.logger.log(`sync → ${JSON.stringify(resumen)}`);
        return resumen;
    }

    // ---- Helpers ------------------------------------------------------------

    // Normaliza una placa/matrícula para comparar (mayúsculas, sin separadores).
    private normPlaca(s: any): string {
        return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // Vencimiento de un JWT (claim exp, en segundos). Si no se puede leer → 1 h.
    private jwtExpiry(jwt: string): number {
        try {
            const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
            if (payload?.exp) return Number(payload.exp) * 1000;
        } catch { /* token opaco */ }
        return Date.now() + 3600_000;
    }

    // Parseo defensivo del timestamp: epoch (s o ms) o string ISO.
    private parseTs(v: any): Date {
        if (v == null) return new Date();
        if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
        const n = Number(v);
        if (!isNaN(n) && String(v).trim() !== '') return new Date(n < 1e12 ? n * 1000 : n);
        const d = new Date(v);
        return isNaN(d.getTime()) ? new Date() : d;
    }
}
