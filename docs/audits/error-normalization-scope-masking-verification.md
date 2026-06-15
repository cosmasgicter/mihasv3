# Error Normalization & Out-of-Scope Masking — Contract Verification (Task 8.3)

**Spec:** `.kiro/specs/beanola-production-readiness/` · **Requirements:** R4.6, R4.7
**Date:** 2026 audit pass · **Verdict:** PASS — no gap fixes required (no raw-error leak, no unmasked out-of-scope path).

This is the contract-level confirmation that recoverable student-facing errors carry a
stable code + guidance and never expose a raw Django/DRF error (R4.6), and that
out-of-scope targets return the `Not_Found_Envelope` (R4.7). It complements the
endpoint inventory (`scope-endpoint-inventory.md`) and the API contract inventory (task 8.2).

## R4.6 — Recoverable student errors are stable + guidance-bearing, never raw framework errors

### Central normalization seam
- DRF is wired to `apps.common.exceptions.envelope_exception_handler`
  (`backend/config/settings/base.py` → `REST_FRAMEWORK["EXCEPTION_HANDLER"]`) and
  `apps.common.renderers.EnvelopeRenderer` (`DEFAULT_RENDERER_CLASSES`).
- For **non-DRF exceptions** (`ProgrammingError`, `OperationalError`, `ValueError`, etc.)
  the handler returns a generic `{"success": false, "error": "An unexpected error occurred.
  Please try again later.", "code": "INTERNAL_ERROR"}` at HTTP 500 and forwards the original
  exception to GlitchTip via `sentry_sdk.capture_exception`. The raw exception string/stack
  trace never reaches the client.
- DRF exceptions map to a fixed stable-code table (`400 VALIDATION_ERROR`, `401
  AUTHENTICATION_REQUIRED`, `403 INSUFFICIENT_PERMISSIONS`, `404 NOT_FOUND`, `405
  METHOD_NOT_ALLOWED`, `429 RATE_LIMITED`); 401 is forced for auth exceptions; payment-scope
  throttles enrich the 429 with the stable catalogue message + `retry_after`.

### Recoverable student-facing examples (stable code + guidance)
| Surface | File | Code | HTTP | Guidance present |
|---|---|---|---|---|
| Public tracker bad format | `applications/public_views.py` | `INVALID_FORMAT` | 400 | yes (example codes in message) |
| Public tracker miss | `applications/public_views.py` | `NOT_FOUND` | 404 | yes ("verify the code and try again") |
| Program→offering assignment | `catalog/views.py` | `NO_ELIGIBLE_OFFERING` | 409 | yes (`guidance` field: choose another intake / interest list / contact admissions) |
| Defer payment | `documents/payment_widget_views.py` | `PAYMENT_ERROR` / `VALIDATION_ERROR` | 400 | controlled domain message |

### `str(exc)` audit (potential raw-leak sites)
Every `"error": str(exc)` site returns a **controlled domain message or stable token**, not a
raw Django/DRF internal:
- `catalog/views.py` — `OfferingAssignmentError` (domain error, carries `code` + `guidance`).
- `documents/payment_widget_views.py` — `PaymentService` `ValueError` raises stable tokens
  (`MAX_PAYMENT_ATTEMPTS_EXCEEDED`, `INVALID_STATUS_TRANSITION`, …) or the explicit
  user-facing "Cannot resolve program … Please verify …" message.
- `common/error_views.py` — `_extract_reports` `ValueError` (validation message, `AllowAny`
  error-report ingest; not a student wizard surface).
- `applications/admin_review_views.py` — admin-facing transition errors (`INVALID_TRANSITION`,
  domain codes), not student-facing.
No `except Exception as e` returning `str(e)` exists in the admissions/documents/catalog/
accounts/common views. No `traceback` / `format_exc` / `repr(exc)` reaches a response body.

### Existing coverage
- `tests/property/test_live_500_fixes.py::TestNoTracebackInErrorResponses` (Property 7) —
  no traceback/`File "` strings in any handler response.
- `tests/property/test_auth_status_contract.py` — 401/403 stable mapping.
- `tests/property/test_error_monitoring.py` — unhandled exceptions → 500 + GlitchTip capture.
- `tests/unit/test_session_hardening.py` — code mapping for auth/permission exceptions.
- Dedicated Property 31 test (`tests/property/test_student_error_envelope_properties.py`) is
  owned by **task 9.5** (not 8.3) and is still pending; this contract review confirms the
  behaviour it will pin is already in force.

## R4.7 — Out-of-scope targets return the `Not_Found_Envelope`

- Document auth seam `documents/document_storage_views.py::_get_authorized_document` masks
  both out-of-scope school-staff reads (scope computed via `AccessScopeService`, never the
  `admin` role alone) and non-owning students as a **byte-identical** 404
  `{"success": false, "error": "Document not found", "code": "NOT_FOUND"}` — shared by
  signed-url, download, info, delete, and extract.
- Application/interview/notification/template/setting detail endpoints return the same
  `NOT_FOUND` envelope on miss, and scoped detail reads mask out-of-scope as 404 (tenant
  lifecycle drill: `applications/{id}/` OOS → 404).

### Existing coverage
- `tests/property/test_official_document_gating_properties.py` (Property 18 + masking) —
  out-of-scope staff / non-owning student → 404 byte-identical to genuine miss.
- `tests/unit/test_official_document_deletion.py::test_out_of_scope_admin_masks_as_not_found`
  — School A admin deleting School B doc → 404 byte-identical, no mutation.
- `tests/unit/test_drift_bug3_endpoints.py` — signed-url/download/info/delete OOS masking.
- `tests/integration/test_tenant_lifecycle_drill.py` — application detail OOS → 404.
- `tests/property/test_access_scope_properties.py` — scoped querysets never intersect
  out-of-scope schools.

## Tests run for this verification
```
DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest \
  tests/property/test_live_500_fixes.py tests/property/test_auth_status_contract.py \
  tests/property/test_error_monitoring.py tests/unit/test_session_hardening.py \
  tests/unit/test_official_document_deletion.py tests/unit/test_drift_bug3_endpoints.py \
  tests/property/test_official_document_gating_properties.py -q
# → 53 passed
```

## Gap fixes applied
None. The central exception handler + envelope renderer (R4.6) and the `AccessScopeService`-
backed `_get_authorized_document` / detail-view masking (R4.7) already enforce both
guarantees, and they are covered by the existing tests above. No raw-error leak and no
unmasked out-of-scope read path were found at the contract level.
