# Redis Recovery Runbook

## What Breaks When Redis Is Down

| Component | Impact | Failure Mode |
|-----------|--------|--------------|
| JTI blacklist (`is_jti_blacklisted`) | Revoked refresh tokens may be accepted OR all refresh tokens rejected | Retries once, then **fails closed** (rejects all refresh tokens) — secure but disruptive |
| JTI blacklist writes (`blacklist_jti`) | Revoked tokens not persisted — old tokens remain valid until expiry | Logs CRITICAL, does **not** raise — login/logout still works |
| Token rotation lock | Concurrent rotation of the same refresh token possible | Falls back to no-lock with warning — minor replay window |
| Rate limiting | Rate limits not enforced | **Fails open** with warning log |
| Celery workers | Background tasks stop processing | Workers reconnect automatically when Redis returns |
| Celery Beat | Periodic tasks stop scheduling | Beat reconnects automatically when Redis returns |
| CSRF validation | **Not affected** — CSRF tokens are stored in Postgres (`csrf_tokens` table) | No Redis dependency |
| Health check (`/health/ready/`) | Reports `redis: degraded`, still returns HTTP 200 | Does not trigger Koyeb restart |

## How to Verify Redis Is Back

```bash
# From a machine with Redis access:
redis-cli -u "$REDIS_URL" PING
# Expected: PONG

# Or via Django shell:
python manage.py shell -c "
from django.core.cache import cache
cache.set('_recovery_test', '1', 10)
print('OK' if cache.get('_recovery_test') == '1' else 'FAIL')
"

# Check health endpoint:
curl -s https://api.mihas.edu.zm/health/ready/ | python3 -m json.tool
# Look for: "redis": "ok"
```

## How to Flush Stale Data After Recovery

```bash
# Flush only health-check keys (safe):
redis-cli -u "$REDIS_URL" DEL _health_ping

# Flush all rate-limit keys (resets all rate counters):
redis-cli -u "$REDIS_URL" --scan --pattern "throttle:*" | xargs -r redis-cli -u "$REDIS_URL" DEL

# Flush expired rotation locks:
redis-cli -u "$REDIS_URL" --scan --pattern "token_rotation:*" | xargs -r redis-cli -u "$REDIS_URL" DEL

# Nuclear: flush entire Redis (destroys JTI blacklist — see below):
redis-cli -u "$REDIS_URL" FLUSHDB
```

## How to Force-Rotate All Tokens If JTI Blacklist Was Lost

If Redis was flushed or data was lost, previously-revoked refresh tokens may become valid again until they expire (up to 7 days). To mitigate:

1. **Assess risk**: If Redis was down briefly and recovered with data intact, no action needed. The JTI keys have TTLs matching token lifetime — they self-clean.

2. **If JTI data was lost** (FLUSHDB, instance replacement, etc.):

   ```bash
   # Option A (Recommended): Run the JTI recovery command
   # Force-expires all active device sessions, requiring all users to re-authenticate.
   # See the "JTI Blacklist Recovery Command" section below for details.
   python manage.py recover_jti_blacklist

   # Option B: Rotate the JWT signing key (invalidates ALL tokens immediately)
   # Update JWT_SIGNING_KEY in production environment variables (Koyeb dashboard).
   # All users will be logged out and must re-authenticate.
   # See: docs/runbooks/secrets-rotation.md for the full procedure.

   # Option C: Wait it out
   # Access tokens expire in 30 minutes. Refresh tokens expire in 7 days.
   # If the security risk is acceptable, tokens will naturally expire.
   ```

3. **Verify recovery**:
   ```bash
   # Confirm new JTI writes are working:
   python manage.py shell -c "
   from apps.accounts.tokens import blacklist_jti, is_jti_blacklisted
   blacklist_jti('test-recovery-jti', ttl_seconds=30)
   print('OK' if is_jti_blacklisted('test-recovery-jti') else 'FAIL')
   "
   ```

## JTI Blacklist Recovery Command

### When to Run

Run `recover_jti_blacklist` after any event that causes JTI blacklist data loss:

- Redis `FLUSHDB` or `FLUSHALL`
- Redis instance replacement or failover
- Upstash plan migration that resets data
- Any scenario where Redis keys are lost but the database is intact

### Command Invocation

```bash
# From the backend directory (or via Koyeb one-off task):
python manage.py recover_jti_blacklist
```

### What It Does

Since raw JWTs are not stored in the database, the command takes a conservative approach:

1. Verifies Redis is reachable (exits with code 1 if not)
2. Queries `device_sessions` for active sessions (`is_active=True`, `expires_at > now`)
3. Force-expires all active sessions by setting `expires_at = now`
4. Logs the count of sessions invalidated and expired sessions skipped

### Expected Output

```
Recovery complete: 42 sessions invalidated, 7 expired sessions skipped.
```

If Redis is unreachable:

```
Redis is unreachable: <error details>. Aborting recovery.
```

The command exits with code 1 in this case.

### Impact

- All users with active sessions will be logged out and must re-authenticate
- Access tokens (30-minute lifetime) will continue to work until they expire
- Refresh tokens will fail immediately since their device sessions are expired
- No data is deleted — sessions are only expired, preserving audit history

## Monitoring

- **Internal**: `check_uptime_task` (every 15 min) hits `/health/ready/` which checks Redis. Alerts on healthy→unhealthy transition.
- **External**: UptimeRobot monitors `/health/ready/` every 5 min.
- **Logs**: Search for `Redis read failed for JTI blacklist` or `Redis write failed for JTI blacklist` in application logs to detect silent failures.
