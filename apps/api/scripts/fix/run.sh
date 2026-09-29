#!/usr/bin/env bash
# Corre un script SQL de scripts/fix contra la BD de PRODUCCIÓN.
#   uso: bash apps/api/scripts/fix/run.sh peajes-recuperar-mancato-historico.sql
# Existe porque pegar el comando psql completo en el prompt se parte en dos
# líneas y `-f` se queda sin su argumento.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DIR/../../.env.prod.runtime"
SQL="$DIR/${1:?falta el nombre del .sql}"

[ -f "$SQL" ] || { echo "No existe: $SQL" >&2; exit 1; }

DB=$(grep '^DATABASE_URL' "$ENV_FILE" | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
[ -n "$DB" ] || { echo "No pude leer DATABASE_URL de $ENV_FILE" >&2; exit 1; }

echo "→ $(basename "$SQL") contra PRODUCCIÓN"
psql "$DB" -f "$SQL"
