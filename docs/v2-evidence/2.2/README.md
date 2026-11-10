# Task 2.2 — Capability/Ownership/Assignment Policies (Required_Evidence)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `admissions-v2-canonical-rebuild` · Requirements: **R3.1–R3.6** ·
Findings: **AUTH-01, AUTH-02, AUTH-05, AUTH-07, ADM-05, ADM-06**

This task consumes the task-2.1 approved authority matrix
(`docs/v2-evidence/2.1/authority-case-matrix.json` + `disclosure-policy.json`)
and enforces it: it replaces raw-role ownership gates with capability-derived
policies, aligns owner-object endpoints to the canonical 404 not-found mask
(AUTH-07), revokes/refreshes sessions on authority changes (R3.5), and adds the
generated authority + cross-tenant UUID substitution suites (R3.6).

## What shipped (production code)

| Area | Change |
|---|---|
| Canonical owner policy | `backend/apps/common/object_authorization.py` — one helper (`authorize_owned_application` / `resolve_owned_application`) implements the design §5.2 **owner** disclosure policy: owner **or** capability-scoped staff (via `AccessScopeService`, role only an input) pass; every non-owner / out-of-scope / missing id collapses to the **identical canonical 404 mask**. Supports both the flat student envelope and the nested payment envelope. |
| **AUTH-07 fix** | The owner-scoped write endpoints now 404-mask a valid-but-non-owned id instead of returning a distinguishable `403 NOT_OWNER` / `INSUFFICIENT_PERMISSIONS`: `payments/initiate`, `payments/mobile-money`, `payments/defer`, `payments/dev-bypass`, `applications/{id}/withdraw`, `applications/{id}/confirm-enrollment`, `applications/{id}/amendments`. `waitlist-position` and `conditions` (owner+scoped-staff reads, AUTH-07 family) now use the same helper so a non-owner student is 404-masked too. Payment initiate/mobile-money/defer are `owner`-class in the approved matrix (no composed staff), so they are owner-only (admins use the correction/override endpoints). |
| **Session revoke/refresh (R3.5)** | `revoke_sessions_for_authority_change(user_id, reason, actor_id)` in `backend/apps/accounts/session_lifecycle.py` blacklists each active session's refresh JTI, deactivates the `DeviceSession` rows, and emits a `session.revoke_authority_change` **security** Audit_Event (best-effort — never breaks the mutation, mirroring `blacklist_jti`/`TenantAuditService`). Wired into: **role change / deactivation** (`admin_user_views.AdminUserDetailView.patch`), **membership create/update** and **access-grant create/update** (`catalog/admin_views`), and **reviewer manual + auto assignment** (`applications/admin_assignment_views`). Access tokens expire in ~30 min, so blacklisting the refresh JTI bounds stale authority to one access-token lifetime. |

## Raw-role checks converted (by domain)

| Domain / endpoint(s) | Before (raw role, second authority) | After (capability/ownership) |
|---|---|---|
| Payment initiate / mobile-money / defer / dev-bypass | `role in ("admin","super_admin") or owner` → `403 NOT_OWNER` for the rest | `authorize_owned_application` (owner-class) → **404 mask** for every non-owner |
| Application withdraw / confirm-enrollment / amendments | `str(app.user_id) != uid` → `403 INSUFFICIENT_PERMISSIONS` | owner-only helper → **404 mask** |
| Application waitlist-position / conditions | `role in ("admin","super_admin")` owner-or-admin, non-owner student → `403` | owner **or** `AccessScopeService` scoped-staff helper → **404 mask** (role only an input) |

The remaining staff surfaces (review, verify-document, bulk, export, settlement,
audit, interview write, amendment review, fee, catalog institution CRUD) still
gate on the `IsAdmin`/`HasPlatformCapability` permission class **composed with
`AccessScopeService` scope-before-lookup** — so the **P0 cross-tenant isolation
guarantee already holds** for them (proven below). Their remaining
non-conformance is a **disclosure nuance** (a non-staff caller gets `403`
where the matrix's ideal is a `404` mask) — enumerated precisely in
`authority-conformance-summary.json` as the tracked follow-up for the
capability-class conversion.

## Evidence artifacts

| Artifact | Purpose |
|---|---|
| `authority-conformance-summary.json` | **Generated at runtime** by `tests/property/test_authority_matrix_generated.py`. Runs all **1610** cases of the 2.1 case matrix against the live endpoints as the five actors × two tenants. **1244/1610 (77.3%) conformant; the 514 hard-guarantee cases (anonymous denial + cross-tenant object no-leak) have 0 failures.** Lists the 30 endpoints with the residual 403-vs-404 disclosure follow-up. |
| `pytest-output.txt` | Raw command + pass/fail record for every required run. |

## Test suites added (R3.6)

- `backend/tests/property/test_authority_matrix_generated.py` — **the generated
  authority suite**. Consumes the 2.1 case matrix (does not invent a parallel
  one). Hard-asserts, under `production_scope`:
  - **Unauthenticated → denied** on every protected endpoint.
  - **Cross-tenant UUID substitution → never leaks a tenant-B identifier** and
    never succeeds on a tenant-B object, for Student / Reviewer / Tenant_Admin
    scoped to tenant A (the named cross-tenant UUID substitution suite).
  - **Cross-tenant object existence masked** (status-indistinguishable from a
    non-existent id) on the enforced scope-before-lookup + AUTH-07 surfaces.
  - **AUTH-07 owner 404 mask** on the hardened owner endpoints.
  - Writes the full-matrix conformance summary and asserts the hard-guarantee
    subset is 100% conformant.
- `backend/tests/unit/test_authority_change_session_revocation.py` — R3.5:
  proves the helper deactivates the user's active sessions, leaves other users
  untouched, and writes the `session.revoke_authority_change` security audit
  event.

Updated existing owner-disclosure tests to the canonical 404 mask (part of the
AUTH-07 fix, not a weakening): `test_payment_envelope_contract` (initiate
non-owner → `NOT_FOUND`), `test_enrollment`, `test_amendments`, `test_waitlist`.

## Verification (real repo commands — safety-sensitive R3 change)

```
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest \
  tests/property/test_authority_matrix_generated.py \
  tests/unit/test_authority_change_session_revocation.py \
  tests/unit/test_payment_envelope_contract.py tests/unit/test_amendments.py \
  tests/unit/test_enrollment.py tests/unit/test_waitlist.py \
  tests/unit/test_authority_matrix_v2.py
# 94 passed
```

Broad regression sweep across every touched domain (payments, applications,
catalog admin, accounts, sessions, reviewer assignment, cross-tenant isolation,
scoped-access matrix): **269 passed, 20 pre-existing skips, 0 new failures**.

Task 2.1 zero-unclassified gate re-run (`tests/unit/test_authority_matrix_v2.py`):
**PASS** — the approved matrix still holds after the 2.2 changes.

OpenAPI (`ENABLE_JOBS_OPS_ROUTES=1 manage.py spectacular`): regenerates at
product `2.0.0` with **0 warnings and the same 20 pre-existing V2 demo-view
errors from the 0.5 baseline (zero new errors)**. No auth/response-contract
**shape** changed — the AUTH-07 endpoints already declared a 404 response; only
the non-owner disclosure **status** moved 403 → 404.

## What was verified vs not

- **Verified:** owner 404-mask (AUTH-07) on the named endpoints; the P0
  cross-tenant no-leak guarantee across all object-scoped endpoints × 3 actors;
  session revocation deactivates sessions + blacklists JTIs + audits; the 2.1
  gate still passes; OpenAPI has no new errors. All on the SQLite fast suite.
- **Deferred (Postgres-only / follow-up):** (1) converting the remaining staff
  `IsAdmin`/platform permission classes to the derived tenant/platform
  **capability** with a `404` (not `403`) mask for non-staff callers — the 30
  endpoints + 71 cases enumerated in `authority-conformance-summary.json`; these
  are a disclosure nuance, not a P0 leak. (2) Postgres-only DB constraint checks
  are unaffected by authority behaviour and were not run in this sandbox.
