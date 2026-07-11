#!/usr/bin/env bash
# Installs (idempotently) the nightly production database backup cron job.
#
# Runs `~/mihas/backup-db.sh` daily at 02:00 UTC, which dumps Postgres via
# `docker compose exec postgres pg_dump`, uploads the compressed custom-format
# dump to Cloudflare R2 (the `r2` aws-cli profile, configured separately —
# see `deploy/configure-r2-profile.sh`), and prunes remote dumps older than
# BACKUP_RETAIN_DAYS (default 14, set in ~/mihas/.env).
#
# Idempotent: running this script twice does not duplicate the crontab entry.
# Failure alerting: on non-zero exit, mails the operator via the box's local
# `mail` command if available, and always appends to a rotating log so a
# missed run is visible without needing email delivery to work.
#
# Usage (on the production box, from ~/mihas):
#   bash deploy/setup-backup-cron.sh
#
# Requirements addressed: R2.2, R2.3 (full-platform-remediation-2026-07)
set -euo pipefail

MIHAS_DIR="${MIHAS_DIR:-$HOME/mihas}"
LOG_FILE="${MIHAS_DIR}/backup-cron.log"
ALERT_EMAIL="${ERROR_ALERT_EMAIL:-}"

if [ ! -f "${MIHAS_DIR}/backup-db.sh" ]; then
  echo "ERROR: ${MIHAS_DIR}/backup-db.sh not found — deploy the repo's deploy/backup-db.sh first." >&2
  exit 1
fi

# The cron entry: run at 02:00 UTC, log output, and on failure append a
# clearly-flagged FAILURE line the operator (or a future log-watcher) can grep
# for, plus a best-effort local `mail` alert if the box has an MTA configured.
CRON_CMD="cd ${MIHAS_DIR} && bash backup-db.sh >> ${LOG_FILE} 2>&1 || { echo \"\$(date -u +%FT%TZ) BACKUP FAILURE\" >> ${LOG_FILE}; command -v mail >/dev/null 2>&1 && echo \"Nightly backup failed on \$(hostname) at \$(date -u +%FT%TZ). Check ${LOG_FILE}.\" | mail -s 'mihas backup FAILED' ${ALERT_EMAIL:-root} || true; }"
CRON_LINE="0 2 * * * ${CRON_CMD}"
MARKER="# mihas-nightly-backup"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "${MARKER}" > "${TMP_CRON}" || true
{
  cat "${TMP_CRON}"
  echo "${CRON_LINE} ${MARKER}"
} | crontab -
rm -f "${TMP_CRON}"

echo "Installed/updated nightly backup cron (02:00 UTC daily)."
echo "Log file: ${LOG_FILE}"
crontab -l | grep "${MARKER}"
