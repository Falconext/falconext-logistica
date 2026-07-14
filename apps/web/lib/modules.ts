// Catálogo canónico de módulos operativos asignables a usuarios.
// Lo usan el Sidebar (para mostrar/ocultar), el guard de rutas y la
// página de administración de usuarios (checkboxes de permisos).

export interface ModuleDef {
  key: string;
  name: string;
  href: string;
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', name: 'Dashboard', href: '/' },
  { key: 'operaciones', name: 'Operaciones', href: '/operaciones' },
  { key: 'trabajadores', name: 'Trabajadores', href: '/trabajadores' },
  { key: 'vehiculos', name: 'Vehículos', href: '/vehiculos' },
  { key: 'mantenimiento', name: 'Mantenimiento', href: '/mantenimiento' },
  { key: 'calendario', name: 'Calendario', href: '/calendario' },
  { key: 'reportes', name: 'Reportes', href: '/reportes' },
  { key: 'alertas', name: 'Alertas', href: '/alertas' },
  { key: 'dispositivos', name: 'Dispositivos GPS', href: '/dispositivos' },
  { key: 'geocercas', name: 'Geocercas', href: '/geocercas' },
  { key: 'peajes', name: 'Peajes / Multas', href: '/peajes' },
  { key: 'combustible', name: 'Combustible', href: '/combustible' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

const ADMIN_ROLES = ['SUPERADMIN', 'ADMIN'];

export function isAdminRole(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.includes(role.toUpperCase());
}

interface UserLike {
  role?: string | null;
  modulos?: string[] | null;
}

/** Los admins ven todos los módulos; el resto solo los asignados. */
export function canAccessModule(user: UserLike | null | undefined, key: string): boolean {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  return Array.isArray(user.modulos) && user.modulos.includes(key);
}

/** Devuelve la clave de módulo correspondiente a una ruta (o null). */
export function moduleForPath(pathname: string): string | null {
  // Coincidencia por prefijo más específico (evita que '/' capture todo).
  const sorted = [...MODULES].sort((a, b) => b.href.length - a.href.length);
  for (const m of sorted) {
    if (m.href === '/') {
      if (pathname === '/') return m.key;
    } else if (pathname === m.href || pathname.startsWith(m.href + '/')) {
      return m.key;
    }
  }
  return null;
}
