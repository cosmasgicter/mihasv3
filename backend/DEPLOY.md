# Koyeb Deployment Guide - MIHAS Django API

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
| `check_uptime_task` | Every 300 seconds (5 minutes) | Internal health check with email alerts on failure/recovery |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC | Purge expired audit log records by retention category |

Set the same environment variables as the worker service. Do not scale the beat service beyond 1 instance — running multiple beat processes will cause duplicate task dispatches.

## Backend environment variables

Set these in both Koyeb services unless noted otherwise. The same list is captured in [backend/.env.example](/home/cosmas/Downloads/mihasv3/backend/.env.example).

| Variable | Required | Example / Notes |
| --- | --- | --- |
| `DJANGO_SETTINGS_MODULE` | yes | `config.settings.prod` |
| `SECRET_KEY` | yes | Long random string |
| `DATABASE_URL` | yes | Neon pooled Postgres URL with SSL |
| `REDIS_URL` | yes | `rediss://...` for Upstash or hosted Redis |
| `CELERY_BROKER_URL` | recommended | Usually same value as `REDIS_URL` |
| `JWT_SIGNING_KEY` | yes | Separate long random signing key |
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

The `/health/ready/` endpoint verifies that both Postgres (Neon) and Redis (Upstash) are reachable. A non-200 response means at least one backing service is down.

### Limitations of external monitoring

UptimeRobot checks reachability from outside the network. It will detect full outages and DNS failures, but it may not catch partial failures where the web process is running but a backing service (database or Redis) is degraded between checks. The internal `check_uptime_task` Celery periodic task (see Celery Beat section below) provides a secondary layer that catches these cases.

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
