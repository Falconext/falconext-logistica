
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
    // Docs
    numero_pasaporte?: string;
    fecha_vencimiento_pasaporte?: string;
    licencia_conducir?: string;
    fecha_vencimiento_licencia?: string;
    trackable?: boolean;
    // ... other fields
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

export interface Documento {
    id: string;
    entidad: 'VEHICULO' | 'TRABAJADOR' | 'MANTENIMIENTO';
    entidad_id: string;
    tipo: string;
    nombre?: string;
    url: string;
    fecha_vencimiento?: string;
}

export interface Programacion {
    id: string;
    id_programacion?: string;
    fecha: string;

    vehiculo_id?: string;
    trabajador_id?: string;

    cliente?: string;
    lugar_retiro?: string;
    fecha_retiro?: string; // Added

    lugar_entrega?: string;
    fecha_entrega?: string; // Added (for countdown)

    hora_retiro?: string;
    eta?: string;
    nota?: string;
    estado?: string; // Added for sync status
    ingreso_estimado?: number; // Added
}
