#!/usr/bin/env python3
"""Asigna el ÚLTIMO build de TestFlight al grupo "Testers externos".

Por qué existe: `eas submit` sube el binario y Apple lo deja listo para testers
INTERNOS, pero NO lo agrega al grupo externo (los choferes). Sin este paso los
choferes se quedan en un build viejo y no reciben ni el build ni los OTA de su
runtime — pasó con los builds 26 y 30 (sept 2026). Correr SIEMPRE después de
`bash submit-ios.sh`. Apple igual revisa el build antes de liberarlo a externos.

Uso: python3 scripts/testflight-externos.py [numero_de_build]
Requiere: pyjwt + la ASC key en ~/Downloads (misma que usan build/submit-ios.sh).
"""
import sys, time, json, urllib.request, urllib.error
import jwt

KEY_ID = "FK786MY5V2"
ISSUER = "3d8fc6b5-d302-43c3-9ad8-9fca0a391af7"
KEY_PATH = "/Users/tradercode/Downloads/AuthKey_FK786MY5V2.p8"
APP_ID = "6796650368"                                   # Gamonal Driver en App Store Connect
GROUP_EXTERNOS = "09e7fa7d-e08b-4ece-800b-3c773301a9c1"  # grupo "Testers externos"
API = "https://api.appstoreconnect.apple.com/v1"

tok = jwt.encode({"iss": ISSUER, "iat": int(time.time()), "exp": int(time.time()) + 600, "aud": "appstoreconnect-v1"},
                 open(KEY_PATH).read(), algorithm="ES256", headers={"kid": KEY_ID})

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, (json.load(r) if r.status != 204 else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

# Build objetivo: el número pasado por argumento o el último subido.
if len(sys.argv) > 1:
    st, b = call("GET", f"/builds?filter[app]={APP_ID}&filter[version]={sys.argv[1]}&limit=1")
else:
    st, b = call("GET", f"/builds?filter[app]={APP_ID}&sort=-uploadedDate&limit=1")
if st != 200 or not b.get("data"):
    print("No encontré el build:", st, b); sys.exit(1)
build = b["data"][0]; bid = build["id"]; ver = build["attributes"]["version"]
print(f"Build {ver} ({build['attributes']['processingState']})")

st, res = call("POST", f"/betaGroups/{GROUP_EXTERNOS}/relationships/builds", {"data": [{"type": "builds", "id": bid}]})
print("Asignar a 'Testers externos' →", "OK" if st in (200, 204) else f"{st} {res}")

st, g = call("GET", f"/betaGroups/{GROUP_EXTERNOS}/builds?limit=5")
print("Builds en el grupo ahora:", [x["attributes"]["version"] for x in g.get("data", [])])
st, d = call("GET", f"/builds/{bid}/buildBetaDetail")
print("Estado externo:", d["data"]["attributes"].get("externalBuildState"),
      "(IN_BETA_REVIEW = Apple lo está revisando; IN_BETA_TESTING = ya les llegó)")
