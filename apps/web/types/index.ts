
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
    retiros?: string[]; // Retiros/orígenes adicionales (almacenes) tras lugar_retiro
    // Fecha/hora de cada retiro adicional, paralelo a retiros[] por índice.
    retiros_detalle?: Array<{ fecha?: string | null; hora?: string | null }> | null;

    lugar_entrega?: string;
    fecha_entrega?: string; // Added (for countdown)
    destinos?: string[]; // Destinos adicionales (paradas) tras lugar_entrega
    // Detalle de cada destino adicional, paralelo a destinos[] por índice. fecha/hora
    // para cualquier ruta; cliente/spedizione/km_facturable/ingreso solo si compactado.
    destinos_detalle?: Array<{ fecha?: string | null; hora?: string | null; cliente?: string | null; spedizione?: string | null; km_facturable?: number | null; ingreso?: number | null }> | null;

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
    foto_bolla?: string[]; // URLs (S3) de la bolla/DDT de la operación — puede ser de varias hojas

    estado?: string; // Added for sync status
    ingreso_estimado?: number; // Added
    // Km de IDA que el cliente (DHL/AB Servis) informa por mensaje — distinto del
    // km real GPS (`km`). Con la categoría del vehículo arma el ingreso.
    km_facturable?: number | null;
    // De dónde salió `km`: 'gps' (real, medido), 'estimado' (Google, el GPS no
    // captó suficiente movimiento — NO es lo que el chofer manejó) o 'manual'
    // (editado a mano / sin recorrido de Mi Ruta detrás). Calculado al leer.
    km_fuente?: 'gps' | 'estimado' | 'manual' | null;
    // Sugerencia calculada por el backend (GET /programacion/:id): null si falta
    // km_facturable/categoría o si la spedizione se cobra manual (Extras).
    ingreso_sugerido?: { monto: number; factor: number | null; categoria: string | null; aplicaMinimo: boolean; esNavetta: boolean } | null;
    // Navetta: traslado/lanzadera entre almacenes (no una entrega). Fuerza el
    // ingreso sugerido al fijo de navetta, sin importar km ni categoría.
    es_navetta?: boolean;

    anticipo?: number; // Monto entregado al chofer para gastos del trayecto
    gastos?: GastoOperacion[]; // Gastos del chofer (rendición) contra el anticipo
    // Paradas del recorrido más reciente ligado a esta operación, con su km/min
    // real de GPS por tramo. null si el chofer nunca usó "Mi Ruta".
    paradas_recorrido?: ParadaRecorrido[] | null;
}

export interface ParadaRecorrido {
    id: string;
    orden: number;
    label: string;
    es_retorno: boolean;
    llegada_en?: string | null;
    entregado: boolean;
    km_tramo?: number | null;
    min_tramo?: number | null;
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
