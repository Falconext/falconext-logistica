#!/bin/bash
# Publica un update OTA (cambios de JavaScript) a los testers de producción,
# SIN rebuild ni TestFlight ni revisión de Apple. Les llega al reabrir la app.
# Uso: bash ota-update.sh "descripción del cambio"
set -e
cd /Users/tradercode/logistica/apps/logistica-app

MSG="${1:-Actualización}"
echo "Publicando update OTA al canal 'production': \"$MSG\""
echo ""
npx eas-cli update --channel production --message "$MSG"
echo ""
echo "✅ Listo. Los testers reciben este cambio al reabrir la app (sin actualizar en TestFlight)."
