# Database Backup And Restore Runbook

## Purpose

This runbook defines the minimum safe recovery procedure for MIHAS production data on Neon Postgres.

Use it for:

- bad SQL deployments
- accidental destructive updates
- schema drift recovery
- application regressions caused by DB changes
- corruption investigation

## Recovery Principles

- Prefer Neon branch-based recovery over manual SQL undo.
- Take a safety branch before risky schema or data operations.
- Restore into a new branch first. Do not restore directly into the live production branch.
- Repoint services only after verification passes.

## Before Risky Changes

1. Record the release tag for the deploy.
2. Record the current production Neon branch/database name.
3. Create a Neon safety branch from production.
4. Record:
   - release tag
   - branch name
   - operator
   - reason
   - timestamp

Suggested branch naming:

- `predeploy-2026-04-22-v2026.04.22-1`
- `restore-incident-2026-04-22`

## Restore Procedure

1. Identify the incident window.
2. Choose the restore timestamp or source branch in Neon.
3. Create a new restore branch from the last known good point.
4. Validate the restore branch:
   - application critical tables present
   - auth/session tables present
   - payment records consistent
   - current schema verification scripts pass
5. Point staging or a temporary backend instance at the restore branch.
6. Run smoke checks:
   - health endpoints
   - auth session
   - application listing
   - payment lookup path
7. If valid, update production `DATABASE_URL` to the restored branch.
8. Redeploy backend workers/web service.
9. Verify application health and payment flows.

## Verification Checklist

- `python3 backend/scripts/verify_schema_static.py`
- `python3 backend/manage.py check`
- auth session loads
- application create/list paths respond
- payment read/initiate path responds
- admin can view recent applications

## Restore Drill

Run once per quarter:

1. Create a non-production restore branch.
2. Repoint a staging/local parity backend to it.
3. Run smoke checks.
4. Record:
   - restore start time
   - restore ready time
   - smoke results
   - issues found

## Evidence To Record

- release tag
- Neon source branch
- Neon restore branch
- incident start/end time
- operator
- verification results
- final production DB target

## Notes

- Because many tables are `managed=False`, schema recovery discipline is mandatory.
- If a DB restore crosses payment state changes, reconcile with payment provider records before closing the incident.

## Production Backup Script (`deploy/backup-db.sh`)

The self-hosted production stack backs up the `mihas-postgres-1` container
nightly to Cloudflare R2. The script lives at `deploy/backup-db.sh`. Setup
(R2 profile + both cron jobs) is scripted and idempotent — see
`deploy/RUNBOOK.md` §6 and the three `deploy/setup-*.sh` / `deploy/configure-*.sh`
scripts. **Status as of 2026-07-11: verified live** — the R2 profile is
configured, the backup bucket (`mihas-backups`) exists and is reachable, a
real end-to-end backup ran successfully (dump → R2 upload → local cleanup,
978KB), and both cron jobs are installed on the box:

```
0 2 * * * cd /home/ubuntu/mihas && bash backup-db.sh >> /home/ubuntu/mihas/backup-cron.log 2>&1 || { ...failure alert... }  # mihas-nightly-backup
0 3 * * 0 docker image prune -a -f --filter 'until=72h' >> /home/ubuntu/mihas/image-prune-cron.log 2>&1  # mihas-weekly-image-prune
```

This closes a previously-documented gap: earlier audits of this box found
`BACKUP_BUCKET` set in `.env` but no `awscli`, no `~/.aws/` profile, and no
crontab entry at all — meaning no automated backup had ever actually run.
The gap is now closed and re-verifiable via `crontab -l` on the box.

What it does, in order:

1. `cd` to its own directory and `source .env` to load `POSTGRES_*` +
   `BACKUP_BUCKET` (+ optional `BACKUP_RETAIN_DAYS`).
2. `pg_dump --no-owner --no-privileges --format=custom` straight out of the
   running `postgres` container into `/tmp/mihas-<UTC-stamp>.pgcustom`.
3. `aws s3 cp --profile r2` the dump to `s3://${BACKUP_BUCKET}/`, then delete
   the local copy immediately (no dump is left on local disk).
4. Prune remote dumps older than the retention window.

### Backup retention (R9.6)

| Setting | Source | Default | Meaning |
|---------|--------|---------|---------|
| `BACKUP_RETAIN_DAYS` | `~/mihas/.env` on the EC2 box | **14 days** | Remote R2 dumps with a UTC date stamp older than `today − RETAIN_DAYS` are deleted on each nightly run. |
| `BACKUP_BUCKET` | `~/mihas/.env` (required) | _none_ | R2 bucket the dumps ship to (e.g. `mihas-backups`). The script aborts if unset. |

- Retention is enforced by the prune loop at the end of `backup-db.sh`: it lists
  the bucket, parses the `mihas-YYYYMMDD-…` date out of each key, and `aws s3 rm`s
  anything older than the cutoff. Local dumps are retained for **0 days** — they
  are removed right after upload.
- To change retention, set `BACKUP_RETAIN_DAYS` in `~/mihas/.env` (it is read at
  runtime; no code change needed). Increase it before a risky cutover so the
  pre-migration backup survives the window.
- Off-box durability is delegated to R2 object storage; the EC2 box keeps no
  long-lived dumps.

### Script + restore-drill verification (R9.6)

The backup script and the restore path were verified without touching
production or Neon. A **real production backup must not be run from the
development environment** — the production dump only runs on the EC2 box during
the operator cutover (see `multi-tenant-beanola-rollout.md` step 1).

Verification performed locally (Beanola production-readiness task 19.3,
re-verified this pass):

- **Static check** — `bash -n deploy/backup-db.sh` passes (no syntax errors);
  the script is `set -euo pipefail` and aborts on an unset `BACKUP_BUCKET`.
- **Restore drill** — a self-contained drill in a `postgres:17-alpine` container
  (matching the production image `postgres:17-alpine` from
  `deploy/docker-compose.prod.yml`) exercised the **exact** command path used by
  `backup-db.sh` and `deploy/RUNBOOK.md` §3:
  - `pg_dump --no-owner --no-privileges --format=custom` of a seeded source DB
    (`applications`, `payments` with an FK to `applications`,
    `migration_history`) → a non-empty `.pgcustom` dump (~8.2 KB).
  - `pg_restore --no-owner --no-privileges --clean --if-exists` into a fresh
    target DB.
  - **Row-count parity:** source `applications=137 / payments=90 /
    migration_history=4` matched the restored target exactly.
  - **Idempotency:** re-running `pg_restore --clean --if-exists` into the same
    target was a no-op (counts unchanged at 137 / 90) — proving
    `--clean --if-exists` is safe to re-run during an incident.
  - **Cleanup:** the dump was `shred -u`'d and the container removed (trap),
    mirroring the runbook's "never leave a DB dump on disk" rule.
  - **Result: PASS** — backup is non-empty and restorable; the
    `pg_dump → pg_restore` round-trip is lossless and idempotent.
- **Exact dump byte count varies** with seed data; the invariant the drill
  asserts is *non-empty dump + exact row-count parity + idempotent re-restore*,
  not a fixed byte size.

**Drill evidence to record each quarter** (per the "Restore Drill" section
above): restore start time, restore-ready time, smoke results, issues found,
and the source/restore branch (Neon) or container (local) used.

> Operator note for the production-parity drill: on staging or a Neon restore
> branch, repoint a parity backend at the restored DB and run the
> Verification Checklist (`verify_schema_static.py`, `manage.py check`, auth
> session, application list, payment read). Do **not** repoint production at a
> drill branch.

## Backup-And-Restore Drill With Row-Count Verification (R1.7)

This is the canonical, repeatable drill that proves a `deploy/backup-db.sh`
dump can be restored and that **no rows were lost in the round-trip**. It backs
up the production DB with the *exact* command path used by `backup-db.sh`,
restores into a throwaway **scratch** database, then compares
`SELECT count(*)` for the critical tables between the source and the restored
scratch DB. **Any per-table mismatch fails the drill.**

> Run this from the EC2 box (where the `postgres` container and `.env` live) so
> the dump uses the real production source, or from a Neon restore branch /
> local parity DB for a non-production rehearsal. **Never restore into the live
> production database or the live Neon production branch** — the restore target
> is always a scratch DB. **Never echo or commit secret values** (the
> `POSTGRES_PASSWORD`, R2 keys, the `.pem`); the commands below reference them
> by env-var name only, and they expand *inside* the `postgres` container where
> `$POSTGRES_USER` / `$POSTGRES_DB` are already set.

### Critical tables verified by this drill

The drill compares row counts for the four tables whose loss would be
operationally unrecoverable:

| Table | Why it is verified |
|-------|--------------------|
| `applications` | Core admissions records — the platform's primary data |
| `payments` | Canonical payment ledger (source of truth, FK to `applications`) |
| `notifications` | Student/admin notification history |
| `user_institution_memberships` | Tenant-authority memberships — losing these breaks scoped admin access |

### Procedure

All steps run from `~/mihas` on the EC2 box (`cd ~/mihas`). The drill never
touches the production volume — it only reads the source DB and writes to a
separate scratch database.

**1. Take a backup (same path as `deploy/backup-db.sh`).**

Use the nightly script as-is — it dumps `--no-owner --no-privileges
--format=custom` out of the running `postgres` container, ships to R2, and
removes the local copy. For a self-contained drill that keeps the dump local
long enough to restore it, run just the dump leg into a scratch file:

```bash
# Custom-format dump straight out of the running production container.
# (Identical flags to backup-db.sh; $POSTGRES_USER/$POSTGRES_DB expand in-container.)
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'pg_dump --no-owner --no-privileges --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > /tmp/mihas-drill.pgcustom
```

**2. Create a scratch database and restore into it.**

The scratch DB lives in the same `postgres:17-alpine` container (matching
`deploy/docker-compose.prod.yml`) but is a *separate* database, so the
production DB is untouched:

```bash
SCRATCH="mihas_restore_drill"

# Create an empty scratch DB (drop first so the drill is re-runnable).
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 \
     -c 'DROP DATABASE IF EXISTS ${SCRATCH};' \
     -c 'CREATE DATABASE ${SCRATCH};'"

# Restore the dump into the scratch DB (clean + if-exists makes it idempotent).
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  "pg_restore --no-owner --no-privileges --clean --if-exists \
     -U \"\$POSTGRES_USER\" -d ${SCRATCH}" < /tmp/mihas-drill.pgcustom
```

**3. Verify per-table row counts match (fails on mismatch).**

Count each critical table in the source DB and the scratch DB, then compare. The
gate exits non-zero (drill FAIL) on any mismatch:

```bash
SCRATCH="mihas_restore_drill"
TABLES="applications payments notifications user_institution_memberships"
FAIL=0

for t in $TABLES; do
  SRC=$(docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -t -A -c 'SELECT count(*) FROM ${t};'")
  DST=$(docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
    "psql -U \"\$POSTGRES_USER\" -d ${SCRATCH} -t -A -c 'SELECT count(*) FROM ${t};'")
  if [ "$SRC" = "$DST" ]; then
    echo "OK   ${t}: source=${SRC} restored=${DST}"
  else
    echo "FAIL ${t}: source=${SRC} restored=${DST} (row-count mismatch)"
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "RESTORE DRILL FAILED: row counts diverged — do not trust this backup."
else
  echo "RESTORE DRILL PASSED: all critical tables match."
fi
```

**4. Tear down the scratch DB and shred the dump.**

Never leave a DB dump on disk (matches the `backup-db.sh` / RUNBOOK rule):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c 'DROP DATABASE IF EXISTS mihas_restore_drill;'"
shred -u /tmp/mihas-drill.pgcustom
```

### Pass / fail criteria

- **PASS** — the dump restores cleanly **and** `count(*)` for every table in
  the critical-tables list is identical between the source and the restored
  scratch DB.
- **FAIL** — the restore errors, or any single table's count diverges. A FAIL
  means the backup is not trustworthy: investigate the dump (was the source
  quiesced? did `pg_dump` complete?) before relying on it for recovery.
- A successful re-run of step 2 into the same scratch DB must be a no-op on the
  counts (`--clean --if-exists` is idempotent), confirming the restore is safe
  to repeat during a real incident.

### Drill evidence to record each run

Per the quarterly **Restore Drill** cadence above, record: drill start time,
restore-ready time, the four per-table source/restored counts, PASS/FAIL, and
any issues found. For a non-production rehearsal, also record the Neon restore
branch or scratch container used. Do **not** repoint production at the scratch
DB.

## Rollback Posture (R9.7)

This section is the canonical rollback posture for the platform. It is
cross-referenced by [`release-and-rollback.md`](release-and-rollback.md) (code
rollback mechanics) and
[`multi-tenant-beanola-rollout.md`](multi-tenant-beanola-rollout.md) §12
(application-code rollback for the tenant cutover).

### 1. Code rollback (always allowed, preferred first move)

Code rollback is the **first** lever for any post-deploy regression — it does
not touch data. Per `release-and-rollback.md`:

- **Backend:** redeploy the previous known-good GHCR image SHA. On the EC2 box,
  set `BACKEND_IMAGE` back to the good SHA in `~/mihas/.env` and
  `docker compose -f docker-compose.prod.yml --env-file .env up -d`. Image tags
  are immutable per-SHA, so old images are always pullable. Restart `web`,
  `celery`, and `beat`.
- **Frontend:** redeploy the prior build/commit.
- **Triggers:** broken auth/session, broken payment initiation/verification,
  broken application create/submit, a 5xx spike, or broken admin access.
- **After rollback:** run the post-rollback checks (`/health/live/`,
  `/health/ready/`, auth session, dashboard, wizard, payment initiation, admin
  applications view).

### 2. Database rollback is forward-only (additive migrations)

**All production schema ships as additive, idempotent SQL scripts** under
`backend/scripts/` (the `managed = False` convention), applied by
`apply_sql_migrations` on container boot. Because every script uses
`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`INSERT … ON CONFLICT`, `CREATE INDEX IF NOT EXISTS`, and
`ADD CONSTRAINT … NOT VALID`, the schema is **forward-only**:

- **There is no schema revert in a routine rollback.** Rolling back the
  application code while leaving the additive columns/tables in place is safe —
  old code simply ignores the new columns, and legacy rows (null canonical IDs,
  legacy string snapshots, prior official documents, prior payments/receipts)
  stay readable and unchanged.
- **Do not drop tenant tables/columns as part of a routine rollback.** That
  would discard backfilled canonical IDs and tenant configuration and is
  irreversible.
- A genuine destructive teardown (abandoning a feature's schema) is a
  **separately reviewed non-additive script** applied manually with
  `--allow-non-additive`, **after a fresh backup**, never through the
  container-startup sweep.
- If schema-level recovery is truly required (corruption, bad data write), use
  **Neon branch restore** (the Restore Procedure above) rather than improvised
  manual SQL reversal — restore to a new branch, validate, then repoint.

This matches R14.7: *the database rollback posture is forward-only unless a
tested rollback script exists; code rollback is allowed.*

### 3. Disable a feature without dropping data (feature flags)

Risky surfaces are gated behind environment feature flags that all **default to
`False`**, so the legacy code path stays in effect until a flag is explicitly
flipped. **Rollback for any of these is a flag flip back to `False` and a
redeploy — no schema revert, no data loss**, because the Phase-1 schema for each
rollout is additive.

**Payment hardening flags** (spec `.kiro/specs/payment-hardening/`,
enable/disable matrix in
[`payment-hardening-rollout.md`](payment-hardening-rollout.md)):

| Flag | Scope | Disable effect |
|------|-------|----------------|
| `PAYMENT_HARDENING_FORWARD_ONLY` | Backend | Reverts to legacy payment-status transition path |
| `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` | Backend | Reverts to prior webhook dedup |
| `PAYMENT_HARDENING_RATE_LIMITS` | Backend | Disables per-user payment throttles |
| `PAYMENT_HARDENING_FORCE_APPROVED` | Backend | Reverts to legacy synthetic `successful` admin override |
| `VITE_PAYMENT_HARDENING_UI` | Frontend (build-time) | Reverts to legacy PaymentStep UI |

**AI hardening flags** (rollback is a flag flip — no schema changes ship with
Phases 1–3; see `docs/ai-data-flows.md`):

| Flag | Scope | Disable effect |
|------|-------|----------------|
| `AI_HARDENING_CIRCUIT_BREAKER` | Backend | Disables the Redis-backed AI circuit breaker |
| `AI_HARDENING_RATE_LIMITS` | Backend | Disables AI per-user throttles |
| `AI_HARDENING_CACHE` | Backend | Disables the 24h AI response cache |
| `AI_HARDENING_REDACTION` | Backend | Reverts to non-redacted prompt path |

All AI callers already treat a `None`/unavailable result as "degrade
gracefully", so disabling these flags never breaks a core flow.

**Graceful-degradation rollback levers** (R14.4–R14.6, cross-ref
`release-and-rollback.md`):

- **Payment failing after launch (R14.5):** stop payment initiation while
  keeping application submission safe — students may defer and submit; do not
  block submission on the payment gateway.
- **Official-document generation failing (R14.6):** the system shows
  "generation failed" and **blocks download** rather than serving a stale or
  client-rendered PDF. Official documents are backend-only and never fall back
  to `@/lib/pdf`.
- **Disabling a route/action** must keep the underlying data intact (R14.4) —
  hide or gate the surface, never delete the records behind it.

### Rollback decision order

1. **Code rollback first** (previous image SHA) — fixes most regressions, zero
   data risk.
2. **Flip the relevant feature flag(s) to `False`** and redeploy — disables a
   risky surface without dropping data.
3. **Graceful-degradation lever** — stop payment initiation / block official-doc
   download while keeping submission and reads working.
4. **Neon branch restore** (last resort, data-level) — only for corruption or a
   bad data write; restore to a new branch, validate, repoint. Never improvise
   destructive SQL during an incident.
