# API Contract Inventory — Beanola Admissions

> **Spec:** `.kiro/specs/beanola-production-readiness/` — Task 8.2, Component 4.
> **Validates:** Requirements **4.2** (every admissions frontend service method
> mapped to a backend endpoint across every named surface), **4.3** (authenticated
> responses use the `API_Envelope`; list responses use the paginated
> `{page, pageSize, totalCount, results}` shape inside `data`), **4.4** (for each
> endpoint: envelope shape, error code, pagination shape, auth class, scope filter,
> serializer fields, frontend type, UI consumer — and **no UI depends on an
> undocumented field**).
>
> **Verification basis:** every row was verified on the audit date against:
> - the admissions frontend service modules under
>   `apps/admissions/src/services/` (`auth.ts`, `applications.ts`, `catalog.ts`,
>   `documents.ts`, `officialDocuments.ts`, `payments.ts`, `interviews.ts`,
>   `notifications.ts`, `communications.ts`, `sessionService.ts`, and
>   `admin/{dashboard,users,audit,tenants}.ts`);
> - the backend URL configs (`backend/config/urls.py` + each app `urls.py`) and view
>   bodies;
> - the generated Beanola-branded OpenAPI schema at `/tmp/openapi.yaml`
>   (title `Beanola Platform APIs`, **196** documented `/api/v1/` operations),
>   regenerated with
>   `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py spectacular --file /tmp/openapi.yaml`.
>
> **Companion docs:** scope/auth classification per endpoint is the
> `docs/audits/scope-endpoint-inventory.md` artifact (Task 11.1, R5); document
> generation paths are `docs/audits/document-type-audit.md` (Task 13.1, R6). This
> inventory cross-references both rather than restating them.

---

## 1. Conventions verified once (apply to every row below)

### 1.1 Envelope shape (R4.3)

All authenticated JSON responses use the **`API_Envelope`** produced by
`backend/apps/common/renderers.py:EnvelopeRenderer`:

```jsonc
// success
{ "success": true, "data": <payload> }
// error (>= 400)
{ "success": false, "error": "<message>", "code": "<ERROR_CODE>" }
```

The frontend `apiClient.request` (`apps/admissions/src/services/client.ts` →
`httpClient.ts:unwrapApiResponse`) **unwraps the envelope** and returns the inner
`data` to every service method. Therefore every "Frontend type" column below
describes the **post-unwrap** shape the service sees, not the wire envelope.
Non-JSON responses (CSV/file/raw bodies) skip unwrapping by content-type.

### 1.2 Pagination shape (R4.3)

Paginated list endpoints use
`backend/apps/common/pagination.py:StandardPagination`, which nests the page block
**inside `data`**:

```jsonc
{ "success": true,
  "data": { "page": 1, "pageSize": 20, "totalCount": 137, "results": [ … ] } }
```

`page_size_query_param = "pageSize"`, `page_query_param = "page"`, default
`page_size = 20`, `max_page_size = 500`. After unwrap the service receives
`{ page, pageSize, totalCount, results }`. Several frontend normalizers tolerate
both this canonical shape **and** legacy `{count, results}` / bare-array shapes
defensively (see the per-service notes) — this is forward-compatible normalization,
not a dependency on an undocumented field.

### 1.3 Error codes (R4.4, R4.6)

Errors carry a stable `code` plus a human `error` message. Families observed:

| Family | Example codes | Source |
|--------|---------------|--------|
| Auth | `NO_REFRESH_TOKEN`, `TOKEN_EXPIRED`, `AUTHENTICATION_REQUIRED` | `accounts` auth views |
| CSRF | `CSRF_INVALID`, `CSRF_MISSING`, `CSRF_VALIDATION_FAILED` | `JWTCookieAuthentication` (frontend retries once) |
| Not found / scope mask | HTTP 404 `Not_Found_Envelope` (byte-identical for missing vs out-of-scope) | `AccessScopeService` masking |
| Validation | `INVALID_FORMAT`, field errors under `details` / `fieldErrors` | DRF serializers |
| Payment (stable catalogue) | `PAYMENT_CONFIRMED`, `PAYMENT_PENDING`, `PROVIDER_UNAVAILABLE`, … | `payment_error_codes.py` ↔ `@/lib/paymentErrorCodes.ts` |
| Generic fallback | `UNKNOWN_ERROR` | `EnvelopeRenderer` |

The client maps DRF `details` → `fieldErrors` for form surfaces and never surfaces a
raw Django/DRF traceback to a student (R4.6); deeper error-normalization validation
is Task 8.3.

### 1.4 Auth + scope columns

"Auth class" / "Scope filter" columns summarise the
`docs/audits/scope-endpoint-inventory.md` classification. Scope authority is
`backend/apps/catalog/services.py:AccessScopeService`. The 12 partially-scoped
staff endpoints (GAP-1…GAP-12) are findings in that doc; they are noted here where
a frontend service consumes them but are **not re-triaged** in this task.

---

## 2. Auth & profile — `services/auth.ts`, `services/sessionService.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `authService.register` | `POST /auth/register/` | public (`AllowAny`) | n/a | envelope, no pagination | `{ user, … }` (RegisterSerializer) | untyped (`unknown`) | `SignUpPage` | validation `details`; rate-limited |
| `authService.login` | `POST /auth/login/` | public | n/a | envelope; sets `X-CSRF-Token` | `{ user, … }` | untyped | `SignInPage` | `INVALID_CREDENTIALS`; rate-limited |
| `authService.logout` | `POST /auth/logout/` | student-owned | own session | envelope | `{ message }` | untyped | header/menu | — |
| `authService.session` | `GET /auth/session/[?refresh_csrf=1]` | student-owned | own | envelope; sets CSRF | `{ user, authenticated, … }` | untyped | auth bootstrap | `AUTHENTICATION_REQUIRED` |
| `authService.refresh` | `POST /auth/refresh/` | public (cookie) | own | envelope | `{ access?, … }` | untyped | auth interceptor | `NO_REFRESH_TOKEN`, `TOKEN_EXPIRED` |
| `authService.profile` | `GET /auth/profile/` | student-owned | `request.user` | envelope | ProfileSerializer fields | untyped | `Settings`, profile | — |
| `authService.updateProfile` | `PATCH /auth/profile/` | student-owned | `request.user` | envelope | ProfileSerializer fields | untyped | `Settings` | field `details` |
| `authService.passwordReset` | `POST /auth/password-reset/` | public | n/a | envelope | `{ message }` | untyped | `ForgotPasswordPage` | rate-limited |
| `authService.passwordResetConfirm` | `POST /auth/password-reset/confirm/` | public | token-bound | envelope | `{ message }` | untyped | `ResetPasswordPage` | token invalid/expired |
| `listActiveSessions` | `GET /sessions/` | student-owned | `user_id == request.user` | envelope; **list** (array under `data`, not paginated) | `DeviceSession[]` (`id, device_info, ip_address, last_activity, created_at, is_current`) | `DeviceSession`, `ListSessionsResult` | `Settings` → sessions | `AUTHENTICATION_REQUIRED` |
| `terminateSessionById` | `POST /sessions/{id}/revoke/` | student-owned | own session | envelope | `{ message }` | `TerminateSessionResult` | `Settings` | — |
| `terminateAllOtherSessions` | `POST /sessions/revoke-all/` | student-owned | own sessions | envelope | `{ message }` (count parsed from message) | `TerminateSessionsResult` | `Settings` | — |

**Notes.** Auth `data` payloads are consumed as `unknown` by the service layer and
narrowed downstream by the auth store — no service-level field dependency to flag.
`sessionService` normalizes `last_activity || last_active || created_at`: `last_active`
is a tolerated **legacy alias**, not a current backend field (documented tolerance,
not an undocumented-field dependency).

---

## 3. Catalog / context / canonical programs — `services/catalog.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `catalogService.getContext` | `GET /catalog/context/` | public | host brand | envelope | `{ portal_type, institution_id, institution_code, brand{name,owner,…} }` | `CatalogContext` | brand provider; whole app | falls back to Beanola-generic on error |
| `catalogService.getPrograms` / `programService.list` | `GET /catalog/programs/[?…]` | public GET / `IsAdmin` write | catalog config | envelope; paginated **or** `{programs}`/array (normalized) | RawProgram fields | `Program` | wizard, admin catalog | — |
| `catalogService.getProgramsForIntake` | `GET /catalog/programs/?intake={id}` | public | — | as above | RawProgram | `Program` | wizard intake step | — |
| `catalogService.getCanonicalPrograms` | `GET /catalog/canonical-programs/` | public | shared | envelope; normalized collection | RawProgram (canonical) | `Program` | wizard program-first step | — |
| `catalogService.getAssignmentPreview` | `GET /catalog/assignment-preview/?program_id&intake_id[&nationality&country&institution]` | public | read-only preview | envelope (single object) | `{ program_id, intake_id, program_offering_id, institution_id, assigned_school{…}, program_name, intake_name, fee{amount,currency,residency_category,source}\|null, required_documents[], contact{} }` | `AssignmentPreview` | wizard assignment step | throws on non-2xx (recoverable path) |
| `catalogService.getIntakes` / `intakeService.list` | `GET /catalog/intakes/` | public GET / `IsAdmin` write | catalog config | envelope; normalized | RawIntake | `Intake` | wizard, admin | — |
| `catalogService.getSubjects` | `GET /catalog/subjects/` | public | reference | envelope; normalized | RawSubject | `Subject` | grades step | — |
| `catalogService.getInstitutions` / `institutionService.list` | `GET /catalog/institutions/` | public GET / `IsAdmin` write | brand list | envelope; normalized | RawInstitution | `Institution` | admin catalog | — |
| `programService.create` | `POST /catalog/programs/` | `IsAdmin` | catalog config | envelope | `{program}` or program | `ProgramMutationResponse` | admin catalog | field `details` |
| `programService.update` | `PATCH /catalog/programs/{id}/` | `IsAdmin` | config | envelope | program | `ProgramMutationResponse` | admin catalog | — |
| `programService.delete` | `DELETE /catalog/programs/{id}/` | `IsAdmin` | config | envelope/empty | — | `void` | admin catalog | — |
| `intakeService.create` | `POST /catalog/intakes/` | `IsAdmin` | config | envelope | intake | `IntakeMutationResponse` | admin catalog | — |
| `intakeService.update` | `PATCH /catalog/intakes/{id}/` | `IsAdmin` | config | envelope | intake | `IntakeMutationResponse` | admin catalog | — |
| `intakeService.delete` | `DELETE /catalog/intakes/{id}/` | `IsAdmin` | config | envelope/empty | — | `void` | admin catalog | — |
| `institutionService.create` | `POST /catalog/institutions/` | `IsAdmin` | config | envelope | institution | `InstitutionMutationResponse` | admin catalog | — |
| `institutionService.update` | `PATCH /catalog/institutions/{id}/` | `IsAdmin` | config | envelope | institution | `InstitutionMutationResponse` | admin catalog | — |
| `institutionService.delete` | `DELETE /catalog/institutions/{id}/` | `IsAdmin` | config | envelope/empty | — | `void` | admin catalog | — |

**Notes.** `catalog.ts` normalizers (`normalizeCollection`, `normalizeProgram`, …)
accept array / `{results}` / `{programs}` shapes and warn (not throw) on unexpected
shapes. They read only documented serializer fields; `duration_months → duration_years`
and `application_fee` coercion are client transforms over documented fields. **No
undocumented-field dependency.**

---

## 4. Applications — `services/applications.ts`, `services/communications.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `applicationService.list` | `GET /applications/[?…]` | student-owned / **staff-scoped** | `filter_applications` (admin) / `user_id` (student) | envelope; paginated → normalized to `{applications,totalCount,page,pageSize,stats?}` | Application fields + optional `stats` | `PaginatedApplicationsResponse` | dashboard, admin list | 429 surfaced |
| `applicationService.getById` | `GET /applications/{id}/details/` (+ optional `/documents/`,`/grades/`,`/summary/`,`/interviews/`) | student-owned / staff | owner / `filter_applications().exists()` mask | envelope (single) | Application + merged `interview`, `documents?`, `grades?`, `statusHistory?` | `ApplicationDetailResponse` | wizard, status, admin detail | 404 → null |
| `applicationService.create` | `POST /applications/` | student-owned | owner | envelope (single) | Application | `Application\|null` | wizard start | field `details` |
| `applicationService.update` | `PUT /applications/{id}/` | student-owned / staff | owner | envelope (single) | Application | `Application\|null` | wizard autosave | — |
| `applicationService.delete` | `DELETE /applications/{id}/` | student-owned | owner | envelope/empty | — | `{success}` | dashboard | 404 → idempotent success |
| `applicationService.submit` | `POST /applications/{id}/submit/` | student-owned | owner gate | envelope (single) | Application | `Application\|null` | wizard submit | submission-gate codes; `@idempotent` |
| `applicationService.updateStatus` | `POST /applications/{id}/review/` | **staff-scoped** | `filter_applications` | envelope | review result | `Application\|null` | admin review | force-gate |
| `applicationService.updatePaymentStatus` | `POST /applications/{id}/review/` | **staff-scoped** | `filter_applications` | envelope | review result | `Application\|null` | admin review | payment-gate |
| `applicationService.verifyDocument` | `POST /applications/{id}/verify-document/` | **staff-scoped** | `_get_scoped_application` | envelope | `{document, status}` | untyped | admin doc review | — |
| `applicationService.syncGrades` | (helper) `→ grades sync` | student-owned | owner | envelope | grades | via `connectionFix` | wizard grades | chunk-recovery |
| `applicationService.sendNotification` | `POST /notifications/` (after `GET /applications/{id}/`) | staff | resolves `user_id` | envelope | `{notification\|id}` | `{success}` | admin notify | recipient-resolution error |
| `applicationService.generateAcceptanceLetter` | `POST /applications/{id}/acceptance-letter/` | student/staff | owner/admin | envelope | `{ task_id, application_id, status }` | typed inline | admin/official-doc | see R6 audit |
| `applicationService.generateApplicationSlip` | `POST /applications/{id}/application-slip/` | student/staff | owner/admin | envelope | `{ task_id, application_id, status }` | typed inline | wizard success / admin | — |
| `applicationService.generateConditionalOffer` | `POST /applications/{id}/conditional-offer/` | student/staff | owner/admin | envelope | `{ task_id, application_id, status }` | typed inline | admin | — |
| `applicationService.generateFinanceReceipt` | `POST /applications/{id}/finance-receipt/` | student/staff | owner/admin | envelope | `{ task_id, application_id, status }` | typed inline | admin | — |
| `applicationService.generatePaymentReceipt` | `POST /applications/{id}/payment-receipt/` | student/staff | owner/admin | envelope | `{ task_id, application_id, status }` | typed inline | admin/payment | — |
| `applicationService.scheduleInterview` | `POST /applications/{id}/interviews/` | **staff-scoped** | admin (GAP-6) | envelope (single) | ApplicationInterview | `ApplicationInterview\|null` | admin interview | 48h-notice/conflict codes |
| `applicationService.rescheduleInterview` | `PUT /applications/{id}/interviews/` | **staff-scoped** | admin (GAP-6) | envelope (single) | ApplicationInterview | `ApplicationInterview\|null` | admin interview | — |
| `applicationService.cancelInterview` | `DELETE /applications/{id}/interviews/` | **staff-scoped** | admin (GAP-6) | envelope (single) | ApplicationInterview | `ApplicationInterview\|null` | admin interview | — |
| `applicationService.exportApplications` | `GET /applications/export/[?…]` | **staff-scoped** | `filter_applications` + PII redaction | envelope; paginated → normalized | Application[] (redacted for non-super-admin) | `{applications,page,limit,hasMore}` | admin export | — |
| `applicationService.track` | `GET /applications/track/?applicationNumber\|trackingCode` | **public-anonymous** | minimized public projection | envelope | minimized public fields (no PII) | untyped | public tracker | `INVALID_FORMAT` (400), descriptive 404 |
| `applicationService.bulkStatus` | `POST /applications/bulk-status/` | **staff-scoped** (GAP-1) | ⚠ not narrowed | envelope | batch result | untyped | admin bulk | SHA-256 `confirmation_token`; max 25 |
| `applicationService.saveDraft` | `POST /applications/draft/` | student-owned | owner | envelope | draft | untyped | wizard autosave | — |
| `applicationService.getDocuments` | `GET /applications/{id}/documents/` | student/staff | owner / mask | envelope; list | document rows | `unknown[]` | wizard, admin | — |
| `applicationService.getGrades` | `GET /applications/{id}/grades/` | student/staff (GAP-4) | owner / role | envelope; list | grade rows | `unknown[]` | wizard, admin | — |
| `applicationService.getSummary` | `GET /applications/{id}/summary/` | student/staff (GAP-4) | owner / role | envelope | `{application?, documents_count?, grades_count?, status_history?}` | `ApplicationSummaryResponse` | status, admin | — |
| `applicationService.confirmEnrollment` | `POST /applications/{id}/confirm-enrollment/` | student-owned | owner | envelope | result | untyped | status page | deadline codes |
| `applicationService.applyFeeWaiver` | `POST /applications/{id}/fee-waiver/` | **super-admin-only** | `IsSuperAdmin` | envelope | waiver | untyped | admin | — |
| `applicationService.withdraw` | `POST /applications/{id}/withdraw/` | student-owned | owner | envelope | result | untyped | status page | reason 10–500 chars |
| `applicationService.getWaitlistPosition` | `GET /applications/{id}/waitlist-position/` | student/staff (GAP-7) | owner / role | envelope | `{ position, total }` | typed inline | status page | — |
| `applicationService.getConditions` | `GET /applications/{id}/conditions/` | student/staff (GAP-7) | owner / role | envelope; list | `{id,description,condition_type,deadline,status}[]` | typed inline | status page | — |
| `applicationService.submitAmendment` | `POST /applications/{id}/amendments/` | student-owned | owner | envelope | amendment | untyped | status page | max 3 pending |
| `applicationService.assignReviewer` | `POST /applications/{id}/assign/` | **super-admin-only** | `IsSuperAdmin` | envelope | result | untyped | admin | — |
| `applicationService.autoAssign` | `POST /applications/auto-assign/` | **super-admin-only** | `IsSuperAdmin` | envelope | result | untyped | admin | — |
| `communicationsService.listHistory` | `GET /applications/history/[?user_id&page&pageSize]` | student / staff (GAP-3) | self / admin `?user_id=` | envelope; **paginated** | `TimelineEntry` (`id, application_id, application_number, old_status, new_status, notes, changed_by_name, created_at`) | `PaginatedResponse<TimelineEntry>` | timeline, admin | — |

**Notes.**
- `normalizePaginatedApplications` maps `results → applications` and tolerates
  legacy `applications`/`count`/`limit` keys and bare arrays — forward-compatible
  over documented fields.
- `normalizeStatusHistory` synthesizes an `id` and a `changed_by_profile` shim from
  the documented `changed_by`/`changed_by_name` fields when the backend omits a
  profile object — a defensive client shim, **not** a dependency on an undocumented
  backend field.
- The five `generate*` document methods are wired to the **POST** generation paths
  returning `{task_id, application_id, status}`. The R6 document audit governs
  whether official downloads use these vs `officialDocuments.ts`.

---

## 5. Student documents — `services/documents.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `documentService.upload` | `POST /documents/upload/` (multipart) | student-owned | `_get_authorized_document` family | envelope | document row | untyped | wizard upload | MIME/size validation |
| `documentService.extract` | `POST /documents/{id}/extract/` | student/staff | `_get_authorized_document` | envelope | `{task_id\|status}` | untyped | wizard OCR | — |
| `documentService.getSignedUrl` | `GET /documents/{id}/signed-url/` | student/staff | `_get_authorized_document` + expiry | envelope | `{ url }` | `{url}` | doc download | expiry enforced |
| `documentService.listByApplication` | `GET /applications/{id}/documents/` | student/staff | owner / mask | envelope; list | document rows | `unknown[]` | wizard, admin | — |
| `documentService.delete` | `DELETE /documents/{id}/delete/` | student/staff | `_get_authorized_document` + delete protection | envelope | result | untyped | wizard | delete-protection codes |

---

## 6. Official documents — `services/officialDocuments.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `generateOfficialDocument` | `POST /applications/{id}/official-documents/{type}/` | student/staff | `_get_authorized_application` → `filter_applications` + 404 mask | envelope (single) | `OfficialDocumentStatus` | `OfficialDocumentStatus` | wizard success, admin detail | failure → `status: 'failed'` |
| `listOfficialDocuments` | `GET /applications/{id}/official-documents/` | student/staff | as above | envelope; list (latest per type) | `OfficialDocumentStatus[]` | `OfficialDocumentStatus[]` | status, admin | — |
| `getOfficialDocument` | `GET /applications/{id}/official-documents/{type}/` | student/staff | as above | envelope (single) | `OfficialDocumentStatus` | `OfficialDocumentStatus` | status, admin | — |
| `downloadOfficialDocument` | `GET /applications/{id}/official-documents/{type}/` then browser download of `download_url` | student/staff | as above | envelope (single) | `OfficialDocumentStatus.download_url` | `void` | download buttons | throws unless `status==='ready'` |
| `emailOfficialDocument` | `POST /applications/{id}/email-slip/` (only `application_slip`) | student/staff | `filter_applications` | envelope | `{ queued_id }` | `void` | email-slip action | throws for non-slip types (no backend endpoint yet) |

**Documented `OfficialDocumentStatus` (mirrors backend `_build_envelope`):**
`document_id|null, document_type, status('ready'|'queued'|'failed'), download_url?,
generated_at|null, template_version|null, institution_id|null, task_id?`. The TS
interface matches the backend `data` field-for-field — **no undocumented field.**

**⚠ Contract gap (not an undocumented-field flag):** `emailOfficialDocument` only
supports `application_slip` because a generic per-type email endpoint does not yet
exist on the backend; the service throws a descriptive error for other types rather
than emailing a client render. Tracked as a follow-up backend endpoint, consistent
with the R6 audit.

---

## 7. Payments — `services/payments.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `initiatePayment` | `POST /payments/initiate/` (+ `idempotency-key`) | student-owned | owner; throttled; dev-bypass locked in prod | envelope | `PaymentInitiateData` (`payment_id, reference, amount, currency, status?, next_action?, lenco_public_key?, …`) | `PaymentInitiateData` | `PaymentStep` (card) | stable `PAYMENT_*` codes |
| `initiateMobileMoney` | `POST /payments/mobile-money/` (+ `idempotency-key`) | student-owned | owner; throttled | envelope | `PaymentInitiateData` (`operator?, masked_phone?`) | `PaymentInitiateData` | `PaymentStep` (mobile money, primary) | `PAYMENT_*`; MSISDN validation |
| `verifyPayment` | `POST /payments/{id}/verify/` | student/staff | owner / `filter_payments().exists()` mask | envelope | `PaymentInitiateData` (+ `data.code` stable) | `PaymentInitiateData` | payment polling | `PAYMENT_CONFIRMED\|PENDING`, `PROVIDER_UNAVAILABLE` |

**Notes.** The `PaymentStableCode` union and copy are shared with the backend
catalogue via `@/lib/paymentErrorCodes.ts` (drift-guarded), so the payment error
contract is mirror-tested. `next_action` is `PaymentNextAction` from
`@/lib/paymentNextActions.ts`. Other payment endpoints
(`/payments/`, `/payments/defer/`, `/payments/resolve-fee/`, `/payments/{id}/receipt/`,
`/payments/settlements/`, `/payments/risk-flags/`, `/payments/{id}/correct/`,
`/payments/webhook/lenco/`) are not called from `services/payments.ts`; `settlements`
is consumed by `admin/tenants.ts:listSettlements` (§10), and the rest are consumed by
wizard hooks (`useFeeResolver`, `usePaymentStatus`) and backend/admin flows outside
the audited `services/` modules — classified in `scope-endpoint-inventory.md` §7.

---

## 8. Interviews — `services/interviews.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `interviewsService.list` (no id) | `GET /applications/interviews/?mine=true` | student-owned | `user_id` | envelope; list (normalized from `data`/`interviews`/`results`) | `Interview[]` (`id, application_id, scheduled_at, mode, location, status, notes, program?, application_number?`) | `ListInterviewsResponse` | `Interview` page | — |
| `interviewsService.list(applicationId)` | `GET /applications/{id}/interviews/` | student-owned / staff | owner / admin | envelope; list | `Interview[]` | `ListInterviewsResponse` | application detail | — |
| `interviewsService.schedule` | `POST /applications/{id}/interviews/` | **staff-scoped** | admin (GAP-6) | envelope (single) | `Interview` | `ScheduleInterviewResponse` | admin interview | scheduling-rule codes |

**Notes.** `normalizeInterviewsResponse` defensively reads `data`, nested
`data.interviews`/`data.results`, or top-level `interviews`/`results` — this absorbs
both the unwrapped list and a not-yet-unwrapped envelope; all keys are documented
backend shapes. The canonical student list path is the single-query
`?mine=true` endpoint (per product contract). **No undocumented-field dependency.**

---

## 9. Notifications & communication — `services/notifications.ts`, `services/communications.ts`

| FE service method | Backend endpoint | Auth class | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer | Error codes |
|-------------------|------------------|------------|-------|-----------------------|--------------------------|---------------|-------------|-------------|
| `notificationService.list` | `GET /notifications/` | student-owned | `user_id` | envelope; list/paginated (normalized) | notification rows (`id, title, content\|message, type, read\|is_read, action_url?, created_at, read_at?`) | `StudentNotification[]` | `NotificationBell`, list | — |
| `communicationsService.listNotifications` | `GET /notifications/[?page&pageSize&type&is_read]` | student-owned | `user_id` | envelope; **paginated** | notification rows | `PaginatedResponse<Record>` | notifications page | — |
| `notificationService.send` | `POST /notifications/` | staff | serializer validates target `user_id` | envelope | `{ notification?, id?, duplicate? }` | `boolean` | admin notify | dedup by `idempotency_key` |
| `notificationService.sendNotification` | `POST /notifications/` | staff | as above | envelope | `{ notification\|id }` | `boolean` | admin/system | — |
| `notificationService.sendEmail` | `POST /email/send/` | staff | serializer recipients | envelope | `{ id? }` | `boolean` | admin email | — |
| `notificationService.getPreferences` | `GET /notifications/preferences/` | student-owned | own | envelope | preference fields | untyped | `Settings` | — |
| `notificationService.updatePreferences` | `PUT /notifications/preferences/` | student-owned | own | envelope | preference fields | untyped | `Settings` | — |
| `notificationService.markRead` | `PUT /notifications/{id}/read/` | student-owned | `pk + user_id` | envelope | result | untyped | bell/list | — |
| `notificationService.markAllRead` | `PUT /notifications/read-all/` | student-owned | own | envelope | result | untyped | bell/list | — |
| `notificationService.delete` | `DELETE /notifications/{id}/` | student-owned | `pk + user_id` | envelope | result | untyped | list | — |
| `communicationsService.listUserNotifications` | `GET /notifications/user/{id}/[?page&pageSize]` | **staff-scoped** (GAP-12) | admin; `user_id` (not membership-narrowed) | envelope; **paginated** | notification rows | `PaginatedResponse<Record>` | admin user history | — |

**Notes.** `normalizeNotificationsResponse` reads `data` / nested
`data.results|notifications` / top-level `results|notifications` and tolerates
`read` **or** `is_read` and `content` **or** `message` — both documented backend
field variants. `normalizeNotificationContent` only sanitizes display text. **No
undocumented-field dependency.**

---

## 10. Admin surfaces — `services/admin/{dashboard,users,audit,tenants}.ts`

### 10a. Dashboard — `admin/dashboard.ts`

| FE method | Endpoint | Auth | Scope | Envelope / pagination | Backend `data` fields consumed | Frontend type | UI consumer |
|-----------|----------|------|-------|-----------------------|-------------------------------|---------------|-------------|
| `adminDashboardService.getOverview[WithDiagnostics]` | `GET /admin/dashboard/` | **staff-scoped** | `filter_applications` + membership `institution_ids`; `no_school_access` signal | envelope (object) | `applications{total,by_status{…},today/this_week/this_month,today_activity}`, `users{total,active}`, `needs_attention{pending_payments,pending_documents,upcoming_interviews,overdue_reviews,conditions_expiring_soon,enrollments_expiring_soon}`, `recent_activity[]`, `generated_at`, `no_school_access` | `AdminDashboardResponse` | admin dashboard |

**⚠ Field-shape finding (R4.4) — documented and resolved as a tolerated dual-shape,
not a UI break.** `admin/dashboard.ts` logs a `warn` when the response is missing the
expected top-level keys `applications` / `users` / `recent_activity`, and also reads
camelCase fallbacks (`stats`, `statusBreakdown`, `recentActivity`, `noSchoolAccess`).
The live backend `AdminDashboardView` returns the **snake_case** nested shape
(`applications.by_status`, `needs_attention`, `recent_activity`, `no_school_access`),
which the normalizer maps explicitly. The camelCase branches are defensive fallbacks
for an alternate shape, not a dependency on a field the backend does not document. The
dashboard response is a bespoke aggregate object. It is **not paginated**, and its
schema is documented for OpenAPI via `AdminDashboardSerializer`
(`apps/accounts/admin_serializers.py`: `no_school_access`, `applications.by_status`,
`needs_attention`, `recent_activity`) even though the view returns the dict directly —
recorded here so the OpenAPI drift guard (Task 9.3) treats `/admin/dashboard/` as a
typed object endpoint with its documented `data` keys above.

### 10b. Users — `admin/users.ts`

| FE method | Endpoint | Auth | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer |
|-----------|----------|------|-------|-----------------------|--------------------------|---------------|-------------|
| `userService.list` | `GET /admin/users/[?page&pageSize&search&role]` | **staff-scoped** | membership + `filters_for_user` | envelope; **paginated** `{page,pageSize,totalCount,results}` (`StandardPagination`) | user rows (`id,user_id?,email,first_name?,last_name?,full_name,phone?,role,is_active?,created_at?,updated_at?`) | `AdminUserListResult` | admin users |
| `userService.getById` / `getPermissions` | `GET /admin/users/{id}/` | **staff-scoped** (GAP-10) | role-escalation guards | envelope | `AdminUserRecord` | `AdminUserRecord` / derived perms | admin users |
| `userService.create` | `POST /admin/users/` | **staff-scoped** | `IsAdmin` + role-level validation | envelope | `{user,…}` | `AdminUserMutationResult` | admin users |
| `userService.update` / `updatePermissions` / `remove` | `PATCH /admin/users/{id}/` | **staff-scoped** (GAP-10) | role guards | envelope | `{user,revokedSessions?,message?}` | `AdminUserMutationResult` | admin users |
| `userService.export` | `GET /admin/users/export/` | **staff-scoped** (GAP-9) | `Profile.objects.all()` PII-redacted, row set not scoped | envelope/file | redacted user rows | untyped | admin export |

**Note.** The frontend `AdminUserListResult` declares an optional `totalPages`, but
the backend `AdminUserListView` paginates with `StandardPagination`, which emits only
`{page,pageSize,totalCount,results}` — **`totalPages` is not a backend field.** The
frontend reads it with a safe optional (`response?.totalPages` → `undefined`) and
computes pages from `totalCount`/`pageSize` instead, so this is a **dead optional
field on the FE type**, not a UI dependency on an undocumented backend field. Recorded
as F2 so the FE type can drop `totalPages` (or the view can add it) for parity.

### 10c. Audit — `admin/audit.ts`

| FE method | Endpoint | Auth | Scope | Envelope / pagination | Serializer fields (data) | Frontend type | UI consumer |
|-----------|----------|------|-------|-----------------------|--------------------------|---------------|-------------|
| `adminAuditService.list` | `GET /admin/audit-logs/[?page&pageSize&action&actor_email&actor_id&entity_type&category&date_from&date_to]` | **staff-scoped** (GAP-11) | `AuditLog.objects.all()` filter params; not narrowed | envelope; **paginated** `{page,pageSize,totalCount,results}` (`StandardPagination`) | `AuditLogSerializer` rows (`id,actor_id,actor_email?,actor_name?,actor_role?,action,category?,entity_type,entity_id,changes,ip_hash?,user_agent_hash?,request_ip?,request_user_agent?,ip_address?,user_agent?,created_at`) | `AuditLogResponse` | admin audit trail |

**Note.** The backend `AdminAuditLogView` uses `StandardPagination`, returning
`{page,pageSize,totalCount,results}` of `AuditLogSerializer` rows. The frontend mapper
tolerates `entries` **or** `results`, `count` **or** `totalCount`, and
`ip_hash`/`ip_address` + `user_agent_hash`/`user_agent` variants; derives `category`
client-side via `getAuditCategory(action)`; and **builds the `summary` block itself**
via `buildSummaryFromEntries` when the backend omits it (the live view does not emit
`entries`, `summary`, or `totalPages` — those FE-side reads resolve to the `results`
path and client computation). All are documented backend fields or pure client
derivations. **No undocumented-field dependency.**

### 10d. Tenant onboarding — `admin/tenants.ts`

All `tenantAdminService` methods are **staff-scoped** via `_scope_institution_ids`
(writes super-admin-only via `_write_allowed`) per `scope-endpoint-inventory.md` §9.
Every method consumes the envelope (`apiClient` unwrap) and lists tolerate
array / `{results}` / `{data:{results}}` shapes via `listFromResponse`.

| FE method | Endpoint | Envelope / pagination | Frontend type |
|-----------|----------|-----------------------|---------------|
| `listInstitutions` | `GET /admin/institutions/[?search&active]` | envelope; list/paginated | `TenantInstitution[]` |
| `createInstitution` | `POST /admin/institutions/` | envelope | `TenantInstitution` |
| `updateInstitution` | `PATCH /admin/institutions/{id}/` | envelope | `TenantInstitution` |
| `listDomains` / `createDomain` / `updateDomain` | `…/{id}/domains/[/{item}]` | envelope; list | `TenantDomain[]` / `TenantDomain` |
| `listAssets` / `createAsset` / `updateAsset` | `…/{id}/assets/[/{item}]` | envelope; list | `TenantAsset[]` / `TenantAsset` |
| `uploadAsset` | `POST …/{id}/assets/upload/` (multipart) | envelope | `TenantAsset` (super-admin write; storage-key + MIME validation) |
| `listTemplates` / `createTemplate` / `updateTemplate` | `…/{id}/templates/[/{item}]` | envelope; list | `TenantTemplate[]` / `TenantTemplate` |
| `listDocumentProfiles` / `createDocumentProfile` / `updateDocumentProfile` | `…/{id}/document-profiles/[/{item}]` | envelope; list | `TenantDocumentProfile[]` / `TenantDocumentProfile` |
| `cloneDocumentProfile` | `POST …/{id}/document-profiles/{item}/clone/` | envelope | `TenantDocumentProfile` (new version) |
| `listRequiredDocuments` / `createRequiredDocument` / `updateRequiredDocument` | `…/{id}/required-documents/[/{item}]` | envelope; list | `TenantRequiredDocument[]` / one |
| `listMemberships` / `createMembership` / `updateMembership` | `/admin/memberships/[/{id}]` | envelope; list | `TenantMembership[]` / one |
| `listAccessGrants` / `createAccessGrant` / `updateAccessGrant` | `/admin/access-grants/[/{id}]` | envelope; list | `TenantAccessGrant[]` / one |
| `listOfferings` / `getOffering` / `updateOfferingRules` | `/catalog/programs/[/{id}]` (filtered client-side by `institution_id`) | envelope; list | `TenantOffering[]` / one |
| `listSettlements` | `GET /payments/settlements/[?start_date&end_date&status]` | envelope; list | `TenantSettlementRow[]` |
| `simulateRouting` | `POST /admin/routing/simulate/` | envelope (object) | `RoutingSimulationResult` (`assigned`, recoverable `error{code,message}`) |

**Note.** `listOfferings` reads `/catalog/programs/?pageSize=200` and filters by
`institution_id` **client-side** because that endpoint returns all schools' offerings
to an admin — a known client-side filter over documented fields (the backend
scope-narrowing of that list is GAP-tracked in the scope inventory, not here). The
`TenantDocumentProfile` / `TenantOffering` TS shapes mirror the backend
`AdminDocumentProfileSerializer` / offering serializer; structural caps
(`TENANT_PROFILE_CAPS`) mirror `validate_profile_payload`. **No undocumented-field
dependency.**

---

## 11. Coverage counts

### Service methods mapped (R4.2)

| Service module | Methods mapped |
|----------------|----------------|
| `auth.ts` | 9 |
| `sessionService.ts` | 3 |
| `catalog.ts` (catalog/program/intake/institution services) | 18 |
| `applications.ts` | 33 |
| `communications.ts` | 3 |
| `documents.ts` | 5 |
| `officialDocuments.ts` | 5 |
| `payments.ts` | 3 |
| `interviews.ts` | 2 (3 call paths) |
| `notifications.ts` | 11 |
| `admin/dashboard.ts` | 2 (1 endpoint) |
| `admin/users.ts` | 8 |
| `admin/audit.ts` | 1 |
| `admin/tenants.ts` | 30 |
| **Total mapped methods** | **133** |

Every method resolves to a backend `/api/v1/` endpoint present in the generated
schema (`/tmp/openapi.yaml`, 196 documented operations). Surface coverage required by
R4.2 — auth, profile, catalog/context/canonical-programs, applications, student
documents, official documents, payments, interviews, notifications, and the admin
dashboard/applications/users/audit-trail/tenant-onboarding/document-profiles/assets/
templates/access-grants surfaces — is **complete**. ✅

### Endpoint presence in OpenAPI schema (spot-checked)

`applications/history`, `notifications/user/{id}`, `admin/audit-logs`,
`applications/interviews`, `applications/track`, `admin/dashboard`,
`admin/users/export`, `applications/{id}/payment-receipt`,
`applications/{id}/finance-receipt`, `sessions`, `catalog/assignment-preview`,
`catalog/canonical-programs`, `payments/settlements`, `admin/routing/simulate`,
`admin/access-grants`, and `applications/{id}/official-documents/{type}` are all
present. ✅

---

## 12. UI-depends-on-undocumented-field flags (R4.4)

**Result: no UI depends on an undocumented backend field.** Every field a frontend
service reads maps to a documented serializer field, a documented bespoke-view `data`
key, or a pure client-side derivation/normalization over documented fields. The items
below are **documented tolerances and contract notes**, not undocumented-field
dependencies — each is recorded so the Task 9.x contract tests and the OpenAPI drift
guard pin them.

| # | Surface | Observation | Classification | Follow-up |
|---|---------|-------------|----------------|-----------|
| F1 | `admin/dashboard.ts` | Reads camelCase fallbacks (`stats`,`statusBreakdown`,`recentActivity`,`noSchoolAccess`) in addition to the live snake_case shape; logs a warn on missing `applications`/`users`/`recent_activity`. | Defensive dual-shape; live shape is the snake_case dict documented by `AdminDashboardSerializer`. | Pin the snake_case `data` keys in the OpenAPI/contract test (Task 9.1/9.3). |
| F2 | `admin/users.ts` | `AdminUserListResult` declares optional `totalPages`, but `StandardPagination` emits only `{page,pageSize,totalCount,results}`. | Dead optional FE field (resolves `undefined`, pages derived from `totalCount`/`pageSize`) — not a UI dependency on an undocumented field. | Drop `totalPages` from the FE type, or add it to the view, for parity. |
| F3 | `admin/audit.ts` | Tolerates `entries`/`results` + `count`/`totalCount` + ip/ua hash aliases; derives `category` client-side; **builds `summary` itself** (the live `StandardPagination` view emits only `{page,pageSize,totalCount,results}`). | Field-variant tolerance + client derivation over `results`; `entries`/`summary`/`totalPages` are dead FE-side fallbacks. | Pin `results[]` (`AuditLogSerializer`) for `/admin/audit-logs/`; optionally simplify the FE mapper to the canonical shape. |
| F4 | `officialDocuments.ts` | `emailOfficialDocument` supports only `application_slip` (no generic per-type email endpoint). | Backend **contract gap**, handled by throwing — not a field dependency. | Add a per-type official-document email endpoint (backend follow-up). |
| F5 | `sessionService.ts` | Reads `last_active` as a fallback for `last_activity`. | Legacy field alias tolerance. | Confirm backend emits `last_activity` only; drop the alias when safe. |
| F6 | `applications.ts` | `normalizeStatusHistory` synthesizes `changed_by_profile` from `changed_by_name`. | Client shim over documented fields. | None — defensive only. |

> No production DB changes were made by this task. No view or service behaviour was
> changed. This document is the **R4.2/R4.3/R4.4 API contract inventory artifact**;
> the error-normalization (R4.6/R4.7) and rate-limit (R4.8) confirmations are Tasks
> 8.3 and 8.4, and the contract tests + OpenAPI drift guard are Task 9.
