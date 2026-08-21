import { Play, CircleCheck, PauseCircle, Undo2, RefreshCw, Ban, Bell } from 'lucide-react-native';

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

// Áreas de trabajo a las que se destina un trabajador. Las 3 fijas del negocio.
export const AREAS_TRABAJO: { value: string; label: string }[] = [
    { value: 'Milano Farmacia', label: 'Milano Farmacia' },
    { value: 'Milano Piazza', label: 'Milano Piazza' },
    { value: 'Milano DHL', label: 'Milano DHL' },
    { value: 'Milano Management', label: 'Milano Management' },
];

// Opciones del campo SPEDIZIONE (cliente/expedición). Las 4 fijas del negocio.
export const SPEDIZIONE_OPTIONS: { value: string; label: string }[] = [
    { value: 'AB', label: 'AB' },
    { value: 'DHL', label: 'DHL' },
    { value: 'EXTRAS ALFREDO', label: 'Extras Alfredo' },
    { value: 'EXTRAS ESTEFANIA', label: 'Extras Estefanía' },
];

// Tipos de gasto de la rendición.
export const GASTO_TIPOS: { value: string; label: string }[] = [
    { value: 'PEAJE', label: 'Peaje' },
    { value: 'COMBUSTIBLE', label: 'Combustible' },
    { value: 'PARKING', label: 'Parking' },
    { value: 'OTRO', label: 'Otro' },
];

// Categoría del vehículo: define el factor €/km del ingreso por km facturable
// (DHL/AB Servis). Se elige en la ficha del vehículo (Vehículos).
export const CATEGORIA_VEHICULO_OPTIONS: { value: string; label: string }[] = [
    { value: 'AUTO_FURGONETA', label: 'Auto / Furgoneta' },
    { value: 'H1_L1', label: 'Furgón H1 L1' },
    { value: 'H2_L2', label: 'Furgón H2 L2' },
    { value: 'CASSONATO', label: 'Cassonato' },
];
export const categoriaVehiculoLabel = (v?: string | null): string =>
    CATEGORIA_VEHICULO_OPTIONS.find((o) => o.value === v)?.label || v || '—';

// Todo gasto puede pagarse de dos formas: por el chofer (se descuenta de su
// anticipo) o por la empresa (peaje MANCATO / combustible con TARJETA-CÓDIGO /
// otro gasto que falta pagar: no descuenta al chofer pero sí cuenta en el costo
// de la ruta). Los 3 tipos ofrecen la opción.
export const GASTO_TIPOS_CON_PAGADOR = ['PEAJE', 'COMBUSTIBLE', 'OTRO'];

// ¿El gasto lo pagó el chofer de su bolsillo? Default true (comportamiento histórico).
// Si es false, lo paga la empresa y NO se descuenta del saldo del chofer.
export const gastoPagadoPorChofer = (g: any): boolean => g?.pagado_por_chofer !== false;

// Etiquetas del toggle "¿quién lo pagó?" según el tipo de gasto: la opción "no
// pagado por el chofer" cambia de nombre porque el flujo real es distinto en
// cada caso (mancato de peaje vs. tarjeta/código de combustible vs. gasto pendiente).
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

// Suma de gastos que SÍ descuentan al chofer (los que él pagó).
export const totalPagadoPorChofer = (gastos: any[]): number =>
    (gastos || []).reduce((s, g) => s + (gastoPagadoPorChofer(g) ? Number(g?.monto || 0) : 0), 0);

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// Estado de consegna → etiqueta + variante de Badge móvil.
export const ESTADO_CONSEGNA_META: Record<string, { label: string; variant: BadgeVariant }> = {
    RICHIESTA: { label: 'Richiesta', variant: 'info' },
    ACCETTATA: { label: 'Aceptada', variant: 'success' }, // el chofer aceptó la consegna
    CONSEGNATO: { label: 'Consegnato', variant: 'success' },
    IN_CONSEGNA: { label: 'In Consegna', variant: 'warning' },
    IN_SOSPESO: { label: 'In Sospeso', variant: 'info' },
    RITIRATO: { label: 'Ritirato', variant: 'neutral' },
    ANNULLATO: { label: 'Annullato', variant: 'danger' },
    RISCHEDULATO: { label: 'Rischedulato', variant: 'warning' },
};

export const estadoConsegnaMeta = (e?: string | null) => (e && ESTADO_CONSEGNA_META[e]) || null;

// Una consegna "ya realizada" (entregada / consegnato) no debe poder editarse:
// se considera cerrada cuando el estado es ENTREGADO/COMPLETED o el estado de
// consegna es CONSEGNATO. Cubre variantes ES/EN que conviven en la BD.
export const ESTADOS_ENTREGADO = ['ENTREGADO', 'COMPLETED'];
export const isConsegnaRealizada = (
    r?: { estado?: string | null; estado_consegna?: string | null } | null,
) =>
    !!r &&
    (ESTADOS_ENTREGADO.includes((r.estado || '').toUpperCase()) ||
        (r.estado_consegna || '').toUpperCase() === 'CONSEGNATO');

// Acciones de estado que el chofer/admin marca según avanza la ruta.
export const CONSEGNA_ACTIONS: { value: string; label: string; Icon: any }[] = [
    { value: 'RICHIESTA', label: 'Richiesta', Icon: Bell },
    { value: 'IN_CONSEGNA', label: 'Iniciar consegna', Icon: Play },
    { value: 'CONSEGNATO', label: 'Consegnato', Icon: CircleCheck },
    { value: 'IN_SOSPESO', label: 'In Sospeso', Icon: PauseCircle },
    { value: 'RITIRATO', label: 'Ritirato', Icon: Undo2 },
    { value: 'RISCHEDULATO', label: 'Rischedulato', Icon: RefreshCw },
    { value: 'ANNULLATO', label: 'Annullato', Icon: Ban },
];
