import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SheetsService } from './sheets.service';

@Injectable()
export class SyncService {
    private readonly logger = new Logger(SyncService.name);

    constructor(
        private prisma: PrismaService,
        private sheetsService: SheetsService
    ) { }

    /**
     * Ejecuta `fn` sobre los items en lotes concurrentes. Evita el timeout de la
     * función serverless: antes se hacía un upsert secuencial por fila (~6000 idas
     * y vueltas a la BD > 30s). En paralelo por lotes baja a pocos segundos.
     */
    private async batchRun<T>(items: T[], size: number, fn: (item: T) => Promise<any>): Promise<number> {
        let done = 0;
        for (let i = 0; i < items.length; i += size) {
            const chunk = items.slice(i, i + size);
            await Promise.all(chunk.map((it) => fn(it)));
            done += chunk.length;
        }
        return done;
    }

    async syncSheet(tenantId: string) {
        // 1. Get Tenant Config
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant || !tenant.google_sheet_id) {
            throw new Error('Tenant not configured for Sync');
        }

        this.logger.log(`Starting sync for tenant: ${tenant.name} - Sheet: ${tenant.google_sheet_id}`);

        // 2. Read 'Hoja 1' for Driver Lookup (Id_Trabajador -> NOMBRE)
        const driversMap = new Map<string, string>();
        try {
            const rowsDrivers = await this.sheetsService.getSheetData(tenant.google_sheet_id, 'Hoja 1!A:Z');
            if (rowsDrivers && rowsDrivers.length > 1) {
                const headerRow = rowsDrivers[1] || [];
                const headers = headerRow.map((x: string) => x?.toString().toUpperCase().trim());

                const idxName = headers.findIndex((h: string) => h === 'NOMBRE');
                const idxCode = headers.findIndex((h: string) => h === 'ID_TRABAJADOR');

                if (idxName !== -1 && idxCode !== -1) {
                    for (let i = 2; i < rowsDrivers.length; i++) {
                        const row = rowsDrivers[i];
                        const code = row[idxCode]?.toString().trim();
                        const name = row[idxName]?.toString().trim();
                        if (code && name) driversMap.set(code, name);
                    }
                    this.logger.log(`Loaded ${driversMap.size} drivers from Hoja 1`);
                }
            }
        } catch (e) {
            this.logger.warn(`Failed to load Hoja 1: ${e.message}`);
        }

        // 3. Read 'Hoja 2' for Vehicle Lookup (ID_FURGON -> TARGA - MODELO)
        const vehiclesMap = new Map<string, string>();
        try {
            const rowsVehicles = await this.sheetsService.getSheetData(tenant.google_sheet_id, 'Hoja 2!A:Z');
            if (rowsVehicles && rowsVehicles.length > 1) {
                const headerRow = rowsVehicles[1] || [];
                const headers = headerRow.map((x: string) => x?.toString().toUpperCase().trim());

                const idxTarga = headers.findIndex((h: string) => h === 'TARGA');
                const idxModelo = headers.findIndex((h: string) => h === 'MODELO' || h.includes('MODEL'));
                const idxFurgon = headers.findIndex((h: string) => h === 'ID_FURGON');

                this.logger.log(`Hoja 2 indices: TARGA=${idxTarga}, MODELO=${idxModelo}, ID_FURGON=${idxFurgon}`);

                if (idxTarga !== -1 && idxModelo !== -1 && idxFurgon !== -1) {
                    for (let i = 2; i < rowsVehicles.length; i++) {
                        const row = rowsVehicles[i];
                        const furgonId = row[idxFurgon]?.toString().trim();
                        const targa = row[idxTarga]?.toString().trim();
                        const modelo = row[idxModelo]?.toString().trim();
                        if (furgonId && targa && modelo) {
                            vehiclesMap.set(furgonId, `${targa} - ${modelo}`);
                        }
                    }
                    this.logger.log(`Loaded ${vehiclesMap.size} vehicles from Hoja 2`);
                }
            }
        } catch (e) {
            this.logger.warn(`Failed to load Hoja 2: ${e.message}`);
        }

        // 4. Read 'DHL CONSEGNAS' Data
        const range = 'DHL CONSEGNAS!A:Z';
        const rows = await this.sheetsService.getSheetData(tenant.google_sheet_id, range);

        if (!rows || rows.length === 0) {
            this.logger.warn('No data found in sheet');
            return;
        }

        // 5. Process Rows
        const headers = rows[0].map((h: string) => h?.toString().toUpperCase().trim());
        this.logger.log(`DHL CONSEGNAS Headers: ${headers.slice(0, 10).join(', ')}...`);
        const dataRows = rows.slice(1);

        const getIndex = (name: string) => headers.findIndex((h: string) => h === name || h.includes(name));

        const idxId = getIndex('ID');
        const idxFecha = getIndex('DATA');
        const idxCliente = getIndex('SPEDIZZIONE');
        const idxVehiculo = getIndex('TARGA');
        const idxConductorCode = getIndex('AUTISTA');
        const idxEntrega = getIndex('DESTINAZIONE');
        const idxEstado = getIndex('ESTADO');
        const idxIngreso = getIndex('INGRESO');
        const idxETA = getIndex('ETA');

        let skipCount = 0;

        // Construir las operaciones de upsert (validando filas) y luego ejecutarlas
        // en lotes concurrentes para no exceder el tiempo de la función.
        const ops: any[] = [];
        for (const row of dataRows) {
            const idProgramacion = row[idxId];

            if (!idProgramacion || idProgramacion.toString().trim() === '') {
                skipCount++;
                continue;
            }

            // Date Parsing
            const dateStr = row[idxFecha];
            const etaStr = row[idxETA];
            const fecha = this.parseDeliveryDate(dateStr, etaStr);

            // Driver Lookup
            const driverCode = row[idxConductorCode]?.toString().trim();
            const driverName = driversMap.get(driverCode) || driverCode || '';

            // Vehicle Lookup (F001 -> ER643VY - FIAT DOBLO)
            const vehicleCode = row[idxVehiculo]?.toString().trim();
            const vehicleName = vehiclesMap.get(vehicleCode) || vehicleCode || '';

            // Estado mapping to Spanish
            const estadoRaw = row[idxEstado]?.toString().trim() || '';
            const estado = this.mapEstado(estadoRaw);

            const base = {
                fecha,
                cliente: row[idxCliente] || '',
                lugar_retiro: 'VIA DANTE ALIGHIERI 1, Peschiera Borromeo, 20068',
                lugar_entrega: row[idxEntrega] || '',
                vehiculo_id: vehicleName,
                trabajador_id: driverName,
                tenant_id: tenantId,
                estado,
                ingreso_estimado: row[idxIngreso] ? parseFloat(row[idxIngreso].toString().replace(',', '.')) : 0,
                fecha_entrega: fecha,
            };

            ops.push({
                where: { id_programacion: idProgramacion.toString() },
                update: { ...base, actualizado_en: new Date() },
                create: { id_programacion: idProgramacion.toString(), ...base },
            });
        }

        const count = await this.batchRun(ops, 25, (op) => this.prisma.programacion.upsert(op));

        // 6. Sync MANCATO P. (Peajes/Multas)
        const peajeCount = await this.syncPeajes(tenant.google_sheet_id, tenantId);

        // 7. Sync COMBUSTIBLE
        const combustibleCount = await this.syncCombustible(tenant.google_sheet_id, tenantId);

        // 8. Update Timestamp
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { last_synced: new Date() }
        });

        this.logger.log(`Synced: ${count} routes, ${peajeCount} peajes, ${combustibleCount} combustible. Skipped ${skipCount} empty rows.`);
        return { success: true, count, peajeCount, combustibleCount };
    }

    /**
     * Sync MANCATO P. sheet (Peajes/Multas)
     */
    private async syncPeajes(sheetId: string, tenantId: string): Promise<number> {
        try {
            const rows = await this.sheetsService.getSheetData(sheetId, 'MANCATO P.!A:Z');
            if (!rows || rows.length < 2) return 0;

            const headers = rows[0].map((h: string) => h?.toString().toUpperCase().trim().replace(/ /g, '_'));
            const getIdx = (name: string) => headers.findIndex((h: string) => h.includes(name));

            const idxId = getIdx('ID_MULTAS');
            const idxEstado = getIdx('ESTADO');
            const idxFecha = getIdx('FECHA');
            const idxHora = getIdx('HORA');
            const idxTarga = getIdx('TARGA');
            const idxMonto = getIdx('MONTO');
            const idxTrabajador = headers.findIndex((h: string) => h === 'ID__TRABAJADOR' || h.includes('TRABAJADOR'));
            const idxComentarios = getIdx('COMENTARIOS');
            const idxArchivo = getIdx('ARCHIVO');
            const idxRecibo = getIdx('RECIBO');
            const idxTipo = getIdx('TIPO');
            const idxMes = getIdx('MES');

            const ops: any[] = [];
            for (const row of rows.slice(1)) {
                const idMulta = row[idxId]?.toString().trim();
                if (!idMulta) continue;

                const montoRaw = row[idxMonto]?.toString().replace('€', '').replace(',', '.').trim();
                const monto = montoRaw ? parseFloat(montoRaw) : null;

                const fechaStr = row[idxFecha];
                let fecha: Date | null = null;
                if (fechaStr && fechaStr.includes('/')) {
                    const parts = fechaStr.split('/');
                    if (parts.length === 3) {
                        fecha = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    }
                }

                const base = {
                    estado: row[idxEstado]?.toString().trim() || null,
                    fecha,
                    hora: row[idxHora]?.toString().trim() || null,
                    targa: row[idxTarga]?.toString().trim() || null,
                    monto,
                    trabajador_id: row[idxTrabajador]?.toString().trim() || null,
                    comentarios: row[idxComentarios]?.toString().trim() || null,
                    archivo: row[idxArchivo]?.toString().trim() || null,
                    recibo_pago: row[idxRecibo]?.toString().trim() || null,
                    tipo: row[idxTipo]?.toString().trim() || null,
                    mes: row[idxMes]?.toString().trim() || null,
                };

                ops.push({
                    where: { id_multa: idMulta },
                    update: { ...base, actualizado_en: new Date() },
                    create: { id_multa: idMulta, ...base, tenant_id: tenantId },
                });
            }
            const count = await this.batchRun(ops, 25, (op) => this.prisma.peaje.upsert(op));
            this.logger.log(`Synced ${count} peajes from MANCATO P.`);
            return count;
        } catch (e) {
            this.logger.warn(`Failed to sync MANCATO P.: ${e.message}`);
            return 0;
        }
    }

    /**
     * Sync COMBUSTIBLE sheet
     */
    private async syncCombustible(sheetId: string, tenantId: string): Promise<number> {
        try {
            const rows = await this.sheetsService.getSheetData(sheetId, 'COMBUSTIBLE!A:Z');
            if (!rows || rows.length < 2) return 0;

            const headers = rows[0].map((h: string) => h?.toString().toUpperCase().trim());
            const getIdx = (name: string) => headers.findIndex((h: string) => h.includes(name));

            const idxId = getIdx('ID_REGISTRO');
            const idxTrabajador = getIdx('ID_TRABAJADOR');
            const idxFecha = getIdx('FECHA');
            const idxMonto = getIdx('MONTO');
            const idxTarga = getIdx('TARGA');
            const idxMetodo = getIdx('METODO');
            const idxArea = getIdx('AREA');
            const idxMes = getIdx('MES');
            const idxArchivo = getIdx('ARCHIVO');

            const ops: any[] = [];
            for (const row of rows.slice(1)) {
                const idRegistro = row[idxId]?.toString().trim();
                if (!idRegistro) continue;

                const montoRaw = row[idxMonto]?.toString().replace(',', '.').trim();
                const monto = montoRaw ? parseFloat(montoRaw) : null;

                const fechaStr = row[idxFecha];
                let fecha: Date | null = null;
                if (fechaStr) {
                    // Format is DD/MM/YYYY (European) like "1/9/2025" = 1 Sept 2025
                    const parts = fechaStr.split('/');
                    if (parts.length === 3) {
                        const day = parseInt(parts[0]);
                        const month = parseInt(parts[1]) - 1; // 0-indexed
                        const year = parseInt(parts[2]);
                        fecha = new Date(year, month, day);
                    }
                }

                const base = {
                    trabajador_id: row[idxTrabajador]?.toString().trim() || null,
                    fecha,
                    monto,
                    targa: row[idxTarga]?.toString().trim() || null,
                    metodo: row[idxMetodo]?.toString().trim() || null,
                    area: row[idxArea]?.toString().trim() || null,
                    mes: row[idxMes]?.toString().trim() || null,
                    archivo: row[idxArchivo]?.toString().trim() || null,
                };

                ops.push({
                    where: { id_registro: idRegistro },
                    update: { ...base, actualizado_en: new Date() },
                    create: { id_registro: idRegistro, ...base, tenant_id: tenantId },
                });
            }
            const count = await this.batchRun(ops, 25, (op) => this.prisma.combustible.upsert(op));
            this.logger.log(`Synced ${count} combustible records.`);
            return count;
        } catch (e) {
            this.logger.warn(`Failed to sync COMBUSTIBLE: ${e.message}`);
            return 0;
        }
    }

    private parseDeliveryDate(dateStr: string, etaStr: string): Date {
        let year = new Date().getFullYear();
        let month = new Date().getMonth();
        let day = new Date().getDate();
        let hours = 12;
        let minutes = 0;

        if (dateStr && dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                day = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10) - 1;
                year = parseInt(parts[2], 10);
            }
        }

        if (etaStr) {
            if (etaStr.includes('/') && etaStr.includes(':')) {
                const spaceParts = etaStr.split(' ');
                if (spaceParts.length >= 2) {
                    const tParts = spaceParts[1].split(':');
                    if (tParts.length >= 2) {
                        hours = parseInt(tParts[0], 10) || 12;
                        minutes = parseInt(tParts[1], 10) || 0;
                    }
                }
            } else if (etaStr.includes(':') && !etaStr.includes('/')) {
                const tParts = etaStr.split(':');
                if (tParts.length >= 2) {
                    hours = parseInt(tParts[0], 10) || 12;
                    minutes = parseInt(tParts[1], 10) || 0;
                }
            }
        }

        if (year < 2020 || year > 2030) year = new Date().getFullYear();
        if (month < 0 || month > 11) month = new Date().getMonth();
        if (day < 1 || day > 31) day = new Date().getDate();

        return new Date(year, month, day, hours, minutes, 0);
    }

    /**
     * Map Italian/Spanish states to Spanish display values
     */
    private mapEstado(value: string): string {
        if (!value) return 'PENDIENTE';
        const v = value.toUpperCase().trim();

        // CONSEGNATO / ENTREGADO = Delivered
        if (v === 'CONSEGNATO' || v === 'ENTREGADO' || v.includes('ENTREG')) {
            return 'ENTREGADO';
        }

        // ANNULLATO = Cancelled
        if (v === 'ANNULLATO' || v.includes('ANULL') || v.includes('CANCEL')) {
            return 'ANULADO';
        }

        // IN SOSPESO = Pending
        if (v === 'IN SOSPESO' || v.includes('SOSPES')) {
            return 'PENDIENTE';
        }

        // RISCHEDULATO = Rescheduled
        if (v === 'RISCHEDULATO' || v.includes('RESCHEDUL') || v.includes('REPROG')) {
            return 'REPROGRAMADO';
        }

        // RITIRATO = Picked up
        if (v === 'RITIRATO' || v.includes('RITIR') || v.includes('RETIR')) {
            return 'RETIRADO';
        }

        return 'PENDIENTE';
    }
}
