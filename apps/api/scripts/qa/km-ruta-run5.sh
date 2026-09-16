#!/bin/bash
# Corre km-ruta.sh + km-ruta-2.sh 5 veces con reset de datos "QA *" entre corridas
# (detecta flakiness / efectos acumulados). Ejecutar desde la carpeta con token.txt.
export PGPASSWORD=$(grep '^DATABASE_URL' /Users/tradercode/logistica/apps/api/.env | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')
reset() { psql -h localhost -p 5439 -U logistica -d logistica -X -A -q -c "delete from recorridos where programacion_id in (select id from programacion where cliente like 'QA %') or trabajador_id in ('fcf3f940-fd30-4b31-80af-4dd92d41d588','366a4f94-e15e-456f-80cd-5f8fe3f32389');" -c "delete from programacion where cliente like 'QA %';"; }
for i in 1 2 3 4 5; do
  reset
  echo "########## CORRIDA $i ##########"
  ./km-ruta.sh > run_$i.log 2>&1; ./km-ruta-2.sh >> run_$i.log 2>&1
  grep -E "^RESULTADO|^FAIL" run_$i.log
done
reset
