# MIHAS Admissions Platform Contract

Canonical frontend/runtime contract for `apps/admissions`.

`apps/jobs-ops` is intentionally diverging into a separate product/domain with a
different deployment/runtime boundary. It is not required to consume this
contract and should define its own explicit contract as that product matures.

---

## API Client Contract

| Rule | Detail |
|------|--------|
| Base URL | Same-origin in production (`''`). Override with `VITE_API_BASE_URL` for local dev. |
| Credentials | Every request: `credentials: 'include'` (cookie-based auth). |
| Content-Type | `application/json` on all requests with a body. |
| Path prefix | All routes start with `/api/v1/`. Resource-style, no query-parameter actions. |
| Response envelope | `{ success: boolean, data?: T, error?: string, code?: string }` |
| Paginated lists | `data` contains `{ page, pageSize, totalCount, results: T[] }` |
| Timeouts | Short timeout (5s) for health/session checks. Standard timeout (30s) for everything else. |
| Retries | Retry on 5xx and network errors. Max 2 retries with backoff (400ms, 1000ms). Never retry 4xx. |

### 401 Handling (Unauthenticated)

1. Receive 401 → attempt silent refresh via `POST /api/v1/auth/refresh/`.
2. Refresh succeeds → retry the original request exactly once.
3. Refresh fails → redirect to login. Clear any client-side auth state.
4. Never retry a 401 in a loop. One refresh attempt, one retry, then logout.

### 403 Handling (Forbidden)

- 403 means the user is authenticated but lacks permission. This is **not** an auth failure.
- Surface the error to the user. Do not attempt token refresh on 403.

---

## Auth Contract

| Aspect | Value |
|--------|-------|
| Mechanism | Cookie-based JWT (HttpOnly, Secure, SameSite=Lax) |
| Access token lifetime | 30 minutes |
| Refresh token lifetime | 7 days, JTI blacklisting via Redis |
| CSRF | Required on all state-changing requests (POST, PUT, PATCH, DELETE) |

### Auth Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/login/` | Email + password login |
| POST | `/api/v1/auth/register/` | New account registration (admissions) |
| POST | `/api/v1/auth/refresh/` | Silent token refresh |
| POST | `/api/v1/auth/logout/` | Logout + token blacklist |
| GET | `/api/v1/auth/session/` | Session validity check |

### Refresh Error Codes

| Code | Meaning |
|------|---------|
| `NO_REFRESH_TOKEN` | Cookie missing entirely — user never logged in or cookie expired |
| `TOKEN_EXPIRED` | Token present but expired, blacklisted, or invalid |

Frontend must distinguish these: `NO_REFRESH_TOKEN` → go to login silently. `TOKEN_EXPIRED` → show session-expired message.

---

## Error Handling Contract

- Every error response includes a machine-readable `code` string.
- Frontend must branch on `code`, **never** guess error type from HTTP status alone.
- Display `error` (human-readable message) to the user when present.

### Common Error Codes

| Code | Meaning |
|------|---------|
| `TOKEN_EXPIRED` | Access or refresh token expired |
| `NO_REFRESH_TOKEN` | Refresh cookie missing |
| `CSRF_INVALID` | CSRF token missing or mismatched |
| `INSUFFICIENT_PERMISSIONS` | Authenticated but not authorized |
| `INVALID_FORMAT` | Request body or parameter validation failed |
| `NOT_FOUND` | Resource does not exist |
| `RATE_LIMITED` | Too many requests |
| `VALIDATION_ERROR` | Field-level validation failure |

---

## Notification Contract

| Aspect | Detail |
|--------|--------|
| Poll endpoint | `GET /api/v1/notifications/` |
| Poll interval | 60 seconds |
| Tab-visibility pause | Pause polling when tab hidden > 5 minutes. Resume on focus. |
| Mark read | `PUT /api/v1/notifications/{id}/read/` |
| Preferences | `GET/PUT /api/v1/notifications/preferences/` |

Use React Query with a polling interval. Deduplicate by notification ID. Do not introduce SSE or WebSocket for notifications.

---

## Sessions Contract

| Aspect | Detail |
|--------|--------|
| List sessions | `GET /api/v1/sessions/` — returns `{ success: true, data: [...] }` envelope |
| Revoke session | `DELETE /api/v1/sessions/{id}/` |

Sessions endpoint validates `user_id` before querying. Response always uses the standard envelope.

---

## Health Check Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health/live/` | Liveness probe (is the process running?) |
| GET | `/health/ready/` | Readiness probe (can it serve traffic?) |

These are **not** under `/api/v1/` and do not require authentication.

---

## Adoption Status

| App | Status |
|-----|--------|
| `apps/admissions` | Fully aligned. Reference implementation. |
| `apps/jobs-ops` | Intentionally out of scope for this document. Separate domain/runtime contract required. |
