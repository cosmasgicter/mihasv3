# Task 4.2 — Atomic tenant-admin invitation and membership handoff

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Requirements **R4.3, R4.4,
R6.3** · Findings **TEN-01, TEN-05** · Design §5.3 (People And Access), §6.1
(Tenant Aggregate), §17 (durable committed outbox).

Candidate commit (base): `bae29a28d9657f288b3339062adb31285959c966` (this task's
changes are staged in the working tree on top of it).
Schema fingerprint (new `tenant_staff_invitations` table on Neon):
`9b1e7307e7b0c0f05ce1583d313944d4` (30 objects).

## What the fix does

The old `TenantOnboardingWizard` invite (finding **TEN-01**) created a **global
admin** user and a membership across **several browser calls** — it could stop
before the membership (leaving an orphan admin), and it made the operator type
an **initial password** that was **shown and persisted in `localStorage`**.
Staff/grant forms also required pasting a **raw profile UUID** (finding
**TEN-05**).

This task replaces that with one **server-owned atomic command**:

- **Invite by email** (R6.3): look up an existing identity by email (reused,
  never duplicated) or create a new one **without a usable password**; create the
  `TenantStaffInvitation` and the `UserInstitutionMembership` in the **same
  transaction** (R4.3). A failure rolls the whole thing back — **no orphan
  admin** (R4.4).
- **No plaintext credential** (R4.3): only the **SHA-256 hash** of a single-use
  token is stored; the raw token appears **only** in the emailed accept link
  (trusted tenant/platform URL via `email_links`). The invited admin sets their
  **own** password by consuming the token (the "handoff") — the operator never
  sets, sees, or stores a password. The initial-password field and its
  `localStorage` persistence are removed.
- **Search selector** (R6.3, TEN-05): staff invite uses an accessible email/name
  search selector (`/admin/staff/candidates/`), not raw UUID entry. The invented
  `staff`/`admissions`/`finance`/`viewer` roles are removed in favour of the
  canonical `admin`/`reviewer`.
- **Lifecycle**: existing identity, expired invite, resend (token rotation),
  accept, and revoked invite are all handled; every command emits a tenant
  Audit_Event + a durable committed outbox row (design §17); revoke deactivates
  the membership and revokes the member's sessions (R3.5).

## Files

Backend:
- `backend/scripts/2026_07_21_01_tenant_staff_invitations.sql` (+ `_rollback.sql`)
- `backend/apps/catalog/models.py` — `TenantStaffInvitation` (managed=False)
- `backend/apps/catalog/staff_invitation_service.py` — `StaffInvitationService`
- `backend/apps/catalog/staff_invitation_views.py` — v1 admin + public accept views
- `backend/apps/catalog/admin_urls.py` — `/admin/staff/invitations|candidates/...`
- `backend/apps/accounts/urls.py` — public `/auth/staff-invitation/accept/`
- `backend/apps/common/email_links.py` — `staff_invitation_url()`

Frontend:
- `apps/admissions/src/services/admin/tenants.ts` — invite/list/search/resend/revoke
- `apps/admissions/src/services/auth.ts` — `acceptStaffInvitation()`
- `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` — TEN-01 fix
- `apps/admissions/src/pages/admin/tenants/TenantStaffPanel.tsx` — TEN-05 fix
- `apps/admissions/src/pages/auth/AcceptInvitationPage.tsx` (+ route registry/config)

## API surface (v1, `{"success","data"}` envelope, capability-gated)

| Method | Path | Authority |
|--------|------|-----------|
| POST | `/api/v1/admin/staff/invitations/` | super_admin `platform.user.manage_all` or `tenant.staff.invite` (+ role ceiling) |
| GET | `/api/v1/admin/staff/invitations/?institution=` | super_admin or `tenant.staff.read` (tenant-scoped) |
| GET | `/api/v1/admin/staff/candidates/?q=&institution=` | super_admin or `tenant.staff.invite` |
| POST | `/api/v1/admin/staff/invitations/{id}/resend/` | `tenant.staff.invite` |
| POST | `/api/v1/admin/staff/invitations/{id}/revoke/` | `tenant.staff.disable` (or invite) |
| POST | `/api/v1/auth/staff-invitation/accept/` | public (single-use token is the guard) |

Note: exposed on `/api/v1/` (consistent with the existing tenant-admin surface
and the v1-locked frontend client; the preceding task 4.1's own frontend also
still uses v1). The reusable `StaffInvitationService` is transport-agnostic so a
future `/api/v2` slice can wrap it unchanged.

## Verified in this execution

- **Backend suites — 41 passed** (`raw/backend-pytest.txt`):
  - `tests/unit/test_staff_invitation_service.py` (24) — atomic invite, no
    plaintext credential, compensation-leaves-no-orphan, existing-identity reuse,
    role promote-up-only, accept handoff/single-use/expired/invalid/revoked,
    resend rotation, revoke, candidate search.
  - `tests/integration/test_staff_invitation_workflow.py` (15) — HTTP invite
    returns no credential, duplicate→409, tenant-admin cross-tenant→403,
    student→403, list envelope, candidate search authority, resend/revoke,
    public accept.
  - `tests/property/test_staff_invitation_properties.py` (2, hypothesis ≥120
    examples each) — Property A: no plaintext credential ever persisted (R4.3);
    Property B: invite is atomic all-or-nothing (R4.4).
- **Storage/log secret scan** — `raw/storage-log-secret-scan.md` + the executable
  guard `tests/unit/tenantStaffInvitationSecretScan.test.ts` (**9 passed**,
  `raw/frontend-secret-scan-test.txt`).
- **Neon migration** — applied + idempotent + partial-unique predicates verified;
  fingerprint `9b1e7307e7b0c0f05ce1583d313944d4` (`raw/neon-migration-validation.md`).
- **Frontend** — `tsc -p tsconfig.build.json --noEmit` clean; ESLint clean on all
  changed files; OpenAPI schema still generates.

## Runs in the task-0.4 harness (NOT executed in this isolated run)

- `apps/admissions/tests/harness-e2e/required/staff-invitation.spec.ts` — the
  browser invite journey (super-admin creates tenant → invite by email → no
  credential in response → duplicate 409 → candidate search → list/resend →
  public accept page). It requires the local E2E harness stack (Postgres/Redis/
  backend/frontend/adapters) from task 0.4, which is not spun up inside this
  subagent execution. It is part of the required matrix (task 13.2).

## Not verified here

- Full production apply of the migration (deferred to the task 13.4 Neon→prod
  rollout rehearsal; the additive/idempotent script + rollback are ready).
- Real outbound invitation email delivery (queued via the existing outbox;
  console-inbox delivery is exercised only under the harness).
