# Task 1.2 — Neon branch validation of the relocated Tenant_Migration

Validation evidence for the release PR (Requirements R1.1, R1.2, R1.8).
**No production DB was touched** — all work was done on a disposable Neon branch
of project `mihasApplication` (`wild-bar-37055823`) per `.kiro/steering/infrastructure.md`.

## Branch

| Field | Value |
|-------|-------|
| Project | `mihasApplication` (`wild-bar-37055823`) |
| Validation branch id | `br-empty-field-ahafg5ar` |
| Branch name | `validate-tenant-migration-relocation` |
| Parent branch | `br-floral-scene-aha2ybfd` (default) |
| Database | `neondb` |

## Prerequisite check

`migration_history` on the branch already carries the `checksum` column
(`2026_05_22_migration_history_extend.sql` applied), so the runner's
`MIGRATION_HISTORY_NOT_EXTENDED` guard does not fire. Neither
`2026_06_08_01_multi_tenant_beanola_admissions.sql` nor
`2026_06_08_student_number.sql` had a `migration_history` row before validation
(both pending), so this branch exercised a true first apply.

## 1. Dry-run discovery (`apply_sql_migrations --dry-run`)

```
Pending migrations: 2/13
  [dry-run] would apply: 2026_06_08_01_multi_tenant_beanola_admissions.sql (sha256=7f0e69390dff)
  [dry-run] would apply: 2026_06_08_student_number.sql (sha256=57165411afb5)
Applied 2 migration(s) successfully.
```

Confirms the relocated migration appears in discovery at the
Deployable_Migration_Path and sorts (`_01_`) before `2026_06_08_student_number.sql`.

## 2. Apply (first run)

```
Pending migrations: 2/13
  applying: 2026_06_08_01_multi_tenant_beanola_admissions.sql (sha256=7f0e69390dff) ... OK
  applying: 2026_06_08_student_number.sql (sha256=57165411afb5) ... OK
Applied 2 migration(s) successfully.
```

## 3. Re-apply (idempotence — second run is a no-op)

```
All 13 migrations already applied. Nothing to do.
```

## 4. Schema landed

Multi-tenant tables present on the branch after apply:
`access_grants`, `canonical_programs`, `institution_assets`,
`institution_document_templates`, `institution_domains`,
`institution_required_documents`, `institutions`.

## 5. migration_history rows recorded

| migration_name | checksum | applied_at |
|----------------|----------|------------|
| `2026_06_08_01_multi_tenant_beanola_admissions.sql` | `7f0e69390dffe8c1e7e3788f3830fbe435eb153aefaf366c3ebf7253431de7aa` | 2026-06-09T04:51:57Z |
| `2026_06_08_student_number.sql` | `57165411afb50e3524bc89fcfda5388ca9354255ec80c547784e5de9b8dd4b05` | 2026-06-09T04:52:01Z |

## Notes / cleanup

- The validation branch `br-empty-field-ahafg5ar` is disposable. Deleting it is a
  destructive Neon MCP operation (`delete_branch`) and was **not** run
  autonomously — leave it for the release PR record or delete it on request.
- Production application of this migration remains the operator step in the
  Phase 12 rollout runbook, gated on explicit confirmation. It was **not**
  applied to production from this environment.
