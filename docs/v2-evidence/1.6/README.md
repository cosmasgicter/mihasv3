# Task 1.6 Evidence — Email-Verification Contract + Centralized Email Links

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/`
**Task:** 1.6 — Implement or deliberately remove the unimplemented
email-verification contract
**Requirements:** R9.1, R9.7 · **Findings:** STU-21, STU-24
**Baseline commit:** `bae29a28d9657f288b3339062adb31285959c966`

---

## 1. Decision: REMOVE (documented migration), not implement

Email verification is **deliberately not implemented**, and the untrue
verification contract is **removed** through a documented migration. This
completes the in-flight decision recorded in
`backend/apps/common/email_links.py`.

R9.7 permits either path:

> EMAIL links SHALL be generated from trusted tenant/platform configuration and
> registered frontend routes. If email verification is required, token issue,
> expiry, consume, resend, duplicate registration, and verified-session rules
> SHALL work end to end; otherwise verification claims and dead state SHALL be
> removed through a documented migration.

**Why removal is the coherent, spec-aligned choice (verified, not assumed):**

- There is **no** verify-email endpoint, URL, `EmailVerification` model, or
  token anywhere (`backend/apps/accounts/urls.py` has only login, logout,
  refresh, register, session, password-reset, password-reset/confirm, profile).
- **No login gate** reads `email_verified`
  (`apps/accounts/authentication.py`, `auth_views.LoginView`).
- **No submission gate** reads `email_verified`
  (`apps/applications/services.py`).
- Building issue/expiry/consume/resend + verified-session rules would add a new
  mandatory blocker to the core student journey with **no product driver** —
  the platform already treats accounts as usable on registration, and the
  grep/route/gate evidence shows nothing depends on a verified state. Removing
  the dead claim is lower-risk and matches the actual runtime behavior.

No security or product regression results from removal: nothing in the codebase
consumes a "verified" state to protect an action, so there is no protection to
lose.

---

## 2. Complete inventory of email-verification state (and disposition)

| # | Location | State found | Disposition |
|---|----------|-------------|-------------|
| 1 | `backend/apps/accounts/models.py` `Profile.email_verified` | legacy `BooleanField(null=True, blank=True)`, no default | **Retained** as a Legacy_Exception; added `default=True` + doc comment so no new row is NULL/ambiguous (closes hardening-contract C5). See `legacy-exception-email_verified.md`. |
| 2 | `backend/scripts/00_full_schema.sql` `profiles.email_verified boolean NULL` | DB column | **Retained** (backward data compatibility). No schema change; `default=True` is a Python/ORM-level default only (`managed=False`). |
| 3 | `backend/apps/accounts/auth_views.py` `RegisterView` | sets `email_verified=True` on registration + NOTE | **Kept** — coherent with the removal decision (account immediately usable). |
| 4 | Seeds/harness: `seed_dev_data.py`, `seed_school_admins.py`, `harness_seed_tenants.py`, `harness_bootstrap.py` | set `email_verified=True` | **Kept** — consistent with the model default. |
| 5 | `backend/tests/integration/test_student_journey_e2e.py` | asserted `email_verified is False` then flipped True (**failed at line 303** in the 0.5 baseline) | **Reconciled** — Step 2 now asserts the account is immediately usable (`email_verified is True`), documents the no-verification decision, and drops the dead flip. |
| 6 | `apps/admissions/src/lib/constants/landing.ts` | "Verify your email and you are in." | **Removed** verification copy → "Takes 2 minutes and you are in." |
| 7 | `apps/admissions/src/pages/auth/SignUpPage.tsx` | helper text "We'll verify this address." | **Removed** verification copy → "We'll send account updates here." |
| 8 | `backend/apps/accounts/auth_views.py` register response | "Registration successful. Please check your email." (both duplicate + new-account paths) | **Corrected** to "Registration successful. You can now sign in." (honest + still enumeration-safe: identical on both paths). |
| 9 | verify-email endpoint / route / model / login gate / submission gate | **absent** | Confirmed absent by grep + a route-resolver assertion test. |

`landing.ts` "we just verify your documents differently" (document review, not
email verification) and `useWizardGrades.ts` "verify your grades" (unrelated
AI/grades copy, owned by tasks 7.4/7.5) were left untouched.

---

## 3. Centralized email-link generation (R9.7) + corrected nonexistent routes

`backend/apps/common/email_links.py` is the single source of truth for
tenant/platform base URLs **and** registered route paths. Resolution order
(trusted tenant/platform configuration): active verified primary
`InstitutionDomain` → institution `website` → neutral Beanola platform
`FRONTEND_URL`. Passing no institution (neutral/unresolved context) returns the
neutral platform base — never a hardcoded MIHAS/KATC host.

### Nonexistent-route links corrected

| Location | Before (broken) | After (registered route) |
|----------|-----------------|--------------------------|
| `email_links.ROUTE_TRACK_APPLICATION` | `/track` | `/track-application` (matches `routeRegistry.ts` `publicTrackApplication`) |
| `email_links.ROUTE_STUDENT_APPLICATION` | `/student/application` (unused, no bare route) | **removed** (only `/student/application/:id` exists) |
| `email/messages/acceptance.py` | `portal + "/student/application"` | `portal + ROUTE_STUDENT_DASHBOARD` |
| `email/messages/conditional_acceptance.py` | `portal + "/student/application"` | `portal + ROUTE_STUDENT_DASHBOARD` |
| `email/messages/application_submitted.py` | `portal + "/student"` | `portal + ROUTE_STUDENT_DASHBOARD` |

All email-link route paths in `email_links.py` were verified against
`apps/admissions/src/routes/routeRegistry.ts`: `/auth/signin`, `/auth/signup`,
`/auth/forgot-password`, `/auth/reset-password`, `/student/dashboard`,
`/student/payment`, `/student/interview`, `/track-application`, `/` all exist.

### Emails now using `email_links.py` (no hardcoded / nonexistent URLs)

| Email | Path | Uses `email_links` |
|-------|------|--------------------|
| Password reset | `accounts/password_views.py` (real send path) | `password_reset_url()` (already) |
| Duplicate registration notice | `accounts/auth_views.py` | `signin_url()`, `forgot_password_url()` (already) |
| Acceptance / Conditional / Submitted / Interview / Payment / Rejection | `common/email/messages/*.py` | route constants + `platform_base_url()` fallback (this task) |
| Template-driven (`communication_service`) | `_default_portal_url` / `_derive_portal_url` | now delegate to `platform_base_url()` / `tenant_base_url()` (this task) |

Out of scope / intentionally unchanged: `email/shell.py` footer displays the
neutral text `apply.beanola.com` (neutral platform identity, not a link);
`outbox._safe_action_url` uses `FRONTEND_URL` as an open-redirect guard for
in-app notification action URLs (a separate safety concern, not email links).

### Tenant vs neutral host resolution — proven

`backend/tests/integration/test_email_links_and_verification_removal.py`
asserts, against real DB rows and the real render/send path:

- neutral context → neutral Beanola host + registered routes (never `/track`,
  never a MIHAS/KATC host);
- an active verified primary `InstitutionDomain` → links on the **tenant** host;
- two tenants never cross;
- an inactive/`pending_review` domain **fails closed** to the neutral host;
- the password-reset **send path** queues an `EmailQueue` body carrying the
  centralized, correctly-routed link and no verification link;
- component templates emit `/student/dashboard` (not the retired bare routes) on
  the caller's tenant/neutral host.

---

## 4. Verification commands and results

Run against the isolated sqlite test settings (never Neon/production), per
`tech.md` and the journey-test header:

```
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest \
  tests/integration/test_email_links_and_verification_removal.py \
  tests/integration/test_student_journey_e2e.py \
  tests/unit/test_email_messages.py \
  tests/unit/test_email_component_system.py \
  tests/integration/test_communication_template_variables.py \
  tests/property/test_communication_template_properties.py --hypothesis-seed=0
```

**Result: 84 passed** (raw output: `raw/pytest-1.6.txt`). Includes:

- `test_email_links_and_verification_removal.py` — **15 passed** (new task-1.6 evidence).
- `test_student_journey_e2e.py::test_full_student_journey` — **passed**
  (was **FAILING at line 303** in the 0.5 baseline; now reconciled).
- `test_email_messages.py` + `test_email_component_system.py` — all passed
  (route/fallback changes preserve rendering).
- `test_communication_template_variables.py` + Property 22 — all passed
  (rerouting `_derive_portal_url` keeps `portal_url` brand-safe + non-empty).

Also verified: `python manage.py check` — no issues; accounts auth/CSRF,
outbox-helper, email-wiring, email-dispatch, and auth-property suites — all
passed (67 additional tests).

No serializer or endpoint contract changed (register/login/reset request/response
shapes are unchanged), so **no OpenAPI regeneration is required** for this task.

---

## 5. Honestly deferred (R1.5)

A full **Playwright browser journey** driving real DNS/host overrides against the
task-0.4 harness stack + the Mailpit console inbox (asserting the delivered
email's link host/route in a browser for both a tenant host and the neutral
host) is **deferred to the Phase 13 verification matrix**
(`tasks.md` 13.2 / R18.2). It is not claimed as complete here.

The strongest executable evidence provisionable in this environment is provided
instead: backend integration tests that assert the generated link host/route for
tenant vs neutral context, driven through the **real** email render + send path
(`render_message` and the `POST /api/v1/auth/password-reset/` endpoint →
`EmailQueue`).

---

## 6. Artifacts

- `README.md` — this decision + inventory + verification record.
- `legacy-exception-email_verified.md` — registered Legacy_Exception (owner + removal date).
- `raw/pytest-1.6.txt` — raw pytest summary output.
- Test of record: `backend/tests/integration/test_email_links_and_verification_removal.py`.
