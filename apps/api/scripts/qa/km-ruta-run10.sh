#!/bin/bash
export PGPASSWORD=$(grep '^DATABASE_URL' /Users/tradercode/logistica/apps/api/.env | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')
reset() { psql -h localhost -p 5439 -U logistica -d logistica -X -A -q -c "delete from recorridos where programacion_id in (select id from programacion where cliente like 'QA %') or trabajador_id in ('fcf3f940-fd30-4b31-80af-4dd92d41d588','366a4f94-e15e-456f-80cd-5f8fe3f32389');" -c "delete from programacion where cliente like 'QA %';"; }
for s in $(seq 1 10); do reset; python3 km-ruta-3.py $((s*7+RANDOM%1000)) > run3_$s.log 2>&1; grep -E "^RESULTADO3|^FAIL|Traceback|Error" run3_$s.log; done; reset
