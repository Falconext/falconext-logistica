-- Bolla múltiple: foto_bolla pasa de String? a String[] (varias hojas/fotos).
-- Convierte datos existentes sin pérdida: NULL -> [], 'url' -> ['url'].

-- AlterTable: Programacion
ALTER TABLE "programacion"
  ALTER COLUMN "foto_bolla" DROP DEFAULT,
  ALTER COLUMN "foto_bolla" TYPE TEXT[] USING (
    CASE WHEN "foto_bolla" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["foto_bolla"] END
  ),
  ALTER COLUMN "foto_bolla" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "foto_bolla" SET NOT NULL;

-- AlterTable: RecorridoParada
ALTER TABLE "recorrido_paradas"
  ALTER COLUMN "foto_bolla" DROP DEFAULT,
  ALTER COLUMN "foto_bolla" TYPE TEXT[] USING (
    CASE WHEN "foto_bolla" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["foto_bolla"] END
  ),
  ALTER COLUMN "foto_bolla" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "foto_bolla" SET NOT NULL;
