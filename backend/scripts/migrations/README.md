# Legacy migrations directory — NOT auto-applied

**This directory is excluded from the `apply_sql_migrations` sweep.**
The runner (`backend/apps/common/management/commands/apply_sql_migrations.py`)
only scans the top level of `backend/scripts/`; `migrations/` is listed in
`EXCLUDED_SUBDIRS` alongside `applied/` and `archive/`. Any `.sql` placed here
will **never** be applied at container startup.

## Why it is empty of migrations

The multi-tenant Beanola foundation migration that used to live here
(`0001_multi_tenant_beanola_admissions.sql`) was moved up one level to the
deployable path so the runner actually applies it:

```
backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql
```

The `_01_` prefix makes it sort before `2026_06_08_student_number.sql`, so the
tenant schema (canonical programs, tenant tables, nullable canonical-ID
columns) is present before any migration that depends on those columns.

## Where production migrations go

Put new hand-written, additive, idempotent migrations at the **top level** of
`backend/scripts/` using the `YYYY_MM_DD[_NN]_description.sql` convention. They
are applied in lexicographic filename order and tracked in `migration_history`.

A drift guard (`backend/tests/unit/test_migration_drift_guard.py`) fails the
build if a production (non-rollback, non-archive) `.sql` is placed inside this
directory again.
