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

## Launch-verification Gate 2 — Smoke_Test_Gate (operator / post-deploy)

> **Operator step, not CI.** `run-smoke-gate.py` probes a *live, deployed*
> target and records launch-verification evidence. It is deliberately **not**
> wired into the automated CI gates — CI only runs the pure-logic gates and the
> rollup. Run this by hand after a production deploy (or against a staging /
> preview target), the same way you run the script above.

This is the launch-verification wrapper around the smoke surfaces. It normalizes
every frontend + backend check into an evidence row (target id, observed result,
pass/fail, timestamp), adds the two canonical admin-surface checks plus an
unauth/no-CSRF rejection probe, and writes a single reviewable artifact.

```bash
python3 scripts/launch-verification/run-smoke-gate.py \
  --frontend-url https://apply.beanola.com \
  --backend-url  https://api.beanola.com
```

Offline envelope check (no network — emits a valid artifact over synthetic
observations, for local verification only):

```bash
python3 scripts/launch-verification/run-smoke-gate.py --dry-run
```

### Flags and environment overrides

Base URLs default to the production hosts. Every URL/path is overridable via the
environment variable first, then the CLI flag.

| Flag | Env var | Default | Purpose |
|------|---------|---------|---------|
| `--frontend-url` | `APP_URL` | `https://apply.beanola.com` | Deployed frontend base URL |
| `--backend-url` | `API_URL` | `https://api.beanola.com` | Deployed backend base URL |
| `--tenant-admin-path` | `TENANT_ADMIN_PATH` | `/admin/tenants` | Product tenant-admin surface path |
| `--django-admin-path` | `DJANGO_ADMIN_PATH` | `/beanola-admin-panel/` | Django operational admin surface path |
| `--state-change-path` | `STATE_CHANGE_PATH` | `/api/v1/payments/mobile-money/` | Endpoint used for the unauth/no-CSRF probe |
| `--timeout-ms` | — | `10000` | Per-surface reachability timeout (10 s) |
| `--invoke-shell-smoke` | — | off | Also run `scripts/smoke-production.sh` and record its exit code |
| `--dry-run` | — | off | Synthetic envelope, no network |
| `--output` | — | `docs/launch-evidence/02-smoke/smoke-evidence.json` | Artifact output path |

### The two distinct canonical admin surfaces

The gate records `/admin/tenants` and `/beanola-admin-panel/` as **two separate
reachability checks** — they are never collapsed into one. This mirrors the
binding guardrail that the two admin surfaces are not interchangeable.

| Surface | Lives on | Path | What it is |
|---------|----------|------|------------|
| `Tenant_Admin_UI` | deployed **frontend** | `/admin/tenants` | The product super-admin/staff tenant-admin UI |
| `Django_Admin` | deployed **backend** | `/beanola-admin-panel/` | The Django operational admin |

Each surface passes **only** on a non-error reachability response (HTTP `< 400`)
within the 10-second timeout; anything else (error status, timeout, unreachable)
is recorded as a `fail`.

### Unauth / no-CSRF rejection probe

The gate issues a `POST` to the state-changing endpoint
(`/api/v1/payments/mobile-money/` by default) with **no** cookie auth and **no**
CSRF token. This check passes **only if the request is rejected** (a `4xx`) —
i.e. the endpoint refused it. A processed `2xx`/`3xx`, a `5xx`, or no response
all count as *not rejected* and fail the check. This proves the auth + CSRF
guardrails are intact on the live target.

### Evidence location and rollup

The artifact is written to:

```
docs/launch-evidence/02-smoke/smoke-evidence.json
```

It uses the shared `Evidence_Artifact` envelope (`gate_id="smoke"`,
`requirement="R2"`, `generated_by="deployed-target"`). The rollup is
**conservative**: the gate passes iff there is at least one check and *every*
check passed; any single failure marks the gate `failed` and the process exits
non-zero (`0` = passed, `1` = not passed, including an unreachable target in a
sandbox — it fails closed). This per-gate artifact is what the overall
launch-verification rollup aggregates to decide
`production-launch-ready` vs `not-production-launch-ready`.

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
