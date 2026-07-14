-- CreateTable
CREATE TABLE "mantenimiento" (
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
    CONSTRAINT "mantenimiento_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "programacion" (
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
    "actualizado_en" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "programacion_id_programacion_key" ON "programacion"("id_programacion");
