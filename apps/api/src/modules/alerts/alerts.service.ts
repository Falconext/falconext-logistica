import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export interface DocumentAlert {
    // Campos legacy (compatibilidad con /alerts/documents y la web existente).
    // Para trabajadores mantienen su significado original; para vehículos y
    // documentos se rellenan con la info de la entidad correspondiente.
    trabajadorId: string;
    trabajadorNombre: string;
    cargo: string;
    documentType: string;
    documentLabel: string;
    expirationDate: Date;
    daysRemaining: number;
    severity: 'critical' | 'warning' | 'info';

    // Nuevos campos: identifican la entidad de forma genérica.
    entityType: 'TRABAJADOR' | 'VEHICULO' | 'DOCUMENTO';
    entityId: string;
    entityName: string; // nombre legible de la entidad (trabajador, placa, etc.)
}

@Injectable()
export class AlertsService {
    constructor(private prisma: PrismaService) { }

    private computeSeverity(daysRemaining: number): 'critical' | 'warning' | 'info' {
        if (daysRemaining <= 15) return 'critical';
        if (daysRemaining <= 30) return 'warning';
        return 'info';
    }

    async getExpiringDocuments(
        tenantId: string,
        daysAhead: number = 90,
        ownerTrabajadorId?: string,
    ): Promise<DocumentAlert[]> {
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);

        // Si el usuario está restringido a sus propios registros (soloPropios),
        // solo debe ver alertas de SU trabajador y ninguna alerta de vehículos
        // (los vehículos son de flota, no del usuario).
        const restrictToOwner = !!ownerTrabajadorId;

        const alerts: DocumentAlert[] = [];

        // ------------------------------------------------------------------
        // 1) Vencimientos en documentos de TRABAJADORES (comportamiento original)
        // ------------------------------------------------------------------
        const workers = await this.prisma.trabajador.findMany({
            where: {
                tenant_id: tenantId,
                ...(restrictToOwner ? { id: ownerTrabajadorId } : {}),
                // En prod hay 'Activo' y 'ACTIVO' (import del Excel): comparar sin case.
                estado_laboral: { equals: 'Activo', mode: 'insensitive' },
                OR: [
                    { fecha_vencimiento_pasaporte: { lte: futureDate, gte: now } },
                    { fecha_vencimiento_identidad: { lte: futureDate, gte: now } },
                    { fecha_vencimiento_residencia: { lte: futureDate, gte: now } },
                    { fecha_vencimiento_licencia: { lte: futureDate, gte: now } },
                    { fecha_vencimiento_traduccion: { lte: futureDate, gte: now } },
                    { fecha_vencimiento_contrato: { lte: futureDate, gte: now } },
                    { fecha_vencimiento_fiscal: { lte: futureDate, gte: now } },
                ]
            },
            select: {
                id: true,
                nombre_completo: true,
                cargo: true,
                fecha_vencimiento_pasaporte: true,
                fecha_vencimiento_identidad: true,
                fecha_vencimiento_residencia: true,
                fecha_vencimiento_licencia: true,
                fecha_vencimiento_traduccion: true,
                fecha_vencimiento_contrato: true,
                fecha_vencimiento_fiscal: true,
            }
        });

        const documentFields = [
            { field: 'fecha_vencimiento_pasaporte', label: 'Pasaporte', type: 'passport' },
            { field: 'fecha_vencimiento_identidad', label: 'Documento de Identidad', type: 'id' },
            { field: 'fecha_vencimiento_residencia', label: 'Permiso de Residencia', type: 'residence' },
            { field: 'fecha_vencimiento_licencia', label: 'Licencia de Conducir', type: 'license' },
            { field: 'fecha_vencimiento_traduccion', label: 'Traducción de Licencia', type: 'translation' },
            { field: 'fecha_vencimiento_contrato', label: 'Contrato', type: 'contract' },
            { field: 'fecha_vencimiento_fiscal', label: 'Código Fiscal', type: 'fiscal' },
        ];

        for (const worker of workers) {
            for (const doc of documentFields) {
                const expDate = worker[doc.field as keyof typeof worker] as Date | null;
                if (expDate && expDate <= futureDate && expDate >= now) {
                    const daysRemaining = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    alerts.push({
                        trabajadorId: worker.id,
                        trabajadorNombre: worker.nombre_completo,
                        cargo: worker.cargo,
                        documentType: doc.type,
                        documentLabel: doc.label,
                        expirationDate: expDate,
                        daysRemaining,
                        severity: this.computeSeverity(daysRemaining),
                        entityType: 'TRABAJADOR',
                        entityId: worker.id,
                        entityName: worker.nombre_completo,
                    });
                }
            }
        }

        // ------------------------------------------------------------------
        // 2) Vencimientos de VEHÍCULOS (seguro, revisión técnica y deroghe).
        //    Los vehículos son de flota: si el usuario está restringido a sus
        //    propios registros, NO se incluyen alertas de vehículos.
        // ------------------------------------------------------------------
        const ventanaVenc = { lte: futureDate, gte: now };
        const vehiculos = restrictToOwner ? [] : await this.prisma.vehiculo.findMany({
            where: {
                tenant_id: tenantId,
                OR: [
                    { fecha_vencimiento_seguro: ventanaVenc },
                    { fecha_vencimiento_revision: ventanaVenc },
                    { fecha_vencimiento_deroghe: ventanaVenc },
                ],
            },
            select: {
                id: true,
                placa: true,
                marca_modelo: true,
                fecha_vencimiento_seguro: true,
                fecha_vencimiento_revision: true,
                fecha_vencimiento_deroghe: true,
            }
        });

        const VEHICULO_VENCS: [keyof (typeof vehiculos)[number], string, string][] = [
            ['fecha_vencimiento_seguro', 'insurance', 'Seguro del Vehículo'],
            ['fecha_vencimiento_revision', 'revision', 'Revisión Técnica'],
            ['fecha_vencimiento_deroghe', 'deroghe', 'Permisos Especiales (Deroghe)'],
        ];

        for (const v of vehiculos) {
            const nombre = v.marca_modelo ? `${v.placa} · ${v.marca_modelo}` : v.placa;
            for (const [campo, tipo, label] of VEHICULO_VENCS) {
                const expDate = v[campo] as Date | null;
                if (expDate && expDate <= futureDate && expDate >= now) {
                    const daysRemaining = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    alerts.push({
                        trabajadorId: v.id,
                        trabajadorNombre: nombre,
                        cargo: 'Vehículo',
                        documentType: tipo,
                        documentLabel: label,
                        expirationDate: expDate,
                        daysRemaining,
                        severity: this.computeSeverity(daysRemaining),
                        entityType: 'VEHICULO',
                        entityId: v.id,
                        entityName: nombre,
                    });
                }
            }
        }

        // ------------------------------------------------------------------
        // 3) Vencimientos de DOCUMENTOS subidos (modelo Documento).
        // ------------------------------------------------------------------
        const documentos = await this.prisma.documento.findMany({
            where: {
                tenant_id: tenantId,
                ...(restrictToOwner ? { entidad_id: ownerTrabajadorId } : {}),
                fecha_vencimiento: { lte: futureDate, gte: now },
            },
            select: {
                id: true,
                entidad: true,
                entidad_id: true,
                tipo: true,
                nombre: true,
                fecha_vencimiento: true,
            }
        });

        if (documentos.length > 0) {
            // Resolver nombres legibles de las entidades dueñas.
            const trabajadorIds = documentos.filter(d => d.entidad === 'TRABAJADOR').map(d => d.entidad_id);
            const vehiculoIds = documentos.filter(d => d.entidad === 'VEHICULO').map(d => d.entidad_id);

            const [trabRefs, vehRefs] = await Promise.all([
                trabajadorIds.length
                    ? this.prisma.trabajador.findMany({
                        where: { id: { in: trabajadorIds }, tenant_id: tenantId },
                        select: { id: true, nombre_completo: true },
                    })
                    : Promise.resolve([]),
                vehiculoIds.length
                    ? this.prisma.vehiculo.findMany({
                        where: { id: { in: vehiculoIds }, tenant_id: tenantId },
                        select: { id: true, placa: true },
                    })
                    : Promise.resolve([]),
            ]);

            const trabMap = new Map(trabRefs.map(t => [t.id, t.nombre_completo]));
            const vehMap = new Map(vehRefs.map(v => [v.id, v.placa]));

            for (const d of documentos) {
                const expDate = d.fecha_vencimiento as Date | null;
                if (!expDate || expDate > futureDate || expDate < now) continue;
                const daysRemaining = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                let ownerName: string;
                if (d.entidad === 'TRABAJADOR') {
                    ownerName = trabMap.get(d.entidad_id) || 'Trabajador';
                } else if (d.entidad === 'VEHICULO') {
                    const placa = vehMap.get(d.entidad_id);
                    ownerName = placa ? `Vehículo ${placa}` : 'Vehículo';
                } else {
                    ownerName = d.entidad || 'Documento';
                }

                const label = d.nombre || d.tipo || 'Documento';

                alerts.push({
                    trabajadorId: d.entidad_id,
                    trabajadorNombre: ownerName,
                    cargo: d.entidad || 'Documento',
                    documentType: (d.tipo || 'document').toLowerCase(),
                    documentLabel: label,
                    expirationDate: expDate,
                    daysRemaining,
                    severity: this.computeSeverity(daysRemaining),
                    entityType: 'DOCUMENTO',
                    entityId: d.id,
                    entityName: ownerName,
                });
            }
        }

        // Sort by days remaining (most urgent first)
        return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
    }

    async getAlertsSummary(tenantId: string, ownerTrabajadorId?: string): Promise<{ critical: number; warning: number; info: number; total: number }> {
        const alerts = await this.getExpiringDocuments(tenantId, 90, ownerTrabajadorId);
        return {
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            info: alerts.filter(a => a.severity === 'info').length,
            total: alerts.length
        };
    }
    // Vista "Scadenze": todos los furgones y trabajadores con sus fechas de
    // vencimiento, listos para agrupar por área en la web. El vencimiento del
    // Unilav y de la 13ma/14ma viven en Documento (adjuntos), no en Trabajador.
    async getScadenze(tenantId: string) {
        const [vehiculos, trabajadores, docsTrab] = await Promise.all([
            this.prisma.vehiculo.findMany({
                where: { tenant_id: tenantId },
                select: {
                    id: true,
                    placa: true,
                    marca_modelo: true,
                    tipo_unidad: true,
                    area: true,
                    url_foto: true,
                    fecha_vencimiento_seguro: true,
                    fecha_vencimiento_revision: true,
                    fecha_vencimiento_deroghe: true,
                },
                orderBy: { placa: 'asc' },
            }),
            this.prisma.trabajador.findMany({
                where: { tenant_id: tenantId },
                select: {
                    id: true,
                    id_trabajador: true,
                    nombre_completo: true,
                    cargo: true,
                    area_trabajo: true,
                    url_foto: true,
                    fecha_nacimiento: true,
                    fecha_vencimiento_pasaporte: true,
                    fecha_vencimiento_identidad: true,
                    fecha_vencimiento_residencia: true,
                    fecha_vencimiento_licencia: true,
                    fecha_vencimiento_traduccion: true,
                    fecha_vencimiento_fiscal: true,
                    fecha_vencimiento_contrato: true,
                },
                orderBy: { nombre_completo: 'asc' },
            }),
            this.prisma.documento.findMany({
                where: {
                    tenant_id: tenantId,
                    entidad: 'TRABAJADOR',
                    tipo: { in: ['UNILAV', 'TREDICESIMA_QUATTORDICESIMA'] },
                },
                select: { entidad_id: true, tipo: true, fecha_vencimiento: true, url: true },
            }),
        ]);

        // Vencimiento de Unilav / 13ma por trabajador (si hay varios, el más reciente).
        const unilavPorTrabajador = new Map<string, Date | null>();
        const tredicesimaPorTrabajador = new Map<string, Date | null>();
        for (const d of docsTrab) {
            const mapa = d.tipo === 'UNILAV' ? unilavPorTrabajador : tredicesimaPorTrabajador;
            const prev = mapa.get(d.entidad_id);
            if (prev === undefined || (d.fecha_vencimiento && (!prev || d.fecha_vencimiento > prev))) {
                mapa.set(d.entidad_id, d.fecha_vencimiento ?? null);
            }
        }

        return {
            vehiculos,
            trabajadores: trabajadores.map((t) => ({
                ...t,
                fecha_vencimiento_unilav: unilavPorTrabajador.get(t.id) ?? null,
                fecha_vencimiento_tredicesima: tredicesimaPorTrabajador.get(t.id) ?? null,
            })),
        };
    }
}
