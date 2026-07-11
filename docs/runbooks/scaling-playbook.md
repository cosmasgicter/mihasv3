# Scaling Playbook

> **Architecture note (2026-07-11):** The sections below describing Koyeb,
> Vercel, and Upstash Redis for the **backend** are historical — production
> migrated to a self-hosted single-box EC2/Docker Compose stack (see
> `.kiro/steering/infrastructure.md` and `deploy/RUNBOOK.md`). They are kept
> for reference in case of a future re-migration, but do not describe the
> current runtime. The **frontend** (`apps/admissions`, `apps/jobs-ops`) does
> still deploy via GitHub Actions → the same EC2 box's Caddy container, not
> Vercel automatic scaling as described in the "Vercel Frontends" section
> below (see `.github/workflows/deploy.yml`). The current, accurate scaling
> surface is the **EC2 self-hosted stack** section immediately below.

## EC2 Self-Hosted Stack (Current Production, 2026-07)

**Topology:** single AWS EC2 `t3.small` (`af-south-1`), Docker Compose, one
instance each of `web` (Django/Uvicorn), `celery`, `beat`, `postgres:17-alpine`,
`redis:7-alpine`, `caddy` (edge/TLS), `alloy` (Grafana Cloud metrics shipper).
See `.kiro/steering/infrastructure.md` for the full topology and access
pattern.

### Docker Disk Hygiene

**Real incident (2026-07-10):** unpruned Docker images from repeated deploys
accumulated to 9.1GB reclaimable (79% of image storage), pushing root disk
usage to 89% — above the 85% deploy-gate threshold enforced by
`deploy/disk_gate.sh` (sourced by `.github/workflows/deploy.yml`), which would
have **blocked the next deploy entirely**. Manually pruning
(`docker image prune -a -f --filter until=48h`) recovered the box to 45% usage
in one pass.

**Automated prevention (installed 2026-07-11):**

```bash
# Idempotent — safe to re-run, replaces its own crontab entry by marker.
bash deploy/setup-image-prune-cron.sh
```

Installs a weekly cron (`0 3 * * 0`, Sundays 03:00 UTC):

```
docker image prune -a -f --filter "until=72h"
```

This only removes images not referenced by any running container and older
than 72 hours — it never touches the 5 currently-running images (backend,
frontend, postgres, redis, alloy). Log: `~/mihas/image-prune-cron.log`.

**Manual emergency prune** (if disk usage is already critical and the weekly
cron hasn't run yet):

```bash
docker image prune -a -f --filter "until=48h"   # more aggressive than the cron's 72h
df -h /                                          # confirm recovery
```

**Deploy-time gate:** `deploy/disk_gate.sh` (tested by
`backend/tests/property/test_perf_deploy_gate.py`) halts the deploy workflow
if `/` usage is at or above `DISK_THRESHOLD` (a repo/org Actions variable,
default 85, clamped to 50–95) **before** attempting to pull new images — a
disk-full box fails loudly at the gate instead of failing obscurely mid-pull.

### Database Backup Automation

See `docs/runbooks/database-backup-restore.md` → "Production Backup Script"
for the full nightly-backup setup (`deploy/configure-r2-profile.sh` +
`deploy/setup-backup-cron.sh`). Status as of 2026-07-11: verified live —
R2 profile configured, bucket reachable, a real backup ran end-to-end, cron
installed (`0 2 * * *`, daily).

---

## Backend (Koyeb) — historical, pre-EC2-migration

**Current:** 1 Uvicorn instance with 2-3 workers (ASGI, `config.asgi:application`).

**To scale:**
1. Add instances via Koyeb dashboard (Service → Scale → Instances)
2. Session affinity not required — auth is stateless JWT via cookies
3. Each instance needs its own DB and Redis connections
4. Monitor connection pool exhaustion via `/health/ready/`

**Limits:** Neon free tier connection limits apply per-instance.

## Celery Workers — historical, pre-EC2-migration

**Current:** Single worker process with default concurrency.

**To scale:**
- Increase concurrency: `celery -A config worker --concurrency=4` (for I/O-bound tasks)
- Add worker instances via separate Koyeb service
- Each worker opens Redis connections — Upstash free tier allows max 100 concurrent connections
- Monitor with `check_missed_tasks` management command

**Recommended concurrency:** 2-4 for I/O-bound tasks (email, API calls, document processing).

## Neon Postgres — historical, pre-EC2-migration (production now runs Postgres in-container on EC2; Neon remains the authoring/dev database — see `infrastructure.md`)

**Current:** 0.25 CU tier.

**Connection pool:**
- `CONN_MAX_AGE=300` — reuse connections for 5 minutes to reduce connection overhead on Neon's serverless proxy
- Neon 0.25 CU supports ~100 concurrent connections
- Each Uvicorn worker + Celery worker consumes 1 connection

**To scale:**
1. Upgrade CU tier via Neon dashboard
2. Enable connection pooling (PgBouncer) if connection count exceeds limits
3. Monitor via Neon dashboard metrics

## Vercel Frontends — historical, pre-EC2-migration (current frontend deploy target is the same EC2 box's Caddy container, see `.github/workflows/deploy.yml`)

**Automatic scaling** — no manual intervention required. Vercel Edge Network handles CDN, SSL, and auto-scaling for both `apps/admissions` and `apps/jobs-ops`.

## Redis (Upstash) — historical, pre-EC2-migration (production now runs `redis:7-alpine` in-container on EC2)

**Current:** Free tier.

| Limit | Free Tier | Pro Tier |
|-------|-----------|----------|
| Commands/day | 10,000 | 10M+ |
| Storage | 256 MB | 10 GB+ |
| Connections | 100 | 1,000+ |

**To scale:** Upgrade to Pro tier via Upstash console when approaching limits. Key consumers: rate limiting, JTI blacklist, Celery broker, task_last_run keys.

## Celery Beat High Availability

**Current risk:** Single Beat instance (SPOF), 16 periodic tasks.

**Acceptable at current scale** — one Beat instance is sufficient. If Beat goes down, `check_missed_tasks` detects it within 2x the task interval.

**Migration path to `celery-redbeat`:**
1. `pip install celery-redbeat`
2. Set `CELERY_BEAT_SCHEDULER = "redbeat.RedBeatScheduler"` in settings
3. Set `REDBEAT_REDIS_URL` to the Upstash Redis URL
4. Remove the dedicated Beat Koyeb service — any worker can now run Beat

**Trade-offs:**
- Adds Redis dependency for scheduler state (currently only broker + cache)
- Upstash free-tier command budget impact (~500 extra commands/day for 16 tasks)
- More complex debugging (schedule state in Redis vs. local memory)

**Recommendation:** Migrate when adding >1 Celery worker instance or when Beat reliability becomes critical.
