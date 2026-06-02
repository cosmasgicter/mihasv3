# Redis Incident Response Runbook

Date: 2026-04-21
Scope: Redis outages and degraded behavior for MIHAS backend, Celery, auth coordination, and cache-backed rate limiting.

## Purpose

This runbook exists because MIHAS is intentionally availability-biased under Redis degradation. A Redis outage does not fully take the platform down, but it does change behavior in ways operators must understand quickly.

Reference policy:
- [docs/decision/2026-04-21-adr-007-redis-dependency-policy.md](/home/cosmas/Downloads/mihasv3/docs/decision/2026-04-21-adr-007-redis-dependency-policy.md)
- [docs/redis-dependency-tiers.md](/home/cosmas/Downloads/mihasv3/docs/redis-dependency-tiers.md)
- [backend/DEPLOY.md](/home/cosmas/Downloads/mihasv3/backend/DEPLOY.md)

## What breaks when Redis is down

- `/health/ready/` still returns `200` if Postgres is healthy, with `redis: degraded`
- `/health/redis/` returns `503`
- Celery broker/result backend traffic is impaired or stalled
- rate limiting fails open
- refresh token rotation lock fails open
- JTI blacklist reads fail closed after retry
- JTI blacklist writes log critical failures and continue
- uptime transition memory is degraded

## Detection

Primary signals:
- external monitor on `https://api.mihas.edu.zm/health/redis/`
- Koyeb worker logs showing broker/connectivity errors
- web logs showing Redis cache or broker failures
- increased forced re-login complaints during refresh flows
- delayed or stuck email/backlog processing

Secondary signals:
- `/health/ready/` shows `redis: degraded`
- `check_uptime_task` logs transition-memory failures

## Immediate triage

1. Confirm scope.
   - Check `https://api.mihas.edu.zm/health/live/`
   - Check `https://api.mihas.edu.zm/health/ready/`
   - Check `https://api.mihas.edu.zm/health/redis/`

2. Confirm whether Postgres is healthy.
   - If Postgres is also unhealthy, treat as broader platform incident.
   - If only Redis is unhealthy, continue with this runbook.

3. Check worker impact.
   - Inspect Koyeb worker logs for broker connection failures.
   - Confirm whether Celery queues are draining after reconnect.

4. Check auth symptoms.
   - Expect some refresh failures because blacklist reads fail closed after retry.
   - Expect rotation coordination to weaken because the Redis lock fails open.

## Containment guidance

- Do not restart healthy web pods just because Redis is degraded.
- Do not change `/health/ready/` semantics during an incident.
- Do not flush Redis as a routine recovery step unless you are intentionally accepting revocation/rate-limit state loss.

## Recovery steps

1. Restore Redis service connectivity first.
2. Verify `GET /health/redis/` returns `200`.
3. Verify Celery worker reconnects cleanly.
4. Trigger or wait for queue draining:
   - email backlog should resume through normal worker/sweep behavior
5. Verify auth flows:
   - login
   - refresh
   - logout
   - revoke session
6. Confirm `GET /health/ready/` still shows `db: ok` and `redis: ok`.

## If Redis was flushed or lost state

Operational consequence:
- JTI blacklist state is lost
- cache-backed rate-limit counters are lost
- uptime transition memory is lost

Required follow-up:
1. Record the incident as a security-affecting degradation.
2. Notify operators that revoked refresh tokens may become valid again until their normal expiration window.
3. Consider rotating JWT signing keys if the incident included confirmed token compromise, not just infrastructure loss.
4. Watch for abnormal auth activity after recovery.

## Verification checklist after recovery

- `/health/live/` returns `200`
- `/health/ready/` returns `200` with `db: ok` and `redis: ok`
- `/health/redis/` returns `200`
- worker logs no longer show broker errors
- new emails are leaving the queue
- refresh/logout/session revoke flows behave normally

## Follow-up actions

- Document incident start/end time and impact
- Capture whether Redis outage affected auth, queueing, or operator traffic
- Update this runbook, ADR-007, or `backend/DEPLOY.md` if actual behavior differed from documented behavior
