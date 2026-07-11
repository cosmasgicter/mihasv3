#!/usr/bin/env bash
# Installs (idempotently) a weekly Docker image-pruning cron job.
#
# Runs `docker image prune -a -f --filter "until=72h"` every Sunday at 03:00
# UTC — removes any image not referenced by a running container and older
# than 72 hours. This never touches the currently-running images (backend,
# frontend, postgres, redis, alloy), only stale tagged/untagged layers left
# behind by prior deploys.
#
# Real incident this addresses: unpruned images accumulated to 9.1GB
# reclaimable (79% of image storage) and pushed root disk usage to 89% —
# above the 85% deploy-gate threshold in disk_gate.sh, which would have
# blocked the next deploy entirely.
#
# Idempotent: running this script twice does not duplicate the crontab entry.
#
# Usage (on the production box):
#   bash deploy/setup-image-prune-cron.sh
#
# Requirements addressed: R3.1 (full-platform-remediation-2026-07)
set -euo pipefail

LOG_FILE="${HOME}/mihas/image-prune-cron.log"
CRON_CMD="docker image prune -a -f --filter 'until=72h' >> ${LOG_FILE} 2>&1"
CRON_LINE="0 3 * * 0 ${CRON_CMD}"
MARKER="# mihas-weekly-image-prune"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "${MARKER}" > "${TMP_CRON}" || true
{
  cat "${TMP_CRON}"
  echo "${CRON_LINE} ${MARKER}"
} | crontab -
rm -f "${TMP_CRON}"

echo "Installed/updated weekly image-prune cron (Sundays 03:00 UTC)."
echo "Log file: ${LOG_FILE}"
crontab -l | grep "${MARKER}"
