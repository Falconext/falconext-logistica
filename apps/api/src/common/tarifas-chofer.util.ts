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

// Campos de Recorrido que necesitan kmDeRecorrido()/horasDeRecorrido(). Un solo
// `select` reusable para que el mes, el detalle del mes y el costo por operación
// lean exactamente lo mismo y sumen igual.
export const RECORRIDO_METRICAS_SELECT = {
    total_km: true, total_min: true, manejo_min: true, km_fuente: true,
    ida_km: true, vuelta_km: true, ida_min: true, vuelta_min: true,
    iniciado_en: true, llegada_en: true, retorno_en: true, finalizado_en: true, descanso_min: true,
} as const;

export interface RecorridoMetricas {
    total_km?: any; total_min?: any; manejo_min?: any; km_fuente?: string | null;
    ida_km?: any; vuelta_km?: any; ida_min?: any; vuelta_min?: any;
    iniciado_en?: Date | null; llegada_en?: Date | null; retorno_en?: Date | null; finalizado_en?: Date | null;
    descanso_min?: any;
}

// Km de UN recorrido que cuenta para el mes/pago: total_km cuando existe (con
// km_fuente='ruta' es el estimado de la ruta; recorridos viejos, su total GPS).
// Recorridos anteriores a total_km: suma de tramos con tope anti-basura (un tramo
// no puede implicar > 160 km/h respecto a sus minutos; protege de GPS basura ya
// guardado, p. ej. 19194 km en 2 min, sin migración).
export function kmDeRecorrido(r: RecorridoMetricas): number {
    if (r.total_km != null) return Math.round(num(r.total_km) * 10) / 10;
    const capKm = (kmLeg: any, min: any) => {
        const k = num(kmLeg);
        const maxPlausible = (Math.max(0, num(min)) / 60) * 160;
        return maxPlausible > 0 ? Math.min(k, maxPlausible) : 0;
    };
    return Math.round((capKm(r.ida_km, r.ida_min) + capKm(r.vuelta_km, r.vuelta_min)) * 10) / 10;
}

// Split día/noche de UN recorrido. Devuelve minutos (para que los agregados sumen
// sin arrastre de redondeo) y horas ya redondeadas (para mostrar).
//
// Regla vigente (km_fuente='ruta'): las horas son el TIEMPO DE LA RUTA PLANEADA
// (total_min) contadas DESDE QUE EL CHOFER DIO "INICIAR" (iniciado_en) hacia
// adelante — así el corte día/noche cae donde realmente estaba manejando, sin
// depender de que el GPS haya captado el viaje.
//
// Recorridos previos a la regla: transcurrido real ida+vuelta repartido día/noche
// y escalado al manejo GPS (manejo_min) si existe; si no, transcurrido menos descanso.
export function horasDeRecorrido(
    r: RecorridoMetricas,
    corte: number,
): { diaMin: number; nocheMin: number; horasDia: number; horasNoche: number } {
    let diaMin = 0, nocheMin = 0;
    if (r.km_fuente === 'ruta' && r.iniciado_en && r.total_min != null) {
        const fin = new Date(r.iniciado_en.getTime() + Math.max(0, num(r.total_min)) * 60000);
        const s = minutosDiaNoche(r.iniciado_en, fin, corte);
        diaMin = s.dia; nocheMin = s.noche;
    } else {
        const ida = minutosDiaNoche(r.iniciado_en, r.llegada_en, corte);
        const vuelta = minutosDiaNoche(r.retorno_en, r.finalizado_en, corte);
        const diaEl = ida.dia + vuelta.dia;
        const nocheEl = ida.noche + vuelta.noche;
        const elapsed = diaEl + nocheEl;
        const factor = elapsed > 0
            ? (r.manejo_min != null ? Math.min(1, num(r.manejo_min) / elapsed) : Math.max(0, elapsed - num(r.descanso_min)) / elapsed)
            : 0;
        diaMin = diaEl * factor; nocheMin = nocheEl * factor;
    }
    return {
        diaMin, nocheMin,
        horasDia: Math.round((diaMin / 60) * 100) / 100,
        horasNoche: Math.round((nocheMin / 60) * 100) / 100,
    };
}
