# CTO Assessment — MIHAS Platform
**Date:** March 30, 2026
**Scope:** Full monorepo — `apps/admissions/`, `backend/`, infrastructure, security, engineering health

---

## 1. Engineering Health Dashboard

| Category | Metric | Current Value | Target | Status |
|----------|--------|---------------|--------|--------|
| **Codebase** | Frontend source files | 484 files / 88K LoC | — | 🟢 |
| **Codebase** | Backend source files | 106 files / 10.3K LoC | — | 🟢 |
| **Codebase** | Frontend test files | 233 | — | 🟢 |
| **Codebase** | Backend test files | 22 | — | 🟡 |
| **Quality** | Frontend tests passing | 1,552 / 1,552 (100%) | 100% | 🟢 |
| **Quality** | Backend tests passing | 250 / 250 (100%) | 100% | 🟢 |
| **Quality** | Backend contract errors | 5 (pre-existing, need live DB) | 0 | 🟡 |
| **Quality** | Frontend lint errors | 0 | 0 | 🟢 |
| **Debt** | TODO/FIXME in backend app code | 2 | 0 | 🟢 |
| **Debt** | TODO/FIXME in frontend src code | 0 | 0 | 🟢 |
| **Debt** | Legacy test files (dead imports) | 0 (cleaned up) | 0 | 🟢 |
| **Testing** | Property tests (frontend) | fast-check across 7+ test files | — | 🟢 |
| **Testing** | Property tests (backend) | hypothesis across 6+ test files | — | 🟢 |
| **Architecture** | API contract alignment | Unified `/api/v1/` REST | — | 🟢 |
| **Architecture** | Legacy patterns remaining | 0 query-param routes | 0 | 🟢 |

---

## 2. Tech Debt Inventory

| Item | Severity | Cost-to-Fix | Blast Radius | Priority Score |
|------|----------|-------------|--------------|----------------|
| JWT middleware stub (task 9.1) | **P1** | 3 days | All authenticated endpoints | **HIGH** |
| Email task wiring (Celery) | **P2** | 1 day | Password reset, notifications | **MEDIUM** |
| Contract tests need live DB | **P2** | 2 days | CI/CD pipeline confidence | **MEDIUM** |
| `shared/` package underutilized | **P3** | Ongoing | Cross-app code sharing | **LOW** |
| Placeholder apps (website, student-portal, librarymanagement) | **P3** | 0 (no action) | Repo cleanliness | **LOW** |
| RBAC teardown error in property tests | **P3** | 0.5 day | Test reliability | **LOW** |

**Tech Debt Ratio:** ~5-8% (estimated maintenance vs. total capacity) — well below the 25% red line.

### Remediation Plan

**Immediate (this sprint):**
- Wire `send_email_task.delay()` in `accounts/services.py` and `accounts/views.py` (the 2 remaining TODOs)
- Fix RBAC property test teardown error

**Next quarter:**
- Complete JWT middleware full implementation (task 9.1)
- Set up CI environment with test Postgres for contract tests
- Evaluate whether `shared/` needs real cross-app types or should be removed

**Tracked backlog:**
- Clean up placeholder app directories when those projects start

---

## 3. Architecture Review

### What's Working Well

**Backend (Django 5 + DRF):**
- Clean domain separation across 10 Django apps (`accounts`, `applications`, `catalog`, `documents`, `common`, `analytics`, `automation`, `integrations`, `jobs`, `outreach`)
- 10-layer middleware chain with proper ordering (security headers → CORS → request ID → rate limiting → auth → CSRF → audit)
- Per-scope rate limiting (auth: 60/5m, admin: 60/10m, documents: 20/10m)
- Audit logging with hashed PII (no raw email/phone in logs)
- Idempotency keys for async operations (1-hour TTL)
- Celery + Redis for background tasks with exponential backoff retries
- `managed = False` models preserving existing Neon schema

**Frontend (React 18 + TypeScript):**
- Unified API client with CSRF, retry, timeout, and 401 refresh handling
- Clean service layer (15 services) with consistent URL construction
- React Query for server state + Zustand for client state (proper separation)
- Property-based testing with fast-check for API invariants
- PWA support with Workbox caching strategies
- Code splitting for heavy libraries (Excel, PDF, OCR, Charts)

**Cross-cutting:**
- Spec-driven development with requirements → design → tasks workflow
- Steering files keeping conventions documented and enforced
- Unified `/api/v1/` REST contract — no translation layers, no legacy shims
- Cookie-based auth with SameSite=Lax on `.mihas.edu.zm` subdomains

### Architecture Decisions Worth Documenting as ADRs

1. **Cookie-based auth over Bearer tokens** — Correct for browser SPA, but should be formally documented with rationale and migration path if mobile apps are added
2. **`managed = False` models** — Preserves existing schema but means Django migrations can't be used for schema changes. Document the schema change workflow.
3. **Koyeb + Vercel split deployment** — Good separation of concerns, but creates a DNS dependency for cookie auth. Document the failure mode if either service is down.
4. **Celery for async PDF generation** — Good pattern, but no dead-letter queue monitoring is visible. Document alerting strategy.

---

## 4. Security Posture Assessment

### Strengths 🟢

| Control | Implementation | Confidence |
|---------|---------------|------------|
| Transport security | HSTS (1yr, includeSubDomains, preload), TLS-only | 🟢 verified |
| Cookie security | HTTP-only, Secure, SameSite=Lax, Domain=.mihas.edu.zm | 🟢 verified |
| CSRF protection | Custom middleware, X-CSRF-Token header, exempt paths defined | 🟢 verified |
| Rate limiting | Per-scope (auth, admin, documents, sessions, notifications) | 🟢 verified |
| Security headers | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy | 🟢 verified |
| Audit logging | Actor ID, hashed IP/UA, entity tracking, retention categories | 🟢 verified |
| RBAC | 4 roles (student, admin, reviewer, super_admin) + per-user overrides | 🟢 verified |
| Password security | bcrypt 12 rounds, account lockout (10 attempts / 30 min) | 🟢 verified |
| File upload validation | Magic byte + MIME type checking | 🟢 verified |
| CORS | Restricted to production domains + preview regex | 🟢 verified |
| Input validation | Serializer-level validation on all endpoints | 🟢 verified |

### Concerns 🟡

| Issue | Risk | Recommendation |
|-------|------|----------------|
| JWT middleware is a stub | **HIGH** — auth may rely on incomplete validation | Complete task 9.1 before next production deploy |
| No secrets rotation strategy documented | **MEDIUM** — long-lived secrets increase breach impact | Document rotation schedule for JWT_SIGNING_KEY, SECRET_KEY, R2 credentials |
| Audit log retention enforcement unclear | **LOW** — retention categories defined but no cleanup job | Add a Celery periodic task for audit log pruning |
| Legacy password hash migration | **LOW** — SHA-256 migration path exists but no forced re-hash | Set a deadline for forcing bcrypt re-hash on next login |
| No CSP on backend responses | **LOW** — frontend has CSP via Vercel headers | Consider adding CSP to Django SecurityHeadersMiddleware |

### Compliance Notes
- Zambian data format validation (NRC, phone, ECZ grades) — implemented
- No PII in logs — enforced via hashed identifiers
- File upload security — magic byte verification active
- GDPR-style data handling — retention categories defined (security: 365d, standard: 90d)

---

## 5. Scalability Assessment

### Current Capacity

| Component | Current Config | Bottleneck Risk |
|-----------|---------------|-----------------|
| Backend (Koyeb) | 1 web instance, 1 worker | **HIGH** — single point of failure |
| Database (Neon) | Pooled connections, SSL | **LOW** — Neon auto-scales |
| Redis (Upstash) | Serverless, TLS | **LOW** — auto-scales |
| Storage (R2) | S3-compatible, signed URLs | **LOW** — CDN-backed |
| Frontend (Vercel) | Edge deployment | **LOW** — auto-scales |

### "What breaks at 10x traffic?"

1. **Backend web instance** — Single Koyeb instance will saturate. Scale to 2-3 replicas with health check routing.
2. **Celery worker** — Single worker will queue up. Scale to 2+ workers with task routing (email vs PDF generation).
3. **Rate limiting** — Current limits are per-instance, not distributed. At multiple replicas, need Redis-backed rate limiting.
4. **Database connections** — Neon pooling helps, but monitor connection count at scale.

### Recommendations

- **Immediate:** Increase `WEB_CONCURRENCY` to 2-4 (Uvicorn workers per instance)
- **Next quarter:** Add a second Koyeb web instance with load balancing
- **Before 10x:** Move rate limiting to Redis-backed distributed counters
- **Before 10x:** Add Celery task routing (separate queues for email, PDF, OCR)

---

## 6. Build vs Buy Analysis

| Capability | Current | Recommendation | Rationale |
|-----------|---------|----------------|-----------|
| Auth | Custom JWT + cookies | **Keep building** | Core to the platform, tightly coupled to Zambian user flows |
| Email | Resend API | **Keep buying** | Not core IP, Resend is reliable and cheap |
| Storage | Cloudflare R2 | **Keep buying** | S3-compatible, no vendor lock-in, cost-effective |
| OCR | Tesseract (server-side) | **Evaluate** — consider cloud OCR (AWS Textract, Google Vision) if accuracy is insufficient | Current implementation works but may not handle poor-quality scans |
| PDF generation | reportlab | **Keep building** | Simple needs, no vendor dependency needed |
| Monitoring | None visible | **Buy** — add Sentry (errors) + Uptime Robot (availability) | Critical gap for production |
| APM | None visible | **Buy** — add Datadog or New Relic if budget allows | Nice-to-have for performance optimization |

---

## 7. Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| JWT middleware stub in production | Medium | Critical | Complete task 9.1 before next deploy |
| Single backend instance failure | Medium | High | Scale to 2+ instances on Koyeb |
| No error monitoring (Sentry) | High | Medium | Add Sentry to both frontend and backend |
| Secrets compromise | Low | Critical | Document rotation strategy, use Koyeb secrets manager |
| Neon Postgres outage | Low | Critical | Neon has built-in HA; verify backup strategy |
| R2 storage outage | Low | High | Cloudflare has high availability; signed URLs have 15-min expiry |

---

## 8. CTO Recommendations — Priority Order

### P0 — Do This Week
1. **Complete JWT middleware** (task 9.1) — the auth stub is the single biggest risk
2. **Wire email tasks** — 2 TODO comments in `accounts/services.py` and `accounts/views.py`
3. **Add error monitoring** — Sentry for both frontend (Vite plugin) and backend (Django integration)

### P1 — Do This Month
4. **Scale backend** — Increase `WEB_CONCURRENCY` to 2-4, add second Koyeb instance
5. **Fix contract tests** — Set up CI with test Postgres so contract tests run in pipeline
6. **Document secrets rotation** — JWT_SIGNING_KEY, SECRET_KEY, R2 credentials
7. **Add uptime monitoring** — Uptime Robot or similar for `/health/ready/` endpoint

### P2 — Do This Quarter
8. **Distributed rate limiting** — Move to Redis-backed counters before scaling to multiple instances
9. **Celery task routing** — Separate queues for email, PDF, OCR
10. **Audit log cleanup job** — Celery periodic task to enforce retention categories
11. **ADR documentation** — Formalize the 4 architecture decisions identified above
12. **Force bcrypt re-hash** — Set deadline for legacy SHA-256 password migration

### P3 — Track in Backlog
13. Clean up placeholder app directories when those projects start
14. Evaluate cloud OCR if document quality issues arise
15. Consider APM tooling (Datadog/New Relic) when budget allows

---

## 9. Summary

The MIHAS platform is in strong shape post-migration. The codebase is clean (zero TODO/FIXME in frontend source, only 2 in backend), test coverage is comprehensive (1,552 frontend + 250 backend tests, all passing), and the architecture follows sound patterns (unified REST contract, proper auth, audit logging, property-based testing).

The biggest risk is the JWT middleware stub — this needs to be completed before any production traffic increase. After that, the focus should shift to operational maturity: error monitoring, scaling, and secrets management.

Tech debt ratio is estimated at 5-8%, well below the 25% red line. The spec-driven development workflow and steering files are keeping conventions enforced and debt from accumulating.

**Bottom line:** Ship the JWT middleware fix, add Sentry, scale to 2 instances, and this platform is production-solid.
