# Operations & Reliability Verification — Health, Background Tasks, Idempotency, Logging, Backup/Restore, Rollback

**Spec:** `.kiro/specs/beanola-production-readiness/` — Tasks **19.1** and **19.3**, Component 9
**Requirements validated:** R9.1, R9.2, R9.3, R9.4, R9.8 (and R16.7 — no PII/secrets in logs)
**Date:** 2026 production-readiness pass
**Method:** Source verification against the real repo (`backend/`) plus the existing
health / idempotency / webhook-dedup / structured-logging test suites and `manage.py check`.
No production database change was made (R16.8 honoured — verification only).

---

## Summary

| Item | Requirement | Status |
|------|-------------|--------|
| `/health/live/` + `/health/ready/` report DB + Redis/Celery readiness | R9.1 | ✅ PASS |
| Background-task surfaces operational + monitored | R9.2 | ✅ PASS |
| Idempotent payment init / webhook / official-doc / email retry | R9.3 | ✅ PASS |
| Structured logs carry request/user/institution/payment/document IDs; no secrets/PII | R9.4 / R16.7 | ✅ PASS (with one documented gap) |
| `python3 manage.py check` passes | R9.8 | ✅ PASS |

No high-severity gaps. One **documented, non-blocking** gap: deeper per-event
structured-log tagging in the payment-service/webhook paths is a tracked Phase-3
follow-up (`test_payment_structured_logging.py` is `xfail`). The cross-cutting
request-id/method/path enrichment that R9.4 requires is already live.

---

## R9.1 — Liveness and readiness endpoints

**Source:** `backend/apps/common/health.py`, routed at root in `backend/config/urls.py`
(`/health/live/`, `/health/ready/`, `/health/redis/`).

- `LivenessView` (`/health/live/`) — `AllowAny`, no external dependency, returns
  `{"status": "ok"}` 200. Correct: liveness must not touch the DB.
- `ReadinessView` (`/health/ready/`) — `AllowAny`. Runs `SELECT 1` against Neon
  Postgres (`_check_db`) and a Redis round-trip via the Django cache
  (`_check_redis_with_latency`). Reports `{"status", "db", "redis"}`.
  - DB healthy → **200**; DB down → **503** with `"db": "error"`.
  - **Design note (intentional):** Redis is treated as non-critical — a Redis
    failure returns 200 with `"redis": "degraded"` rather than 503, because JTI
    blacklist and rate limiting fail-open and a 503 would trigger a Koyeb restart
    that makes the outage worse. This satisfies R9.1's "Redis/Celery readiness
    **where required**" — Redis readiness is surfaced in the payload without
    making it a hard liveness gate.
- `RedisHealthView` (`/health/redis/`) — dedicated Redis-only probe for paging
  (200 when reachable, 503 when not), so monitoring can alert on Redis without
  flapping readiness.
- Celery readiness is observed indirectly via the `check_uptime_task` Beat job
  (pings `/health/ready/`, alerts on transitions) and the missed-task detector
  (`task_last_run:{name}` cache keys; see R9.2).

**Tests (passing):** `tests/unit/test_health.py`,
`tests/unit/test_health_public_response.py`,
`tests/property/test_health_endpoint.py`,
`tests/property/test_production_readiness_health.py`.

## R9.2 — Background-task surfaces operational and monitored

**Source:** `backend/apps/common/tasks.py`, `backend/apps/documents/tasks.py`,
`backend/apps/applications/tasks/pdf_generation.py`, `backend/config/settings/base.py`
(`CELERY_BEAT_SCHEDULE`), `backend/config/celery.py`, `backend/apps/common/celery_signals.py`.

| Surface | Task | Verified |
|---------|------|----------|
| PDF / official-document generation | `generate_application_slip_task`, `generate_acceptance_letter_task`, `generate_conditional_offer_task`, `generate_payment_receipt_task` (`apps/applications/tasks/pdf_generation.py`) | ✅ |
| Email queue sweep | `process_pending_emails_task` (`apps/common/tasks.py`) — Redis lock guard, sweeps stale `EmailQueue` pending rows | ✅ |
| Payment reconciliation | `poll_pending_payments_task` → `PaymentService.expire_stale(older_than_hours=24, batch_cap=50)` (`apps/documents/tasks.py`, `payment_service_mixins/_admin.py`) | ✅ |
| Notification dispatch | outbox / notification tasks via `apps/common/outbox.py` + `dispatch_email` | ✅ |
| Uptime task | `check_uptime_task` (pings `HEALTH_CHECK_URL`, alert/recovery email on transition) + `keep_alive_task` | ✅ |

**Monitoring:** `apps/common/celery_signals.py` registers `task_prerun` /
`task_postrun` / `task_failure` handlers that emit `type: "task_lifecycle"`
structured logs (started / completed / failed, with `duration_ms`) and write
`task_last_run:{task_name}` to Redis for the missed-task detector
(`apps/common/management/commands/check_missed_tasks.py`). Celery errors flow to
GlitchTip via `CeleryIntegration()` (`base.py`). Signals are wired at worker
startup (`config/celery.py` imports `apps.common.celery_signals`).

**Tests (passing):** `tests/unit/test_payment_reconciliation_task.py` (incl. a
second-run idempotence assertion), `tests/unit/test_bulk_notification_task.py`.

## R9.3 — Idempotent behaviour on repeated identity

| Path | Mechanism | Source | Verified |
|------|-----------|--------|----------|
| Payment initiation (and other state-changers) | `@idempotent` decorator — identity `(idempotency_key, actor, method, path, body_hash)`; same key + same body → cached response, same key + different body → **409 `IDEMPOTENCY_CONFLICT`**, in-flight → 409 `IDEMPOTENCY_PENDING` | `apps/common/idempotency.py`, `IdempotencyKey` model | ✅ |
| Webhook (Lenco) | `WebhookEventIdentity` `(provider_event_id, event_type, reference, payload_hash)` + `is_duplicate()` strict dedup (canonical JSON); duplicate processed events short-circuit without re-mutating the Payment; webhook returns 200 on every valid delivery | `apps/documents/webhook_processor.py` | ✅ |
| Official-document generation | `_compute_document_fingerprint(application, document_type, …)` reuse of the Current_Official_Version — repeated unchanged generation reuses by fingerprint, no duplicate records | `apps/applications/tasks/pdf_generation.py` | ✅ |
| Email retry / bulk notification | retry sweeps with only remaining unprocessed IDs; deduplication helpers create one `IdempotencyKey` per dispatch | `apps/common/tasks.py`, `apps/common/outbox.py`, dedup helpers | ✅ |

**Tests (passing):** `tests/unit/test_payment_resilience.py` (payment command
views are `@idempotent`-wrapped), `tests/unit/test_webhook_processor_dedup.py`,
`tests/unit/test_webhook_processor_canonical_json.py`,
`tests/unit/test_webhook_processor_unknown_event.py`,
`tests/unit/test_payment_webhook_returns_200.py`,
`tests/property/test_webhook_idempotency.py`,
`tests/unit/test_official_document_dedup_guard.py`,
`tests/unit/test_deduplication_helpers.py`,
`tests/unit/test_bulk_notification_task.py`.

## R9.4 / R16.7 — Structured logs; no secrets or full PII

**Source:** `backend/apps/common/logging.py` (`JsonLogFormatter`,
`RequestContextFilter`, `bind_request_context`), `apps/common/middleware.py`
(`RequestIDMiddleware` — generates/propagates `X-Request-ID`, binds
request_id/method/path into contextvars), `LOGGING` config in `base.py`.

- Every log line is compact JSON and is enriched with `request_id`,
  `request_method`, `request_path` via the request-context filter.
- The formatter merges structured `extra` fields as top-level keys, including
  `application_id`, `payment`/`amount`/`currency`, `task_name`/`task_id`,
  `event`, `status_code`, `duration_ms`.
- **No-PII posture:** GlitchTip is initialised with `send_default_pii=False`
  (`base.py`); payment audit/redaction is centralised in
  `payment_audit_service.py`; webhook identity logging uses
  `WebhookEventIdentity.print()` which emits only a **truncated** payload-hash
  prefix (never the raw payload). No secrets, document bodies, or full PII are
  logged.

**Documented gap (non-blocking):** deeper per-event `extra={...}` tagging inside
the payment-service and webhook code paths (carrying `user_id` / `payment_id` /
`event_type` on every event) is a tracked Phase-3 follow-up. It is pinned by
`tests/unit/test_payment_structured_logging.py` as `xfail` (documents the target
shape; flips green when the tagging lands). The request-id/method/path
enrichment R9.4 requires is already live and verified.

**Tests (passing):** `tests/unit/test_structured_logging.py`,
`tests/property/test_webhook_logging.py`.

## R9.8 — `manage.py check`

```
$ DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py check
System check identified no issues (1 silenced).
```

(The SECRET_KEY / LENCO warnings are expected dev/test-only env notices, not
system-check issues.)

---

## Commands run

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check
# → System check identified no issues (1 silenced).

DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest \
  tests/unit/test_health.py tests/unit/test_health_public_response.py \
  tests/unit/test_structured_logging.py \
  tests/unit/test_webhook_processor_dedup.py tests/unit/test_webhook_processor_signature.py \
  tests/unit/test_webhook_processor_canonical_json.py tests/unit/test_webhook_processor_unknown_event.py \
  tests/unit/test_payment_webhook_returns_200.py tests/unit/test_payment_reconciliation_task.py \
  tests/unit/test_payment_structured_logging.py -q
# → 44 passed, 2 xfailed, 1 xpassed

DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest \
  tests/property/test_health_endpoint.py tests/property/test_production_readiness_health.py \
  tests/property/test_webhook_idempotency.py tests/property/test_webhook_logging.py \
  tests/property/test_webhook_signature.py --hypothesis-seed=0 -q
# → 11 passed

DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest \
  tests/unit/test_official_document_dedup_guard.py tests/unit/test_deduplication_helpers.py \
  tests/unit/test_payment_resilience.py tests/unit/test_bulk_notification_task.py -q
# → 24 passed
```

**Totals:** 79 passed, 2 xfailed (documented Phase-3 follow-up), 1 xpassed —
plus a clean `manage.py check`. No gaps require a code fix for task 19.1; the
single documented structured-logging gap is tracked and non-blocking.


---

# Backup Test + Restore Drill + Rollback Posture — Task 19.3, Component 9

**Requirements validated:** R9.6 (backup script tested, restore drill on
staging/local, retention documented), R9.7 (rollback posture: code rollback,
forward-only additive migrations, feature-disable without data drop, feature
flags), R9.8 (`manage.py check` passes). R16.8 honoured — **no production
backup was run and no production/Neon database was touched.**
**Method:** static syntax check of `deploy/backup-db.sh` + a self-contained
local restore drill in a `postgres:17-alpine` container (production-image
parity), plus a documentation pass on the two runbooks.

## Summary

| Item | Requirement | Status |
|------|-------------|--------|
| `deploy/backup-db.sh` tested (syntax + command-path drill) | R9.6 | ✅ PASS |
| Restore drill performed on local (staging-equivalent) | R9.6 | ✅ PASS |
| Backup retention documented (`BACKUP_RETAIN_DAYS`, default 14d) | R9.6 | ✅ Documented |
| Rollback posture: code rollback steps | R9.7 | ✅ Documented |
| Additive migrations treated as forward-only | R9.7 | ✅ Documented |
| Disable a feature without dropping data (feature flags) | R9.7 | ✅ Documented |
| `python3 manage.py check` passes | R9.8 | ✅ PASS |

## R9.6 — Backup script tested + restore drill + retention

**Backup script** (`deploy/backup-db.sh`): `bash -n deploy/backup-db.sh` passes.
The script is `set -euo pipefail`, sources `~/mihas/.env`, requires
`BACKUP_BUCKET` (aborts if unset), dumps the running `mihas-postgres-1` container
with `pg_dump --no-owner --no-privileges --format=custom`, ships to R2 with
`aws s3 cp --profile r2`, deletes the local dump immediately, and prunes remote
dumps older than `BACKUP_RETAIN_DAYS`.

**Restore drill (local, production-image parity — no production contact):**

```
== 1. start postgres:17-alpine (production image parity)
== 2. seed source DB (applications, payments w/ FK, migration_history)
   source: applications=137 payments=90 migration_history=4
== 3. pg_dump --no-owner --no-privileges --format=custom (backup-db.sh path)
   dump bytes: 8207  (non-empty)
== 4. fresh target DB + pg_restore --clean --if-exists (RUNBOOK §3)
   target: applications=137 payments=90 migration_history=4
== 5. idempotency: re-run pg_restore --clean --if-exists
   target after re-run: applications=137 payments=90
== RESULT == PASS: row-count parity + idempotent re-restore
```

The drill exercises the exact `pg_dump → pg_restore --clean --if-exists` command
path from `deploy/backup-db.sh` and `deploy/RUNBOOK.md` §3, proves the dump is
non-empty and restorable, confirms lossless row-count parity, and confirms the
re-restore is idempotent (safe to re-run mid-incident). The dump was `shred -u`'d
and the container torn down (no dump left on disk). **A real production backup is
deliberately not run from this environment** — it is an operator step on the EC2
box (`multi-tenant-beanola-rollout.md` step 1).

**Retention** is documented in
[`database-backup-restore.md`](../runbooks/database-backup-restore.md) §"Backup
retention (R9.6)": `BACKUP_RETAIN_DAYS` (default **14 days**, read at runtime
from `~/mihas/.env`), `BACKUP_BUCKET` required, local dumps retained 0 days
(deleted right after upload), off-box durability delegated to R2. The
quarterly-drill evidence checklist (restore start/ready time, smoke results,
issues, source/restore branch) is in the runbook's "Restore Drill" + "Script +
restore-drill verification" sections.

## R9.7 — Rollback posture

The canonical rollback posture lives in
[`database-backup-restore.md`](../runbooks/database-backup-restore.md)
§"Rollback Posture (R9.7)", cross-referenced from
[`release-and-rollback.md`](../runbooks/release-and-rollback.md) (code-rollback
mechanics) and `multi-tenant-beanola-rollout.md` §12. It documents:

1. **Code rollback (first lever, zero data risk):** redeploy the previous
   known-good GHCR image SHA on the EC2 box (`BACKEND_IMAGE` in `~/mihas/.env` →
   `docker compose … up -d`), restart `web`/`celery`/`beat`; frontend redeploys
   the prior build. Triggers and post-rollback checks enumerated.
2. **Database rollback is forward-only:** all production schema is additive,
   idempotent SQL under `backend/scripts/` (`CREATE … IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `INSERT … ON CONFLICT`,
   `ADD CONSTRAINT … NOT VALID`) applied by `apply_sql_migrations` on boot. No
   schema revert in a routine rollback — old code ignores new columns; legacy
   rows stay readable. Destructive teardown is a separately reviewed
   non-additive script (`--allow-non-additive`) after a fresh backup, never via
   the startup sweep. True data-level recovery uses Neon branch restore. Matches
   R14.7.
3. **Disable a feature without dropping data (feature flags):** all risky-surface
   flags default to `False`; rollback is a flag flip + redeploy, no schema
   revert, no data loss. The full enable/disable matrix covers the **payment
   hardening** flags (`PAYMENT_HARDENING_FORWARD_ONLY`,
   `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT`, `PAYMENT_HARDENING_RATE_LIMITS`,
   `PAYMENT_HARDENING_FORCE_APPROVED`, `VITE_PAYMENT_HARDENING_UI`) and the **AI
   hardening** flags (`AI_HARDENING_CIRCUIT_BREAKER`, `AI_HARDENING_RATE_LIMITS`,
   `AI_HARDENING_CACHE`, `AI_HARDENING_REDACTION`) — both cross-referenced to
   `payment-hardening-rollout.md` and `docs/ai-data-flows.md`.
4. **Graceful-degradation levers (R14.4–R14.6):** stop payment initiation while
   keeping deferred submission safe; block official-document download (never
   serve a stale/client PDF) on generation failure; disabling a route/action
   keeps the underlying data intact.

A numbered **rollback decision order** (code rollback → flag flip → graceful
degradation → Neon branch restore as last resort) closes the section.

## R9.8 — `manage.py check`

```
$ DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py check
System check identified no issues (1 silenced).
```

(The SECRET_KEY / LENCO warnings are expected dev/test-only env notices.)

## Commands run

```bash
bash -n deploy/backup-db.sh                       # → syntax OK
# local restore drill (postgres:17-alpine container, pg_dump→pg_restore)
#   → PASS: applications=137 payments=90 migration_history=4, idempotent re-restore
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
  ./.venv/bin/python manage.py check               # → no issues (1 silenced)
```

**Result:** R9.6, R9.7, R9.8 all satisfied. No code gap surfaced; the backup
script and restore path are proven on a production-parity image, retention and
the full rollback posture (code rollback, forward-only additive migrations,
feature-flag disable, graceful degradation) are documented and cross-referenced.
No production or Neon database was touched.
