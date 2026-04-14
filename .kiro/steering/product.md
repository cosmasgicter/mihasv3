---
inclusion: always
---

# MIHAS Platform Product Context

MIHAS is now a multi-application monorepo with two active product surfaces:

- `apps/admissions/` for student admissions and admissions operations
- `apps/jobs-ops/` for the AI job hunting and outreach operations platform

Both are backed by the Django API in `backend/`. Treat changes as production-sensitive: the repo handles real applicant data, operational workflows, credentials, messaging, and automation plans.

## Current Platform State

- `apps/admissions/` remains the live student and admin admissions experience.
- `apps/jobs-ops/` now exists as a real operator dashboard with working route structure, data views, loading states, filters, and backend-connected scaffold APIs.
- `backend/` is the canonical server implementation for both product areas.
- `shared/` exists for intentionally shared code, but remains lightly used.
- `apps/website/` and `apps/student-portal/` are still placeholder/future apps.
- `apps/librarymanagement/` exists in the repo but is not yet a wired application package.

### Error Monitoring

The platform uses self-hosted error monitoring with no third-party tracker (no Sentry). Backend 500 errors are caught by `envelope_exception_handler`, which creates an `ErrorLog` row and dispatches a throttled alert email via Redis + Resend. Frontend errors are captured by `errorReporter.ts` and POSTed to `POST /api/v1/errors/report/`, which follows the same pipeline. Alert emails default to `***REMOVED***` (configurable via `ERROR_ALERT_EMAIL` env var). Throttling is one alert per unique error message per 15 minutes.

## Hard Constraints

| Rule | Reason |
|------|--------|
| Never remove admissions auto-save behavior without a replacement | Students often apply on unstable connections and must not lose progress |
| Never fabricate candidate qualifications, documents, or outreach claims | Jobs-ops automation must remain truthful and reviewable |
| Never block core flows on third-party verification APIs | External checks and provider integrations must degrade gracefully |
| Never log PII, secrets, resume contents, or document bodies | The repo handles sensitive personal and operational data |
| Preserve backward data compatibility | Existing Neon schema and production records must stay usable |
| Preserve mobile-first usability for admissions and review workflows | Many users operate on phones and weak networks |
| Keep auth cookie and CSRF protections intact | Admissions and operator actions are state-changing and sensitive |
| Treat uploads, automation evidence, and outbound messaging as high risk | These flows have legal, operational, and reputational impact |

## Product Areas

### Admissions

- Student onboarding, profile management, application wizard, document upload, payment via Lenco gateway, interview progression, and decisions
- Admin and reviewer tools for application review, verification, fee management, payment status override, audit, and operational oversight
- Payment is processed in real-time via the Lenco inline widget — no manual proof-of-payment uploads

#### Current Admissions Flow Contract

- Student submission is finalized through the dedicated backend endpoint `POST /api/v1/applications/{id}/submit/`, not by generic application updates.
- Student payment outside the wizard is read-only. `/student/payment` is a history and guidance surface, not a payment entry form.
- Student interview lists should be loaded through the single-query endpoint `GET /api/v1/applications/interviews/?mine=true` rather than one request per application.
- Student-facing payment reads must normalize legacy `verified` and newer `paid` / `successful` states consistently.
- Profile and settings forms must protect unsaved edits before navigation and provide accessible inline save feedback in addition to toast notifications.

### Jobs Ops

- Job discovery, scoring, review, and application orchestration
- Resume/document tailoring and application package generation
- Outreach CRM, email operations, analytics, reporting, and integration controls
- Human-in-the-loop automation for risky or ambiguous actions
- Platform attribution must remain visible in backend metadata: creator `Cosmas Kanchepa`, developed by `Beanola Technologies`, backlink `https://beanola.com`

## API Contract

The frontend apps consume the Django `/api/v1/` contract directly. There is no translation layer or compatibility shim.

- Admissions uses resource-style REST paths under `/api/v1/`.
- Jobs-ops also uses resource-style REST paths under `/api/v1/`.
- Jobs-ops must use domain-specific routes such as `/api/v1/jobs/`, `/api/v1/job-applications/`, `/api/v1/outreach/...`, `/api/v1/automation/...`, `/api/v1/email/...`, `/api/v1/analytics/...`, and `/api/v1/meta/platform/`.
- Do not reintroduce stale repo conventions such as root-level `src/`, `api-src/`, `api/`, or `django_api/`.
- Do not introduce `?action=` query-parameter patterns.

## Primary Users

| Role | Capabilities |
|------|-------------|
| Student | Apply, upload documents, track status, pay, manage their own profile |
| Admin | Review admissions applications, manage settings, verify documents and payments |
| Reviewer | Read-only review of assigned admissions data where enabled |
| Super Admin | Full operational access across system administration |
| Jobs Operator | Review jobs, approve actions, manage sources, documents, outreach, analytics, and automation |
| Candidate Owner | Uses jobs-ops outputs, receives alerts, approves risky actions, reviews outreach/application materials |

## Core Application Flows

### Admissions

`Registration -> Email Verification -> Profile Setup -> Application Wizard -> Lenco Payment -> Submission -> Interview -> Decision`

Admissions expectations:

- Multi-step application flow remains the core student journey.
- Auto-save must remain silent and resilient.
- Eligibility checks are advisory, not hard blockers.
- Drafts must survive refreshes, reconnects, and interrupted sessions.
- Payment is handled by the Lenco inline widget in the payment step — no manual proof-of-payment.
- NRC or Passport document upload is mandatory before submission.

### Jobs Ops

`Discovery -> Normalization -> Match Scoring -> Review/Approval -> Document Tailoring -> Application/Outreach -> Tracking -> Reporting`

Jobs-ops expectations:

- Every automation attempt must leave evidence and logs.
- High-risk actions must remain approval-gated.
- Suggested AI outputs must be explainable and editable.
- Email, Telegram, provider credentials, and automation state must be treated as operationally sensitive.

## Business Rules

| Rule | Details |
|------|---------|
| Payment timing | Application fee is collected via Lenco gateway before submission. Admin can override payment status for offline payments. |
| Payment state compatibility | Treat legacy `verified` and current paid/successful payment outcomes as equivalent verified states in student-facing reads and review tools. |
| Documents | NRC or Passport upload is mandatory. Requirements vary by program and must be validated defensively |
| Grading | Zambian ECZ grading semantics must remain correct in admissions |
| Audit | Administrative and automation state changes require audit coverage |
| Password reset | Token-based, time-bound, single-use, and rate-limited |
| Auth | Cookie-based auth remains the intended browser model |
| Outreach safety | Jobs-ops must avoid duplicate spammy outreach and must not bypass approval controls for risky sends |
| Error alerting | Error notifications default to `***REMOVED***` (via `ERROR_ALERT_EMAIL` env var) unless explicitly overridden |

## Security Posture

| Layer | Current Expectation |
|-------|---------------------|
| Transport | TLS only, strict transport headers in production |
| Auth | HTTP-only cookies, refresh rotation, Django-managed signing, JWT middleware fully implemented |
| CSRF | Required on state-changing requests; custom `CSRFEnforcementMiddleware` with exempt patterns for unauthenticated endpoints |
| Validation | Validate every input at the API boundary |
| File uploads | Validate content type and file shape defensively |
| Secrets | Credentials must be environment-backed and masked in logs |
| Audit | Keep audit trails while avoiding PII in logs |
| URL safety | Prevent open redirects and unsafe external URL handling |
| Automation safety | Respect approval thresholds, domain policies, and send caps |
| Error monitoring | Self-hosted via `ErrorLog` model + throttled alert emails (no Sentry) |

## Working Assumptions For Changes

When modifying code, always verify:

- Which package you are changing: `apps/admissions`, `apps/jobs-ops`, `backend`, or `shared`
- Whether the code follows the `/api/v1/` REST contract
- Whether the change affects draft persistence, auth cookies, CSRF, uploads, outbound messaging, or admin actions
- Whether the change is safe on mobile and degraded networks
- Whether new env/config requirements belong in backend env files and supporting steering/docs
- Whether you need to update frontend validation, backend tests, or both

## Development Guardrails

- All backend work targets `backend/` with routes under `/api/v1/`.
- Frontend API calls should use app-local clients or service modules with resource-style REST paths.
- If a task spans frontend and backend, check both sides before assuming parity.
- Keep steering files aligned with the real repo state, not with earlier planning assumptions.
- Leave unrelated existing worktree changes untouched unless the task explicitly requires them.
