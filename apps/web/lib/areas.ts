// Áreas operativas de la empresa (agrupan furgones y trabajadores).
// Se guardan tal cual en Vehiculo.area y Trabajador.area_trabajo.
// Debe coincidir EXACTAMENTE con AREAS_TRABAJO del app móvil
// (apps/logistica-app/constants/operaciones.ts) para que web y app compartan
// los mismos valores en la BD.
export const AREAS = [
  'Milano Farmacia',
  'Milano Piazza',
  'Milano DHL',
  'Milano Management',
] as const;

export const AREA_OPTIONS = AREAS.map((a) => ({ value: a, label: a }));

// Etiqueta para registros sin área asignada (agrupación en listas/scadenze).
export const SIN_AREA = 'SIN ÁREA';
