
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.programacion.count();
    console.log(`Total Programacion rows: ${count}`);

    const top10 = await prisma.programacion.findMany({
        take: 10,
        orderBy: { fecha: 'desc' },
        select: {
            id_programacion: true,
            fecha: true,
            cliente: true,
            lugar_retiro: true,
            lugar_entrega: true,
            estado: true
        }
    });

    console.log('Top 10 Rows (Latest Date):');
    console.table(top10);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
