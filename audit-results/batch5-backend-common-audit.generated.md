# BATCH 5 — Backend Common Module Audit

**Scope:** `backend/apps/common/` — 36 files  
**Auditor:** Automated deep-read audit  
**Date:** 2026-04-23

---

## Summary Table

| File | Classification |
|------|---------------|
| `middleware.py` | **improve** |
| `middleware_compat.py` | **suspicious-stale-path** |
| `idempotency.py` | **improve** |
| `notification_views.py` | **confirmed-bug** |
| `health.py` | **improve** |
| `tasks.py` | **improve** |
| `outbox.py` | **improve** |
| `celery_signals.py` | **improve** |
| `audit_network.py` | **improve** |
| `readonly.py` | **improve** |
| `permissions.py` | **zero-day-class-risk** |
| `error_views.py` | **improve** |
| `pagination.py` | **confirmed-bug** |
| `communication_service.py` | ignore-as-correct |
| `renderers.py` | ignore-as-correct |
| `exceptions.py` | ignore-as-correct |
| `models.py` | ignore-as-correct |
| `openapi.py` | ignore-as-correct |
| `openapi_helpers.py` | ignore-as-correct |
| `validators.py` | ignore-as-correct |
| `logging.py` | ignore-as-correct |
| `metrics.py` | ignore-as-correct |
| `apps.py` | ignore-as-correct |
| `views.py` | ignore-as-correct |
| `meta_views.py` | ignore-as-correct |
| `meta_urls.py` | ignore-as-correct |
| `notification_urls.py` | ignore-as-correct |
| `template_views.py` | ignore-as-correct |
| `template_urls.py` | ignore-as-correct |
| `email_urls.py` | ignore-as-correct |
| `error_urls.py` | ignore-as-correct |
| `email_templates.py` | ignore-as-correct |
| `env_validator.py` | ignore-as-correct |
| `storage.py` | ignore-as-correct |
| `ai_service.py` | ignore-as-correct |
| `jobs_ops_seed.py` | ignore-as-correct |
| `__init__.py` | ignore-as-correct |

---

## Detailed Findings

### 1. `permissions.py` — **zero-day-class-risk**

```python
class IsAuthenticatedOrDebug(BasePermission):
    def has_permission(self, request, view):
        if settings.DEBUG:
            return True
```

**Finding:** If `DEBUG=True` leaks into a staging or production deployment (misconfigured env, missing override), every endpoint using this permission becomes fully unauthenticated. This is a classic debug-bypass escalation vector.

**Action:** Replace with an explicit allowlist check (e.g., `settings.DEBUG and request.META.get("REMOTE_ADDR") in INTERNAL_IPS`) or remove entirely. Grep for usages — if nothing uses it in production views, delete it.

---

### 2. `notification_views.py` — **confirmed-bug**

**Finding 2a — `NotificationMarkAllReadView` does not set `read_at` timestamp:**

```python
# Line ~370
updated = Notification.objects.filter(
    user_id=request.user.pk, is_read=False
).update(is_read=True)
```

The single-notification `NotificationMarkReadView._mark_read()` correctly sets both `is_read=True` and `read_at=timezone.now()`. The bulk mark-all-read path only sets `is_read=True`, leaving `read_at=NULL`. This is a data contract drift — any frontend or admin query that relies on `read_at` for "when was this read" will get `null` for bulk-read notifications.

**Fix:**
```python
.update(is_read=True, read_at=timezone.now())
```

**Finding 2b — `NotificationListView.post()` bypasses DRF permission lifecycle:**

```python
def post(self, request):
    send_view = NotificationSendView()
    send_view.request = request
    if not _get_admin_permission()().has_permission(request, self):
        ...
    return send_view.post(request)
```

This manually instantiates `NotificationSendView` and calls `.post()` directly, bypassing DRF's `initial()` → `check_permissions()` → `check_throttles()` lifecycle. The manual `has_permission` check partially compensates, but throttling, content negotiation, and any future middleware-level checks on the send view are skipped. This is a correctness issue, not a security hole (admin check is present), but it's fragile.

**Action:** Consider redirecting via URL dispatch or calling `send_view.dispatch(request)` instead.

---

### 3. `pagination.py` — **confirmed-bug** (contract drift)

```python
class StandardPagination(PageNumberPagination):
    def get_paginated_response(self, data):
        return Response({
            "page": self.page.number,
            "pageSize": self.get_page_size(self.request),
            "totalCount": self.page.paginator.count,
            "results": data,
        })
```

**Finding:** The documented API contract is `{"success": true, "data": {page, pageSize, totalCount, results}}`. This paginator returns the raw `{page, pageSize, totalCount, results}` dict without the `success`/`data` envelope. The `EnvelopeRenderer` will wrap it as `{"success": true, "data": {"page": ..., "pageSize": ..., ...}}` — so the final wire format is correct **only if** `EnvelopeRenderer` is active. However, any view that uses `StandardPagination` via DRF's automatic pagination (e.g., `ListAPIView` with `pagination_class`) will get the envelope applied by the renderer, producing `{"success": true, "data": {"page": 1, ...}}` — which is correct.

**But:** The notification views in `notification_views.py` do NOT use `StandardPagination` at all — they manually construct the paginated response inline. This means `StandardPagination` may be dead code for the common module's own views. If any other app uses it with `GenericAPIView`, the renderer saves it. But the inconsistency between manual pagination in notification views and the existence of `StandardPagination` is a maintenance drift risk.

**Action:** Audit which views actually use `StandardPagination` vs. manual pagination. Consolidate to one pattern.

---

### 4. `middleware.py` — **improve**

**Finding 4a — Rate limiter fails open silently on Redis failure:**

```python
except Exception:
    logger.warning("Rate limiter unavailable for scope %s; failing open", ...)
    limited = False
```

This is intentional (documented in health.py comments), but the fail-open means a Redis outage completely disables rate limiting for all endpoints including auth. During a Redis outage, brute-force attacks on `/api/v1/auth/login/` are unthrottled. The DRF `ScopedRateThrottle` on `ErrorReportView` would also fail open.

**Action:** Consider a local in-memory fallback counter for auth endpoints (login, register, password-reset) that activates when Redis is unavailable. Even a rough per-process counter is better than nothing for the highest-risk paths.

**Finding 4b — `SecurityHeadersMiddleware` sets `X-XSS-Protection: 1; mode=block`:**

This header is deprecated and can introduce vulnerabilities in older browsers (XSS auditor bypass). Modern browsers ignore it. The CSP header already provides superior protection.

**Action:** Change to `X-XSS-Protection: 0` (explicitly disable the legacy XSS auditor) per current OWASP guidance, or remove the header entirely since CSP is present.

**Finding 4c — `AuditMiddleware` does not capture `entity_id`:**

```python
AuditLog.objects.create(
    actor_id=actor_id,
    action=request.method,
    entity_type=entity_type,
    ip_address=...,
    ...
    # entity_id is never set
)
```

The `AuditLog` model has an `entity_id` field, but the middleware never extracts it from the URL path (e.g., the UUID in `/api/v1/applications/{uuid}/`). All audit entries have `entity_id=NULL`, making it impossible to query "all actions on application X" from the audit log alone.

**Action:** Extract UUID segments from the URL path and populate `entity_id`. This is a significant audit gap.

---

### 5. `health.py` — **improve**

**Finding 5a — `ReadinessView` exposes `redis_latency_ms` to unauthenticated callers:**

```python
permission_classes = [AllowAny]
authentication_classes = []

def get(self, request):
    ...
    return Response({
        "status": "ok",
        "db": "ok",
        "redis": redis_status,
        "redis_latency_ms": redis_latency,  # <-- infrastructure timing data
    })
```

The latency value leaks internal infrastructure performance characteristics to any unauthenticated caller. An attacker can use this to fingerprint the Redis deployment, detect degradation windows, or time attacks.

**Action:** Remove `redis_latency_ms` from the public response. Log it server-side for monitoring instead.

**Finding 5b — `RedisHealthView` instantiates `ReadinessView()` incorrectly:**

```python
def get(self, request):
    redis_status, _ = ReadinessView()._check_redis_with_latency()
```

This creates a bare `ReadinessView` instance without going through DRF's view lifecycle. It works because `_check_redis_with_latency` is a pure method, but it's fragile — if that method ever accesses `self.request`, it will crash.

**Action:** Extract `_check_redis_with_latency` into a standalone module-level function.

---

### 6. `idempotency.py` — **improve**

**Finding 6a — Race condition window between SELECT and INSERT:**

```python
existing = IdempotencyKey.objects.filter(...).first()  # SELECT
# ... gap ...
if record is None:
    try:
        record = IdempotencyKey.objects.create(...)  # INSERT
    except IntegrityError:
        # Lost race
```

The `IntegrityError` catch handles the race, but the window between SELECT and INSERT means two concurrent requests with the same key could both execute the view. The first to INSERT wins; the second gets `IDEMPOTENCY_PENDING`. This is acceptable but not ideal — a `select_for_update` or advisory lock would be stronger.

**Finding 6b — Failed requests reset to PENDING on retry, losing failure context:**

```python
if existing.status == IdempotencyKey.FAILED:
    record = existing
# ...
record.status = IdempotencyKey.PENDING
record.response_status = None
record.response_body = None
```

When a previously-failed idempotency key is retried, the failure metadata (response_status, response_body) is wiped before the retry executes. If the retry also fails, the original failure context is lost. This makes debugging intermittent failures harder.

**Action:** Log the previous failure state before resetting.

---

### 7. `tasks.py` — **improve**

**Finding 7a — `send_email_task` double-fetches the email record:**

```python
email_record = EmailQueue.objects.get(id=email_queue_id)  # First fetch
if email_record.status == EMAIL_STATUS_SENT:
    return
email_record = _claim_email_for_delivery(email_queue_id)  # Second fetch (after UPDATE)
```

The first `GET` is immediately followed by `_claim_email_for_delivery` which does another query. The first fetch is only used for the `SENT` status check, which `_claim_email_for_delivery` already handles (it filters on `status__in=[PENDING, RETRYING]`). The first fetch is redundant.

**Action:** Remove the first `EmailQueue.objects.get()` call. Let `_claim_email_for_delivery` handle the terminal-status skip.

**Finding 7b — `send_bulk_notifications_task` retries the entire batch on a single notification failure:**

```python
for notification in notifications:
    try:
        ...
    except Exception as exc:
        self.retry(exc=exc, ...)
```

If notification #3 of 10 fails, the entire task retries from the beginning, re-processing notifications 1 and 2 (which already sent emails). This causes duplicate emails for successfully-processed notifications.

**Action:** Track processed IDs and exclude them on retry, or switch to individual task dispatch per notification.

---

### 8. `outbox.py` — **improve**

**Finding — `_record_outbox_event` is called OUTSIDE the `transaction.atomic()` block:**

```python
def create_notification(...):
    with transaction.atomic():
        notification = Notification.objects.create(...)
    _record_outbox_event(...)  # Outside the transaction
```

The outbox pattern's purpose is to ensure the side-effect record is committed atomically with the primary record. Here, if `_record_outbox_event` fails (or the process crashes between the two), the notification exists but the outbox event doesn't. The outbox event is best-effort (it catches exceptions), so this is intentional — but it defeats the purpose of having an outbox table.

**Action:** Move `_record_outbox_event` inside the `transaction.atomic()` block, or document that the outbox is advisory-only (not transactional).

---

### 9. `celery_signals.py` — **improve**

**Finding — `_task_start_times` is a module-level dict, not thread/process-safe:**

```python
_task_start_times: dict[str, float] = {}
```

In a prefork Celery worker pool, each worker process gets its own copy (safe). But in a `gevent` or `eventlet` pool, concurrent tasks in the same process could have dict mutation races. The `try/except` around all signal handlers masks any resulting errors.

**Action:** If the deployment ever moves to gevent/eventlet, this needs a lock. For prefork (current), it's fine. Add a comment documenting the assumption.

---

### 10. `middleware_compat.py` — **suspicious-stale-path**

**Finding:** The file header explicitly states these classes are "NOT mounted in MIDDLEWARE" and exist "only so existing unit and property tests continue to pass." The `CSRFEnforcementMiddleware` contains a full Redis health check, CSRF validation logic, and exempt path patterns that may drift from the actual CSRF enforcement in `JWTCookieAuthentication._enforce_csrf()`.

**Risk:** If the exempt patterns or validation logic in `middleware_compat.py` diverge from the real enforcement path, tests pass against stale behavior while production uses different rules.

**Action:** Needs human decision — either delete these classes and update tests to test the real enforcement path (`JWTCookieAuthentication`), or add a CI check that the exempt patterns match between the two locations.

---

### 11. `audit_network.py` — **improve**

**Finding — Fernet cache uses the key string as the cache key, never invalidated:**

```python
_fernet_cache: dict[str, Fernet | None] = {}

def _get_fernet() -> Fernet | None:
    key = getattr(settings, "AUDIT_LOG_ENCRYPTION_KEY", "") or ""
    if key in _fernet_cache:
        return _fernet_cache[key]
```

If the encryption key is rotated at runtime (e.g., via env var change + process restart), the old key remains in the cache dict alongside the new one. This is harmless for a single-key scenario (process restart clears the dict), but the cache grows unboundedly if keys are changed without restart. More importantly, `decrypt_network_value` uses the current key — it cannot decrypt values encrypted with a previous key. There's no key rotation support.

**Action:** Document that key rotation requires re-encryption of existing records or acceptance of data loss for old encrypted values.

---

### 12. `readonly.py` — **improve**

**Finding — DB query on every write request when env var is not set:**

```python
@staticmethod
def _is_read_only() -> bool:
    env_val = os.environ.get("READ_ONLY_MODE", "").lower()
    if env_val in ("1", "true", "yes"):
        return True
    # Fallback: check database setting
    try:
        setting = Setting.objects.filter(key="READ_ONLY_MODE").first()
```

When `READ_ONLY_MODE` is not set in the environment (the normal case), every POST/PUT/PATCH/DELETE request triggers a database query to check the `settings` table. This adds latency to every write request.

**Action:** Cache the DB result in-process with a short TTL (e.g., 30 seconds via `django.core.cache`), or use a module-level timestamp to avoid querying more than once per N seconds.

---

### 13. `error_views.py` — **improve**

**Finding — `request.body` is read twice (DRF already parsed it):**

```python
if len(request.body) > 16_384:
```

By the time the view method runs, DRF has already parsed `request.data` from `request.body`. Reading `request.body` again works (Django caches it), but the size check happens after DRF's parser has already consumed the full body into memory. The 16KB guard doesn't actually prevent memory consumption — it only rejects after the fact.

**Action:** For true protection, implement a custom DRF parser or use Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` setting. The current check is defense-in-depth (still useful for rejecting abuse), but doesn't prevent the memory allocation.

---

## Files Confirmed Correct (ignore-as-correct)

The following 21 files were reviewed and found to be correct, well-structured, and aligned with documented conventions:

`communication_service.py`, `renderers.py`, `exceptions.py`, `models.py`, `openapi.py`, `openapi_helpers.py`, `validators.py`, `logging.py`, `metrics.py`, `apps.py`, `views.py`, `meta_views.py`, `meta_urls.py`, `notification_urls.py`, `template_views.py`, `template_urls.py`, `email_urls.py`, `error_urls.py`, `email_templates.py`, `env_validator.py`, `storage.py`, `ai_service.py`, `jobs_ops_seed.py`, `__init__.py`

---

## Priority Matrix

| Priority | File | Finding | Classification |
|----------|------|---------|---------------|
| P0 | `permissions.py` | `IsAuthenticatedOrDebug` bypasses auth when `DEBUG=True` | zero-day-class-risk |
| P0 | `notification_views.py` | `mark-all-read` missing `read_at` timestamp | confirmed-bug |
| P1 | `middleware.py` | `AuditMiddleware` never populates `entity_id` | improve |
| P1 | `middleware.py` | Rate limiter fully disabled on Redis failure (auth endpoints unprotected) | improve |
| P1 | `tasks.py` | `send_bulk_notifications_task` causes duplicate emails on retry | improve |
| P1 | `health.py` | `redis_latency_ms` exposed to unauthenticated callers | improve |
| P2 | `middleware.py` | Deprecated `X-XSS-Protection: 1; mode=block` header | improve |
| P2 | `outbox.py` | Outbox event recorded outside transaction boundary | improve |
| P2 | `pagination.py` | Unused by common module views; manual pagination duplicated | confirmed-bug (drift) |
| P2 | `readonly.py` | DB query on every write request (no caching) | improve |
| P2 | `idempotency.py` | Failed request context wiped on retry | improve |
| P2 | `tasks.py` | Redundant double-fetch in `send_email_task` | improve |
| P3 | `middleware_compat.py` | Stale CSRF patterns may drift from real enforcement | suspicious-stale-path |
| P3 | `notification_views.py` | `post()` delegation bypasses DRF lifecycle | confirmed-bug |
| P3 | `health.py` | `RedisHealthView` bare-instantiates `ReadinessView` | improve |
| P3 | `error_views.py` | Body size check after DRF already parsed full body | improve |
| P3 | `audit_network.py` | No key rotation support for encrypted audit fields | improve |
| P3 | `celery_signals.py` | Module-level dict assumes prefork pool | improve |
