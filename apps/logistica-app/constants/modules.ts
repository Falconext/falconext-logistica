// Permisos por módulo (espejo de apps/web/lib/modules.ts).
// El usuario ve solo los módulos de su rol; los admins ven todo.

export interface ModuleDef {
  key: string;
  name: string;
  route: string; // ruta expo-router dentro de (app)
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', name: 'Inicio', route: '/(app)/dashboard' },
  { key: 'panel', name: 'Panel de Control', route: '/(app)/panel' },
  { key: 'operaciones', name: 'Operaciones', route: '/(app)/operaciones' },
  { key: 'trabajadores', name: 'Trabajadores', route: '/(app)/trabajadores' },
  { key: 'vehiculos', name: 'Vehículos', route: '/(app)/vehiculos' },
  { key: 'mantenimiento', name: 'Mantenimiento', route: '/(app)/mantenimiento' },
  { key: 'peajes', name: 'Peajes / Multas', route: '/(app)/peajes' },
  { key: 'combustible', name: 'Combustible', route: '/(app)/combustible' },
  { key: 'calendario', name: 'Calendario', route: '/(app)/calendario' },
  { key: 'reportes', name: 'Reportes', route: '/(app)/reportes' },
  { key: 'alertas', name: 'Alertas', route: '/(app)/alertas' },
  { key: 'recorridos', name: 'Recorridos', route: '/(app)/recorridos' },
  { key: 'rastreo', name: 'Rastreo', route: '/(app)/rastreo' },
  { key: 'dispositivos', name: 'Dispositivos GPS', route: '/(app)/dispositivos' },
  { key: 'geocercas', name: 'Geocercas', route: '/(app)/geocercas' },
];

interface UserLike {
  role?: string | null;
  es_admin?: boolean | null;
  modulos?: string[] | null;
  solo_propios?: boolean | null;
  trabajador_id?: string | null;
}

export function isAdmin(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.es_admin === 'boolean') return user.es_admin;
  const r = (user.role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPERADMIN';
}

// Modo chofer: usuario restringido a "lo suyo" y vinculado a un trabajador.
// No ve los módulos de empresa (dashboard, panel, reportes…); en su lugar
// tiene Mi Resumen / Mi Perfil y los módulos operativos filtrados a sus datos.
export function isChofer(user: UserLike | null | undefined): boolean {
  return !!user?.solo_propios && !!user?.trabajador_id;
}

// Pantallas personales: solo tienen sentido con un trabajador vinculado.
const CHOFER_ONLY = ['mi-resumen', 'mi-perfil', 'parte-diario'];
// Todo lo que un chofer puede abrir (el backend ya filtra a "solo lo suyo").
const CHOFER_ALLOWED = [...CHOFER_ONLY, 'mi-ruta', 'rastreo', 'historial', 'operaciones', 'peajes', 'combustible'];

export function canAccessModule(user: UserLike | null | undefined, key: string): boolean {
  if (!user) return false;
  if (CHOFER_ONLY.includes(key)) return isChofer(user);
  if (isChofer(user)) return CHOFER_ALLOWED.includes(key);
  // Rastreo (compartir GPS) y Mi Ruta (iniciar/controlar su traslado) quedan
  // disponibles para CUALQUIER rol: cualquier chofer logueado puede usarlos.
  if (key === 'rastreo' || key === 'mi-ruta') return true;
  if (isAdmin(user)) return true;
  return Array.isArray(user.modulos) && user.modulos.includes(key);
}
