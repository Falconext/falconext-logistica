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
  { key: 'panel', name: 'Panel de Control', href: '/panel' },
  { key: 'operaciones', name: 'Operaciones', href: '/operaciones' },
  { key: 'servicios', name: 'DHL / Farmacia', href: '/servicios' },
  { key: 'trabajadores', name: 'Trabajadores', href: '/trabajadores' },
  { key: 'vehiculos', name: 'Vehículos', href: '/vehiculos' },
  { key: 'mantenimiento', name: 'Mantenimiento', href: '/mantenimiento' },
  { key: 'calendario', name: 'Calendario', href: '/calendario' },
  { key: 'reportes', name: 'Reportes', href: '/reportes' },
  { key: 'alertas', name: 'Alertas', href: '/alertas' },
  { key: 'recorridos', name: 'Recorridos', href: '/recorridos' },
  { key: 'rastreo', name: 'Rastreo', href: '/rastreo' },
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
  es_admin?: boolean | null;
  solo_propios?: boolean | null;
  trabajador_id?: string | null;
}

/** ¿El usuario es administrador (ve todo)? Usa es_admin del rol; fallback a role string. */
export function isAdmin(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.es_admin === 'boolean') return user.es_admin;
  return isAdminRole(user.role);
}

/** Modo chofer: restringido a "lo suyo" y vinculado a un trabajador. Los supervisores
 *  (con módulos asignados pero sin ser chofer) NO caen aquí y sí pueden gestionar. */
export function isChofer(user: UserLike | null | undefined): boolean {
  return !!user?.solo_propios && !!user?.trabajador_id;
}

/** Los admins ven todos los módulos; el resto solo los asignados por su rol. */
export function canAccessModule(user: UserLike | null | undefined, key: string): boolean {
  if (!user) return false;
  // Rastreo (compartir tu propia ubicación GPS) queda disponible para CUALQUIER
  // rol: no se gatea por módulo, cualquier usuario logueado puede activarlo.
  if (key === 'rastreo') return true;
  if (isAdmin(user)) return true;
  return Array.isArray(user.modulos) && user.modulos.includes(key);
}

// Rutas que no son módulos asignables propios: se gatean con el módulo de otra
// clave (p. ej. la vista Scadenze pertenece al módulo Alertas).
const ROUTE_MODULE_ALIASES: { prefix: string; key: string }[] = [
  { prefix: '/scadenze', key: 'alertas' },
];

/** Devuelve la clave de módulo correspondiente a una ruta (o null). */
export function moduleForPath(pathname: string): string | null {
  for (const a of ROUTE_MODULE_ALIASES) {
    if (pathname === a.prefix || pathname.startsWith(a.prefix + '/')) return a.key;
  }
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
