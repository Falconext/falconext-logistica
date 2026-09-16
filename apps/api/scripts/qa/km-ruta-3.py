#!/usr/bin/env python3
"""QA funcional #3 — casuísticas variadas con parámetros ALEATORIOS por corrida.
Uso: python3 qa3.py <seed>. Requiere API local (CRON_SECRET=testsecret), token.txt (admin
vinculado a G004) y chofer.txt (rol Autista vinculado a G005)."""
import json, random, subprocess, sys, urllib.request, urllib.error, re, concurrent.futures
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
random.seed(SEED)
API = 'http://localhost:3005/api'
T = open('token.txt').read().strip(); CH = open('chofer.txt').read().strip()
G004 = 'fcf3f940-fd30-4b31-80af-4dd92d41d588'; G005 = '366a4f94-e15e-456f-80cd-5f8fe3f32389'
ROME = ZoneInfo('Europe/Rome')
PGPASS = re.search(r'://[^:]+:([^@]+)@', open('/Users/tradercode/logistica/apps/api/.env').read()).group(1)
PASS = FAIL = 0

def sql(q):
    r = subprocess.run(['psql', '-h', 'localhost', '-p', '5439', '-U', 'logistica', '-d', 'logistica', '-X', '-A', '-t', '-F|', '-c', q],
                       env={'PGPASSWORD': PGPASS, 'PATH': '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin'}, capture_output=True, text=True)
    return r.stdout.strip()

def api(method, path, body=None, token=T, raw=False):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            txt = r.read().decode(); return (r.status, txt) if raw else json.loads(txt or 'null')
    except urllib.error.HTTPError as e:
        txt = e.read().decode(); return (e.code, txt) if raw else json.loads(txt or 'null')

def check(name, got, exp):
    global PASS, FAIL
    ok = got == exp
    PASS += ok; FAIL += (not ok)
    print(('OK   ' if ok else 'FAIL ') + name + f' → {got}' + ('' if ok else f'   esperado {exp}'))

def approx(a, b, tol): return abs(float(a) - float(b)) <= tol

ADDR = ['Via Walter Tobagi, 8, 20068 Bettola-Zeloforamagno MI', 'Via Archimede 53, Milano', 'Piazza Duomo, Milano',
        'Malpensa Airport', 'Via Torino 10, Monza', 'Corso Italia 5, Rho', 'Viale Europa 20, Sesto San Giovanni']
def route():
    a, b = random.sample(ADDR, 2); d = {'lugar_retiro': a, 'lugar_entrega': b}
    if random.random() < 0.4: d['retiros'] = [random.choice([x for x in ADDR if x not in (a, b)])]
    if random.random() < 0.4: d['destinos'] = [random.choice([x for x in ADDR if x not in (a, b)])]
    return d

def dia_noche_esperado(inicio_utc: datetime, minutos: int, corte=19):
    d = n = 0
    for i in range(int(minutos)):
        h = (inicio_utc + timedelta(minutes=i)).astimezone(ROME).hour
        if 6 <= h < corte: d += 1
        else: n += 1
    return round(d / 60, 2), round(n / 60, 2)

def mkop(extra, cliente):
    body = {'cliente': cliente, 'trabajador_id': 'G004', **extra}
    r = api('POST', '/programacion', body); assert r and r.get('id'), r; return r

def resumen(tok=T): return api('GET', '/registros/mias/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z', token=tok)

print(f'===== qa3 seed={SEED} =====')
# ---------- P1: autos aleatorios, split día/noche verificado independientemente ----------
print('== P1. 6 consegnas entregadas sin Iniciar, hora/fecha/ruta aleatorias ==')
esperado_km = 0; esperado_d = 0; esperado_n = 0
for i in range(6):
    dia = random.randint(1, 28); hh = random.randint(0, 23); mm = random.choice([0, 15, 30, 45])
    op = mkop({'fecha': f'2026-09-{dia:02d}T00:00:00.000Z', 'hora_retiro': f'{hh:02d}:{mm:02d}', 'estado_consegna': 'CONSEGNATO', **route()}, f'QA P1-{i}')
    row = sql(f"select auto, km_fuente, iniciado_en, total_km, total_min, esperado_km from recorridos where programacion_id='{op['id']}'")
    if not row: check(f'P1.{i} auto creado ({op["lugar_retiro"][:18]}→{op["lugar_entrega"][:18]})', 'NO', 'sí'); continue
    auto, fuente, ini, tkm, tmin, ekm = row.split('|')
    ini_utc = datetime.fromisoformat(ini).replace(tzinfo=timezone.utc)
    exp_local = datetime(2026, 9, dia, hh, mm, tzinfo=ROME)
    check(f'P1.{i} inicio = fecha+hora_retiro Roma ({hh:02d}:{mm:02d})', ini_utc == exp_local.astimezone(timezone.utc), True)
    check(f'P1.{i} ruta, km={tkm}=esperado, min={tmin}', (auto, fuente, tkm == ekm, float(tkm) > 0, int(float(tmin)) > 0), ('t', 'ruta', True, True, True))
    d, n = dia_noche_esperado(ini_utc, int(float(tmin)))
    c = api('GET', f'/programacion/{op["id"]}')['costo_chofer']
    check(f'P1.{i} horas día/noche desde Iniciar = cálculo independiente ({d}/{n})', approx(c['horas_dia'], d, 0.02) and approx(c['horas_noche'], n, 0.02), True)
    esperado_km += float(tkm); esperado_d += d; esperado_n += n
r = resumen()
check('P1 Mi Resumen km = suma', approx(r['km'], esperado_km, 0.11), True)
check('P1 Mi Resumen horas = suma independiente', approx(r['oreDia'], esperado_d, 0.06) and approx(r['oreNoche'], esperado_n, 0.06), True)

# ---------- P2: bordes de mes ----------
print('== P2. Bordes de mes (31/08 23:30 fuera, 30/09 23:30 dentro) ==')
km_antes = float(r['km'])
opA = mkop({'fecha': '2026-08-31T00:00:00.000Z', 'hora_retiro': '23:30', 'estado_consegna': 'CONSEGNATO', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P2-ago')
opS = mkop({'fecha': '2026-09-30T00:00:00.000Z', 'hora_retiro': '23:30', 'estado_consegna': 'CONSEGNATO', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P2-sep')
kmS = float(sql(f"select total_km from recorridos where programacion_id='{opS['id']}'"))
r = resumen()
check('P2 septiembre suma solo la del 30/09', approx(r['km'], km_antes + kmS, 0.11), True)
hm = api('GET', '/registros/mias/historial-mensual?meses=3'); meses = hm if isinstance(hm, list) else hm.get('meses', hm.get('items'))
ago = [m for m in meses if m.get('mes') == 8 and m.get('anio') == 2026]
check('P2 historial mensual: agosto tiene la del 31/08', bool(ago) and float(ago[0]['km']) >= float(sql(f"select total_km from recorridos where programacion_id='{opA['id']}'")), True)

# ---------- P3: km escrito a mano ANTES de entregar ----------
print('== P3. Supervisor ya había escrito km/tiempo a mano → manda el manual ==')
kmM = random.randint(50, 200); minM = random.randint(60, 180)
op = mkop({'fecha': '2026-09-20T00:00:00.000Z', 'hora_retiro': '08:00', 'km': kmM, 'tiempo_min': minM, 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[2]}, 'QA P3')
api('PATCH', f'/programacion/{op["id"]}', {'estado_consegna': 'CONSEGNATO'})
check('P3 recorrido manual con los valores del supervisor', sql(f"select km_fuente||'|'||total_km||'|'||total_min from recorridos where programacion_id='{op['id']}'"), f'manual|{kmM}|{minM}')
d = api('GET', f'/programacion/{op["id"]}'); check('P3 op muestra manual y mismo km', (d['km_fuente'], float(d['km'])), ('manual', float(kmM)))
check('P3 horas = tiempo manual desde 08:00', approx(d['costo_chofer']['horas_dia'], round(minM / 60, 2), 0.02), True)

# ---------- P4: reasignar chofer de una entregada ----------
print('== P4. Reasignar chofer (G004 → G005) de una consegna ya entregada ==')
op = mkop({'fecha': '2026-09-21T00:00:00.000Z', 'hora_retiro': '10:00', 'estado_consegna': 'CONSEGNATO', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P4')
kmP4 = float(sql(f"select total_km from recorridos where programacion_id='{op['id']}'"))
r4 = float(resumen()['km']); r5 = float(resumen(CH)['km'])
api('PATCH', f'/programacion/{op["id"]}', {'trabajador_id': 'G005'})
check('P4 auto pasa a G005 (uno solo)', sql(f"select count(*)||'|'||min(trabajador_id) from recorridos where programacion_id='{op['id']}'"), f'1|{G005}')
check('P4 G004 baja y G005 sube exactamente ese km', approx(float(resumen()['km']), r4 - kmP4, 0.11) and approx(float(resumen(CH)['km']), r5 + kmP4, 0.11), True)

# ---------- P5: des-entregar y volver a entregar ----------
print('== P5. Quitar la entrega (vuelve a PENDIENTE) borra el auto; re-entregar lo recrea ==')
op = mkop({'fecha': '2026-09-22T00:00:00.000Z', 'hora_retiro': '11:00', 'estado_consegna': 'CONSEGNATO', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P5')
api('PATCH', f'/programacion/{op["id"]}', {'estado': 'PENDIENTE', 'estado_consegna': 'DA_CONSEGNARE'})
check('P5 auto borrado al des-entregar', sql(f"select count(*) from recorridos where programacion_id='{op['id']}'"), '0')
api('PATCH', f'/programacion/{op["id"]}', {'estado': 'ENTREGADO'})
check('P5 recreado al re-entregar', sql(f"select count(*)||'|'||bool_and(auto) from recorridos where programacion_id='{op['id']}'"), '1|true')

# ---------- P6: borrar la operación ----------
print('== P6. Borrar la operación borra su auto ==')
op = mkop({'fecha': '2026-09-23T00:00:00.000Z', 'estado_consegna': 'CONSEGNATO', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P6')
check('P6 existe auto', sql(f"select count(*) from recorridos where programacion_id='{op['id']}'"), '1')
api('DELETE', f'/programacion/{op["id"]}')
check('P6 auto borrado con la op', sql(f"select count(*) from recorridos where programacion_id='{op['id']}'"), '0')

# ---------- P7: attesa autorizada ----------
print('== P7. Attesa autorizada (≥1 h) suma en resumen y finanzas ==')
h = random.choice([1, 2, 3])
op = mkop({'fecha': '2026-09-24T00:00:00.000Z', 'hora_retiro': '09:00', 'attesa_horas': h, 'estado_consegna': 'CONSEGNATO', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P7')
a0 = float(resumen()['attesaHoras'])
api('PATCH', f'/programacion/{op["id"]}/attesa-autorizacion', {'estado': 'AUTORIZADO'})
r = resumen(); check(f'P7 resumen attesaHoras +{h}', approx(r['attesaHoras'], a0 + h, 0.01), True)
d = api('GET', f'/programacion/{op["id"]}'); check('P7 costo op incluye attesa', (d['costo_chofer']['attesa_autorizada'], d['costo_chofer']['pago_attesa']), (True, 10 * h))

# ---------- P8: concurrencia ----------
print('== P8. 6 PATCH consegnato simultáneos → un solo auto ==')
op = mkop({'fecha': '2026-09-25T00:00:00.000Z', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1]}, 'QA P8')
with concurrent.futures.ThreadPoolExecutor(6) as ex:
    list(ex.map(lambda _: api('PATCH', f'/programacion/{op["id"]}', {'estado_consegna': 'CONSEGNATO'}), range(6)))
check('P8 exactamente 1 recorrido', sql(f"select count(*) from recorridos where programacion_id='{op['id']}'"), '1')

# ---------- P10: flujo real con paradas (Mi Ruta) ----------
print('== P10. Mi Ruta con paradas: Iniciar → llegada a parada (entregado) → Finalizar ==')
op = mkop({'fecha': '2026-09-16T00:00:00.000Z', 'lugar_retiro': ADDR[0], 'lugar_entrega': ADDR[1], 'destinos': [ADDR[2]], 'estado': 'PENDIENTE'}, 'QA P10')
rec = api('POST', '/recorridos/iniciar', {'programacionId': op['id']})
paradas = sql(f"select id from recorrido_paradas where recorrido_id='{rec['id']}' and coalesce(es_retorno,false)=false order by orden").split('\n')
for pid in paradas:
    if pid: api('POST', f'/recorridos/{rec["id"]}/paradas/{pid}/llegada', {'entregado': True})
f = api('POST', f'/recorridos/{rec["id"]}/finalizar')
check('P10 cierra con ruta (bucle con Duomo)', (f['estado'], f['km_fuente'], f['total_km'] == f['esperado_km'], float(f['total_km']) > 10), ('COMPLETADO', 'ruta', True, True))
check('P10 op entregada, km igual, sin auto duplicado', sql(f"select count(*)||'|'||bool_or(auto)||'|'||(select estado from programacion where id='{op['id']}') from recorridos where programacion_id='{op['id']}'"), '1|false|ENTREGADO')

# ---------- P9/P11: reproceso por semanas vs mes, y rango invertido ----------
print('== P9. Reproceso por semanas = mes completo; idempotente; P11 rango invertido ==')
sem = [('2026-09-01', '2026-09-07'), ('2026-09-08', '2026-09-15'), ('2026-09-16', '2026-09-23'), ('2026-09-24', '2026-09-30')]
def repro(desde, hasta, aplicar=False):
    req = urllib.request.Request(API + '/recorridos-admin/reprocesar-km-ruta', method='POST', data=json.dumps({'desde': desde, 'hasta': hasta, 'aplicar': aplicar}).encode(),
                                 headers={'Authorization': 'Bearer testsecret', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r: return json.loads(r.read().decode())
mes = repro('2026-09-01', '2026-09-30')
partes = [repro(a, b) for a, b in sem]
check('P9 recorridos: suma semanas = mes', sum(p['totales']['recorridos'] for p in partes), mes['totales']['recorridos'])
check('P9 km_despues: suma semanas = mes', approx(sum(p['totales']['km_despues'] for p in partes), mes['totales']['km_despues'], 0.11), True)
before = sql("select string_agg(id||':'||km_fuente||':'||total_km, ',' order by id) from recorridos where estado='COMPLETADO' and finalizado_en between '2026-09-01' and '2026-09-30 23:59:59'")
for a, b in sem: repro(a, b, True)
after = sql("select string_agg(id||':'||km_fuente||':'||total_km, ',' order by id) from recorridos where estado='COMPLETADO' and finalizado_en between '2026-09-01' and '2026-09-30 23:59:59'")
check('P9 aplicar por semanas no cambia nada (todo ya era ruta/manual)', before == after, True)
m2 = repro('2026-09-01', '2026-09-30', True); check('P9 mes completo después: km_antes = km_despues', approx(m2['totales']['km_antes'], m2['totales']['km_despues'], 0.01), True)
check('P11 rango invertido → 0', repro('2026-09-30', '2026-09-01')['totales']['recorridos'], 0)

# ---------- P12: consistencia global para ambos choferes ----------
print('== P12. Consistencia global G004 y G005 ==')
for nombre, tok, uid in [('G004', T, G004), ('G005', CH, G005)]:
    r = resumen(tok); md = api('GET', '/registros/mias/mes-detalle?anio=2026&mes=9', token=tok)
    check(f'P12 {nombre} resumen km = detalle', approx(r['km'], sum(i['km'] for i in md['items']), 0.11), True)
    check(f'P12 {nombre} resumen horas = detalle', approx(r['oreTotal'], sum(i['oreDia'] + i['oreNoche'] for i in md['items']), 0.06), True)
    check(f'P12 {nombre} resumen km = BD', approx(r['km'], float(sql(f"select coalesce(sum(total_km),0) from recorridos where trabajador_id='{uid}' and estado='COMPLETADO' and finalizado_en between '2026-09-01' and '2026-09-30 23:59:59'")), 0.11), True)
dirr = api('GET', '/registros/direccion/resumen?from=2026-09-01&to=2026-09-30T23:59:59Z')
g4 = [c for c in dirr['choferes'] if 'NATALIA' in c['nombre']][0]; check('P12 dirección G004 € = resumen', approx(g4['gananciaTotal'], resumen()['gananciaTotal'], 0.01), True)
fin = api('GET', '/programacion/financiero?from=2026-09-01&to=2026-09-30T23:59:59Z&trabajadorId=G004')
# financiero filtra por fecha de la OP (no por finalizado_en) y sin attesa<1h: comparamos costo por op contra el detalle
fin_total = sum(o['costo_chofer'] for o in fin['items'])
rg = resumen()['gananciaTotal']
check(f'P12 finanzas G004 costo total = resumen € ({round(fin_total,2)} vs {rg}, ±0.005/op)', approx(fin_total, rg, 0.005 * max(1, len(fin['items']))), True)
print(f'\nRESULTADO3 seed={SEED}: {PASS} OK, {FAIL} FAIL')
