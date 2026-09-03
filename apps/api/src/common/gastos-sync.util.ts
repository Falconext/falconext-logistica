/**
 * Sincronización por FUSIÓN de los gastos de una operación (GastoOperacion).
 *
 * Antes se hacía `deleteMany + createMany`: al cerrar el recorrido (o al guardar
 * la operación) se borraban TODOS los gastos y se recreaban desde la lista nueva.
 * Efectos: se perdían peajes cargados por el supervisor o en la rendición de
 * cierre, la fecha del peaje se pisaba con la de cierre y el estado de pago
 * (PAGADO / fecha límite) que el admin ya había marcado volvía a PENDIENTE.
 * Para Gamonal un mancato que desaparece del panel termina en multa, así que
 * la regla es: NUNCA perder un gasto ya registrado.
 *
 * Empareja cada gasto entrante con uno existente y devuelve el plan de cambios.
 * Pases de emparejamiento (en orden):
 *   1. misma parada (parada_id) + misma clave (tipo|monto|nº mancato)
 *   2. misma clave (cualquier parada / sin parada)
 *   3. misma parada, sobrantes por orden (el chofer editó el monto de un gasto)
 * Los entrantes sin pareja se crean. Los existentes sin pareja se borran SOLO si
 * `borrarSinPareja(row)` lo dice (p. ej. reemplazo completo desde el formulario,
 * o un gasto que ya no está en la parada de la que se consolidó).
 */

export type GastoExistente = {
    id: string;
    tipo: string;
    monto: number;
    fecha: Date | null;
    descripcion: string | null;
    numero_mancato: string | null;
    link_peaje: string | null;
    comprobantes: string[];
    pagado_por_chofer: boolean;
    parada_id: string | null;
    trabajador_id: string | null;
    targa: string | null;
};

export type GastoEntrante = {
    programacion_id: string;
    tipo: string;
    monto: number;
    fecha: Date | null;
    /** true = la fecha viene del cliente y debe pisar la existente. */
    fecha_explicita?: boolean;
    descripcion: string | null;
    numero_mancato: string | null;
    link_peaje: string | null;
    comprobantes: string[];
    pagado_por_chofer: boolean;
    parada_id: string | null;
    trabajador_id: string | null;
    targa: string | null;
    tenant_id: string;
};

export type PlanGastos = {
    crear: GastoEntrante[];
    actualizar: Array<{ id: string; data: Partial<GastoEntrante> }>;
    borrarIds: string[];
};

const claveDe = (g: { tipo: string; monto: number; numero_mancato: string | null }) =>
    `${String(g.tipo || 'OTRO').toUpperCase()}|${(Number(g.monto) || 0).toFixed(2)}|${(g.numero_mancato || '').trim().toLowerCase()}`;

function datosActualizacion(ex: GastoExistente, inc: GastoEntrante): Partial<GastoEntrante> {
    const comprobantesInc = (inc.comprobantes || []).filter(Boolean);
    return {
        tipo: inc.tipo,
        monto: inc.monto,
        // La fecha real del gasto se conserva salvo que el cliente la mande explícita.
        fecha: inc.fecha_explicita ? inc.fecha : (ex.fecha ?? inc.fecha),
        descripcion: inc.descripcion ?? ex.descripcion,
        numero_mancato: inc.numero_mancato || ex.numero_mancato,
        link_peaje: inc.link_peaje || ex.link_peaje,
        // Nunca perder una foto: si el entrante viene sin comprobantes, se conservan.
        comprobantes: comprobantesInc.length ? comprobantesInc : ex.comprobantes,
        pagado_por_chofer: inc.pagado_por_chofer,
        parada_id: inc.parada_id ?? ex.parada_id,
        trabajador_id: inc.trabajador_id ?? ex.trabajador_id,
        targa: inc.targa ?? ex.targa,
        // estado / fecha_limite_pago NO se tocan: los fija el admin al liquidar.
    };
}

export function planificarSyncGastos(
    existentes: GastoExistente[],
    entrantes: GastoEntrante[],
    borrarSinPareja: (row: GastoExistente) => boolean,
): PlanGastos {
    const libresEx = new Set(existentes.map((e) => e.id));
    const pares: Array<[GastoExistente, GastoEntrante]> = [];
    const pendientes = new Set<number>(entrantes.map((_, i) => i));

    const emparejar = (pred: (ex: GastoExistente, inc: GastoEntrante) => boolean) => {
        for (const i of Array.from(pendientes)) {
            const inc = entrantes[i];
            const ex = existentes.find((e) => libresEx.has(e.id) && pred(e, inc));
            if (!ex) continue;
            libresEx.delete(ex.id);
            pendientes.delete(i);
            pares.push([ex, inc]);
        }
    };

    // 1) misma parada + misma clave
    emparejar((ex, inc) => !!inc.parada_id && ex.parada_id === inc.parada_id && claveDe(ex) === claveDe(inc));
    // 2) misma clave, sin importar la parada (filas viejas sin parada_id, rendición de cierre, etc.)
    emparejar((ex, inc) => claveDe(ex) === claveDe(inc));
    // 3) misma parada, sobrantes por orden (edición del monto/nº mancato en la parada)
    emparejar((ex, inc) => !!inc.parada_id && ex.parada_id === inc.parada_id);

    return {
        crear: Array.from(pendientes).sort((a, b) => a - b).map((i) => entrantes[i]),
        actualizar: pares.map(([ex, inc]) => ({ id: ex.id, data: datosActualizacion(ex, inc) })),
        borrarIds: existentes.filter((e) => libresEx.has(e.id) && borrarSinPareja(e)).map((e) => e.id),
    };
}

/** Campos que hay que leer de GastoOperacion para poder planificar la fusión. */
export const GASTO_SYNC_SELECT = {
    id: true, tipo: true, monto: true, fecha: true, descripcion: true, numero_mancato: true,
    link_peaje: true, comprobantes: true, pagado_por_chofer: true, parada_id: true,
    trabajador_id: true, targa: true,
} as const;

/** Aplica el plan en una sola transacción. `prisma` es el PrismaService/PrismaClient. */
export async function aplicarPlanGastos(prisma: any, plan: PlanGastos): Promise<void> {
    const limpiar = (g: Partial<GastoEntrante>) => {
        const { fecha_explicita, ...data } = g;
        return data;
    };
    const ops: any[] = [];
    if (plan.borrarIds.length) ops.push(prisma.gastoOperacion.deleteMany({ where: { id: { in: plan.borrarIds } } }));
    for (const u of plan.actualizar) ops.push(prisma.gastoOperacion.update({ where: { id: u.id }, data: limpiar(u.data) }));
    if (plan.crear.length) ops.push(prisma.gastoOperacion.createMany({ data: plan.crear.map(limpiar) }));
    if (ops.length) await prisma.$transaction(ops);
}
