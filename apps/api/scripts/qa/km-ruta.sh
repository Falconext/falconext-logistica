#!/bin/bash
# QA funcional (básica) de la regla km/horas = ruta planeada (2026-09-16). Requiere API
# local con CRON_SECRET=testsecret, token.txt = JWT de un admin vinculado al trabajador
# G004 (users.trabajador_id). Crea/borra operaciones "QA *" en la BD LOCAL.
API=http://localhost:3005/api; T=$(cat token.txt); H1="Authorization: Bearer $T"; H2="Content-Type: application/json"
export PGPASSWORD=$(grep '^DATABASE_URL' /Users/tradercode/logistica/apps/api/.env | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')
SQL() { psql -h localhost -p 5439 -U logistica -d logistica -X -A -t -F'|' -c "$1"; }
J() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
PASS=0; FAIL=0
check() { if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "OK   $1 → $2"; else FAIL=$((FAIL+1)); echo "FAIL $1 → got [$2] esperado [$3]"; fi; }
RET="Via Walter Tobagi, 8, 20068 Bettola-Zeloforamagno MI"; ENT="Via Archimede 53, Milano"

echo "== A. Supervisor marca CONSEGNATO en web sin que el chofer diera Iniciar =="
OP=$(curl -s -X POST $API/programacion -H "$H1" -H "$H2" -d "{\"cliente\":\"QA A\",\"fecha\":\"2026-09-10T00:00:00.000Z\",\"hora_retiro\":\"18:00\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}" | J "d['id']")
check "A1 creada sin recorrido" "$(SQL "select count(*) from recorridos where programacion_id='$OP'")" "0"
R=$(curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"estado_consegna":"CONSEGNATO"}')
check "A2 PATCH consegnato → estado ENTREGADO" "$(echo "$R" | J "d['estado']")" "ENTREGADO"
check "A3 km_fuente ruta" "$(echo "$R" | J "d['km_fuente']")" "ruta"
check "A4 recorrido auto creado" "$(SQL "select auto||'|'||km_fuente||'|'||estado from recorridos where programacion_id='$OP'")" "true|ruta|COMPLETADO"
check "A5 inicio = 18:00 Roma (16:00Z)" "$(SQL "select to_char(iniciado_en,'HH24:MI') from recorridos where programacion_id='$OP'")" "16:00"
KMA=$(echo "$R" | J "d['km']"); echo "     km ruta = $KMA"
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"cliente":"QA A","estado_consegna":"CONSEGNATO"}' >/dev/null
check "A6 segundo PATCH no duplica" "$(SQL "select count(*) from recorridos where programacion_id='$OP'")" "1"
C=$(curl -s $API/programacion/$OP -H "$H1"); echo "     costo_chofer: $(echo "$C" | J "(d['costo_chofer']['horas_dia'], d['costo_chofer']['horas_noche'])")"
check "A7 horas = duración ruta desde 18:00 (todo día, <19:00)" "$(echo "$C" | J "d['costo_chofer']['horas_dia']>0 and d['costo_chofer']['horas_noche']==0")" "True"

echo "== B. Crear ya entregada (create con CONSEGNATO) =="
OPB=$(curl -s -X POST $API/programacion -H "$H1" -H "$H2" -d "{\"cliente\":\"QA B\",\"fecha\":\"2026-09-11T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado_consegna\":\"CONSEGNATO\"}" | J "d['id']")
check "B1 auto creado, inicio 08:00 Roma (06:00Z) sin hora_retiro" "$(SQL "select auto||'|'||to_char(iniciado_en,'HH24:MI') from recorridos where programacion_id='$OPB'")" "true|06:00"

echo "== C. Flujo real: Iniciar → chofer marca consegnato (PATCH) → Finalizar =="
OPC=$(curl -s -X POST $API/programacion -H "$H1" -H "$H2" -d "{\"cliente\":\"QA C\",\"fecha\":\"2026-09-16T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"retiros\":[\"Malpensa Airport\"],\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}" | J "d['id']")
RID=$(curl -s -X POST $API/recorridos/iniciar -H "$H1" -H "$H2" -d "{\"programacionId\":\"$OPC\"}" | J "d['id']")
curl -s -X PATCH $API/programacion/$OPC -H "$H1" -H "$H2" -d '{"estado_consegna":"CONSEGNATO"}' >/dev/null
check "C1 con recorrido activo NO crea auto" "$(SQL "select count(*)||'|'||bool_or(auto) from recorridos where programacion_id='$OPC'")" "1|false"
curl -s -X POST $API/recorridos/$RID/llegada -H "$H1" >/dev/null
F=$(curl -s -X POST $API/recorridos/$RID/finalizar -H "$H1")
check "C2 finalizar km_fuente ruta" "$(echo "$F" | J "d['km_fuente']")" "ruta"
check "C3 total_km = esperado_km" "$(echo "$F" | J "d['total_km']==d['esperado_km'] and d['total_km']>100")" "True"
check "C4 total_min = esperado_min = manejo_min" "$(echo "$F" | J "d['total_min']==d['esperado_min']==d['manejo_min']")" "True"
OC=$(curl -s $API/programacion/$OPC -H "$H1")
check "C5 op.km = total_km" "$(echo "$OC" | J "d['km']")" "$(echo "$F" | J "d['total_km']")"
check "C6 op.km_fuente ruta" "$(echo "$OC" | J "d['km_fuente']")" "ruta"

echo "== D. Corrección manual y respeto en reproceso =="
curl -s -X PATCH $API/programacion/$OPC -H "$H1" -H "$H2" -d '{"km":150,"tiempo_min":150}' >/dev/null
check "D1 recorrido manual 150/150" "$(SQL "select km_fuente||'|'||total_km||'|'||total_min||'|'||manejo_min from recorridos where id='$RID'")" "manual|150|150|150"
check "D2 findOne km_fuente manual" "$(curl -s $API/programacion/$OPC -H "$H1" | J "d['km_fuente']")" "manual"
DR=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "Authorization: Bearer testsecret" -H "$H2" -d '{"desde":"2026-09-01","hasta":"2026-09-30","aplicar":true}')
check "D3 reproceso respeta manual" "$(SQL "select km_fuente||'|'||total_km from recorridos where id='$RID'")" "manual|150"
check "D4 reproceso no duplica autos" "$(SQL "select count(*) from recorridos where programacion_id in ('$OP','$OPB')")" "2"
DR2=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "Authorization: Bearer testsecret" -H "$H2" -d '{"desde":"2026-09-01","hasta":"2026-09-30","aplicar":true}')
check "D5 reproceso idempotente (km igual 2ª vez)" "$(echo "$DR2" | J "d['totales']['km_antes']==d['totales']['km_despues']")" "True"

echo "== E. Lo que ven chofer / dirección / finanzas =="
MR=$(curl -s "$API/registros/mias/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z" -H "$H1")
MD=$(curl -s "$API/registros/mias/mes-detalle?anio=2026&mes=9" -H "$H1")
SUMA=$(echo "$MD" | J "float(round(sum(i['km'] for i in d['items']),1))"); TOT=$(echo "$MR" | J "float(d['km'])")
check "E1 Mi Resumen km = suma del detalle del mes" "$TOT" "$SUMA"
check "E2 km del mes = A + B + C(150)" "$TOT" "$(python3 -c "print(float($(SQL "select round(sum(total_km)::numeric,1) from recorridos where trabajador_id='fcf3f940-fd30-4b31-80af-4dd92d41d588' and estado='COMPLETADO'")))")"
HD=$(echo "$MD" | J "round(sum(i['oreDia']+i['oreNoche'] for i in d['items']),2)"); check "E3 horas detalle = resumen (±0.02)" "$(python3 -c "print(abs($HD-$(echo "$MR" | J "d['oreTotal']"))<=0.02)")" "True"
echo "     Mi Resumen: km=$TOT oreDia=$(echo "$MR" | J "d['oreDia']") oreNoche=$(echo "$MR" | J "d['oreNoche']") ganancia=$(echo "$MR" | J "d['gananciaTotal']")"
HM=$(curl -s "$API/registros/mias/historial-mensual?meses=2" -H "$H1"); check "E4 historial mensual sep = resumen" "$(echo "$HM" | J "[float(m['km']) for m in (d if isinstance(d,list) else d.get('meses',d.get('items',[]))) if m.get('mes')==9][0]")" "$TOT"
DIR=$(curl -s "$API/registros/direccion/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z" -H "$H1"); check "E5 ganancias dirección (G004) = resumen" "$(echo "$DIR" | J "[float(x['km']) for x in d['choferes'] if 'NATALIA' in x.get('nombre','')][0]")" "$TOT"
FIN=$(curl -s "$API/programacion/financiero?from=2026-09-01&to=2026-09-30T23:59:59Z&cliente=QA" -H "$H1"); check "E6 finanzas: 3 ops QA con costo>0" "$(echo "$FIN" | J "len([o for o in d['items'] if o['costo_chofer']>0])")" "3"
check "E7 finanzas costo total = ganancia Mi Resumen" "$(echo "$FIN" | J "float(d['resumen']['costo'])")" "$(echo "$MR" | J "float(d['gananciaTotal'])")"
echo; echo "RESULTADO: $PASS OK, $FAIL FAIL"
