# Production Readiness Audit — Admissions System (2026-05-17)

## Verdict: GO-WITH-CAVEATS

The admissions system is production-viable with strong canonical truth alignment, comprehensive payment hardening, solid observability, and well-documented runbooks. However, two P0 blockers must be accepted as known risks or fixed first: (1) the production database schema has no authoritative DDL in the repository — disaster recovery depends entirely on Neon's internal backups, and (2) the `cleanup_idempotency_keys` Celery Beat task silently never executes due to a task-name mismatch, causing unbounded table growth. The system can go live if these are documented as accepted risks with a fix timeline of ≤1 week, or resolved before launch.

## Domain Scores

| Domain | Score | Verdict |
|--------|-------|---------|
| Frontend code quality | 6.5/10 | Functional but carrying type-safety debt and admin-form validation gaps |
| Frontend test surface | 7/10 | Strong drift-guards, good coverage, but 14 real test failures and missing withdrawal tests |
| Backend domain services | 7.5/10 | Solid state machine with proper locking on critical paths; two services lack locking |
| Backend views & routes | 7/10 | Core envelope/permissions correct; scaffold views non-conforming |
| Database schema & integrity | 6.5/10 | Working but no authoritative DDL, missing index documentation |
| Redis & Celery | 8/10 | Excellent failure-mode documentation; one confirmed task-name bug |
| Canonical truth alignment | 9/10 | All drift-guards pass; exemplary cross-layer contract enforcement |
| Observability, secrets, deploy | 9/10 | Comprehensive monitoring, zero secrets leaks, hardened deployment |
| **Composite** | **60.5/80** | |

## Executive Summary

- Production-blocking issues (P0): **3**
- High-risk issues (P1): **11**
- Medium-risk issues (P2): **14**
- Polish items (P3): **12**
- Strengths to preserve:
  - All 10 frontend drift-guard tests pass (50 assertions) — canonical truth alignment is exemplary
  - Payment hardening Phases 1–5 complete with feature-flag-gated rollout
  - State machine enforcement with `select_for_update()` on all critical paths
  - 12 production runbooks covering every operational scenario
  - Zero secrets in tracked files; comprehensive `.gitignore` coverage
  - GlitchTip error monitoring on both frontend and backend with CSP violation reporting
  - Redis failure modes documented with explicit fail-open/fail-closed policies
  - 2652 frontend tests passing; 1016 backend tests passing (without DB)

## P0 Blockers (must fix before prod)

1. **No authoritative DDL in repository (`00_full_schema.sql` is a placeholder)**
   - Source tracks: database
   - Evidence: `backend/scripts/00_full_schema.sql` contains 9 lines of TODO comments. 6 previously-applied SQL scripts have been removed from the repo.
   - Impact: If the Neon branch is lost or corrupted, the repository cannot reconstruct the database. Disaster recovery depends entirely on Neon's internal backups.
   - Fix: Run `pg_dump --schema-only --no-owner --no-acl "$DATABASE_URL" > backend/scripts/00_full_schema.sql` against production and commit.
   - Est. effort: 30 minutes

2. **`cleanup_idempotency_keys` Celery Beat task never executes**
   - Source tracks: redis-celery, observability
   - Evidence: Beat dispatches `"apps.common.tasks.cleanup_idempotency_keys"` but worker registers the task as `"cleanup_idempotency_keys"` (explicit `name=` override). Messages are silently discarded.
   - Impact: `idempotency_keys` table grows unbounded. Over weeks/months this causes DB bloat and query degradation.
   - Fix: Remove `name="cleanup_idempotency_keys"` from the `@shared_task` decorator, or change Beat entry to `"task": "cleanup_idempotency_keys"`.
   - Est. effort: 15 minutes + deploy

3. **113 `any` type annotations across 42 frontend files including core data flows**
   - Source tracks: frontend-code-quality
   - Evidence: `src/lib/grades.ts`, `src/data/applications.ts`, `src/hooks/admin/useApplicationsData.ts` — these flow into rendering and business logic. Runtime crashes on unexpected shapes are undetectable.
   - Impact: Silent data corruption or crashes in production when API shapes change. The grades module is used in the core wizard flow.
   - Fix: Type the top-10 offenders (grades, applications data layer, admin hooks). Covers ~25 of 113 occurrences.
   - Est. effort: 4–6 hours for critical paths

## P1 High Risk (fix in next sprint)

1. **Admin forms use raw `useState` + imperative validation instead of Zod + RHF**
   - Source tracks: frontend-code-quality
   - Evidence: Programs, Users, ProgramFees forms — no schema-level validation, no inline field errors. These mutate production data.
   - Impact: Invalid data can be submitted to production; no user-facing validation feedback.
   - Fix: Migrate to `useForm` + `zodResolver` with inline `<FormMessage>`.
   - Est. effort: 2–3 days (3 forms)

2. **112 `console.error/warn` calls bypass error monitoring**
   - Source tracks: frontend-code-quality
   - Evidence: 97 `console.error` + 13 `console.warn` in `storage.ts`, `catalog.ts`, `draftManager.ts` etc. — invisible to GlitchTip.
   - Impact: Production errors in storage, catalog, and draft operations are unmonitored. Potential PII in error objects.
   - Fix: Create `src/lib/logger.ts` routing to GlitchTip in prod, console in dev. Bulk-replace.
   - Est. effort: 3–4 hours

3. **InterviewService has no row-level locking**
   - Source tracks: backend-services
   - Evidence: `schedule_interview()` creates an interview and auto-transitions application status without `select_for_update()`.
   - Impact: Under concurrent admin scheduling, two interviews could be created for the same slot.
   - Fix: Wrap in `transaction.atomic()` with `select_for_update()` on the application row.
   - Est. effort: 1 hour

4. **AmendmentService has no transaction or locking**
   - Source tracks: backend-services
   - Evidence: `request_amendment()` reads application status and pending count without locking.
   - Impact: Two concurrent requests could exceed `MAX_PENDING_AMENDMENTS=3`.
   - Fix: Add `select_for_update()` + `transaction.atomic()`.
   - Est. effort: 1 hour

5. **Admin review endpoint missing `@idempotent`**
   - Source tracks: backend-services, backend-views
   - Evidence: `ApplicationReviewView.patch()` imports `idempotent` but never applies it.
   - Impact: Network retry could double-transition an application.
   - Fix: Apply `@idempotent` decorator.
   - Est. effort: 30 minutes

6. **Auth `RefreshView` has no DRF `throttle_classes`**
   - Source tracks: backend-views
   - Evidence: Relies solely on middleware-level rate limiting (60/5m for `/api/v1/auth/`).
   - Impact: Token-grinding attacks that stay under IP-based limits.
   - Fix: Add dedicated per-user throttle class.
   - Est. effort: 1 hour

7. **No frontend withdrawal tests**
   - Source tracks: frontend-test-surface
   - Evidence: `POST /api/v1/applications/{id}/withdraw/` is a critical student action with zero frontend test coverage.
   - Impact: Regressions in withdrawal UX go undetected.
   - Fix: Add unit test for withdrawal hook/dialog + property test for allowed-status preconditions.
   - Est. effort: 2 hours

8. **8 frontend test files failing (14 tests) — real regressions**
   - Source tracks: frontend-test-surface
   - Evidence: 44px touch-target assertions and snapshot drift. Recent component changes removed `min-h-touch` classes.
   - Impact: Accessibility regression — interactive elements below WCAG touch-target minimum.
   - Fix: Restore `min-h-touch` / `min-h-[44px]` on affected components, update snapshots.
   - Est. effort: 2 hours

9. **`receipt_number` on `payments` has no unique constraint in Django model**
   - Source tracks: database
   - Evidence: Model declares `CharField(max_length=50, null=True, blank=True)` — no `unique=True`. DB may have the constraint from hardening scripts.
   - Impact: Duplicate receipts possible if DB constraint is ever dropped.
   - Fix: Add `unique=True` to model field or document intentional divergence.
   - Est. effort: 30 minutes

10. **63 backend test failures (real regressions)**
    - Source tracks: backend-services
    - Evidence: 13 in `test_application_student_flow_views.py` (500s — view routing regression), 9 in `test_deduplication_helpers.py`, 6 in `test_review_notifications.py`.
    - Impact: Indicates broken view routing and notification logic.
    - Fix: Triage and fix the 13 student-flow-view failures first (likely import/routing issue from view split).
    - Est. effort: 4–6 hours

11. **No auth-page ErrorBoundary**
    - Source tracks: frontend-code-quality
    - Evidence: `SignInPage`, `SignUpPage`, `ForgotPasswordPage`, `ResetPasswordPage` have no local boundary.
    - Impact: A crash during login renders a full-page error with no recovery affordance.
    - Fix: Wrap auth route group in a dedicated boundary with "Return to sign-in" action.
    - Est. effort: 1 hour

## P2 Medium Risk (fix when capacity allows)

1. **Analytics + email + integrations views return raw data without envelope** — 11 endpoints violate the `{success: true, data: ...}` contract. (backend-views)
2. **Inconsistent notification dispatch** — `WithdrawalService`, `InterviewService`, `WaitlistManager` use raw outbox instead of `CommunicationService`. Template-based subject overrides are bypassed. (backend-services)
3. **No explicit AuditLog writes in service modules** — Celery task-driven transitions have no audit trail unless tasks explicitly write one. (backend-services)
4. **`applications.program/intake/institution` are CharFields, not ForeignKeys** — No referential integrity. Legacy design debt. (database)
5. **`payments.application_id` is nullable** — Orphan payments possible. (database)
6. **Missing indexes not in `EXPECTED_INDEXES`** — `payments.user_id`, `audit_logs.entity_id`, `application_status_history.application_id` etc. (database)
7. **Previously-applied SQL scripts removed from repo** — No way to verify what was actually created. (database)
8. **Two unbounded TTL Redis keys** — `uptime:last_status` and `task_last_run:{name}` never expire. Bounded cardinality but violates TTL policy. (redis-celery)
9. **`send_bulk_notifications_task` partial dedup** — Hard crash mid-iteration can double-send one email. (redis-celery)
10. **Submission gates have no frontend drift-guard** — Backend is authoritative but UX mismatches go undetected. (canonical)
11. **Several POST endpoints lack `@idempotent`** — `confirm-enrollment`, `assign`, `fee-waiver`, `conditions/verify`. (backend-views)
12. **Duplicate draft-clearing logic** — `Dashboard.tsx` and `ContinueApplication.tsx` bypass `useDraftManager` hook. (frontend-code-quality)
13. **2 inputs without accessible labels** — `ApplicationDetailPayment.tsx` discount input and `Settings.tsx` file import. (frontend-code-quality)
14. **MSISDN PBT file not discoverable by vitest** — `zambian-formats.property.ts` lacks `.test.` in filename. (frontend-test-surface)

## P3 Polish / Optimisation

1. **12 files > 600 LOC** — `Programs.tsx` (1160), `ApplicationStatus.tsx` (1151), `Settings.tsx` (1143) etc. Extract sub-components. (frontend-code-quality)
2. **`as unknown as` / `as never` casts** — Low-risk type workarounds in `locationOptions.ts` and `Settings.tsx`. (frontend-code-quality)
3. **`(window as any).__dismissPreloader?.()`** — Preloader bridge; should declare global type. (frontend-code-quality)
4. **Raw `fetch()` for CDN/blob downloads** — 6 occurrences; acceptable but could use shared utility. (frontend-code-quality)
5. **1 skipped test file** — `documentTemplatesPremium.test.ts` (retired feature). (frontend-test-surface)
6. **3 snapshot failures** in `bottom-navigation.mobile.test.tsx` — need update after UI change. (frontend-test-surface)
7. **Terminal statuses not explicit in `ALLOWED_TRANSITIONS`** — Correct behavior but could be documented with empty sets. (backend-services)
8. **`_application_has_completed_payment()` only checks `successful`** — Misleading helper name. (backend-services)
9. **`common/views.py` (`APIHomeView`) is a plain Django View** — Not DRF; acceptable for HTML. (backend-views)
10. **`X-CSP-Note` header shipped to browsers** — Informational leak; move to code comment. (observability)
11. **CSP `style-src 'unsafe-inline'`** — Required for Radix UI; documented as known debt. (observability)
12. **AI cache not documented in redis-dependency-tiers.md** — Fail-open behavior is correct but undocumented. (redis-celery)

## Cross-cutting findings

Issues that span multiple domains:

- **`cleanup_idempotency_keys` task-name mismatch** — Affects redis-celery (task never runs), observability (silent failure), and database (unbounded table growth). Source: redis-celery + observability.
- **No authoritative schema DDL** — Affects database (no recovery source), canonical truth (schema drift test has nothing to compare against locally), and deploy (cannot verify schema in CI without DB). Source: database + canonical.
- **63 backend test failures** — Affects backend-services (regression detection), backend-views (routing broken), and observability (CI gate unreliable). Source: backend-services.
- **Console.error bypassing GlitchTip** — Affects frontend-code-quality (noise) and observability (blind spots in monitoring). Source: frontend-code-quality + observability.
- **Missing `@idempotent` on state-change endpoints** — Affects backend-services (replay risk) and backend-views (contract gap). Source: backend-services + backend-views.

## Strengths

- **Canonical truth alignment is exemplary** — All 10 drift-guard test files pass (50 frontend + 76 backend assertions). Every domain concept with a frontend mirror has an automated parity test.
- **Payment hardening is comprehensive** — 5 phases complete, feature-flag-gated, with 7 ADRs, rollback runbook, and 40+ dedicated test files.
- **State machine is well-enforced** — Single `ALLOWED_TRANSITIONS` map, `select_for_update()` on critical paths, UUID validation on actors, TOCTOU protection on submission.
- **Redis failure modes are explicitly documented** — Every key has a documented TTL and failure tier (fail-open vs fail-closed).
- **12 production runbooks** covering secrets rotation, Redis recovery, scaling, release/rollback, post-deploy smoke, database backup, local parity, and incident response.
- **Zero secrets in tracked files** — Comprehensive `.gitignore`, only `.env.example` templates committed.
- **Security headers are comprehensive** — HSTS, CSP, X-Frame-Options, Permissions-Policy, cookie security all configured.
- **Deployment is hardened** — Multi-stage Dockerfile, non-root execution, startup schema verification, health endpoints.
- **JTI blacklist is correctly implemented** — TTL matches refresh token lifetime, fails closed on read, recovery command available.
- **Idempotency on critical payment/submission paths** — 5 most important state-change endpoints are replay-protected.

## Test coverage analysis

- Drift-guards: **10/10 frontend files passing** (50 assertions), **9/9 backend files passing** (76 assertions), 3 CI-only (require DB)
- Frontend test files: **375** (186 unit, 6 integration, 177 property, 5 UI, 1 admin)
- Frontend suite: **2652 pass / 14 fail / 1 skip** (101.65s)
- Backend tests passing: **1016** (with 38 skipped, 63 failing, 156 errors from missing local DB)
- E2E (Playwright): **3 specs** (registration → wizard step 3; no payment/submission/withdrawal coverage)
- Critical paths missing tests:
  - Frontend withdrawal flow (0 test files)
  - Frontend application-detail page render/interaction test
  - Frontend fee-resolution property-based test
  - `force_approved` transitions in frontend PBT
  - E2E coverage for payment, submission, interview, and withdrawal

## Production-readiness checklist

- [x] Schema authority — `managed = False` policy documented; `verify_schema_static.py` exists (but `00_full_schema.sql` is empty — **P0**)
- [x] Database backups — Neon branch-based recovery documented in runbook; quarterly drill cadence
- [x] Error monitoring — GlitchTip active on frontend (`@sentry/react`) and backend (`sentry-sdk`); CSP violations reported
- [x] Secrets rotation — Runbook at `docs/runbooks/secrets-rotation.md` covering all credentials
- [x] Health checks + uptime — `/health/live/`, `/health/ready/`, internal + external monitoring
- [x] Audit log retention — `cleanup_audit_logs_task` (90d standard, 365d security)
- [x] CSP + security headers — Comprehensive on both Vercel (frontend) and Django (backend)
- [x] Idempotency on state-change — 5 critical endpoints protected (`submit`, `withdraw`, `initiate`, `verify`, `mobile-money`)
- [x] CSRF protection — Enforced at `JWTCookieAuthentication` layer; recovery via `?refresh_csrf=1`
- [x] Rate limiting — Middleware-level on all paths + DRF throttle on payment/AI/submit endpoints
- [x] Canonical truth drift-guards — All passing; automated parity enforcement
- [ ] Critical path test coverage — Withdrawal flow untested; 14 frontend tests failing; 63 backend tests failing
- [ ] Idempotency key cleanup — **Not running** (P0 task-name mismatch)
- [ ] Schema DDL in repo — **Empty placeholder** (P0)

## Recommended path to production

1. **Fix every P0** (estimated total effort: 1–2 hours)
   - Populate `00_full_schema.sql` from production (30 min)
   - Fix `cleanup_idempotency_keys` task-name mismatch (15 min + deploy)
   - Type top-10 `any` offenders in grades/applications data layer (4–6 hours) — or accept as known risk with 2-week fix timeline

2. **Fix top half of P1 list** (estimated: 2–3 days)
   - Fix 14 frontend test failures (restore touch targets) — 2 hours
   - Fix 13 backend student-flow-view test failures — 4 hours
   - Add `select_for_update()` to InterviewService + AmendmentService — 2 hours
   - Apply `@idempotent` to admin review endpoint — 30 min
   - Add auth-page ErrorBoundary — 1 hour
   - Add withdrawal frontend tests — 2 hours

3. **Document accepted P1 risks; note timeline**
   - Admin forms without Zod validation — accept for launch, fix in sprint 2
   - Console.error bypass of monitoring — accept for launch, fix in sprint 2
   - RefreshView throttle — accept (middleware provides baseline protection)
   - Receipt number unique constraint — verify DB state, document

4. **Run final pre-deploy gate:**
   - `cd apps/admissions && bun run test` — all drift-guards must pass
   - `cd backend && python3 -m pytest tests/unit/test_*canonical*.py tests/unit/test_*drift*.py` — canonical tests pass
   - `cd backend && python3 manage.py check --deploy` — Django deployment checks
   - `cd backend && python3 manage.py spectacular --validate` — DRF schema clean
   - Post-deploy smoke test against staging per `docs/runbooks/post-deploy-smoke-check.md`
   - Verify `cleanup_idempotency_keys` executes within 24h of deploy (check Redis `task_last_run` key)
