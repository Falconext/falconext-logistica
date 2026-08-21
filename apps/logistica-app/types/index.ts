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
  // Rastreo GPS: si comparte su ubicación desde la app (módulo Rastreo).
  trackable?: boolean;
}

export interface Vehiculo {
  id: string;
  placa: string;
  marca_modelo?: string;
  anio_fabricacion?: number;
  tipo_unidad?: string;
  area?: string; // Área operativa del vehículo (Milano Farmacia/Piazza/DHL/Management)
  categoria?: string | null; // AUTO_FURGONETA | H1_L1 | H2_L2 | CASSONATO — factor €/km de ingreso
  estado_vehiculo?: string;
  aislamiento_termico?: string;
  tarjeta_circulacion?: string;
  poliza_seguro?: string;
  fecha_vencimiento_seguro?: string;
  revision_tecnica?: string;
  permisos_especiales?: string;
  kilometraje_actual?: number;
  url_foto?: string;
}

export interface Programacion {
  id: string;
  id_programacion?: string;
  fecha: string;
  vehiculo_id?: string;
  trabajador_id?: string;
  trabajador_nombre?: string | null;
  cliente?: string;
  spedizione?: string | null; // AB | DHL | EXTRAS ALFREDO | … (cliente/expedición)
  lugar_retiro?: string;
  fecha_retiro?: string;
  retiros?: string[]; // Retiros/orígenes adicionales (almacenes) tras lugar_retiro
  lugar_entrega?: string;
  fecha_entrega?: string;
  destinos?: string[]; // Destinos adicionales (paradas) tras lugar_entrega
  attesa_horas?: number; // Horas de espera declaradas
  attesa_estado?: string; // PENDIENTE | AUTORIZADO | DENEGADO
  attesa_autorizado_por?: string | null;
  hora_retiro?: string;
  eta?: string;
  nota?: string;
  estado?: string;
  ingreso_estimado?: number;
  // Km de IDA que factura el cliente (DHL/AB Servis, informado por mensaje) —
  // distinto del `km` real (GPS). Con la categoría del vehículo arma el ingreso.
  km_facturable?: number | null;
  // Sugerencia calculada por el backend (GET /programacion/:id): null si falta
  // km_facturable/categoría o si la spedizione se cobra manual (Extras).
  ingreso_sugerido?: { monto: number; factor: number; categoria: string; aplicaMinimo: boolean } | null;
  // Desglose de facturación por destino (índice 0 = lugar_entrega, índice i =
  // destinos[i-1]). Si tiene datos, km_facturable/ingreso_estimado son su SUMA.
  destinos_facturacion?: DestinoFacturacion[] | null;
  // Una sugerencia por cada entrada de destinos_facturacion (mismo orden). null si
  // la operación no tiene desglose por destino.
  ingreso_sugerido_por_destino?: Array<{ monto: number; factor: number; categoria: string; aplicaMinimo: boolean } | null> | null;

  // Datos operativos de consegna
  km?: number;
  tiempo_min?: number; // tiempo total del recorrido (min), estampado al finalizar
  ciudad?: string;
  app?: string;
  compactado?: boolean;
  estado_consegna?: string; // CONSEGNATO | IN_CONSEGNA | IN_SOSPESO | RITIRATO | ANNULLATO | RISCHEDULATO
  attesa?: string;
  otros_datos?: string;
  foto_bolla?: string | null;

  // Rendición del chofer
  anticipo?: number;
  abonos_ruta?: number; // abonos recibidos en ruta (consolidados al finalizar)
  gastos?: GastoOperacion[];

  // Costo del chofer en esta operación (horas + reperibilità + attesa + gastos
  // pagados por él). Lo calcula el backend en GET /programacion/:id.
  costo_chofer?: CostoChofer;
}

// Facturación de UN destino dentro de destinos_facturacion (ver Programacion).
export interface DestinoFacturacion {
  km_facturable?: number | null;
  ingreso?: number | null;
  referencia_dhl?: string | null; // tracking/código que reporta DHL para ese destino
}

export interface CostoChofer {
  horas_dia: number;
  horas_noche: number;
  pago_horas: number;
  reperibilita: boolean;
  pago_reperibilita: number;
  attesa_horas: number;
  attesa_autorizada: boolean;
  pago_attesa: number;
  gastos_chofer: number;
  total: number;
  moneda: string;
}

// Gasto del chofer durante el trayecto (peaje, combustible, parking, otro).
export interface GastoOperacion {
  id?: string;
  tipo: string; // PEAJE | COMBUSTIBLE | PARKING | OTRO
  monto: number;
  fecha?: string | null;
  descripcion?: string | null;
  numero_mancato?: string | null; // solo PEAJE
  link_peaje?: string | null; // solo PEAJE
  pagado_por_chofer?: boolean; // false = mancato/código: lo paga la empresa, no descuenta al chofer
  comprobantes: string[];
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

export interface Documento {
  id: string;
  entidad: 'VEHICULO' | 'TRABAJADOR' | 'MANTENIMIENTO';
  entidad_id: string;
  tipo: string;
  nombre?: string;
  url?: string | null;
  fecha_vencimiento?: string | null;
  bloqueado?: boolean; // true = subido/confirmado por el chofer; solo el supervisor renueva
}
