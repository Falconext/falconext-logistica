import { PrismaClient } from '@prisma/client';
import { fechaLimitePago, PLAZO_PAGO_DIAS } from '../src/common/plazo-pago.util';

// Rellena la fecha límite de pago (fecha + 14 días) en los peajes y mancatos que
// ya existían antes de la regla y no la tienen. Solo toca filas con límite vacío
// y fecha presente; nunca pisa un límite ya guardado.
//
// Uso (desde apps/api):
//   npx ts-node prisma/backfill-limite-pago.ts            -> solo cuenta
//   APLICAR=1 npx ts-node prisma/backfill-limite-pago.ts  -> escribe
// Usa el DATABASE_URL del entorno: exportar el de producción a propósito.

const APLICAR = process.env.APLICAR === '1';
const prisma = new PrismaClient();

async function main() {
    console.log(APLICAR ? '*** MODO ESCRITURA ***' : '*** modo simulación: no se escribe nada (APLICAR=1 para aplicar) ***');
    console.log(`Regla: límite = fecha + ${PLAZO_PAGO_DIAS} días`);

    const peajes = await prisma.peaje.findMany({
        where: { fecha_limite_pago: null, fecha: { not: null } },
        select: { id: true, fecha: true },
    });
    console.log(`\nPeaje sin límite y con fecha: ${peajes.length}`);

    const mancatos = await prisma.gastoOperacion.findMany({
        where: { tipo: 'PEAJE', fecha_limite_pago: null, fecha: { not: null } },
        select: { id: true, fecha: true },
    });
    console.log(`GastoOperacion PEAJE (desde operación) sin límite y con fecha: ${mancatos.length}`);

    if (!APLICAR) return;

    let n = 0;
    for (const p of peajes) {
        await prisma.peaje.update({ where: { id: p.id }, data: { fecha_limite_pago: fechaLimitePago(p.fecha) } });
        n++;
    }
    console.log(`Peaje actualizados: ${n}`);
    n = 0;
    for (const g of mancatos) {
        await prisma.gastoOperacion.update({ where: { id: g.id }, data: { fecha_limite_pago: fechaLimitePago(g.fecha) } });
        n++;
    }
    console.log(`GastoOperacion actualizados: ${n}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
