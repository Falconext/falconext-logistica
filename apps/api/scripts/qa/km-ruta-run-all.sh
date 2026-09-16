#!/bin/bash
# Corre las 3 baterías (km-ruta-3.py con semilla aleatoria, km-ruta.sh, km-ruta-2.sh) N veces
# con reset de datos "QA *" ENTRE baterías (las baterías 1 y 2 asumen base limpia).
# Uso: ./km-ruta-run-all.sh [desde] [hasta]   (default 1 15)
export PGPASSWORD=$(grep '^DATABASE_URL' /Users/tradercode/logistica/apps/api/.env | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')
reset() { psql -h localhost -p 5439 -U logistica -d logistica -X -A -q -c "delete from recorridos where programacion_id in (select id from programacion where cliente like 'QA %') or trabajador_id in ('fcf3f940-fd30-4b31-80af-4dd92d41d588','366a4f94-e15e-456f-80cd-5f8fe3f32389');" -c "delete from programacion where cliente like 'QA %';"; }
FROM=${1:-1}; TO=${2:-15}
for s in $(seq $FROM $TO); do
  SEED=$((s*131+RANDOM%5000))
  reset; python3 km-ruta-3.py $SEED > r15_$s.log 2>&1
  reset; ./km-ruta.sh >> r15_$s.log 2>&1
  reset; ./km-ruta-2.sh >> r15_$s.log 2>&1
  echo "corrida $s (seed $SEED): $(grep -c '^OK' r15_$s.log) OK / $(grep -c '^FAIL' r15_$s.log) FAIL $(grep -E '^FAIL|Traceback' r15_$s.log | head -3)"
done; reset
