
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
    traduccion_licencia?: string;
    fecha_vencimiento_traduccion?: string;
    documento_identidad?: string;
    fecha_vencimiento_identidad?: string;
    permiso_residencia?: string;
    fecha_vencimiento_residencia?: string;
    codigo_fiscal?: string;
    fecha_vencimiento_fiscal?: string;
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
    fecha_vencimiento_revision?: string;
    permisos_especiales?: string;
    fecha_vencimiento_deroghe?: string;
    area?: string;
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
    url?: string | null;
    fecha_vencimiento?: string;
}

export interface Programacion {
    id: string;
    id_programacion?: string;
    fecha: string;

    vehiculo_id?: string;
    trabajador_id?: string;
    trabajador_nombre?: string | null; // Nombre del trabajador resuelto por el backend (para mostrar en vez del código)

    cliente?: string;
    lugar_retiro?: string;
    fecha_retiro?: string; // Added

    lugar_entrega?: string;
    fecha_entrega?: string; // Added (for countdown)

    hora_retiro?: string;
    eta?: string;
    nota?: string;

    km?: number;
    ciudad?: string;
    app?: string;
    compactado?: boolean;
    estado_consegna?: string; // CONSEGNATO | IN_CONSEGNA | IN_SOSPESO | RITIRATO | ANNULLATO | RISCHEDULATO
    attesa?: string; // Tiempo de espera del chofer al cliente
    otros_datos?: string; // Otros datos de consegna (pegado desde WhatsApp)
    foto_bolla?: string | null; // URL (S3) de la bolla/DDT de la operación

    estado?: string; // Added for sync status
    ingreso_estimado?: number; // Added

    anticipo?: number; // Monto entregado al chofer para gastos del trayecto
    gastos?: GastoOperacion[]; // Gastos del chofer (rendición) contra el anticipo
}

// Gasto del chofer durante el trayecto (peaje, combustible, parking, otro).
export interface GastoOperacion {
    id?: string;
    tipo: string; // PEAJE | COMBUSTIBLE | PARKING | OTRO
    monto: number;
    fecha?: string | null;
    descripcion?: string | null;
    numero_mancato?: string | null; // Nº de mancato pagamento (solo PEAJE)
    comprobantes: string[]; // URLs de los comprobantes (uno o varios)
}
