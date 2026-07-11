#!/usr/bin/env bash
# Configures the `r2` aws-cli profile from the R2 credentials already present
# in ~/mihas/.env (S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT_URL — the same
# credentials the backend uses for document storage via django-storages).
#
# Idempotent — safe to re-run; skips sections that already exist. Never
# echoes secret values.
#
# NOTE on AWS CLI config syntax: the per-service nested block form
#   [profile r2]
#   s3 =
#       endpoint_url = ...
# is NOT reliably parsed by all aws-cli v2 versions when written with
# inconsistent indentation (a real failure mode hit during this rollout —
# `aws configure set` and manual heredocs produced mismatched indentation
# that broke the parser entirely with `'str' object has no attribute 'get'`).
# The flat top-level `endpoint_url = ...` under `[profile r2]` is supported by
# aws-cli >= 2.13 and applies to every service (s3, s3api) without needing
# per-service sub-blocks — use that form.
#
# Usage (on the production box, from ~/mihas):
#   bash deploy/configure-r2-profile.sh
#
# Requirements addressed: R2.1 (full-platform-remediation-2026-07)
set -euo pipefail

MIHAS_DIR="${MIHAS_DIR:-$HOME/mihas}"
cd "${MIHAS_DIR}"
set -a; source .env; set +a

: "${S3_ACCESS_KEY:?S3_ACCESS_KEY not set in .env}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY not set in .env}"
: "${S3_ENDPOINT_URL:?S3_ENDPOINT_URL not set in .env}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET not set in .env}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws-cli not found — installing..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq awscli
fi

mkdir -p ~/.aws
chmod 700 ~/.aws

if ! grep -q "^\[r2\]$" ~/.aws/credentials 2>/dev/null; then
  cat >> ~/.aws/credentials <<CREDS

[r2]
aws_access_key_id = ${S3_ACCESS_KEY}
aws_secret_access_key = ${S3_SECRET_KEY}
CREDS
  echo "credentials: added [r2] section"
else
  echo "credentials: [r2] section already present, leaving as-is"
fi

# Rewrite the r2 profile block cleanly every run (flat, no nested indentation
# to get wrong) rather than trying to patch it incrementally.
python3 - "$HOME/.aws/config" "$S3_ENDPOINT_URL" <<'PYEOF'
import re
import sys

config_path, endpoint_url = sys.argv[1], sys.argv[2]
try:
    with open(config_path) as f:
        content = f.read()
except FileNotFoundError:
    content = ""

# Strip any existing [profile r2] block (up to the next [section] or EOF).
content = re.sub(r"\n?\[profile r2\](?:\n(?!\[).*)*", "", content)
content = content.rstrip() + "\n\n[profile r2]\nregion = auto\noutput = json\nendpoint_url = " + endpoint_url + "\n"

with open(config_path, "w") as f:
    f.write(content)
PYEOF

chmod 600 ~/.aws/credentials ~/.aws/config

echo "Verifying r2 profile can list the backup bucket..."
if aws s3 ls --profile r2 "s3://${BACKUP_BUCKET}/" >/dev/null 2>&1; then
  echo "OK: r2 profile configured and s3://${BACKUP_BUCKET}/ is reachable."
else
  echo "Bucket not reachable yet — attempting to create it (aws s3 mb)..."
  aws s3 mb --profile r2 "s3://${BACKUP_BUCKET}"
  aws s3 ls --profile r2 "s3://${BACKUP_BUCKET}/" >/dev/null
  echo "OK: bucket created and reachable."
fi
