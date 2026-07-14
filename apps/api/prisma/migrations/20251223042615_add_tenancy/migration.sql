/*
  Warnings:

  - Added the required column `tenant_id` to the `mantenimiento` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `programacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `trabajadores` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `vehiculos` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "tenant_id" TEXT NOT NULL,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL,
    CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_mantenimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehiculo_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "descripcion" TEXT NOT NULL,
    "costo" REAL NOT NULL,
    "taller" TEXT,
    "kilometraje" INTEGER,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL,
    "tenant_id" TEXT NOT NULL,
    CONSTRAINT "mantenimiento_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mantenimiento_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_mantenimiento" ("actualizado_en", "costo", "creado_en", "descripcion", "fecha", "id", "kilometraje", "taller", "tipo", "vehiculo_id") SELECT "actualizado_en", "costo", "creado_en", "descripcion", "fecha", "id", "kilometraje", "taller", "tipo", "vehiculo_id" FROM "mantenimiento";
DROP TABLE "mantenimiento";
ALTER TABLE "new_mantenimiento" RENAME TO "mantenimiento";
CREATE TABLE "new_programacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL,
    "id_programacion" TEXT,
    "vehiculo_id" TEXT,
    "trabajador_id" TEXT,
    "cliente" TEXT,
    "lugar_retiro" TEXT,
    "lugar_entrega" TEXT,
    "hora_retiro" TEXT,
    "eta" TEXT,
    "nota" TEXT,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL,
    "tenant_id" TEXT NOT NULL,
    CONSTRAINT "programacion_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_programacion" ("actualizado_en", "cliente", "creado_en", "eta", "fecha", "hora_retiro", "id", "id_programacion", "lugar_entrega", "lugar_retiro", "nota", "trabajador_id", "vehiculo_id") SELECT "actualizado_en", "cliente", "creado_en", "eta", "fecha", "hora_retiro", "id", "id_programacion", "lugar_entrega", "lugar_retiro", "nota", "trabajador_id", "vehiculo_id" FROM "programacion";
DROP TABLE "programacion";
ALTER TABLE "new_programacion" RENAME TO "programacion";
CREATE UNIQUE INDEX "programacion_id_programacion_key" ON "programacion"("id_programacion");
CREATE TABLE "new_trabajadores" (
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
    "actualizado_en" DATETIME NOT NULL,
    "tenant_id" TEXT NOT NULL,
    CONSTRAINT "trabajadores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_trabajadores" ("actualizado_en", "area_trabajo", "cargo", "carta_responsiva", "codigo_cu_2024", "codigo_fiscal", "creado_en", "dimision", "direccion", "documento_identidad", "email_personal", "email_supervisor", "estado_laboral", "fecha_nacimiento", "fecha_vencimiento_contrato", "fecha_vencimiento_fiscal", "fecha_vencimiento_identidad", "fecha_vencimiento_licencia", "fecha_vencimiento_pasaporte", "fecha_vencimiento_residencia", "fecha_vencimiento_traduccion", "id", "id_trabajador", "licencia_conducir", "nacionalidad", "nombre_completo", "numero_pasaporte", "permiso_residencia", "permiso_univex", "telefono", "tipo_contrato", "traduccion_licencia", "url_foto") SELECT "actualizado_en", "area_trabajo", "cargo", "carta_responsiva", "codigo_cu_2024", "codigo_fiscal", "creado_en", "dimision", "direccion", "documento_identidad", "email_personal", "email_supervisor", "estado_laboral", "fecha_nacimiento", "fecha_vencimiento_contrato", "fecha_vencimiento_fiscal", "fecha_vencimiento_identidad", "fecha_vencimiento_licencia", "fecha_vencimiento_pasaporte", "fecha_vencimiento_residencia", "fecha_vencimiento_traduccion", "id", "id_trabajador", "licencia_conducir", "nacionalidad", "nombre_completo", "numero_pasaporte", "permiso_residencia", "permiso_univex", "telefono", "tipo_contrato", "traduccion_licencia", "url_foto" FROM "trabajadores";
DROP TABLE "trabajadores";
ALTER TABLE "new_trabajadores" RENAME TO "trabajadores";
CREATE UNIQUE INDEX "trabajadores_id_trabajador_key" ON "trabajadores"("id_trabajador");
CREATE TABLE "new_vehiculos" (
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
    "actualizado_en" DATETIME NOT NULL,
    "tenant_id" TEXT NOT NULL,
    CONSTRAINT "vehiculos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_vehiculos" ("actualizado_en", "aislamiento_termico", "anio_fabricacion", "creado_en", "estado_vehiculo", "fecha_vencimiento_seguro", "id", "id_interno_furgon", "kilometraje_actual", "marca_modelo", "permisos_especiales", "placa", "poliza_seguro", "revision_tecnica", "tarjeta_circulacion", "tipo_unidad", "ultima_actualizacion", "ultima_latitud", "ultima_longitud") SELECT "actualizado_en", "aislamiento_termico", "anio_fabricacion", "creado_en", "estado_vehiculo", "fecha_vencimiento_seguro", "id", "id_interno_furgon", "kilometraje_actual", "marca_modelo", "permisos_especiales", "placa", "poliza_seguro", "revision_tecnica", "tarjeta_circulacion", "tipo_unidad", "ultima_actualizacion", "ultima_latitud", "ultima_longitud" FROM "vehiculos";
DROP TABLE "vehiculos";
ALTER TABLE "new_vehiculos" RENAME TO "vehiculos";
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
