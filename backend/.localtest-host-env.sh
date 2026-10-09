#!/usr/bin/env bash
# L1/L4 remediation batch (docs/v2-evidence/13.6/remediation/L1-L4/).
#
# Sources backend/.env.local.test (the ISOLATED throwaway local test stack — it
# never reads backend/.env, so the Neon DSN cannot leak in) and then rewrites the
# three docker-internal hostnames to their host-published equivalents, because
# pytest runs on the host, not inside the compose network:
#
#   postgres:5432 -> 127.0.0.1:5433     (mihas-localtest-postgres-1)
#   redis:6379    -> 127.0.0.1:6380     (mihas-localtest-redis-1)
#
# This is the same substitution 13.6 recorded as "DATABASE_URL=<localtest pg
# 5433> REDIS_URL=<local 6380>". No credential is echoed by this file.
#
# Temporary instrument: delete after the batch.
set -a
. "$(dirname "${BASH_SOURCE[0]}")/.env.local.test"
set +a
export DATABASE_URL="${DATABASE_URL/@postgres:5432/@127.0.0.1:5433}"
export REDIS_URL="${REDIS_URL/\/\/redis:6379/\/\/127.0.0.1:6380}"
export CELERY_BROKER_URL="${CELERY_BROKER_URL/\/\/redis:6379/\/\/127.0.0.1:6380}"
export CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND/\/\/redis:6379/\/\/127.0.0.1:6380}"
