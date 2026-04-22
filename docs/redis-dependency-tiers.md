# Redis Dependency Tiers

Operational guide for the accepted policy in
`docs/decision/2026-04-21-adr-007-redis-dependency-policy.md`.

## Summary

Redis is a degraded-mode dependency for MIHAS, not a universal hard-failure
dependency.

Current policy:
- JTI blacklist reads: fail closed after retry
- JTI blacklist writes: log critical, do not block request
- refresh token rotation lock: fail open
- rate limiting: fail open
- readiness: Postgres hard-failure, Redis degraded-only

## Usage Inventory

| Use Case | Location | Behavior When Redis Is Down |
|----------|----------|-----------------------------|
| JTI blacklist read | `backend/apps/accounts/tokens.py` | Fail closed after retry |
| JTI blacklist write | `backend/apps/accounts/tokens.py` | Log critical, continue |
| Token rotation lock | `backend/apps/accounts/tokens.py` | Fail open |
| Rate limiting | `backend/apps/common/middleware.py` | Fail open |
| Celery broker | `backend/config/settings/base.py` | Delivery delayed until broker recovers |
| Uptime state | `backend/apps/common/tasks.py` | Operational signal degraded |
| Health ping | `backend/apps/common/health.py` | Readiness shows `redis: degraded` |

## Monitoring Consequences

- `/health/ready/` does not alert on Redis-only outage because it remains `200`
- `/health/redis/` exists for Redis-only paging without changing readiness semantics
- do not treat Redis-only degradation as a reason to recycle healthy web pods

## Operator Checklist

1. Confirm Postgres state first. If Postgres is healthy, app traffic can still
   be partially functional during Redis degradation.
2. Check auth symptoms:
   - more forced re-logins can indicate blacklist read failures
   - duplicate refresh rotations can indicate rotation-lock degradation
3. Check background delivery backlog if the Celery broker path is impaired.

## Incident Runbook

Use [docs/runbooks/redis-incident-response.md](/home/cosmas/Downloads/mihasv3/docs/runbooks/redis-incident-response.md) during Redis outages or cache/broker degradation.

## Maintenance Rule

If code behavior changes in:
- `backend/apps/accounts/tokens.py`
- `backend/apps/common/health.py`
- `backend/apps/common/middleware.py`
- `backend/DEPLOY.md`

then this document and ADR-007 must be updated in the same change.
