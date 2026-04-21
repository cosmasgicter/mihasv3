# Redis Dependency Tiers

Redis serves multiple roles. This document defines what happens when Redis is unavailable.

## Usage Inventory

| Use Case | Location | Redis Key Pattern | Tier |
|----------|----------|-------------------|------|
| JTI Blacklist | `accounts/tokens.py` | `jti:{uuid}` | Security-Critical |
| Token Rotation Lock | `accounts/tokens.py` | `token_rotation:{jti}` via Django cache | Coordination |
| Celery Broker | `config/settings/base.py` | Celery internal | Infrastructure |
| Celery Task Locks | `applications/tasks.py`, `documents/tasks.py` | `celery_lock:{task_name}` | Coordination |
| Uptime Status | `common/tasks.py` | `uptime:last_status` | Operational |
| Rate Limiting | `common/middleware.py` | `rl:{hash}` via Django cache | Protection |
| Analytics Cache | `analytics/views.py` | `analytics:{key}` | Performance |
| Health Check Ping | `common/health.py` | `_health_ping` | Diagnostic |

## Behavior When Redis Is Down

### Tier 1: Security-Critical — Fail Closed

| Use Case | Behavior | Impact | Correct? |
|----------|----------|--------|----------|
| **JTI Blacklist read** (`is_jti_blacklisted`) | Returns `True` (blacklisted) after 1 retry | Valid tokens rejected → user must re-login | ✅ Yes — secure default |
| **JTI Blacklist write** (`blacklist_jti`) | Logs CRITICAL, does NOT raise | Old token remains valid until expiry | ⚠️ Acceptable — 30min window max |

### Tier 2: Coordination — Fail Open

| Use Case | Behavior | Impact | Correct? |
|----------|----------|--------|----------|
| **Token Rotation Lock** | `cache.add()` fails → lock not acquired → rotation proceeds | Risk of duplicate token pair — not a security issue | ✅ Yes |
| **Celery Task Locks** | `cache.add()` fails → lock not acquired → task runs | Risk of duplicate task execution — idempotent tasks handle this | ✅ Yes |

### Tier 3: Infrastructure — Service Degraded

| Use Case | Behavior | Impact | Correct? |
|----------|----------|--------|----------|
| **Celery Broker** | `.delay()` raises `ConnectionError` | Background tasks don't dispatch — outbox rows (EmailQueue) still persist | ⚠️ Email/notification delivery delayed until broker recovers |
| **Rate Limiting** | Should fail open (allow request) | If fails closed: all requests blocked | Verify middleware handles this |

### Tier 4: Performance — Graceful Degradation

| Use Case | Behavior | Impact | Correct? |
|----------|----------|--------|----------|
| **Analytics Cache** | Cache miss → query DB directly | Slower but correct | ✅ Yes |
| **Uptime Status** | `cache.get()` returns None → treated as first check | May send duplicate alert on recovery | ✅ Acceptable |
| **Health Check** | `_check_redis()` returns False → readiness reports `redis: degraded` | Monitoring alerted | ✅ Yes |

## Rate Limiting Fail-Open Verification

The `RateLimitMiddleware` in `common/middleware.py` uses Django cache (`cache.add`, `cache.get`). If Redis is down, these calls raise `ConnectionError`. The middleware should catch this and allow the request through:

```python
try:
    # rate limit check
except Exception:
    # Redis down — fail open, allow request
    return self.get_response(request)
```

## Recommendations

1. **JTI blacklist**: Current fail-closed behavior is correct. No change needed.
2. **Rate limiting**: Ensure fail-open. Wrap Redis calls in try/except.
3. **Celery broker**: The outbox pattern (EmailQueue) provides durability for email. Other tasks (payment polling, intake management) will retry on next Beat cycle.
4. **Monitor**: Alert on `redis: degraded` in health check. Don't page — it's degraded, not down.
