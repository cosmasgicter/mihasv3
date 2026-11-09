# Beanola Canonical Truth Map

This is the master index of canonical sources of truth in the Beanola
multi-school admissions platform. **Beanola Technologies is the platform owner
and platform identity; MIHAS, KATC, and any future school are tenants, never
platform identity.** Every domain concept has exactly one source of truth; every
other reference is a consumer. Drift-guard tests catch divergence at CI time.

## Active Alignment Spec

The active implementation authority for the admissions product is
`.kiro/specs/admissions-v2-canonical-rebuild/`. It owns the V2 admin, reviewer,
student, tenant, catalog, payment, document, API-contract, database-alignment,
mobile, and admissions de-AI work. It requires executable evidence before a
finding or task can be called complete.

### Student journey repair (P0a)

`.kiro/specs/student-journey-repair/` (Spec A) is registered as an active
alignment spec. It repairs the student journey end to end: object storage and
uploads, rate limiting, document keys and viewing, the single document opener,
submit readiness and draft grades, session continuity and registration phone
handling, and the development-only diagnostics badge. It narrows, and does not
supersede, the V2 spec: where it names a behaviour it is authoritative for that
behaviour, and it keeps every V2 preservation clause true. Its P0a tasks (1-3)
are complete when the checkpoint in `tasks.md` task 3.30 is green; its R7 tests
keep their strict markers until task 5.6. The blocking CI journey gate
(`.github/workflows/student-journey-gate.yml`, task 4, `bash harness/bin/harness
journey-gate`) is its answer to R9; making its two jobs required checks on `main`
is an operator step in repository settings. Spec B is a separate spec and is not
registered here.

The archived `canonical-multi-tenant-alignment` spec and other earlier active or
archived specs remain historical design and evidence inputs. When an
admissions-specific implementation choice conflicts with the V2 spec, the V2
spec is authoritative. This does not supersede unrelated jobs-ops,
infrastructure, or operator-owned work in those specs.

The supersession boundary is admissions-only and authority-only. Registering the
V2 spec here does **not** change the completion status of any other spec and does
**not** archive any spec: existing specs keep their own `.config.kiro` status and
their location, and are neither marked complete nor moved to `_archived/` merely
because the V2 spec exists. Older specs are superseded only where an
admissions-specific choice conflicts with the V2 spec.

Every live spec (each directory directly under `.kiro/specs/`, excluding the
`_archived/` history) must carry a unique spec ID in its `.config.kiro`. The spec
metadata validator `scripts/validate_spec_metadata.py` enforces this: it fails on
a duplicated live spec ID or invalid `.config.kiro` JSON, and warns on missing
metadata. The broader finding/requirement/task/evidence validator (spec task 0.2)
is separate and layers on top of this metadata check.

**Rule:** Any new domain concept added to the platform must register in this map
before merging. If it has a frontend mirror, a drift-guard test is required (see
"No New Mirrors Without Guard" below).

## No New Mirrors Without Guard (R1.2)

Any **enum, status, error code, document type, route name, role, permission,
payment state, or tenant scope** that is shared by both the frontend and the
backend requires a registered Drift_Guard test. A concept is allowed to live in
only one layer without a guard **only** when it is explicitly recorded here as
backend-only (no frontend data mirror) — in which case the "Frontend mirror /
drift guard" note must say so.

- If a domain concept or frontend mirror exists in active runtime source without
  a corresponding entry in this map and (where a mirror exists) a Drift_Guard
  test, the Verification_Gate fails (R1.4).
- A cross-layer mirror is registered with either a Drift_Guard test or an
  explicit backend-only note (R1.3).
- Legacy-fallback branches are governed by the "Legacy-string fallback
  allowlist (R1.3)" subsection under Multi-Tenant: named as legacy, test-covered,
  non-executing for new canonical records, and with a documented removal
  condition (R1.5).

## Platform Identity, Routes, and Operational Config

| Concept | Source of truth | Consumers / drift guard |
|---------|-----------------|--------------------------|
| Platform brand (owner identity) | `backend/apps/catalog/services.py:InstitutionContextService.BEANOLA_BRAND` (`name="Beanola Admissions"`, `owner="Beanola Technologies"`) | `GET /api/v1/catalog/context/` shared-portal default; frontend `apps/admissions/src/lib/constants/landing.ts:contactInfo`; brand drift guards (`backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`) |
| Tenant brand (school identity) | `backend/apps/catalog/models.py:Institution` rows (per-tenant brand name/colors/emails/domains; seeded by `management/commands/brand_institutions.py`) | white-label host resolution via `InstitutionContextService`; tenant data only — never platform identity |
| Platform attribution metadata | `backend/apps/common/meta_views.py` (`creator: Cosmas Kanchepa`, `developer: Beanola Technologies`, `https://beanola.com`) | `GET /api/v1/meta/platform/` |
| Product admin tenant surface (route) | `apps/admissions/src/routes/config.tsx` → `{ path: '/admin/tenants', guard: 'admin' }` (lazy `@/pages/admin/Tenants`) | **Beanola product admin** UI for tenant onboarding / school management; **authoritative for the launch smoke check (R14.3)**. No route rename. |
| Django operational admin surface (route) | `backend/config/urls.py` → `path("beanola-admin-panel/", admin.site.urls)` | low-level Django framework admin; checked separately from `/admin/tenants` per the R1 two-surface decision. No route rename. |
| Object storage | `backend/config/settings/base.py` (`AWS_S3_ENDPOINT_URL` ← `S3_ENDPOINT_URL`; `AWS_S3_PUBLIC_ENDPOINT_URL` ← `S3_PUBLIC_ENDPOINT_URL`, signing host only, defaults to the internal endpoint; `AWS_QUERYSTRING_EXPIRE` ← `S3_SIGNED_URL_TTL_SECONDS`, 10-3600, default 900; private bucket; prod and staging refuse to start without `S3_*` and the rest of `REQUIRED_ENV_VARS`, checked in `apps.common.apps.CommonConfig.ready()` when `STARTUP_ENV_VALIDATION` is true) and `backend/apps/common/storage.py` (`get_s3_client`, `get_presign_client`, `generate_signed_url`) | local-test stack MinIO (`backend/docker-compose.local-test.yml`, bucket `mihas-localtest`); round-trip check `manage.py storage_roundtrip_check --expect-private`; contract test `backend/tests/unit/test_storage_settings_contract.py` |
| Client IP and proxy trust (SJR R3-a/R3-b) | `backend/apps/common/request_utils.py:get_client_ip` - `X-Forwarded-For` is read only when `REMOTE_ADDR` is inside `TRUSTED_PROXY_CIDRS` (`base.py`, env `TRUSTED_PROXY_CIDRS`, default loopback + private ranges) and only `NUM_PROXIES` hops deep (default 1: Caddy). `RATELIMIT_IP_META_KEY` points django-ratelimit's `key="ip"` at it. Document budgets: per-IP `/api/v1/documents/upload/` 60/10m then `/api/v1/documents/` 300/10m (`RateLimitMiddleware.SCOPE_LIMITS`); per-user `DocumentUserRateThrottle` (`apps/common/throttling.py`) `documents_write` 40/hour and `documents_read` 300/hour, off when `RATELIMIT_ENABLE` is false, fail-open on cache errors | `RateLimitMiddleware`, `ClientIpIdentMixin` throttles, audit network fields, public-tracking failure throttle; `backend/tests/unit/test_sjr_rate_limit_bug_conditions.py`, `test_sjr_client_ip_trust.py` |
| Email sender / default contact | `backend/config/settings/base.py` (`DEFAULT_FROM_EMAIL` ← `ZOHO_FROM_EMAIL`/`EMAIL_FROM`, default `admin@beanola.com`; `EMAIL_FROM` default `noreply@beanola.com`; `ERROR_ALERT_EMAIL` default `admin@beanola.com`) | outbound email (`apps/common/tasks.py`, `apps/common/email/`); default contact `apps/common/communication_service.py:_DEFAULT_CONTACT_EMAIL` (`admissions@beanola.com`); admin setting `accounts/admin_serializers.py` `contact_email` |
| OpenAPI metadata | `backend/config/settings/base.py:SPECTACULAR_SETTINGS` (`TITLE`, `DESCRIPTION`, `VERSION`, `SERVERS`) | `python3 manage.py spectacular`; `/api/v1/` docs. Current title is `"Beanola Platform APIs"` and servers point to `api.beanola.com` plus local development. |
| Public routes / SEO | `apps/admissions/src/components/seo/Seo.tsx` (`DEFAULT_SITE_NAME="Beanola Admissions"`, default image `/images/logos/beanolalogo.webp`, site URL ← `VITE_APP_BASE_URL`/`VITE_SITE_URL`, default `https://apply.beanola.com`) | per-page `<Seo>` usage across public/student routes (`LandingPage`, `tracker`, `Privacy`/`Terms`/`Contact`, auth, dashboard) |
| Brand_Allowlist | `docs/legacy-brand-allowlist.json` (reviewed single-file entries permitted to contain MIHAS/KATC/Mukuba/Kalulushi/legacy-domain strings) | Brand_Drift_Guard pair (`backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`); R2 owns tightening |

## Application Lifecycle

| Concept | Source of truth | Consumers (drift-guarded) |
|---------|-----------------|----------------------------|
| Status enum & transitions | `backend/apps/applications/services.py:ALLOWED_TRANSITIONS` | `apps/admissions/src/types/applicationStatus.ts` |
| Online student drafts | `backend/apps/applications/models.py:Application` rows where `status='draft'` (optional student-facing `draft_name` label — additive nullable column, `backend/scripts/2026_07_24_01_application_draft_name.sql`, task 6.2/R10.9) | Canonical multi-draft collection: `GET /api/v1/applications/drafts/` (own drafts only), `POST /api/v1/applications/drafts/` (start — requires the minimum canonical `program_id`+`intake_id`, `Idempotency-Key`-idempotent, never an empty payload and never silent duplicate `existing_id` adoption), `GET/PATCH/DELETE /api/v1/applications/drafts/{id}/`, and the validated label command `PATCH /api/v1/applications/drafts/{id}/rename/` (writes only `draft_name`, never assignment IDs). Also the dashboard draft list (`GET /api/v1/applications/?mine=true&status=draft`), wizard resume/update/delete (`GET/PATCH/DELETE /api/v1/applications/{id}/`), uploads, grades, payment protection. `Application.id` is the canonical draft id. Frontend consumers: `apps/admissions/src/services/applications.ts:startDraft/renameDraft`, `useMultiDraft`, `WizardDraftPicker` (the removed `DraftManager.tsx`'s successor). **The open wizard draft has one frontend owner** (task 6.3, R10.2, design §8.2): the draft machine `apps/admissions/src/lib/wizardDraftController.ts` (pure graph `wizardDraftMachine.ts`, pure rules `wizardDraftProjection.ts`) owns hydration, edits (answers **and grades**: the grade grid is a second channel saved by the same debounce through `POST /api/v1/applications/{id}/grades/` with `partial: true`, at most 10 rows, atomic under the application row lock; the submit minimum is still enforced by readiness and `submit_application`), debounced/8 s autosave, Save now, retry, conflict reload/merge, delete-detach, payment gate and submit; hooks and components are adapters or views over it. Its local outbox (`draftLocalCache.ts` over `localStorageCache.ts`, AES-GCM-encrypted) is, for an attached draft, one record addressed by `(user, application, assignment)` — the slot is keyed by user + application, and the assignment (`program_offering_id\|intake_id` as the server reports it) is carried in the record and matched on every read, so a record for another assignment is never replayed and opens the explicit conflict instead. It holds only the pending answers, their base and version (record format 3, `applicationWizard/lib/draftOutbox.ts`), plus the pending grade rows while there are any (format 4; SJR task 3.23), exists only while the server lacks an edit, and is cleared on successful sync, submit, sign-out/owner change, or a server-confirmed delete/`404` (task 6.3 M14). An unattached new application keeps its whole form in the user's one `:new` slot, removed only when that application attaches or on explicit `mode=new`. No outbox operation ever touches the payment-recovery store. Hydration takes the record's canonical `intake_id`, never the shared display name. Drift-guarded by `tests/unit/wizardDraft*.test.ts*` (including `wizardDraftOutboxMinimisation.test.tsx`), `tests/property/wizardDraft*.property.test.ts`, `tests/property/draftOutboxMinimisation.property.test.ts`, `tests/unit/localStorageCacheEncryptedOutbox.test.ts`, `tests/unit/draftHydrationCanonicalIntake.test.ts`, and the required journeys `wizard-draft-refresh-each-step.spec.ts` / `wizard-draft-slow-network.spec.ts`. |
| Compatibility draft payload | `backend/apps/applications/models.py:ApplicationDraft` + `ApplicationDraftView` (`/api/v1/applications/draft/`) | Compatibility/cache metadata only. Not the canonical online draft list and not a production wizard routing source. Removal condition: all frontend callers use explicit `Application(status='draft')` multi-draft APIs. |
| Wizard draft intent | Frontend route registry helpers for `/student/application-wizard?mode=new` and `/student/application-wizard?mode=resume&draftId=<application_id>` | Legacy `?new=true`, `?fresh=1`, and `/student/applications/new` normalize to `mode=new`; no silent timestamp-based resume or duplicate `existing_id` adoption. |
| Application assignment (reroute) | `backend/apps/applications/change_selection_service.py:change_application_selection` — the **only** writer of `applications.{institution_id, program_id, program_offering_id, intake_id}` and their display snapshots `{institution, program, intake}` on an existing row (admissions-v2 task 6.4, R7.2/R10.5, design §7.2; finding STU-01). Canonical IDs only; one transaction moves every ID, display snapshot, `configuration_version`, `requirements_snapshot`, `eligibility_snapshot`, re-resolved `application_fee`, and the cleared dependent answers (`DEPENDENT_ANSWER_FIELDS`), bumping `assignment_version`. **Any** `Payment` row makes a reassignment immutable (`ASSIGNMENT_LOCKED_BY_PAYMENT` 409 + structured `recovery`). | Command endpoint `POST /api/v1/applications/drafts/{id}/change-selection/` (owner-scoped, `Idempotency-Key`-idempotent, `assignment_version` optimistic guard). Assignment creation (first write) is `resolve_assignment_snapshot` via `POST /api/v1/applications/` + `/applications/drafts/` (task 5.2). The generic `PATCH /api/v1/applications/{id}/` and `…/drafts/{id}/` accept **no** assignment field — `program`/`intake`/`institution` are `read_only` on `ApplicationSerializer` (`ASSIGNMENT_FIELDS`, excluded from `DRAFT_SAFE_FIELDS`). Frontend consumers: `apps/admissions/src/services/applications.ts:changeSelection`, `…/applicationWizard/lib/selectionChange.ts` (intent + recovery), `useWizardController.applyDraftSelectionChange`. |
| Status UI labels/badges | `apps/admissions/src/lib/applicationStatusUi.ts` | (consumers via import) |
| Terminal statuses | `apps/admissions/src/types/applicationStatus.ts:TERMINAL_STATUSES` | `backend/apps/applications/duplicate_checker.py:TERMINAL_STATUSES` |
| Withdrawal eligibility | `apps/admissions/src/lib/withdrawalEligibility.ts:canWithdraw` | `backend/tests/unit/test_withdrawal_eligibility.py` |
| Drift guards | `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts` + `backend/tests/property/test_lifecycle_canonical.py` |

## Payment

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Canonical payment status enum | `backend/apps/documents/payment_service.py:CanonicalStatus` | `PAYMENT_TO_APP_MAP` |
| Derived app payment_status | `backend/apps/documents/payment_service.py:PAYMENT_TO_APP_MAP` | `apps/admissions/src/lib/paymentStatus.ts:normalizePaymentStatus` |
| State transitions | `backend/apps/documents/payment_service.py:ALLOWED_TRANSITIONS` | `_transition()` (sole writer) |
| Force-approved propagation | `review_queue.py:PAYMENT_READY_STATUSES`, `admin_views.py:_RESOLVED_PAYMENT_STATUSES`, analytics, frontend `normalizePaymentStatus` | drift-guarded |
| Payment error codes | `backend/apps/documents/payment_error_codes.py:PAYMENT_ERROR_CODES` | `apps/admissions/src/lib/paymentErrorCodes.ts` |
| Canonical fee resolution | `backend/apps/documents/fee_resolver.py:FeeResolver` (offering + fee_type + residency + active only; `FeeConfigurationError`→`FEE_NOT_CONFIGURED`/`FEE_AMBIGUOUS`; **no default, no name lookup** — DATA-05/STU-08) | `payment_helpers._resolve_fee_for_application`/`_build_snapshot_dict`, `FeeResolveView`, `V2FeeResolveView`; DB invariant `uq_program_fees_one_active` |
| Webhook event identity | `backend/apps/documents/webhook_processor.py:WebhookEventIdentity` | dedup table `webhook_event_logs` |
| Drift guards | `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts` + `backend/tests/unit/test_payment_status_canonical.py` + `test_payment_force_approved_propagation.py` |

### One payment path (Admissions V2 task 8.2, R12.4/R12.5)

Every payment concern below had **two** implementations selected by a feature
flag. Task 8.2 proved they produced the same ledger, fixed the two places where
they did not, and deleted the duplicate. There is now one answer to "what is this
payment's status, and who decided that?".

| Concept | Single source of truth | Retired duplicate (deleted) |
|---------|------------------------|------------------------------|
| Status mutation | `payment_service_mixins/_core.py:PaymentCoreMixin._transition` — sole writer (ADR-007); also persists provider `lenco_reference` / `payment_method` / `fee` / `bearer` / failure reason | `_update_payment_status` + flag `PAYMENT_HARDENING_FORWARD_ONLY` |
| Transition matrix | `payment_constants.py:ALLOWED_TRANSITIONS` (tuple-keyed, per-source) | `_ALLOWED_TRANSITIONS` (status-keyed, narrower) |
| Verification | `PaymentService.verify` | `verify_payment` |
| Initialisation | `PaymentService.initiate` | `initiate_payment` |
| Callback | `PaymentService.apply_webhook_event` | `process_webhook_event` / `_process_webhook_event_impl` |
| Callback ingress + dedup | `webhook_processor.py:WebhookProcessor.process` → `compute_identity`/`is_duplicate` (ADR-004) | `_process_legacy` + `_payload_hash`/`_event_identity` + flag `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` |
| Expiry | `PaymentService.expire_stale` (transitions + audits + notifies `payment_expired`) | inline expiry loop in `poll_pending_payments_task` |
| Admin override with no prior Payment | `PaymentService.force_approve` → `force_approved` row (ADR-002) | synthetic zero-amount `successful` row + flag `PAYMENT_HARDENING_FORCE_APPROVED` |
| Frontend payment UI + recovery | `apps/admissions/src/lib/paymentStatus.ts:derivePaymentUiState` + `stores/paymentRecoveryStore.ts`, unconditional | `isPaymentHardeningUiEnabled()` + flag `VITE_PAYMENT_HARDENING_UI` |
| Surviving payment flag | `PAYMENT_HARDENING_RATE_LIMITS` (throttle policy only — same path either way) | — |
| Drift guards | `backend/tests/unit/test_payment_single_path_8_2.py` (outcome table + no-flag/no-symbol guard), `test_prod_settings_required_flags.py::test_retired_flag_is_not_reintroduced` |
| Evidence | `docs/v2-evidence/8.2/` (two-column parity run, the divergence it found, replay results) |

### Payment phase — who is being waited on (Admissions V2 task 8.2, R12.4/R12.6)

`payments.status` answers "has the money arrived?". It deliberately does not
answer "who are we waiting for?", and a `pending` payment is two different
situations: the provider has issued the customer prompt and the **student** must
enter a PIN, or the request is still with **Lenco** and the student can do
nothing. Conflating them is finding **STU-09** — the platform either demanded an
action that was impossible or hid one that was needed, and offered a retry that
could double-charge. `phase` is a derived read, never a stored column, so it
cannot disagree with `status`.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Payment phase enum + derivation | `backend/apps/documents/payment_phase.py:PaymentPhase` / `derive_payment_phase(status, provider_initiation)` (pure; reads only `metadata.provider_initiation.status`, never phone data) | `PaymentSerializer.phase`; `apps/admissions/src/lib/paymentStatus.ts:PaymentPhase` |
| Per-phase UI wait budget | `payment_phase.py:PHASE_UI_TIMEOUT_SECONDS` — `action_required` 120 s, `provider_processing` 600 s; settled phases carry none | `PaymentSerializer.phase_timeout_seconds`; `usePaymentStatus` (server budget overrides `POLL_TIMEOUT_MS`); `PAYMENT_WAITING_STATES` |
| Waiting-state affordances | `apps/admissions/src/lib/paymentStatus.ts:PAYMENT_WAITING_STATES` (`studentActionable`, copy, `onTimeout`) | `PaymentForm` pending panel (`data-payment-phase`), `PaymentStep`, `PaymentStatusBlock` |
| Pending UI split | `paymentStatus.ts:derivePaymentUiState` — `action_required` / `provider_processing`, falling back to `awaiting_provider` when the payload carries no phase | `PaymentForm`, integration UI-state matrix |
| Drift guards | `backend/tests/unit/test_payment_phase_8_2.py` (derivation, serializer contract, no-PII, **and the two mirror guards that read `paymentStatus.ts` so either side drifting fails**) + `apps/admissions/tests/unit/paymentPhaseUiStates.test.ts` (affordances differ; student chased sooner than provider) |

Invariants a reviewer can check: a settled status never reports a waiting phase
regardless of stale provider metadata; only the two waiting phases have a wait
budget; `action_required`'s budget is strictly smaller than
`provider_processing`'s; and the retry affordance is rendered **only** when the
student is the one being waited on.

### Student payment ownership split (Admissions V2 task 8.3, R12.3/R12.6)

Which **surface** owns a payment state is a single answer, because the surfaces
contradicting each other is finding **STU-09**: the payment page was documented as
read-only while submitted, deferred, and failed applications had nowhere else to
recover. The line is submission.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Pre-submission pay / defer | `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx` | the wizard only — it renders no history and no recovery |
| Post-submission state + history | `apps/admissions/src/components/student/payment/PaymentApplicationCard.tsx` | `pages/student/Payment.tsx` — never renders a draft; hands drafts back to the wizard |
| State → copy + single action | `apps/admissions/src/lib/paymentRecovery.ts:PAYMENT_RECOVERY_PRESENTATION` — a **total** `Record<PaymentUiState, …>`, plus `PAYMENT_DEFERRED_PRESENTATION` | the recovery card; adds no state vocabulary of its own |
| "May an initiate control render?" | `paymentRecovery.ts:PaymentRecoveryPresentation.allowsInitiate` — `false` for every waiting state | the double-charge guard as data; also the R12.6 "no indefinite disabled control" rule (a waiting state renders a wait, not a disabled button) |
| "May the prompt be re-sent?" | `paymentRecovery.ts:resolvePaymentRecovery().resendAvailable` — only a spent **`action_required`** budget | never `provider_processing`: a second collection against a working provider is how a student is charged twice |
| Deferral clears the recovery entry | `PaymentStep` after `deferPayment` resolves and when the application reports `deferred`; `PaymentForm.syncPendingPayment` on a `deferred` verify result (stops the poll, resets the pending method and payment id) | server answers only; `allowsInitiate` is untouched (SJR task 3.24) |
| Tenant support affordance | `apps/admissions/src/lib/tenantSupport.ts:resolveTenantSupportContact` — resolved tenant inbox, else the neutral in-app `/contact` route | payment page + recovery card (STU-24); no hardcoded address, never MIHAS/KATC |
| Drift guards | `apps/admissions/tests/unit/feeProviderSourceScan.test.ts` (source scan: no hardcoded support copy, no legacy tenant, the wizard has no history, `paymentRecovery.ts` restates no wait budget), `paymentRecoveryPresentation.test.ts` (totality over `PaymentUiState`), `paymentOwnershipSplit.test.tsx`, and the 7 required browser journeys in `tests/harness-e2e/required/payment-ownership-split.spec.ts` |
| Evidence | `docs/v2-evidence/8.3/` (journey matrix, both required projects) |

### Server-authored fee quote (Admissions V2 task 8.1, R12.1/R12.2/R12.6)

The **quote** is the money contract for one payment attempt: the amount a student
is shown is the amount the server will accept, it expires, it is signed, it is
bound to the fee configuration it was minted from, and it can fund exactly one
Payment. It closes findings **STU-08** (the client computed a 1% transaction fee
and showed a K150/USD 20 default) and **DATA-05** (an invented default amount).

`Payment` remains the source of truth for money that has moved (ADR-001); the
quote is the record of what was *agreed* before it moved. Local and harness seeds
(`harness_seed_tenants`) create canonical `program_fees` rows, so a fresh database
resolves a fee through `FeeResolver` like any other.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Fee quote lifecycle + signing | `backend/apps/documents/fee_quote_service.py:FeeQuoteService` (`QUOTE_ACTIVE`→`redeemed`/`expired`/`superseded`/`cancelled`; HMAC-SHA256 over the canonical payload; `fee_configuration_fingerprint` binds the quote to the configuration that priced it) | `payment_service_mixins/_initiation.py:_bind_fee_quote` (card initiate, mobile money, defer), `FeeQuoteView` |
| Quote record | `payment_fee_quotes` table — `backend/scripts/2026_07_30_01_payment_fee_quotes.sql` (+ `_rollback`); model `backend/apps/documents/models.py:FeeQuote` (`managed = False`) | DB invariants: `chk_payment_fee_quotes_total_is_sum`, `chk_payment_fee_quotes_merchant_bearer_zero_fee`, `chk_payment_fee_quotes_redeemed_binding`, `uq_payment_fee_quotes_one_active`, `uq_payment_fee_quotes_payment` |
| Provider-fee policy (the retired client 1%) | `backend/apps/documents/fee_quote_service.py:provider_fee_policy` ← settings `PAYMENT_PROVIDER_FEE_PERCENT` / `_FIXED` / `_CAP` / `_BEARER` | quote `provider_fee`/`bearer`, `Payment.fee`/`Payment.bearer`, `FeeResolveView` preview (`is_binding_quote: false`), `V2FeeResolveView` |
| Quote TTL + signing key | settings `FEE_QUOTE_TTL_SECONDS`, `FEE_QUOTE_SIGNING_KEY`, `FEE_QUOTE_SIGNATURE_VERSION` | `quote_ttl()`, `FeeQuoteService.sign` |
| Quote command surface | `POST /api/v1/payments/quote/` (create/reuse), `GET /api/v1/payments/quote/?application_id=` (read live) — `backend/apps/documents/fee_quote_views.py` | `apps/admissions/src/hooks/useFeeQuote.ts` |
| Quote error codes | `backend/apps/documents/payment_error_codes.py` — `QUOTE_NOT_FOUND` (404), `QUOTE_EXPIRED` (409), `QUOTE_ALREADY_REDEEMED` (409), `QUOTE_INVALID` (409), `QUOTE_CONFIGURATION_CHANGED` (409) | `apps/admissions/src/lib/paymentErrorCodes.ts` mirror + copy |
| Quote recovery action | `next_action: "refresh_quote"` (`payment_helpers.fee_authority_error_response`) | `apps/admissions/src/lib/paymentNextActions.ts` |
| Client money rendering | `apps/admissions/src/lib/serverAmount.ts` (`formatServerAmount` — display only, **no arithmetic**) | `PaymentStep.tsx`, `PaymentForm.tsx`, `student/Payment.tsx` |
| Drift guards | `backend/tests/unit/test_payment_error_codes_snapshot.py`, `test_payment_next_action_canonical.py`, `test_client_money_authority_scan_8_1.py` (runs `backend/scripts/scan_client_money_authority.py`), `apps/admissions/tests/unit/paymentErrorCodes.test.ts` + `__fixtures__/paymentErrorCodesBackendMirror.ts` |

Invariants a reviewer can check: the client performs **no** amount arithmetic and
holds **no** default fee (`scan_client_money_authority.py`); provider network
routing is derived server-side from the MSISDN, never sent by the client; a
Payment is only ever created together with a redeemed quote whose base amount
equals `Payment.amount`; and an expired, redeemed, superseded, tampered, or
configuration-drifted quote funds nothing.

### Settlement + fee administration (Admissions V2 task 8.4, R3/R6.5/R8.3-R8.4/R12.5-R12.7)

The **server** decides which rows an admin money surface shows, what its totals
are, what state reconciliation is in, and what an export may contain. This closes
finding **ADM-06** (settlement rows were fetched broadly and filtered
client-side; totals were summed in the browser) and the fee/settlement half of
**AUTH-02** (authority was a role string).

**No new capability was invented.** Read authority reuses the existing tenant
capabilities, and export authority is `tenant.application.export` — the platform's
one tenant export grant (`AdminCapabilityService._GRANTED_MUTATION_CAPABILITIES`
maps the `export` membership/grant permission onto it). A new `tenant.*` string
with no derivation path would be a capability nobody could ever hold. The
catalogue therefore stays at 17 `platform.*` + 17 `tenant.*`.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Settlement / fee query authority | `backend/apps/documents/settlement_service.py:SettlementQueryService` — scope (`visible_institution_queryset` + `AccessScopeService.filter_payments`), SQL filters, SQL grouping, whole-set aggregates, reconciliation derivation, redaction | `PaymentSettlementSummaryView`, `AdminFeeListView` |
| Settlement report | `GET /api/v1/payments/settlements/` (`backend/apps/documents/payment_query_views.py:PaymentSettlementSummaryView`) — `tenant.payment.read`; `{page,pageSize,totalCount,totalPages,results,aggregates,filters,redaction,can_export}` | `apps/admissions/src/services/admin/settlement.ts` → `hooks/admin/useMoneyAdmin.ts` → `pages/admin/tenants/SettlementPanel.tsx` |
| Fee administration report | `GET /api/v1/admin/fees/` (`backend/apps/documents/fee_admin_views.py:AdminFeeListView`) — `tenant.program.read`; same envelope plus coverage aggregates (`offerings_in_scope`, `configured_offering_count`, `unconfigured_offering_count`) | same service/hook → `pages/admin/ProgramFees.tsx` |
| Fee **writes** | `/api/v1/programs/{id}/fees/` (`ProgramFeeViewSet`) — read `tenant.program.read` via `HasTenantCapability` + `resolve_scoped_program`; write `platform.program_assignment.manage` via `HasPlatformCapability`; every write emits `tenant.fee.created` / `.updated` / `.deactivated` | `services/admin/catalog.ts` fee mutations |
| Reconciliation state (derived, never stored) | `settlement_service.py` — `RECONCILIATION_STALE_HOURS = 24` (read from the sweep's own cutoff, `PaymentService.expire_stale` via `poll_pending_payments_task`), verdicts `attention_required` / `in_flight` / `uncollected` / `settled` / `no_activity` | row + aggregate `reconciliation_state`; frontend `ReconciliationState` in `services/admin/settlement.ts` |
| Export authority + audit | `tenant.application.export`; `TenantAuditService.record_export` with `ACTION_SETTLEMENT_EXPORTED = "settlement.exported"` / `ACTION_FEE_EXPORTED = "fee.exported"` (security retention; records actor, institution scope, filters, row count vs `EXPORT_ROW_LIMIT`, redaction — never the rows) | both `?export=csv` paths; a refusal emits `auth.denied` |
| Export size ceiling | `settlement_service.py:EXPORT_ROW_LIMIT = 5000` — over-limit is `EXPORT_TOO_LARGE` (400), never a silent truncation | both exports |
| Platform-only (redacted) columns | `settlement_service.py:PLATFORM_ONLY_SETTLEMENT_FIELDS = ("collector", "quarantined_count")`, `PLATFORM_ONLY_FEE_FIELDS = ("peer_offering_count",)` | scope decides *which rows*; redaction decides which **platform** columns travel with them |
| Disclosure | no tenant scope → masked **404**; in scope without the capability → non-revealing **403**; an out-of-scope `institution_id` / `program_offering_id` / offering id → masked **404** + `scope.denied` (never a 200 with an empty page, which would confirm the id resolves) | `authorize_tenant_surface`, `SettlementScopeDenied` |
| Drift guards | `backend/tests/unit/test_settlement_fee_authority_8_4.py` (tenant A/B authority + export, 35 cases), `test_payment_settlement_tenant.py`, `test_settlement_csv_export.py`, `tests/property/test_admin_fee_auth.py` (capability gates, not role classes), `scripts/authority_matrix_registry.py` entries, `apps/admissions/tests/unit/feeProviderSourceScan.test.ts` (8 admin-surface rules: no client institution predicate, no client money arithmetic, no page-derived total, export gated on the server's `can_export`), `apps/admissions/tests/unit/moneyAdminServerOwned.test.tsx` |
| Evidence | `docs/v2-evidence/8.4/` |

Invariants a reviewer can check: no admin money surface filters by institution in
the browser; every settlement total comes from the server's `aggregates` over the
whole filtered set (so paging cannot change it); every payment read on the
settlement path is an aggregate query, so cost does not follow the ledger's size;
an export ignores the page and is refused rather than truncated; and a read-only
tenant operator can read both reports but export neither.

### Admin applications query contract (Admissions V2 task 9.1, R8.1/R8.6)

The **server** owns the admissions roster: which rows an actor sees, how they are
searched, filtered, and sorted, what page they fall on, which filter options
exist, what the portfolio totals are, when a deadline falls due, and what an
export may contain. This closes finding **ADM-01** — totals and select options
were derived from the currently loaded page, and a dashboard tile linked to a
parameter nothing parsed.

**No new capability was invented.** Read authority is `tenant.application.read`
(already in the default tenant read bundle) and export authority is
`tenant.application.export` — the platform's one tenant export grant, the same
one task 8.4 spends. The catalogue stays at 17 `platform.*` + 17 `tenant.*`.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Applications query authority | `backend/apps/applications/query_service.py:ApplicationQueryService` — scope (`AccessScopeService.filter_applications` ∘ `apply_reviewer_assignment_scope`, identifier filters resolved through `visible_institution_queryset` **before** any query), SQL filters, SQL sort, whole-filtered-set aggregates, SQL facets, redaction | `AdminApplicationQueryView`, `AdminApplicationSavedFilter*View` |
| Applications report | `GET /api/v1/admin/applications/` (`backend/apps/applications/admin_query_views.py:AdminApplicationQueryView`) — `tenant.application.read`; `{page,pageSize,totalCount,totalPages,results,aggregates,facets,filters,redaction,can_export}` inside the `data` envelope | `apps/admissions/src/services/admin/applications.ts` → `hooks/admin/useApplicationRoster.ts` → `hooks/admin/useApplicationsData.ts` → `pages/admin/Applications.tsx` |
| **Registered query parameters** (the one roster vocabulary) | `query_service.py:REGISTERED_PARAMETERS` — `institution_id`, `program_offering_id`, `intake_id`, `assigned_reviewer_id`, `status`, `exclude_status`, `payment_status`, `program`, `intake`, `institution`, `search`, `reviewer_assignment`, `is_late_submission`, `has_pending_amendments`, `review_queue`, `overdue_review`, `has_pending_documents`, `has_upcoming_interviews`, `deadline_pressure`, `start_date`, `end_date`, `sort`, `order`, `page`, `pageSize`, `export`, `saved_filter`. Anything outside the set is echoed in `filters.unknown_parameters` rather than silently dropped | Frontend mirror: `hooks/admin/useApplicationFilters.ts:REGISTERED_PARAMETER_BY_FILTER_KEY` + `ROSTER_URL_PARAMETERS` (the only spelling written to a URL); dashboard links: `pages/admin/lib/rosterDeepLinks.ts:ROSTER_DEEP_LINK_QUERIES`. Drift guards: `backend/tests/unit/test_application_query_contract_9_1.py::TestRegisteredParameterContract`, `apps/admissions/tests/unit/applicationRosterDeepLinks.test.ts` (parses the backend set) |
| Sort allow-list | `query_service.py:SORT_FIELDS` (+ `SORT_ALIASES` for the legacy `date`/`name`/`payment`/`activity` spellings). An unknown key falls back to `DEFAULT_SORT`, never interpolated into `order_by` | `sort` / `order` parameters |
| Whole-set aggregates + their definitions | `query_service.py:ApplicationQueryService.aggregates` / `aggregate_definitions` — 21 `Count(… filter=Q(…))` counters, `Min`/`Max` timestamps, and a definition string per headline number (R8.6) | `data.aggregates`; frontend `ApplicationAggregates`. `null`, never a zeroed shape, while there is no answer |
| Facets (filter options) | `query_service.py:FACET_SPECS` + `facets()` — SQL `GROUP BY` over the whole filtered set with each dimension's own filter left open (`admin_query_views.py:FACET_OPEN_DIMENSIONS`); `FACET_LIMIT = 200` with `truncated: true` rather than a silent drop | `data.facets`; the roster's program/institution/status selects |
| Deadline window (derived, never stored) | `query_service.py:DEADLINE_PRESSURE_HOURS = 48` + the `next_deadline_at` annotation (soonest open `ApplicationCondition.deadline` or `enrollment_confirmation_deadline`) — the dashboard's "Deadlines in 48h" tile promoted to a registered SQL predicate | `deadline_pressure` filter, `deadline_pressure_count` / `next_deadline_at` aggregates, `rosterDeepLinks.deadlinePressure` |
| Review SLA window | `query_service.py:DEFAULT_REVIEW_SLA_DAYS = 5`, overridden by the `review_sla_days` `Setting` — the same key `review_sla_reminder_task` reads | `overdue_review` filter, `overdue_review_count`, published as `aggregates.review_sla_days` |
| Saved filters | table `admin_saved_filters` (`backend/scripts/2026_08_06_01_admin_saved_filters.sql`, additive), model `backend/apps/applications/models.py:AdminSavedFilter`, routes `GET/POST /api/v1/admin/applications/saved-filters/` + `DELETE .../{id}/`. Private to their owner (scoped by `user_id` **before** lookup); only registered parameters may be persisted (`UNREGISTERED_QUERY_PARAMETER` otherwise); an optional `institution_id` is re-resolved on read so a saved view cannot outlive the membership that justified it | `services/admin/applications.ts` saved-filter calls; replaces the single `sessionStorage` slot |
| Export authority + audit | `tenant.application.export`; `TenantAuditService.record_export` with `admin_query_views.py:ACTION_APPLICATION_EXPORTED = "application.exported"` (security retention; records actor, institution scope, filters, row count vs the ceiling, redaction — never the rows). A refusal emits `auth.denied` | `?export=csv`; `data.can_export` gates the button |
| Export size ceiling | `query_service.py:EXPORT_ROW_LIMIT = 5000` — over-limit is `EXPORT_TOO_LARGE` (400), never a silent truncation. Page-independent by construction (the service drops `page`/`pageSize`) | `?export=csv` |
| Platform-only (redacted) column | `query_service.py:PLATFORM_ONLY_APPLICATION_FIELDS = ("peer_offering_count",)` — not merely hidden: not computed for a tenant actor | `data.redaction.withheld_fields` |
| Disclosure | no tenant scope → masked **404**; in scope without the capability → non-revealing **403**; an out-of-scope `institution_id` / `program_offering_id` / `intake_id` / `assigned_reviewer_id` / `saved_filter` → masked **404** + `scope.denied` (never a 200 with an empty page, which would confirm the id resolves) | `authorize_tenant_surface`, `ApplicationScopeDenied` |
| Drift guards | `backend/tests/unit/test_application_query_contract_9_1.py` (51 cases, incl. every aggregate vs an independent raw-SQL count), `scripts/authority_matrix_registry.py` entries for the three routes, `apps/admissions/tests/unit/applicationRosterServerOwned.test.tsx`, `apps/admissions/tests/unit/applicationRosterDeepLinks.test.ts`, `apps/admissions/tests/harness-e2e/required/admin-applications-roster.spec.ts` |
| Evidence | `docs/v2-evidence/9.1/` |

Invariants a reviewer can check: the roster's headline numbers come from
`data.aggregates` and are identical on every page of the same query; its filter
options come from `data.facets` and include values with no row on the current
page; no dashboard tile, Celery notification, or bookmark emits a parameter
outside `REGISTERED_PARAMETERS`; an application **command** never lives on this
route (writes keep their own `/api/v1/applications/` paths and capabilities); and
an out-of-scope identifier filter is indistinguishable from one that does not
exist.

### Admin dashboard metric contract (Admissions V2 task 9.2, R8.6/R17.3-R17.6)

Every number the admin dashboard renders is a **registry entry**, not a field on
an ad-hoc payload. An entry declares what it counts (a sentence), whose data it
counts (its scope), which read produces it (its source), and — where the metric
*is* the count of a roster — the registered query its tile links to. A metric is
either `ok` with an integer or `unknown` with `None`; there is no third state and
no default value, which is what makes "missing data never becomes a healthy zero"
structural rather than a convention.

This closes finding **ADM-02** (three counters rendered but computed nowhere and
read as `0`; a failed read substituting zeros and `systemHealth: 'good'`; scoped
polling silently replacing a selected school's numbers with platform-wide totals;
enabled accounts labelled online users) and the dashboard half of **MAINT-02**
(decorative metrics with no source).

**No new capability, no new endpoint, no schema change.** The dashboard keeps
`GET /api/v1/admin/dashboard/` and `tenant.application.read`, and every
application number is computed by task 9.1's `ApplicationQueryService` over
`scoped_applications` — the same scope-before-lookup queryset the roster uses.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Dashboard metric registry | `backend/apps/accounts/dashboard_metrics.py` — `APPLICATION_METRIC_COUNTERS` (14 metric → counter pairs) + `_ACCOUNT_METRICS` (2), assembled by `dashboard_metric_registry()`. A metric whose counter has no definition raises at import rather than shipping an unlabelled number | `DashboardMetricsService.build` → `AdminDashboardView`; frontend mirror `apps/admissions/src/pages/admin/lib/dashboardMetrics.ts:DASHBOARD_METRIC_KEYS` |
| Metric states | same module — `STATE_OK` / `STATE_UNKNOWN`. `unknown` carries `value: null` and a `reason`; there is no zero-valued fallback anywhere on the path | `data.metrics[key].state`; `dashboardMetrics.ts:formatMetricValue` renders `UNKNOWN_METRIC_LABEL = 'Unknown'` |
| Metric definitions | `query_service.py:ApplicationQueryService.dashboard_definitions()` = `aggregate_definitions()` ∪ `DASHBOARD_ONLY_DEFINITIONS`. A tile that reuses an aggregate counter reuses its **sentence**, so a number cannot mean one thing on the dashboard and another on the roster | `data.metrics[key].definition`; rendered as each tile's helper text |
| Metric scope | same module — `SCOPE_INSTITUTION` / `SCOPE_PLATFORM`, plus the payload's `scope` block (`kind`, `institution_id`, `all_access`, `institution_count`) | `data.scope`; the dashboard's "Counting every school / the selected school / your school" line |
| Tile ↔ roster pairing | `query_service.py:DASHBOARD_TILES` — the six exception tiles, each as `{roster_query, counter}`. The counter is computed with the same `Q` the query parses to, so a tile's number **is** the `totalCount` of the roster its link opens | frontend `Dashboard.tsx:EXCEPTION_TILES` + `rosterDeepLinks.ts` (task 9.1 spelling); drift guards below |
| Counters | `query_service.py:ApplicationQueryService.dashboard_counters` — one `.aggregate()` of `_aggregate_expressions()` plus the five only tiles need (`pending_documents_count`, `upcoming_interviews_count`, `payment_review_count`, `activity_this_week_count`, `activity_this_month_count`), over the scoped queryset (R17.5) | `data.metrics[*].value`; `data.windows.by_status` from `status_breakdown` |
| Read health (derived, never defaulted) | `dashboard_metrics.py` — `HEALTH_OPERATIONAL` / `HEALTH_DEGRADED` / `HEALTH_UNKNOWN` + `HEALTH_DEFINITIONS`, derived from `sources`. Replaces the four-value `excellent`/`good`/`warning`/`critical` grade the backend never sent and the frontend defaulted to `'good'` | `data.health`; the "Data sources: …" line and the degraded notice |
| Source failure isolation | same module — `SOURCE_APPLICATIONS` / `SOURCE_ACCOUNTS` / `SOURCE_ACTIVITY`, each its own `try/except` in `DashboardMetricsService._read`. A failed source marks **its own** metrics unknown; the reason names the exception class only, never a database message | `data.sources`; `health: 'degraded'` |
| Freshness | same module — `STALE_AFTER_SECONDS = 120` published with `generated_at`. **Polling only** — no SSE or WebSocket on this surface (repo convention) | `data.freshness`; `dashboardMetrics.ts:isStale` / `freshnessLabel`. A missing server budget falls back to `0` (immediately stale), never a generous default |
| Activity feed bound | same module — `ACTIVITY_LIMIT = 10` (R17.5) | `data.recent_activity` |
| Enabled-account relabel (MAINT-02) | same module — `staff_accounts_enabled` counts `profiles.is_active`, i.e. *permission to sign in*. Its definition states the platform does not measure presence. The pre-9.2 payload published it as `users.active` and the page rendered "N active users online" | `data.metrics.staff_accounts_enabled`; the "Staff accounts enabled" headline metric. `data.users.enabled` replaces `data.users.active` |
| Pre-9.2 compatibility blocks | `AdminDashboardView._legacy_blocks` — `applications` / `users` / `needs_attention` are populated **only** where a metric answered; an unknown metric's key is **omitted** rather than written as `0` | older consumers; the dashboard reads `metrics` |
| Scoped polling | `apps/admissions/src/hooks/useAdminDashboardPolling.ts:adminDashboardPollingKey(institutionId)` puts the school in the React Query key **and** `fetchDashboardStats(institutionId)` puts it on the wire; the payload carries `institutionId` back so a switch-in-flight race is discarded rather than rendered. Second gate on the reducer: `useAdminDashboardLoader` refuses a `patch-metrics` whose institution is not `loadedInstitutionId` | `Dashboard.tsx`, `data/applications.ts:useStats`, `useAdminPendingCount`, `useAdminTotalApplicationCount`, `speculativePrefetch.ts` (seeds the `'all'` entry) |
| Disclosure | `?institution_id=` resolves through `ApplicationQueryService.resolve_institution_filter` **before** any query; out-of-scope or unknown → masked **404** + `scope.denied` (`dashboard.institution`), never a 200 whose zeros would confirm the id resolves | `AdminDashboardView.get` |
| Drift guards | `backend/tests/unit/test_dashboard_metrics_9_2.py` (29 cases, incl. every metric against an independent raw-SQL count and every tile counter against its roster total), `apps/admissions/tests/unit/dashboardMetricsTruthful.test.tsx` (20 cases; parses the backend registry, so the key list cannot drift), `apps/admissions/tests/unit/page-verification/admin-dashboard.test.tsx`, `apps/admissions/tests/harness-e2e/required/admin-dashboard-metrics.spec.ts` (5 journeys × 2 viewports) |
| Evidence | `docs/v2-evidence/9.2/` |

Invariants a reviewer can check: every rendered number has a `definition` and a
`state`; no code path on the dashboard converts an absent or failed metric into
`0`; `health` is absent (`null` → "Unknown") rather than optimistic when nothing
was measured; a tile's count equals the `totalCount` of the roster its link
opens; and every poll request carries the `institution_id` the page is showing.

### Admin user directory contract (Admissions V2 task 9.3, R6.1-R6.5)

The **server** owns the user directory: which accounts an actor sees, how they
are searched, filtered, and sorted, what page they fall on, which filter options
exist, what the headline counts are, which fields a mutation may carry, what an
import will do before it does it, and what an export may contain. This closes
finding **ADM-03** (one server page fetched, then filtered/sorted/paginated/
exported in the browser; update fields accepted with a 200 and silently
discarded), **ADM-04** (a batch import with no preview, no tenant binding, no
declared atomicity, and one opaque failure), and the directory half of
**AUTH-04** (a role vocabulary that existed in three disagreeing places).

**No new capability was invented.** Read authority is `tenant.staff.read`, write
authority is `tenant.staff.invite`, a deactivation additionally needs
`tenant.staff.disable`, and export authority is `tenant.application.export` — the
platform's one tenant export grant, the same one tasks 8.4 and 9.1 spend. The
catalogue stays at 17 `platform.*` + 17 `tenant.*`.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| User-directory query authority | `backend/apps/accounts/user_directory_service.py:UserDirectoryQueryService` — scope (`AccessScopeService`-derived `visible_institution_queryset` composed into `scoped_users`; `resolve_user` / `resolve_institution_filter` resolve identifiers **before** any lookup), SQL filters, SQL sort, whole-filtered-set aggregates, SQL facets, redaction | `AdminUserListView`, `AdminUserDetailView`, `AdminUserExportView` |
| User directory report | `GET /api/v1/admin/users/` (`backend/apps/accounts/user_directory_views.py:AdminUserListView`) — `tenant.staff.read`; `{page,pageSize,totalCount,totalPages,results,aggregates,aggregate_definitions,facets,filters,redaction,can_export,supported_roles}` inside the `data` envelope | `apps/admissions/src/services/admin/userDirectory.ts` → `hooks/admin/useUserDirectory.ts` → `pages/admin/Users.tsx` |
| **Registered query parameters** (the one directory vocabulary) | `user_directory_service.py:REGISTERED_PARAMETERS` — `institution_id`, `role`, `search`, `is_active`, `include_inactive`, `has_membership`, `start_date`, `end_date`, `sort`, `order`, `page`, `pageSize`, `export`. Anything outside the set is echoed in `filters.unknown_parameters` rather than silently dropped | Frontend mirror: `pages/admin/lib/usersReducer.ts:toDirectoryQuery` (the only place UI state becomes request parameters). Drift guards: `backend/tests/unit/test_user_directory_9_3.py::TestPageTwoAndBeyond`, `apps/admissions/tests/unit/userDirectoryServerOwned.test.tsx` (parses the backend set) |
| Supported roles (one contract, three consumers) | `user_directory_service.py:SUPPORTED_ROLES` — **derived** from `apps/accounts/permissions.py:ROLE_HIERARCHY`, ordered least → most authority. Published on the report as `supported_roles` | `AdminUserListView.post` / `AdminUserDetailView.patch` validation, `UserImportService.plan`, `UserBulkService.apply`; frontend `usersReducer.ts:ROLE_VALUES` / `AVAILABLE_ROLES`. Drift guards: `test_admin_serializers.py::test_import_row_vocabulary_is_derived_not_restated`, `userDirectoryServerOwned.test.tsx` (parses `ROLE_HIERARCHY`) |
| Mutation field contract | `user_directory_service.py:CREATE_FIELDS` / `UPDATE_FIELDS` / `IMPORT_ROW_FIELDS` + `UserDirectoryQueryService.reject_unsupported`. A field outside the set is **`UNSUPPORTED_FIELD` (400)** naming it, never a 200 that drops it — `email` and `phone` were sent by the edit form and absent from the pre-9.3 serializer | the create/update/import request bodies; `services/admin/userDirectory.ts` sends only these names |
| Sort allow-list | `user_directory_service.py:SORT_FIELDS` (+ `SORT_ALIASES` for the legacy `name`/`created`/`status` spellings). Every ordering ends in `id` so paging is total; `role` orders by `role_rank` (the platform hierarchy in SQL) rather than alphabetically | `sort` / `order`; frontend `usersReducer.ts:SORTABLE_COLUMNS`, `UsersTableSection.tsx` headers |
| Whole-set aggregates + their definitions | `UserDirectoryQueryService.aggregates` / `aggregate_definitions` — 6 counters plus one per role, each with a sentence. `staff_without_membership_count` names the ADM-04 population: staff accounts with no active membership and therefore no tenant access | `data.aggregates`; `components/admin/UserStats.tsx`. An absent count renders as **`Unknown`** (`formatStat`), never `0` |
| Facets (filter options) | `user_directory_service.py:FACET_SPECS` + `facets()` (`role`, `is_active`) and `_institution_facet` (joined from `user_institution_memberships`) — SQL `GROUP BY` over the whole filtered set with each dimension's own filter left open (`user_directory_views.py:FACET_OPEN_DIMENSIONS`); `FACET_LIMIT = 200` with `truncated: true` rather than a silent drop | `data.facets`; the directory's role select, with each option's whole-set count |
| Derived display name | the `display_name` annotation (`full_name`, else the first/last pair, else the email) — computed in SQL, so the table, the CSV, the dialog title, and the **search** all read one string | `results[].full_name`; searched via `display_name__icontains` so a name read off the table can be found |
| Import command | `backend/apps/accounts/user_import_service.py:UserImportService` — `plan` is the single validator shared by preview and commit; `commit` applies it. Routes `POST /api/v1/admin/users/batch-import/preview/` and `POST /api/v1/admin/users/batch-import/` | `services/admin/userDirectory.ts` `previewImport` / `commitImport`; `components/admin/UserImport.tsx` |
| Import atomicity (declared, not assumed) | `user_import_service.py:IMPORT_MODES` — `all_or_nothing` (default; any invalid row or write conflict creates **nothing**) and `per_row` (a savepoint per row keeps the rows that worked). Savepoints are used in both modes: in `per_row` they preserve the rows, in `all_or_nothing` they preserve the *diagnosis* | request `mode`; the dialog's "If a row fails" select |
| Import tenant binding | `UserImportService.resolve_institution` — `institution_id` is **required** and resolved through `visible_institution_queryset` before any write; every created account gets an active `UserInstitutionMembership` in the same transaction, and the per-row role ceiling is `AdminCapabilityService.can_invite_staff` | `INSTITUTION_REQUIRED` (400) when absent, masked **404** when out of scope |
| Import row errors | `user_import_service.py:ROW_ERROR_CODES` — stable codes with a **1-based** row number matching the operator's file (the pre-9.3 response reported `{"index": null}`). Downloadable as CSV: `services/admin/userDirectory.ts:importErrorsToCsv` / `downloadImportErrors` | `data.errors`; the dialog's "Download failures" |
| Import replay safety | the platform's `@idempotent` (`apps/common/idempotency.py`) on the commit route; the client sends an `Idempotency-Key` per command. Absent a key, a replayed `all_or_nothing` batch fails closed as `EMAIL_EXISTS` on every row | `POST …/batch-import/` |
| Bulk command | `backend/apps/accounts/user_bulk_service.py:UserBulkService` + `POST /api/v1/admin/users/bulk/` — operations `set_role` / `deactivate` / `reactivate`, `MAX_BULK_SIZE = 25` (the same batch budget `ApplicationBulkStatusView` uses), one transaction, all-or-nothing, per-target error codes, sessions revoked for every authority change, audited as `user_bulk_updated`. Replaces a browser `for` loop of N `PATCH` calls | `hooks/admin/useUserDirectory.ts:useUserBulkCommand`; `components/admin/BulkUserOperations.tsx` |
| Bulk confirmation token | `user_bulk_service.py:confirmation_token_for` — SHA-256 over the sorted target ids + operation + role, **verified server-side**. Frontend mirror `services/admin/userDirectory.ts:userBulkConfirmationToken`; drift-guarded by `userDirectoryServerOwned.test.tsx` against the backend source | `confirmation_token` in the request body; the dialog's typed code |
| Export authority + audit | `tenant.application.export`; `TenantAuditService.record_export` with `user_directory_views.py:ACTION_USER_EXPORTED = "user.exported"` (security retention; records actor, institution scope, filters, row count vs the ceiling, redaction — never the rows). A refusal emits `auth.denied` | `GET /api/v1/admin/users/export/` and `GET /api/v1/admin/users/?export=csv` (one implementation, two spellings); `data.can_export` gates the button |
| Export size ceiling | `user_directory_service.py:EXPORT_ROW_LIMIT = 5000` — over-limit is `EXPORT_TOO_LARGE` (400), never a silent truncation. Page-independent by construction (the service drops `page`/`pageSize`) | `services/admin/userDirectory.ts:exportPath` |
| Platform-only (redacted) columns | `user_directory_service.py:PLATFORM_ONLY_USER_FIELDS = ("institution_count", "institution_names")` — not merely hidden: `institution_names` is not computed for a tenant actor | `data.redaction.withheld_fields`; absent from both the JSON rows and the CSV header |
| Batch-import audit payload | `user_import_service.py:ACTION_USER_BATCH_IMPORT = "user_batch_import"` (preserved) — records mode, outcome, counts, created ids, per-row error codes, and email **fingerprints** (`email_fingerprint`). The pre-9.3 row wrote `created_emails`, i.e. contact PII, into `audit_logs` | `audit_logs`; `TestImportIsPreviewedTenantBoundAtomic::test_the_batch_is_audited_and_carries_no_address` |
| Disclosure | no tenant scope → masked **404**; in scope without the capability → non-revealing **403**; an out-of-scope `institution_id` or user id → masked **404** + `scope.denied` (`user.institution` / `user`). A role-ceiling breach is a **403** rather than a mask, because the *role* is the problem and no other tenant is involved | `authorize_tenant_surface`, `UserScopeDenied` |
| Drift guards | `backend/tests/unit/test_user_directory_9_3.py` (63 cases, incl. every aggregate vs an independent raw-SQL count), `scripts/authority_matrix_registry.py` entries for the six routes, `backend/tests/unit/test_unscoped_endpoint_guard.py` (GAP-9/GAP-10 re-pinned onto the new module + service seam tokens), `backend/tests/unit/test_view_auth_classification.py`, `apps/admissions/tests/unit/userDirectoryServerOwned.test.tsx` (18 cases; parses the backend source), `apps/admissions/tests/unit/adminUserImportEndpointConsistency.test.ts`, `apps/admissions/tests/harness-e2e/required/admin-user-directory.spec.ts` (8 journeys × 2 viewports) |
| Evidence | `docs/v2-evidence/9.3/` |

Invariants a reviewer can check: the directory's headline numbers come from
`data.aggregates` and are identical on every page of the same query; its role
options come from `data.facets` and carry whole-set counts; no page code filters,
sorts, slices, or measures the loaded rows; a mutation field outside the declared
contract is a 400 that names it rather than a 200 that drops it; an import states
whether it would commit *before* it commits and creates nothing at all when it
would not; a bulk change is one request whatever the selection size; an export
contains the whole filtered set whatever page is on screen; and no audit payload
on this surface contains an email address.

### Admin review workspace contract (Admissions V2 task 9.4, R8.2-R8.5/R8.7/R11.3)

> SJR R7-a: seeded school admins hold `tenant.application.review` by default
> (`seed_school_admins` adds the `review` membership permission, additively, via
> `_seed_memberships.py:seed_membership_permissions`; `--read-only` opts out).
> SJR R7-c: the review command requires at least one condition for
> `conditionally_approved` (`NO_CONDITIONS_PROVIDED`).

**One read, and one versioned command per decision.** Opening an application in
the admin workspace used to issue six requests plus a seventh for a model
(`/details/`, `/documents/`, `/grades/`, `/summary/`, `/interviews/`,
`/payments/?application_id=`, and the generative `/admin-summary/` that task 7.4
had already deleted). Two of those were worse than redundant: `/summary/`
returned a *second* copy of the application row which the browser merged over the
first, so which value a reviewer saw depended on response order (**API-02**). This
closes **AUTH-01** (a Reviewer could not reach the workspace in a browser at all —
the frontend guard routed them to the student dashboard while the mutations
required `IsAdmin`), **AUTH-02** (status/payment/document/interview/amendment/bulk
authority was a role tier, so a read-only tenant admin could mutate and a
legitimate Reviewer was denied), **AUTH-03** (manual reviewer assignment sent an
empty UUID), and the workspace half of **MAINT-01**.

**No new capability was invented.** Read authority is `tenant.application.read`;
each command maps onto a capability the catalogue already had. The catalogue stays
at 17 `platform.*` + 17 `tenant.*`.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Review-workspace authority | `backend/apps/applications/review_workspace_service.py:ApplicationReviewWorkspaceService` — the one place that decides which application an actor may open, what the sections contain, what the readiness checklist says, which commands this actor may issue, and which version a command must carry | `AdminApplicationReviewWorkspaceView`; every application command's version guard |
| The one detail query | `GET /api/v1/admin/applications/{application_id}/` (`backend/apps/applications/admin_review_workspace_views.py`) — `tenant.application.read` through `resolve_scoped_application` (scope **before** lookup, then `require_application_capability`, then the Reviewer assignment restriction). Returns `{application_id, version, status, identity, answers, assignment, evidence, payment, interview, conditions, amendments, communication, history, readiness, allowed_next_actions, allowed_transitions, capabilities, redaction, definitions, row_limit}` inside the `data` envelope, plus the version as a weak `ETag` | `apps/admissions/src/services/admin/reviewWorkspace.ts` → `hooks/admin/useReviewWorkspace.ts` → `components/admin/applications/ApplicationDetailModal.tsx` |
| **Named sections** (the API-02 answer) | `review_workspace_service.py:WORKSPACE_SECTIONS` — 11 named sections rather than one flattened payload, so a client renders what it understands and ignores what it does not. The application row appears **once** | the modal's projections in `components/admin/applications/workspaceAdapters.ts`; no `??` chain across two payloads |
| Deterministic reviewer readiness | `readiness_service.reviewer_summary` over `evaluate_readiness` — the **same** evaluator `submit_application` re-runs under its row locks (task 6.5). **No model call** (R11.1). `readiness` is **`null`**, never a zeroed checklist, when the canonical configuration cannot be evaluated | `data.readiness`; `components/admin/applications/ReviewReadinessPanel.tsx`, which renders `readiness-unavailable` rather than "nothing outstanding" |
| Per-command capability matrix | `review_workspace_service.py:COMMAND_CAPABILITIES` — `review_decision`/`review_amendment`/`verify_condition`/`manage_interview`/`assign_reviewer`/`bulk_review` → `tenant.application.review`; `verify_document` → `tenant.document.verify`; `verify_payment` and `grant_fee_waiver` → `tenant.payment.verify`; `export` → `tenant.application.export`. Resolved for the application's **own** institution through `AdminCapabilityService`, published on the read | `data.capabilities`; the frontend gates every control on it (`NO_WORKSPACE_CAPABILITIES` is the fail-closed default). Drift guard: `apps/admissions/tests/unit/reviewWorkspaceServerOwned.test.tsx` parses `COMMAND_CAPABILITIES` |
| Platform-composed command | `review_workspace_service.py:PLATFORM_ONLY_COMMANDS = {"grant_fee_waiver"}` + `PLATFORM_COMMAND_CAPABILITIES` — a waiver forgives money a tenant is owed, so its endpoint requires `platform.settings.manage`. The published answer is the tenant capability **and** the platform one, because publishing the tenant half alone would promise a control the backend refuses — the same defect the `verify_payment` gate closed. Auto-assignment is deliberately absent from the matrix: it sweeps every unassigned application the platform holds, so it is not a command about *this* application | `data.capabilities.grant_fee_waiver` |
| **Command version guard** | `review_workspace_service.py:read_expected_version` (body `expected_version`/`expectedVersion`, or the `If-Match` the read's ETag published), `assert_version`, `bump_version` (an `F()` expression, so two concurrent commands cannot both read 3 and write 4), `commit_command`. **Opt-in**: a caller supplying nothing is unaffected, the same choice `submit_application(expected_version=…)` made in task 6.5. A malformed version is a conflict, not a silent pass | every command *about one application*: `/review/` (decision + payment review), `/verify-document/`, `/interviews/` (POST/PATCH/PUT/DELETE), `/amendments/{id}/review/`, `/conditions/{id}/verify/`, `/assign/`, `/fee-waiver/`; and `/bulk-status/` per id. **`/auto-assign/` deliberately does not** — it sweeps every unassigned application the platform holds, so there is no single version to claim (the same reason it is absent from `COMMAND_CAPABILITIES`) |
| One version per application | `Application.version`. One counter covers the whole workspace deliberately: a decision recorded against evidence that has since been re-verified, an interview that has moved, or an amendment that has been approved is the same stale-write hazard, so **any** command that changes what the workspace shows advances the version every other command is checked against | `data.version`, the `ETag`, and each command's response `version` |
| `VERSION_CONFLICT` (409) | `review_workspace_service.py:ReviewVersionConflict` — stable code plus `current_version`, so a client reloads and retries rather than guessing. Reaches the wire through `apps/common/exceptions.py` (`409: "CONFLICT"` in `error_code_map`, overridden by the exception's own `get_codes()`, with `current_version` on the envelope) | frontend `reviewWorkspace.ts:isVersionConflict` / `VersionConflictError`; `useReviewCommand` **refetches** on a conflict rather than only reporting a failure |
| Roster row version | `query_service.py` `rows_for` emits `version` per row — the token a bulk decision from the roster must carry. Deliberately **absent from `ROW_COLUMNS`**, so it is not an export column: an export is a document about applicants, and an optimistic-lock counter is not a fact about an applicant | `hooks/admin/useApplicationsData.ts:rowVersions` → `pages/admin/Applications.tsx` bulk command → `expected_versions` |
| Bulk command versions | `ApplicationBulkStatusView` accepts `expected_versions` as an object of application id → version. **Per-id and opt-in**, because a bulk command is a set of decisions, not one; any id whose version moved fails the batch with `VERSION_CONFLICT` and the whole all-or-nothing batch is refused. Scope is applied **before** the lookup and composed with `apply_reviewer_assignment_scope`, so an assignment-scoped Reviewer cannot bulk-decide unassigned work. The response reports the **applied** set (`updated_count`, `versions`) | `services/applications.ts:bulkStatus` |
| Platform-only detail field | `review_workspace_service.py:PLATFORM_ONLY_DETAIL_FIELDS = ("other_tenant_application_count",)` — for a tenant operator the query is **never run**, so the cross-tenant fact is not merely withheld (R3.2) | `data.redaction.withheld_fields` |
| Section row cap | `review_workspace_service.py:SECTION_ROW_LIMIT = 100` — *reported* (`documents_truncated`, `history.truncated`) rather than applied silently. A workspace is a screen, not an export | `data.row_limit` |
| Allowed transitions | read from `apps/applications/services.py:ALLOWED_TRANSITIONS` — the state machine's one source. A terminal status returns `[]`, which is a fact, not an omission | `data.allowed_transitions` |
| Section definitions | `review_workspace_service.py:SECTION_DEFINITIONS` — a sentence per section shipped with the payload, so a reviewer can say what "evidence" or "readiness" contains without reading the module (R8.6 applied to a detail surface). Keyed by `WORKSPACE_SECTIONS`, so a new section cannot ship undefined | `data.definitions` |
| Disclosure | a Student, an out-of-tenant id, an unknown id, and an application an assignment-scoped Reviewer is **not assigned to** are one indistinguishable **404**; in scope without `tenant.application.read` is a non-revealing **403**. A masked probe emits `scope.denied` | `resolve_scoped_application`, `authorize_tenant_surface` |
| Drift guards | `backend/tests/unit/test_review_workspace_9_4.py` (49 cases, incl. "no role string is compared on the workspace surface" and "the view holds no domain logic"), `scripts/authority_matrix_registry.py` entry for `/api/v1/admin/applications/<uuid:application_id>/`, `apps/admissions/tests/unit/reviewWorkspaceServerOwned.test.tsx` (24 cases; parses the backend service), `apps/admissions/tests/harness-e2e/required/admin-review-workspace.spec.ts` (6 journeys × 2 viewports) |
| Evidence | `docs/v2-evidence/9.4/` |

Invariants a reviewer can check: opening an application issues **one** request for
it and none of the seven retired ones; the readiness checklist is the submission
evaluator's own output and is `null` rather than empty when it cannot be computed;
every control on the surface is gated on `data.capabilities` and re-enforced by
the endpoint; every command carries the version the read published, and a command
carrying an older one changes nothing; the version a bulk decision sends is the
one the roster row published, and it never appears in a CSV; and no code on this
surface compares a role string.

### Tenant audit feed and amendment recipients (Admissions V2 task 9.5, R3/R6.6/R13.10)

**Two questions, two endpoints — and the tenant panel was asking the wrong one.**
`GET /api/v1/admin/audit-logs/` answers *"what did people I share a school with
do"* (it narrows a non-super-admin by **actor**), which is legitimate for the
platform-wide audit trail page. `GET /api/v1/admin/institutions/{id}/audit/`
answers *"what happened to this school"* (it matches the institution the event
records). The tenant console's audit panel took an `institutionId`, put it in its
React Query key, and then called the **first** one — so a card titled
"Configuration audit" for the selected school rendered a platform-wide list, a
Platform_Admin's change to that school was missing from it, and switching schools
re-fetched the same list under a new cache key (**ADM-05**). The correct endpoint
existed but was gated on the `IsAdmin` role class with an inline scope-id set — no
`tenant.audit.read` check, no filters, and no export.

Separately, a student amendment request fanned the applicant's **name and
application number** out to every `admin` / `super_admin` row on the platform
(`Profile.objects.filter(role__in=[...])`), and `review_amendment` compared the
amendment's status and saved it with **no lock** (**AUTH-06**).

**No capability was invented.** The audit read is `tenant.audit.read`; the export
is the platform's one tenant export capability, `tenant.application.export`. The
catalogue stays at 17 `platform.*` + 17 `tenant.*`.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Tenant audit query authority | `backend/apps/catalog/tenant_audit_query_service.py:TenantAuditQueryService` — the one place that decides which school's feed an actor may read, which events belong to it, what the filters mean, what the facets count, and what the export contains | `AdminInstitutionAuditView` (the view holds no query logic) |
| The one tenant audit feed | `GET /api/v1/admin/institutions/{institution_id}/audit/` (`backend/apps/catalog/admin_views.py:AdminInstitutionAuditView`) — the id is resolved through `AdminCapabilityService.visible_institution_queryset` **before** any audit query, then `tenant.audit.read` is required *for that institution*. Returns `{institution_id, page, pageSize, totalCount, totalPages, results, facets, filters, categories, definitions, can_export}` inside the `data` envelope | `apps/admissions/src/services/admin/tenantAudit.ts` → `hooks/admin/useTenantAudit.ts` → `pages/admin/tenants/AuditPanel.tsx` |
| Event↔school match | `TenantAuditQueryService.scoped_events` — `changes.institution_id`, the fact every `TenantAuditService` write records, **not** the actor's memberships. A multi-school bulk command also records `institution_ids`, which is matched on PostgreSQL so each school sees its own share rather than only the one recorded first | the list, the facets and the export all read the same queryset |
| Audit category vocabulary | `tenant_audit_query_service.py:CATEGORY_PREFIXES` / `CATEGORIES` / `CATEGORY_DEFINITIONS` + `categorize(action)` — 8 categories derived from the platform's own action vocabulary, published **per row** with a definition each. The browser used to derive this with a regex over the action string, so the label depended on the client build | `data.results[].category`, `data.categories`, `data.definitions`; `AuditPanel.CATEGORY_PRESENTATION` chooses only a label and a tone |
| Server facets | `TenantAuditQueryService.facets` — `event_count`, `actor_count`, `by_action` (top 25) and `by_category` over the **whole filtered set**, never one page. Category totals are computed over *every* distinct action, not the top 25, so they cannot disagree with `event_count` | `data.facets`; the panel renders them and counts nothing |
| Audit export | `?export=csv` — page-independent, `EXPORT_ROW_LIMIT` (read from `apps/documents/settlement_service.py`, so the platform has one export ceiling), requires the explicit `tenant.application.export` capability, and is audited as `audit.exported`: the export therefore appears in the feed it exported. `changes` is serialised as JSON text so the cell parses | `tenantAudit.ts:exportPath` (drops the paging) → `settlementAdminService.downloadExport`; `data.can_export` gates the control |
| `audit.exported` | `apps/catalog/tenant_audit_service.py:ACTION_AUDIT_EXPORTED` via `record_export` — actor, institution scope, filters, row count against the ceiling; **never** the exported events. `security` retention | the feed itself; `backend/tests/unit/test_tenant_audit_amendment_scope_9_5.py` |
| Amendment recipient authority | `backend/apps/catalog/tenant_recipients.py:TenantStaffRecipientService.recipients_for_institution` — candidates come from active memberships + active non-expired grants for the application's **own** institution, and each candidate's authority is confirmed through `AdminCapabilityService.get_institution_capabilities`. Super_Admins are excluded by design (platform authority would restore the broadcast); a resolution failure yields an **empty** set, never a wider one; bounded by `RECIPIENT_LIMIT = 50` and reports its own truncation | `apps/applications/amendment_service.py:_notify_admins_of_amendment` |
| Amendment recipient capability | `amendment_service.py:AMENDMENT_RECIPIENT_CAPABILITY = "tenant.application.review"` — the capability the amendment **review** command itself requires (`review_workspace_service.COMMAND_CAPABILITIES["review_amendment"]`), so the platform notifies exactly the people who can act. Drift guard asserts the two agree | `_notify_admins_of_amendment`; `data.capability` on the audit event |
| Amendment fan-out durability | `apps/common/outbox.py:create_notifications_bulk` with a per-recipient idempotency key `amendment:{id}:recipient:{user}` — one `Notification` + one committed `OutboxEvent` each, so a replay converges instead of doubling | `amendment_service._notify_admins_of_amendment` |
| `amendment.requested` | `tenant_audit_service.py:ACTION_AMENDMENT_REQUESTED` + the `application.amendment_requested` outbox row (`amendment_service.AMENDMENT_REQUESTED_EVENT`, idempotency key `amendment:{id}:requested`) — the capability required, the recipient **ids**, the count, and when the count is **zero** the reason (`no_institution` / `no_members` / `no_capability` / `resolution_failed`). A school with no authorized reviewer is a recorded, queryable gap rather than a silent drop or a wider fan-out. Never the amended value, never a recipient's address | the school's own audit feed; design §17's operational queues |
| Amendment review transitions | `amendment_service.py:AmendmentStateMachine` — `pending → approved`, `pending → rejected`; both terminal. `assert_transition` is evaluated against the amendment's status **re-read under the lock**, so a decision made from a stale view is refused (`AMENDMENT_ALREADY_REVIEWED`) instead of overwriting the first | `AmendmentService.review_amendment`; `ApplicationAmendmentReviewView` |
| Amendment review lock | `review_amendment` locks the amendment row **and** its application row with `select_for_update()` in one transaction, and commits the status write, the field change and the history row together | drift guard: `test_the_review_locks_both_rows` |
| Disclosure | an out-of-scope institution, an unknown institution and a malformed id are one indistinguishable **404** (byte-identical, `request_id` aside); in scope without `tenant.audit.read` is a non-revealing **403**; a masked probe emits `scope.denied` recording `audit.institution` without naming the target | `TenantAuditScopeDenied` → `AdminInstitutionAuditView._masked_not_found` |
| Drift guards | `backend/tests/unit/test_tenant_audit_amendment_scope_9_5.py` (57 cases, incl. "no role is compared on the audit surface", "the view holds no query logic", and the recipient-capability agreement), `scripts/authority_matrix_registry.py` entries for `/api/v1/admin/institutions/<uuid:institution_id>/audit/` and `/api/v1/applications/<uuid:application_id>/amendments/`, `apps/admissions/tests/unit/tenantAuditServerOwned.test.tsx` (21 cases), `apps/admissions/tests/harness-e2e/required/tenant-audit-amendment-scope.spec.ts` (6 journeys × 2 viewports) |
| Evidence | `docs/v2-evidence/9.5/` |

Invariants a reviewer can check: the audit panel's request names the selected
school in its **path** and the generic feed is never called; the counts on screen
are the server's for the whole filtered set and do not move when a page turns; the
export covers the filtered set regardless of the page, requires its own
capability, and appears in the feed it exported; another school's audit id is
indistinguishable from an unknown one; an amendment notifies the owning school's
reviewers and nobody else, with the decision recorded even when the count is zero;
and two reviewers deciding one amendment produce one decision.

### Notification preferences, delivery gate, and communications history (Admissions V2 task 10.1, R13.3/R13.4/R13.8)

**The platform had three disagreeing answers to "what can a student control?", and
nothing read any of them.** `user_notification_preferences` holds nine columns; the
endpoint accepted and stored all nine; the browser declared two more the backend
never had (`whatsapp_enabled`, `in_app_enabled`), asked for quiet hours and a
timezone no delivery path reads, and then rendered three read-only tiles saying
"Always on", "Always on" and "Coming soon". `CommunicationService.send` dispatched
on the template's own `channel` column and **never consulted a preference**, so the
settings screen could only ever be decorative (**STU-14**).

**The rule now enforced: the published schema is derived from what the platform can
actually send.** A channel is offered only when a delivery implementation exists,
and is *configurable* only when turning it off is a real outcome. A category is
offered only when a real producer sends it, and is configurable only when it is
optional. Every other field name — **including one the database has a column for**
— is rejected with a stable per-field code and a stated reason, never silently
stored.

**No schema change.** `Notification.metadata` is an existing jsonb column and it
carries the delivery record; no table, column, index, capability or role was added.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Notification-preference schema | `backend/apps/common/notification_preferences.py` — `SCHEMA_VERSION`, `Channel` / `CHANNELS` (`in_app` mandatory, `email` configurable), `Category` / `CATEGORIES` (`application_updates` mandatory, `payment_reminders` + `interview_reminders` optional), and `WRITABLE_FIELDS` **derived** from `configurable` rather than listed | `GET/PUT /api/v1/notifications/preferences/`; `apps/admissions/src/lib/notificationPreferences.ts` reads the response and hardcodes no field list |
| Message audience → channel set | `notification_preferences.py:AUDIENCE_CHANNELS` — `student → (in_app, email)`, `staff → (in_app,)`, with `AUDIENCE_CHANNEL_REASONS` stating why. Checked **before** any preference, so a preference can only narrow a message class's channels, never widen them. `Category.audience` makes it a property of the message class, not of the call site. This is the question task 9.5 deferred here | `resolve_delivery`, `ResolvedPreferences.allows`, `staff_delivery_metadata`; `data.results[].audience` on the inbox |
| Staff message class | `notification_preferences.py:CATEGORY_STAFF_ACTION_REQUIRED` (`staff_action_required`, mandatory, audience `staff`) — in `ALL_CATEGORIES` and `CATEGORIES_BY_KEY` so the history can name it, and deliberately **not** in `CATEGORIES`, so it never appears as a switch: the platform publishes no staff settings and must not render a control it cannot honour | `apps/applications/amendment_service.py:_notify_admins_of_amendment` via `staff_delivery_metadata` |
| Refused preference fields | `notification_preferences.py:UNSUPPORTED_FIELD_TABLE` — `sms_enabled` / `whatsapp_enabled` (`CHANNEL_NOT_IMPLEMENTED`), `in_app_enabled` (`CHANNEL_MANDATORY`), `marketing_emails` (`CATEGORY_NOT_IMPLEMENTED`), `application_updates` (`CATEGORY_MANDATORY`), `quiet_hours_start` / `quiet_hours_end` / `timezone` (`FIELD_NOT_IMPLEMENTED`). Published on the **read** so a client can explain a refusal without inventing copy | `PUT` 400 `UNSUPPORTED_PREFERENCE` with `details.rejected[]`; `data.unsupported_fields` |
| The one delivery gate | `notification_preferences.py:resolve_delivery` — the single answer to *"will this message reach this person, on which channel, and why"*. A mandatory category ignores every stored setting; an optional one needs its own toggle **and** the channel's | `deliver_message`; `CommunicationService.send`; `apps/applications/tasks/interview.py` |
| The one delivery path | `notification_preferences.py:deliver_message` — always writes the in-app notification, queues the email only when the gate allows it, and records the decision (including the suppression reason) on `Notification.metadata['communication']`. Both writes go through `apps/common/outbox.py`, so each commits an `OutboxEvent` and the email dispatches **on commit**, never fire-and-forget | every template message; `staff_delivery_metadata` is the bulk-fan-out equivalent for staff |
| Template → category | `notification_preferences.py:TEMPLATE_CATEGORIES` (total over the seeded catalogue) + `DIRECT_PRODUCER_CATEGORIES` for producers that bypass a template. An **unmapped** key resolves to the mandatory category, so a new template is delivered rather than silently suppressed by a preference nobody mapped it to | `category_for_template`; `CommunicationService.send` |
| Delivery-state vocabulary | `backend/apps/common/communication_history.py:DELIVERY_STATES` + `STATE_DEFINITIONS` — `delivered`, `sent`, `queued`, `retrying`, `failed`, `suppressed`, `not_applicable`, `unknown`. Published **once**, on `GET /api/v1/notifications/preferences/`, because the inbox's `{page, pageSize, totalCount, results}` envelope is registered and a constant does not belong on every page | `data.delivery_states` / `data.delivery_state_definitions` / `data.retry_limit`; `notificationPreferences.ts:DELIVERY_STATE_TONES` maps them to a tone only |
| Why a channel carried nothing | `notification_preferences.py:CHANNEL_UNUSED_REASONS` (`suppressed_by_preference`, `no_recipient`, `not_in_audience_channels`) → `communication_history._UNUSED_REASON_STATES`. The two preference reasons read **suppressed** (the reader can reverse it); the audience reason reads **not_applicable** (a fact about the message). `UNCLASSIFIED_UNUSED_REASONS` must be empty, so a new reason cannot fall through to a benign-looking state | `data.results[].channels[].state` |
| Per-message delivery projection | `communication_history.py:project_delivery` — one extra query for a whole page, never one per row. Publishes `category`, `kind`, `audience`, per-channel `{state, attempts, last_attempt_at, can_retry}` and **no** `recipient_email`, no `EmailQueue.error_message`, no SMTP response (R13.4). A pre-10.1 message reads `unknown` rather than being reported healthy | `GET /api/v1/notifications/` (`NotificationItemSerializer`); `Communications.tsx` |
| Retry command | `POST /api/v1/notifications/{id}/retry/` (`notification_views.py:CommunicationRetryView` → `communication_history.retry_email_delivery`) — owner-scoped (another user's id and an unknown id are the same 404), state-guarded (only a terminal `failed` attempt; otherwise `RETRY_NOT_APPLICABLE` / `RETRY_UNTRACKED`), bounded by `COMMUNICATION_RETRY_LIMIT = 3` (`RETRY_LIMIT_REACHED`), **durable** through `queue_email`'s outbox row so a broker outage still leaves work `process_pending_emails_task` sweeps, and audited as `communication.retried` | `communication_history.ACTION_COMMUNICATION_RETRIED` |
| Frontend mirror | `apps/admissions/src/lib/notificationPreferences.ts` mirrors **only** `PREFERENCE_SCHEMA_VERSION`, `UNSUPPORTED_PREFERENCE` and `PREFERENCE_REJECTION_CODES` (it must explain a 400 without inventing copy). Channels, categories, definitions, writable fields and state meanings are read from the response | drift guard below |
| The one schema read | `apps/admissions/src/hooks/useNotificationPreferenceSchema.ts` — one query key shared by the preferences screen and the inbox, so the delivery-state vocabulary costs no second round trip and cannot be read from two caches. **Not** `useNotificationPreferences.ts`: that path is retired by the archived `duplicate-deprecated-consolidation` spec (a deleted duplicate) and is still pinned absent by `tests/property/consolidation-dead-files.test.ts` / `consolidation-imports.test.ts` / `consolidation-eslint.test.ts` | `pages/student/NotificationSettings.tsx`, `pages/student/Communications.tsx` |
| Student surfaces | preferences = `pages/student/NotificationSettings.tsx` (renders the published schema; a `configurable` row is a switch, a mandatory row is a **stated fact** with the server's definition and no toggle, a refused field is named in "what this platform does not do" and rendered as no control). Inbox/history = `pages/student/Communications.tsx` + `components/student/communications/MessageDeliveryState.tsx` (per-channel state, the `not_applicable` vs `unknown` distinction each keyed on its own state, and the retry offered only on the server's `can_retry`) | R13.8's merge: `/student/notifications` holds no second inbox |
| Inbox navigation | `components/navigation/AppLayout.tsx:studentNavItems` — the one nav source for the desktop sidebar, the mobile drawer, **and** the mobile bottom bar it feeds through `components/ui/BottomNavigation.tsx`, with `student.communications` in registry order 25 and notification settings as a separate, differently-labelled entry. Identical on desktop and mobile — the sidebar previously offered only the preferences screen, labelled "Notifications". (Task 12.4 removed the second row that used to head this cell, `components/navigation/MobileBottomNav.tsx`: it had zero importers, so the "primary mobile tab" it defined was never rendered and this map was naming an unreachable surface as a source of truth.) | `routeRegistry.ts` `studentCommunications` / `studentNotifications` |
| Drift guards | `backend/tests/unit/test_notification_preferences_10_1.py` (92 cases) — incl. `TestTheFrontendMirrorCannotDrift` (the mirror pins the backend's version and rejection codes **in order**, has a tone for every published state, and **names no channel or category**; it strips TS comments first, because the module documents the retired field names on purpose), `TestAudienceDecidesTheChannelSet`, `TestEveryProducerGoesThroughTheGate`, and `TestOneAuthority`. Frontend: `apps/admissions/tests/unit/notificationPreferenceSchema.test.ts` (23), `notificationSettingsControls.test.tsx` (16), `messageDeliveryState.test.tsx` (11). Browser: `tests/harness-e2e/required/communications-preferences.spec.ts` (5 journeys × desktop and mobile) |
| Evidence | `docs/v2-evidence/10.1/` |

Invariants a reviewer can check: a `PUT` naming `whatsapp_enabled`, `sms_enabled`,
`in_app_enabled`, `marketing_emails`, `application_updates`, quiet hours or a
timezone is refused with its own code and **stores nothing**; a mandatory message
is delivered whatever the stored row says, on every channel its audience allows; an
optional message that is switched off is recorded as `suppressed` rather than
vanishing; a staff work item is inbox-only and says `not_applicable` on email
rather than `unknown`; the inbox never publishes an address or provider text; a
retry writes a new outbox row instead of calling a provider inline; and the
notification list still returns exactly `{page, pageSize, totalCount, results}`.

### Offer conditions: evidence, review, and amendment history (Admissions V2 task 10.2, R13.9/R13.10)

**A conditionally approved student was told what they owed and given nowhere to put
it.** The conditions read published `{id, description, condition_type, deadline,
status, met_at}`, and the only condition command was the staff two-outcome
`verify` (`met` / `waived`). So there was no evidence upload, no comment, no
replacement, no rejection reason, and no reminder — the first thing the platform
ever said about a condition deadline was `condition_expiry_task` reporting that it
had **passed**, which auto-rejects the application (**STU-16**). Separately, a
student could submit an amendment and then had no way to see whether it had been
approved, rejected or was still waiting, and nothing stopped a second pending
request for the **same field** — two answers to one question, where whichever a
reviewer approved last silently overwrote the other (**STU-17**).

**No schema change.** Condition evidence is an `ApplicationDocument` version under
`document_type = 'condition_evidence:{condition_id}'` (`varchar(100)`; the prefix
plus a UUID is 53 characters), so task 7.3's pipeline and the database's own
`uq_application_documents_one_current` partial unique index give **one current
evidence version per condition** with immutable superseded versions. The history is
the append-only `document_verification_events.details` jsonb that table already
carries. The two new lifecycle states are values in the existing
`application_conditions.status` `varchar(20)` column, which has no CHECK — the same
shape task 4.4 used to add `rejected` to the domain machine.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Condition state machine | `backend/apps/applications/condition_evidence_service.py:ConditionStateMachine` — design §11.2 spelled with the **stored** values: `pending` (design `open`) → `evidence_submitted` → `met` (design `verified`), `evidence_submitted` → `changes_required` → `evidence_submitted`, and `pending`/`evidence_submitted`/`changes_required` → `waived`. `met`/`waived`/`expired` are terminal. `expired` is **not** a review outcome — it is the deadline sweep's verdict | `submit_evidence`, `review_condition`, `ConditionManager.verify_condition` (the legacy two-outcome front door now consults the same table), `condition_expiry_task` |
| State definitions | `condition_evidence_service.py:CONDITION_STATE_DEFINITIONS` — per state: the design name, **who it is waiting on** (`student` / `school` / `nobody`), and the sentence the student reads. Published per condition and as `condition_vocabulary()` | `GET /applications/{id}/conditions/` and `.../{cid}/`; `components/student/applicationStatus/ConditionsTimeline.tsx` renders the server's copy and invents none |
| Which states a deadline may expire | `condition_evidence_service.py:CONDITION_STUDENT_OWED_STATES` = `{pending, changes_required}`. `evidence_submitted` is deliberately excluded: the student did their part and the school owes a review, so expiring it would auto-reject an applicant for the platform's own queue | `apps/applications/tasks/condition_expiry.py`, `conditions_due_for_reminder` |
| Evidence identity | `condition_evidence_service.py:evidence_document_type(condition_id)` → `condition_evidence:{uuid}`. The per-condition type is what makes the one-current index mean *per condition* | `submit_evidence`; `_evidence_rows`; `current_evidence_document` |
| Evidence write | `condition_evidence_service.py:submit_evidence` — task **7.3's** command unchanged (hash → replay short-circuit → **commit** a stage row → write the object → **verify** the object → **commit** metadata → compensate on failure), with the student's comment appended to the version's own history row. Owner-only: staff evidence would make the version's provenance untrue | `POST /api/v1/applications/{id}/conditions/{cid}/evidence/` |
| Review command | `condition_evidence_service.py:review_condition` — **three** outcomes (`met`, `changes_required`, `waived`); `changes_required` and `waived` require a reason of ≥ `MIN_REASON_CHARS` (10) which is stored on `application_conditions.notes` and published as `review_reason`. One lock, transition asserted against the row as re-read **under** it | `POST /api/v1/applications/{id}/conditions/{cid}/review/` (`tenant.application.review`, scope before lookup) |
| Condition audit actions | `condition_evidence_service.py:ACTION_CONDITION_EVIDENCE_SUBMITTED` (`condition.evidence_submitted`) + `ACTION_CONDITION_REVIEWED` (`condition.reviewed`), via `TenantAuditService.record_event`. Distinct from 9.4's `condition.verification_decided`, which the two-outcome `verify` route still emits. Records the reason and whether a comment was left — never the comment itself, and never an applicant field | the school's own tenant audit feed (9.5) |
| Condition messages | student outcome → `deliver_message` with the **mandatory** `application_updates` category (a condition outcome can cost a place); staff "evidence is waiting" → 9.5's `TenantStaffRecipientService` + `create_notifications_bulk` with 10.1's `staff_delivery_metadata`, i.e. inbox-only with a stated reason | `notify_student_of_condition_review`, `notify_staff_of_condition_evidence` |
| Condition reminders | `condition_evidence_service.py:CONDITION_REMINDER_WINDOWS = (7, 3, 1)` days, `reminder_window_for`, `conditions_due_for_reminder`, `send_condition_reminder`; the beat entry is `condition-reminder` (daily 06:30 UTC) → `apps/applications/tasks/condition_reminder.py`. Idempotent per `(condition, window)` through `Notification.idempotency_key`, so no column remembers what was sent. Classified by `DIRECT_PRODUCER_CATEGORIES['condition_reminder']` → `application_updates` (**mandatory** — unlike the interview reminder, a missed condition deadline auto-rejects) | `CELERY_BEAT_SCHEDULE`; the delivery gate |
| Amendment same-field uniqueness | `backend/apps/applications/amendment_service.py:request_amendment` — a second **pending** request for a field that already has one is `AMENDMENT_ALREADY_PENDING` (409) naming `details.pending_amendment_id`. `MAX_PENDING_AMENDMENTS` stays **3**, application-wide. Enforced under the `select_for_update` lock on the application row that every creator of a pending row already takes, so no index is required | `POST /api/v1/applications/{id}/amendments/` |
| Amendment history read | `amendment_service.py:amendment_history_payload` + `AMENDMENT_STATUS_DEFINITIONS` — owner-scoped; the status travels with its definition and `is_terminal`. The **reviewer's identity is not published** (that is the school's record, and it is in the audit feed). Detail adds `old_value` and the request reason | `GET /api/v1/applications/{id}/amendments/` (registered `{page, pageSize, totalCount, results}` envelope) and `.../{aid}/`; `components/student/applicationStatus/AmendmentHistory.tsx` |
| Frontend contract | `apps/admissions/src/services/applications.ts` — `StudentCondition` / `StudentAmendment` types plus `getCondition`, `submitConditionEvidence`, `listAmendments`, `getAmendment`. The types describe the **shape**; every state name, definition and permitted action arrives on the response | `pages/student/ApplicationStatus.tsx` |
| Drift guards | `backend/tests/unit/test_condition_evidence_amendment_history_10_2.py` (61 cases — the design lifecycle, the one-current invariant per condition, the rejection/replacement journey, reason-required outcomes, owner-only writes and masked cross-tenant ids, the registered amendment envelope, same-field uniqueness under the lock, the delivery gate and audience, reminder idempotence, **no role string compared** (AST-parsed), the views hold no lifecycle logic, and **no 10.2 SQL script exists**). Frontend: `apps/admissions/tests/unit/conditionEvidenceAmendmentHistory.test.tsx` (23). Browser: `tests/harness-e2e/required/condition-evidence-amendment-history.spec.ts` (4 journeys × desktop and mobile) |
| Evidence | `docs/v2-evidence/10.2/` |

Invariants a reviewer can check: a condition carries exactly one current evidence
version and every replaced version survives; `changes_required` cannot be issued
without a reason, and the reason the student reads is the reason the reviewer gave;
a terminal condition accepts no further command from either side; a second pending
amendment for one field is a 409 that names the request in flight, while a
different field is unaffected and a *reviewed* field is requestable again; the
amendment list uses the registered pagination envelope and names no reviewer; and
every condition message is delivered through the one gate with a published
category — student outcomes may use email, staff work items are inbox-only.

### Enrollment readiness and confirmation (Admissions V2 task 10.3, R13.2/R13.9/R17.1)

**There was no readiness contract, so there were three different answers.** The
enrollment deadline was absent from both application serializers while
`ApplicationListItem` was already reading `enrollment_confirmation_deadline` off
the list row — permanently `undefined`, so the enrollment card could not render at
all. The only surviving rule was a client-side `status === 'approved'` test, which
is **narrower** than the backend's: `confirm_enrollment` has always accepted
`conditionally_approved` once its conditions were resolved, so a student who had
satisfied every condition was shown nothing to do. And the condition and deadline
checks ran **before** `transaction.atomic()` opened, so a condition rejected — or a
deadline shortened — in between was invisible to the commit (**STU-15**). Capacity
and existing enrollment, both named by design §11.2, had no implementation at all
(**DATA-03**).

**No schema change.** Every gate reads columns and tables that already exist
(`applications.enrollment_confirmation_deadline`, `application_conditions.status`,
`program_intakes`, and the canonical assignment IDs from task 5.2).

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Enrollment readiness | `backend/apps/applications/enrollment_service.py:evaluate_enrollment_readiness` → `EnrollmentReadiness` — the **one** evaluation of status, every mandatory condition, the deadline plus countdown, capacity, and existing enrollment. Four states: `confirmable` / `blocked` / `confirmed` / `not_applicable`. Same shape task 6.5 established for *submission* readiness; there is **no** second submission evaluator and the blocker payload is 6.5's `ReadinessBlocker` | `ApplicationSerializer` + `ApplicationListSerializer` (`enrollment`), and `EnrollmentService.confirm_enrollment`'s in-lock recheck — the read and the command cannot disagree |
| Enrollable statuses | `enrollment_service.py:ENROLLABLE_STATUSES` = `("approved", "conditionally_approved")`. A conditional offer is confirmable **only** once every condition is resolved | the evaluator; `components/student/applicationStatus/NextActionCards.tsx` gates on the server's `state`, never on a status string |
| Enrollment blocker codes | `enrollment_service.py` — `INVALID_STATUS_FOR_ENROLLMENT`, `CONDITIONS_NOT_MET`, `DEADLINE_PASSED` (all pre-10.3, unchanged, 400) + `PROGRAM_CAPACITY_REACHED`, `DUPLICATE_ENROLLMENT` (conflicts with committed state, **409**), `ALREADY_ENROLLED` (readiness only — the command is idempotent). Blocker order **is** the refusal precedence, declared once and applied by `_raise_for` | `POST /api/v1/applications/{id}/confirm-enrollment/`; `apps/admissions/src/lib/enrollmentReadiness.ts` |
| What "resolved condition" means | task 10.2's `condition_evidence_service.py:CONDITION_TERMINAL_STATES`, read by `enrollment_service.py:condition_tally`. **Not** a second list of status strings: the pre-10.3 gate asked only about `pending` and `expired`, so 10.2's `evidence_submitted` and `changes_required` were invisible and counted as satisfied | the evaluator; the readiness payload's `conditions` section |
| Enrollment state definitions | `enrollment_service.py:ENROLLMENT_STATE_DEFINITIONS` — the sentence the student reads for each state, published as `definition`. A definition travels with every label (9.1/9.4/10.2's rule) | `NextActionCards.tsx` renders the server's copy and authors none |
| Confirmation transaction | `EnrollmentService.confirm_enrollment` — task 5.3's fixed lock order (**`ProgramIntake` capacity row first, then the application row**), then the *same* evaluator re-run on the locked rows, then one legal transition. Idempotent: an already-`enrolled` application returns unchanged, so a retried request after a dropped response is safe with or without an `Idempotency-Key` (design §11.2 "commits idempotently") | `ApplicationConfirmEnrollmentView` (owner-only, masked 404) |
| Capacity predicate | `enrollment_service.py:_capacity_for` / `readiness_service.evaluate_capacity` over task 5.3's `CapacityService` — *"is there room for me"*, never *"is the intake full including me"*: an application already in `SEAT_STATUSES` subtracts its own seat, a conditional offer (which `SEAT_STATUSES` does not include) is compared against the whole cohort. The confirmation neither claims nor releases a counted seat — whether `enrolled` occupies one remains task 5.3's deferred question | the evaluator; the readiness payload's `capacity` section |
| Existing enrollment | `enrollment_service.py:_existing_enrollment` — keyed on the canonical `(program_offering_id, intake_ref_id)` identity (task 5.3, DATA-02), so a same-name offering at another tenant is a different cohort and never a duplicate | the readiness payload's `existing_enrollment` section |
| List query cost | `enrollment_service.py:enrollment_readiness_map` — conditions in one query for the page, capacity rows one per **distinct** Intake_Offering, live seat counts in one grouped aggregate, enrolled-elsewhere rows in one query. Constant in the number of rows (R17.5) | `ApplicationEnrollmentReadinessMixin` (one cache per serializer instance, `many=True` and single object on the same path) |
| Frontend contract | `apps/admissions/src/types/database.ts` — `EnrollmentReadiness` / `EnrollmentBlocker` / `EnrollmentAllowedAction` on `Application.enrollment`, re-exported from `services/applications.ts`. `src/lib/enrollmentReadiness.ts` adds **no** vocabulary: `enrollmentReadinessOf` (absent ⇒ `null`, i.e. *unknown*, never "nothing to do"), `canConfirmEnrollment` (exactly the server's `can_confirm`), `formatEnrollmentCountdown` (phrases the server's `seconds_remaining`, never re-derived from the deadline against the browser clock), `enrollmentMessage` (the server's first blocker, else the state definition) | `components/student/ApplicationListItem.tsx`, `components/student/applicationStatus/NextActionCards.tsx`, `pages/student/ApplicationStatus.tsx` |
| Drift guards | `backend/tests/unit/test_enrollment_readiness_10_3.py` (50 cases — the contract, every non-terminal condition state blocking, the deadline including an in-lock shortening, success for both offer shapes, idempotence, capacity, cross-tenant non-duplication, the read contracts and their query budget, the owner-only mask, **no role string compared** (AST-parsed), the evaluator called **inside** the transaction (AST-parsed), the capacity-row-before-application lock order, **no second submission evaluator**, **no second condition vocabulary** (AST-parsed, docstring-aware), and **no 10.3 SQL script exists**), including two Postgres-only concurrency tests. Frontend: `apps/admissions/tests/unit/enrollmentReadiness.test.tsx` (22) + `tests/property/enrollmentReadiness.property.test.ts` (5 fast-check invariants). Browser: `tests/harness-e2e/required/enrollment-readiness-confirmation.spec.ts` (4 journeys × desktop and mobile) |
| Evidence | `docs/v2-evidence/10.3/` |

Invariants a reviewer can check: the deadline and the readiness are on **both**
the list row and the detail read, and neither is accepted from a request body; a
conditional offer is confirmable exactly when every condition is terminal, and
`evidence_submitted` / `changes_required` block it; a condition rejected or a
deadline shortened between the pre-check and the lock is observed, because the
evaluation is re-run inside the transaction; N simultaneous confirmations produce
one status-history row and N successes; a repeated confirmation is a success and
not an error; an out-of-scope or non-owned application id is one indistinguishable
404; and the browser never decides confirmability — it renders `can_confirm`,
`definition`, the server's countdown and the server's `allowed_actions`.

### Official-document durability and the read-existing policy (Admissions V2 task 10.4, R13.2/R13.5/R13.11/R17.1/R17.4)

**"Queued" did not mean anything.** `_enqueue_generation` swallowed every dispatch
failure and the POST answered `202 queued` regardless, so with the broker down the
platform told a student *queued* while **no record anywhere** said the work was
wanted: nobody would render it, no sweep could find it, and the client polled a
status that could never change. The GET path had the same defect from the other
side — a permitted document that had never been requested *also* read `queued`
(**STU-18**, design §17: *"'Queued' means a committed durable record exists"*).

**One gate answered two different questions.** The per-type status/payment gate
decided both *may a new artifact be created* and *may an artifact already issued be
read*, so a terminal application lost access to its own slip and offer letter —
`enrolled` included, which is the successful outcome (design §11.3).

**And only the slip could be emailed at all.** `EmailSlipView` was a parallel
official-document email: it authorized inline, built an inline HTML field table,
called `queue_email` directly (so the message appeared in no communications
history), and sent to any address in the request body (**API-04**).

**No schema change.** The durable job is a row in the existing `outbox_events`
table — the mechanism design §3 already names for committed job work, and whose
columns already are a job's (`status`, `retry_count`, `error_message`,
`processed_at`, a unique `idempotency_key`). No table, column, or index ships.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Official-document generation job | `backend/apps/applications/official_document_jobs.py` — identity `official_document:{application_id}:{document_type}` in `outbox_events.idempotency_key`, channel `document`, one live job per type. States `pending` / `dispatched` / `succeeded` / `failed`; `JOB_OPEN_STATES` is the **only** thing publishable as `queued`. `request_generation` commits **then** dispatches on `transaction.on_commit`, and raises `GenerationUnavailable` when the record cannot be committed | `OfficialDocumentDetailView` (POST commits before 202, GET derives status), `OfficialDocumentListView`, `tasks/pdf_generation.py` (settles every exit path), `tasks/official_document_sweep.py` |
| Published generation status | `official_document_views.py:GENERATION_STATUSES` = `ready` / `queued` / `failed` / `setup_required` / `not_requested`. `not_requested` is new and load-bearing: *nothing was recorded*, so there is nothing to poll | `apps/admissions/src/services/officialDocuments.ts:OfficialDocumentGenerationStatus`; `useOfficialDocument.deriveOfficialDocumentUiState` maps it to `idle`, **never** `queued` |
| Where a generation status is derived | `official_document_views.py:_generation_status` — one function, one precedence: current artifact → open job → terminal failure → previously-issued artifact under the read-existing policy → `not_requested`. The failure step sits **above** the historical step, so a failed refresh is reported rather than silently serving an older file | the detail read, the list read, and the email route |
| Issuance eligibility | `official_document_views.py:_student_gate_open` — byte-for-byte the pre-10.4 gate (slip ⇒ a non-draft submitted status; acceptance letter ⇒ `approved`; conditional offer ⇒ `conditionally_approved`; receipt ⇒ a settled payment; finance receipt ⇒ staff only). Answers **only** "may a new artifact be created from today's state?" | POST (`for_issue=True`); frontend mirror `apps/admissions/src/lib/officialDocumentGate.ts:isOfficialDocumentOffered`, drift-guarded by `apps/admissions/tests/property/officialDocumentGating.property.test.ts` |
| Read-existing eligibility | `official_document_views.py:_may_read_issued` — a **separate** function, deliberately narrow: a stored, platform-issued (`system_generated`, non-deleted) artifact of that type exists. Retention is the deletion state, which `_current_official_version` already honours. Never conjures a document and never widens which types exist | GET and the email route (`for_issue=False`); the envelope's `historical: true` |
| Student read precedence (SJR task 3.19, R5-e) | `official_document_views.py:_generation_status` — for a **student** (`not is_staff`) a stored, platform-issued artifact is returned `ready` with `historical: true` **before** the open-job and failure steps, so a status change (which retires the slip fingerprint) never hides the slip the student holds. Staff keep the original order (open job, then failure, then the issued copy when issuance is refused), so an operator is still told a refresh failed. Counter `official_document.student_served_historical` | the detail, list and email reads |
| Frontend read-existing surface | `apps/admissions/src/hooks/useIssuedOfficialDocuments.ts` — asks `GET …/official-documents/` which types are `ready`, because whether an artifact exists is a fact about stored rows and not a function of status. `DocumentButtons` offers an action when **issuance permits it OR the server reports an artifact**; a failed list read is quiet (the issuance-gated actions are unaffected) | `components/student/DocumentButtons.tsx`, `components/student/ApplicationSlipActions.tsx` (`historical` ⇒ "Issued copy on record"). SJR task 3.17/3.20 (R5-a, R5-f): every student control is **"Prepare"** (makes the document: `useOfficialDocument().prepare()`) until the platform has issued it, then an **"Open"** anchor to `/student/documents/open` (`openHref`); nothing is opened in code after an await, and the summary says "ready" only for an issued type. The retired labels are "Download Slip" and "Download Receipt" |
| Terminal failure and retry | `official_document_jobs.py` — `RENDER_FAILED`, `APPLICATION_NOT_FOUND`, `STATUS_NOT_ELIGIBLE`, `PAYMENT_NOT_FOUND`, plus `SETUP_REQUIRED_CODES` (shared with `official_document_views._SETUP_REQUIRED_FAILURE_CODES`, not restated). `OfficialDocumentJob.can_retry(is_staff=…)`: a student may retry a render failure, a **tenant setup** failure is not theirs to retry. Retry is the same POST — `request_generation` reopens a `failed` job with its attempt history intact, so there is no second command and no second authority | the envelope's `job.can_retry`; `useOfficialDocument.canRetry`; `OfficialDocumentRecovery` |
| Broker-outage recovery | `official_document_jobs.py:sweep_pending_jobs` (bounded by `JOB_SWEEP_LIMIT`, re-opening a `dispatched` job stale by `JOB_REDISPATCH_AFTER_SECONDS`), run by `tasks/official_document_sweep.py:sweep_pending_official_document_jobs_task` on the beat schedule every 300 s with a cache-key lock — task 4.4's domain-verification shape | design §11.3's *"broker outage after commit is recovered by the dispatcher"* |
| Canonical official-document email | `POST /api/v1/applications/{id}/official-documents/{document_type}/email/` → `OfficialDocumentEmailView`. One route for **every** type; reuses the read's authorize+gate, refuses `DOCUMENT_NOT_READY` (409) rather than emailing about nothing, sends only to the **owner's account address** (`RECIPIENT_NOT_PERMITTED`, 400, otherwise), delivers through task 10.1's `deliver_message` with `CATEGORY_APPLICATION_UPDATES` and an idempotency key per issued artifact, and renders `render_message("official_document", …)`. `/email-slip/` is a **deprecated proxy** onto it (`Deprecation: true` + successor `Link`), preserving the legacy `queued_id` shape | `apps/admissions/src/services/officialDocuments.ts:emailOfficialDocument`; `useOfficialDocument.email` |
| Official-document email body | `backend/apps/common/email/messages/official_document.py` — the eighth registered message type. Carries a **link to the student's own authenticated surface**, never the file and never a long-lived signed URL | `render_message` dispatcher (`available_message_types()` ⇒ 8) |
| Signing failure (SJR task 3.19, R5-d) | `official_document_views.py:_signed_download_url` logs `official_document.sign_failed` at **ERROR** (ids only) and returns a sentinel; `_build_envelope` keeps `status: "ready"` and adds `error_code: "DOCUMENT_LINK_UNAVAILABLE"`. Student copy: "This file can't be opened right now." with Retry (never "not ready") | `officialDocuments.ts` (`DOCUMENT_LINK_UNAVAILABLE`), `DocumentOpen.tsx` |
| Student failure copy vs staff failure copy | `useOfficialDocument.ts` — `OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE` (neutral: the office was notified) for `audience: 'student'`; `OFFICIAL_DOCUMENT_SETUP_REQUIRED_MESSAGE` (names the configuration) for `'staff'`. The pre-10.4 student error printed the tenant's setup checklist, which asks an applicant to do operator work and discloses the school's internal state (STU-18) | `components/student/documents/OfficialDocumentRecovery.tsx` (+ task 8.3's `resolveTenantSupportContact`, never a hardcoded address); `useAdminOfficialDocuments` keeps the staff copy |
| Staff setup alert | `tasks/pdf_generation.py:_alert_staff_of_setup_failure` + `SETUP_ALERT_CAPABILITY = "tenant.profile.read"` — recipients from task 9.5's `TenantStaffRecipientService` (active membership/grant holders at **this application's own** institution; Super_Admins deliberately excluded), fanned out with `create_notifications_bulk` + `staff_delivery_metadata`, idempotent per (document type, error code, recipient), and naming no applicant | the tenant staff inbox; `CATEGORY_STAFF_ACTION_REQUIRED` |
| Drift guards | `backend/tests/unit/test_official_document_durability_10_4.py` (67 cases — the commit-before-202 order and its 503, idempotence, broker-down recovery and the bounded sweep, `queued` only while a job is open, the list's one-query job read, terminal failure + retry-is-the-same-command, the setup-failure retry asymmetry, every renderer exit path settling its job, the read-existing policy across all five terminal statuses, cross-tenant masking on the historical read, the two policies being two functions, every type emailable, the one delivery gate, non-redirectability, the legacy proxy, the staff alert's scope/idempotence/absence-of-PII, **no second generation-status vocabulary** (AST), **no role string compared** (AST), **dispatch after commit** (AST), and **no 10.4 SQL script exists**). Frontend: `apps/admissions/tests/unit/officialDocumentDurability.test.tsx` (22). Browser: `tests/harness-e2e/required/official-document-durability.spec.ts` (4 journeys × desktop and mobile) |
| Evidence | `docs/v2-evidence/10.4/` |

Invariants a reviewer can check: a `202` is never answered unless a row committed,
and a commit failure is `503 GENERATION_UNAVAILABLE` rather than a queue; a
published `queued` always has a committed `outbox_events` row behind it and a
published `not_requested` never does; every exit path of the render task settles
its job, so no `pending` row is abandoned; a lawful issued artifact stays readable
**and offered** after the application is terminal, while a *new* artifact is still
the same masked 404; a tenant setup failure offers the student no retry and names
no configuration, and the school's own authorized staff get the work item instead;
an official document is emailable for every type, exactly once per issued artifact
per recipient, only to the owner's own address, and the send appears in the
student's communications history with a classified category.

### Public tracking credential, host binding, and published contract (Admissions V2 task 10.5, R2.3-R2.4/R13.12/R17.2/R17.7)

**A sequential counter was a credential.** The tracker's check was a *format* check,
and two of the shapes it accepted authorise nothing: `application_number`
(`{CODE}{YEAR}{SEQ5}`) is a per-tenant **sequential counter**, so one leaked slip
yields its neighbours by arithmetic; `public_tracking_code`
(`TRK-{CODE}{YEAR}{6 hex}`) has a stem derivable from the school and the year,
leaving 24 bits. Both are printed on every document — the credential and the
reference were the same string (**STU-22**; R13.12: *"Sequential application numbers
alone SHALL NOT authorize public disclosure"*).

**The client read fields the server never sent**, including a *"Message from
Admissions"* panel built from `admin_feedback` — which only failed to publish
reviewer notes on an unauthenticated page because the backend never sent them — and
**"Copy Link" copied `window.location.href`**, which for a result reached by typing
the code is `/track-application`: a URL that tracks nothing.

**Schema: yes** (unlike 10.1–10.4). Four additive nullable columns and one partial
unique index — `backend/scripts/2026_08_09_01_application_tracking_secret.sql` with
its `_rollback.sql` sibling. Legacy rows keep four NULLs; nothing is backfilled,
altered or dropped.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Public tracking credential | `backend/apps/applications/tracking_secret.py` — `TRK-{selector 8}-{verifier 20}` over `ALPHABET` (Crockford base32, no `I`/`L`/`O`/`U`). The selector is random, non-secret and **partial-unique indexed**; the verifier is 100 secret bits stored only as SHA-256 (`hash_verifier`) and compared with `hmac.compare_digest` (`matches`). One live secret per application: `issue` rotates, `revoke` retires, `resolve` returns `None` identically for malformed / unknown / revoked / wrong-verifier | `ApplicationTrackView`, `ApplicationTrackingLinkView`; frontend mirror `apps/admissions/src/pages/public/tracker/utils/trackerUtils.ts:TRACKING_SECRET_PATTERN` |
| Legacy identifiers (no longer credentials) | `tracking_secret.LEGACY_IDENTIFIER_PATTERN` — the pre-10.5 `ApplicationTrackView.TRACKING_CODE_PATTERN`, carried over unchanged and demoted to a **pure recogniser**: it decides what to *tell* the caller, never what to look up. `applications.application_number` and `applications.public_tracking_code` keep every display, search and template use | `ApplicationTrackView` (400 `TRACKING_SECRET_REQUIRED`, no query, not charged) |
| Where a tracking credential is issued | `POST /api/v1/applications/{id}/tracking-link/` → `backend/apps/applications/student_tracking_views.py`. Owner-only through `resolve_owned_application` (staff excluded on purpose — issuing would revoke the applicant's link); anything else is the same masked 404. The response is the **one** moment the plaintext exists, and it reports `replaced_previous` | `apps/admissions/src/services/publicTracking.ts:issueLink`; `components/student/TrackingLinkAction.tsx` |
| Public tracking refusal vocabulary | `ApplicationTrackView` — `VALIDATION_ERROR` / `INVALID_FORMAT` (both **unchanged** from pre-10.5), `TRACKING_SECRET_REQUIRED` (new, derived from the string alone), and one `NOT_FOUND` shared by unknown selector, revoked secret, wrong verifier **and tenant-host mismatch**. Messages are module constants so a refusal cannot start varying with the database | `apps/admissions/src/pages/public/tracker/hooks/useApplicationTracker.ts` |
| Tenant host binding for public tracking | `InstitutionContextService.resolve(_request_host(request))` — a resolved white-label host may reveal only its **own** tenant's application (byte-identical masked 404 otherwise); the neutral Beanola portal resolves by secret alone; an unknown / multi-match / non-active host fails closed to neutral (**TEN-10**, R2.3-R2.4, design §12) | `ApplicationTrackView.get` |
| Public tracking attempt budget | `backend/apps/common/throttling.py:PublicTrackingFailureThrottle` — scope `public_tracking_failure` (`10/hour`), gate `PUBLIC_TRACKING_RATE_LIMITS` (default **on**). Counts **failed lookups only**, keyed through `apps.common.request_utils.get_client_ip` (trusted-proxy, counted from the right — **not** DRF's `get_ident`, which reads the whole forwarded chain). `allow_request` never refuses: the budget bounds the **refusal**, so a spent budget answers 429 to the next failure but never withholds a status from a correct token. A refused attempt is not charged. The coarse `RateLimitMiddleware` 20/10m request budget on the same path is unchanged | `ApplicationTrackView._refuse` (`is_exhausted` → `Throttled`, else `record_failure`) |
| Published public tracking contract | `backend/apps/applications/serializers.py:ApplicationTrackingSerializer` — exactly `application_number`, `status`, `program_name`, `intake_name`, `institution`, `submitted_at`, `updated_at`. Names are the **client's** names; `program`/`intake`/`created_at` are gone, and `feedback_summary` / `admin_feedback` / `admin_feedback_date` / `public_tracking_code` are absent by design | `apps/admissions/src/services/publicTracking.ts:PublicTrackingStatus`; the tracker page components |
| Public tracking share URL | `IssuedTrackingSecret.share_path()` (`/track-application?code=<token>`) and the absolute URL built by the backend from the **request's own origin**, so a student on their school's host gets a link back to the only host that resolves it. Frontend equivalent `trackerUtils.buildTrackerShareUrl` — the token, never the address bar, never an application number | `ApplicationTrackingLinkView`; `pages/public/tracker/components/ShareModal.tsx` |
| Public tracking audit | `TenantAuditService.record_public_tracking_attempt` (action `application.tracking_attempted`, outcomes `disclosed` / `not_found` / `host_mismatch` / `secret_required` / `invalid_format` / `rate_limited`) and `record_tracking_link_issued` (`application.tracking_link_issued`). Neither records the token; IP/user-agent are SHA-256 redacted (R17.2) | operations review |
| Drift guards | `backend/tests/unit/test_public_tracking_secret_10_5.py` (61 cases — enumeration, the constant-time comparison, one refusal for four failures, the legacy identifier never reaching the database, host isolation and fail-closed-to-neutral, the failure budget incl. **a spent budget still answering a correct token** and **the identity not being caller-controlled**, the published field set, the share URL, rotation, owner-only issuing, the migration's additivity/nullability/partial-uniqueness/legacy-readability, **one secret pattern**, **no credential comparison in the view** and **no role string in the service** (AST)). Properties: `backend/tests/property/test_public_tracking_properties_10_5.py` (17 Hypothesis invariants) and `apps/admissions/tests/property/publicTrackingSecret.property.test.ts` (16 fast-check). Mirrors: `apps/admissions/tests/unit/publicTrackingSecret.test.tsx` reads `tracking_secret.py` for `SELECTOR_LENGTH` / `VERIFIER_LENGTH` / `ALPHABET` and asserts the declared `PublicTrackingStatus` field set. Browser: `tests/harness-e2e/required/public-tracking-secret.spec.ts` (5 journeys × desktop and mobile) |
| Evidence | `docs/v2-evidence/10.5/` |

Invariants a reviewer can check: an application number never opens public tracking
and never reaches the database; a well-formed secret that resolves nothing, a
revoked secret, a wrong verifier and another tenant's token on a school host all
return the **same** body; the plaintext secret exists only in the issue response
and only its SHA-256 is stored; a school host reveals only its own tenant's
application while the neutral portal resolves by secret; a spent failure budget
refuses the next *failure* and never the holder of a correct token, and no
forwarded header resets it; the tracker publishes exactly seven fields and no
applicant identifier; the share URL's only query parameter is the random token;
and a legacy application row with four NULL tracking columns stays fully readable.

## Permissions & Roles

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Role hierarchy | `backend/apps/accounts/permissions.py:ROLE_HIERARCHY` | `apps/admissions/src/types/roles.ts:ROLE_HIERARCHY` |
| Role helpers | `apps/admissions/src/types/roles.ts` (`hasRole`, `isAdmin`, `isSuperAdmin`, `isReviewer`, `isStudent`) | all component role checks |
| Legacy shim | `apps/admissions/src/lib/auth/roles.ts` (re-exports from `types/roles.ts`) | back-compat |
| Auth contract | `docs/adrs/ADR-014-auth-cookie-csrf-design.md` | reference |
| Drift guard | `apps/admissions/tests/unit/rolesBackendMirror.test.ts` |

## Enterprise Tenant Authority (Capabilities & Routes)

Spec: `.kiro/specs/enterprise-tenant-authority/`. Steering model:
`.kiro/steering/enterprise-tenancy.md`. **Beanola owns the Platform; MIHAS/KATC
are example tenants.** Authority is resolved through **capabilities**, never raw
role strings. The backend `AdminCapabilityService` is the **sole source of
truth** for the capability catalogue; the admissions frontend mirrors it by
consuming `GET /api/v1/admin/capabilities/` through `CapabilityContext` and
pinning the one hard-coded capability string it needs for navigation
(`tenantNav.ts:TENANT_PROFILE_READ = 'tenant.profile.read'`).

| Concept | Source of truth | Consumers / drift guard |
|---------|-----------------|--------------------------|
| Capability catalogue (17 `platform.*` + 17 `tenant.*`) | `backend/apps/catalog/services.py:AdminCapabilityService.PLATFORM_CAPABILITIES` / `TENANT_CAPABILITIES` | Frontend mirror: `apps/admissions/src/contexts/CapabilityContext.tsx` + `apps/admissions/src/services/admin/capabilities.ts` (consume strings opaquely); `apps/admissions/src/components/navigation/tenantNav.ts` pins `tenant.profile.read`. Drift guards: `backend/tests/property/test_capability_endpoint_shape.py` (Property 2 — endpoint exposes the catalogue), `apps/admissions/tests/property/capabilityDerivation.property.test.ts` (Property 21 — frontend derivation), `apps/admissions/tests/unit/tenantNav.test.ts` (pins `tenant.profile.read`). A new capability string must be added here **and** to the backend catalogue together. |
| `CapabilitySet` shape | `backend/apps/catalog/services.py:CapabilitySet` (`role`, `is_super_admin`, `all_access`, `platform_capabilities`, `institution_capabilities`) | Capability endpoint payload; frontend `AdminCapabilitySet` type in `capabilities.ts` |
| Domain status machine | `backend/apps/catalog/services.py:DomainStatusMachine` (9 edges over 7 statuses incl. `rejected`) | `verify_institution_domain_task`, `sweep_pending_domain_verifications_task` + `enqueue_domain_verification` (`backend/apps/catalog/tasks.py`), and the domain create/retry/approve/reject/activate/reactivate views (`backend/apps/catalog/admin_views.py`); frontend mirror `apps/admissions/src/services/admin/tenants.ts:TenantDomainStatus` + `pages/admin/tenants/domainStatus.ts`; drift via `backend/tests/property/test_domain_status_machine.py` (Property 11) and `backend/tests/unit/test_domain_lifecycle_endpoints.py` (task 4.4, R5.1). The `rejected` state + its two edges are admissions-v2 task 4.4; `pending_dns`/`failed` are design §6.3's `pending_verification`/`verification_failed`. |
| Fail-closed domain resolver | `backend/apps/catalog/services.py:InstitutionContextService.resolve` | `GET /api/v1/catalog/context/`; `backend/tests/property/test_domain_resolution_fail_closed.py` (Property 14) |

**The 17 `platform.*` capabilities** (Super_Admin only):
`platform.tenant.read_all`, `platform.tenant.create`, `platform.tenant.update`,
`platform.tenant.deactivate`, `platform.domain.manage`, `platform.asset.manage`,
`platform.template.manage`, `platform.document.manage`,
`platform.canonical_program.manage`, `platform.program_assignment.manage`,
`platform.intake.manage`, `platform.user.create_global`,
`platform.user.manage_all`, `platform.access_grant.manage`,
`platform.audit.read_all`, `platform.routing.simulate_all`,
`platform.settings.manage`.

**The 17 `tenant.*` capabilities** (per-institution, non-super-admin):
`tenant.profile.read`, `tenant.profile.request_change`, `tenant.application.read`,
`tenant.application.review`, `tenant.application.export`, `tenant.document.read`,
`tenant.document.verify`, `tenant.payment.read`, `tenant.payment.verify`,
`tenant.staff.read`, `tenant.staff.invite`, `tenant.staff.disable`,
`tenant.audit.read`, `tenant.program.read`, `tenant.program.request_change`,
`tenant.domain.read`, `tenant.domain.request_change`.

### Canonical routes (frontend)

| Route | Component | Authority |
|-------|-----------|-----------|
| `/admin/tenants` | `apps/admissions/src/pages/admin/Tenants.tsx` (capability switcher → `SuperAdminTenantConsole` / `TenantAdminSchoolConsole` / no-access) | Shared admin route; renders the correct console per capability. Not super-admin-flagged in the route config. |
| Super-admin tenant onboarding wizard | `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` | Super_Admin only (guarded by `RequireSuperAdmin`; backend re-enforces) |
| Tenant-admin school console | `apps/admissions/src/pages/admin/tenants/TenantAdminSchoolConsole.tsx` | Tenant_Admin (scoped to assigned institution(s)) |
| `/student/documents/open` | `apps/admissions/src/pages/student/DocumentOpen.tsx` (query grammar in `apps/admissions/src/lib/documentOpen.ts`: `doc=<uuid>`, `doc=legacy:<result_slip\|extra_kyc>:<application uuid>`, `app=<uuid>&type=<application_slip\|acceptance_letter\|conditional_offer\|payment_receipt>`) | `student` guard (session restore runs before any redirect). The one opener every student View/Open control links to; it signs at click time and only reads (SJR task 3.17, R5-a) |

### Canonical backend tenant API paths

Mounted at `/api/v1/admin/` (`backend/apps/catalog/admin_urls.py`):
`institutions/`, `institutions/<id>/`, `institutions/<id>/audit/`,
`institutions/<id>/domains/`, `institutions/<id>/domains/<id>/`,
`institutions/<id>/domains/<id>/activate/`,
`institutions/<id>/domains/<id>/retry/`,
`institutions/<id>/domains/<id>/approve/`,
`institutions/<id>/domains/<id>/reject/`,
`institutions/<id>/domains/<id>/reactivate/` (task 4.4 domain lifecycle
commands, all `platform.domain.manage`; invalid-for-status →
`DOMAIN_TRANSITION_REJECTED` 409), `institutions/<id>/assets/`
(+ `assets/upload/`, `assets/<id>/`), `institutions/<id>/templates/`
(+ `templates/<id>/`), `institutions/<id>/document-profiles/`
(+ `document-profiles/<id>/`, `document-profiles/<id>/clone/`),
`institutions/<id>/required-documents/` (+ `required-documents/<id>/`),
`memberships/` (+ `memberships/<id>/`), `access-grants/`
(+ `access-grants/<id>/`), `routing/simulate/`, `tenant-audit/`,
`program-intakes/`, `staff/invitations/`
(+ `staff/invitations/<id>/resend/`, `staff/invitations/<id>/revoke/`),
`staff/candidates/`. Capability + scope endpoints
(`backend/apps/accounts/admin_user_views.py`):
`GET /api/v1/admin/capabilities/`, extended `GET /api/v1/admin/scope/`, and
`GET /api/v1/admin/users/<id>/effective-capabilities/`
(`AdminUserEffectiveCapabilitiesView`) — the **read-only** Effective_Capabilities
of a *target* user for the user detail surface (R3.7; `platform.user.manage_all`;
out-of-scope target masked 404; fail-closed to zero authority). This replaces the
retired fake permission editor (AUTH-04): platform role, membership, and access
grants are the only authority mutations.

### ProgramIntake (Intake_Offering) create API (R8.1-R8.4)

`POST /api/v1/admin/program-intakes/`
(`backend/apps/catalog/admin_program_intake_views.py:AdminProgramIntakeCreateView`)
creates the `ProgramIntake` junction row (`program_intakes` table) linking a
tenant's `Program` offering to a global `Intake` — the **Intake_Offering**
concept named in `.kiro/steering/enterprise-tenancy.md` -> "Program Offering
Model". Gated by `HasPlatformCapability("platform.intake.manage")`, exactly
like the legacy `IntakeListCreateView`/`IntakeDetailView` write paths, because
intakes (and their offering links) are global/platform-managed. Request body:
`program_id` (UUID, must be an existing active `Program`), `intake_id` (UUID,
must be an existing active `Intake`). Errors: `PROGRAM_NOT_FOUND` /
`INTAKE_NOT_FOUND` (404), `ALREADY_LINKED` (409). The `(program_id, intake_id)`
pair is guarded by a DB unique (`program_intakes_program_id_intake_id_key`, plus
the idempotent `uq_program_intakes_program_intake` from Admissions V2 task 3.3);
the view keeps a check-then-insert as the friendly fast path and translates the
`IntegrityError` from a concurrent duplicate to `ALREADY_LINKED` (see the Catalog
integrity 409 codes table below). Emits a `tenant.program_intake.created`
Audit_Event via
`TenantAuditService`, scoped to the offering's institution. Tests:
`backend/tests/unit/test_admin_program_intake_create.py`.

### Atomic tenant staff invitation + membership handoff (R4.3-R4.4, R6.3)

The **only** canonical staff-invitation path
(`backend/apps/catalog/staff_invitation_service.py:StaffInvitationService`,
views in `staff_invitation_views.py`). Replaces the fragile client multi-call
invite (finding TEN-01) and raw-UUID staff entry (finding TEN-05):

- `POST /api/v1/admin/staff/invitations/` — atomically creates the identity
  (`profiles`), the invitation (`tenant_staff_invitations`), and the membership
  (`user_institution_memberships`) in one transaction; emails a single-use
  accept link; **never returns/logs/persists a plaintext password** (only a
  SHA-256 `token_hash` is stored). Gated by
  `AdminCapabilityService.can_invite_staff` (super_admin `platform.user.manage_all`
  or `tenant.staff.invite` + role ceiling).
- `GET /api/v1/admin/staff/invitations/?institution=` — tenant-scoped list.
- `GET /api/v1/admin/staff/candidates/?q=&institution=` — email/name **search
  selector** (R6.3), minimal projection (`id`, `email`, `full_name`, `role`).
- `POST /api/v1/admin/staff/invitations/<id>/resend/` — rotate token + re-email.
- `POST /api/v1/admin/staff/invitations/<id>/revoke/` — cancel + deactivate the
  membership + revoke sessions (`tenant.staff.disable`).
- `POST /api/v1/auth/staff-invitation/accept/` (`backend/apps/accounts/urls.py`)
  — **public** handoff: the invitee consumes the single-use token and sets their
  **own** password; the operator never sets or sees one. Frontend accept page:
  `apps/admissions/src/pages/auth/AcceptInvitationPage.tsx` (route
  `/auth/accept-invitation`; link built by `email_links.staff_invitation_url`).
  Table: additive migration `backend/scripts/2026_07_21_01_tenant_staff_invitations.sql`.

### Tenant change requests (R5.4-R5.5, TEN-06)

The **only** canonical tenant change-request workflow
(`backend/apps/catalog/change_request_service.py:TenantChangeRequestService`,
views in `change_request_v2_views.py`, routes in `change_request_v2_urls.py`).
Closes finding TEN-06: a Tenant_Admin who cannot directly mutate protected
configuration SUBMITS a typed request; a Platform_Admin reviews it and approval
applies it **transactionally through the same canonical configuration command a
Platform_Admin uses directly** (`backend/apps/catalog/canonical_config_commands.py`
— `apply_institution_profile_change` / `apply_program_offering_change` /
`create_institution_domain`, which the `admin_views.py` write endpoints now also
delegate to), recording redacted before/after snapshots (no secrets / PII).

State machine (`TenantChangeRequestStateMachine`, design §6.4):
`draft -> submitted -> approved -> applied`, `submitted -> rejected`,
`draft/submitted -> cancelled`. Table: additive migration
`backend/scripts/2026_07_22_01_tenant_change_requests.sql`
(`tenant_change_requests`, `managed = False` model
`apps.catalog.models.TenantChangeRequest`).

Mounted at `/api/v2/admin/change-requests/` (`apps/common/v2/urls.py`):

- `GET /api/v2/admin/change-requests/` — scoped list (a Tenant_Admin sees only
  their own institution's requests via `visible_institution_queryset`; a
  Platform_Admin sees all).
- `POST /api/v2/admin/change-requests/` — submit a typed change; requires the
  tenant `tenant.<kind>.request_change` capability resolved from `change_kind`
  (`profile`→`tenant.profile.request_change`, `program`→
  `tenant.program.request_change`, `domain`→`tenant.domain.request_change`);
  honours `Idempotency-Key`.
- `GET /api/v2/admin/change-requests/<id>/` — scoped detail (scope-before-lookup;
  cross-tenant id → non-revealing 404).
- `POST .../<id>/submit/` — `draft → submitted` (tenant `request_change`).
- `POST .../<id>/cancel/` — `draft/submitted → cancelled` (tenant `request_change`).
- `POST .../<id>/approve/` — `submitted → approved → applied` transactionally via
  the canonical command; platform capability per kind
  (`profile`→`platform.tenant.update`, `program`→
  `platform.program_assignment.manage`, `domain`→`platform.domain.manage`).
- `POST .../<id>/reject/` — `submitted → rejected` (same platform capability).

Every lifecycle command emits a `tenant.change_request.<verb>` Audit_Event and a
durable committed `outbox_events` row (design §17 — "queued == committed durable
record"); the applied change additionally emits the canonical
`tenant.<resource>.<verb>` config Audit_Event under the approver. All six routes
are registered in `scripts/authority_matrix_registry.py`. New V2 error codes:
`CHANGE_REQUEST_INVALID_STATE` (409), `CHANGE_REQUEST_APPLY_FAILED` (422),
`HOSTNAME_CONFLICT` (409).

### Domain context endpoint

`GET /api/v1/catalog/context/` (`backend/apps/catalog/views.py:CatalogContextView`)
returns the resolved tenant context or the Neutral Beanola context (fail-closed).

### Deprecated legacy catalog write paths

The institution / program / intake **write** methods in
`backend/apps/catalog/views.py` (`InstitutionListCreateView`,
`InstitutionDetailView`, `ProgramListCreateView`, `ProgramDetailView`,
`IntakeListCreateView`, `IntakeDetailView`) are **deprecated as a write surface**
and now **capability-gated** (`platform.tenant.*`, `can_manage_program`,
`platform.intake.manage`) via `HasPlatformCapability` + `TenantScopedCapabilityMixin`.
New tenant onboarding/management should use the `/api/v1/admin/institutions/...`
paths above. Public/student `GET` on these catalog endpoints is preserved
unchanged. **Never** restore an ungated write path on these views.

## Error Codes

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Catalog | `backend/apps/common/error_codes.py:ERROR_CODES` | views (via reference), tests |
| Frontend mirror | `apps/admissions/src/lib/errorMessages.ts` | UI components |
| Drift guards | `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts` + `backend/tests/unit/test_error_codes_canonical.py` |
| `RATE_LIMITED` (429) | Carries `Retry-After`, exposed cross-origin through `CORS_EXPOSE_HEADERS`. `apps/admissions/src/services/client.ts` sets `retryAfterSeconds` (clamped 0-3600) and `code: 'RATE_LIMITED'`; `apps/admissions/src/lib/rateLimitCopy.ts:rateLimitMessage` is the one copy source (SJR R3-d) | wizard programme/intake selects, student dashboard lists, upload rows, sign-in/sign-up banners |
| V2 envelope codes | `backend/apps/common/v2/error_codes.py:V2_ERROR_CODES` | `/api/v2` views, `backend/tests/contract/test_v2_*` |

### Catalog integrity 409 codes (Admissions V2 task 3.3)

Stable `409 CONFLICT` codes returned when a concurrent duplicate loses the race
to a DB uniqueness/scope constraint. Each is backed by a constraint added in
`backend/scripts/2026_07_17_01_integrity_constraints_expand.sql` (mirrored in the
test DB by `backend/tests/conftest.py::unmanaged_schema`). The endpoints keep a
check-then-insert / serializer guard as the friendly fast path; the DB
constraint is the final guard and the `IntegrityError` is translated to these
codes rather than a 500 (R6.7, R7.4, R15.5).

| Code | Endpoint (source of truth) | Backing constraint |
|------|----------------------------|--------------------|
| `ALREADY_LINKED` | `apps/catalog/admin_program_intake_views.py:AdminProgramIntakeCreateView` | `uq_program_intakes_program_intake` / `program_intakes_program_id_intake_id_key` |
| `DUPLICATE_ACCESS_GRANT` | `apps/catalog/admin_views.py:AdminAccessGrantListCreateView` | `uq_access_grants_active_{institution,program,application}` + `chk_access_grants_scope_target` |
| `DUPLICATE_ACTIVE_FEE` | `apps/documents/payment_query_views.py:ProgramFeeViewSet` | `uq_program_fees_one_active` |
| `DUPLICATE_DOCUMENT_PROFILE_VERSION` | `apps/catalog/admin_views.py:AdminTenantProfileCloneView` | `uq_doc_profiles_scope_version` |

Communication-template tenant uniqueness (`uq_comm_templates_key_inst_version`,
`uq_comm_templates_one_active`, replacing the dropped global
`communication_templates_template_key_key`) and the canonical waitlist-position
uniqueness (`uq_applications_waitlist_position`) are enforced by the same script;
their service-layer 409 translation is owned by the template-management and
waitlist rebuild tasks (task 5.3) respectively.

### Readiness blocker codes (Admissions V2 task 6.5)

Stable `code` values carried by `ReadinessBlocker` in
`backend/apps/applications/readiness_service.py`. The **same** codes are returned
by the readiness query (inside `data.blockers[]`) and raised by
`submit_application` (translated to the submission error envelope by
`services._raise_first_submission_blocker`), so a client switches on one set.
Each maps to exactly one labelled next action via `_NEXT_ACTION_BY_CODE`.

| Code | Category | Submit status | Meaning |
|------|----------|---------------|---------|
| `PROFILE_INCOMPLETE` | profile | 400 | A required personal field (or NRC/passport number) is missing. |
| `IDENTITY_DOCUMENT_REQUIRED` | documents | 400 | No non-deleted/non-rejected `nrc`/`passport`/`extra_kyc` upload. |
| `MINIMUM_GRADES_REQUIRED` | grades | 400 | Fewer than the configured minimum (floor 5) **unique persisted canonical** grades (STU-11). |
| `PROGRAM_ELIGIBILITY_NOT_MET` | eligibility | 400 | A **mandatory** offering eligibility rule is unmet (optional rules stay advisory). |
| `REQUIRED_DOCUMENT_MISSING` | documents | 400 | A required document from the versioned `requirements_snapshot` has no upload. |
| `PAYMENT_REQUIRED` | payment | 400 | Payment is neither completed nor deferred. |
| `FEE_NOT_CONFIGURED` | payment | 400 | No unique active canonical fee — never a substituted amount (R12.2). |
| `CONFIRM_SUBMISSION_REQUIRED` | declaration | 400 | The submission declaration did not accompany the submit command. |
| `DUPLICATE_SUBMITTED_APPLICATION` | duplicate | 409 | Another application for this program+intake is already submitted. |
| `PROGRAM_CAPACITY_REACHED` / `INTAKE_CAPACITY_REACHED` | capacity | 409 | Reported advisorily; the authoritative refusal comes from `CapacityService.take_seat_for_submission`. |
| `ALREADY_SUBMITTED` | state | 400 | Terminal-for-submit state; the submit endpoint replays success instead. |
| `APPLICATION_NOT_EDITABLE` | state | 400 | A non-draft, non-submitted status can no longer be submitted. |
| `CONFIGURATION_UNAVAILABLE` | configuration | 503 (retryable) | Canonical configuration could not be evaluated — fails closed (R11.6, DATA-04). Also the registered V2 envelope code. |

### Document upload rejection codes (Admissions V2 task 7.2)

Stable `code` values returned by `POST /api/v1/documents/upload/`. Source of
truth `backend/apps/applications/required_documents.py:UPLOAD_REJECTION_CODES`;
frontend mirror `apps/admissions/src/lib/requiredDocuments.ts` (same constant
name), drift-guarded by
`apps/admissions/tests/unit/requiredDocumentsDrift.test.ts`. The client may
refuse a file locally only with a code the server also uses, so an operator never
sees a code the backend cannot produce.

| Code | Status | Meaning |
|------|--------|---------|
| `DOCUMENT_TYPE_NOT_REQUIRED` | 400 | The type is neither configured for this application nor a platform type (`LEGACY_PLATFORM_DOCUMENT_TYPES`). |
| `EMPTY_FILE` | 400 | Zero-byte selection — reported as its own code, not a generic validation error. |
| `FILE_TOO_LARGE` | 400 | Exceeds the requirement's effective `max_size_bytes` (tenant-narrowed value, never above the platform ceiling). |
| `INVALID_FILE_TYPE` | 400 | Declared MIME type is outside the requirement's accepted set. |
| `INVALID_FILE` | 400 | The magic-byte check disagreed with the declared type or recognised nothing (corrected by SJR task 3.5: a mismatch is `INVALID_FILE`, not `INVALID_FILE_TYPE`). A declared type that is empty, `application/octet-stream` or `binary/octet-stream` is replaced by the type the bytes identify (`validators.detect_file_mime`); `image/jpg`, `image/pjpeg` and `image/x-png` are normalised first (`DECLARED_MIME_ALIASES`). The effective type is what is recorded. |
| `VALIDATION_ERROR` | 400 | `Idempotency-Key` present but not 8-128 characters of `[A-Za-z0-9._:-]`; the value is never echoed. |
| `UNSAFE_FILE_CONTENT` | 400 | The active-content screen (`documents/validators.py:scan_document_for_active_content`) refused executable/script content before the object write. |
| `CONFIGURATION_UNAVAILABLE` | 503 (retryable) | Requirement configuration could not be evaluated — the upload is refused, not accepted unverified. |

## System Actor (Automated Transitions)

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| UUID constant | `backend/apps/applications/services.py:SYSTEM_ACTOR_ID` | `tasks.py`, `condition_manager.py`, `waitlist_manager.py` |
| DB seed | `backend/scripts/system_actor_seed.sql` | manual application |
| UUID guard | `backend/apps/applications/services.py:transition_application_status` (validates `changed_by` is a UUID) | runtime |
| Pattern documentation | `docs/adrs/ADR-013-system-actor.md` | reference |
| Regression net | `backend/tests/integration/test_system_actor_transitions.py` |

## Submission Gates

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| **Readiness + submission gate evaluator** (Admissions V2 task 6.5) | `backend/apps/applications/readiness_service.py` — `evaluate_readiness` (query), `submission_blockers` (in-lock), `student_summary`, `ReadinessBlocker` codes, `DEFAULT_MINIMUM_PERSISTED_GRADES` (policy floor 5), `_NEXT_ACTION_BY_CODE` | `GET /api/v2/student/applications/{id}/readiness/` and `submit_application` — the **only** two consumers; there is no second readiness implementation |
| Gate logic (transaction, locks, state transition) | `backend/apps/applications/services.py:submit_application` | `POST /api/v1/applications/{id}/submit/` |
| Identity-document gate | `backend/apps/applications/services.py:_application_has_identity_document` | internal to `submit_application` |
| Intake/program capacity | `backend/apps/applications/intake_enforcer.py:IntakeEnforcer.check_submission` | `submit_application` |
| Canonical last-seat allocation | `backend/apps/applications/capacity_service.py:CapacityService.take_seat_for_submission` (under the `ProgramIntake` row lock) | `submit_application` |
| Multi-intake duplicate | `backend/apps/applications/duplicate_checker.py:DuplicateChecker.check_at_submit` (honors `multi_intake_policy`) | `submit_application` |
| Persisted-canonical-grade minimum | `readiness_service.resolve_minimum_grades()` (`minimum_persisted_grades` setting may only *raise* the floor of 5) | readiness + submission + the batch grade write path `ApplicationGradesView` (R11.5, STU-11) |
| Submit idempotency key (client) | `apps/admissions/src/lib/submitIdempotency.ts:buildSubmitIdempotencyKey` (`submit-<applicationId>`, stable so a lost response replays) | `useWizardController` submit; guard `apps/admissions/tests/unit/submitIdempotency.test.ts` |
| Client readiness (one computation) | `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts:computeReadiness` over `lib/wizardReadiness.ts:buildWizardReadiness` (every input required, no defaults) | the Submit button (`wizardReadiness`) **and** `useWizardSubmission.handleSubmitApplication`, so the handler cannot disagree with the button (SJR task 3.22, C-01). `useOverallProgress` is a separate display computation with today's defaults passed explicitly until Spec B V3 task 26.1 moves it |
| Documentation | `docs/admissions-submission-gates.md`, evidence `docs/v2-evidence/6.5/` |

### Authoritative readiness endpoint (Admissions V2 task 6.5, R10.6/R11.2-R11.6/R12.3)

`GET /api/v2/student/applications/{application_id}/readiness/`
(`backend/apps/applications/readiness_v2_views.py`, routed by
`readiness_v2_urls.py`, mounted from `apps/common/v2/urls.py`).

- Read-only. Returns the design §8.3 sections: `assignment`, `configuration`
  (stored + live version, drift), `profile`, `identity`, `grades`, `eligibility`,
  `documents`, `payment` (incl. fee quote), `capacity`, `duplicates`, `intake`,
  `declarations`, `blockers`, `can_submit`, `allowed_next_actions`, `summary`.
- Invariant clients may rely on:
  `can_submit == (status == "draft" and blockers == [])`. An un-ticked
  declaration is **not** a blocker (it is the submit action itself); its state
  lives in `declarations` and is re-checked under the row lock at submit.
- Authority: owner always; `reviewer`/`admin`/`super_admin` only when the
  application is inside `AccessScopeService.filter_applications` (this is the
  R11.3 reviewer readiness query). Anything else → non-revealing **404**.
  Registered in `scripts/authority_matrix_registry.py` as `owner` /
  `not_found_mask`.
- Fails closed with the registered retryable `CONFIGURATION_UNAVAILABLE` (503)
  when the canonical required-document configuration cannot be evaluated
  (R11.6, DATA-04, STU-13) — never a report built on "no requirements".
- Deterministic only: no generative-AI call in the readiness or summary path
  (R11.1-R11.2).

### Canonical subject catalogue and alias inventory (Admissions V2 task 7.1, R11.4/R11.5)

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| **Canonical subject catalogue** (62 identities: 43 ECZ + 19 A-Level), category vocabulary, and content-derived `SUBJECT_CATALOG_VERSION` | `backend/apps/catalog/subject_catalog.py` — `CANONICAL_SUBJECTS`, `SUBJECT_CATEGORIES`, `SUBJECT_CATALOG_VERSION` | `GET /api/v1/catalog/subjects/`; `manage.py seed_subjects`; `backend/scripts/2026_07_25_01_canonical_subject_catalog.sql`; wizard selector |
| **Versioned subject-alias catalogue** (normalised alias → canonical code) | same module — `SUBJECT_ALIASES`, `aliases_by_code()`, `resolve_code()` | published per subject as `Subject.aliases` by `GET /api/v1/catalog/subjects/`; deterministic OCR/import assistance (task 7.5); frontend read-only mirror `educationCatalog.SUBJECT_NAME_ALIASES` |
| **Retired duplicate subject codes** (`ADD_MATH`→`ADDMATH`, `MUS`→`MUSIC`, `PHYS`→`PHY`) | same module — `LEGACY_DUPLICATE_CODES` | the catalogue migration (repoint + deactivate) and its tests |
| **Selectable subject queryset** (active only — a deactivated row can still be referenced by an old grade but is never counted, so offering it would be a trap) | same module — `active_subjects_queryset()` | `SubjectListView`; `ApplicationGradeSerializer.validate_subject_id` |
| **"An identity the server issued" (client)** | `apps/admissions/src/lib/canonicalSubjectId.ts` — `isCanonicalSubjectId`, `syncableGrades` | wizard selector, client readiness, live row diagnostics, draft-resume sanitiser, every grade-sync path, `subjectMatcher` |
| Subject display metadata (grouping/labels only, carries **no** identity) | `apps/admissions/src/pages/student/applicationWizard/lib/educationCatalog.ts` — `SUBJECT_DISPLAY_METADATA`, `SUBJECT_CATEGORY_LABELS`, `LEGACY_SUBJECT_SLUG_TO_CODE` (repair only) | `EducationStep` selector |
| Documentation / evidence | `docs/v2-evidence/7.1/` (incl. the read-only Neon catalogue inventory) | — |

Invariants clients may rely on:

- **Selectors contain only server-provided canonical UUIDs** (R11.5). The wizard
  has no fabricated subject list; an unavailable catalogue yields an empty
  selector, never invented options.
- **The write boundary and the readiness evaluator share one definition of
  "resolvable"**: `ApplicationGradeSerializer.validate_subject_id` requires an
  *active canonical* subject, so a grade that could never count cannot be saved.
- A **fake** subject id is structurally unpersistable —
  `application_grades_subject_id_fkey` is a real FK to `subjects(id)`. The
  reachable "unresolved" case is a *deactivated* subject, which readiness reports
  as `unresolved_subject_count` and never counts toward completeness.
- Aliases are **resolution inputs only**: they never become application data
  without explicit student confirmation, and never carry an identity of their own.

### Deterministic grade-extraction candidates (Admissions V2 task 7.5, R11.4/R11.7/R11.9-R11.10)

Server-side Tesseract behind the Celery task is the **only** extraction path, and
its output is a *suggestion*. There is no browser OCR engine, no generative model,
and no second subject-mapping table.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| **Deterministic result-slip parser** (text → candidates; exact catalogue/alias resolution only, no fuzzy metric), `PARSER_VERSION`, confidence tiers, and the confirmable floor | `backend/apps/documents/grade_extraction.py` — `parse_result_slip`, `extract_candidates`, `PARSER_VERSION`, `CONFIDENCE_CANONICAL`, `CONFIDENCE_ALIAS`, `MIN_CONFIRMABLE_CONFIDENCE` | `extract_document_text_task`; `DocumentInfoView`; the corpus evaluation |
| **Candidate status vocabulary** (`suggested`, `low_confidence`, `unresolved`, `duplicate`, `invalid_grade`) — only `suggested` may be pre-selected | same module — `STATUS_*`, `GradeCandidate.confirmable` | wizard confirmation panel; corpus expectations |
| **Structured extraction record** (append-only; never `verification_notes`) | `document_verification_events` rows with `event_type='document.extraction.candidates'` — written by `grade_extraction.record_candidates`, read by `latest_candidates` | `GET /api/v1/documents/{id}/info/` → `data.extraction` |
| **Published `ocr_state`** (`ocr_pending` = job accepted and queued, from `extraction_state='pending'` set by `POST /documents/{id}/extract/` before enqueue; then `ocr_processing`, `ocr_complete`, `ocr_no_text`, `ocr_no_grades`, `ocr_failed`, `ocr_skipped`; `null` = no job). A broker failure answers 503 `OCR_QUEUE_UNAVAILABLE` and restores the prior state. Client polling bounds: at most 10 polls on a 2, 3, 5, 8, 13, then 15 s schedule, no client retry per poll, paused while the tab is hidden, stopping on a terminal state, a missing job, 404 or 429 (SJR R3-c) | `GET /api/v1/documents/{id}/info/`; `useOcrGradeExtraction.ts` (`OCR_POLL_DELAYS_MS`) | 
| **Scan/extraction state** (`pending`, `ocr_processing`, `ocr_complete`, `ocr_no_text`, `ocr_no_grades`, `ocr_failed`, `ocr_skipped`) | `apps/documents/document_evidence.py` — `EXTRACTION_STATES`, `record_extraction_state`; column `application_documents.extraction_state` | wizard assistance hook; document contract; admin document surfaces |
| **Historical (pre-7.4) machine extraction** — labeled read-only provenance, never a candidate | `backend/apps/documents/extraction_provenance.py` — `HISTORICAL_SOURCE`, `provenance_payload` | `GET /api/v1/documents/{id}/info/` → `data.extraction_provenance` |
| **Client-side candidate reader + confirmation gate** | `apps/admissions/src/pages/student/applicationWizard/hooks/useOcrGradeExtraction.ts` — `readExtractionPayload`, `confirmCandidates`, `dismissCandidates` | `ExtractedResultsCard`; `useWizardController.confirmOcrCandidates` → `handleOcrGrades` |
| **Versioned fixture corpus + evaluation** | `backend/tests/fixtures/ocr_corpus/manifest.json` (+ `cases/*.txt`), `backend/scripts/evaluate_ocr_corpus.py` | `backend/tests/integration/test_ocr_assistance_7_5.py`; `docs/v2-evidence/7.5/` |

Invariants clients may rely on:

- **Nothing extracted becomes application data without explicit confirmation**
  (R11.4). The published block states `requires_confirmation: true` and
  `authoritative: false`; extraction writes **zero** `application_grades` rows.
- **A manually entered grade always wins.** `handleOcrGrades` only fills subjects
  the student has not entered, and it is reachable only from the confirm action.
- **Low confidence, unresolved, duplicate, and out-of-scale rows are shown but
  never offered** — an unrecognised label is never guessed to a near match.
- **Extraction never overwrites a human verification decision**: OCR owns
  `extraction_state`; `verification_notes` and `verified_by/at` stay human fields.
- **No browser OCR ships.** `tesseract.js`/`tesseract.js-core`, the asset-copy
  step, and the `vendor-ocr` chunk are removed; guarded by
  `apps/admissions/tests/unit/ocrAssetRemoval.test.ts` plus the entry-chunk guard.

### Required-document upload contract (Admissions V2 task 7.2, R11.6-R11.8)

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| **Required-document contract** for one application (requirement rows + current evidence + platform policy) | `backend/apps/applications/required_documents.py` — `build_contract`, `resolve_requirements` | `GET /api/v1/applications/{application_id}/required-documents/` (`apps/applications/student_document_views.py::ApplicationRequiredDocumentsView`) |
| **Which document types this application may upload** | same module — `resolve_upload_target`, `LEGACY_PLATFORM_DOCUMENT_TYPES` | `POST /api/v1/documents/upload/` (`apps/documents/document_storage_views.py::DocumentUploadView`); `DocumentUploadSerializer.document_type` validates identifier *shape* only |
| **Platform upload policy ceiling** (`PLATFORM_ACCEPTED_MIME_TYPES`, `MIME_EXTENSIONS`, `PLATFORM_MAX_UPLOAD_BYTES`, `MIN_CONFIGURABLE_MAX_BYTES`) | same module | the upload command; frontend policy mirror below |
| **Platform baseline requirements** (`result_slip`, `extra_kyc` accepting `nrc`/`passport`) | same module — `PLATFORM_BASELINE_REQUIREMENTS` (identity aliases come from `readiness_service.IDENTITY_DOCUMENT_TYPES`) | the contract; the `IDENTITY_DOCUMENT_REQUIRED` submission gate |
| **Stable upload rejection codes** — `DOCUMENT_TYPE_NOT_REQUIRED`, `EMPTY_FILE`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `UNSAFE_FILE_CONTENT` | same module — `UPLOAD_REJECTION_CODES` | the upload command; frontend mirror `apps/admissions/src/lib/requiredDocuments.ts` → `UPLOAD_REJECTION_CODES` |
| **Applicant active-content screen** (deterministic, dependency-free; not an AV engine) | `backend/apps/documents/validators.py` — `scan_document_for_active_content` | the upload command, after `validate_file_magic_bytes` and before the object write |
| **Client policy mirror + contract parser** | `apps/admissions/src/lib/requiredDocuments.ts` | `useRequiredDocuments`, `RequiredDocumentsPanel`, `services/requiredDocuments.ts` |
| **Wizard document surfaces** (checklist, blockers, Continue gate, review rows) | `apps/admissions/src/pages/student/applicationWizard/lib/requiredDocumentSurfaces.ts` | wizard `index.tsx`, `SubmitStep`, `useStepValidation` |
| Documentation / evidence | `docs/v2-evidence/7.2/` | — |

Invariants clients may rely on:

- **Controls are rendered from the contract, never a hardcoded type list**
  (R11.6, STU-13). A tenant-configured type — including a custom one such as
  `nursing_council_letter` — is rendered, validated, and uploadable with no
  frontend change. The frontend holds **no** document-type list.
- **The contract and the upload command share one authority.** A control the
  client rendered is always uploadable, and a type nobody asked for is refused
  with `DOCUMENT_TYPE_NOT_REQUIRED`.
- **A tenant rule may narrow the platform policy, never widen it.** Both sides
  clamp to `PLATFORM_ACCEPTED_MIME_TYPES` / `PLATFORM_MAX_UPLOAD_BYTES`;
  provenance is published per row as `constraints_source` /
  `constraints_narrowed`.
- **Fails closed** with the registered retryable `CONFIGURATION_UNAVAILABLE`
  (503) on both the read and the upload when the canonical requirement
  configuration cannot be evaluated — never "no requirements" and never an
  accepted upload (R11.6, DATA-04).
- **Authority** (SJR task 3.19, R5-g) is `resolve_owner_or_scoped_application`
  with `tenant.document.read`, shared with `ApplicationDocumentsView`: the owner,
  or staff inside `AccessScopeService.filter_applications` (an assignment-scoped
  reviewer only for assigned work). A non-owner student, an out-of-scope staff
  actor and an unknown id all receive the same **404**. The raw `role == "admin"`
  branches and the 403 that confirmed an application existed are gone.
- **Document reads** (`signed-url/`, `download/`, `info/`) load through
  `_get_authorized_document` -> `resolve_owner_or_scoped_document` and
  `require_reviewer_assignment`, so an assigned in-scope reviewer is served;
  `extract/` and `delete/` pass `allow_assigned_reviewer=False`, so a reviewer
  keeps the masked 404 there. Presigned reads carry a
  `ResponseContentDisposition` from `storage.content_disposition_for` (R5-h).
- **Workspace list** (SJR task 3.18, R5-b): the status page's "Supporting
  documents" card reads `GET /applications/{id}/documents/` (every current
  document, with a View anchor to `/student/documents/open?doc=<id>`); the two
  snapshot columns are no longer rendered as links. The wizard panel shows a
  View anchor for an uploaded requirement.
- **Progress is honest** (SJR task 3.6): the one upload transport,
  `requiredDocumentsService.upload` -> `apiClient.upload` ->
  `services/uploadTransport.ts` (`XMLHttpRequest`), reports byte progress, so an
  in-flight upload renders a determinate `role="progressbar"`
  (`aria-valuenow` 0-100). The indeterminate state remains only before the first
  progress event. There is no total timeout: a 30 s inactivity timer is re-armed by
  every progress event, then a 60 s response timer. No fabricated percentage is ever shown.
- **One upload transport** (SJR task 3.7): `requiredDocumentsService.upload` ->
  `apiClient.upload` is the only upload path; `uploadPathSingleSource.test.ts`
  freezes the dead stacks (deletion owned by Spec B S2). Phone photos over 2 MiB
  (JPEG/PNG) are downscaled to a 2400 px long edge before sending
  (`lib/imageDownscale.ts`, the original is sent when that is not smaller or on any
  error); server validation, not the client, decides acceptance.
- **Client-only upload codes** (frontend-only, no backend mirror): `UPLOAD_STALLED`,
  `NETWORK_ERROR`, `ABORTED` (`UploadTransportError`); copy in
  `lib/requiredDocuments.ts` (`CLIENT_UPLOAD_ERROR_COPY`). The user sees the first
  failure's code after the one automatic retry (same `Idempotency-Key`, never for `RATE_LIMITED`).
Drift guard: `apps/admissions/tests/unit/requiredDocumentsDrift.test.ts` against
the pinned fixture `apps/admissions/tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts`
(regeneration command in `docs/v2-evidence/7.2/README.md`).

### Immutable document evidence + storage compensation (Admissions V2 task 7.3, R11.7-R11.8/R17.1-R17.4)

An upload is **one recoverable command**, not an object write and a row insert that
happen to be adjacent. `document_evidence.py` is the only module that decides what
the current evidence for a requirement is.

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| **Document lifecycle vocabulary** (`uploaded`, `scanning`, `ready_for_review`, `verified`, `rejected`, `processing_failed`, `superseded`, `deleted`) and its transition table | `backend/apps/documents/document_evidence.py` — `LIFECYCLE_STATES`, `LIFECYCLE_TRANSITIONS`, `can_transition`; column `application_documents.lifecycle_state`, mirrored by CHECK `chk_application_documents_lifecycle_state` | the upload/verify/delete commands; document contract; admin document surfaces |
| **Legacy `verification_status` projection** (the pre-7.3 column every existing reader still uses) | same module — `LEGACY_STATUS_PROJECTION`, `legacy_status_for`, `lifecycle_of`, `lifecycle_from_row`. `superseded` deliberately has **no** projection so prior evidence keeps its own review outcome | readiness gates; student document list; admin review |
| **The staged-write command** (hash → replay check → commit stage → write object → verify object → commit metadata → compensate) | same module — `compute_checksum`, `open_stage`, `verify_stored_object`, `commit_version`, `compensate_stage`, `mark_stage` | `POST /api/v1/documents/upload/`; `apps/applications/tasks/pdf_generation.py` (official documents, `provenance='system_generated'`) |
| **Stage ledger states** (`staged`, `committed`, `compensated`, `compensation_pending`, `write_failed`, `orphaned`; `MAX_COMPENSATION_ATTEMPTS`) | same module — `STAGE_*`; table `document_upload_stages`, CHECK `chk_document_upload_stages_state` | the upload command; `reconcile_document_storage_task` |
| **Upload replay identity** (what counts as "the same command") | same module — `find_replay_by_idempotency_key` (caller-declared, via `Idempotency-Key` + `uq_document_upload_stages_idempotency`; a key is replayable only from a committed stage and `mark_stage` releases it when the stage ends compensated, compensation_pending, write_failed or orphaned), then `find_identical_current_version(..., document_name=…)` (same bytes **and** same name) | the upload command |
| **One current version per application + requirement** | partial unique index `uq_application_documents_one_current` (`WHERE is_current`, task 3.5). `commit_version` releases the slot from **every** row holding it, whatever its lifecycle says | the upload command; `IntegrityError` → `DOCUMENT_VERSION_CONFLICT` (409) |
| **Append-only verification history** | table `document_verification_events`; writer `record_event`; reader `history_rows` | `GET /api/v1/applications/{id}/required-documents/` → `history`; `GET /api/v1/documents/{id}/versions/` |
| **Stable operator-visible event names** (`document.version.committed` / `.superseded` / `.deleted`, `document.verification.decided`, `document.extraction.state`, `document.stage.compensated` / `.compensation_pending` / `.reconciled` / `.orphaned` / `.unverified`) | same module — `EVENT_*`; written to `document_verification_events.event_type` and emitted via `emit_metric` | operator dashboards; `reconcile_document_storage_task` |
| **Reconciliation sweeper** | `backend/apps/documents/tasks.py` — `reconcile_document_storage_task`, `DOCUMENT_STAGE_RECONCILE_AFTER_SECONDS`; beat entry `reconcile-document-storage` (900 s) | orphaned staged objects; deferred compensation retries |
| **Stable document command codes** — `DOCUMENT_VERSION_CONFLICT` (409), `DOCUMENT_UPLOAD_IN_PROGRESS` (409, an attempt with this key is still in flight), `DOCUMENT_STORAGE_UNVERIFIED` (500, retryable), `DOCUMENT_TRANSITION_REJECTED` (409), `DOCUMENT_COMMIT_FAILED` (500, retryable), `INVALID_VERIFICATION_DECISION`; and `DOCUMENT_LINK_UNAVAILABLE` (SJR task 3.19, an official document exists but its link could not be signed; carried as `error_code` on a `ready` status read, not an HTTP error) | same module — `DocumentCommandError` raisers; `official_document_views.DOCUMENT_LINK_UNAVAILABLE` | the upload/verify/delete endpoints |
| **Client replace/delete commands** | `apps/admissions/src/hooks/useRequiredDocuments.ts` — `beginReplace`, `cancelReplace`, `removeDocument`; transport `apps/admissions/src/services/requiredDocuments.ts` | `RequiredDocumentsPanel` |
| Documentation / evidence | `docs/v2-evidence/7.3/` | — |

Invariants clients may rely on:

- **The checksum is computed over the stored bytes, never supplied by the caller.**
  `compute_checksum` streams the upload once and returns `(sha256, length)`; that
  length is what `verify_stored_object` compares the stored object against.
- **A committed version's object is readable.** The commit happens only after the
  write is confirmed (`exists` + `size`). Compensation can delete an object the
  database never recorded; it cannot conjure bytes the provider never kept, so the
  second direction is closed by ordering rather than by an undo.
- **A failed metadata commit never leaves a silent orphan.** Compensation deletes
  the staged object; if that delete also fails the stage stays
  `compensation_pending` for the sweeper, and an exhausted stage becomes
  `orphaned` (operator-visible), never "compensated".
- **Replace changes the server record.** A replacement inserts a new immutable
  version with `supersedes_id` set and marks the prior one `superseded`; the
  required-documents contract then reports the new id, version, and checksum, with
  the prior version in `history`. This is the STU-19 assertion.
- **Re-uploading identical bytes under a different name is a replacement, not a
  replay.** Byte-identity alone is not the command identity (see the replay-identity
  row above) — treating it as one made a successful upload change nothing.
- **Prior evidence is preserved.** Superseding does not rewrite the prior row's
  `verification_status`, `verification_notes`, or `verified_by/at`; deleting retains
  the stored object; history is append-only and never updated or deleted by the
  runtime.
- **Extraction never clobbers a human decision.** OCR owns `extraction_state`
  (`record_extraction_state`), and the legacy projection is only written while no
  human decision exists to protect.

**Storage keys, not links (student-journey-repair R4, tasks 3.13-3.15).**

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| **What `application_documents.file_url` / `storage_key` hold** | For rows written after task 3.13 both hold the **object key**. The three writers (upload view, `condition_evidence_service.py`, `tasks/pdf_generation.py`) call no `storage.url()`; guard `backend/tests/unit/test_no_persisted_signed_urls_sjr.py` (tenant assets in `catalog/admin_asset_views.py` are listed Spec B exceptions) | every document reader |
| **URLs are signed on read** | `backend/apps/common/storage.py` — `resolve_document_object_key`, `resolve_document_open_url`; `DocumentSerializer.file_url` is a `SerializerMethodField` (signing failure → `null` + ERROR `document.sign.failed`) | document list, signed-url and download endpoints, official-document envelope, legacy synthesis, OCR task |
| **Legacy persisted values** | `storage.py:_key_from_persisted_value` (design R4-c): a bare UUID is a presence marker (no key); a relative value is a key; an `X-Amz-` URL or one on our endpoint/public/bucket host gives its path; any other `https` URL is a legacy-provider URL returned unchanged (INFO `document.open.legacy_provider`). Listed as a legacy fallback below | same readers |
| **Application snapshot columns** (`applications.result_slip_url`, `extra_kyc_url`) | Presence markers holding the **current document id**, written inside `commit_version`'s transaction (`snapshot_field=`, map `document_evidence.SNAPSHOT_FIELD_BY_DOCUMENT_TYPE`); a replay heals a NULL snapshot without touching `updated_at` (`heal_snapshot_on_replay`, metric `document.snapshot.healed_on_replay`). Registered in `apps/common/legacy_columns.py:LEGACY_PRESENCE_SNAPSHOT_COLUMNS` (removal: every reader uses the required-documents contract, Spec B). Older rows may hold a URL | frontend presence readers; `ApplicationDocumentsView.get` id-aware legacy synthesis (skips a pair when the snapshot matches a listed id / stored `file_url` / `storage_key`, when a covering type is listed, or when it is a bare UUID) |
| **Object key shape** | `document_evidence.build_object_key(application_id, document_type, *, mime_type)` → `documents/{application}/{type}/{uuid hex}{.pdf|.jpg|.png|.bin}`; no client filename (the name lives in `document_name`) | upload view; condition evidence |

## Database Schema

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Canonical schema | `backend/scripts/00_full_schema.sql` (TODO: pg_dump from prod) | new-environment bootstrap |
| Schema migration tracking | `migration_history` table on production Neon project `wild-bar-37055823` | `backend/scripts/MIGRATION_HISTORY.md` (manual mirror, regenerated after reconciliation) |
| Applied migrations | `backend/scripts/applied/` | historical record |
| Integrity constraints (V2 task 3.3) | `backend/scripts/2026_07_17_01_integrity_constraints_expand.sql` + `2026_07_17_02_communication_template_unique_switch.sql` | `apply_sql_migrations`; mirrored in `backend/tests/conftest.py::unmanaged_schema`; evidence `docs/v2-evidence/3.3/` |
| Fee-quote table (V2 task 8.1) | `backend/scripts/2026_07_30_01_payment_fee_quotes.sql` (+ `_rollback`) — new empty `payment_fee_quotes` table, additive-only, idempotent | `apply_sql_migrations`; model `apps.documents.models.FeeQuote` (`managed = False`); constraints mirrored in `backend/tests/conftest.py::unmanaged_schema`; evidence `docs/v2-evidence/8.1/` |
| Document version columns + one-current index (V2 task 3.5) | `backend/scripts/2026_07_19_0{1,2,3}_payments_documents_{expand,backfill,validate}.sql` — `version`, `is_current`, `supersedes_id`, `superseded_at`, `content_hash`, `uploaded_by`, `provenance`, and `uq_application_documents_one_current` | `apply_sql_migrations`; `document_evidence.commit_version`; evidence `docs/v2-evidence/3.5/` |
| Document evidence lifecycle + staged-write ledger (V2 task 7.3) | `backend/scripts/2026_07_26_01_document_evidence_lifecycle.sql` (+ `_rollback`) — `lifecycle_state`, `storage_key`, `extraction_state` columns plus the new `document_upload_stages` and `document_verification_events` tables, additive-only, idempotent | `apply_sql_migrations`; models `apps.documents.models.DocumentUploadStage` / `DocumentVerificationEvent` (`managed = False`); indexes mirrored in `backend/tests/conftest.py::unmanaged_schema`; registered in `tests/property/test_migration_properties.py::EXPECTED_TABLE_MAPPING`; evidence `docs/v2-evidence/7.3/` |
| One-current slot alignment (V2 task 7.3) | `backend/scripts/2026_07_26_02_document_current_slot_alignment.sql` (+ `_rollback`) — data-only; releases `is_current` from soft-deleted rows (which 3.5's newest-`uploaded_at` backfill could promote) and promotes the newest surviving version. Without it a soft-deleted row can hold the enforced slot forever and no replacement is possible | `apply_sql_migrations`; evidence `docs/v2-evidence/7.3/` §2.3 |
| Document snapshot repair (SJR task 3.15) | `backend/scripts/2026_11_02_01_repair_document_snapshot_presence.sql` (+ ledger-only `_rollback`) — data-only, idempotent; fills NULL `applications.result_slip_url` / `extra_kyc_url` with the newest current document id, never touches `updated_at`. Proven on a local scratch copy; Neon-branch proof and the Neon default-branch apply are operator-gated (pending); production runs it at boot on the approved task 6.2 deploy after the task 6.1 backup | `apply_sql_migrations`; evidence `.agents/tasks/implement-journey-repair-2026-11-08/g5-r4-evidence.md` |
| Legacy column inventory | `backend/apps/common/legacy_columns.py:LEGACY_DEPRECATED_COLUMNS` | drift test, drop migration |
| Drop migration (Day 90) | `backend/scripts/legacy_columns_drop_2026_08_15.sql` | scheduled execution |
| Migration-history coverage exemptions | `check_schema_drift.py:_COVERAGE_EXEMPT_SCRIPTS` (`00_full_schema.sql` snapshot + `legacy_columns_drop_2026_08_15.sql` future drop) | drift guard `test_check_schema_drift_migration_history_coverage.py::test_exempt_scripts_are_not_flagged_as_stale` |
| Jobs-ops missing-table degradation | `backend/apps/jobs/_persistence.py` (`resolve_job_posting`, `persist_match_score_safe`) | `JobScoreView`/`JobTailorDocumentsView`; guard `tests/unit/test_jobs_orm_degradation.py` |
| Drift guard | `backend/tests/property/test_schema_drift_strict.py` + `check_schema_drift --check-fk-indexes --check-migration-history-coverage` (Component 6 of `.kiro/specs/production-schema-reconciliation/`) |
| No-writes guard | `backend/tests/unit/test_legacy_columns_no_writes.py` |
| Deprecation runbook | `docs/runbooks/legacy-column-deprecation.md` |
| Reconciliation runbook | `docs/runbooks/schema-reconciliation-runbook.md` |

## Feature Flags

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Flag inventory | `docs/runbooks/feature-flags-2026-05-17.md` | runtime + deploy |
| Production overrides | `backend/config/settings/prod.py` + `staging.py` | runtime |
| Pre-flight assertion | `backend/apps/common/management/commands/check_production_state.py` | deploy gate |

## Wizard

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Wizard navigation | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardNavigation.ts` | `useWizardController` |
| Wizard state | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts` | `useWizardController` |
| Sanitizer | `apps/admissions/src/lib/security.ts:sanitizeInput` | wizard, services |
| Payment recovery | `apps/admissions/src/stores/paymentRecoveryStore.ts` | `PaymentStep`; cleared only by a server answer (a verify result of `deferred`/`successful`/`failed`, or `deferPayment` resolving) |
| Page save status | `apps/admissions/src/pages/student/applicationWizard/lib/pageSaveView.ts:deriveWizardPageSaveView` — the draft machine's view composed with document commands (an upload in flight is "saving", a failed upload is an error) | `index.tsx` → `WizardActionBar` (SJR task 3.23) |

## Multi-Tenant (Beanola)

Spec: `.kiro/specs/multi-tenant-beanola-admissions/`. The Beanola conversion
makes canonical IDs the **sole** sources of truth for routing, scoping, payment
tagging, and document generation. The legacy `applications.institution /
program / intake` strings are **display snapshots only** — read-only mirrors,
never the authority for new business logic (R1.2, R1.3).

| Concept | Source of truth | Consumers / display snapshot (read-only) |
|---------|-----------------|-------------------------------------------|
| Canonical program | `backend/apps/catalog/models.py:CanonicalProgram` (`canonical_programs.id`, unique `code`) | `applications.canonical_program` (db_column `program_id`); display snapshot `applications.program` |
| School offering | `backend/apps/catalog/models.py:Program` (`programs.id` = `program_offering_id`, linked via `canonical_program_id`) | `applications.program_offering` (db_column `program_offering_id`); `OfferingAssignmentService.assign` |
| Institution scope | `backend/apps/catalog/models.py:Institution` (`institutions.id`) | `applications.institution_ref` (db_column `institution_id`); display snapshot `applications.institution` |
| Intake | `backend/apps/catalog/models.py:Intake` (`intakes.id`) | `applications.intake_ref` (db_column `intake_id`); display snapshot `applications.intake` |
| Assignment authority | `backend/apps/catalog/services.py:OfferingAssignmentService` | wizard create + `submit_application` revalidation |
| Institution context (white-label vs shared) | `backend/apps/catalog/services.py:InstitutionContextService` | host resolution; `GET /api/v1/catalog/context/` |
| Staff membership scope | `backend/apps/catalog/models.py:UserInstitutionMembership` (`user_institution_memberships`, partial-unique active `(user_id, institution_id)`) | `AccessScopeService.filters_for_user` |
| Access grant scope | `backend/apps/catalog/models.py:AccessGrant` (`access_grants`, scope_type institution/offering/application, time-boundable) | `AccessScopeService.filters_for_user` |
| Scope computation | `backend/apps/catalog/services.py:AccessScopeService` (`ScopeFilters`) | every scoped queryset (applications, payments, documents, analytics) |
| Application uniqueness | `(student identity, canonical program, intake)` keyed on canonical IDs | `backend/apps/applications/duplicate_checker.py:DuplicateChecker` (legacy string fallback only when canonical IDs absent) |
| Payment settlement reporting | `payments.metadata` settlement snapshot (Beanola collector + institution/canonical/offering/intake IDs) | tenant-scoped settlement summary; "Unassigned" bucket on missing metadata |
| Official document provenance | `verification_notes.official_document` (template id+version, asset ids) | `DocumentTemplateService` + `tasks/pdf_generation.py` |
| Drift guard | `backend/tests/unit/test_canonical_tenant_drift_guard.py` (no new runtime logic matches `applications.institution/program/intake` legacy strings outside migration/legacy-fallback) |

**Legacy-string fallback allowlist (R1.3, R1.5):** the only runtime modules
permitted to match on the `applications.program / intake / institution` legacy
strings are the explicitly-labelled legacy-fallback / pre-canonical branches
listed below. Each is named as legacy, is covered by the drift guard
`backend/tests/unit/test_canonical_tenant_drift_guard.py` (every entry is pinned
in `_ALLOWED_PREDICATES`), does **not** execute for new canonical records (the
canonical-ID path is taken whenever the id is present), and carries the shared
removal condition stated below. The drift guard fails on any unlisted new
occurrence.

| Module (`backend/apps/…`) | Allowlisted predicate(s) | Branch label / why legacy | Non-executing for new canonical records |
|---------------------------|--------------------------|---------------------------|------------------------------------------|
| `applications/duplicate_checker.py` | `program=program`, `intake=intake` | "Canonical-only keying (R8.1) … fall back to the legacy string only for an id that is absent (R8.5)." | Yes — `Q(canonical_program_id=program_id) if program_id else Q(program=program)` (and the same for `intake`); the legacy `program=`/`intake=` predicate is only reached when the canonical id is `None`. |
| `applications/waitlist_manager.py` | `program=program`, `intake=intake` | Pre-Beanola waitlist position/promotion keyed on the program+intake display strings. (`program=application.program` / `intake=application.intake` were **de-registered by admissions-v2 task 12.5**: the drift guard's new staleness check found the predicates gone — `application.program` / `application.intake` remain in the module only as positional helper arguments and notification copy, which are not ORM predicates.) | Yes for new records — waitlist position is keyed on the snapshot strings carried alongside the canonical IDs; canonical IDs remain the routing/scoping authority and no canonical record is keyed off the legacy string for routing. |
| `applications/intake_enforcer.py` | `intake=intake_name`, `program=program_name` | Pre-canonical enrollment counting (capacity counts by intake/program name string). | Yes — the intake/program is first resolved to a canonical id via `IdentifierResolver`; the legacy-string `count()` is the pre-canonical capacity tally only. |
| `applications/tasks/waitlist.py` | `intake=intake.name`, `program=app.program`, `intake=next_intake.name` | `waitlist_cascade_task` carries waitlisted rows to the next intake using the pre-canonical display strings (existing pre-Beanola cascade logic; the `Application.create()` writes the snapshot and is correctly **not** a match). | Yes — cascade is a pre-canonical batch job over the display snapshots; new canonical routing/scoping never depends on it. |
| `analytics/admissions_analytics.py` | `institution__icontains=filters['institution']`, `program__icontains=filters['program']` | Admin display-string `__icontains` filter over the pre-canonical institution/program snapshots (reporting only). | Yes — read-only admin reporting filter; never drives create/assign/scope decisions for canonical records. |

**Removal condition (R1.5):** each branch is retained only while
`applications` rows with **null canonical IDs** (`canonical_program_id` /
`intake_ref_id` / `institution_id`) still exist — these are the legacy/historical
applications created before the multi-tenant conversion. The branches become
removable once a backfill sets canonical IDs on all remaining legacy rows and a
verification query confirms zero null-canonical-ID `applications` rows on
production (the same count captured in the Production_Cutover evidence block,
R3.7/R3.9). When that count reaches zero, drop the legacy-string predicate from
each module (keeping the canonical-ID path), delete the corresponding
`_ALLOWED_PREDICATES` entries, and confirm the drift guard still passes.

**Legacy document-value fallback (student-journey-repair R4-c).** `apps/common/storage.py:_key_from_persisted_value` keeps resolving pre-task-3.13 `file_url` values (presigned URLs, bucket URLs, legacy-provider URLs). Removal condition: no `application_documents` row without `storage_key` remains (a P0-ops count).

### Capacity policy: advisory until enrollment (R15.3, R15.4)

Spec: `.kiro/specs/multi-tenant-beanola-remediation/` (R15). The authoritative
decision for how capacity interacts with assignment and seats:

| Stage | Behaviour | Source of truth |
|-------|-----------|-----------------|
| Application creation / assignment | **Reserves no seat.** Capacity is *advisory*: `OfferingAssignmentService._has_capacity` excludes a candidate `ProgramIntake` whose `current_enrollment >= capacity` (where `capacity = program_intake.max_capacity or intake.max_capacity`) at assignment time only. No row is locked and no counter is incremented during assignment. | `backend/apps/catalog/services.py:OfferingAssignmentService._has_capacity` |
| Submission | Re-runs assignment against the locked application snapshot and atomically increments the intake/program-intake `current_enrollment` (`F()` expression) under the application's `select_for_update()` lock. A stale/full offering surfaces as recoverable 409 (`OFFERING_NO_LONGER_AVAILABLE` / `OFFERING_CAPACITY_FULL`). | `backend/apps/applications/services.py:submit_application` → `IntakeEnforcer.increment_enrollment` |
| Enrollment confirmation | The committed seat is finalised: `EnrollmentService.confirm_enrollment` re-validates and transitions to `enrolled` under `Application.objects.select_for_update()`. | `backend/apps/applications/enrollment_service.py:EnrollmentService.confirm_enrollment` |

**Decision rationale (R15.4):** the reserve-at-create alternative is rejected
for V1 because it would require holding a lock across the multi-step wizard and
would strand seats on abandoned drafts. Capacity therefore stays advisory at
assignment time and is committed under a lock at the submission/enrollment
stages, which prevents capacity races without blocking draft authoring.

### Document profiles, official-document lifecycle, and tenant templates (R8, R14, R16)

Spec: `.kiro/specs/multi-tenant-beanola-remediation/`. These concepts extend
the Multi-Tenant truth map registered above. Each names the single authoritative
backend source plus its consumers; the "Frontend mirror / drift guard" column
records the guard backing the concept (or states it is backend-only).

| Concept | Source of truth | Consumers | Frontend mirror / drift guard |
|---------|-----------------|-----------|-------------------------------|
| Institution document profile | `backend/apps/catalog/models.py:InstitutionDocumentProfile` (table `institution_document_profiles`, migration `backend/scripts/2026_06_08_03_institution_document_profiles.sql`, `managed=False`) resolved most-specific-first by `backend/apps/catalog/services.py:InstitutionDocumentProfileService.resolve` | official-document render context (`backend/apps/applications/tasks/pdf/render_context.py`); `pdf_generation._attach_profile_provenance` folds `profile_id`+`profile_version` into the fingerprint | Backend-only config (no frontend data mirror). The student/admin document UI that consumes the rendered PDF is drift-guarded by `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` (R18.1, no client-only official PDFs); brand safety of resolved content is covered by the brand drift guard (`backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`). |
| Official-document current-version / fingerprint lifecycle | `backend/apps/applications/tasks/pdf_generation.py:_compute_document_fingerprint` (deterministic SHA-256 over render inputs, R6.1), `_current_official_version` (latest non-deleted `system_generated` doc), and the stored fingerprint at `verification_notes.official_document.fingerprint` (read by `_stored_fingerprint`) | `_generate_official_document_task` reuses the current version on an unchanged fingerprint and creates a new `ApplicationDocument` only on change (R6.3/R6.4); never mutates prior documents | Frontend mirror = student/admin document UI reflecting backend `Queued`/`Generating`/`Ready`/`Failed` status and downloading the stored official record — drift-guarded by `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` (R18.1). Dedup invariant (one persisted record per fingerprint) drift-guarded by `backend/tests/unit/test_official_document_dedup_guard.py` (R18.2). |
| Tenant-aware communication templates | `backend/apps/common/models.py:CommunicationTemplate` (`institution_id` + `version` columns added by `backend/scripts/2026_06_08_04_communication_templates_tenant.sql`, `managed=False`); tenant-aware resolution in `backend/apps/common/communication_service.py:_resolve_template` (active institution-specific highest version → active Beanola platform highest version → safe Beanola default, R14.1/R14.4/R14.5) | `CommunicationService.render_template`/`send`; template context derives brand/contact/portal from the resolved institution, never the hard-coded `apply.mihas.edu.zm` (R14.3/R14.8) | Backend-only (no frontend mirror — no admissions frontend module references `communication_templates`/`template_key`); no frontend drift guard required. Brand safety of rendered content is enforced by the backend brand drift guard `backend/tests/unit/test_brand_drift_guard.py`. |
| Capacity advisory until enrollment | See the "Capacity policy: advisory until enrollment (R15.3, R15.4)" subsection above (registered by task 31.2) | `OfferingAssignmentService._has_capacity`, `IntakeEnforcer.increment_enrollment`, `EnrollmentService.confirm_enrollment` | Backend-only decision; no frontend mirror. Recoverable assignment failure surfaces via the canonical `NO_ELIGIBLE_OFFERING` error code (already error-code drift-guarded). |

**Recoverable assignment failure (R15.5):** when no eligible offering exists,
`OfferingAssignmentService.assign` raises
`OfferingAssignmentError(code="NO_ELIGIBLE_OFFERING")`. The program-first wizard
checkpoint (`GET /api/v1/catalog/assignment-preview/`) maps this to an HTTP
**409** recoverable envelope `{"success": false, "code": "NO_ELIGIBLE_OFFERING",
"guidance": ...}` — matching the canonical `NO_ELIGIBLE_OFFERING` (409) entry in
`backend/apps/common/error_codes.py` — so the student gets a next step (choose
another intake, join the interest list, contact admissions) rather than a
dead-end.

## Backend Module Decomposition

The following original modules are now thin re-export shims; the real
implementations live in per-workflow submodules:

| Original (re-export shim) | Submodules |
|--------------------------|------------|
| `backend/apps/applications/admin_views.py` | `admin_review_views.py`, `admin_assignment_views.py`, `admin_export_views.py`, `admin_bulk_views.py`, `admin_amendment_views.py` |
| `backend/apps/applications/student_views.py` | `student_draft_views.py`, `student_submission_views.py`, `student_amendment_views.py`, `student_withdrawal_views.py`, `student_document_views.py` |
| `backend/apps/documents/views.py` | `mobile_money_views.py`, `payment_widget_views.py`, `payment_admin_views.py`, `payment_query_views.py`, `lenco_webhook_views.py`, `document_storage_views.py` |
| `backend/apps/accounts/views.py` | `auth_views.py`, `password_views.py`, `profile_views.py` |
| `backend/apps/accounts/admin_views.py` | `admin_user_views.py`, `admin_settings_views.py`, `admin_audit_views.py` |

`backend/apps/documents/payment_service.py` (104 KB) is intentionally NOT
decomposed in this program — it ships in a separate spec because of its
critical-path nature.

## Zambian MSISDN normalisation (student-journey-repair R8-b)

A mirrored concept: the same input must normalise to the same `+260XXXXXXXXX`
(or be refused) on both sides.

| Role | Location |
|---|---|
| Source of truth | `backend/apps/common/validators.py:normalize_zambian_msisdn` (raises `ValueError("INVALID_PHONE_FORMAT")`) |
| Payment alias | `backend/apps/documents/payment_helpers.py:_normalize_phone_e164 = normalize_zambian_msisdn` (one implementation; mobile-money behaviour byte-for-byte unchanged) |
| Registration entry point | `validate_zambian_phone` (backend) and `registrationPhoneSchema` (frontend). A registration-only pre-check: an input starting with `+` must be `+260` plus exactly nine digits, so `+260` plus six digits is refused and never stored as `+260260...` |
| Frontend mirror | `apps/admissions/src/lib/zambianMsisdn.ts:normalizeZambianMsisdn` and `zambianMsisdnSchema` |
| Messages | Phone and NRC validation messages carry no submitted value |
| Drift guard | `apps/admissions/tests/unit/__fixtures__/zambianMsisdnVectors.json`, read by `apps/admissions/tests/unit/zambianMsisdnVectors.test.ts` and `backend/tests/unit/test_zambian_msisdn_vectors.py` |

## Drift Guard Inventory

CI-blocking tests that fail when canonical truth diverges:

- `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts`
- `apps/admissions/tests/unit/uploadPathSingleSource.test.ts` (one upload transport, SJR task 3.7)
- `apps/admissions/tests/unit/zambianMsisdnVectors.test.ts` + `backend/tests/unit/test_zambian_msisdn_vectors.py` (shared MSISDN vectors in `__fixtures__/zambianMsisdnVectors.json`; the registration-refused list runs through `validate_zambian_phone` and `registrationPhoneSchema`; SJR task 3.27)
- `apps/admissions/tests/unit/sjrSessionRestore.test.tsx` (route guards make one session-restore attempt, then redirect; SJR task 3.26) + `apps/admissions/tests/unit/sjrSignUpPhoneErrors.test.tsx` (a server phone error lands on the phone field and the banner never echoes it; SJR task 3.27) + `apps/admissions/tests/unit/sjrBuildBadge.test.tsx` (the diagnostics badge and its wrappers render on the development server only; SJR task 3.29)
- `backend/tests/unit/test_no_persisted_signed_urls_sjr.py` (no document writer persists a presigned URL; SJR task 3.13) + `backend/tests/unit/test_document_key_resolution_sjr.py` (key resolution rules; SJR task 3.13)
- `backend/tests/unit/test_storage_settings_contract.py` + `backend/tests/unit/test_startup_env_validation.py` + `backend/tests/unit/test_documented_env_vars_are_read.py` (storage settings, production startup refusal of an empty `S3_*`, and every documented environment variable has a reader; SJR tasks 3.1-3.4)
- `backend/tests/unit/test_sjr_client_ip_trust.py` + `backend/tests/unit/test_sjr_ratelimit_metric.py` (trusted-proxy client IP and the `ratelimit.limited` counter; SJR task 3.9) + `backend/tests/unit/test_test_database_host_guard.py` (the test database host guard; SJR task 2.1)
- `apps/admissions/tests/unit/documentOpenGrammar.test.ts` (the document opener's query grammar round-trips; SJR task 3.17)
- `backend/tests/unit/test_journey_gate_configuration_sjr.py` (the journey gate's switches stay switched: limiter off by default and on with `HARNESS_RATELIMIT_ENABLE`, the four gate values, the stage order of `harness journey-gate`, evidence never under `docs/v2-evidence`, the workflow has no `paths:` filter, no `continue-on-error`, only already-used actions, and its relevance step reports success for unrelated changes; SJR tasks 4.1-4.5) + `apps/admissions/tests/unit/journeyGateGuards.test.ts` (the strict status guard, the status-aware defaults, and the scope table copied from `RateLimitMiddleware.SCOPE_LIMITS`; SJR task 4.2)
- `backend/tests/unit/test_approval_payment_gate_drift_sjr.py` (the Approve gate mirrors the backend payment gate; strict marker until SJR task 5.6)
- `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts`
- `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts`
- `apps/admissions/tests/unit/rolesBackendMirror.test.ts`
- `apps/admissions/tests/unit/sanitizeInputCanonical.test.ts`
- `apps/admissions/tests/unit/wizardBasicKycMobileAttributes.test.tsx`
- `apps/admissions/tests/unit/paymentRecoveryStoreMigration.test.ts`
- `apps/admissions/tests/unit/useWizardNavigation.test.tsx`
- `apps/admissions/tests/unit/paymentErrorCodes.test.ts` (existing)
- `apps/admissions/tests/unit/subjectCatalogDrift.test.ts` (canonical subject catalogue + alias mirror; fixture `tests/unit/__fixtures__/subjectCatalogBackendMirror.ts`) + `backend/tests/unit/test_subject_catalog_migration_7_1.py` (SQL ↔ Python catalogue no-drift)
- `apps/admissions/tests/unit/requiredDocumentsDrift.test.ts` (required-document upload policy + stable rejection codes; fixture `tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts`) + `backend/tests/unit/test_required_documents_contract.py` (policy self-consistency: every advertised MIME type survives the magic-byte check, ceiling matches the upload command)
- `backend/tests/property/test_lifecycle_canonical.py`
- `backend/tests/property/test_schema_drift_strict.py`
- `backend/tests/unit/test_error_codes_canonical.py`
- `backend/tests/unit/test_payment_status_canonical.py`
- `backend/tests/unit/test_payment_force_approved_propagation.py`
- `backend/tests/unit/test_legacy_columns_no_writes.py`
- `backend/tests/unit/test_check_production_state.py`
- `backend/tests/unit/test_prod_settings_required_flags.py`
- `backend/tests/unit/test_submission_gates.py`
- `backend/tests/unit/test_withdrawal_eligibility.py`
- `backend/tests/integration/test_system_actor_transitions.py`
- `backend/tests/unit/test_canonical_tenant_drift_guard.py`
- `backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`
- `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts`
- `backend/tests/unit/test_official_document_dedup_guard.py`
- `backend/tests/unit/test_scope_drift_guard.py` + `backend/tests/unit/test_unscoped_endpoint_guard.py`
- `backend/tests/unit/test_migration_drift_guard.py`
- `apps/admissions/tests/unit/tenantNav.test.ts` (pins `tenant.profile.read`; enterprise-tenant-authority)
- `backend/tests/property/test_capability_endpoint_shape.py` (Property 2 — capability catalogue exposed) + `apps/admissions/tests/property/capabilityDerivation.property.test.ts` (Property 21 — frontend capability derivation)
- `backend/tests/property/test_domain_status_machine.py` (Property 11) + `backend/tests/property/test_domain_resolution_fail_closed.py` (Property 14)
- `backend/tests/unit/test_client_money_authority_scan_8_1.py` (runs `backend/scripts/scan_client_money_authority.py`: no client fee arithmetic, no hardcoded application-fee claim, no invented default amount on a payment surface, no client provider-network inference, no second client fee surface, no server default fee, no display-name fee lookup — task 8.1, STU-08/DATA-05)
- `backend/tests/unit/test_fee_quote_contract_8_1.py` + `backend/tests/unit/test_fee_quote_endpoint_8_1.py` (quote amount authority, expiry, signature/status, configuration binding, and "an expired or redeemed quote cannot fund a payment")
- `backend/tests/unit/test_payment_single_path_8_2.py` (one payment path: the promoted outcome table, plus the guard that no flag selects between two payment implementations and no retired duplicate symbol returns — task 8.2)
- `backend/tests/unit/test_payment_phase_8_2.py` (payment phase derivation + serializer contract, **and the frontend mirror guards that parse `apps/admissions/src/lib/paymentStatus.ts` so a `PaymentPhase` or wait-budget change on either side fails**) + `apps/admissions/tests/unit/paymentPhaseUiStates.test.ts` (task 8.2, STU-09)
- `backend/tests/unit/test_payment_idempotence_8_2.py` (replay convergence for initialization, callback, reconciliation, and the `applications.payment_status` projection — no double-charge, no double-credit, no flapping; task 8.2, R12.5)
- `backend/tests/unit/test_user_directory_9_3.py` (the user directory's page-2+, field-contract, scope-before-lookup, import-rollback, bulk-command, and audited-export claims, incl. every aggregate against an independent raw-SQL count — task 9.3, ADM-03/ADM-04/AUTH-04)
- `apps/admissions/tests/unit/userDirectoryServerOwned.test.tsx` (**parses `backend/apps/accounts/user_directory_service.py` and `permissions.py`**, so the registered parameter set, the sort keys, the role vocabulary, and the bulk confirmation-token construction cannot drift between the two sides; plus a source scan asserting the page derives no number of its own — task 9.3)
- `backend/tests/unit/test_review_workspace_9_4.py` (one detail read, the versioned-command matrix, capability-derived authority, cross-tenant isolation on the detail surface, and the one export path — task 9.4, AUTH-01/AUTH-02/AUTH-03/API-02) + `apps/admissions/tests/unit/reviewWorkspaceServerOwned.test.tsx`
- `backend/tests/unit/test_tenant_audit_amendment_scope_9_5.py` (the tenant audit feed's capability gating and cross-tenant masking, the server-owned filters/facets, the audited page-independent export, the tenant-scoped amendment recipient set, and the locked amendment review transition. **Parses the audit service, the audit view, the recipient resolver and the amendment service with `ast`** — not with grep — so a role comparison or a `role`-keyed query cannot return while the docstrings still quote the code they replaced; and asserts `AMENDMENT_RECIPIENT_CAPABILITY` equals task 9.4's `COMMAND_CAPABILITIES["review_amendment"]`, so who is notified cannot drift from who may act — task 9.5, ADM-05/AUTH-06)
- `apps/admissions/tests/unit/tenantAuditServerOwned.test.tsx` (the audit panel sends the **selected institution**, never the generic feed; the counts are the server's facets and survive a page turn; the category and its definition come from the backend; the export follows `can_export` **and** the capability set and drops the paging — task 9.5, ADM-05)
- `backend/tests/unit/test_notification_preferences_10_1.py` (the notification-preference schema is derived from what the platform can send, every refused field is refused with its own code, a mandatory message ignores every stored setting, an audience decides a message class's channel set **before** any preference, every producer goes through the one delivery gate, the history publishes no address or provider text, and retry is owner-scoped/state-guarded/bounded/durable/audited. **Reads `apps/admissions/src/lib/notificationPreferences.ts` and asserts the mirror pins the backend's `SCHEMA_VERSION` and `REJECTION_CODES` in order, has a tone for every published delivery state, and names no channel or category** — after stripping TS comments, because the mirror deliberately documents the retired field names STU-14 found there — task 10.1, STU-14) + `apps/admissions/tests/unit/notificationPreferenceSchema.test.ts`

- `backend/tests/unit/test_condition_evidence_amendment_history_10_2.py` (a condition follows design §11.2's machine and cannot be decided twice; condition evidence is an immutable version under a **per-condition** `document_type`, so the database's one-current index means one current evidence version per condition and a replacement supersedes rather than overwrites; `changes_required` and `waived` cannot be issued without a reason; the student write is owner-only and a cross-tenant condition id is an indistinguishable 404; the amendment list uses the registered envelope and publishes no reviewer; a second pending request for one field is a 409 naming the request in flight; every condition message goes through 10.1's gate with a published category; a reminder is idempotent per window. **Parses `condition_evidence_service.py` and `condition_views.py` with `ast` and asserts no role string is compared, the views hold no lifecycle logic, the evidence write reuses 7.3's ordering, and no 10.2 SQL script exists under `backend/scripts/`** — task 10.2, STU-16/STU-17) + `apps/admissions/tests/unit/conditionEvidenceAmendmentHistory.test.tsx`
- `backend/tests/unit/test_enrollment_readiness_10_3.py` (enrollment readiness is one server-authored value that the list read, the detail read and the confirmation command all consume; every non-terminal condition state blocks a conditional offer — including 10.2's `evidence_submitted` and `changes_required`, which the pre-10.3 `pending`/`expired` pair treated as satisfied; the countdown is the server's and a spent deadline is reported negative rather than clamped; N simultaneous confirmations produce one status-history row and N successes; a repeated confirmation is idempotent; capacity asks *"is there room for me"*; a same-name offering at another tenant is not a duplicate enrollment; the list read's query cost is constant in the number of rows; the readiness is read-only on the serializer and absent — never empty — when it cannot be evaluated. **Parses `enrollment_service.py` with `ast`** and asserts no role string is compared, the evaluator is called **inside** `transaction.atomic()`, the `ProgramIntake` capacity row is locked **before** the application row (task 5.3's order), there is no second submission-readiness evaluator, there is no second condition-state vocabulary (docstring-aware, because the module documents the query it replaces), `SEAT_STATUSES` is not redefined, and no 10.3 SQL script exists under `backend/scripts/` — task 10.3, STU-15/DATA-03) + `apps/admissions/tests/unit/enrollmentReadiness.test.tsx` + `apps/admissions/tests/property/enrollmentReadiness.property.test.ts`
- `backend/tests/unit/test_official_document_durability_10_4.py` (a `202` is answered only after a durable `outbox_events` job commits, and a commit failure is `503 GENERATION_UNAVAILABLE` rather than a queue nothing recorded; a published `queued` always has a committed row behind it and `not_requested` never does; a broker outage still records the request and the bounded beat sweep re-dispatches it, including a `dispatched` job whose worker never answered; **every exit path of the render task settles its job**, so no `pending` row is abandoned; a terminal failure is published with a retry the *server* authorises, and a tenant setup failure is not the student's to retry; retry is the same POST, reopening the same row with its attempt history; a lawful issued artifact stays readable across all five terminal statuses while a **new** artifact is still the same masked 404, and a student upload of the same type is not reachable through it; every document type is emailable exactly once per issued artifact per recipient, only to the owner's own address, through task 10.1's one delivery gate; the school's own `tenant.profile.read` holders get the setup work item and another tenant's staff do not. **Parses `official_document_jobs.py` and `official_document_views.py` with `ast`** and asserts no role string is compared, the dispatch happens **after** the commit, the published status vocabulary is not restated anywhere else, the setup-required code set is shared rather than duplicated, the views hold no render logic, and no 10.4 SQL script exists under `backend/scripts/` — task 10.4, STU-18/API-04) + `apps/admissions/tests/unit/officialDocumentDurability.test.tsx`
- `backend/tests/unit/test_public_tracking_secret_10_5.py` (a sequential application number and a legacy `TRK-` code open nothing and **never reach the database**, so the refusal cannot be an existence oracle; an unknown selector, a revoked secret, a wrong verifier and another tenant's token on a school host return the **same** status, code and message; the plaintext exists only in the issue response and only its SHA-256 is stored, compared with `compare_digest`; issuing rotates and a revoked secret is a masked 404; a resolved white-label host reveals only its own tenant's application and a non-active domain fails closed to neutral; the failed-attempt budget is charged only by lookups that resolved nothing, is **not** charged by a legacy-identifier refusal, does not extend its own lockout, cannot be reset by a forwarded header, and — the invariant a browser journey caught — **still answers a correct token once spent**; the published field set is exactly seven and carries no applicant value; the share URL's only query parameter is the token; issuing is owner-only and staff cannot mint the applicant's link; the migration is additive, nullable, guarded, partially unique, and leaves a legacy row with four NULLs fully readable. **Parses `tracking_secret.py` and `public_views.py` with `ast`** and asserts there is one secret pattern, the view holds no credential comparison of its own, no role string is compared in the tracking service, the endpoint is still classified `public_tracking_minimized`, and the refusal messages are module constants — task 10.5, STU-22/TEN-10) + `backend/tests/property/test_public_tracking_properties_10_5.py` (17 Hypothesis invariants: classification is total, pure and deterministic; `parse` inverts `build`; a single-character change never verifies; no issued code contains an ambiguous character; normalisation is idempotent) + `apps/admissions/tests/unit/publicTrackingSecret.test.tsx` (**reads `backend/apps/applications/tracking_secret.py`** for `SELECTOR_LENGTH` / `VERIFIER_LENGTH` / `ALPHABET`, and asserts the declared `PublicTrackingStatus` field set is the serializer's and no longer declares `feedback_summary` / `admin_feedback` / `admin_feedback_date` / `public_tracking_code` / `created_at`) + `apps/admissions/tests/property/publicTrackingSecret.property.test.ts` (16 fast-check invariants)

## How To Add A New Domain Concept

1. Decide where the source of truth lives. Backend if it's authoritative business logic; frontend lib if it's purely UI.
2. If a frontend mirror is needed, add a fixture file under `__fixtures__/` and a drift-guard test.
3. Register the new concept in this file with a row in the relevant section.
4. Document the concept's contract with an ADR if it is non-trivial.
5. Add tests for both the source of truth and the drift guard.
