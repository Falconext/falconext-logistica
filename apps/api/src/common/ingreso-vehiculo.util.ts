// Ingreso que factura la empresa al cliente (DHL/AB Servis) por el km de IDA
// que ellos informan (no el km real GPS). Depende de la CATEGORÍA del vehículo
// que hizo la entrega. Es solo una SUGERENCIA: el supervisor la usa o la edita.

import { num } from './tarifas-chofer.util';

export const CATEGORIAS_VEHICULO = ['AUTO_FURGONETA', 'H1_L1', 'H2_L2', 'CASSONATO'] as const;
export type CategoriaVehiculo = (typeof CATEGORIAS_VEHICULO)[number];

export interface TarifasIngreso {
    factores: Record<CategoriaVehiculo, number>;
    minimo: number;
    umbralKm: number;
}

export const TARIFAS_INGRESO_TENANT_SELECT = {
    factor_km_auto_furgoneta: true, factor_km_h1_l1: true, factor_km_h2_l2: true, factor_km_cassonato: true,
    ingreso_km_minimo: true, ingreso_km_umbral: true,
} as const;

export function tarifasIngresoFromTenant(t: {
    factor_km_auto_furgoneta?: any; factor_km_h1_l1?: any; factor_km_h2_l2?: any; factor_km_cassonato?: any;
    ingreso_km_minimo?: any; ingreso_km_umbral?: number | null;
} | null): TarifasIngreso {
    return {
        factores: {
            AUTO_FURGONETA: num(t?.factor_km_auto_furgoneta ?? 0.86),
            H1_L1: num(t?.factor_km_h1_l1 ?? 0.90),
            H2_L2: num(t?.factor_km_h2_l2 ?? 1.00),
            CASSONATO: num(t?.factor_km_cassonato ?? 1.00),
        },
        minimo: num(t?.ingreso_km_minimo ?? 15),
        umbralKm: t?.ingreso_km_umbral ?? 35,
    };
}

// Spedizioni cuyo costo lo confirma el cliente DESPUÉS del servicio: no hay
// tabla de km, así que se deja en blanco para que el supervisor lo llene.
const SPEDIZIONI_SIN_AUTOCALCULO = ['EXTRAS ALFREDO', 'EXTRAS ESTEFANIA'];

// Ingreso sugerido de una operación: km_facturable × factor(categoría del
// vehículo), o el fijo `minimo` si el km es corto (< umbral). null si falta
// algún dato (km, categoría) o la spedizione se factura manualmente.
export function ingresoSugerido(
    op: { km_facturable?: number | null; spedizione?: string | null },
    categoria: string | null | undefined,
    tar: TarifasIngreso,
): { monto: number; factor: number; categoria: CategoriaVehiculo; aplicaMinimo: boolean } | null {
    const sped = (op.spedizione || '').trim().toUpperCase();
    if (SPEDIZIONI_SIN_AUTOCALCULO.includes(sped)) return null;
    const km = num(op.km_facturable);
    if (km <= 0) return null;
    if (!categoria || !(CATEGORIAS_VEHICULO as readonly string[]).includes(categoria)) return null;
    const cat = categoria as CategoriaVehiculo;
    const factor = tar.factores[cat];
    const aplicaMinimo = km < tar.umbralKm;
    const monto = Math.round((aplicaMinimo ? tar.minimo : km * factor) * 100) / 100;
    return { monto, factor, categoria: cat, aplicaMinimo };
}
