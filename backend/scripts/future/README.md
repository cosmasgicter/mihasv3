# Future / deferred migrations — NOT auto-applied

**This directory is never swept by the migration runner.**
Both `apply_sql_migrations`
(`backend/apps/common/management/commands/apply_sql_migrations.py`) and the
schema-drift checker
(`backend/apps/common/management/commands/check_schema_drift.py`) scan **only
the top level** of `backend/scripts/` — neither recurses into subdirectories.
Any `.sql` placed here will **never** be applied at container startup and will
**never** be flagged as a stale/untracked migration.

It sits alongside the existing runner-excluded subdirectories (`applied/`,
`archive/`, `migrations/`), but with a forward-looking purpose: scripts here are
**authored and reviewed ahead of time** but deliberately held back until a
proven trigger condition is met.

## Why a script lives here

A migration belongs in `future/` when:

- The design has chosen a no-schema-change V1 and documented the schema-backed
  upgrade as a later, deferred path, **and**
- We want the exact SQL written, reviewed, and version-controlled now, **but**
- It must not be auto-applied to Neon or production until an operator
  deliberately promotes it.

## Current contents

| File | Spec / design | Promote when |
|------|---------------|--------------|
| `2026_06_08_05_application_documents_is_current.sql` | `.kiro/specs/multi-tenant-beanola-remediation/` Task 7.4, R6.4; design.md §3b | The V1 query-derived `Current_Official_Version` lifecycle (Task 7.3) is proven in production and we want the drift-resistant `is_current` flag + partial unique index. |

## Promotion procedure (Neon-first, per `.kiro/steering/infrastructure.md`)

1. `git mv` the file to the **top level** of `backend/scripts/`, keeping its
   date-ordered, sequence-prefixed name so it sorts correctly.
2. Author its sibling `*_rollback.sql` — the rollback-pairing property test
   (`backend/tests/property/test_rollback_pairing.py`) requires every top-level
   forward script to ship with one.
3. Validate on a **Neon branch first**: `create_branch` → `apply_sql_migrations
   --dry-run` (confirm discovery) → apply → re-apply (assert idempotent no-op).
   Capture the branch id for the release PR.
4. Only then copy to production via `deploy/RUNBOOK.md`. Never make production
   the first place the change lands.
5. Land any required application-code change (e.g. the generator flipping the
   prior current row) in the **same** change set as the schema promotion.
