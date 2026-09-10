import { PrismaClient, Prisma } from '@prisma/client';

// Renombra los valores históricos de SPEDIZIONE a los nuevos códigos de
// SPEDIZIONE_OPTIONS (apps/web/app/operaciones/constants.ts). Sin esto, las
// consegnas antiguas quedan con un texto que ya no existe en el selector y los
// filtros de finanzas/peajes/combustible no las encuentran.
//
// Toca tres sitios: RegistroServicio.spedizione, Programacion.spedizione y el
// spedizione de cada parada dentro del JSON Programacion.destinos_detalle.
//
// Uso (desde apps/api):
//   npx ts-node prisma/migrate-spedizione.ts            -> solo cuenta, no escribe
//   APLICAR=1 npx ts-node prisma/migrate-spedizione.ts  -> escribe
// Usa el DATABASE_URL del entorno: exportar el de producción a propósito.

const MAPEO: Record<string, string> = {
    'EXTRAS ALFREDO': 'EXTRAS PIAZZA MILANO',
    'EXTRAS ESTEFANIA': 'EXTRAS STEFFANIA',
    'AB': 'AB SERVICE',
    // El DHL histórico era la operación de Milano; DHL ROMA nace como opción
    // nueva. Cambiar aquí si se decide lo contrario.
    'DHL': 'DHL MILANO',
};

const APLICAR = process.env.APLICAR === '1';
const prisma = new PrismaClient();

// Los valores se compararon siempre en mayúsculas y sin espacios sobrantes
// (calcularIngresoSugerido), así que se normaliza igual antes de mapear.
const nuevo = (v: unknown): string | null => {
    const s = String(v ?? '').trim().toUpperCase();
    return s && MAPEO[s] ? MAPEO[s] : null;
};

async function columna(tabla: 'registroServicio' | 'programacion') {
    const grupos = await (prisma[tabla] as any).groupBy({
        by: ['spedizione'],
        _count: { _all: true },
    });
    console.log(`\n${tabla}.spedizione — valores actuales:`);
    for (const g of grupos) {
        const v = g.spedizione ?? '(vacío)';
        const destino = nuevo(g.spedizione);
        console.log(`  ${String(v).padEnd(22)} ${String(g._count._all).padStart(6)}  ${destino ? '-> ' + destino : ''}`);
    }
    if (!APLICAR) return;
    for (const [viejo, n] of Object.entries(MAPEO)) {
        const r = await (prisma[tabla] as any).updateMany({
            where: { spedizione: { equals: viejo, mode: 'insensitive' } },
            data: { spedizione: n },
        });
        if (r.count) console.log(`  ${tabla}: ${viejo} -> ${n}: ${r.count} filas`);
    }
}

async function destinosDetalle() {
    const progs = await prisma.programacion.findMany({
        where: { destinos_detalle: { not: Prisma.DbNull } },
        select: { id: true, destinos_detalle: true },
    });
    let paradas = 0;
    let filas = 0;
    for (const p of progs) {
        const det = p.destinos_detalle;
        if (!Array.isArray(det)) continue;
        let cambio = false;
        const nuevoDet = det.map((d: any) => {
            const n = d && typeof d === 'object' ? nuevo(d.spedizione) : null;
            if (!n) return d;
            paradas++;
            cambio = true;
            return { ...d, spedizione: n };
        });
        if (!cambio) continue;
        filas++;
        if (APLICAR) {
            await prisma.programacion.update({
                where: { id: p.id },
                data: { destinos_detalle: nuevoDet as Prisma.InputJsonValue },
            });
        }
    }
    console.log(`\nprogramacion.destinos_detalle — paradas a renombrar: ${paradas} (en ${filas} rutas compactadas)`);
}

async function main() {
    console.log(APLICAR ? '*** MODO ESCRITURA ***' : '*** modo simulación: no se escribe nada (APLICAR=1 para aplicar) ***');
    await columna('registroServicio');
    await columna('programacion');
    await destinosDetalle();
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
