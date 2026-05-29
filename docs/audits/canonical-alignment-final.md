# Canonical Alignment Audit — Final Report

**Date:** 2026-05-29  
**Scope:** Read-only audit of drift-guard coverage across all canonical domain concepts  
**Auditor:** audit_canonical_alignment orchestrated session

---

## 1. Application Statuses

**Source of truth:** `backend/apps/applications/services.py:ALLOWED_TRANSITIONS`

### Backend matrix statuses (source + target union)

```
draft, submitted, under_review, waitlisted, conditionally_approved,
approved, enrolled, rejected, withdrawn, expired, enrollment_expired
```

### Frontend status enum (`src/types/applicationStatus.ts:APPLICATION_STATUSES`)

```
draft, submitted, under_review, waitlisted, conditionally_approved,
approved, enrolled, rejected, withdrawn, expired, enrollment_expired
```

### Admin filter list (`src/lib/applicationStatusUi.ts`)

Uses `APPLICATION_STATUSES.map(...)` — derives from the same canonical array. ✅ No drift.

### Admin badge map (`ADMIN_APPLICATION_STATUS_BADGES`)

All 11 statuses have entries. ✅ No drift.

### Student timeline (`ApplicationTimeline.tsx:mapApplicationStatusToTimelineStatus`)

Handles: `approved`, `enrolled`, `rejected`, `withdrawn`, `expired`, `enrollment_expired`, `under_review`, `conditionally_approved`, `waitlisted`, `submitted`, `draft`. ✅ All 11 covered.

### Public tracker page (`trackerUtils.ts:getStatusMessage`)

Handles: `submitted`, `under_review`, `approved`, `conditionally_approved`, `waitlisted`, `enrolled`, `rejected`, `withdrawn`, `expired`, `draft`.

⚠️ **DRIFT FOUND:** `enrollment_expired` is missing from `getStatusMessage()`. Falls through to the `default` case ("Your application status is being updated…") which is misleading for an expired enrollment.

### Drift-guard tests

| Test | Status |
|------|--------|
| `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts` | ✅ Reads `services.py` + `duplicate_checker.py`, asserts TS union covers all backend statuses |
| `backend/tests/property/test_lifecycle_canonical.py` | ✅ Asserts every reachable status has a frontend label in `applicationStatusUi.ts` |

### Verdict

**Mostly aligned.** One consumer (`getStatusMessage` in tracker utils) is missing `enrollment_expired`.

---

## 2. Payment Statuses

**Source of truth:** `backend/apps/documents/payment_constants.py:PAYMENT_TO_APP_MAP`

### Backend map

```python
PAYMENT_TO_APP_MAP = {
    "successful": "verified",
    "force_approved": "verified",
    "failed": "failed",
    "expired": "not_paid",
    "deferred": "deferred",
    "pending": "pending_review",
}
```

### Frontend fixture (`src/lib/__fixtures__/paymentStatusBackendMirror.ts`)

```typescript
PAYMENT_TO_APP_MAP = {
  successful: 'verified',
  force_approved: 'verified',
  failed: 'failed',
  expired: 'not_paid',
  deferred: 'deferred',
  pending: 'pending_review',
}
```

✅ Exact match.

### Frontend `normalizePaymentStatus` (`src/lib/paymentStatus.ts`)

Maps: `pending`/`pending_review` → `pending_review`, `verified`/`paid`/`successful`/`force_approved` → `verified`, `failed`/`rejected` → `rejected`, `deferred` → `deferred`, `expired` → `not_paid`, default → `not_paid`.

⚠️ **Minor semantic note:** The frontend maps `failed` → `rejected` (UI label "Payment Rejected"), while the backend maps `failed` → `failed`. The drift-guard test accounts for this by using a `frontendToBackendOutput` translation layer. This is intentional (UI-friendly naming) and tested. No real drift.

### Drift-guard tests

| Test | Status |
|------|--------|
| `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts` | ✅ Parses `payment_constants.py` at test time, asserts fixture + `normalizePaymentStatus` agree |
| `backend/tests/unit/test_payment_status_canonical.py` | ✅ Asserts `PAYMENT_TO_APP_MAP` covers every `CanonicalStatus` literal |

### Verdict

**Fully aligned.** No drift detected.

---

## 3. Role Hierarchy

**Source of truth:** `backend/apps/accounts/permissions.py:ROLE_HIERARCHY`

### Backend

```python
ROLE_HIERARCHY = {
    "super_admin": 4,
    "admin": 3,
    "reviewer": 2,
    "student": 1,
}
```

### Frontend (`src/types/roles.ts:ROLE_HIERARCHY`)

```typescript
ROLE_HIERARCHY = {
  super_admin: 4,
  admin: 3,
  reviewer: 2,
  student: 1,
}
```

✅ Exact match.

### Helper functions

- Backend: `is_super_admin()`, `_has_role_level()`, permission classes (`IsStudent`, `IsReviewer`, `IsAdmin`, `IsSuperAdmin`) — all use `ROLE_HIERARCHY`.
- Frontend: `hasRole()`, `isStudent()`, `isReviewer()`, `isAdmin()`, `isSuperAdmin()` — all use `ROLE_HIERARCHY`.

✅ Same hierarchy semantics (≥ comparison).

### Drift-guard tests

| Test | Status |
|------|--------|
| `apps/admissions/tests/unit/rolesBackendMirror.test.ts` | ✅ Parses `permissions.py` at test time, asserts key set + level values match |

### Verdict

**Fully aligned.** No drift detected.

---

## 4. Error Codes

**Source of truth:** `backend/apps/documents/payment_error_codes.py:PAYMENT_ERROR_CODES` (payment-specific) + `backend/apps/common/error_codes.py:ERROR_CODES` (unified catalog)

### Backend payment error codes (20 codes)

```
NOT_OWNER, APPLICATION_NOT_FOUND, APPLICATION_NOT_PAYABLE, ALREADY_PAID,
MAX_PAYMENT_ATTEMPTS_EXCEEDED, PAYMENT_PENDING, PAYMENT_CONFIRMED,
AMOUNT_MISMATCH, CURRENCY_MISMATCH, MISSING_PROVIDER_REFERENCE,
PROVIDER_UNAVAILABLE, PAYMENT_UNAVAILABLE, FEE_UNAVAILABLE,
PAYMENT_SENSITIVE_FIELDS_LOCKED, DRAFT_DELETE_BLOCKED_BY_PAYMENT,
CANNOT_REVERSE_SUCCESSFUL_PAYMENT, OVERRIDE_REASON_REQUIRED,
RECEIPT_NOT_ELIGIBLE, RATE_LIMITED, VALIDATION_ERROR
```

### Frontend `PaymentStableCode` union (20 codes)

Exact same 20 codes. ✅

### Backend mirror fixture (`__fixtures__/paymentErrorCodesBackendMirror.ts`)

Exact same 20 codes. ✅

### Unified error codes fixture (`__fixtures__/errorCodesBackendMirror.ts`)

Contains all 20 payment codes plus auth, application, validation, document, and common codes. The drift-guard test parses both `error_codes.py` and `payment_error_codes.py` at test time.

### Drift-guard tests

| Test | Status |
|------|--------|
| `apps/admissions/tests/unit/paymentErrorCodes.test.ts` | ✅ Asserts frontend union ↔ backend mirror fixture parity |
| `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts` | ✅ Parses both backend Python files, asserts fixture + `ERROR_CODE_MESSAGES` cover all |
| `backend/tests/unit/test_error_codes_canonical.py` | ✅ Scans all backend view files for code literals, asserts they exist in `ERROR_CODES` |

### Verdict

**Fully aligned.** All three layers (backend catalog, frontend union, fixture) are in sync with active drift guards.

---

## 5. Submission Gates

**Source of truth:** `backend/apps/applications/services.py:submit_application`

### Backend gates (in order)

1. **Intake deadline + capacity** — `IntakeEnforcer.check_submission()` (codes: `INTAKE_DEADLINE_PASSED`, `INTAKE_NOT_OPEN`, `INTAKE_CAPACITY_REACHED`, `PROGRAM_CAPACITY_REACHED`)
2. **Payment** — `payment_status in ("verified", "paid", "force_approved", "deferred")` OR completed Payment row (code: `PAYMENT_REQUIRED`)
3. **Identity document** — `_application_has_identity_document()` (code: `IDENTITY_DOCUMENT_REQUIRED`)
4. **Late fee** — if `intake_check.is_late`, checks for late fee payment (code: `LATE_FEE_REQUIRED`)
5. **Draft status** — `locked_app.status != "draft"` (code: `ALREADY_SUBMITTED`)
6. **Intake re-check** — inside lock (TOCTOU protection)
7. **Duplicate check** — `DuplicateChecker.check_at_submit()` (code: `DUPLICATE_SUBMITTED_APPLICATION`)

### Frontend gates (`wizardReadiness.ts:buildWizardReadiness`)

1. **Programme selected** — `isCompleteValue(values.program)`
2. **Intake selected** — `isCompleteValue(values.intake)`
3. **Full name** — `isCompleteValue(values.full_name)`
4. **Email** — `isCompleteValue(values.email)`
5. **Phone** — `isCompleteValue(values.phone)`
6. **NRC or passport (number)** — `hasNrcOrPassport`
7. **Date of birth** — `isCompleteValue(values.date_of_birth)`
8. **Sex** — `isCompleteValue(values.sex)`
9. **Residence town** — `normalizeResidenceTown(...).length >= 2`
10. **Grade 12 subjects** — `validGradeCount >= 5 && !hasDuplicateGrades`
11. **Result slip file** — `hasResultSlip`
12. **Identity document file** — `hasIdentityDocument`
13. **Payment or deferment** — `paymentStatus === 'successful' || paymentStatus === 'deferred'`
14. **Final confirmation** — `confirmSubmission`

### Alignment analysis

| Backend gate | Frontend equivalent | Aligned? |
|---|---|---|
| Payment (verified/paid/force_approved/deferred) | Payment (successful/deferred) | ⚠️ Partial — frontend checks `successful` but not `verified`/`paid`/`force_approved` as raw values. However, by the time the frontend evaluates this, the status has been normalized. The `paymentStatus` input to `buildWizardReadiness` comes from the backend's derived `payment_status` field which is already `verified` or `deferred`. The frontend checks `successful` which would only match if the raw canonical status leaked through. **Potential gap:** if `paymentStatus` is the raw canonical `successful` it passes, but `verified` (the derived value) does NOT pass the frontend gate. |
| Identity document (file exists) | Identity document file uploaded | ✅ |
| Draft status | N/A (wizard only shows for drafts) | ✅ Implicit |
| Intake deadline/capacity | N/A (server-side only) | ✅ Acceptable |
| Late fee | N/A (server-side only) | ✅ Acceptable |
| Duplicate check | N/A (server-side only) | ✅ Acceptable |

⚠️ **DRIFT FOUND:** The frontend `wizardReadiness.ts` payment gate checks `paymentStatus === 'successful' || paymentStatus === 'deferred'`. But the backend's derived `applications.payment_status` column uses `'verified'` (not `'successful'`) for paid applications (per `PAYMENT_TO_APP_MAP`). If the frontend receives the derived value `'verified'`, the `canSubmit` gate would **fail** because `'verified' !== 'successful'`.

This suggests the frontend `paymentStatus` input is sourced from somewhere that provides the raw canonical status (`successful`) rather than the derived app-level status (`verified`). If the source ever changes to the derived value, submission would be blocked. **No drift-guard test exists for this cross-layer gate alignment.**

### Drift-guard tests

| Test | Status |
|------|--------|
| `backend/tests/unit/test_submission_gates.py` | ✅ Tests individual backend gates (identity doc, capacity) |
| `backend/tests/property/test_submission_gates.py` | ⚠️ **Skipped** — marked `pytest.mark.skip` ("Stale property tests target the pre-admin-force submission seam") |
| Frontend submission gate drift guard | ❌ **MISSING** — no test asserts frontend `canSubmit` conditions match backend `submit_application` gates |

### Verdict

**Partially aligned.** The payment status value used in the frontend gate (`'successful'`) does not match the backend's derived column value (`'verified'`). A cross-layer drift-guard test is missing.

**Recommended test:** `apps/admissions/tests/unit/submissionGatesDriftGuard.test.ts`

---

## 6. Communication Template Variables

**Source of truth:** `backend/apps/common/email/messages/*` (code-defined structure) + `communication_templates` DB table (subject overrides)

### Code-defined message types (from `render.py:_REGISTRY`)

```
acceptance, application_submitted, conditional_acceptance,
interview_scheduled, password_reset, payment_received, rejection
```

### DB-seeded templates

Covered by `backend/tests/integration/test_communication_template_coverage.py` which:
1. Discovers all `CommunicationService.send('template_key')` calls in production code
2. Applies the seed SQL
3. Asserts every discovered key has an active `CommunicationTemplate` row

### Drift-guard tests

| Test | Status |
|------|--------|
| `backend/tests/integration/test_communication_template_coverage.py` | ✅ Scans production code for template_key usage, asserts DB seed covers all |

### Verdict

**Aligned.** The integration test provides a comprehensive drift guard between code-used template keys and DB-seeded rows. However, there is no test asserting that the `{{variable}}` placeholders used in DB templates match the context keys passed by `CommunicationService.send()`.

**Recommended test:** `backend/tests/integration/test_communication_template_variables.py` — assert every `{{variable}}` in seeded templates is present in the context dict passed by the corresponding caller.

---

## 7. Stable Codes: PaymentNextAction

**Source of truth:** `apps/admissions/src/lib/paymentNextActions.ts`

### Frontend union

```typescript
'retry_with_different_number' | 'check_status' | 'already_paid' | 'unavailable' | 'contact_support'
```

### Frontend copy map (`PAYMENT_NEXT_ACTION_COPY`)

All 5 actions have entries with non-empty `label` and `guidance`. ✅

### Backend emitted values (from view code scan)

| Value | Emitted in |
|---|---|
| `already_paid` | `mobile_money_views.py`, `payment_widget_views.py` |
| `retry_with_different_number` | `mobile_money_views.py` |
| `check_status` | `mobile_money_views.py`, `payment_query_views.py` |
| `None` | `mobile_money_views.py` (when no action needed) |

⚠️ **Gap:** Backend never emits `unavailable` or `contact_support` as `next_action` values. These exist only in the frontend union for client-side derivation (e.g., from stable error codes). This is acceptable — the frontend derives these from `stableCode` in `derivePaymentUiState()`, not from the backend `next_action` field.

### Drift-guard tests

| Test | Status |
|------|--------|
| `apps/admissions/tests/unit/paymentErrorCodesCoverage.test.ts` | ✅ Asserts every `PAYMENT_NEXT_ACTIONS` member has a copy entry |

⚠️ **No backend-to-frontend drift guard exists.** There is no test asserting that every `next_action` string emitted by backend views is a member of the frontend `PaymentNextAction` union.

### Verdict

**Partially aligned.** The frontend union is a superset of backend-emitted values (acceptable). But there is no drift guard preventing the backend from emitting a new `next_action` value that the frontend doesn't handle.

**Recommended test:** `backend/tests/unit/test_payment_next_action_canonical.py` — define a canonical `PAYMENT_NEXT_ACTIONS` set in the backend and assert all emitted values are members.

---

## 8. PII Redaction List

**Source of truth:** `backend/apps/common/ai_prompt_redactor.py`

### Code-defined drop keys

```python
_ADMIN_DROP_KEYS = frozenset({
    "full_name", "nrc_number", "passport_number",
    "date_of_birth", "date_of_birth_iso",
    "phone", "mobile", "email",
})

_STUDENT_DROP_KEYS = frozenset({
    "full_name", "nrc_number", "passport_number",
    "date_of_birth", "date_of_birth_iso",
    "phone", "mobile", "email",
})
```

### Docstring spec

> Admin: "Drops `full_name`, `nrc_number`, `passport_number`, `date_of_birth` (and any contact PII)."
> Student: "Drops `full_name`; replaces with `first_name`. Drops NRC/passport/DOB."

### Alignment analysis

The docstring says admin drops "full_name, nrc_number, passport_number, date_of_birth (and any contact PII)". The code drops: `full_name`, `nrc_number`, `passport_number`, `date_of_birth`, `date_of_birth_iso`, `phone`, `mobile`, `email`.

- `date_of_birth_iso` is not mentioned in the docstring but is in the code. ✅ Acceptable (variant key for the same field).
- `phone`, `mobile`, `email` are covered by "any contact PII" in the docstring. ✅

The student docstring says "Drops full_name; replaces with first_name. Drops NRC/passport/DOB." The code drops the same set as admin (`_STUDENT_DROP_KEYS == _ADMIN_DROP_KEYS`) and adds `first_name`. The docstring doesn't mention `phone`/`mobile`/`email` being dropped for student, but the code does drop them.

⚠️ **Minor docstring drift:** The student-preview docstring says "Drops NRC/passport/DOB" but the code also drops `phone`, `mobile`, `email`. The docstring is incomplete.

### Drift-guard tests

| Test | Status |
|------|--------|
| `backend/tests/unit/test_ai_prompt_redactor.py` | ✅ Tests that specific PII keys are absent from output |

⚠️ **No canonical list assertion.** The test verifies specific keys are dropped but does not assert that `_ADMIN_DROP_KEYS` or `_STUDENT_DROP_KEYS` contain exactly the expected set. If a key is accidentally removed from the frozenset, no test would catch it unless that specific key was also tested individually.

### Verdict

**Mostly aligned.** Minor docstring incompleteness for student-preview. No canonical-list snapshot test exists.

**Recommended test:** `backend/tests/unit/test_ai_redaction_canonical.py` — snapshot-pin `_ADMIN_DROP_KEYS` and `_STUDENT_DROP_KEYS` so any addition/removal fails CI.

---

## Summary of Findings

### Drift detected

| # | Concept | Issue | Severity |
|---|---------|-------|----------|
| 1 | Application statuses | `getStatusMessage()` in tracker utils missing `enrollment_expired` | Low |
| 2 | Submission gates | Frontend payment gate checks `'successful'` but backend derives `'verified'` | Medium |
| 3 | PII redaction | Student-preview docstring omits phone/mobile/email from drop list | Low |

### Missing drift-guard tests

| Concept | Recommended test path | Priority |
|---------|----------------------|----------|
| Submission gates (cross-layer) | `apps/admissions/tests/unit/submissionGatesDriftGuard.test.ts` | **High** — no test validates frontend `canSubmit` conditions match backend gates |
| PaymentNextAction (backend → frontend) | `backend/tests/unit/test_payment_next_action_canonical.py` | Medium — backend could emit unhandled values |
| Communication template variables | `backend/tests/integration/test_communication_template_variables.py` | Medium — `{{variable}}` placeholders could drift from caller context |
| PII redaction list snapshot | `backend/tests/unit/test_ai_redaction_canonical.py` | Low — functional tests cover behavior but not the exact key set |

### Existing drift-guard coverage (healthy)

| Concept | Frontend test | Backend test | Status |
|---------|--------------|--------------|--------|
| Application statuses | `applicationStatusDriftGuard.test.ts` | `test_lifecycle_canonical.py` | ✅ |
| Payment statuses | `paymentStatusMappingDriftGuard.test.ts` | `test_payment_status_canonical.py` | ✅ |
| Role hierarchy | `rolesBackendMirror.test.ts` | — | ✅ |
| Error codes (unified) | `errorCodesDriftGuard.test.ts` | `test_error_codes_canonical.py` | ✅ |
| Payment error codes | `paymentErrorCodes.test.ts` | (snapshot in `test_payment_error_codes_snapshot.py`) | ✅ |
| Communication templates | — | `test_communication_template_coverage.py` | ✅ |
| PaymentNextAction copy | `paymentErrorCodesCoverage.test.ts` | — | ✅ (partial) |

---

## Recommendations

1. **Add `enrollment_expired` to `getStatusMessage()`** in `apps/admissions/src/pages/public/tracker/utils/trackerUtils.ts`.

2. **Create `submissionGatesDriftGuard.test.ts`** that reads `services.py:submit_application` and asserts the frontend `buildWizardReadiness` payment gate accepts the same statuses the backend considers "has payment".

3. **Create `test_payment_next_action_canonical.py`** that defines a canonical set of allowed `next_action` values and scans payment views to ensure no unlisted value is emitted.

4. **Create `test_communication_template_variables.py`** that asserts every `{{placeholder}}` in seeded templates is present in the context dict passed by the corresponding `CommunicationService.send()` caller.

5. **Snapshot-pin `_ADMIN_DROP_KEYS` and `_STUDENT_DROP_KEYS`** in a dedicated test so accidental removals are caught.

6. **Update the student-preview docstring** in `ai_prompt_redactor.py` to mention phone/mobile/email are also dropped.

7. **Clarify the frontend payment gate value source** — document whether `paymentStatus` in `buildWizardReadiness` receives the raw canonical status or the derived app-level status, and add a type annotation or comment to prevent future confusion.
