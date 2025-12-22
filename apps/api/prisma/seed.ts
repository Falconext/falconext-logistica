
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding data...');

    // Trabajadores (Sample from Google Sheet)
    const carlos = await prisma.trabajador.upsert({
        where: { id_trabajador: 'DIR-001' }, // Assuming we use a custom ID or unique field
        update: {},
        create: {
            id_trabajador: 'DIR-001',
            nombre_completo: 'Carlos Gamonal',
            cargo: 'Director Operativo',
            estado_laboral: 'Activo',
            nacionalidad: 'Peruano',
            fecha_nacimiento: new Date('1973-05-07'),
            url_foto: '', // Placeholder
            telefono: '+39 333 123 4567',
            email_personal: 'carlos@logistica.com',
            direccion: 'Via Roma 123, Milano',
            // Docs placeholders
            numero_pasaporte: 'A12345678',
            fecha_vencimiento_pasaporte: new Date('2028-05-07'),
            licencia_conducir: 'B12345678',
            fecha_vencimiento_licencia: new Date('2028-05-07'),
        },
    });

    const emerson = await prisma.trabajador.upsert({
        where: { id_trabajador: 'DIR-002' },
        update: {},
        create: {
            id_trabajador: 'DIR-002',
            nombre_completo: 'Emerson Gamonal',
            cargo: 'Director General',
            estado_laboral: 'Activo',
            nacionalidad: 'Peruano',
            fecha_nacimiento: new Date('1973-09-19'),
            telefono: '+39 333 987 6543',
            email_personal: 'emerson@logistica.com',
        },
    });

    // Vehiculos (Sample from Google Sheet)
    const fiat = await prisma.vehiculo.upsert({
        where: { placa: 'ER643VY' },
        update: {},
        create: {
            placa: 'ER643VY',
            marca_modelo: 'Fiat Doblo',
            anio_fabricacion: 2012,
            tipo_unidad: 'DHL',
            estado_vehiculo: 'Activo',
            poliza_seguro: 'Mapfre 123',
            fecha_vencimiento_seguro: new Date('2024-12-31'),
            kilometraje_actual: 150500,
        },
    });

    const ford = await prisma.vehiculo.upsert({
        where: { placa: 'EG403NT' },
        update: {},
        create: {
            placa: 'EG403NT',
            marca_modelo: 'Ford Transit',
            anio_fabricacion: 2012,
            tipo_unidad: 'DHL',
            estado_vehiculo: 'Activo',
            kilometraje_actual: 210000,
        },
    });

    console.log({ carlos, emerson, fiat, ford });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
