-- CreateTable
CREATE TABLE "trabajadores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "id_trabajador" TEXT,
    "nombre_completo" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "estado_laboral" TEXT NOT NULL DEFAULT 'Activo',
    "nacionalidad" TEXT,
    "fecha_nacimiento" DATETIME,
    "url_foto" TEXT,
    "numero_pasaporte" TEXT,
    "fecha_vencimiento_pasaporte" DATETIME,
    "documento_identidad" TEXT,
    "fecha_vencimiento_identidad" DATETIME,
    "permiso_residencia" TEXT,
    "fecha_vencimiento_residencia" DATETIME,
    "licencia_conducir" TEXT,
    "fecha_vencimiento_licencia" DATETIME,
    "traduccion_licencia" TEXT,
    "fecha_vencimiento_traduccion" DATETIME,
    "codigo_fiscal" TEXT,
    "fecha_vencimiento_fiscal" DATETIME,
    "codigo_cu_2024" TEXT,
    "tipo_contrato" TEXT,
    "fecha_vencimiento_contrato" DATETIME,
    "dimision" TEXT,
    "telefono" TEXT,
    "email_personal" TEXT,
    "direccion" TEXT,
    "area_trabajo" TEXT,
    "email_supervisor" TEXT,
    "permiso_univex" TEXT,
    "carta_responsiva" TEXT,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placa" TEXT NOT NULL,
    "marca_modelo" TEXT,
    "anio_fabricacion" INTEGER,
    "tipo_unidad" TEXT,
    "estado_vehiculo" TEXT,
    "aislamiento_termico" TEXT,
    "tarjeta_circulacion" TEXT,
    "poliza_seguro" TEXT,
    "fecha_vencimiento_seguro" DATETIME,
    "revision_tecnica" TEXT,
    "permisos_especiales" TEXT,
    "id_interno_furgon" TEXT,
    "kilometraje_actual" INTEGER DEFAULT 0,
    "ultima_latitud" REAL,
    "ultima_longitud" REAL,
    "ultima_actualizacion" DATETIME,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "trabajadores_id_trabajador_key" ON "trabajadores"("id_trabajador");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");
