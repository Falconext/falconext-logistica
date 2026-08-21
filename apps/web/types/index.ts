
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
    categoria?: string | null; // AUTO_FURGONETA | H1_L1 | H2_L2 | CASSONATO — factor €/km de ingreso
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
    destinos?: string[]; // Destinos adicionales (paradas) tras lugar_entrega

    hora_retiro?: string;
    eta?: string;
    nota?: string;

    km?: number;
    tiempo_min?: number; // tiempo total del recorrido (min), estampado al finalizar
    ciudad?: string;
    app?: string;
    spedizione?: string;
    compactado?: boolean;
    estado_consegna?: string; // CONSEGNATO | IN_CONSEGNA | IN_SOSPESO | RITIRATO | ANNULLATO | RISCHEDULATO
    attesa?: string; // Tiempo de espera del chofer al cliente
    otros_datos?: string; // Otros datos de consegna (pegado desde WhatsApp)
    foto_bolla?: string | null; // URL (S3) de la bolla/DDT de la operación

    estado?: string; // Added for sync status
    ingreso_estimado?: number; // Added
    // Km de IDA que el cliente (DHL/AB Servis) informa por mensaje — distinto del
    // km real GPS (`km`). Con la categoría del vehículo arma el ingreso.
    km_facturable?: number | null;
    // Sugerencia calculada por el backend (GET /programacion/:id): null si falta
    // km_facturable/categoría o si la spedizione se cobra manual (Extras).
    ingreso_sugerido?: { monto: number; factor: number | null; categoria: string | null; aplicaMinimo: boolean; esNavetta: boolean } | null;
    // Navetta: traslado/lanzadera entre almacenes (no una entrega). Fuerza el
    // ingreso sugerido al fijo de navetta, sin importar km ni categoría.
    es_navetta?: boolean;
    // Desglose de facturación por destino (índice 0 = lugar_entrega, índice i =
    // destinos[i-1]). Si tiene datos, km_facturable/ingreso_estimado son su SUMA.
    destinos_facturacion?: DestinoFacturacion[] | null;
    // Una sugerencia por cada entrada de destinos_facturacion (mismo orden). null si
    // la operación no tiene desglose por destino.
    ingreso_sugerido_por_destino?: Array<{ monto: number; factor: number | null; categoria: string | null; aplicaMinimo: boolean; esNavetta: boolean } | null> | null;

    anticipo?: number; // Monto entregado al chofer para gastos del trayecto
    gastos?: GastoOperacion[]; // Gastos del chofer (rendición) contra el anticipo
}

// Facturación de UN destino dentro de destinos_facturacion (ver Programacion).
export interface DestinoFacturacion {
    km_facturable?: number | null;
    ingreso?: number | null;
    referencia_dhl?: string | null; // tracking/código que reporta DHL para ese destino
}

// Gasto del chofer durante el trayecto (peaje, combustible, parking, otro).
export interface GastoOperacion {
    id?: string;
    tipo: string; // PEAJE | COMBUSTIBLE | PARKING | OTRO
    monto: number;
    fecha?: string | null;
    descripcion?: string | null;
    numero_mancato?: string | null; // Nº de mancato pagamento (solo PEAJE)
    link_peaje?: string | null; // Link/URL del peaje (solo PEAJE)
    pagado_por_chofer?: boolean; // false = mancato/código/pendiente: lo paga la empresa, no descuenta al chofer
    comprobantes: string[]; // URLs de los comprobantes (uno o varios)
}
