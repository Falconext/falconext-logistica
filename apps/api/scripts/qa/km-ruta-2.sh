#!/bin/bash
# QA funcional ampliada (casos duros) — regla km/horas = ruta planeada.
API=http://localhost:3005/api; T=$(cat token.txt); CH=$(cat chofer.txt); H1="Authorization: Bearer $T"; HC="Authorization: Bearer $CH"; H2="Content-Type: application/json"; HS="Authorization: Bearer testsecret"
export PGPASSWORD=$(grep '^DATABASE_URL' /Users/tradercode/logistica/apps/api/.env | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')
SQL() { psql -h localhost -p 5439 -U logistica -d logistica -X -A -t -F'|' -c "$1"; }
J() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
PASS=0; FAIL=0
check() { if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "OK   $1 → $2"; else FAIL=$((FAIL+1)); echo "FAIL $1 → got [$2] esperado [$3]"; fi; }
RET="Via Walter Tobagi, 8, 20068 Bettola-Zeloforamagno MI"; ENT="Via Archimede 53, Milano"
G004=fcf3f940-fd30-4b31-80af-4dd92d41d588; G005=366a4f94-e15e-456f-80cd-5f8fe3f32389
mkop() { curl -s -X POST $API/programacion -H "$H1" -H "$H2" -d "$1" | J "d['id']"; }

echo "== F. Ida + retorno completo (Iniciar → Llegada → Regreso → Finalizar) =="
OP=$(mkop "{\"cliente\":\"QA F\",\"fecha\":\"2026-09-16T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}")
RID=$(curl -s -X POST $API/recorridos/iniciar -H "$H1" -H "$H2" -d "{\"programacionId\":\"$OP\"}" | J "d['id']")
curl -s -X POST $API/recorridos/$RID/llegada -H "$H1" >/dev/null; curl -s -X POST $API/recorridos/$RID/regreso -H "$H1" >/dev/null
F=$(curl -s -X POST $API/recorridos/$RID/finalizar -H "$H1")
check "F1 estado COMPLETADO + ruta" "$(echo "$F" | J "d['estado']+'|'+d['km_fuente']")" "COMPLETADO|ruta"
check "F2 total = esperado (bucle ida+vuelta ~20km)" "$(echo "$F" | J "d['total_km']==d['esperado_km'] and 15<d['total_km']<40")" "True"
check "F3 vuelta_min registrado (historial GPS intacto)" "$(echo "$F" | J "d['vuelta_min'] is not None and d['ida_min'] is not None")" "True"
check "F4 op ENTREGADO con km" "$(curl -s $API/programacion/$OP -H "$H1" | J "d['estado']+'|'+str(d['km']==$(echo "$F" | J "d['total_km']"))")" "ENTREGADO|True"

echo "== G. Finalizar directo desde EN_RUTA_IDA (sin Llegada) =="
OP=$(mkop "{\"cliente\":\"QA G\",\"fecha\":\"2026-09-16T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}")
RID=$(curl -s -X POST $API/recorridos/iniciar -H "$H1" -H "$H2" -d "{\"programacionId\":\"$OP\"}" | J "d['id']")
F=$(curl -s -X POST $API/recorridos/$RID/finalizar -H "$H1")
check "G1 cierra con ruta" "$(echo "$F" | J "d['estado']+'|'+d['km_fuente']+'|'+str(d['total_km']>0)")" "COMPLETADO|ruta|True"
F2=$(curl -s -X POST $API/recorridos/$RID/finalizar -H "$H1"); check "G2 finalizar dos veces → 400" "$(echo "$F2" | J "d.get('statusCode')")" "400"

echo "== H. Recorrido CANCELADO + supervisor marca entregada → auto =="
OP=$(mkop "{\"cliente\":\"QA H\",\"fecha\":\"2026-09-12T00:00:00.000Z\",\"hora_retiro\":\"22:00\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}")
RID=$(curl -s -X POST $API/recorridos/iniciar -H "$H1" -H "$H2" -d "{\"programacionId\":\"$OP\"}" | J "d['id']")
curl -s -X POST $API/recorridos/$RID/cancelar -H "$H1" >/dev/null
check "H1 op sigue no entregada tras cancelar" "$(curl -s $API/programacion/$OP -H "$H1" | J "d['estado']!='ENTREGADO'")" "True"
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"estado":"ENTREGADO"}' >/dev/null
check "H2 cancelado no cuenta → auto creado" "$(SQL "select string_agg(estado||':'||auto::text, ',' order by auto) from recorridos where programacion_id='$OP'")" "CANCELADO:false,COMPLETADO:true"
C=$(curl -s $API/programacion/$OP -H "$H1"); check "H3 22:00 Roma → todo noche" "$(echo "$C" | J "d['costo_chofer']['horas_dia']==0 and d['costo_chofer']['horas_noche']>0")" "True"
check "H4 estado_consegna sincronizado" "$(echo "$C" | J "d['estado_consegna']")" "CONSEGNATO"
# Cancelado "abierto" 12 días (cerrado tarde por supervisor): NO debe sumar horas ni km al mes.
RIDC=$(SQL "select id from recorridos where programacion_id='$OP' and estado='CANCELADO'")
SQL "update recorridos set retorno_en=iniciado_en, finalizado_en=iniciado_en + interval '12 days' where id='$RIDC'" >/dev/null
MRH=$(curl -s "$API/registros/mias/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z" -H "$H1"); check "H5 cancelado de 12 días no suma horas (oreTotal < 50)" "$(echo "$MRH" | J "d['oreTotal']<50")" "True"
MDH=$(curl -s "$API/registros/mias/mes-detalle?anio=2026&mes=9" -H "$H1"); check "H6 detalle del mes no lista el cancelado" "$(echo "$MDH" | J "len([i for i in d['items'] if i['cliente']=='QA H'])")" "1"

echo "== I. Multi-parada: retiros + destinos adicionales suman en el bucle =="
OP1=$(mkop "{\"cliente\":\"QA I1\",\"fecha\":\"2026-09-13T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado_consegna\":\"CONSEGNATO\"}")
OP2=$(mkop "{\"cliente\":\"QA I2\",\"fecha\":\"2026-09-13T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"retiros\":[\"Malpensa Airport\"],\"lugar_entrega\":\"$ENT\",\"destinos\":[\"Piazza Duomo, Milano\"],\"trabajador_id\":\"G004\",\"estado_consegna\":\"CONSEGNATO\"}")
K1=$(SQL "select total_km from recorridos where programacion_id='$OP1'"); K2=$(SQL "select total_km from recorridos where programacion_id='$OP2'")
check "I1 con Malpensa+Duomo > simple (${K1} vs ${K2})" "$(python3 -c "print($K2 > $K1 + 80)")" "True"

echo "== J. Direcciones no ruteables =="
OP=$(mkop "{\"cliente\":\"QA J\",\"fecha\":\"2026-09-14T00:00:00.000Z\",\"lugar_retiro\":\"xxqqzz\",\"lugar_entrega\":\"zzzqqx\",\"trabajador_id\":\"G004\",\"estado_consegna\":\"CONSEGNATO\"}")
check "J1 sin estimado → no crea auto (no inventa km)" "$(SQL "select count(*) from recorridos where programacion_id='$OP'")" "0"
DR=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HS" -H "$H2" -d '{"desde":"2026-09-14","hasta":"2026-09-14"}')
check "J2 reproceso lo lista con motivo" "$(echo "$DR" | J "[a['motivo'] for a in d['consegnas_sin_recorrido'] if a['programacion_id']=='$OP'][0]")" "sin estimado de ruta (direcciones)"
OPJ2=$(mkop "{\"cliente\":\"QA J2\",\"fecha\":\"2026-09-16T00:00:00.000Z\",\"lugar_retiro\":\"xxqqzz\",\"lugar_entrega\":\"zzzqqx\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}")
RID=$(curl -s -X POST $API/recorridos/iniciar -H "$H1" -H "$H2" -d "{\"programacionId\":\"$OPJ2\"}" | J "d['id']")
F=$(curl -s -X POST $API/recorridos/$RID/finalizar -H "$H1")
check "J3 finalizar sin estimado ni device → gps 0 km, no revienta" "$(echo "$F" | J "d['estado']+'|'+d['km_fuente']+'|'+str(d['total_km'])")" "COMPLETADO|gps|0"

echo "== K. Sin chofer / chofer inexistente =="
OP=$(mkop "{\"cliente\":\"QA K1\",\"fecha\":\"2026-09-14T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"estado_consegna\":\"CONSEGNATO\"}")
check "K1 sin trabajador → no auto" "$(SQL "select count(*) from recorridos where programacion_id='$OP'")" "0"
OP=$(mkop "{\"cliente\":\"QA K2\",\"fecha\":\"2026-09-14T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G999\",\"estado_consegna\":\"CONSEGNATO\"}")
check "K2 código inexistente → no auto" "$(SQL "select count(*) from recorridos where programacion_id='$OP'")" "0"

echo "== L. Chofer real (solo_propios): no puede 'corregir' km; su consegnato crea auto a SU nombre =="
OP=$(mkop "{\"cliente\":\"QA L\",\"fecha\":\"2026-09-15T00:00:00.000Z\",\"hora_retiro\":\"10:00\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G005\",\"estado\":\"PENDIENTE\"}")
R=$(curl -s -X PATCH $API/programacion/$OP -H "$HC" -H "$H2" -d '{"estado_consegna":"CONSEGNATO"}')
check "L1 chofer marca consegnato → ENTREGADO" "$(echo "$R" | J "d.get('estado')")" "ENTREGADO"
check "L2 auto a nombre de G005" "$(SQL "select auto::text||'|'||trabajador_id from recorridos where programacion_id='$OP'")" "true|$G005"
KM0=$(SQL "select total_km from recorridos where programacion_id='$OP'")
curl -s -X PATCH $API/programacion/$OP -H "$HC" -H "$H2" -d '{"km":999}' >/dev/null
check "L3 PATCH km del chofer NO marca manual" "$(SQL "select km_fuente||'|'||total_km from recorridos where programacion_id='$OP'")" "ruta|$KM0"
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"km":77}' >/dev/null
check "L4 PATCH km del supervisor SÍ" "$(SQL "select km_fuente||'|'||total_km from recorridos where programacion_id='$OP'")" "manual|77"
MR=$(curl -s "$API/registros/mias/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z" -H "$HC"); check "L5 Mi Resumen del chofer G005 = 77 km" "$(echo "$MR" | J "float(d['km'])")" "77.0"
check "L6 chofer no puede reprocesar (401 sin secret)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HC" -H "$H2" -d '{"desde":"2026-09-01"}')" "401"

echo "== M. Reproceso: recorrido viejo 'gps' pasa a ruta; sin esperado se recalcula; filtros =="
OP=$(mkop "{\"cliente\":\"QA M\",\"fecha\":\"2026-09-05T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"estado\":\"ENTREGADO\"}")
RID=$(SQL "select id from recorridos where programacion_id='$OP'")
# simular recorrido viejo GPS: sin km_fuente, sin esperado, total 23.8 (caso Moisés)
SQL "update recorridos set km_fuente=null, auto=false, esperado_km=null, esperado_min=null, total_km=23.8, total_min=95, manejo_min=80, finalizado_en='2026-09-05 15:00:00' where id='$RID'" >/dev/null
DR=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HS" -H "$H2" -d '{"desde":"2026-09-05","hasta":"2026-09-05"}')
check "M1 dry-run: 23.8 → ruta recalculada" "$(echo "$DR" | J "[(f['km_antes'], f['km_despues']>15, f['accion']) for f in d['detalle'] if f['recorrido_id']=='$RID'][0]")" "(23.8, True, 'ruta (estimado recalculado)')"
check "M2 dry-run no escribe" "$(SQL "select coalesce(km_fuente,'null')||'|'||total_km from recorridos where id='$RID'")" "null|23.8"
DR=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HS" -H "$H2" -d '{"desde":"2026-09-05","hasta":"2026-09-05","tenantId":"otro-tenant","aplicar":true}')
check "M3 tenantId ajeno → 0 recorridos, no toca" "$(echo "$DR" | J "d['totales']['recorridos']")|$(SQL "select total_km from recorridos where id='$RID'")" "0|23.8"
DR=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HS" -H "$H2" -d '{"desde":"2026-09-06","hasta":"2026-09-30","aplicar":true}')
check "M4 fuera de rango → no toca" "$(SQL "select total_km from recorridos where id='$RID'")" "23.8"
DR=$(curl -s -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HS" -H "$H2" -d '{"desde":"2026-09-05","hasta":"2026-09-05","aplicar":true}')
check "M5 aplicar → ruta, esperado guardado, op.km actualizado" "$(SQL "select r.km_fuente||'|'||(r.total_km=r.esperado_km)::text||'|'||(p.km=r.total_km)::text||'|'||(r.total_min=r.esperado_min)::text from recorridos r join programacion p on p.id=r.programacion_id where r.id='$RID'")" "ruta|true|true|true"
check "M6 por_chofer: antes 23.8, después = ruta" "$(echo "$DR" | J "[(c['km_antes'], c['km_despues']==round(c['km_antes']+c['diferencia'],1)) for c in d['por_chofer'] if 'NATALIA' in c['trabajador']][0]")" "(23.8, True)"
check "M7 rango inválido → 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/recorridos-admin/reprocesar-km-ruta -H "$HS" -H "$H2" -d '{"desde":"no-fecha"}')" "401"

echo "== N. Reperibilità / attesa siguen sumando aparte =="
OP=$(mkop "{\"cliente\":\"QA N\",\"fecha\":\"2026-09-15T00:00:00.000Z\",\"hora_retiro\":\"09:00\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"$ENT\",\"trabajador_id\":\"G004\",\"reperibilita\":true,\"estado_consegna\":\"CONSEGNATO\"}")
C=$(curl -s $API/programacion/$OP -H "$H1"); check "N1 costo = horas + reperibilità 10" "$(echo "$C" | J "round(d['costo_chofer']['total']-d['costo_chofer']['pago_horas'],2)")" "10"

echo "== Q. Ruta implausible (typo de dirección) y re-estimación al corregir la dirección =="
OP=$(mkop "{\"cliente\":\"QA Q1\",\"fecha\":\"2026-09-17T00:00:00.000Z\",\"hora_retiro\":\"09:00\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"Lisboa, Portugal\",\"trabajador_id\":\"G004\",\"estado_consegna\":\"CONSEGNATO\"}")
check "Q1 ruta > 2 500 km se descarta → sin auto (no inventa 3 800 km)" "$(SQL "select count(*) from recorridos where programacion_id='$OP'")" "0"
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d "{\"lugar_entrega\":\"$ENT\"}" >/dev/null
check "Q2 corregida la dirección → auto creado con ruta corta" "$(SQL "select count(*)||'|'||km_fuente||'|'||(total_km<60)::text from recorridos where programacion_id='$OP' group by km_fuente, total_km")" "1|ruta|true"
KQ=$(SQL "select total_km from recorridos where programacion_id='$OP'")
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"destinos":["Malpensa Airport"]}' >/dev/null
check "Q3 agregar destino Malpensa re-estima (km sube > 80)" "$(SQL "select (total_km > $KQ + 80)::text||'|'||km_fuente||'|'||(select (km = (select total_km from recorridos where programacion_id='$OP'))::text from programacion where id='$OP') from recorridos where programacion_id='$OP'")" "true|ruta|true"
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"km":99}' >/dev/null
curl -s -X PATCH $API/programacion/$OP -H "$H1" -H "$H2" -d '{"destinos":[]}' >/dev/null
check "Q4 con km manual, cambiar dirección NO lo pisa" "$(SQL "select km_fuente||'|'||total_km from recorridos where programacion_id='$OP'")" "manual|99"
OPQ=$(mkop "{\"cliente\":\"QA Q5\",\"fecha\":\"2026-09-17T00:00:00.000Z\",\"lugar_retiro\":\"$RET\",\"lugar_entrega\":\"Lisboa, Portugal\",\"trabajador_id\":\"G004\",\"estado\":\"PENDIENTE\"}")
RID=$(curl -s -X POST $API/recorridos/iniciar -H "$H1" -H "$H2" -d "{\"programacionId\":\"$OPQ\"}" | J "d['id']")
F=$(curl -s -X POST $API/recorridos/$RID/finalizar -H "$H1")
check "Q5 Mi Ruta con destino implausible → cierra en gps 0 (no 3 800 km)" "$(echo "$F" | J "d['km_fuente']+'|'+str(d['total_km'])")" "gps|0"

echo "== O. Consistencia global G004 tras todo =="
MR=$(curl -s "$API/registros/mias/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z" -H "$H1"); MD=$(curl -s "$API/registros/mias/mes-detalle?anio=2026&mes=9" -H "$H1")
check "O1 resumen = detalle (km)" "$(echo "$MR" | J "float(d['km'])")" "$(echo "$MD" | J "float(round(sum(i['km'] for i in d['items']),1))")"
check "O2 resumen = BD (km)" "$(echo "$MR" | J "float(d['km'])")" "$(python3 -c "print(float($(SQL "select round(sum(total_km)::numeric,1) from recorridos where trabajador_id='$G004' and estado='COMPLETADO' and finalizado_en between '2026-09-01' and '2026-09-30 23:59:59'")))")"
DIR=$(curl -s "$API/registros/direccion/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z" -H "$H1")
check "O3 dirección G004 = resumen (€)" "$(echo "$DIR" | J "[float(x['gananciaTotal']) for x in d['choferes'] if 'NATALIA' in x['nombre']][0]")" "$(echo "$MR" | J "float(d['gananciaTotal'])")"
FIN=$(curl -s "$API/programacion/financiero?from=2026-09-01&to=2026-09-30T23:59:59Z&trabajadorId=G004" -H "$H1")
check "O4 finanzas G004 costo = resumen (€, sin gastos)" "$(echo "$FIN" | J "float(d['resumen']['costo'])")" "$(echo "$MR" | J "float(d['gananciaTotal'])")"
echo; echo "RESULTADO2: $PASS OK, $FAIL FAIL"
