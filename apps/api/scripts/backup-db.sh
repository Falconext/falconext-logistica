#!/bin/bash
# Respaldo diario de la BD Postgres (piloto en Docker `logistica-pg`).
# Genera un dump comprimido con timestamp y conserva los últimos 14.
# Uso manual:  bash apps/api/scripts/backup-db.sh
# Programado:  vía crontab (ver README de despliegue).
set -euo pipefail

DOCKER=/usr/local/bin/docker
[ -x "$DOCKER" ] || DOCKER=$(command -v docker)

CONTAINER=logistica-pg
DB=logistica
USER=logistica
DEST="$(cd "$(dirname "$0")/.." && pwd)/prisma/backups"
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$DEST/pg_${STAMP}.sql.gz"

mkdir -p "$DEST"
"$DOCKER" exec "$CONTAINER" pg_dump -U "$USER" "$DB" | gzip > "$OUT"
echo "[$(date)] Respaldo creado: $OUT ($(du -h "$OUT" | cut -f1))"

# Conservar solo los últimos 14 dumps pg_*.sql.gz
ls -1t "$DEST"/pg_*.sql.gz 2>/dev/null | tail -n +15 | xargs -I {} rm -f {} || true
