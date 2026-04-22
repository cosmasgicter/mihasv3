# Scaling Playbook

## Backend (Koyeb)

**Current:** 1 Uvicorn instance with 2-3 workers (ASGI, `config.asgi:application`).

**To scale:**
1. Add instances via Koyeb dashboard (Service → Scale → Instances)
2. Session affinity not required — auth is stateless JWT via cookies
3. Each instance needs its own DB and Redis connections
4. Monitor connection pool exhaustion via `/health/ready/`

**Limits:** Neon free tier connection limits apply per-instance.

## Celery Workers

**Current:** Single worker process with default concurrency.

**To scale:**
- Increase concurrency: `celery -A config worker --concurrency=4` (for I/O-bound tasks)
- Add worker instances via separate Koyeb service
- Each worker opens Redis connections — Upstash free tier allows max 100 concurrent connections
- Monitor with `check_missed_tasks` management command

**Recommended concurrency:** 2-4 for I/O-bound tasks (email, API calls, document processing).

## Neon Postgres

**Current:** 0.25 CU tier.

**Connection pool:**
- `CONN_MAX_AGE=300` — reuse connections for 5 minutes to reduce connection overhead on Neon's serverless proxy
- Neon 0.25 CU supports ~100 concurrent connections
- Each Uvicorn worker + Celery worker consumes 1 connection

**To scale:**
1. Upgrade CU tier via Neon dashboard
2. Enable connection pooling (PgBouncer) if connection count exceeds limits
3. Monitor via Neon dashboard metrics

## Vercel Frontends

**Automatic scaling** — no manual intervention required. Vercel Edge Network handles CDN, SSL, and auto-scaling for both `apps/admissions` and `apps/jobs-ops`.

## Redis (Upstash)

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
