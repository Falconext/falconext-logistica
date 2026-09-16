#!/bin/bash
# Reproceso km/tiempo = ruta (septiembre 2026) en PROD. Por defecto APLICA
# (el dry-run ya se revisó 3 veces con resultado idéntico). ./repro-km.sh prueba → solo simula.
API_HOST="https://falconext-logistica-api.vercel.app"
SECRET=$(grep 'CRON_SECRET=' /Users/tradercode/logistica/vf-diag.sh | cut -d'"' -f2)
APLICAR=true; [ "$1" = "prueba" ] && APLICAR=false
OUT=prod_repro_$([ "$APLICAR" = true ] && echo aplicado || echo dry).json
code=$(curl -s -o $OUT -w "%{http_code}" --max-time 300 -X POST "$API_HOST/api/recorridos-admin/reprocesar-km-ruta" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d "{\"desde\":\"2026-09-01\",\"hasta\":\"2026-09-30\",\"aplicar\":$APLICAR}")
echo "HTTP $code → $OUT"
python3 - "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
if 'totales' not in d: print(d); sys.exit(1)
print('MODO:', d['modo']); print('TOTALES:', json.dumps(d['totales'], ensure_ascii=False))
print(f"\n{'CHOFER':40} {'REC':>4} {'AUTO':>4} {'KM ANTES':>10} {'KM DESPUÉS':>11} {'DIF':>8}")
for c in d['por_chofer']: print(f"{c['trabajador'][:40]:40} {c['recorridos']:>4} {c['auto_creados']:>4} {c['km_antes']:>10} {c['km_despues']:>11} {c['diferencia']:>8}")
from collections import Counter
print('\nACCIONES:', dict(Counter(f['accion'] for f in d['detalle'])))
sin=[a for a in d['consegnas_sin_recorrido'] if a.get('motivo')]
print('SIN RECORRIDO no creables:', dict(Counter(a['motivo'] for a in sin)))
PY
