// Tipos compartidos de la app de logística.
// Portados desde apps/web/types/index.ts y ampliados con los modelos que
// consumen los módulos de flota, GPS, mantenimiento y alertas.

export interface User {
  id: string;
  email: string;
  nombre?: string;
  role: string; // SUPERADMIN | ADMIN | USER
  tenant?: string;
  tenant_id?: string;
  moneda?: string; // PEN | USD | EUR
  es_admin?: boolean;
  modulos?: string[];
  rol_id?: string | null;
  rol_nombre?: string | null;
  trabajador_id?: string | null;
  trabajador_codigo?: string | null;
  solo_propios?: boolean;
}

export interface Trabajador {
  id: string;
  id_trabajador?: string;
  nombre_completo: string;
  cargo: string;
  estado_laboral: string;
  nacionalidad?: string;
  fecha_nacimiento?: string;
  url_foto?: string;
  telefono?: string;
  email_personal?: string;
  email_supervisor?: string;
  area_trabajo?: string;
  sueldo_base?: string | number;
  direccion?: string;
  numero_pasaporte?: string;
  fecha_vencimiento_pasaporte?: string;
  licencia_conducir?: string;
  fecha_vencimiento_licencia?: string;
}

export interface Vehiculo {
  id: string;
  placa: string;
  marca_modelo?: string;
  anio_fabricacion?: number;
  tipo_unidad?: string;
  estado_vehiculo?: string;
  aislamiento_termico?: string;
  tarjeta_circulacion?: string;
  poliza_seguro?: string;
  fecha_vencimiento_seguro?: string;
  revision_tecnica?: string;
  permisos_especiales?: string;
  id_interno_furgon?: string;
  kilometraje_actual?: number;
  url_foto?: string;
}

export interface Programacion {
  id: string;
  id_programacion?: string;
  fecha: string;
  vehiculo_id?: string;
  trabajador_id?: string;
  cliente?: string;
  lugar_retiro?: string;
  fecha_retiro?: string;
  lugar_entrega?: string;
  fecha_entrega?: string;
  hora_retiro?: string;
  eta?: string;
  nota?: string;
  estado?: string;
  ingreso_estimado?: number;
}

export interface Mantenimiento {
  id: string;
  vehiculo_id?: string;
  tipo?: string;
  descripcion?: string;
  fecha?: string;
  fecha_programada?: string;
  costo?: number;
  estado?: string;
  kilometraje?: number;
  taller?: string;
  evidence_url?: string;
}

export interface DispositivoGps {
  id: string;
  nombre?: string;
  token?: string;
  vehiculo_id?: string;
  activo?: boolean;
  ultima_conexion?: string;
  lat?: number;
  lng?: number;
}

export interface Geocerca {
  id: string;
  nombre?: string;
  tipo?: string;
  lat?: number;
  lng?: number;
  radio?: number;
  activo?: boolean;
}

export interface Alerta {
  id: string;
  tipo?: string;
  entidad?: string;
  descripcion?: string;
  fecha_vencimiento?: string;
  estado?: string; // VIGENTE | POR_VENCER | VENCIDO
  dias_restantes?: number;
}

export interface Tenant {
  id: string;
  nombre?: string;
  ruc?: string;
  estado?: string;
  plan?: string;
}

export interface DashboardStats {
  [key: string]: number | string;
}
