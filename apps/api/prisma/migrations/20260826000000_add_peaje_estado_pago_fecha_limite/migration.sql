-- AlterTable
ALTER TABLE "peajes" ADD COLUMN "fecha_limite_pago" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "gastos_operacion" ADD COLUMN "estado" TEXT;
ALTER TABLE "gastos_operacion" ADD COLUMN "fecha_limite_pago" TIMESTAMP(3);
