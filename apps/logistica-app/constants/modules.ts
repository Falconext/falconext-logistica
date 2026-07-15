// Permisos por módulo (espejo de apps/web/lib/modules.ts).
// El usuario ve solo los módulos de su rol; los admins ven todo.

export interface ModuleDef {
  key: string;
  name: string;
  route: string; // ruta expo-router dentro de (app)
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', name: 'Inicio', route: '/(app)/dashboard' },
  { key: 'operaciones', name: 'Operaciones', route: '/(app)/operaciones' },
  { key: 'trabajadores', name: 'Trabajadores', route: '/(app)/trabajadores' },
  { key: 'vehiculos', name: 'Vehículos', route: '/(app)/vehiculos' },
  { key: 'mantenimiento', name: 'Mantenimiento', route: '/(app)/mantenimiento' },
  { key: 'peajes', name: 'Peajes / Multas', route: '/(app)/peajes' },
  { key: 'combustible', name: 'Combustible', route: '/(app)/combustible' },
  { key: 'calendario', name: 'Calendario', route: '/(app)/calendario' },
  { key: 'reportes', name: 'Reportes', route: '/(app)/reportes' },
  { key: 'alertas', name: 'Alertas', route: '/(app)/alertas' },
  { key: 'flota', name: 'Flota en Vivo', route: '/(app)/flota' },
  { key: 'rastreo', name: 'Rastreo', route: '/(app)/rastreo' },
  { key: 'dispositivos', name: 'Dispositivos GPS', route: '/(app)/dispositivos' },
  { key: 'geocercas', name: 'Geocercas', route: '/(app)/geocercas' },
];

interface UserLike {
  role?: string | null;
  es_admin?: boolean | null;
  modulos?: string[] | null;
}

export function isAdmin(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.es_admin === 'boolean') return user.es_admin;
  const r = (user.role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPERADMIN';
}

export function canAccessModule(user: UserLike | null | undefined, key: string): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return Array.isArray(user.modulos) && user.modulos.includes(key);
}
