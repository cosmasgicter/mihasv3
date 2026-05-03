#!/usr/bin/env bash
set -euo pipefail

if [[ "${TESTING:-}" == "1" ]]; then
  echo "Refusing production-parity check with TESTING=1; use Redis/Postgres-backed settings."
  exit 1
fi

if [[ -z "${REDIS_URL:-}" ]]; then
  echo "REDIS_URL is required for production-parity checks."
  echo "Example: REDIS_URL=redis://localhost:6379/1 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mihas_local scripts/check-backend-production-parity.sh"
  exit 1
fi

cd "$(dirname "$0")/../backend"
python3 manage.py check
