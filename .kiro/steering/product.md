---
inclusion: always
---

# MIHAS Platform Product Context

MIHAS now lives in a monorepo. The only production application in active use today is the admissions portal in `apps/admissions/`, backed by the Django API in `backend/`. Treat every change as production-critical: real applicants, real staff, real personal data.

## Current Platform State

- `apps/admissions/` is the live student and admin admissions experience.
- `backend/` is the active backend migration target and now contains the canonical server implementation.
- `shared/` exists for future cross-app code, but it is still lightly used.
- `apps/website/` and `apps/student-portal/` are placeholders.
- `apps/librarymanagement/` exists in the repo but is not yet a wired application package.

## Hard Constraints

| Rule | Reason |
|------|--------|
| Never remove auto-save behavior without a replacement | Students often apply on unstable connections and must not lose progress |
| Never block core flows on third-party verification APIs | HPCZ, GNC/NMCZ, and ECZ checks must degrade gracefully |
| Never log PII or document contents | Applications contain identity, academic, and credential data |
| Preserve backward data compatibility | Existing Neon schema and production records must stay usable |
| Preserve mobile-first usability | Most applicants are on phones and weak networks |
| Keep auth cookie and CSRF protections intact | Admissions and admin actions are state-changing and sensitive |
| Treat file upload and document handling as high risk | Uploaded records are business-critical and security-sensitive |

## API Contract

The frontend API client consumes the Django `/api/v1/` contract directly. There is no translation layer or compatibility shim. Both `apps/admissions/` and `backend/` are fully aligned on resource-style REST paths under `/api/v1/`.

- Do not reintroduce old repo conventions such as root-level `src/`, `api-src/`, `api/`, or `django_api/`. Those are stale in this codebase.
- Do not introduce `?action=` query-parameter patterns. All endpoints use resource-style REST paths.

## User Roles

| Role | Capabilities |
|------|-------------|
| Student | Apply, upload documents, track status, pay, manage their own profile |
| Admin | Review applications, manage users, manage settings, verify documents and payments |
| Reviewer | Read-only review of assigned application data where enabled |
| Super Admin | Full operational access, including user and system administration |

## Core Application Flow

`Registration -> Email Verification -> Profile Setup -> Application Wizard -> Payment -> Interview -> Decision`

### Wizard Expectations

- Multi-step application flow remains the core student journey.
- Auto-save must remain silent and resilient.
- Eligibility checks are advisory, not hard blockers.
- Drafts must survive refreshes, reconnects, and interrupted sessions.

## Business Rules

| Rule | Details |
|------|---------|
| Payment timing | Payment must be completed before interview progression where required |
| Documents | Requirements vary by program and must be validated defensively |
| Grading | Zambian ECZ grading semantics must remain correct |
| Audit | Administrative state changes require audit coverage |
| Password reset | Token-based, time-bound, single-use, and rate-limited |
| Auth | Cookie-based auth remains the intended browser model |

## Security Posture

| Layer | Current Expectation |
|-------|---------------------|
| Transport | TLS only, strict transport headers in production |
| Auth | HTTP-only cookies, refresh rotation, Django-managed JWT signing |
| CSRF | Required on state-changing requests |
| Validation | Validate every input at the API boundary |
| File uploads | Validate content type and file shape defensively |
| Audit | Keep audit trails while avoiding PII in logs |
| URL safety | Prevent open redirects and unsafe external URL handling |

## Working Assumptions For Changes

When modifying code, always verify:

- Which package you are changing: `apps/admissions`, `backend`, or `shared`
- Whether the code follows the `/api/v1/` REST contract
- Whether the change affects draft persistence, auth cookies, CSRF, uploads, or admin actions
- Whether the change is safe on mobile and degraded networks
- Whether you need to update frontend tests, backend tests, or both

## Development Guardrails

- All backend work targets `backend/` with routes under `/api/v1/`.
- All frontend API calls use `apiClient.request()` with resource-style REST paths. Do not use raw `fetch()` for API calls.
- If a task spans frontend and backend, check both sides before assuming parity.
