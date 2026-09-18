-- Peaje suelto: foto(s) del ticket/mancato subidas desde el formulario de registro
-- (app + web). Los peajes de operación ya usaban GastoOperacion.comprobantes.
ALTER TABLE "peajes" ADD COLUMN "comprobantes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
