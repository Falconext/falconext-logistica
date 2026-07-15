
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(__dirname, '../data.xlsx');
    console.log(`Reading file: ${filePath}`);

    const workbook = XLSX.readFile(filePath, { cellDates: true });

    // --- 0. CREATE TENANTS ---

    // 0.1 PRIMARY TENANT (Excel Data Owner)
    const gamonalTenant = await prisma.tenant.create({
        data: {
            name: 'Gamonal Trasporti',
            slug: 'gamonal',
            plan: 'ENTERPRISE'
        }
    });

    // 0.2 OTHER TENANTS
    const demoTenant = await prisma.tenant.create({
        data: { name: 'Logistica Demo', slug: 'demo', plan: 'FREE' }
    });

    const transportesSur = await prisma.tenant.create({
        data: { name: 'Transportes del Sur', slug: 'sur', plan: 'PRO' }
    });

    console.log(`Created Tenants: ${gamonalTenant.name}, ${demoTenant.name}, ${transportesSur.name}`);

    const tenantId = gamonalTenant.id; // Assign Excel data to Gamonal

    // --- 0.3 CREATE USERS ---

    // Superadmin (Linked to Gamonal for convenience, or separate)
    const password = await bcrypt.hash('admin123', 10);

    await prisma.user.create({
        data: {
            email: 'admin@gamonal.com', // Superadmin
            password: password,
            role: 'SUPERADMIN',
            tenant_id: gamonalTenant.id
        }
    });

    // Gamonal Admin (The requested user)
    await prisma.user.create({
        data: {
            email: 'gamonaltrasporti@gmail.com',
            password: password,
            role: 'ADMIN',
            tenant_id: gamonalTenant.id
        }
    });

    // Demo Admin
    await prisma.user.create({
        data: {
            email: 'admin@demo.com',
            password: password,
            role: 'ADMIN',
            tenant_id: demoTenant.id
        }
    });

    console.log(`Created Users: admin@gamonal.com (SUPER), gamonaltrasporti@gmail.com (ADMIN), admin@demo.com (ADMIN)`);
    console.log('Password for all: admin123');

    // --- 1. IMPORT TRABAJADORES (Hoja 1) ---
    const sheetWorkers = workbook.Sheets['Hoja 1'];
    if (sheetWorkers) {
        // Use range: 1 to skip potential title row
        const dataWorkers = XLSX.utils.sheet_to_json(sheetWorkers, { range: 1 });
        console.log(`Found ${dataWorkers.length} workers in 'Hoja 1'. Importando...`);

        // Debug first row to be sure
        if (dataWorkers.length > 0) {
            console.log('Using Headers:', Object.keys(dataWorkers[0] as object));
        }

        for (const row of dataWorkers as any[]) {
            try {
                // CORRECT MAPPING BASED ON ROW 1 INSPECTION:
                const id_trabajador = row['Id_Trabajador']?.toString();
                const nombre_completo = row['NOMBRE'];

                if (!id_trabajador || !nombre_completo) {
                    continue;
                }

                process.stdout.write('.'); // Progress dot

                await prisma.trabajador.upsert({
                    where: { id_trabajador: id_trabajador },
                    update: {
                        nombre_completo: nombre_completo,
                        cargo: row['CARGO'],
                        estado_laboral: row['ESTADO'],
                        nacionalidad: row['NACIONALIDAD'],
                        fecha_nacimiento: row['CUMPLEAÑOS'] ? new Date(row['CUMPLEAÑOS']) : null,
                        telefono: row['TELEFONO']?.toString(),
                        email_personal: row['CORREO ELECTRONICO ']?.trim(),
                        direccion: row['DIRECCION'],
                        url_foto: row['IMAGEN'],
                        // Docs
                        numero_pasaporte: row['PASSAPORTO']?.toString(),
                        fecha_vencimiento_pasaporte: row['SCADENZA PASSAPORTO'] ? new Date(row['SCADENZA PASSAPORTO']) : null,
                        documento_identidad: row['CARTA DI IDENTITA']?.toString(),
                        fecha_vencimiento_identidad: row['SCADENZA CARTA IDENTITA'] ? new Date(row['SCADENZA CARTA IDENTITA']) : null,
                        permiso_residencia: row['PERMESSO DI SOGGIORNO']?.toString(),
                        fecha_vencimiento_residencia: row['SCADENZA SOGGIORNO'] ? new Date(row['SCADENZA SOGGIORNO']) : null,
                        licencia_conducir: row['PATENTE']?.toString(),
                        fecha_vencimiento_licencia: row['SCADENZA PATENTE'] ? new Date(row['SCADENZA PATENTE']) : null,
                        codigo_fiscal: row['C. FISCALE']?.toString(),
                        fecha_vencimiento_fiscal: row['SCADENZA C. FISCALE'] ? new Date(row['SCADENZA C. FISCALE']) : null,
                        // Contract
                        tipo_contrato: row['CONTRATO '],
                        fecha_vencimiento_contrato: row['SCADENZA CONTRATO'] ? new Date(row['SCADENZA CONTRATO']) : null,
                        tenant_id: tenantId // ADDED
                    },
                    create: {
                        id_trabajador: id_trabajador,
                        nombre_completo: nombre_completo,
                        cargo: row['CARGO'] || 'Sin Cargo',
                        estado_laboral: row['ESTADO'] || 'Activo',
                        nacionalidad: row['NACIONALIDAD'],
                        fecha_nacimiento: row['CUMPLEAÑOS'] ? new Date(row['CUMPLEAÑOS']) : null,
                        telefono: row['TELEFONO']?.toString(),
                        email_personal: row['CORREO ELECTRONICO ']?.trim(),
                        direccion: row['DIRECCION'],
                        url_foto: row['IMAGEN'],
                        numero_pasaporte: row['PASSAPORTO']?.toString(),
                        fecha_vencimiento_pasaporte: row['SCADENZA PASSAPORTO'] ? new Date(row['SCADENZA PASSAPORTO']) : null,
                        documento_identidad: row['CARTA DI IDENTITA']?.toString(),
                        fecha_vencimiento_identidad: row['SCADENZA CARTA IDENTITA'] ? new Date(row['SCADENZA CARTA IDENTITA']) : null,
                        permiso_residencia: row['PERMESSO DI SOGGIORNO']?.toString(),
                        fecha_vencimiento_residencia: row['SCADENZA SOGGIORNO'] ? new Date(row['SCADENZA SOGGIORNO']) : null,
                        licencia_conducir: row['PATENTE']?.toString(),
                        fecha_vencimiento_licencia: row['SCADENZA PATENTE'] ? new Date(row['SCADENZA PATENTE']) : null,
                        codigo_fiscal: row['C. FISCALE']?.toString(),
                        fecha_vencimiento_fiscal: row['SCADENZA C. FISCALE'] ? new Date(row['SCADENZA C. FISCALE']) : null,
                        tipo_contrato: row['CONTRATO '],
                        fecha_vencimiento_contrato: row['SCADENZA CONTRATO'] ? new Date(row['SCADENZA CONTRATO']) : null,
                        tenant_id: tenantId // ADDED
                    }
                });
            } catch (error) {
                console.error(`Error importing worker:`, error);
            }
        }
        console.log('\nWorkers imported successfully.');
    }

    // --- 2. IMPORT VEHICULOS (Hoja 2) ---
    const vagonesSheetName = 'Hoja 2';
    const sheetVehicles = workbook.Sheets[vagonesSheetName];

    if (sheetVehicles) {
        // Use range: 1 to skip header row if using Italian headers in row 2
        const dataVehicles = XLSX.utils.sheet_to_json(sheetVehicles, { range: 1 });
        console.log(`Found ${dataVehicles.length} vehicles in '${vagonesSheetName}'. Importando...`);

        for (const row of dataVehicles as any[]) {
            try {
                const placa = row['TARGA'];
                if (!placa) continue;

                await prisma.vehiculo.upsert({
                    where: { placa: placa },
                    update: {
                        marca_modelo: row['MODELO'],
                        anio_fabricacion: row['AÑO'] ? parseInt(row['AÑO']) : null,
                        tipo_unidad: row['TIPO'],
                        estado_vehiculo: row['ESTADO'],
                        tarjeta_circulacion: row['LIBRETTO '], // Verified space
                        poliza_seguro: row['ASEGURAZIONE'],
                        id_interno_furgon: row['ID_FURGON'],
                        revision_tecnica: row['R.TECNICA']?.toString(), // ADDED
                        kilometraje_actual: 0,
                        tenant_id: tenantId // ADDED
                    },
                    create: {
                        placa: placa,
                        marca_modelo: row['MODELO'],
                        anio_fabricacion: row['AÑO'] ? parseInt(row['AÑO']) : null,
                        tipo_unidad: row['TIPO'],
                        estado_vehiculo: row['ESTADO'],
                        tarjeta_circulacion: row['LIBRETTO '],
                        poliza_seguro: row['ASEGURAZIONE'],
                        fecha_vencimiento_seguro: row['SCADENZA'] ? new Date(row['SCADENZA']) : null, // Assuming SCADENZA is insurance expiry
                        revision_tecnica: row['R.TECNICA']?.toString(), // ADDED
                        id_interno_furgon: row['ID_FURGON'],
                        kilometraje_actual: 0,
                        tenant_id: tenantId // ADDED
                    }
                });

                // --- NEW: Generate Maintenance History from Technical Review ---
                if (row['R.TECNICA']) {
                    let textDate: Date | null = null;
                    if (typeof row['R.TECNICA'] === 'number') {
                        textDate = new Date((row['R.TECNICA'] - (25567 + 2)) * 86400 * 1000);
                    } else if (typeof row['R.TECNICA'] === 'string') {
                        const dateParse = new Date(row['R.TECNICA']);
                        if (!isNaN(dateParse.getTime())) textDate = dateParse;
                    }

                    if (textDate) {
                        // Find the vehicle we just upserted to get its ID
                        const vehicle = await prisma.vehiculo.findUnique({ where: { placa: placa } });
                        if (vehicle) {
                            // Check if maintenance already exists to avoid dupes
                            const exists = await prisma.mantenimiento.findFirst({
                                where: {
                                    vehiculo_id: vehicle.id,
                                    descripcion: 'Revisión Técnica Inicial (Importada)'
                                }
                            });

                            if (!exists) {
                                await prisma.mantenimiento.create({
                                    data: {
                                        vehiculo_id: vehicle.id,
                                        tipo: 'Preventivo',
                                        fecha: textDate,
                                        descripcion: 'Revisión Técnica Inicial (Importada)',
                                        costo: 150.00, // Estimated cost
                                        taller: 'Taller Autorizado',
                                        kilometraje: 0,
                                        tenant_id: tenantId // ADDED
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error importing vehicle ${row['TARGA']}:`, error);
            }
        }
        console.log('Vehicles and Maintenance History imported successfully.');
    }

    // --- 3. IMPORT PROGRAMACIÓN (PROGRAMA DIARIO DHL) ---
    const sheetProg = workbook.Sheets['PROGRAMA DIARIO DHL'];
    if (sheetProg) {
        // Headers are at Row 0 for this sheet (Index 0)
        const dataProg = XLSX.utils.sheet_to_json(sheetProg); // Default header: 0
        console.log(`Found ${dataProg.length} operations in 'PROGRAMA DIARIO DHL'. Importando...`);

        for (const row of dataProg as any[]) {
            try {
                const id_prog = row['ID_REGISTRO'];
                if (!id_prog) continue;

                // Convert Excel Serial Date to JS Date
                let fecha: Date = new Date();
                if (typeof row['DATA'] === 'number') {
                    fecha = new Date((row['DATA'] - (25567 + 2)) * 86400 * 1000);
                } else if (typeof row['DATA'] === 'string') {
                    fecha = new Date(row['DATA']);
                }

                await prisma.programacion.upsert({
                    where: { id_programacion: id_prog.toString() },
                    update: {
                        fecha: fecha,
                        vehiculo_id: row['MEZZO']?.toString(),
                        trabajador_id: row['ID_AUTISTA']?.toString(),
                        cliente: row['CLIENTE'],
                        lugar_retiro: row['LUOGO RITIRO'],
                        lugar_entrega: row['LUOGO CONSEGNA'],
                        hora_retiro: row['ORA RITIRO']?.toString(),
                        eta: row['ETA']?.toString(),
                        nota: row['NOTA'],
                        tenant_id: tenantId // ADDED
                    },
                    create: {
                        id_programacion: id_prog.toString(),
                        fecha: fecha,
                        vehiculo_id: row['MEZZO']?.toString(),
                        trabajador_id: row['ID_AUTISTA']?.toString(),
                        cliente: row['CLIENTE'],
                        lugar_retiro: row['LUOGO RITIRO'],
                        lugar_entrega: row['LUOGO CONSEGNA'],
                        hora_retiro: row['ORA RITIRO']?.toString(),
                        eta: row['ETA']?.toString(),
                        nota: row['NOTA'],
                        tenant_id: tenantId // ADDED
                    }
                });
            } catch (error) {
                console.error(`Error importing Schedule ${row['ID_REGISTRO']}:`, error);
            }
        }
        console.log('Operations imported successfully.');
    }

    // --- 4. IMPORT MANTENIMIENTO (MANTENIMIENTO Sheet) ---
    const sheetMaint = workbook.Sheets['MANTENIMIENTO'];
    if (sheetMaint) {
        const dataMaint = XLSX.utils.sheet_to_json(sheetMaint);
        console.log(`Found ${dataMaint.length} maintenance records in 'MANTENIMIENTO'. Importando...`);

        for (const row of dataMaint as any[]) {
            try {
                const id = row['ID'];
                const targa = row['TARGA'];
                if (!id || !targa) continue;

                // Find vehicle by placa (TARGA)
                const vehicle = await prisma.vehiculo.findFirst({
                    where: { placa: targa }
                });

                if (!vehicle) {
                    console.log(`Vehicle not found for TARGA: ${targa}`);
                    continue;
                }

                // Parse date
                let fecha: Date = new Date();
                if (row['DATA']) {
                    if (typeof row['DATA'] === 'number') {
                        fecha = new Date((row['DATA'] - (25567 + 2)) * 86400 * 1000);
                    } else if (row['DATA'] instanceof Date) {
                        fecha = row['DATA'];
                    } else if (typeof row['DATA'] === 'string') {
                        fecha = new Date(row['DATA']);
                    }
                }

                // Map TIPO to our types
                let tipo = 'Correctivo';
                const tipoRaw = row['TIPO']?.toString().toUpperCase();
                if (tipoRaw?.includes('PREV') || tipoRaw?.includes('REVIS')) {
                    tipo = 'Preventivo';
                } else if (tipoRaw?.includes('EMERG') || tipoRaw?.includes('URGENT')) {
                    tipo = 'Emergencia';
                } else if (tipoRaw?.includes('REPAR') || tipoRaw?.includes('CORREC')) {
                    tipo = 'Correctivo';
                }

                // Check if already exists
                const exists = await prisma.mantenimiento.findFirst({
                    where: {
                        vehiculo_id: vehicle.id,
                        descripcion: row['TRABAJO REALIZADO'] || 'Sin descripción'
                    }
                });

                if (!exists) {
                    await prisma.mantenimiento.create({
                        data: {
                            vehiculo_id: vehicle.id,
                            tipo: tipo,
                            fecha: fecha,
                            descripcion: row['TRABAJO REALIZADO'] || row['OBSERVACIÓN'] || 'Sin descripción',
                            costo: 0, // No cost column in Excel, default to 0
                            taller: row['A CARGO'] || 'Taller Externo',
                            kilometraje: row['KILOMETRAJE '] ? parseInt(row['KILOMETRAJE ']) : null,
                            tenant_id: tenantId
                        }
                    });
                    process.stdout.write('.');
                }
            } catch (error) {
                console.error(`Error importing maintenance ${row['ID']}:`, error);
            }
        }
        console.log('\nMaintenance records imported successfully.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
