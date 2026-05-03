# Local Parity Runbook

Date: 2026-04-21
Scope: Run the backend against local Postgres and Redis so development is closer to production than SQLite-only or external-service-only setups.

## Purpose

This setup gives you:
- local Postgres on `localhost:5432`
- local Redis on `localhost:6379`
- optional local Celery Beat for scheduled-task parity
- fewer surprises compared with debugging only against remote Neon/Redis

## Default Compose Behavior

[backend/docker-compose.yml](/home/cosmas/Downloads/mihasv3/backend/docker-compose.yml) now defaults to:
- Postgres service: `postgres:16-alpine`
- Redis service: `redis:7-alpine`
- web service using local Postgres when `DATABASE_URL` is not set
- celery worker using local Postgres when `DATABASE_URL` is not set

Optional parity service:
- `celery-beat` under the `parity` profile

## Start The Stack

From `backend/`:

```bash
docker compose up --build
```

This starts:
- `postgres`
- `redis`
- `web`
- `celery`

To include beat:

```bash
docker compose --profile parity up --build
```

## Default Local Credentials

If you do not override env vars:

- database name: `mihas_local`
- database user: `postgres`
- database password: `postgres`
- database URL used by containers: `postgresql://postgres:postgres@postgres:5432/mihas_local`

## Common Flows

Run migrations against local Postgres:

```bash
docker compose exec web python3 manage.py migrate
```

Run backend checks:

```bash
docker compose exec web python3 manage.py check
```

Run the host-side production-parity check with Redis/Postgres-backed settings:

```bash
cd ..
REDIS_URL=redis://localhost:6379/1 \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mihas_local \
scripts/check-backend-production-parity.sh
```

Do not set `TESTING=1` for readiness checks. That mode is for selected tests
only and is not acceptable evidence for Redis-backed auth, cache, or rate-limit
readiness.

Run tests from the host against local Postgres:

```bash
cd backend
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mihas_local
export REDIS_URL=redis://localhost:6379/0
python3 -m pytest
```

## Override For Remote Services

If you want to keep using Neon or hosted Redis, set `DATABASE_URL` or `REDIS_URL` in `backend/.env`.

Compose will still start the local services, but the app will use your explicit external URLs instead of the defaults.

## When To Use This

Use this parity mode when debugging:
- ORM/schema drift
- Celery queue behavior
- Redis-backed auth/rate-limit behavior
- contract tests that should behave like production storage
