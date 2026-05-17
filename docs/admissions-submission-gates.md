# Admissions Submission Gates

Every gate is evaluated in `submit_application()` (backend/apps/applications/services.py) before an application transitions from `draft` to `submitted`.

## Gate Order

| # | Gate | Error Code | Rationale |
|---|------|-----------|-----------|
| 1 | Intake deadline + grace period | `INTAKE_DEADLINE_PASSED` | Prevent submissions after the intake window closes. |
| 2 | Intake-level capacity | `INTAKE_CAPACITY_REACHED` | Hard cap on total applications per intake. |
| 3 | Per-program capacity | `PROGRAM_CAPACITY_REACHED` | Hard cap on applications for a specific program within an intake. |
| 4 | Payment completed (skipped if `admin_force`) | `PAYMENT_REQUIRED` | Application fee must be paid or deferred before submission. |
| 5 | Identity document uploaded (skipped if `admin_force`) | `IDENTITY_DOCUMENT_REQUIRED` | NRC or Passport must be on file; documents with status `deleted` or `rejected` are excluded. |
| 6 | Late application fee (if within grace period) | `LATE_FEE_REQUIRED` | Late submissions require an additional fee when configured. |
| 7 | Application not already submitted | `ALREADY_SUBMITTED` | Idempotency guard — prevents double-submission. |
| 8 | Intake capacity re-check (inside lock) | `INTAKE_CAPACITY_REACHED` | TOCTOU race protection — re-validates capacity under `select_for_update`. |
| 9 | Duplicate application check | `DUPLICATE_SUBMITTED_APPLICATION` | Prevents same-identity applicant from having two active applications for the same program (policy-aware). |

## Multi-Intake Policy Effect on Duplicate Check

| Policy | Behaviour at Submit |
|--------|-------------------|
| `unrestricted` (default) | Duplicate check scoped to same program + same intake. |
| `single_active` | Duplicate check scoped to same program across ALL intakes. |

## Identity Document Exclusions

Documents with `verification_status` of `deleted` or `rejected` are excluded from the identity document gate. A student whose only identity document was rejected must re-upload before submitting.

## Notes Parameter Removed

`submit_application` no longer accepts a `notes` parameter. Submission always records empty notes in the status history. Admin notes are applied through the review endpoint, not submission.
