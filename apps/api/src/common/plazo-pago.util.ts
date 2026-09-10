// Plazo para que la empresa pague un peaje/multa: 14 días desde la fecha del
// hecho. Es el default que pide el cliente ("fecha 01/09 → límite 15/09"); la
// fecha límite sigue siendo editable porque no siempre cae exacta (lotes de
// pago, recepción tardía). Compartido por Peaje y por los mancatos que nacen
// como GastoOperacion desde una operación.
export const PLAZO_PAGO_DIAS = 14;

export function fechaLimitePago(fecha: Date | string | null | undefined): Date | null {
    if (!fecha) return null;
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + PLAZO_PAGO_DIAS);
    return d;
}
