// Spedizioni "extras" (Piazza Milano/Roma y Steffania). Se distinguen del resto
// (DHL / AB Service) en dos cosas que hoy coinciden pero se piden por razones
// distintas, por eso son dos constantes y no una:
//  - el cliente confirma el costo DESPUÉS del servicio (no hay tabla de km) →
//    SPEDIZIONI_SIN_AUTOCALCULO en ingreso-vehiculo.util.ts;
//  - cada entrega trae un CÓDIGO propio del cliente, con el que el supervisor la
//    reconoce → SPEDIZIONI_CON_CODIGO, aquí abajo.
// Debe coincidir con SPEDIZIONI_CON_CODIGO de apps/web/app/operaciones/constants.ts.
export const SPEDIZIONI_CON_CODIGO = ['EXTRAS PIAZZA MILANO', 'EXTRAS PIAZZA ROMA', 'EXTRAS STEFFANIA'];

export function spedizioneUsaCodigo(spedizione?: string | null) {
    return SPEDIZIONI_CON_CODIGO.includes(String(spedizione || '').trim().toUpperCase());
}

// El código se guarda normalizado (sin espacios sobrantes, en mayúsculas) para que
// el índice único no deje pasar "ab-123 " y "AB-123" como dos entregas distintas.
// Devuelve null cuando no hay código: en Postgres los NULL no colisionan entre sí,
// así que las consegnas sin código (DHL/AB Service) conviven sin problema.
export function normalizarCodigo(codigo?: string | null): string | null {
    const v = String(codigo ?? '').trim().toUpperCase();
    return v ? v : null;
}
