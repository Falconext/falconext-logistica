import { Play, CircleCheck, PauseCircle, Undo2, RefreshCw, Ban } from 'lucide-react-native';

// Opciones del campo APP: "Sensa App", Milano 01..18, "App Roma".
export const APP_OPTIONS: { value: string; label: string }[] = [
    { value: 'SENSA APP', label: 'Sensa App' },
    ...Array.from({ length: 18 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return { value: `MILANO ${n}`, label: `Milano ${n}` };
    }),
    { value: 'APP ROMA', label: 'App Roma' },
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
    CONSEGNATO: { label: 'Consegnato', variant: 'success' },
    IN_CONSEGNA: { label: 'In Consegna', variant: 'warning' },
    IN_SOSPESO: { label: 'In Sospeso', variant: 'info' },
    RITIRATO: { label: 'Ritirato', variant: 'neutral' },
    ANNULLATO: { label: 'Annullato', variant: 'danger' },
    RISCHEDULATO: { label: 'Rischedulato', variant: 'warning' },
};

export const estadoConsegnaMeta = (e?: string | null) => (e && ESTADO_CONSEGNA_META[e]) || null;

// Acciones de estado que el chofer/admin marca según avanza la ruta.
export const CONSEGNA_ACTIONS: { value: string; label: string; Icon: any }[] = [
    { value: 'IN_CONSEGNA', label: 'Iniciar consegna', Icon: Play },
    { value: 'CONSEGNATO', label: 'Consegnato', Icon: CircleCheck },
    { value: 'IN_SOSPESO', label: 'In Sospeso', Icon: PauseCircle },
    { value: 'RITIRATO', label: 'Ritirato', Icon: Undo2 },
    { value: 'RISCHEDULATO', label: 'Rischedulato', Icon: RefreshCw },
    { value: 'ANNULLATO', label: 'Annullato', Icon: Ban },
];
