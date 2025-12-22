
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
    direccion?: string;
    // Docs
    numero_pasaporte?: string;
    fecha_vencimiento_pasaporte?: string;
    licencia_conducir?: string;
    fecha_vencimiento_licencia?: string;
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
}

export interface Programacion {
    id: string;
    id_programacion?: string;
    fecha: string;

    vehiculo_id?: string;
    trabajador_id?: string;

    cliente?: string;
    lugar_retiro?: string;
    lugar_entrega?: string;
    hora_retiro?: string;
    eta?: string;
    nota?: string;
}
