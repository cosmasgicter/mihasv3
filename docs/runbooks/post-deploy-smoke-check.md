# Post-Deploy Smoke Check

## Purpose

Run this immediately after production deploys to catch obvious
regressions before users do. The May 2026 `application_documents`
schema-drift incident (hand-written SQL not applied to the DB before
the matching Django model shipped) is what this runbook is tuned to
catch going forward.

## Automated deploy-time guards (no operator action required)

The production Docker CMD now runs the following chain before
`uvicorn` starts. Any failure causes the container to crashloop
visibly rather than serve 500s to users:

```
python manage.py apply_sql_migrations  &&
python manage.py seed_subjects         &&
python manage.py check_schema_drift    &&
uvicorn config.asgi:application ...
```

What each step does:

| Step | Purpose | Failure symptom |
|------|---------|-----------------|
| `apply_sql_migrations` | Applies top-level forward `.sql` files in `backend/scripts/` (lexicographic filename order) that have not been recorded in `migration_history`. It does not recurse into `applied/`, `archive/`, or legacy `migrations/`; rollback files and excluded snapshots are skipped by the runner/lint. Each file runs in its own transaction unless it requires the documented `CREATE INDEX CONCURRENTLY` split phase. | Migration SQL error logged; container crashloops. |
| `seed_subjects` | Ensures the ECZ subject catalog is seeded. Idempotent via `ON CONFLICT DO UPDATE`. | Usually a DB connection issue; container crashloops. |
| `check_schema_drift` | Verifies every Django `managed = False` model's declared columns exist on the DB. This is the fail-fast guard for the exact bug that caused the May 2026 incident. | Lists missing columns + points at `apply_sql_migrations`; container crashloops. |

**If operators need to add a new SQL migration,** drop the forward script at
the top level of `backend/scripts/` using the
`YYYY_MM_DD[_NN]_description.sql` convention. Do not place forward scripts in
`backend/scripts/migrations/`; that legacy directory is deliberately excluded
from the startup sweep. Keep rollbacks/preflight scripts out of the auto-applied
set unless they are intentionally named and linted for manual use.

## Post-deploy smoke script

```bash
./scripts/smoke-production.sh
```

Optional overrides:

```bash
APP_URL=https://apply.beanola.com API_URL=https://api.beanola.com ./scripts/smoke-production.sh
```

This verifies:

- frontend landing page responds `200`
- backend `/health/live/` responds `200`
- backend `/health/ready/` responds `200`
- public auth session endpoint responds `200`

## Extended staging smoke (schema-drift regression guard)

Before promoting staging → production, run
`backend/scripts/staging_smoke.py` with a test token. It now includes
three checks that specifically exercise the endpoints that 500'd in
the incident:

- `GET /api/v1/applications/<unknown-uuid>/documents/`
- `GET /api/v1/applications/<unknown-uuid>/grades/`
- `POST /api/v1/documents/upload/` with empty body

Each is marked `require_no_5xx: true` — if any returns a 5xx, the
smoke run fails regardless of the exact status code. On a healthy
deploy these return 401/403/404.

```bash
python backend/scripts/staging_smoke.py \
  --base-url https://staging.api.beanola.com \
  --token <staging-jwt> \
  --report /tmp/smoke_report.json
```

Exit status 0 → safe to roll to production.

## Manual critical checks

After the script passes, verify:

1. Sign in with a test student account.
2. Open the application wizard.
3. Confirm application fee resolves on the payment step.
4. Confirm mobile-money operators are visible.
5. Confirm the dashboard loads.
6. **Upload a test PDF on the Education step** — the upload should
   return 201 and the result slip should show as "Uploaded".
7. Confirm admin applications page loads.

## If anything fails

1. Stop further rollout.
2. Check container logs first — `check_schema_drift` / 
   `apply_sql_migrations` print actionable diagnostics on failure.
3. If the container is crashlooping on `check_schema_drift`:
   - The log tells you which table + columns are missing.
   - The fix is almost always: add a new file to
     top-level `backend/scripts/` and redeploy. The next container
     boot runs it automatically.
4. Compare against the previous release tag.
5. Use [release-and-rollback.md](release-and-rollback.md) for rollback.

## Related runbooks

- [production-smoke-checklist.md](production-smoke-checklist.md) — manual post-deploy critical-flow checklist (R8.9 / R14.3)
- [release-and-rollback.md](release-and-rollback.md) — rollback flow
- [database-backup-restore.md](database-backup-restore.md) — DB recovery
- [schema-reconciliation-runbook.md](schema-reconciliation-runbook.md) — SQL migration and drift workflow
- [multi-tenant-beanola-rollout.md](multi-tenant-beanola-rollout.md) — tenant rollout checks
