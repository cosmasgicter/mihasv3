# Task 2.4 — Invented-permissions grep report (AUTH-04 / R3.4)

This is the "grep report for invented permissions" Required_Evidence for task
2.4. It records the invented colon-permission vocabulary and unsupported roles
that existed in product source **before** the change, and proves **zero**
remain **after**. It is backed by an executable guard so it cannot silently
regress:

- Guard: `backend/tests/unit/test_no_invented_permissions_guard.py`
  - `test_no_invented_colon_permissions_in_product_source`
  - `test_no_unsupported_roles_in_product_source`

Product-source scope (the shipped surface): `backend/apps/**` (excluding
`migrations`) and `apps/admissions/src/**`. Test fixtures, archived specs,
skills, and immutable evidence snapshots are intentionally out of scope for the
shipped-surface check.

## Search patterns

- Invented colon permissions (regex):
  `\b(users|applications|payments|programs|documents|profile|settings|analytics|notifications|audit|student|reviewer|admin|super_admin|owner):(read|write|delete|create|review|verify|access|make_own|read_own|update_own|upload_own)\b`
- Unsupported roles (regex):
  `\b(admissions_officer|registrar|finance_officer|academic_head)\b`

## Before (invented vocabulary / unsupported roles removed)

| File | What was there |
|------|----------------|
| `apps/admissions/src/components/admin/UserPermissions.tsx` | Fake permission editor: 23 invented colon permissions (`users:read`, `applications:review`, …) + `ROLE_DEFAULT_PERMISSIONS` keyed by unsupported roles. **Deleted.** |
| `apps/admissions/src/services/admin/users.ts` | `ROLE_PERMISSIONS` colon map + `getPermissions`/`updatePermissions` mapping arbitrary selections back to a role (defaulting to `student`). **Removed.** |
| `backend/apps/accounts/permissions.py` | `_check_permission_override` consulting `UserPermissionOverride` with `admin:access` / `student:access` / `reviewer:access` / `super_admin:access` / `owner:access`. **Retired** (inert stub; classes are pure role hierarchy). |
| `backend/apps/accounts/tokens.py` | `_get_permissions_for_role` embedding an invented colon-permission catalogue into the JWT `permissions` claim. **Emptied** (claim present-but-empty; authority is the `role` claim + `AdminCapabilityService`). |
| `apps/admissions/src/pages/admin/lib/usersReducer.ts` | `ROLE_VALUES` / `AVAILABLE_ROLES` including `admissions_officer`, `registrar`, `finance_officer`, `academic_head`. **Reduced to the four canonical roles.** |
| `apps/admissions/src/components/admin/UserStats.tsx` | `ROLE_LABELS` + icon/color switches for the four unsupported roles. **Reduced.** |
| `apps/admissions/src/components/admin/BulkUserOperations.tsx` | Role option list with the four unsupported roles. **Reduced.** |
| `apps/admissions/src/components/admin/UserExport.tsx` | Role filter list with the four unsupported roles. **Reduced.** |
| `apps/admissions/src/components/admin/UserRowCard.tsx` | Role option list with the four unsupported roles. **Reduced.** |
| `apps/admissions/src/components/admin/UserImport.tsx` | CSV import template sample row used `admissions_officer`. **Changed to `reviewer`.** |
| `apps/admissions/src/types/auth.ts` | `UserRole` union included the four unsupported roles. **Narrowed to the canonical four.** |
| `backend/apps/applications/student_draft_views.py` | Capacity-enrichment role gate included `admissions_officer`. **Reduced to `admin`/`super_admin`.** |

Also removed: `apps/admissions/tests/property/rbac.property.test.ts` — an already
broken (collection-error) test importing a non-existent `@/lib/auth/permissions`
module built entirely on the retired colon vocabulary.

## After (verified 2026-07-15)

```
$ grep -rnE '\b(...resources...):(...actions...)\b' backend/apps apps/admissions/src --include='*.py' --include='*.ts' --include='*.tsx' | wc -l
0
$ grep -rnE '\b(admissions_officer|registrar|finance_officer|academic_head)\b' backend/apps apps/admissions/src --include='*.py' --include='*.ts' --include='*.tsx' | wc -l
0
```

Zero invented colon permissions and zero unsupported roles remain in product
source. The executable guard (above) enforces this going forward.

## Canonical vocabulary (retained)

- Roles: `student`, `reviewer`, `admin`, `super_admin` (backend `ROLE_HIERARCHY`
  and `AdminUserCreate`/`AdminUserUpdate` serializer choices).
- Capabilities: the 17 `platform.*` + 17 `tenant.*` dotted strings in
  `AdminCapabilityService` (unchanged).
