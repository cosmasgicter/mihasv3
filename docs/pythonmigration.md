# Python Migration Plan (Vercel Frontend + Koyeb Django API)

## 1. Architecture decision (beginner-friendly)

### Hybrid model overview
Use a **hybrid deployment** where:
- **Vercel** hosts the frontend (existing Next.js/UI).
- **Koyeb** hosts a dedicated Python backend API (Django + DRF).
- **Managed PostgreSQL** (Neon, Supabase Postgres, or another managed provider) stores relational data.

This separates concerns cleanly:
- Frontend hosting and CDN delivery stay with Vercel.
- API and background processing move to a platform designed for always-on backend workloads.
- Database operations stay centralized in managed Postgres with backups and connection management.

### Why this removes Vercel function-count constraints
When API logic runs as Vercel Functions, endpoint and function expansion can run into platform limits, cold starts, and per-function management complexity. Moving the API to Django on Koyeb means:
- API routes are served by one backend service (not split into many serverless function units).
- You scale backend compute by service resources/replicas, not by adding many platform functions.
- Route growth (dozens/hundreds of endpoints) becomes mostly an application-organization issue, not a function-count/platform-structure issue.

---

## 2. Recommended stack for your workflow

- **Framework:** Django 5 + Django REST Framework.
- **Database:** PostgreSQL (Neon / Supabase Postgres / any managed Postgres).
- **Background jobs:** Redis + Celery for emails, document processing, notifications, and long-running tasks.
- **Authentication:** JWT via SimpleJWT with **refresh token rotation** and optional blacklist/revocation.
- **Web security:** CORS + CSRF policy explicitly aligned to your Vercel frontend domain(s).
- **File/document storage:** S3-compatible bucket (Cloudflare R2 or AWS S3) for uploaded files and generated docs.
- **Optional edge controls:** Cloudflare API gateway/rate limiting + Sentry for errors/performance monitoring.

---

## 3. Step-by-step migration phases

### Phase 0: Inventory current backend behavior
- Catalog all current API routes from `/api-src`.
- Catalog DB read/write patterns and query abstractions from `lib/queries`.
- Identify auth/session semantics, role checks, and side effects per endpoint.
- Define parity matrix: “existing behavior” vs “target Django behavior”.

### Phase 1: Scaffold Django project and environment strategy
- Create Django project (`config/`) and core apps (`accounts`, `applications`, `documents`, `catalog`, `common`).
- Add DRF, SimpleJWT, CORS headers, health endpoint, and environment-based settings split (`base/dev/staging/prod`).
- Configure Postgres connection, migrations, and local bootstrap scripts.
- Add Docker + entrypoint + Uvicorn ASGI baseline.

### Phase 2: Auth/session model parity
- Implement user model/role model that matches existing permission semantics.
- Implement login/refresh/logout flows using JWT + refresh rotation.
- Define logout semantics clearly (client token drop vs server-side blacklist revocation).
- Add permission classes and object-level checks that mirror existing behavior.

### Phase 3: Migrate core application endpoints first
Migration order:
1. Auth endpoints
2. Applications endpoints
3. Documents endpoints
4. Catalog endpoints

For each endpoint:
- Implement serializer + service layer + viewset/APIView.
- Add contract tests against expected request/response behavior.
- Validate status codes, error shapes, and authorization behavior.

### Phase 4: Move async side effects to Celery
- Identify expensive or out-of-band tasks (emails, notifications, file conversions).
- Move these to Celery tasks, with retry/backoff and dead-letter handling strategy.
- Keep API responses fast by enqueueing work and returning task/result references where appropriate.

### Phase 5: Frontend base-URL switch with dual-run cutover
- Add environment-based API base URL in frontend (`NEXT_PUBLIC_API_BASE_URL`).
- Introduce a temporary dual-run mode (legacy + Django) for validation.
- Route a low-risk traffic subset to Django API first, verify parity, then expand.

### Phase 6: Production cutover + rollback plan
- Perform final data sync and freeze window for critical writes if needed.
- Switch frontend production env to Koyeb API domain.
- Monitor error rate, latency, auth failures, and task queues.
- Keep instant rollback switch ready (restore previous API base URL + redeploy frontend env).

---

## 4. Koyeb deployment instructions

### Runtime packaging
- Use a **Dockerfile** to build the Django service image.
- Run web server via **uvicorn** (`uvicorn config.asgi:application --host 0.0.0.0 --port $PORT`).
- Optional Procfile-style process definitions for clarity in docs:
  - `web`: uvicorn ASGI server
  - `worker`: celery worker
- Expose health endpoints:
  - Liveness: `/health/live`
  - Readiness: `/health/ready` (checks DB/Redis connectivity)

### Environment variables matrix (dev/staging/prod)
Define per environment:
- `DJANGO_SETTINGS_MODULE`
- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `DATABASE_URL`
- `REDIS_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `JWT_SIGNING_KEY` (or shared secret strategy)
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `SENTRY_DSN` (optional)

### Service topology on Koyeb
- **Web service:** Django + uvicorn (serves REST API).
- **Worker service:** Celery worker (same image, different start command).
- Optionally add **beat** scheduler service if cron-like jobs are needed.

### Domain, TLS, and scaling basics
- Attach custom domain to Koyeb web service.
- Enable managed TLS certificates.
- Start with 1 replica; scale horizontally based on CPU/memory and queue depth.
- Define autoscaling thresholds and minimum warm instances if traffic is spiky.

---

## 5. Vercel frontend changes

- Keep the current Vercel frontend deployment model unchanged.
- Update frontend env vars to point API client to Koyeb domain:
  - `NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1`
- Ensure CORS allowlist includes your Vercel production and preview domains.
- Cookie/JWT transport notes:
  - If using Authorization headers (Bearer JWT), reduce CSRF complexity and ensure secure token storage policy.
  - If using HttpOnly cookies, configure `SameSite=None; Secure` for cross-site use and explicitly trust frontend origins.

---

## 6. Data migration and compatibility

### Schema mapping table (example template)

| Current backend field | Django model.field | Type mapping | Transform | Notes |
|---|---|---|---|---|
| `users.id` | `accounts.User.legacy_id` | int -> bigint | none | preserve original reference |
| `applications.status` | `applications.Application.status` | string -> choice enum | map values | enforce allowed states |
| `documents.url` | `documents.Document.file_key` | URL -> object key | extract path | use S3/R2 signed URLs |
| `catalog.code` | `catalog.Item.code` | string -> string | normalize case | unique index |

### One-time migration scripts + verification checklist
- Build idempotent ETL scripts:
  1. Extract from old source.
  2. Transform into Django-compatible schema.
  3. Load with upsert keys.
- Verification checklist:
  - Row counts per table match expected deltas.
  - Critical foreign keys validate.
  - Sample record parity checks pass.
  - Auth/account edge cases verified.

### Backfill and rerun strategy
- Design migrations to be **idempotent** (safe to rerun without duplication).
- Use checkpoints (last processed ID/timestamp) for resumable backfills.
- Keep immutable migration logs (run ID, start/end time, row counts, error counts).

---

## 7. Endpoint expansion strategy

### Django module layout for growth
- Organize by bounded context:
  - `apps/accounts/`
  - `apps/applications/`
  - `apps/documents/`
  - `apps/catalog/`
  - shared `apps/common/`
- Use service layer + serializers + viewsets to keep endpoint logic maintainable.

### API versioning + docs
- Prefix all routes with `/api/v1/...`.
- Generate OpenAPI schema (DRF Spectacular or DRF built-in schema tooling).
- Publish interactive docs (Swagger/ReDoc) for frontend and partner integration.

### Standards for consistency
- Rate limits per scope (anonymous, authenticated, sensitive endpoints).
- Standard pagination (cursor or limit/offset, chosen globally).
- Standard error envelope (code, message, details, trace/request ID).

---

## 8. Go-live checklist

### Pre-launch verification
- Run unit, integration, and contract tests.
- Execute smoke tests on critical flows.
- Validate auth role-switch behavior (admin/user/reviewer/etc.).
- Validate multi-step wizard/workflow state transitions.

### Observability and alerts
- Dashboard minimums:
  - API latency (p50/p95/p99)
  - Error rate (4xx/5xx split)
  - Auth failures
  - Queue depth and task failure rates
  - DB CPU/connections/slow queries
- Alert thresholds (initial):
  - 5xx > 2% for 5 min
  - p95 latency > 1.5s for 10 min
  - Celery failure rate > 5% for 10 min

### Rollback procedure (exact switchback steps)
1. Set frontend env `NEXT_PUBLIC_API_BASE_URL` back to legacy API.
2. Redeploy frontend on Vercel.
3. Confirm smoke tests against legacy backend.
4. Keep Django writes disabled (or read-only mode) until reconciliation decision.
5. Reconcile data delta before next cutover attempt.

---

## 9. “New to this” appendix

### Glossary: who does what
- **Vercel:** Hosts frontend and serves static/SSR web app.
- **Koyeb:** Runs backend API containers and worker containers.
- **Postgres:** Durable relational data store.
- **Redis:** Fast in-memory broker/cache used by Celery.
- **Celery:** Background job runner for asynchronous tasks.
- **S3/R2:** Object storage for documents and binary assets.
- **Cloudflare (optional):** Edge protection, rate limiting, gateway controls.
- **Sentry (optional):** Error tracking and performance monitoring.

### Common failure modes and fixes
- **CORS blocked requests:** Verify exact origin in allowlist and preflight headers.
- **JWT refresh loops:** Check token expiry/rotation and frontend refresh logic.
- **CSRF failures (cookie mode):** Set trusted origins + correct SameSite/Secure settings.
- **Worker not processing jobs:** Validate Redis URL, Celery command, and queue routing.
- **Slow endpoints:** Add DB indexes, reduce N+1 queries, and move heavy work to Celery.

### Cost-aware starter setup (free/low-cost oriented)
- Start with:
  - 1 small Koyeb web instance
  - 1 small worker instance
  - Managed Postgres starter tier
  - Managed Redis starter tier
  - R2/S3 with lifecycle rules
- Enable autoscaling only after baseline metrics exist.
- Add CDN/cache and Cloudflare controls as traffic increases.
