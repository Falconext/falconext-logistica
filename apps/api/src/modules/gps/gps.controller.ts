import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('gps')
export class GpsController {
    constructor(private readonly gpsService: GpsService) { }

    // Public Ingestion Endpoint (Devices authenticate via Token in body)
    @Post('ingest')
    async ingest(@Body() body: any) {
        // Body expected: { token: "uuid", lat: 12.34, lng: -75.12, ... }
        return this.gpsService.ingestPosition(body.token, {
            lat: parseFloat(body.lat),
            lng: parseFloat(body.lng),
            speed: body.speed ? parseFloat(body.speed) : 0,
            heading: body.heading ? parseFloat(body.heading) : 0,
            timestamp: body.timestamp,
            battery: body.battery ? parseInt(body.battery) : undefined
        });
    }

    @Get('verify/:token')
    async verifyToken(@Param('token') token: string) {
        const isValid = await this.gpsService.verifyDeviceToken(token);
        return { valid: isValid };
    }

    // Protected Admin Endpoints
    @UseGuards(JwtAuthGuard)
    @Post('devices')
    async registerDevice(@Body() body: any, @Req() req) {
        return this.gpsService.registerDevice({
            ...body,
            tenantId: req.user.tenantId
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get('devices')
    async getDevices(@Req() req) {
        return this.gpsService.getDevices(req.user.tenantId);
    }

    // Device del usuario autenticado (para el módulo Rastreo de la app móvil).
    @UseGuards(JwtAuthGuard)
    @Get('mi-dispositivo')
    async getMiDispositivo(@Req() req) {
        return this.gpsService.getMiDispositivo(req.user.tenantId, req.user.trabajadorId ?? null);
    }

    @UseGuards(JwtAuthGuard)
    @Get('trabajador/:trabajadorId/ubicacion')
    async getTrabajadorLocation(@Param('trabajadorId') trabajadorId: string, @Req() req) {
        return this.gpsService.getTrabajadorLocation(req.user.tenantId, trabajadorId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('devices/:id')
    async updateDevice(@Param('id') id: string, @Body() body: any, @Req() req) {
        return this.gpsService.updateDevice(id, req.user.tenantId, body);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('devices/:id')
    async deleteDevice(@Param('id') id: string, @Req() req) {
        return this.gpsService.deleteDevice(id, req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('history/:deviceId')
    async getHistory(@Param('deviceId') deviceId: string, @Query('from') from: string, @Query('to') to: string, @Query('limit') limit: string) {
        const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default 24h
        const toDate = to ? new Date(to) : new Date();
        const limitNum = limit ? parseInt(limit) : undefined;
        return this.gpsService.getHistory(deviceId, fromDate, toDate, limitNum);
    }

    // Análisis de recorrido (distancia, tiempos, paradas, tramos) de un rango.
    @UseGuards(JwtAuthGuard)
    @Get('history/:deviceId/analisis')
    async getTripAnalysis(@Param('deviceId') deviceId: string, @Query('from') from: string, @Query('to') to: string) {
        const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const toDate = to ? new Date(to) : new Date();
        return this.gpsService.getTripAnalysis(deviceId, fromDate, toDate);
    }

    @UseGuards(JwtAuthGuard)
    @Post('geofences')
    async createGeofence(@Body() body: any, @Req() req) {
        return this.gpsService.createGeofence({
            ...body,
            tenantId: req.user.tenantId
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get('geofences')
    async getGeofences(@Req() req) {
        return this.gpsService.getGeofences(req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('geofences/:id')
    async updateGeofence(@Param('id') id: string, @Body() body: any, @Req() req) {
        return this.gpsService.updateGeofence(id, req.user.tenantId, body);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('geofences/:id')
    async deleteGeofence(@Param('id') id: string, @Req() req) {
        return this.gpsService.deleteGeofence(id, req.user.tenantId);
    }
}
