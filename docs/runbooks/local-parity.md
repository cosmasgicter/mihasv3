# Local Parity Runbook

Date: 2026-11-09
Scope: how to run the backend and its tests against a local Postgres and Redis so development matches production behaviour. The supported local stack is the isolated harness under `harness/`; `LOCAL-TESTING.md` is its guide.

## The supported stack

Bring it up with one command from the repository root:

```bash
bash harness/bin/local-setup.sh
```

It runs Postgres 17, Redis, MinIO (S3-compatible storage), Mailpit (captured email), a Lenco-shaped payment adapter, the web process, a Celery worker and Celery beat, behind Caddy at `http://localhost:8090`. It starts from an empty database and seeds the example tenants. See `LOCAL-TESTING.md` for the prerequisites, the seeded sign-ins, the table of where each concern goes (nothing contacts an outside host) and `bash harness/bin/harness down` to wipe it.

Do not point a local process at `backend/.env`: its `DATABASE_URL` names the Neon authoring database.

## Run the backend tests on your machine

Tests run against a throwaway Postgres you start yourself, never against Neon or production. Start a Postgres 16 container on a free local port, then:

```bash
cd backend
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/test_mihas
export REDIS_URL=redis://127.0.0.1:6379/0
python3 -m pytest
python3 manage.py check
```

The host-side production-parity check uses Redis- and Postgres-backed settings:

```bash
REDIS_URL=redis://localhost:6379/1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/test_mihas \
scripts/check-backend-production-parity.sh
```

Do not set `TESTING=1` for readiness checks. That mode is for selected tests only and is not acceptable evidence for Redis-backed auth, cache, or rate-limit readiness.

## When to use which

- Reproducing what a student sees (uploads, signed document links, mail, payment states, scheduled sweeps): the harness stack above.
- ORM or schema drift, Celery queue behaviour, Redis-backed auth and rate-limit behaviour, contract tests: the pytest run above.

Verify object storage on the harness with `docker compose -f harness/docker-compose.harness.yml exec web python manage.py storage_roundtrip_check --expect-private` (the journey gate runs it too).
