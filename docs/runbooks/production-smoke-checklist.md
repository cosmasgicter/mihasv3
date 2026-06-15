# Production Smoke Checklist (Manual)

> **Spec:** `.kiro/specs/beanola-production-readiness/` — Task 17.4, Requirement
> **R8.9** ("THE system SHALL provide a documented manual smoke checklist for
> production release covering the critical flows"). Also satisfies the
> post-deploy Smoke_Check set in **R14.3** and is linked from release notes per
> **R13.5**.

## Purpose

A single-execution, human-run checklist the Operator works through **immediately
after a production deploy** to confirm every critical Beanola flow works before
users do. This is the manual companion to the automated guards in
[`post-deploy-smoke-check.md`](post-deploy-smoke-check.md) — run the automated
script first, then walk this checklist.

This checklist is **read-only / safe-environment** by design: it exercises real
production surfaces but never applies destructive DB changes, never forces a real
payment to settle, and uses staged/test accounts and a single staged application.

## How to use

- Run **after** `./scripts/smoke-production.sh` passes (see
  [`post-deploy-smoke-check.md`](post-deploy-smoke-check.md)).
- Work top to bottom. Tick `[x]` for **PASS**, leave `[ ]` and record the
  failure detail in the Notes column for **FAIL**.
- Any FAIL → stop rollout and follow
  [`release-and-rollback.md`](release-and-rollback.md). Apply the targeted
  degradation posture from R14.4–R14.6 (disable the failing feature
  route/action, stop payment initiation while keeping submission safe, or show
  "generation failed" and block official-document download — never serve a stale
  client PDF).
- On completion, record date/time + outcome in
  `docs/multi-tenant-beanola-progress.md` (R14.8).

## Environment

| Field | Value (fill in at run time) |
|-------|------------------------------|
| Release tag / commit | |
| Frontend base URL | e.g. `https://apply.beanola.com` |
| Backend API base URL | e.g. `https://api.beanola.com` |
| Operator | |
| Date / time (UTC) | |

Default route/endpoint references below are verified against the repo
(`apps/admissions/src/routes/config.tsx`, `backend/config/urls.py`, and the app
`urls.py` files). Routes are SPA paths on the frontend base URL; endpoints are
`/api/v1/...` on the backend base URL.

---

## 1. Public surface

### 1.1 Public home loads with Beanola branding
- **Check:** Open `/` (public landing page).
- **Expected:** Page returns 200 and renders; header/footer/copy present Beanola
  as the platform; school names (if shown) come only from tenant data; no raw
  MIHAS/KATC platform-level branding and no hard-coded fees or health-only copy
  on the generic surface.
- **Result:** [ ] PASS / FAIL — Notes:

### 1.2 Contact mailto uses a Beanola address
- **Check:** Open `/contact`; inspect the email contact link and the "draft
  email" action.
- **Expected:** The `mailto:` link resolves to a Beanola address
  (`admissions@beanola.com`, per `apps/admissions/src/lib/constants/landing.ts`).
  No legacy non-Beanola sender address is shown.
- **Result:** [ ] PASS / FAIL — Notes:

### 1.3 Public tracker works without PII leak
- **Check:** Open `/track-application`; submit a valid-format code that does not
  exist (e.g. `APP-20250101-ABCD1234`), then a malformed code (e.g. `NOTACODE`).
  Backed by `GET /api/v1/applications/track/?code=...`.
- **Expected:** Malformed format → 400 with `INVALID_FORMAT` guidance;
  valid-format-but-missing → descriptive 404. No applicant PII (name, NRC,
  contact, document data) appears in any tracker response for an anonymous
  caller.
- **Result:** [ ] PASS / FAIL — Notes:

---

## 2. Authentication

### 2.1 Signup works
- **Check:** From `/auth/signup`, register a fresh test student account
  (`POST /api/v1/auth/register/`); complete email verification.
- **Expected:** Account is created, verification email is received, and the
  verified account can reach the student dashboard.
- **Result:** [ ] PASS / FAIL — Notes:

### 2.2 Login works
- **Check:** From `/auth/signin`, log in with the test student account
  (`POST /api/v1/auth/login/`).
- **Expected:** Login succeeds, an HTTP-only auth cookie is set, CSRF bootstrap
  succeeds, and `/student/dashboard` loads.
- **Result:** [ ] PASS / FAIL — Notes:

---

## 3. Student critical flow

### 3.1 Catalog loads
- **Check:** As the logged-in student, start the wizard at `/apply` (or
  `/student/application-wizard`); confirm programmes/intakes load. Backed by
  `GET /api/v1/catalog/context/` and `GET /api/v1/catalog/canonical-programs/`.
- **Expected:** Canonical programmes and open intakes render (non-empty);
  envelope shape is `{"success": true, "data": ...}` with the standard
  pagination shape where paginated.
- **Result:** [ ] PASS / FAIL — Notes:

### 3.2 Wizard creates a draft
- **Check:** Progress through the wizard far enough to trigger auto-save. Backed
  by `POST /api/v1/applications/draft/`.
- **Expected:** A draft application is created/persisted silently; refreshing the
  page resumes the draft without data loss (auto-save + dirty-state protection
  intact).
- **Result:** [ ] PASS / FAIL — Notes:

### 3.3 Assignment preview works
- **Check:** On the programme/intake selection step, confirm the assigned
  institution preview resolves. Backed by
  `GET /api/v1/catalog/assignment-preview/`.
- **Expected:** The preview returns the assigned institution for the chosen
  canonical programme + intake (white-label/host context honoured); a
  no-eligible-offering case surfaces a clear, recoverable message rather than a
  raw error.
- **Result:** [ ] PASS / FAIL — Notes:

### 3.4 Payment initiation works (safe environment)
- **Check:** On the payment step, initiate a mobile-money collection. Backed by
  `POST /api/v1/payments/mobile-money/` (mobile money is primary;
  `POST /api/v1/payments/initiate/` for the card widget config). **Do not force
  a real settlement** — verify initiation only, in a safe/test environment.
- **Expected:** Fee resolves on the step, mobile-money operators are visible,
  initiation returns a pending Payment, and no raw phone number is persisted
  (only `phone_hash` / `phone_last4`). The defer-payment option remains
  available.
- **Result:** [ ] PASS / FAIL — Notes:

---

## 4. Admin / tenant surface

### 4.1 Admin login at `/admin/tenants` (main Beanola product admin tenant surface)
- **Check:** Log in as an admin and open `/admin/tenants` (guard `admin`, per
  `apps/admissions/src/routes/config.tsx`). This is the **authoritative** admin
  tenant surface for the launch smoke check — the main Beanola product admin
  tenant route, authoritative per the canonical architecture freeze (R1) and the
  documented admin route in R14.3. The Django operational admin in 4.2 is a
  **separate** surface and is checked separately.
- **Expected:** The tenant/school management page loads with the admin's scope
  context visible; no horizontal overflow at 360px; tables degrade to
  cards/scroll containers on mobile.
- **Result:** [ ] PASS / FAIL — Notes:

### 4.2 Django operational admin at `/beanola-admin-panel/` (checked separately)
- **Check:** Open `/beanola-admin-panel/` on the **backend** base URL
  (`backend/config/urls.py`: `path("beanola-admin-panel/", admin.site.urls)`).
  This is the low-level Django operational admin, distinct from the product admin
  surface in 4.1.
- **Expected:** The Django admin login renders and authenticates for a staff
  superuser; it is reachable only as the operational surface, not linked from the
  student/admin product UI.
- **Result:** [ ] PASS / FAIL — Notes:

### 4.3 Super-admin tenant onboarding loads
- **Check:** As super-admin, exercise the tenant onboarding surfaces:
  create/inspect an institution (`POST/GET /api/v1/admin/institutions/`), upload
  a logo/signature asset
  (`POST /api/v1/admin/institutions/{id}/assets/upload/`), inspect a document
  profile (`/api/v1/admin/institutions/{id}/document-profiles/`), add a staff
  membership (`POST /api/v1/admin/memberships/`), create a scoped access grant
  (`POST /api/v1/admin/access-grants/`), and run the routing simulator
  (`POST /api/v1/admin/routing/simulate/`).
- **Expected:** Each surface loads/responds with the standard envelope;
  onboarding completes for a staged institution; the routing simulator output
  matches the real assignment service.
- **Result:** [ ] PASS / FAIL — Notes:

### 4.4 Staff scoped-data check passes
- **Check:** As a school-staff user with a scoped access grant, list/open
  applications, payments, and documents through the staff/admin views. Scope is
  enforced by `backend/apps/catalog/services.py:AccessScopeService`.
- **Expected:** The staff user sees **only** in-scope tenant data (in-scope →
  API_Envelope); object-level checks use canonical IDs; the scope/school context
  is visible in the UI.
- **Result:** [ ] PASS / FAIL — Notes:

### 4.5 Official-document generation works for one staged application
- **Check:** For one staged application that has a configured document profile,
  generate an official document (e.g. acceptance letter or application slip) and
  download it. Backed by
  `GET /api/v1/applications/{id}/official-documents/{document_type}/`.
- **Expected:** The download serves the **backend-stored** Official_Document
  (never a client render); provenance records institution, profile id+version,
  asset ids, and fingerprint; no document bodies/PII/secrets appear in audit
  logs.
- **Result:** [ ] PASS / FAIL — Notes:

---

## 5. Negative / boundary check

### 5.1 Wrong-school staff check (out-of-scope masks as 404)
- **Check:** As a school-staff user, attempt to read an application / payment /
  document that belongs to **another** institution (or via an expired access
  grant), using the same staff/admin endpoints as 4.4.
- **Expected:** The response is the **Not_Found_Envelope** — byte-identical to a
  genuine miss (out-of-scope → 404, expired grant → 404). No cross-tenant data,
  IDs, or existence signal leak. This confirms Property 26 (tenant isolation)
  holds end-to-end.
- **Result:** [ ] PASS / FAIL — Notes:

---

## 6. Platform health & monitoring

### 6.1 Health checks pass
- **Check:** `GET /health/live/`, `GET /health/ready/`, and `GET /health/redis/`
  on the backend base URL.
- **Expected:** `/health/live/` → 200; `/health/ready/` → 200 (DB connectivity +
  Redis/Celery readiness); `/health/redis/` → 200.
- **Result:** [ ] PASS / FAIL — Notes:

### 6.2 Email render/send uses a Beanola or tenant template
- **Check:** Trigger one transactional email in the staged flow (e.g.
  application-submitted or payment-received) and inspect the delivered message.
- **Expected:** The email renders via the component system
  (`backend/apps/common/email/`) with Beanola or tenant visual identity and a
  Beanola/tenant sender; no legacy MIHAS-platform sender or branding.
- **Result:** [ ] PASS / FAIL — Notes:

### 6.3 Error monitoring shows no deployment errors
- **Check:** Open the GlitchTip project (22431) and review the deploy window.
- **Expected:** No new unhandled errors attributable to the deploy on either the
  backend (`sentry-sdk`) or frontend (`@sentry/react`) surfaces; the
  Beanola-default alert email (`ERROR_ALERT_EMAIL`) is configured.
- **Result:** [ ] PASS / FAIL — Notes:

---

## Sign-off

| Field | Value |
|-------|-------|
| All items PASS? (Y/N) | |
| If N, failing item IDs | |
| Degradation posture applied (R14.4–R14.6) | |
| Recorded in `docs/multi-tenant-beanola-progress.md`? (Y/N) | |
| Operator signature | |
| Date / time (UTC) | |

## Related runbooks

- [post-deploy-smoke-check.md](post-deploy-smoke-check.md) — automated deploy-time guards + script
- [release-and-rollback.md](release-and-rollback.md) — rollback flow
- [multi-tenant-beanola-rollout.md](multi-tenant-beanola-rollout.md) — gated Neon-first cutover
- [database-backup-restore.md](database-backup-restore.md) — DB recovery
