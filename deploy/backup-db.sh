#!/usr/bin/env bash
# Nightly Postgres backup → Cloudflare R2. Invoked by cron (see RUNBOOK §6).
# Runs from ~/mihas so it can read .env and reach the postgres container.
set -euo pipefail

cd "$(dirname "$0")"
set -a; source .env; set +a   # load POSTGRES_* + BACKUP_BUCKET

STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="mihas-${STAMP}.pgcustom"
BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET in .env, e.g. mihas-backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"

# Dump straight from the running container in compressed custom format.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump --no-owner --no-privileges --format=custom \
  -U "$POSTGRES_USER" "$POSTGRES_DB" > "/tmp/${FILE}"

# Ship to R2 (S3-compatible). The 'r2' profile holds the endpoint + keys.
aws s3 cp --profile r2 "/tmp/${FILE}" "s3://${BUCKET}/${FILE}"
rm -f "/tmp/${FILE}"

echo "$(date -u +%FT%TZ) backup ok: ${FILE}"

# Prune local nothing (we delete immediately); prune old remote dumps.
CUTOFF="$(date -u -d "${RETAIN_DAYS} days ago" +%Y%m%d)"
aws s3 ls --profile r2 "s3://${BUCKET}/" | awk '{print $4}' | while read -r key; do
  [ -z "$key" ] && continue
  d="$(echo "$key" | sed -nE 's/^mihas-([0-9]{8})-.*/\1/p')"
  if [ -n "$d" ] && [ "$d" -lt "$CUTOFF" ]; then
    aws s3 rm --profile r2 "s3://${BUCKET}/${key}"
    echo "$(date -u +%FT%TZ) pruned old backup: ${key}"
  fi
done
