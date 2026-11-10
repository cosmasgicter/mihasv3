# Post-Deploy Smoke Check

## Purpose

> Note (2026-11-09, platform-simplification task 11.4): the launch rollup this runbook mentions below was removed; `run-smoke-gate.py` remains as a by-hand probe of a deployed target. See `docs/runbooks/launch-verification.md`.

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

## Production verification commands (self-hosted EC2 Docker stack)

> Source of truth: `.kiro/steering/infrastructure.md`. These are the
> **real, read-only** commands for the current production topology — single
> AWS EC2 box (`ec2-13-244-37-190.af-south-1.compute.amazonaws.com`), Docker
> Compose stack defined by `deploy/docker-compose.prod.yml`, containers
> `mihas-caddy-1` / `mihas-web-1` / `mihas-beat-1` / `mihas-celery-1` /
> `mihas-redis-1` / `mihas-postgres-1`. Production is **not** Koyeb, Neon, or
> Vercel — Neon remains the dev/authoring database only. All commands below
> are run from `~/mihas` on the box after SSHing in with the `.pem` key
> (see `infrastructure.md` → "Logging in to the production EC2 box"); none
> of them mutate data. **This runbook documents the commands — it does not
> assert they were executed in this editing pass; no live command was run
> against the production box while writing this section.**

### 1. Container health

```bash
cd ~/mihas
docker compose -f docker-compose.prod.yml ps
```

Expect all six containers (`caddy`, `web`, `beat`, `celery`, `redis`,
`postgres`) in a healthy/running state with no restart loops. A container
stuck in a restart loop after a deploy is the first signal to check logs
(`docker compose -f docker-compose.prod.yml logs --tail=200 <service>`)
before doing anything else.

### 2. Migration dry-run (before assuming SQL migrations are safe to apply)

```bash
docker compose -f docker-compose.prod.yml exec web \
  python manage.py apply_sql_migrations --dry-run
```

Runs the same forward-migration sweep the container's boot sequence runs
(`apply_sql_migrations && seed_subjects && check_schema_drift && uvicorn ...`,
documented above), but in dry-run mode — it reports which top-level
`backend/scripts/*.sql` files are pending against `migration_history` without
applying them. Use this to confirm there is nothing unexpectedly pending
before a deploy, or to confirm a just-applied migration is now recorded.

### 3. Tenant-invariant read-only SQL (per `infrastructure.md`)

Confirms the core tenant-authority tables are non-empty and internally
consistent without touching any row:

```bash
docker compose -f docker-compose.prod.yml exec postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -x -c \
   "SELECT (SELECT count(*) FROM canonical_programs) canonical_programs,
           (SELECT count(*) FROM institutions WHERE is_active) institutions_active,
           (SELECT count(*) FROM user_institution_memberships WHERE is_active) memberships;"'
```

A healthy production database returns non-zero counts for all three columns.
A zero `canonical_programs` or `institutions_active` count post-deploy is a
strong signal of a bad migration or a restored-from-empty database — stop and
investigate before letting traffic continue.

Companion check — confirm which migrations are recorded (useful right after
the dry-run above, or to confirm a specific migration landed):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
   "SELECT migration_name FROM migration_history ORDER BY 1;"'
```

### 4. Health endpoint probes

The shell smoke script (`scripts/smoke-production.sh`, above) already probes
these over HTTPS from outside the box. The equivalent direct checks, run
either from the box or externally:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://api.beanola.com/health/live/
curl -fsS -o /dev/null -w '%{http_code}\n' https://api.beanola.com/health/ready/
```

Both must return `200`. `/health/live/` is the lightweight liveness probe
(also the target of the `keep_alive_task` Celery Beat job, every 4 minutes,
and the external UptimeRobot monitor). `/health/ready/` is the deeper
readiness probe (DB + Redis connectivity) — the target of the internal
`check_uptime_task` (every 15 minutes) and what a healthy post-deploy state
must return before declaring the rollout safe.

### When to use this section vs the sections above

- Use **this section** for infrastructure-level confirmation on the actual
  production box (containers, migrations, DB invariants, health endpoints).
- Use the **Post-deploy smoke script** and **Extended staging smoke** sections
  above for application-behavior regression coverage (schema-drift endpoints,
  frontend/backend HTTP reachability from outside the network).
- Use **Manual critical checks** below for the end-to-end student/admin UX
  walkthrough that no automated script currently covers.

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
- `.kiro/steering/infrastructure.md` — source of truth for the EC2 Docker topology, SSH access, and the tenant-invariant SQL pattern used above
- [multi-tenant-operations.md](multi-tenant-operations.md) §5 "Production Migration Verification" and §9 "Celery, Redis, And Postgres Health" — the broader operator runbook these commands are drawn from
