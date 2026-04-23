# ADR-007: Redis Dependency Policy

Date: 2026-04-21
Status: Accepted

## Context

Redis is used for multiple concerns with different blast radii:
- Celery broker / worker coordination
- rate limiting
- token rotation coordination
- JTI blacklist storage
- uptime state
- cache-backed health diagnostics

The repo previously had mixed behavior without a written decision.

## Decision

The platform is availability-biased under Redis outages, except where auth
security requires a stricter stance.

Policy by concern:

1. JTI blacklist reads: fail closed after retry.
   Reason: if revocation state cannot be checked, treat the token as unsafe.

2. JTI blacklist writes: log critical failure, do not block request flow.
   Reason: preserve primary request completion while surfacing a serious auth
   degradation event.

3. Refresh token rotation lock: fail open.
   Reason: Redis lock loss should not force mass logout; duplicate rotation is
   treated as lower severity than broad auth outage.

4. Rate limiting: fail open.
   Reason: Redis outage must not turn into total API denial for legitimate
   traffic.

5. Readiness: Postgres is hard-failure; Redis-only outage is degraded mode.
   Reason: restarting healthy web instances on Redis-only failure worsens
   availability without restoring Redis.

## Operational Meaning

- `/health/ready/` returns `503` when Postgres is down
- `/health/ready/` returns `200` with degraded Redis state when only Redis is down
- external uptime monitoring will not alert on Redis-only degradation unless a
  separate Redis monitor exists

## Consequences

Positive:
- matches current code behavior
- gives operators a concrete contract
- avoids accidental policy drift between auth, health, and deployment docs

Negative:
- Redis outages can weaken some guarantees without taking the platform fully down
- teams must understand which paths are degraded rather than fully unavailable

## Follow-ups

1. Keep `backend/DEPLOY.md`, `docs/redis-dependency-tiers.md`, and
   `backend/apps/common/health.py` aligned.
2. Add dedicated Redis monitoring if Redis-only degradation should alert.
