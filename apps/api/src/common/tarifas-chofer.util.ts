// Pago del chofer: horas de manejo (día/noche) + reperibilità + attesa
// autorizada. Tarifas de empresa (Tenant), iguales para todos los choferes.
// Compartido entre RegistrosService (agregados por período) y ProgramacionService
// (costo de UNA operación) para no duplicar la lógica del split día/noche.

export function num(v: any): number {
    if (v === null || v === undefined || v === '') return 0;
    // Number() maneja number, string numérico y Prisma.Decimal (que es un objeto).
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// Offset (min) que hay que sumar a un instante UTC para obtener la hora de pared
// en Italia (Europe/Rome). Maneja horario de verano (DST) automáticamente.
export function offsetRomaMin(d: Date): number {
    const p = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d).reduce((a: any, x) => { a[x.type] = x.value; return a; }, {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second);
    return Math.round((asUTC - d.getTime()) / 60000);
}

// Reparte el tramo [start, end] en minutos de DÍA (06:00–corte) y NOCHE (resto),
// en hora italiana. `corte` es la hora (0-23) configurable en Tenant.hora_corte_notte
// a partir de la cual aplica la tarifa nocturna (default 19).
export function minutosDiaNoche(start?: Date | null, end?: Date | null, corte: number = 19): { dia: number; noche: number } {
    if (!start || !end || end.getTime() <= start.getTime()) return { dia: 0, noche: 0 };
    const off = offsetRomaMin(start) * 60000; // offset ~constante en el tramo (DST a mitad de ruta: despreciable)
    let dia = 0, noche = 0;
    for (let t = start.getTime(); t < end.getTime(); t += 60000) {
        const h = new Date(t + off).getUTCHours();
        if (h >= 6 && h < corte) dia += 1; else noche += 1;
    }
    return { dia, noche };
}

export interface TarifasChofer {
    giorno: number;
    notte: number;
    corte: number;
    reperibilita: number;
    attesaHora: number;
    moneda: string;
}

// Lee las tarifas de empresa desde Tenant, con defaults por si el tenant es viejo
// (columnas agregadas después). Un solo `select` reusable por ambos services.
export const TARIFAS_TENANT_SELECT = {
    tarifa_ore_giorno: true, tarifa_ore_notte: true, hora_corte_notte: true,
    tarifa_reperibilita: true, tarifa_ore_attesa: true, moneda: true,
} as const;

export function tarifasFromTenant(t: {
    tarifa_ore_giorno?: any; tarifa_ore_notte?: any; hora_corte_notte?: number | null;
    tarifa_reperibilita?: any; tarifa_ore_attesa?: any; moneda?: string | null;
} | null): TarifasChofer {
    return {
        giorno: num(t?.tarifa_ore_giorno ?? 10),
        notte: num(t?.tarifa_ore_notte ?? 12),
        corte: t?.hora_corte_notte ?? 19,
        reperibilita: num(t?.tarifa_reperibilita ?? 10),
        attesaHora: num(t?.tarifa_ore_attesa ?? 10),
        moneda: t?.moneda ?? 'EUR',
    };
}

// Split día/noche de UN recorrido (ida + vuelta), con el descanso descontado
// proporcionalmente. Reusado para el agregado mensual y para el costo de UNA operación.
export function horasDeRecorrido(
    r: { iniciado_en?: Date | null; llegada_en?: Date | null; retorno_en?: Date | null; finalizado_en?: Date | null; descanso_min?: number | null },
    corte: number,
): { horasDia: number; horasNoche: number } {
    const ida = minutosDiaNoche(r.iniciado_en, r.llegada_en, corte);
    const vuelta = minutosDiaNoche(r.retorno_en, r.finalizado_en, corte);
    const diaEl = ida.dia + vuelta.dia;
    const nocheEl = ida.noche + vuelta.noche;
    const elapsed = diaEl + nocheEl;
    // Solo cuenta el manejo: se descuenta el descanso proporcionalmente.
    const factor = elapsed > 0 ? Math.max(0, elapsed - num(r.descanso_min)) / elapsed : 0;
    return {
        horasDia: Math.round((diaEl * factor / 60) * 100) / 100,
        horasNoche: Math.round((nocheEl * factor / 60) * 100) / 100,
    };
}
