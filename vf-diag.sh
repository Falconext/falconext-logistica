#!/usr/bin/env bash
# Valida la conexión Velocity Fleet a través de TU API en Vercel (egress limpio,
# aunque tu Mac tenga el firewall que bloquea velocityfleet.com directo).
set -u

# Dominio base de tu API en Vercel (SIN /api). Cambia si tu dominio real es otro.
API_HOST="https://falconext-logistica-api.vercel.app"
# Debe coincidir con la env var CRON_SECRET que pusiste en Vercel.
CRON_SECRET="932e3f920367be0653939146f122231221dd94ccf038c5183e20fb177d4c3449"

URL="$API_HOST/api/gps/velocity/diag"
echo "==> GET $URL"
code=$(curl -s -o /tmp/vf_diag.json -w "%{http_code}" -H "Authorization: Bearer $CRON_SECRET" --max-time 40 "$URL")
echo "HTTP $code"
echo "---- respuesta ----"
head -c 2000 /tmp/vf_diag.json
echo
echo "-------------------"
echo "viaJwt.ok:true + placas  => token válido, canje JWT ok, posiciones llegan. ✅"
echo "'Web Page Blocked'/403 => WAF de Velocity bloquea la IP de Vercel (pedir whitelist a Radius)."
echo "401 / error de config  => revisar env vars en Vercel."
