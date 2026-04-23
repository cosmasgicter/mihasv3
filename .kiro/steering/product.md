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

The platform uses GlitchTip (Sentry-compatible, free tier) for error tracking. Both frontend and backend report to a single GlitchTip project (22431). Backend errors are captured automatically by `sentry-sdk` with Django and Celery integrations. Frontend errors are captured by `@sentry/react`. CSP violations are reported via the `report-uri` directive in the Vercel CSP header. Both SDKs are configured via DSN environment variables (`GLITCHTIP_DSN` for backend, `VITE_GLITCHTIP_DSN` for frontend). The legacy `ErrorLog` model and `error_logs` table are preserved but no longer written to. The `POST /api/v1/errors/report/` endpoint still accepts reports for backwards compatibility, forwarding them to GlitchTip. `ERROR_ALERT_EMAIL` remains in use for non-error-monitoring alerts (uptime, payment failures, SLA breaches).

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
- Admin and reviewer tools for application review, verification, fee management, payment status override, audit, and operational oversight. AI-powered admin review summaries are available via `GET /api/v1/applications/{id}/admin-summary/`.
- Payment is processed in real-time via the Lenco inline widget — no manual proof-of-payment uploads
- AI-powered OCR extracts grades from uploaded result slips (never overwrites manual entries). AI preview summaries personalize the review step.

#### Current Admissions Flow Contract

- Student submission is finalized through the dedicated backend endpoint `POST /api/v1/applications/{id}/submit/`, not by generic application updates.
- Student payment outside the wizard is read-only. `/student/payment` is a history and guidance surface, not a payment entry form.
- Student interview lists should be loaded through the single-query endpoint `GET /api/v1/applications/interviews/?mine=true` rather than one request per application.
- Student-facing payment reads must normalize legacy `verified` and newer `paid` / `successful` states consistently.
- `deferred` is a distinct canonical payment status. Students who deferred payment see a reminder to complete payment. Submission is allowed with deferred payment status.
- Profile and settings forms must protect unsaved edits before navigation and provide accessible inline save feedback in addition to toast notifications. The Settings `onSubmit` handler uses explicit field-by-field merge with null-safe fallbacks in `reset()` to prevent isDirty persistence after save.
- Application tracking (`GET /api/v1/applications/track/`) validates code format (`APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX`) and returns actionable error messages — 400 with format guidance for invalid formats, descriptive 404 for valid-format codes not found.
- Sessions list (`GET /api/v1/sessions/`) uses the standard `{"success": true, "data": [...]}` envelope and validates user_id before querying.
- Token refresh (`POST /api/v1/auth/refresh/`) returns `NO_REFRESH_TOKEN` error code when the cookie is missing, distinct from `TOKEN_EXPIRED` for expired/blacklisted tokens.
- Students can withdraw applications from `submitted`, `under_review`, or `waitlisted` statuses via `POST /api/v1/applications/{id}/withdraw/` with a reason (10–500 chars). Withdrawal is terminal and frees the intake spot.
- Waitlisted students see their position and are auto-promoted when spots open (withdrawal, rejection, enrollment expiry).
- Conditionally approved applications have attached conditions with deadlines. All conditions must be met/waived before enrollment. Expired conditions trigger auto-rejection.
- Late applications are accepted within a configurable grace period after the intake deadline, flagged with `is_late_submission=True`, and may require a late fee.
- Approved students must confirm enrollment by a deadline (from academic calendar or default 14 days). Unconfirmed enrollments expire and trigger waitlist promotion.
- Students can request amendments to personal fields (phone, email, address, next of kin) on submitted applications, subject to admin approval (max 3 pending).
- Payment attempts are limited to 5 per application. Pending payments expire after 24 hours.
- Communication templates in the `communication_templates` table drive all notification and email content with `{{variable}}` substitution.

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

`Registration -> Email Verification -> Profile Setup -> Application Wizard -> Payment (mobile money / card / defer) -> Submission -> Interview -> Decision`

Admissions expectations:

- Multi-step application flow remains the core student journey.
- Auto-save must remain silent and resilient.
- Eligibility checks are advisory, not hard blockers.
- Drafts must survive refreshes, reconnects, and interrupted sessions.
- Payment is handled by the Lenco inline widget in the payment step — no manual proof-of-payment.
- Mobile money is the primary payment method; card widget is secondary. Students may defer payment and submit without paying upfront.
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
| Payment timing | Application fee is collected via Lenco gateway before submission. Admin can override payment status for offline payments. Students may also defer payment and submit without paying upfront. |
| Payment state compatibility | Treat legacy `verified` and current paid/successful payment outcomes as equivalent verified states in student-facing reads and review tools. `deferred` is a distinct canonical status — students who deferred see a reminder to pay. |
| Payment retry limits | Maximum 5 payment attempts per application. Pending payments expire after 24 hours. Expired payments older than 7 days are excluded from the attempt count. |
| Documents | NRC or Passport upload is mandatory. Requirements vary by program and must be validated defensively |
| Document verification SLA | Documents pending verification beyond the configurable SLA threshold (default 5 days) trigger admin notifications. Escalation at 2x threshold. |
| Grading | Zambian ECZ grading semantics must remain correct in admissions |
| Audit | Administrative and automation state changes require audit coverage |
| Withdrawal | Students can withdraw from submitted/under_review/waitlisted. Withdrawal is terminal, decrements enrollment, and triggers waitlist promotion. |
| Waitlist | Auto-promotion by position order when spots open. Admin can override order (logged as WAITLIST_ORDER_OVERRIDE). |
| Conditional admission | Conditions have deadlines. All must be met/waived for enrollment. Expired conditions trigger auto-rejection. |
| Late applications | Accepted within grace period after deadline. Flagged as late. May require late fee payment. |
| Enrollment confirmation | Approved students must confirm by deadline (academic calendar or default 14 days). Unconfirmed spots released to waitlist. |
| Fee waivers | Super admin can grant full/partial waivers. Full waivers set payment to force_approved. |
| Batch operations | Max 25 per batch, all-or-nothing validation, SHA-256 confirmation token required. |
| Amendments | Students can request changes to personal fields (max 3 pending). Admin approval required. |
| Multi-intake policy | Configurable: unrestricted (default), single_active (one active app per program), waitlist_cascade (auto-carry to next intake). |
| Communication templates | All notifications and emails use configurable templates with `{{variable}}` substitution. Fallback to defaults if template missing. |
| Password reset | Token-based, time-bound, single-use, and rate-limited |
| Auth | Cookie-based auth remains the intended browser model |
| Outreach safety | Jobs-ops must avoid duplicate spammy outreach and must not bypass approval controls for risky sends |
| Error alerting | Error notifications default to `admin@mihas.edu.zm` (via `ERROR_ALERT_EMAIL` env var) unless explicitly overridden |

## Security Posture

| Layer | Current Expectation |
|-------|---------------------|
| Transport | TLS only, strict transport headers in production |
| Auth | HTTP-only cookies, refresh rotation, Django-managed signing, JWT middleware fully implemented. Access tokens: 30 min, refresh tokens: 7 days with Redis JTI blacklisting. |
| CSRF | Required on state-changing requests; enforced in `JWTCookieAuthentication._enforce_csrf()` with exempt patterns for unauthenticated endpoints. CSRF tokens are in-memory only on the frontend; bootstrap session call uses `?refresh_csrf=1` to recover after page refresh. Cross-origin recovery uses query params (not custom headers) to avoid CORS preflight issues. |
| Validation | Validate every input at the API boundary |
| File uploads | Validate content type and file shape defensively |
| Secrets | Credentials must be environment-backed and masked in logs |
| Audit | Keep audit trails while avoiding PII in logs |
| URL safety | Prevent open redirects and unsafe external URL handling |
| Automation safety | Respect approval thresholds, domain policies, and send caps |
| Error monitoring | GlitchTip (Sentry-compatible) via `sentry-sdk` and `@sentry/react` |

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

## Performance Conventions

- The app uses a dark-themed 3-dots preloader in `index.html` (renders before any JS loads). Slow-load message appears after 5 seconds.
- `<link rel="preconnect" href="https://api.mihas.edu.zm" crossorigin />` is in `index.html` for early TLS handshake.
- Speculative prefetching (`src/lib/speculativePrefetch.ts`) preloads data during dead time: email blur → workspace chunks, login success → catalog + profile, dashboard mount → wizard chunk.
- Route chunk prefetching uses `requestIdleCallback` with `setTimeout` fallback. Network-aware: skips on `saveData` or 2G.
- Data freshness is handled by React Query polling: Dashboard uses `useStudentDashboardPolling` (fingerprint deduplication), NotificationBell uses `useNotificationPolling` (60-second interval with tab-visibility pause).
- Intake records are auto-created by `intake_manager_task` (daily 04:00 UTC) following the Jan/Jul pattern with 11-month lead time.
