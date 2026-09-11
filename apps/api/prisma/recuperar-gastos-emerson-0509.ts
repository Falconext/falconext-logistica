import { PrismaClient } from '@prisma/client';
import { fechaLimitePago } from '../src/common/plazo-pago.util';

// Recupera los gastos rendidos por EMERSON GAMONAL en la ruta del 05/09/2026 a
// Ginevra (Programacion e2984c02…). Las 11 fotos se subieron a S3 entre las
// 23:10 y las 23:17 del 05/09 pero solo la del gasto "Vignetta 50 €" quedó
// enlazada; las demás quedaron huérfanas (el guardado de aquel momento
// borraba y recreaba la lista de gastos, así que sobrevivió solo el último).
// Montos, tipos y horas leídos de cada recibo. Cada gasto lleva su foto.
//
// Uso (desde apps/api, con DATABASE_URL de producción cargado):
//   npx ts-node prisma/recuperar-gastos-emerson-0509.ts            -> solo muestra
//   APLICAR=1 npx ts-node prisma/recuperar-gastos-emerson-0509.ts  -> inserta
// Es idempotente: si ya existe un gasto de la operación con esa misma foto, lo salta.

const PROGRAMACION_ID = 'e2984c02-33b9-4937-9468-b33d5108dd9a';
const S3 = 'https://nexara-s3.s3.us-east-1.amazonaws.com/logistica/';
const DIA = '2026-09-05';
const hora = (hhmm: string) => new Date(`${DIA}T${hhmm}:00+02:00`); // hora Italia (CEST)

const GASTOS = [
    { tipo: 'COMBUSTIBLE', monto: 20.06, hora: '06:09', descripcion: 'Enilive Agrate Brianza (9,79 L Super)', foto: '1788642645812-sevzrp5q.jpg' },
    { tipo: 'PEAJE',       monto: 1.70,  hora: '06:15', descripcion: 'Autostrade Agrate → Milano Est',        foto: '1788642771436-mvcxal5a.jpg' },
    { tipo: 'PEAJE',       monto: 3.70,  hora: '06:34', descripcion: 'A4 Milano Ghisolfa → Marcallo Mesero',   foto: '1788642749260-o9xyhauw.jpg' },
    { tipo: 'COMBUSTIBLE', monto: 72.99, hora: '08:12', descripcion: 'Compra tarjeta PV1099 Turbigo/Buscate',  foto: '1788642616418-qgz01p65.jpg' },
    { tipo: 'PEAJE',       monto: 34.60, hora: '10:25', descripcion: 'A5 Marcallo Mesero → Aosta',             foto: '1788642709883-uvepvbrd.jpg' },
    { tipo: 'PEAJE',       monto: 70.40, hora: '10:59', descripcion: 'Túnel andata/ritorno (VL classe 1)',     foto: '1788643019293-5ygi0l1g.jpg' },
    { tipo: 'PEAJE',       monto: 4.80,  hora: '11:43', descripcion: 'ATMB Cluses (ida)',                      foto: '1788642792590-phuadpw6.jpg' },
    { tipo: 'PEAJE',       monto: 2.20,  hora: '12:02', descripcion: 'ATMB Nangy (ida)',                       foto: '1788642816690-2nyy34yc.jpg' },
    { tipo: 'PEAJE',       monto: 2.20,  hora: '13:11', descripcion: 'ATMB Nangy (vuelta)',                    foto: '1788642885349-q8w27276.jpg' },
    { tipo: 'PEAJE',       monto: 4.80,  hora: '14:31', descripcion: 'ATMB Cluses (vuelta)',                   foto: '1788642908611-jfvt9lqi.jpg' },
    { tipo: 'PEAJE',       monto: 37.90, hora: '21:59', descripcion: 'A4 Aosta → Milano Ghisolfa',             foto: '1788642689184-ekurt4ch.jpg' },
];

const APLICAR = process.env.APLICAR === '1';
const prisma = new PrismaClient();

async function main() {
    console.log(APLICAR ? '*** MODO ESCRITURA ***' : '*** modo simulación: no se escribe nada (APLICAR=1 para aplicar) ***');
    const op = await prisma.programacion.findUnique({
        where: { id: PROGRAMACION_ID },
        include: { gastos: true },
    });
    if (!op) throw new Error('No se encontró la operación ' + PROGRAMACION_ID);
    console.log(`Operación: ${op.cliente} → ${op.lugar_entrega} · chofer ${op.trabajador_id} · gastos actuales: ${op.gastos.length}`);

    const yaEnlazadas = new Set(op.gastos.flatMap((g) => g.comprobantes || []));
    let total = 0, nuevos = 0;
    for (const g of GASTOS) {
        const url = S3 + g.foto;
        const existe = yaEnlazadas.has(url);
        total += g.monto;
        console.log(`  ${existe ? 'ya existe' : 'NUEVO   '}  ${g.hora}  ${g.tipo.padEnd(11)} ${g.monto.toFixed(2).padStart(6)} €  ${g.descripcion}`);
        if (existe || !APLICAR) continue;
        await prisma.gastoOperacion.create({
            data: {
                programacion_id: op.id,
                tipo: g.tipo,
                monto: g.monto,
                fecha: hora(g.hora),
                descripcion: g.descripcion,
                comprobantes: [url],
                pagado_por_chofer: true,
                fecha_limite_pago: g.tipo === 'PEAJE' ? fechaLimitePago(hora(g.hora)) : null,
                trabajador_id: op.trabajador_id,
                targa: op.vehiculo_id,
                tenant_id: op.tenant_id,
            },
        });
        nuevos++;
    }
    console.log(`\nTotal recibos recuperados: ${total.toFixed(2)} € (+ 50,00 € Vignetta ya guardado = ${(total + 50).toFixed(2)} €)`);
    if (APLICAR) console.log(`Insertados: ${nuevos}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
