# Koyeb Deployment Guide - Beanola Django API

## Required topology

- Backend API: `api.mihas.edu.zm` on Koyeb
- Frontend app: `apply.mihas.edu.zm` on Vercel

Do not use the default `*.vercel.app` domain for authenticated production traffic. The backend is configured for shared cookies on `.mihas.edu.zm` with `SameSite=Lax`, so the frontend and API must stay on sibling `mihas.edu.zm` subdomains for login, refresh, CSRF, and session flows to work correctly.

## Koyeb web service

Create a Koyeb `WEB` service from this GitHub monorepo with these settings:

- Source: GitHub repository
- Branch: your production branch
- Builder: Dockerfile
- Work directory: `backend`
- Dockerfile location: `Dockerfile`
- Command override: leave empty and use the image default command
- Exposed port: `8000`
- Route: `/`
- Health check protocol: HTTP
- Health check path: `/health/ready/`
- Instance count: start with `1`
- `PORT`: `8000`
- `WEB_CONCURRENCY`: `3`

The image default command is defined in [Dockerfile](/home/cosmas/Downloads/mihasv3/backend/Dockerfile) and starts Uvicorn in ASGI mode.

## Koyeb worker service

Create a second Koyeb `WORKER` service from the same repo:

- Source: same GitHub repository and branch
- Builder: Dockerfile
- Work directory: `backend`
- Dockerfile location: `Dockerfile`
- Command override: `celery -A config worker -l info`
- No exposed port
- Instance count: start with `1`

## Koyeb beat service

Create a third Koyeb `WORKER` service from the same repo for the Celery Beat scheduler:

- Source: same GitHub repository and branch
- Builder: Dockerfile
- Work directory: `backend`
- Dockerfile location: `Dockerfile`
- Command override: `celery -A config beat -l info`
- No exposed port
- Instance count: `1` (must remain exactly 1 to avoid duplicate task dispatches)

Celery Beat reads the `CELERY_BEAT_SCHEDULE` from Django settings and dispatches periodic tasks to the Celery worker queue. The current schedule includes:

| Task | Schedule | Purpose |
| --- | --- | --- |
| `keep_alive_task` | Every 240 seconds (4 minutes) | Lightweight ping to prevent Koyeb cold starts |
| `check_uptime_task` | Every 900 seconds (15 minutes) | Internal health check with email alerts on failure/recovery |
| `cleanup_stale_sessions_task` | Daily at 02:30 UTC | Purge expired device sessions |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC | Purge expired audit log records by retention category |
| `poll_pending_payments_task` | Every 600 seconds (10 minutes) | Poll Lenco API for pending payments, expire payments > 24h |
| `intake_manager_task` | Daily at 04:00 UTC | Ensure ≥2 open intakes exist (Jan/Jul pattern) |
| `condition_expiry_task` | Daily at 05:00 UTC | Expire overdue admission conditions, trigger auto-rejection |
| `draft_expiry_reminder_task` | Daily at 06:00 UTC | Remind students about stale drafts, expire at 30 days |
| `review_sla_reminder_task` | Daily at 07:00 UTC | Notify admins about applications exceeding review SLA |
| `document_verification_sla_task` | Daily at 08:00 UTC | Notify admins about documents pending beyond SLA, escalate at 2x |
| `enrollment_confirmation_expiry_task` | Daily at 09:00 UTC | Expire unconfirmed enrollments, release spots to waitlist |
| `waitlist_cascade_task` | Daily at 10:00 UTC | Cascade waitlisted applications to next intake |
| `deferred_payment_reminder_task` | Daily at 11:00 UTC | Remind students with deferred payments to complete payment |
| `interview_auto_complete_task` | Every 7200 seconds (2 hours) | Auto-complete interviews whose scheduled time has passed |
| `interview_reminder_task` | Every 3600 seconds (1 hour) | Send reminder notifications for interviews within 24 hours |
| `cleanup_idempotency_keys` | Daily at 03:00 UTC | Purge expired idempotency key records |
| `process_pending_emails_task` | Every 120 seconds (2 minutes) | Sweep stale pending EmailQueue rows |

Set the same environment variables as the worker service. Do not scale the beat service beyond 1 instance — running multiple beat processes will cause duplicate task dispatches.

## Backend environment variables

Set these in both Koyeb services unless noted otherwise. The same list is captured in [backend/.env.example](/home/cosmas/Downloads/mihasv3/backend/.env.example).

| Variable | Required | Example / Notes |
| --- | --- | --- |
| `DJANGO_SETTINGS_MODULE` | yes | `config.settings.prod` |
| `SECRET_KEY` | yes | Long random string |
| `DATABASE_URL` | yes | Neon pooled Postgres URL with SSL |
| `REDIS_URL` | yes | `rediss://...` for Upstash or hosted Redis. Used by Celery, cache-backed rate limiting, uptime state, token rotation coordination, and JTI blacklist storage. |
| `CELERY_BROKER_URL` | recommended | Usually same value as `REDIS_URL`. If omitted, the app falls back to `REDIS_URL`. |
| `JWT_SIGNING_KEY` | yes | Separate long random signing key |
| `AUDIT_LOG_ENCRYPTION_KEY` | yes | Fernet key for encrypted raw audit network context. Generate with `python - <<'PY'\nfrom cryptography.fernet import Fernet\nprint(Fernet.generate_key().decode())\nPY` |
| `ALLOWED_HOSTS` | yes | `.beanola.com,.mihas.edu.zm,.katc.edu.zm` |
| `CORS_ALLOWED_ORIGINS` | yes | `https://apply.mihas.edu.zm` |
| `CORS_ALLOWED_ORIGIN_REGEXES` | recommended | `^https://([A-Za-z0-9-]+\.)*beanola\.com$,^https://([A-Za-z0-9-]+\.)*mihas\.edu\.zm$,^https://([A-Za-z0-9-]+\.)*katc\.edu\.zm$` |
| `RESEND_API_KEY` | yes | Resend production API key |
| `EMAIL_FROM` | recommended | `admissions@mihas.edu.zm` |
| `S3_ENDPOINT_URL` | yes | Cloudflare R2 S3 endpoint |
| `S3_BUCKET` | yes | R2 bucket name |
| `S3_ACCESS_KEY` | yes | R2 access key |
| `S3_SECRET_KEY` | yes | R2 secret key |
| `PORT` | optional | `8000` |
| `WEB_CONCURRENCY` | optional | `3` — recommended starting value |
| `ERROR_ALERT_EMAIL` | optional | `admin@mihas.edu.zm` — recipient for error alert emails |
| `READ_ONLY_MODE` | optional | `false` |

`CSRF_TRUSTED_ORIGINS` is not used by the current settings module, so do not add it unless the backend is changed to read it.

## First deploy checklist

1. Provision Neon Postgres and copy the pooled `DATABASE_URL`.
2. Provision Redis and copy the TLS `REDIS_URL`.
3. Provision Cloudflare R2 and copy the S3-compatible endpoint and credentials.
4. Create a Resend API key.
5. Create the Koyeb web service with the settings above.
6. Create the Koyeb worker service with the same env vars.
7. Run `python manage.py migrate` once against the production database before scaling above one replica.
8. Add the Koyeb custom domain `api.mihas.edu.zm`.
9. Point DNS for `api.mihas.edu.zm` to the Koyeb target shown in the dashboard.

## Scaling guidance

The default `WEB_CONCURRENCY=3` runs three Uvicorn worker processes inside a single Koyeb instance. This is the recommended starting point for the current traffic profile.

### When to add more instances

Scale horizontally (increase Koyeb instance count) when any of these thresholds are sustained for more than 5 minutes:

| Signal | Threshold | Where to check |
| --- | --- | --- |
| CPU saturation | >80% average across workers | Koyeb instance metrics |
| Memory pressure | >85% of instance memory | Koyeb instance metrics |
| p95 response latency | >2 seconds | Application logs or UptimeRobot response times |

### Scaling steps

1. Increase the Koyeb web service instance count from 1 to 2 (or more).
2. Ensure `python manage.py migrate` has already been run — migrations must complete before running multiple replicas.
3. Keep `WEB_CONCURRENCY=3` per instance unless the instance size changes. Adjust only if the instance memory or CPU allocation is modified.
4. Monitor the thresholds above after scaling to confirm the bottleneck is resolved.

### When to increase WEB_CONCURRENCY instead

If the workload is I/O-bound (waiting on Neon Postgres, Redis, or Resend) rather than CPU-bound, increasing `WEB_CONCURRENCY` on the existing instance may be more cost-effective than adding instances. Do not exceed the number of available vCPUs × 2.

## Uptime Monitoring

Use [UptimeRobot](https://uptimerobot.com/) (free tier) as the primary external uptime monitor. The free plan includes 50 monitors with 5-minute check intervals, which is sufficient for this deployment.

### UptimeRobot setup

1. Create a free account at https://uptimerobot.com/.
2. Add a new monitor with these settings:

| Setting | Value |
| --- | --- |
| Monitor type | HTTP(s) |
| Friendly name | `MIHAS API` |
| URL | `https://api.mihas.edu.zm/health/ready/` |
| Monitoring interval | 5 minutes |

3. Under "Alert Contacts", add the operations team email (e.g. `admin@mihas.edu.zm`).
4. Save the monitor.

UptimeRobot will send an email alert when `/health/ready/` returns a non-200 status or becomes unreachable, and a recovery email when it comes back up.

### What the health endpoint checks

The `/health/ready/` endpoint always checks both Postgres (Neon) and Redis (Upstash), but it does not treat them equally:

- Postgres unavailable -> returns HTTP `503`
- Postgres healthy, Redis unavailable -> returns HTTP `200` with `redis: degraded`

This is intentional in the current code. Redis degradation should not cause Koyeb to restart an otherwise healthy web instance.

### Limitations of external monitoring

UptimeRobot checks reachability from outside the network. It will detect full outages and DNS failures, but it will not page on Redis-only degradation because `/health/ready/` intentionally remains `200` in that mode. The internal `check_uptime_task` Celery periodic task provides a secondary signal, but it also uses `/health/ready/`, so it follows the same readiness contract.

If Redis outage alerting is required, add a dedicated Redis monitor or change the readiness contract after making an explicit dependency-tier decision.

### Dedicated Redis monitor

To alert on Redis-only outages without changing the current readiness contract, create a second external monitor:

| Setting | Value |
| --- | --- |
| Monitor type | HTTP(s) |
| Friendly name | `MIHAS Redis` |
| URL | `https://api.mihas.edu.zm/health/redis/` |
| Monitoring interval | 5 minutes |

This endpoint returns:

- `200` when Redis is reachable
- `503` when Redis is unavailable

Use it for paging and incident routing only. Do not point Koyeb instance health checks at `/health/redis/`, because Redis-only outages should not force healthy web instances to restart.

## Current dependency behavior

The current runtime is availability-biased under Redis incidents. Operators should know the exact behavior:

- Postgres down: requests that need the database fail, and `/health/ready/` returns `503`
- Redis down: `/health/ready/` returns `200` with degraded Redis state
- Rate limiting cache unavailable: rate limiting fails open
- Refresh token rotation lock unavailable: rotation deduplication fails open
- JTI blacklist read fails twice: auth fails closed for that refresh token check

This is the code’s current behavior, not a final architecture recommendation. If you want stricter security semantics, change the auth/dependency policy first and then update the health contract and runbooks to match.

Incident response for Redis outages lives in [docs/runbooks/redis-incident-response.md](/home/cosmas/Downloads/mihasv3/docs/runbooks/redis-incident-response.md).

## Vercel frontend checklist

Create a separate Vercel project from the same monorepo:

- Git repository: this repo
- Root directory: `apps/admissions`
- Framework preset: Other / Vite auto-detection is fine
- Install command: `bun install`
- Build command: `bunx --bun vite build`
- Output directory: `dist`
- Production domain: `apply.mihas.edu.zm`

These build settings are already encoded in [vercel.json](/home/cosmas/Downloads/mihasv3/apps/admissions/vercel.json).

## Frontend environment variables

Set these in the Vercel project. The example file lives at [apps/admissions/.env.example](/home/cosmas/Downloads/mihasv3/apps/admissions/.env.example).

| Variable | Required | Example / Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | recommended | `https://api.mihas.edu.zm` |
| `VITE_APP_BASE_URL` | recommended | `https://apply.mihas.edu.zm` |
| `VITE_SITE_URL` | recommended | `https://apply.mihas.edu.zm` |
| `VITE_APP_VERSION` | recommended | release tag or commit SHA |
| `VITE_ENABLE_AUTO_RELOAD` | optional | `false` in production |
| `VITE_ENABLE_LOADER_TELEMETRY` | optional | `false` in production |
| `VITE_ERROR_REPORT_ENABLED` | optional | `true` — enables frontend error reporter |

Note: `VITE_API_BASE_URL` should be the API origin. The frontend client already appends `/api/v1`.

## DNS

- Point `api.mihas.edu.zm` to Koyeb.
- Point `apply.mihas.edu.zm` to Vercel.
- Keep both on `mihas.edu.zm` subdomains to preserve same-site cookie auth.
