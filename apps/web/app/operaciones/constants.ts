// Opciones y metadatos compartidos por el módulo de Operaciones (página + modal).

// Direcciones fijas de retiro (bodegas): casi todos los recorridos salen de estas dos.
export const RETIRO_PRESETS: { label: string; value: string }[] = [
    { label: 'Roma (Casal Lumbroso)', value: "Via Gaspare D'Urso, 98, 00166 La Massimina-Casal Lumbroso RM" },
    { label: 'Peschiera Borromeo (Bettola)', value: 'Via Walter Tobagi, 8, 20068 Bettola-Zeloforamagno MI' },
];

// "Posición actual" se guarda como coordenadas planas "lat,lng" (el mapa las rutea directo).
export const isCoords = (s?: string | null) => !!s && /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/.test(s.trim());

// Opciones del campo APP: "Sensa App", Milano 01..18, "App Roma".
export const APP_OPTIONS: { value: string; label: string }[] = [
    { value: 'SENSA APP', label: 'Sensa App' },
    ...Array.from({ length: 18 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return { value: `MILANO ${n}`, label: `Milano ${n}` };
    }),
    { value: 'APP ROMA', label: 'App Roma' },
];

// Opciones del campo SPEDIZIONE (expedición/cliente). Debe coincidir con
// SPEDIZIONE_OPTIONS del app (apps/logistica-app/constants/operaciones.ts).
export const SPEDIZIONE_OPTIONS: { value: string; label: string }[] = [
    { value: 'AB', label: 'Ab Servis' },
    { value: 'DHL', label: 'DHL' },
    { value: 'EXTRAS ALFREDO', label: 'Extras Alfredo' },
    { value: 'EXTRAS ESTEFANIA', label: 'Extras Estefanía' },
];

// Estados de consegna (italiano). El value es el código canónico persistido.
export const ESTADO_CONSEGNA_OPTIONS: { value: string; label: string }[] = [
    { value: 'RICHIESTA', label: 'Richiesta' },
    { value: 'ACCETTATA', label: 'Aceptada' }, // el chofer aceptó la consegna
    { value: 'CONSEGNATO', label: 'Consegnato' },
    { value: 'IN_CONSEGNA', label: 'In Consegna' },
    { value: 'IN_SOSPESO', label: 'In Sospeso' },
    { value: 'RITIRATO', label: 'Ritirato' },
    { value: 'ANNULLATO', label: 'Annullato' },
    { value: 'RISCHEDULATO', label: 'Rischedulato' },
];

// Colores del badge por estado de consegna (mismo criterio que la imagen de referencia).
export const ESTADO_CONSEGNA_META: Record<string, { label: string; badge: string; dot: string }> = {
    RICHIESTA: { label: 'Richiesta', badge: 'text-blue-600 border-blue-200 bg-blue-50', dot: 'bg-blue-500' },
    ACCETTATA: { label: 'Aceptada', badge: 'text-emerald-600 border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500' },
    CONSEGNATO: { label: 'Consegnato', badge: 'text-emerald-600 border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500' },
    IN_CONSEGNA: { label: 'In Consegna', badge: 'text-orange-600 border-orange-200 bg-orange-50', dot: 'bg-orange-500' },
    IN_SOSPESO: { label: 'In Sospeso', badge: 'text-blue-600 border-blue-200 bg-blue-50', dot: 'bg-blue-500' },
    RITIRATO: { label: 'Ritirato', badge: 'text-pink-600 border-pink-200 bg-pink-50', dot: 'bg-pink-500' },
    ANNULLATO: { label: 'Annullato', badge: 'text-red-600 border-red-200 bg-red-50', dot: 'bg-red-500' },
    RISCHEDULATO: { label: 'Rischedulato', badge: 'text-amber-600 border-amber-200 bg-amber-50', dot: 'bg-amber-500' },
};

export const estadoConsegnaMeta = (e?: string | null) =>
    (e && ESTADO_CONSEGNA_META[e]) || null;

// Todo gasto puede pagarlo el chofer (se descuenta de su anticipo) o la empresa
// (peaje MANCATO / combustible con TARJETA-CÓDIGO / otro gasto pendiente: no
// descuenta al chofer pero sí cuenta en el costo de la ruta). Mismo criterio que
// apps/logistica-app/constants/operaciones.ts.
export const GASTO_TIPOS_CON_PAGADOR = ['PEAJE', 'COMBUSTIBLE', 'OTRO'];

export function pagadorLabels(tipo: string): { yes: string; no: string; hintYes: string; hintNo: string } {
    if (tipo === 'PEAJE') {
        return {
            yes: 'Pagado', no: 'Falta pagar',
            hintYes: 'Pagó en la garita (efectivo/tarjeta). Se le descuenta.',
            hintNo: 'Peaje mancato: falta pagarlo (lo paga la empresa). NO se descuenta al chofer.',
        };
    }
    if (tipo === 'COMBUSTIBLE') {
        return {
            yes: 'Pagado', no: 'Tarjeta - Código',
            hintYes: 'Pagó el combustible de su bolsillo. Se le descuenta.',
            hintNo: 'Combustible con tarjeta o código de la empresa. NO se descuenta al chofer.',
        };
    }
    return {
        yes: 'Pagado', no: 'Falta pagar',
        hintYes: 'Lo pagó el chofer de su bolsillo. Se le descuenta.',
        hintNo: 'Falta pagarlo (lo paga la empresa). NO se descuenta al chofer.',
    };
}

// Categoría del vehículo: define el factor €/km del ingreso por km facturable
// (DHL/AB Servis). Debe coincidir con las opciones del app.
export const CATEGORIA_VEHICULO_LABEL: Record<string, string> = {
    AUTO_FURGONETA: 'Auto / Furgoneta',
    H1_L1: 'Furgón H1 L1',
    H2_L2: 'Furgón H2 L2',
    CASSONATO: 'Cassonato',
};
export const categoriaVehiculoLabel = (v?: string | null): string => (v && CATEGORIA_VEHICULO_LABEL[v]) || v || '—';

// Spedizioni cuyo costo lo confirma el cliente DESPUÉS del servicio: no hay
// tabla de km, se deja en blanco para que el supervisor lo llene a mano.
export const SPEDIZIONI_SIN_AUTOCALCULO = ['EXTRAS ALFREDO', 'EXTRAS ESTEFANIA'];

// Tarifas de la empresa para el ingreso sugerido (GET /registros/config).
export interface TarifasIngreso {
    factor_km_auto_furgoneta: number;
    factor_km_h1_l1: number;
    factor_km_h2_l2: number;
    factor_km_cassonato: number;
    ingreso_km_minimo: number;
    ingreso_km_umbral: number;
    pago_navetta: number;
}

export interface IngresoSugerido {
    monto: number;
    factor: number | null;
    categoria: string | null;
    aplicaMinimo: boolean;
    esNavetta: boolean;
}

// Réplica en cliente de ingresoSugerido() del backend (apps/api/src/common/
// ingreso-vehiculo.util.ts) — para autocompletar el ingreso EN VIVO mientras el
// supervisor escribe el km facturable, sin esperar un viaje al servidor. Misma
// jerarquía: navetta (fijo) > spedizione sin autocálculo (null) > factor por
// categoría (o fijo si el km es corto).
export function calcularIngresoSugerido(
    kmFacturable: string | number | null | undefined,
    categoria: string | null | undefined,
    esNavetta: boolean,
    spedizione: string | null | undefined,
    tar: TarifasIngreso | null,
): IngresoSugerido | null {
    if (!tar) return null;
    if (esNavetta) {
        return { monto: Math.round(tar.pago_navetta * 100) / 100, factor: null, categoria: null, aplicaMinimo: false, esNavetta: true };
    }
    const sped = (spedizione || '').trim().toUpperCase();
    if (SPEDIZIONI_SIN_AUTOCALCULO.includes(sped)) return null;
    const km = Number(kmFacturable) || 0;
    if (km <= 0) return null;
    const factores: Record<string, number> = {
        AUTO_FURGONETA: tar.factor_km_auto_furgoneta,
        H1_L1: tar.factor_km_h1_l1,
        H2_L2: tar.factor_km_h2_l2,
        CASSONATO: tar.factor_km_cassonato,
    };
    if (!categoria || !(categoria in factores)) return null;
    const factor = factores[categoria];
    const aplicaMinimo = km < tar.ingreso_km_umbral;
    const monto = Math.round((aplicaMinimo ? tar.ingreso_km_minimo : km * factor) * 100) / 100;
    return { monto, factor, categoria, aplicaMinimo, esNavetta: false };
}
