// Opciones y metadatos compartidos por el módulo de Operaciones (página + modal).

// Direcciones fijas de retiro (bodegas): casi todos los recorridos salen de estas dos.
export const RETIRO_PRESETS: { label: string; value: string }[] = [
    { label: 'Roma (Casal Lumbroso)', value: "Via Gaspare D'Urso, 98, 00166 La Massimina-Casal Lumbroso RM" },
    { label: 'Milano (Bettola)', value: 'Via Walter Tobagi, 8, 20068 Bettola-Zeloforamagno MI' },
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

// Estados de consegna (italiano). El value es el código canónico persistido.
export const ESTADO_CONSEGNA_OPTIONS: { value: string; label: string }[] = [
    { value: 'CONSEGNATO', label: 'Consegnato' },
    { value: 'IN_CONSEGNA', label: 'In Consegna' },
    { value: 'IN_SOSPESO', label: 'In Sospeso' },
    { value: 'RITIRATO', label: 'Ritirato' },
    { value: 'ANNULLATO', label: 'Annullato' },
    { value: 'RISCHEDULATO', label: 'Rischedulato' },
];

// Colores del badge por estado de consegna (mismo criterio que la imagen de referencia).
export const ESTADO_CONSEGNA_META: Record<string, { label: string; badge: string; dot: string }> = {
    CONSEGNATO: { label: 'Consegnato', badge: 'text-emerald-600 border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500' },
    IN_CONSEGNA: { label: 'In Consegna', badge: 'text-orange-600 border-orange-200 bg-orange-50', dot: 'bg-orange-500' },
    IN_SOSPESO: { label: 'In Sospeso', badge: 'text-blue-600 border-blue-200 bg-blue-50', dot: 'bg-blue-500' },
    RITIRATO: { label: 'Ritirato', badge: 'text-pink-600 border-pink-200 bg-pink-50', dot: 'bg-pink-500' },
    ANNULLATO: { label: 'Annullato', badge: 'text-red-600 border-red-200 bg-red-50', dot: 'bg-red-500' },
    RISCHEDULATO: { label: 'Rischedulato', badge: 'text-amber-600 border-amber-200 bg-amber-50', dot: 'bg-amber-500' },
};

export const estadoConsegnaMeta = (e?: string | null) =>
    (e && ESTADO_CONSEGNA_META[e]) || null;
