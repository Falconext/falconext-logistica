-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imei" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "model" TEXT,
    "last_activity" DATETIME,
    "vehiculo_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL,
    CONSTRAINT "devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "speed" REAL,
    "heading" REAL,
    "altitude" REAL,
    "accuracy" REAL,
    "battery" INTEGER,
    "ignition" BOOLEAN,
    "timestamp" DATETIME NOT NULL,
    "server_time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "positions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_imei_key" ON "devices"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "devices_token_key" ON "devices"("token");

-- CreateIndex
CREATE INDEX "positions_device_id_timestamp_idx" ON "positions"("device_id", "timestamp");
