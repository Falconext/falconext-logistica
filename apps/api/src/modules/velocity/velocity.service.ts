import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

// Integración con la API de Radius / Velocity Fleet (telemetría de los GPS de los
// carros). Es un modelo de POLLING: se piden las "posiciones live" por cliente y se
// vuelcan a nuestro modelo Position/Device, de modo que Rastreo, Historial y el
// Reporte de Ruta funcionen sin cambios (ya leen Position).
//
// API (deducida del SDK oficial chrisjohnleah/velocity-fleet-api):
//   Base:  https://www.velocityfleet.com
//   Auth:  Authorization: Bearer <token>  (token directo de la UI: Account →
//          Account Settings → API Integrations), o flujo OAuth2 refresh en /o/token/.
//   GET  /vapi/v1/accounts/users/customers/            → { <customerId>: {...}, ... }
//   POST /api/mobile/kinesis/device-live-positions/?customer=<id>
//          → { deviceCount, devices:[{ vehicleRegistration, lat, lon, speed,
//              ignition, occurredAt }], deviceGroups:[{ name, devices:[...] }] }
//   Ojo: Django exige el slash final (APPEND_SLASH → 301 si falta).
//
// Config por variables de entorno:
//   VELOCITY_FLEET_TOKEN            → token Bearer directo (forma recomendada)
//   VELOCITY_FLEET_CLIENT_ID/_SECRET/_REFRESH_TOKEN → alternativa OAuth2 refresh
//   VELOCITY_FLEET_BASE_URL        → override del host (opcional)

interface RawDevice {
    vehicleRegistration?: string; registration?: string; reg?: string; vrm?: string;
    lat?: number | string; latitude?: number | string;
    lon?: number | string; lng?: number | string; longitude?: number | string;
    speed?: number | string;
    ignition?: boolean; ignitionOn?: boolean;
    occurredAt?: string | number; occurred_at?: string | number; timestamp?: string | number; time?: string | number;
    heading?: number | string; bearing?: number | string;
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
        // 1) Token Bearer directo (forma recomendada).
        const direct = process.env.VELOCITY_FLEET_TOKEN;
        if (direct) return direct;

        // 2) Flujo OAuth2 refresh_token (django-oauth-toolkit en /o/token/).
        const clientId = process.env.VELOCITY_FLEET_CLIENT_ID;
        const clientSecret = process.env.VELOCITY_FLEET_CLIENT_SECRET;
        const refresh = process.env.VELOCITY_FLEET_REFRESH_TOKEN;
        if (!clientId || !refresh) {
            throw new Error('Falta configuración: define VELOCITY_FLEET_TOKEN (Bearer directo) o VELOCITY_FLEET_CLIENT_ID + VELOCITY_FLEET_REFRESH_TOKEN.');
        }
        if (this.cachedAccess && this.cachedAccess.expiresAt > Date.now() + 30_000) {
            return this.cachedAccess.token;
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
        const token = await this.getAccessToken();
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            ...init,
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
        });
        const text = await res.text();
        let body: any;
        try { body = text ? JSON.parse(text) : null; } catch { body = text; }
        return { status: res.status, ok: res.ok, body };
    }

    // ---- Diagnóstico --------------------------------------------------------

    // Devuelve el status + cuerpo CRUDO del endpoint de clientes. Sirve para validar
    // el token en el entorno real (ver si sale el JSON o un bloqueo de firewall).
    async testConnection() {
        const tokenMode = process.env.VELOCITY_FLEET_TOKEN ? 'bearer-directo' : 'oauth-refresh';
        try {
            const r = await this.call('/vapi/v1/accounts/users/customers/');
            const customerIds = r.ok && r.body && typeof r.body === 'object' && !Array.isArray(r.body)
                ? Object.keys(r.body) : [];
            return { ok: r.ok, status: r.status, tokenMode, customerIds, body: r.body };
        } catch (e: any) {
            return { ok: false, status: 0, tokenMode, error: e?.message || String(e) };
        }
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
        if (Array.isArray(b.deviceGroups)) {
            for (const g of b.deviceGroups) if (Array.isArray(g?.devices)) flat.push(...g.devices);
        }
        return flat;
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
                const regRaw = d.vehicleRegistration || d.registration || d.reg || d.vrm || '';
                const lat = Number(d.lat ?? d.latitude);
                const lon = Number(d.lon ?? d.lng ?? d.longitude);
                if (!regRaw || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

                const veh = vehByPlaca.get(this.normPlaca(regRaw));
                if (!veh) { unmatched.add(String(regRaw)); continue; }
                matched++;

                const ts = this.parseTs(d.occurredAt ?? d.occurred_at ?? d.timestamp ?? d.time);
                const speed = d.speed != null ? Number(d.speed) : null;
                const heading = d.heading != null ? Number(d.heading) : (d.bearing != null ? Number(d.bearing) : null);
                const ignition = typeof d.ignition === 'boolean' ? d.ignition
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
