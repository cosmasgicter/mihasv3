---
inclusion: always
---

# Technology Stack And Development Conventions

## Stack Overview

### Monorepo

| Layer | Technology | Notes |
|-------|------------|-------|
| Workspace root | Bun workspaces | Defined in the root `package.json` |
| JS package scope | `apps/*`, `shared` | `apps/admissions` and `apps/jobs-ops` are active frontend apps |
| Python backend | Standalone Django package in `backend/` | Not managed by Bun |

### Admissions Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | Use Bun for install, dev, build, lint, and test |
| UI | React 18 + TypeScript | Vite-based SPA |
| Routing | React Router | Route-level pages live in `apps/admissions/src/pages/` |
| State | React Query and Zustand | Keep server and client state concerns separate |
| Forms | React Hook Form + Zod | Client-side validation remains Zod-based |
| Styling | Tailwind CSS + Radix UI | Existing app conventions still apply |
| Testing | Vitest, fast-check, Playwright | Frontend tests live under `apps/admissions/tests/` |
| Hosting | Vercel | App-local config in `apps/admissions/vercel.json` |

### Jobs Ops Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | Use Bun for install, type-check, lint, and build |
| UI | React 18 + TypeScript | Vite-based SPA in `apps/jobs-ops/` |
| Routing | React Router | Central route map in `apps/jobs-ops/src/app/router.tsx` |
| State | React Query + Zustand | Query state for backend data, Zustand for UI shell state |
| Forms | React Hook Form + Zod | Planned/expected for write flows |
| Styling | Tailwind CSS + Lucide | Production-style operator dashboard |
| Validation | `bun run type-check`, `bun run lint`, `vite build` | Current quality gates for jobs-ops |

### Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Django 5 + Django REST Framework | Active server implementation |
| Runtime | Python 3.12+ | Repo config targets Python 3.12+ |
| App server | Uvicorn (ASGI) | Deployed backend entrypoint is `config.asgi:application` |
| Data | Neon Postgres | Admissions and jobs-ops backend runtime database |
| Async | Celery + Redis | Background work, retries, and periodic tasks |
| Storage | Cloudflare R2 via `django-storages` | Signed URL workflow |
| Email | Zoho SMTP (primary) + Resend (fallback) | Zoho SMTP for outbound email; Resend as fallback for transactional delivery |
| HTTP client | `requests` | Used by `check_uptime_task` for internal health checks |
| AI gateway | Vercel AI Gateway (multi-model) | `AI_GATEWAY_API_KEY` — routes to gpt-4o-mini, gemini-2.5-flash, deepseek-v3 by task type |
| Messaging | Telegram planned placeholder | Env scaffolding exists; integration wiring remains to be completed |
| Browser automation | Playwright | Deterministic browser automation for E2E testing |
| Error monitoring | GlitchTip (Sentry-compatible) via `sentry-sdk` | DSN-based — see Error Monitoring section below |
| API docs | drf-spectacular | Schema and docs under `/api/v1/` |
| Testing | pytest + hypothesis | Backend tests live under `backend/tests/` |

## Commands That Reflect The Real Repo

### Root

| Command | Purpose |
|---------|---------|
| `bun run dev:admissions` | Run the admissions app |
| `bun run build:admissions` | Build the admissions app |
| `bun run test:admissions` | Run admissions tests |
| `bun run lint:admissions` | Lint the admissions app |
| `bun run dev:jobs-ops` | Run the jobs-ops app |
| `bun run build:jobs-ops` | Build the jobs-ops app |
| `bun run type-check:jobs-ops` | Type-check the jobs-ops app |
| `bun run lint:jobs-ops` | Lint the jobs-ops app |

### Admissions App

| Command | Purpose |
|---------|---------|
| `cd apps/admissions && bun run dev` | Start the Vite dev server |
| `cd apps/admissions && bun run build` | Production build |
| `cd apps/admissions && bun run test` | Vitest suite |
| `cd apps/admissions && bun run lint` | ESLint suite |

### Jobs Ops App

| Command | Purpose |
|---------|---------|
| `cd apps/jobs-ops && bun run dev` | Start the jobs-ops Vite dev server |
| `cd apps/jobs-ops && bun run type-check` | TypeScript verification |
| `cd apps/jobs-ops && bun run lint` | ESLint suite |
| `cd apps/jobs-ops && ./node_modules/.bin/vite build` | Production build |

### Backend

| Command | Purpose |
|---------|---------|
| `cd backend && python3 -m pytest` | Run backend tests |
| `cd backend && python3 manage.py check` | Django system checks |
| `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml` | Generate and verify OpenAPI schema |
| `cd backend && python3 manage.py runserver` | Local Django dev server |
| `cd backend && python3 -m uvicorn config.asgi:application --reload` | Local ASGI runtime parity check |

## API Contract

The frontend and backend share a single, unified API contract. There is no compatibility shim.

- Backend routes are mounted in `backend/config/urls.py` under `/api/v1/...`.
- Admissions frontend calls `/api/v1/...` directly.
- Jobs-ops frontend also calls `/api/v1/...` directly through app-local API services.
- Routes are resource-style, for example:
  - `/api/v1/auth/login/`
  - `/api/v1/applications/`
  - `/api/v1/jobs/`
  - `/api/v1/job-applications/`
  - `/api/v1/outreach/contacts/`
  - `/api/v1/automation/runs/`
  - `/api/v1/email/threads/`
  - `/api/v1/analytics/funnel/`
  - `/api/v1/meta/platform/`
- There are no legacy `/api/{resource}?action=` query-parameter routes.

## Response And Auth Conventions

- The platform uses the `{"success": true, "data": ...}` envelope for API responses handled through DRF renderers. All authenticated list endpoints (including `GET /api/v1/sessions/`) must use this envelope format.
- Paginated responses use `{page, pageSize, totalCount, results}` inside the `data` envelope.
- Auth remains cookie-based for the main backend auth stack.
- The admissions frontend calls `***REMOVED***` directly (cross-origin with `credentials: 'include'`). Vercel free tier does not support external rewrites, so there is no same-origin proxy. In local dev, Vite proxies `/api` to the backend.
- DRF authentication classes are the sole authority for setting `request.user`. The `JWTAuthenticationMiddleware` does NOT authenticate — it only flags expired tokens so 403→401 conversion fires for the frontend refresh interceptor.
- Access tokens have a 30-minute lifetime; refresh tokens last 7 days with JTI blacklisting via Redis.
- Token refresh (`POST /api/v1/auth/refresh/`) uses distinct error codes: `NO_REFRESH_TOKEN` when the cookie is missing, `TOKEN_EXPIRED` for expired/blacklisted/invalid tokens. Frontend can differentiate between configuration issues and token expiry.
- CSRF is required for state-changing requests in authenticated flows. CSRF tokens are validated at the `JWTCookieAuthentication` layer (not middleware). The frontend bootstrap session call (`GET /api/v1/auth/session/?refresh_csrf=1`) requests a fresh token when the in-memory store is empty (e.g. after page refresh). CSRF recovery uses the `?refresh_csrf=1` query parameter (not a custom header) to avoid CORS preflight issues on cross-origin requests. `x-csrf-token`, `x-csrf-recovery`, and `idempotency-key` are all in `CORS_ALLOW_HEADERS`. CSRF tokens are issued by `SessionView` and `RefreshView` in the `X-CSRF-Token` response header. The frontend stores them in-memory only (never localStorage). After a page refresh the in-memory token is lost, so the bootstrap session call includes `?refresh_csrf=1` to force a fresh token. The CSRF recovery flow (`recoverCsrfAndRetry`) also uses `?refresh_csrf=1` instead of a custom header to avoid CORS preflight issues on cross-origin requests.
- `CORS_ALLOW_HEADERS` includes `x-csrf-token`, `x-csrf-recovery`, `idempotency-key`, and `cache-control` in addition to the `corsheaders` defaults.
- Application tracking (`GET /api/v1/applications/track/`) validates code format against `APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX` patterns, returning 400 with `INVALID_FORMAT` for bad formats and descriptive 404 messages for valid-format codes not found.
- Jobs-ops currently exposes public read-oriented scaffold routes for some surfaces while keeping risky write actions authenticated and policy-gated.

## Conventions For New Code

### Frontend

- Use app-local code inside the target app first.
- `apps/admissions` and `apps/jobs-ops` should not casually share implementation through `shared/` unless the code is intentionally cross-app.
- In `apps/jobs-ops`, keep route-level logic inside `src/features/*`.
- Prefer React Query for backend data and keep shell/UI state in Zustand.
- Use app-local API service modules instead of raw `fetch`.
- Payment in the admissions wizard supports mobile money (primary) and card widget (secondary). Mobile money is initiated via `POST /api/v1/payments/mobile-money/` and polled for completion. The Lenco card widget (`LencoPay.getPaid`) remains available as a fallback. Students may also defer payment and submit without paying upfront. Do not reintroduce the retired pre-Lenco payment UX.
- Payment ownership is split at submission (task 8.3, R12.3): the **wizard** owns pre-submission pay-or-defer and renders no history or recovery; **`/student/payment`** owns deferred, failed, expired, and pending recovery plus history, and may take a payment for a fee still owed after submission. Do not restore the "payment page is read-only" description — that contradiction is finding STU-09.
- Student authenticated pages should prefer the canonical UI primitives already in the repo: `PageShell`, `SectionCard`, `ErrorDisplay`, `EmptyState`, and `Button asChild` for semantic links.
- Student forms that can lose work, especially settings and wizard-related screens, should protect dirty state on navigation and `beforeunload`.
- Use speculative prefetching (`src/lib/speculativePrefetch.ts`) for predictive data loading — prefetch catalog data on login success, wizard chunks on dashboard mount.
- Dashboard data freshness is handled by `useStudentDashboardPolling` (React Query with fingerprint deduplication). NotificationBell uses `useNotificationPolling` (React Query with 60-second interval and tab-visibility pause). Do not introduce SSE or WebSocket connections for these surfaces.
- `ErrorDisplay` returns `null` for empty or whitespace-only `message` props. Do not render `role="alert"` elements without meaningful content.
- All content images (campus photos, badges, logos) must use `OptimizedImage` or have an `onError` handler with a visible fallback. Raw `<img>` tags without error handling are not acceptable for content images.
- Font fallback chain in `tailwind.config.js` uses the full Tailwind default sans-serif stack with Inter prepended: `['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']`. Do not reduce this chain.
- Auth form pages (`SignInPage`, `SignUpPage`, `ForgotPasswordPage`, `ResetPasswordPage`) must use proper `autocomplete`, `inputMode`, and `type` attributes on all form fields for browser autofill and mobile keyboard support.
- PWA dependencies (`vite-plugin-pwa`, `workbox-*`) have been fully removed. Service worker unregistration and cache cleanup code has also been removed (no real users had the PWA installed).

### Backend

- Keep new API work inside explicit domain apps under `backend/apps/`.
- Keep routes resource-oriented under `/api/v1/`.
- Preserve explicit jobs-ops domain naming such as `JobApplication`.
- Shared jobs-ops scaffold data currently lives in `backend/apps/common/jobs_ops_seed.py`; do not re-duplicate that seed state across views.
- Current default error-alert recipient is `***REMOVED***` (configurable via `ERROR_ALERT_EMAIL` env var). Used for uptime, payment failures, and SLA breach alerts. Error monitoring uses GlitchTip.
- Payment records live in the `payments` table (managed by `backend/apps/documents/`). Application-level payment summaries should be derived from canonical payment records, not from retired inline compatibility columns.
- Django storage backends are configured through the Django 5 `STORAGES` dict. Do not reintroduce `STATICFILES_STORAGE` or `DEFAULT_FILE_STORAGE`.
- Payment metadata must not persist raw phone numbers. Mobile-money records may keep `phone_hash` and `phone_last4`; raw phone values are only allowed in the transient outbound Lenco request.
- `.env` and `.env.local` files are gitignored and safe for real credentials during local development. They are never committed to the repository. When the user asks to add real secrets to these files, do so without hesitation — the gitignore is configured correctly.
- Email is sent via Zoho SMTP (smtp.zoho.com:465, TLS). No IMAP integration — the platform only sends outbound email, it does not read inboxes. Resend is configured as a fallback for transactional delivery.

## Enterprise Tenant Authority

Beanola owns the Platform; MIHAS/KATC are example tenants. The full model lives
in `.kiro/steering/enterprise-tenancy.md`; the rules below are the engineering
conventions every backend and frontend change must follow. Spec of record:
`.kiro/specs/enterprise-tenant-authority/`.

- **Centralized authorization is mandatory.** Resolve every authority decision
  through `AdminCapabilityService` (`backend/apps/catalog/services.py`) and the
  DRF primitives in `backend/apps/catalog/permissions.py` (`HasPlatformCapability`,
  `TenantScopedCapabilityMixin`). Never compare raw role strings in endpoint code.
- **Scope before lookup.** Scope tenant-sensitive querysets through
  `visible_institution_queryset(user)` **before** any `.get()`/object retrieval,
  so an out-of-scope identifier cannot be confirmed to exist. Out-of-scope →
  404 or a non-revealing 403 (no tenant id/name/count/attribute).
- **Frontend consumes backend capabilities.** The admissions frontend reads
  `GET /api/v1/admin/capabilities/` (and the extended `GET /api/v1/admin/scope/`)
  via `CapabilityContext`/`useCapabilities` and gates nav, routes, and controls
  with `can()` / `canForInstitution()`. Frontend hiding is **never** the security
  boundary — the backend re-enforces every check.
- **Fail-closed tenant domains.** The `Domain_Resolver`
  (`InstitutionContextService.resolve`) resolves a tenant only when exactly one
  `active`/`is_active` domain on an active institution matches; unknown,
  multi-match, or non-active-status hosts resolve to the Neutral Beanola context.
  A `CapabilityResolutionError` also fails closed (deny, zero capabilities, no
  data).
- **Cross-tenant denial tests are required.** Tenant-sensitive endpoints must be
  covered by tests proving a tenant-admin scoped to one institution cannot
  observe, fetch, mutate, or infer another tenant's data across list, detail,
  search, exports, dashboards, documents, payments, audit, applications, users,
  routing simulation, and analytics (see `backend/tests/property/` Properties
  4–10 and the acceptance-scenario tests).
- **No legacy endpoint bypasses.** The institution/program/intake write paths in
  `backend/apps/catalog/views.py` are capability-gated (`platform.tenant.*`,
  `can_manage_program`, `platform.intake.manage`). Do not add or restore any
  tenant-data mutation that skips `AdminCapabilityService`. Public/student `GET`
  behavior on catalog endpoints is preserved.
- **Tenant-sensitive writes and failed authorizations are audited** via
  `TenantAuditService` (`backend/apps/catalog/tenant_audit_service.py`), with
  SHA-256-redacted IP/user-agent and no raw PII.
- **Capability catalogue + routes are canonical.** The 17 `platform.*` / 17
  `tenant.*` strings and the canonical admin/onboarding/school-console routes,
  backend tenant API paths, deprecated legacy catalog write paths, and the domain
  context endpoint are registered in `docs/canonical-truth-map.md`. Register new
  capabilities there before merging.
- **New work consumes canonical services.** Before adding a route, hook, helper,
  document renderer, tenant endpoint, or route alias, check
  `docs/canonical-truth-map.md` and
  `docs/runbooks/canonical-multi-tenant-alignment.md`. Operational steps live in
  `docs/runbooks/multi-tenant-operations.md`. Extend the canonical service with
  a drift guard instead of adding a parallel implementation.

## Lenco Payment Integration

The platform uses Lenco as its payment gateway for application fees. Key components:

| Component | Location | Purpose |
|-----------|----------|---------|
| `PaymentService` | `backend/apps/documents/payment_service.py` | Payment lifecycle: initiate, verify, webhook processing |
| `FeeResolver` | `backend/apps/documents/fee_resolver.py` | Dynamic fee resolution by program + residency |
| `WebhookProcessor` | `backend/apps/documents/webhook_processor.py` | HMAC-SHA512 signature validation + event logging |
| `MobileMoneyInitiateView` | `backend/apps/documents/views.py` | `POST /api/v1/payments/mobile-money/` — initiate mobile money collection via Lenco |
| `ProgramFee` model | `backend/apps/documents/models.py` | Per-program fee configuration (local vs international) |
| `WebhookEventLog` model | `backend/apps/documents/models.py` | Audit trail for all webhook events |
| `PaymentForm` | `apps/admissions/src/components/student/PaymentForm.tsx` | Shared payment form with mobile money + card method selection |
| `useLencoWidget` | `apps/admissions/src/hooks/useLencoWidget.ts` | Dynamic Lenco widget script loading |
| `useFeeResolver` | `apps/admissions/src/hooks/useFeeResolver.ts` | Frontend fee resolution hook |
| `usePaymentStatus` | `apps/admissions/src/hooks/usePaymentStatus.ts` | Payment status polling hook |
| `PaymentStep` | `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx` | Wizard payment step: mobile money (primary), card widget (secondary), defer option |
| `PaymentAuditService` | `backend/apps/documents/payment_audit_service.py` | Payment audit writes + PII redaction; single source of truth for `audit_logs.entity_type='payment'` rows. See `docs/adrs/ADR-003-reuse-audit-logs.md`. |
| `payment_metrics` | `backend/apps/documents/payment_metrics.py` | Counter registry (`PAYMENT_COUNTERS`) + PII label guardrail for `sentry_sdk.metrics.incr`. |
| `payment_error_codes` | `backend/apps/documents/payment_error_codes.py` | Authoritative `PAYMENT_ERROR_CODES` map (stable code → HTTP status + message). Frontend mirror at `apps/admissions/src/lib/paymentErrorCodes.ts`. |
| `WebhookEventIdentity` | `backend/apps/documents/webhook_processor.py` | Canonical dedup primitive: `(provider_event_id, event_type, reference, payload_hash)`. See `docs/adrs/ADR-004-canonical-json-webhook-dedup.md`. |
| `paymentRecoveryStore` | `apps/admissions/src/stores/paymentRecoveryStore.ts` | Zustand + localStorage recovery store keyed by `application_id` with 24-hour TTL (Phase 4). |
| `paymentNextActions` | `apps/admissions/src/lib/paymentNextActions.ts` | Stable-code-driven `PaymentNextAction` union with user-facing copy. |
| `zambianMsisdn` | `apps/admissions/src/lib/zambianMsisdn.ts` | Client-side Zambian MSISDN format validation + normalisation (no operator inference). |
| `derivePaymentUiState` | `apps/admissions/src/lib/paymentStatus.ts` | Pure mapper from `{backendStatus, inflight, stableCode, pollingExceededTimeout, phase}` to `PaymentUiState`. Unconditional since task 8.2. |
| `payment_phase` | `backend/apps/documents/payment_phase.py` | `derive_payment_phase(status, provider_initiation)` — the single answer to *who is being waited on*: `action_required` (student must approve a handset prompt, 120 s UI budget) vs `provider_processing` (waiting on Lenco, 600 s, no retry offered). Derived, never stored; exposed as `phase` / `phase_timeout_seconds` on `PaymentSerializer`. Frontend mirror `PaymentPhase` + `PAYMENT_WAITING_STATES` in `apps/admissions/src/lib/paymentStatus.ts`, drift-guarded both ways by `backend/tests/unit/test_payment_phase_8_2.py` (task 8.2, STU-09). |
| `paymentRecovery` | `apps/admissions/src/lib/paymentRecovery.ts` | `PAYMENT_RECOVERY_PRESENTATION` — the **total** `PaymentUiState → {label, tone, detail, action, allowsInitiate}` map the `/student/payment` page renders, plus the `deferred` override. `allowsInitiate` is `false` for every waiting state (double-charge guard) and `resendAvailable` is true **only** for a spent `action_required` budget. Adds no state vocabulary and restates no wait budget — both come from task 8.2's `paymentStatus.ts` (task 8.3, STU-09). |
| `tenantSupport` | `apps/admissions/src/lib/tenantSupport.ts` | `resolveTenantSupportContact` — the student support affordance from resolved tenant context, with the neutral in-app `/contact` route as the only fallback. Never a hardcoded address, never MIHAS/KATC (task 8.3, STU-24). |
| `PaymentApplicationCard` | `apps/admissions/src/components/student/payment/PaymentApplicationCard.tsx` | One submitted application's payment state, its single recovery action, and its ledger history. The post-submission half of the ownership split (task 8.3, R12.3). |
| `SettlementQueryService` | `backend/apps/documents/settlement_service.py` | The one settlement/fee-administration query authority (task 8.4, ADM-06): scope through `visible_institution_queryset` + `AccessScopeService.filter_payments` **before** any lookup, SQL filters, SQL grouping, whole-filtered-set aggregates, derived reconciliation state (`RECONCILIATION_STALE_HOURS = 24`, read from the sweep's own cutoff), capability-driven `RedactionPolicy`, and the page-independent export bounded by `EXPORT_ROW_LIMIT`. |
| `AdminFeeListView` | `backend/apps/documents/fee_admin_views.py` | `GET /api/v1/admin/fees/` — the scoped fee-administration report (filters, page, coverage aggregates, `?export=csv`). Replaces the admin page's per-offering broad fetch. Read authority `tenant.program.read`. |
| `SuperAdminPaymentCorrectionView` | `backend/apps/documents/views.py` | `POST /api/v1/payments/{id}/correct/` — super-admin-only correction endpoint, reason ≥ 10 chars (Phase 5). |
| `RiskFlagsListView` | `backend/apps/documents/risk_views.py` | `GET /api/v1/payments/risk-flags/` — super-admin-only paginated risk-flag review (Phase 5). |
| `dev_bypass` | `backend/apps/common/dev_bypass.py` | `require_not_dev_bypass_in_production` decorator — 404 on any bypass vector under production settings (Phase 5). |
| `throttling` | `backend/apps/common/throttling.py` | `PaymentUserScopedRateThrottle` keyed by `user.pk` or client IP (Phase 5). |

Payment hardening status: Phases 1–5 shipped, then converged onto a single
path by admissions-v2 task 8.2 (one state machine, one service path, one dedup
contract, one flag). See `docs/runbooks/payment-hardening-rollout.md` for the
current state and what rollback actually means now.

## Payment Feature Flags

There is **one** payment feature flag. admissions-v2 task 8.2 deleted the other
four together with the duplicate implementations they selected, so the payment
state machine, webhook dedup contract, admin-override ledger shape, and payment
UI are unconditional.

| Flag | Scope | Gates |
|------|-------|-------|
| `PAYMENT_HARDENING_RATE_LIMITS` | Backend | Per-user DRF throttle scopes (`payment_initiate`, `payment_mobile_money`, `payment_verify`, `payment_resolve_fee`) |

This is a policy switch, not a second code path: both settings run the same
payment path. It reads `"1" | "true" | "yes"` as enabled and is hardcoded `True`
in `prod.py` / `staging.py`.

**Retired flags — do not reintroduce.** `PAYMENT_HARDENING_FORWARD_ONLY`,
`PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT`, `PAYMENT_HARDENING_FORCE_APPROVED`, and
the frontend `VITE_PAYMENT_HARDENING_UI` no longer exist. Setting them does
nothing. Two guard tests fail if one reappears
(`tests/unit/test_payment_single_path_8_2.py`,
`tests/unit/test_prod_settings_required_flags.py`). Parity between the promoted
path and each deleted duplicate was demonstrated before removal — see
`docs/v2-evidence/8.2/`.

**Rollback is no longer a flag flip** for the payment state machine, dedup,
override, or UI: it is a code revert. Rate limits still roll back by flipping the
flag. Phase 1 schema stays in place (additive). Full detail:
`docs/runbooks/payment-hardening-rollout.md`.

Admin money surfaces are server-owned (admissions-v2 task 8.4, findings ADM-06 /
AUTH-02). Settlement and fee administration filter, paginate, aggregate, derive
reconciliation state, redact, and export **on the backend**; authority resolves
through `AdminCapabilityService` (`tenant.payment.read` for settlement,
`tenant.program.read` for fee reads, `platform.program_assignment.manage` for fee
writes, `tenant.application.export` for either export), and an out-of-scope
identifier is a masked 404 rather than an empty page. Do not reintroduce a broad
fetch with client-side institution filtering, a browser-side settlement total, or
a role-string gate on these surfaces — `apps/admissions/tests/unit/feeProviderSourceScan.test.ts`
and `backend/tests/unit/test_settlement_fee_authority_8_4.py` fail if one returns.

Payment API endpoints:
- `POST /api/v1/payments/initiate/` — create pending payment, returns widget config
- `POST /api/v1/payments/mobile-money/` — initiate mobile money collection via Lenco
- `POST /api/v1/payments/{id}/verify/` — verify payment via Lenco API
- `POST /api/v1/payments/webhook/lenco/` — webhook receiver (unauthenticated, HMAC-validated)
- `GET /api/v1/payments/resolve-fee/` — resolve fee for program + residency
- `GET /api/v1/payments/settlements/` — scoped, paginated settlement report with server aggregates, reconciliation state, and an audited `?export=csv`
- `GET /api/v1/admin/fees/` — scoped, paginated fee-administration report with coverage aggregates and an audited `?export=csv`
- `GET/POST/PUT/DELETE /api/v1/programs/{id}/fees/` — canonical fee management (read `tenant.program.read`, write `platform.program_assignment.manage`, every write audited as `tenant.fee.<verb>`)

Related admissions flow endpoints:
- `POST /api/v1/applications/{id}/submit/` — canonical student submission endpoint with submission gates
- `POST/PATCH /api/v1/applications/{id}/review/` — admin review and payment override endpoint
- `GET /api/v1/applications/interviews/?mine=true` — canonical student interview list endpoint

Payment status conventions:
- Use `normalizePaymentStatus()` and `isPaymentVerified()` from `apps/admissions/src/lib/paymentStatus.ts` for student-facing reads.
- Do not branch directly on raw payment strings in new UI code unless you are handling backend write payloads.

Environment variables:
- Backend: `LENCO_API_SECRET_KEY`, `LENCO_API_BASE_URL`, `LENCO_PUBLIC_KEY`
- Frontend: `VITE_LENCO_PUBLIC_KEY`, `VITE_LENCO_WIDGET_URL`

Webhook URL registered with Lenco: `***REMOVED***/api/v1/payments/webhook/lenco/`

## Document and Email Generation

There are two document-generation categories, but only one official-document
authority:

| System | Scope | Engine | Entry point |
|--------|-------|--------|-------------|
| Official student/admin documents | Application slip, payment receipt, acceptance letter, conditional offer, and future tenant-branded official records | Backend renderers + tenant `InstitutionDocumentProfile` / `InstitutionAsset` config | `GET/POST /api/v1/applications/{id}/official-documents/{document_type}/` via `apps/admissions/src/services/officialDocuments.ts` |
| Frontend PDF previews | Dev-only or explicitly non-official previews | `@react-pdf/renderer` v4 | `apps/admissions/src/pages/dev/*` and tightly scoped preview helpers only |
| Admin large-table exports | Audit trail, applications roster | `jspdf` + `jspdf-autotable` (+ `pdf-lib` for user export) | `@/lib/auditExports`, `@/lib/exportUtils` |

**Rules:**
- Any new **official** student/admin document must be rendered by the backend
  official-document pipeline and configured through tenant document profiles and
  assets. Do not add a production official-document caller to `@/lib/pdf`.
- Frontend `@/lib/pdf` code is legacy/preview-only unless a specific
  non-official preview use case is documented. It must not be reachable from
  student/admin official download or email flows.
- Any new **admin tabular export** that stays in admin-only flows can continue
  to use `jspdf`.
- Never mix official documents and table exports — official records need stored
  backend provenance/fingerprints, while large-table exports optimize for
  browser-side admin convenience.
- Tenant signatories, logos, signatures, seals, letter content, requirements,
  and fee blocks come from backend tenant configuration. Do not hardcode MIHAS
  or KATC signatories as generic defaults.

Transactional emails use a Python component system at `backend/apps/common/email/`. Call `render_message(message_type, context)` which returns `(subject, html, text)`. Supported types: `application_submitted`, `payment_received`, `interview_scheduled`, `acceptance`, `conditional_acceptance`, `rejection`, `password_reset`. The `communication_templates` DB table still drives per-intake subject overrides; the component system owns structure and visual identity.

See `docs/runbooks/canonical-multi-tenant-alignment.md`,
`backend/apps/common/email/README.md`, and the official-document sections in
`docs/canonical-truth-map.md` for the current authority. Historical React-PDF
docs explain the legacy/preview implementation, not the production official
document authority.

## Error Monitoring

The platform uses GlitchTip (Sentry-compatible, free tier at app.glitchtip.com) for error tracking. Both frontend and backend report to a single GlitchTip project (22431). The standard Sentry SDK (`sentry-sdk` for Python, `@sentry/react` for React) is used with DSN URLs pointing to GlitchTip.

### Pipeline

1. Backend errors: `sentry-sdk` with `DjangoIntegration` and `CeleryIntegration` automatically captures unhandled exceptions. The `envelope_exception_handler` in `backend/apps/common/exceptions.py` also calls `sentry_sdk.capture_exception()` for 500 responses to ensure all errors reach GlitchTip.
2. Frontend errors: `@sentry/react` captures `window.onerror` and unhandled rejections automatically once initialized via `initErrorReporter()` in `apps/admissions/src/lib/errorReporter.ts`.
3. CSP violations: The `Content-Security-Policy` header in `apps/admissions/vercel.json` includes a `report-uri` directive that sends browser CSP violations directly to GlitchTip.
4. The legacy `POST /api/v1/errors/report/` endpoint still accepts frontend error reports for backwards compatibility, forwarding them to GlitchTip via `sentry_sdk.capture_message()`.

### Key details

- Backend DSN: configured via `GLITCHTIP_DSN` env var. SDK initializes in `backend/config/settings/base.py`.
- Frontend DSN: configured via `VITE_GLITCHTIP_DSN` env var. SDK initializes in `apps/admissions/src/lib/errorReporter.ts`.
- CSP security endpoint: `https://app.glitchtip.com/api/22431/security/?glitchtip_key=8a2c416ba7464b6bb50a194b32b12832`
- The `ErrorLog` model in `backend/apps/common/models.py` is deprecated. The `error_logs` table is preserved for historical records but no longer written to.
- `ERROR_ALERT_EMAIL` is still used for non-error-monitoring alerts (uptime, payment failures, SLA breaches).
- Frontend error reporting endpoint (`/api/v1/errors/report/`) remains unauthenticated (`AllowAny`), CSRF-exempt, and rate-limited.
- Frontend `tracesSampleRate` is set to 0.01 (1%) to conserve GlitchTip disk space.

## Admissions Business Logic Services

The admissions domain uses thin service modules for each business logic domain. Each service follows the same pattern: static methods, custom error class with `code`/`message`, `select_for_update()` locking, and notification helpers.

| Service | Location | Purpose |
|---------|----------|---------|
| `WithdrawalService` | `backend/apps/applications/withdrawal_service.py` | Student-initiated withdrawal with enrollment decrement and waitlist promotion |
| `InterviewService` | `backend/apps/applications/interview_service.py` | Interview scheduling with 48h notice, conflict detection, mode validation |
| `WaitlistManager` | `backend/apps/applications/waitlist_manager.py` | Position assignment, auto-promotion, reindexing, override logging |
| `ConditionManager` | `backend/apps/applications/condition_manager.py` | Conditional admission lifecycle: assign, verify, auto-promote/reject |
| `EnrollmentService` | `backend/apps/applications/enrollment_service.py` | Enrollment confirmation and deadline computation from academic calendar |
| `AmendmentService` | `backend/apps/applications/amendment_service.py` | Student amendment requests with admin approval workflow |
| `CommunicationService` | `backend/apps/common/communication_service.py` | Template-based notifications and emails with `{{variable}}` substitution |
| `FeeWaiverService` | `backend/apps/documents/fee_waiver_service.py` | Fee waiver granting and effective fee computation |

### Extended State Machine

Application statuses now include: `draft`, `submitted`, `under_review`, `waitlisted`, `conditionally_approved`, `approved`, `enrolled`, `rejected`, `withdrawn`, `expired`, `enrollment_expired`. The `ALLOWED_TRANSITIONS` map in `services.py` is the single source of truth. Terminal statuses (no outbound transitions): `rejected`, `withdrawn`, `expired`, `enrolled`, `enrollment_expired`.

### Admissions Business Logic Endpoints

| Method | Path | Permission | Domain |
|--------|------|------------|--------|
| POST | `/api/v1/applications/{id}/withdraw/` | Owner | Withdrawal |
| GET | `/api/v1/applications/{id}/waitlist-position/` | Owner/Admin | Waitlist |
| GET | `/api/v1/applications/{id}/conditions/` | Owner/Admin | Conditions |
| POST | `/api/v1/applications/{id}/conditions/{cid}/verify/` | Admin | Conditions |
| POST | `/api/v1/applications/{id}/confirm-enrollment/` | Owner | Enrollment |
| POST | `/api/v1/applications/{id}/assign/` | SuperAdmin | Reviewer assignment |
| POST | `/api/v1/applications/auto-assign/` | SuperAdmin | Reviewer auto-assign |
| POST | `/api/v1/applications/{id}/fee-waiver/` | SuperAdmin | Fee waivers |
| POST | `/api/v1/applications/{id}/amendments/` | Owner | Amendments |
| POST | `/api/v1/applications/{id}/amendments/{aid}/review/` | Admin | Amendment review |
| GET | `/api/v1/admin/templates/` | Admin | Communication templates |
| PUT | `/api/v1/admin/templates/{key}/` | Admin | Communication templates |

### DuplicateChecker Terminal Statuses

`TERMINAL_STATUSES = {"rejected", "withdrawn", "expired", "enrolled", "enrollment_expired"}` — applications in these statuses do not block new applications for the same program+intake.

### IntakeEnforcer Grace Period

When the intake deadline has passed, `IntakeEnforcer.check_submission()` checks `grace_period_days` on the intake. If within the grace period, returns `IntakeCheckResult(allowed=True, is_late=True)`. The `submit_application()` service then sets `is_late_submission=True` and enforces late fee payment if configured.

### Payment Retry Limits

`PaymentService.initiate_payment()` enforces a maximum of 5 payment attempts per application (excluding expired payments older than 7 days). The `poll_pending_payments_task` expires payments pending > 24 hours. Forward-only transitions include `pending → expired`.

### Batch Operation Safety

`ApplicationBulkStatusView` enforces: max 25 applications per batch, all-or-nothing validation, SHA-256 confirmation token, single transaction, and waitlist promotion on batch rejections.

### Idempotency

State-changing endpoints use the `@idempotent` decorator (`backend/apps/common/idempotency.py`) for replay protection. Command identity is `(idempotency_key, actor, method, path, body_hash)`. Same key + same body returns the cached response. Same key + different body returns 409 Conflict. The `IdempotencyKey` model stores cached responses with TTL-based cleanup. Applied to submission (`POST /api/v1/applications/{id}/submit/`) and other critical write endpoints.

## Celery Beat Periodic Tasks

Celery Beat runs as a dedicated Koyeb worker service (exactly 1 instance to avoid duplicate dispatches). The schedule is defined in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`:

| Task | Schedule | Purpose |
|------|----------|---------|
| `keep_alive_task` | Every 240 seconds (4 minutes) | Lightweight ping to /health/live/ to prevent Koyeb cold starts |
| `check_uptime_task` | Every 900 seconds (15 minutes) | Internal health check — pings `/health/ready/`, alerts on failure/recovery transitions |
| `cleanup_stale_sessions_task` | Daily at 02:30 UTC | Deactivate expired device sessions |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC | Purge expired audit log records and CSRF tokens: standard retention 90 days, security retention 365 days |
| `cleanup_idempotency_keys` | Daily at 03:00 UTC | Purge expired idempotency key records |
| `poll_pending_payments_task` | Every 600 seconds (10 minutes) | Polls Lenco API for pending payments, expires payments > 24h, max 50 per run |
| `process_pending_emails_task` | Every 120 seconds (2 minutes) | Sweep stale pending EmailQueue rows |
| `intake_manager_task` | Daily at 04:00 UTC | Ensures at least 2 open intakes exist following the Jan/Jul pattern |
| `condition_expiry_task` | Daily at 05:00 UTC | Expires overdue admission conditions, triggers auto-rejection |
| `draft_expiry_reminder_task` | Daily at 06:00 UTC | Reminds students about stale drafts (7+ days), expires drafts at 30 days |
| `review_sla_reminder_task` | Daily at 07:00 UTC | Notifies admins about applications exceeding review SLA threshold |
| `document_verification_sla_task` | Daily at 08:00 UTC | Notifies admins about documents pending verification beyond SLA, escalates at 2x |
| `enrollment_confirmation_expiry_task` | Daily at 09:00 UTC | Expires unconfirmed enrollments, decrements capacity, triggers waitlist promotion |
| `waitlist_cascade_task` | Daily at 10:00 UTC | Cascades waitlisted applications to next intake when current intake closes |
| `deferred_payment_reminder_task` | Daily at 11:00 UTC | Reminds students who deferred payment to complete it |
| `interview_auto_complete_task` | Every 7200 seconds (2 hours) | Auto-completes interviews whose scheduled time has passed |
| `interview_reminder_task` | Every 3600 seconds (1 hour) | Sends reminder notifications for interviews within next 24 hours |

Infrastructure tasks live in `backend/apps/common/tasks.py`. Payment/document tasks in `backend/apps/documents/tasks.py`. Application tasks in `backend/apps/applications/tasks.py`. Intake tasks in `backend/apps/catalog/tasks.py`.

## Uptime Monitoring

Two layers of uptime monitoring are in place:

1. **Internal**: `check_uptime_task` (Celery Beat, every 15 minutes) sends `GET` to the configured `HEALTH_CHECK_URL` (default: `***REMOVED***`) with a 10-second timeout. Tracks previous status in Redis key `uptime:last_status`. On healthy→unhealthy transition: dispatches alert email. On unhealthy→healthy: dispatches recovery email. Repeated failures without recovery do not produce duplicate alerts. Uses the `requests` library.
2. **External**: [UptimeRobot](https://uptimerobot.com/) (free tier) monitors `***REMOVED***` every 5 minutes from outside the network. Sends email alerts to `***REMOVED***` on failure and recovery.

## Secrets Rotation

A runbook for rotating production secrets lives at `docs/runbooks/secrets-rotation.md`. It covers JWT signing key, database credentials, Resend API key, S3/R2 keys, and Redis URL rotation with step-by-step procedures and rollback guidance.

## Generative AI Boundary

**Admissions makes no generative AI call.** Admissions-v2 task 7.4 removed the
whole admissions AI surface (R11.1, R11.9) and task 12.4 removed what was left of
its dependency footprint and documentation. The only remaining generative
integration on the platform belongs to **jobs-ops**.

| Surface | Where | Model | Boundary |
|---------|-------|-------|----------|
| Jobs-ops match scoring, resume tailoring, outreach drafting, posting analysis | `backend/apps/jobs/ai_service.py` | Vercel AI Gateway (`JOBS_OPS_AI_MODEL_*`) | jobs-ops only |
| Admissions grade extraction | `backend/apps/documents/tasks.py::extract_document_text_task` → `apps/documents/grade_extraction.py` | **server-side Tesseract**, no model | admissions; deterministic |
| Admissions review readiness | `apps/applications` review-workspace query | none — deterministic evaluator | admissions |
| Student submission summary | wizard review step | none — composed from stored fields + validation | admissions |

- The gateway settings live in the **jobs-ops namespace**:
  `JOBS_OPS_AI_GATEWAY_API_KEY`, `JOBS_OPS_AI_GATEWAY_BASE_URL`,
  `JOBS_OPS_AI_MODEL_FAST` (gemini-2.5-flash), `JOBS_OPS_AI_MODEL_ANALYSIS`
  (gpt-4o-mini), `JOBS_OPS_AI_MODEL_SMART` (deepseek-v3). The **env var** names
  are unchanged (`AI_GATEWAY_API_KEY`, `AI_MODEL_*`) so no deployment was
  re-keyed; only the Django setting names moved.
- `openai` is declared in `backend/requirements.txt` under an explicit
  **jobs-ops-only** section. Its single importer in the whole backend is
  `apps/jobs/ai_service.py`. It is not a platform dependency and must not become
  one.
- **OCR is deterministic assistance, not AI, and it never has authority.**
  `extract_document_text_task` (120 s soft / 180 s hard) proposes
  `(subject_id, grade, confidence, provenance)` candidates resolved *only* through
  the versioned alias catalogue; the student must confirm each row before it
  becomes application data, and a manual entry always wins. An unrecognised label
  stays unresolved rather than being guessed. The per-user cap on re-extract is
  `DOCUMENT_EXTRACT_RATE_LIMITS` — a CPU/DoS lever, never an AI flag.
- The **frontend ships no OCR or AI package at all**: browser `tesseract.js` /
  `tesseract.js-core` and their 29 MB asset step were removed by task 7.5.
- See `docs/ai-data-flows.md` for what actually leaves the platform.

**Retired — do not reintroduce.** `GET /api/v1/applications/{id}/admin-summary/`,
`GET /api/v1/applications/{id}/preview-summary/`,
`backend/apps/common/ai_service.py`, `ai_cache.py`, `ai_circuit_breaker.py`,
`ai_prompt_redactor.py`, `AIUserScopedRateThrottle`, the un-namespaced
`AI_GATEWAY_*` / `AI_MODEL_*` Django settings, and the entire
`AI_HARDENING_CIRCUIT_BREAKER` / `AI_HARDENING_RATE_LIMITS` /
`AI_HARDENING_CACHE` / `AI_HARDENING_REDACTION` flag family. Setting any of those
flags does nothing. `backend/tests/unit/test_no_admissions_generative_ai_guard.py`
fails if an admissions module imports a generative client, reads a gateway
setting, re-registers a retired route, or re-defines a retired flag — and also if
the jobs-ops service or the server-side OCR dependencies disappear, because
isolation proven by deleting the other product is not isolation.

## Current Jobs Ops State

- `apps/jobs-ops` is a real operator dashboard, not a placeholder shell.
- Search and recommendation filtering are implemented in the jobs inbox.
- Major views have loading states.
- Backend jobs-ops domains exist for jobs, outreach, automation, integrations, analytics, and reports.
- Schema generation is currently clean.
- Verified backend suites currently include application endpoints, notification endpoints, and jobs-ops endpoint coverage.

## Verification Expectations

- Run relevant backend pytest suites when you change Django code.
- Run jobs-ops type-check, lint, and build when you change `apps/jobs-ops`.
- Regenerate the schema after backend API changes.
- Keep steering files aligned with the actual repo state.
- When modifying `ErrorDisplay`, `Settings.tsx`, `useSessionListener.ts`, `session_views.py`, `RefreshView`, or `ApplicationTrackView`, re-run the corresponding audit production fix tests to verify no regressions.
- Backend endpoints that return lists must use the `{"success": true, "data": [...]}` envelope format. Do not return raw lists from authenticated endpoints.

## Security Hardening (April 2026 Audit)

The following security measures were applied during the April 2026 full repository audit:

- Admin privilege escalation blocked: admins cannot assign roles higher than their own, and cannot modify users with higher roles. Self-deactivation is prevented.
- Batch user import now creates an `AuditLog` entry with `action=user_batch_import` for every batch operation. Per-row savepoints handle `IntegrityError` races without discarding the entire batch. Role-level validation prevents creating users with roles above the actor's own.
- Bulk notification retry no longer re-sends emails for already-processed notifications. The task retries with only the remaining unprocessed IDs.
- `ApplicationReviewView` payment gate now checks the full `_RESOLVED_PAYMENT_STATUSES` tuple (including `verified`, `paid`, `deferred`) instead of a subset.
- Tracked `.env.development` and `.env.production` placeholder files removed from the repository. Only `.env.example` and `.env.scripts.example` remain as tracked templates. Real env files (`.env`, `.env.local`, `.env.vercel.*`) are gitignored.

### Known Open Issues (from AUDIT-REPORT-2026-04-24.md)

These findings are documented but not yet fixed:

- `cleanup-idempotency-keys` Celery Beat task uses a bare task name instead of a dotted module path.
- `SessionView.get()` returns non-envelope format for unauthenticated users.
- Several catalog, analytics, and integrations views return raw data without the `{"success": true, "data": ...}` envelope.
- `PaymentVerifyView` and `PaymentInitiateView` lack per-user rate limiting.
- `IsAuthenticatedOrDebug` permission class bypasses auth when `DEBUG=True`.
- `AuditMiddleware` does not populate `entity_id` from URL path segments.
- `ReadOnlyMiddleware` queries the database on every write request when the env var is not set.
- ~~Jobs-ops frontend has no auth refresh interceptor or session management.~~ **Resolved (2026-07-11).** `apps/jobs-ops/src/services/api/client.ts` already implements a 401-triggered token refresh with single-retry, in-memory CSRF token storage attached to state-changing requests, and CSRF-error recovery via `?refresh_csrf=1`. `apps/jobs-ops/src/auth/AuthContext.tsx` bootstraps the session and revalidates on tab-visibility regain (`useVisibilityRevalidation`). Verified via `apps/jobs-ops/tests/unit/apiClient.test.ts` and `authContext.test.ts` (31 tests passing). Fixed two stale tests in `router.test.ts` that asserted a hard sign-in redirect — `ProtectedRoute` is an intentional no-op passthrough (jobs-ops renders standalone; reads are public scaffold routes, writes are backend-policy-gated), and those tests predated that architecture decision.
- 7 SQL scripts in `backend/scripts/` are fully applied and stale (safe to archive).
- `idempotency_redesign.sql` contains a `DROP TABLE` without a re-run guard.

See `AUDIT-REPORT-2026-04-24.md` and `all-files.txt` for the full file-by-file audit inventory.
