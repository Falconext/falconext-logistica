// Áreas operativas de la empresa (agrupan furgones y trabajadores).
// Se guardan tal cual en Vehiculo.area y Trabajador.area_trabajo.
export const AREAS = ['MILANO NORD', 'MILANO SUD', 'PERSONAL', 'ROMA'] as const;

export const AREA_OPTIONS = AREAS.map((a) => ({ value: a, label: a }));

// Etiqueta para registros sin área asignada (agrupación en listas/scadenze).
export const SIN_AREA = 'SIN ÁREA';
