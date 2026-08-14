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
