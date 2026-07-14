
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning Programacion table...');
    const { count } = await prisma.programacion.deleteMany({});
    console.log(`Deleted ${count} rows.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
