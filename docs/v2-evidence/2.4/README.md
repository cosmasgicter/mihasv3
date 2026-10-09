# Task 2.4 — Retire the fake permissions UI and legacy override authority

Findings closed: **AUTH-04** (P0), **AUTH-05** (P1, partial — see below).
Requirements: **R3.4, R3.5, R3.7, R6.2** (role contract portion), R6.3 (read-only
capabilities linkage).

## What changed

### Frontend (admissions)
- **Deleted the fake permission editor** `UserPermissions.tsx` (23 invented
  colon permissions + unsupported roles + arbitrary selections mapped back to a
  role, defaulting to `student`).
- **Added a read-only Effective_Capabilities panel**
  `UserEffectiveCapabilities.tsx`: renders the target user's backend-derived
  capability set (`platform.*` + per-institution `tenant.*`) and links operators
  to the canonical role / membership / access-grant commands. It never mutates.
- `services/admin/users.ts`: removed `ROLE_PERMISSIONS`, `getPermissions`,
  `updatePermissions`; added `getEffectiveCapabilities()` calling the new
  read-only endpoint.
- `data/users.ts`: replaced `usePermissions`/`useUpdatePermissions` with
  `useEffectiveCapabilities`.
- `Users.tsx`: wired the read-only panel; removed the save-permissions path and
  the inaccurate "custom permission overrides" copy.
- Reduced role selectors to the canonical four across `usersReducer.ts`,
  `UserStats.tsx`, `BulkUserOperations.tsx`, `UserExport.tsx`, `UserRowCard.tsx`,
  and narrowed the `UserRole` union in `types/auth.ts`. Import template sample
  role changed to `reviewer`.

### Backend
- **Retired the legacy override authority** in `apps/accounts/permissions.py`:
  `IsStudent/IsReviewer/IsAdmin/IsSuperAdmin/IsOwnerOrAdmin` are now pure role
  hierarchy (+ ownership). `_check_permission_override` is an inert `False`
  stub; the `UserPermissionOverride` table is preserved for historical data but
  no longer grants authority (Phase 12.4 removes the stub + model).
- **Removed invented colon permissions from tokens** (`apps/accounts/tokens.py`):
  the JWT `permissions` claim is present-but-empty; authority derives from the
  `role` claim via the role hierarchy + `AdminCapabilityService`.
- **Added a read-only Effective_Capabilities endpoint**
  `GET /api/v1/admin/users/{id}/effective-capabilities/`
  (`AdminUserEffectiveCapabilitiesView`), reusing `AdminCapabilityService` via
  the shared `_build_capability_payload`. Requires `platform.user.manage_all`,
  scope-masks out-of-scope targets as 404, and fails closed (zero authority +
  `resolution_error`) on a resolution failure. Registered in
  `scripts/authority_matrix_registry.py` and the view-classification governance
  list.
- `student_draft_views.py`: dropped the unsupported `admissions_officer` from a
  capacity-enrichment role gate.

### Session revoke + audit (R3.5)
Already correct and left intact: `AdminUserDetailView.patch` calls
`revoke_sessions_for_authority_change` on role change / deactivation, which
blacklists refresh JTIs, deactivates `DeviceSession` rows, and emits a
`session.revoke_authority_change` security audit event
(`apps/accounts/session_lifecycle.py`). Verified by
`tests/unit/test_authority_change_session_revocation.py` (12 passing).

## Tests run (backend, SQLite fast suite `config.settings.test`)

All green:
- `tests/unit/test_admin_user_effective_capabilities.py` — 5 (new endpoint:
  read-only projection, 404 masking, out-of-scope mask, fail-closed, denial).
- `tests/unit/test_no_invented_permissions_guard.py` — 2 (grep guard).
- `tests/property/test_rbac_properties.py` — updated
  `test_retired_override_does_not_grant_reviewer_admin_access` proves an override
  can no longer elevate a reviewer to admin.
- `tests/property/test_permissions_roundtrip.py` — model preserved.
- `tests/unit/test_admin_user_management_hardening.py` — privilege-escalation
  guards intact.
- `tests/unit/test_authority_matrix_v2.py` + `tests/unit/test_view_auth_classification.py`
  — 40 passing after registering the new route.
- `tests/unit/test_authority_change_session_revocation.py` — 12 (R3.5).

## Tests run (frontend, admissions)
- `bun run type-check` — clean.
- `tests/unit/usersRoleContract.test.ts` — 3 (only canonical roles remain).
- `tests/unit/page-verification/admin-users.test.tsx` — 8 (page renders with the
  read-only capabilities hook).
- `eslint` on all changed files — clean (the one remaining error in
  `UserImport.tsx` is a **pre-existing** `@/services/client` direct-import R14.3
  violation on line 4, unrelated to this task; my only edit there was the CSV
  sample role).

## OpenAPI
`manage.py spectacular` generates cleanly with the new endpoint present
(`/api/v1/admin/users/{id}/effective-capabilities/`). The 20 schema errors are
pre-existing `apps/common/v2/demo_views.py` fallbacks (baseline), not from this
view.

## Candidate commit + schema hash
- Base commit (HEAD): `bae29a28d9657f288b3339062adb31285959c966`
  (working tree carries the in-flight V2 changes; no new commit created — the
  orchestrator owns commits/task status).
- Candidate OpenAPI SHA-256 (generated from current source):
  `f66ecb30502b42be08ce4abdf1d2b2da546bf7abc39aef2aeacd9e11c0e794f1`.

## Schema
No database schema change. The read-only endpoint reuses existing membership /
grant tables via `AdminCapabilityService`. No Neon branch required.

## AUTH-05 status (partial)
Frontend consumes backend `Effective_Capabilities` (this task adds the per-user
read-only surface; nav/route guards already consume `CapabilityContext`). The
remaining AUTH-05 route/nav capability-declaration completeness is broader
frontend guard work tracked with tasks 2.1/2.2 and 9.x; not fully closed here.

## Not run in this environment
- **User-authority browser journey (Playwright E2E):** the required real-browser
  journey needs the full local harness (Postgres + Redis + object storage +
  console email + worker/beat + frontend preview + deterministic adapters). It
  was **not executed here** and is not relabeled as done. Executable substitutes
  that did run: the backend endpoint suite, the authority-matrix generated
  allow/deny case matrix, and the admin-users page-verification render test.
