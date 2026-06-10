# Runbook — Multi-Tenant Beanola Admissions Migration Rollout

Spec: `.kiro/specs/multi-tenant-beanola-admissions/`.
Migration: `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql`.

This runbook covers applying and (if ever needed) rolling back the additive
multi-tenant schema migration. It complements `docs/multi-tenant-beanola-handover.md`
(architecture map) and `docs/multi-tenant-beanola-backfill-exception-report.md`
(the Phase 1 staging validation evidence).

## Prerequisite gate

`apply_sql_migrations` refuses to run until the migration-history-extend
prerequisite is applied — it raises `MIGRATION_HISTORY_NOT_EXTENDED` when
`migration_history.checksum` is missing.

- Prerequisite script: `backend/scripts/2026_05_22_migration_history_extend.sql`.
- Confirm it is applied (production main was verified for Phase 1):
  ```sql
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'migration_history' AND column_name = 'checksum';
  -- and the unique index the ON CONFLICT target relies on:
  SELECT 1 FROM pg_indexes WHERE indexname = 'uq_migration_history_migration_name';
  ```
  Both must return a row before proceeding.

## Apply procedure (staging first, then production)

1. **Confirm the prerequisite** (above). Stop if missing.
2. **Branch + backup.** Create a Neon branch from `main` (copy-on-write — it is
   the isolated backup). Never apply directly to `main` for the first run.
3. **Dry-run.** `python manage.py apply_sql_migrations --dry-run` — lists the
   tenant migration as pending and runs the additive-only lint (the file
   contains only `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `INSERT … ON CONFLICT`, `UPDATE`, `CREATE INDEX IF NOT EXISTS`, and
   `ADD CONSTRAINT … NOT VALID` — no `DROP`/`TRUNCATE`/`DELETE FROM`).
4. **Apply.** `python manage.py apply_sql_migrations` (runs the whole file in
   one `transaction.atomic()`).
5. **Validate** with the post-migration SQL (see
   `docs/multi-tenant-beanola-handover.md` §5 and the exception report):
   canonical-program count, programs without canonical link, applications
   missing each canonical ID, duplicate hostnames/slugs, duplicate active
   memberships. Inspect every returned row.
6. **Triage backfill exceptions**, then `VALIDATE CONSTRAINT` the `NOT VALID`
   FKs (only after backfill is resolved — task 3.4).
7. **Verify** legacy null-ID applications remain readable, new applications
   write all four canonical IDs, and pre-migration official documents are
   unchanged.

### Whole-file single-transaction safety

`apply_sql_migrations` runs the entire script in one transaction. This is safe
because the migration adds the tenant FK constraints (on `applications`,
`programs`, etc.) only in its final `DO` block, as `NOT VALID` — so the backfill
`UPDATE`s earlier in the same transaction queue no FK-check trigger events, and
the subsequent `CREATE INDEX` / `ADD CONSTRAINT` statements are unobstructed.
Verified on a Neon branch against committed production-copy data (Phase 1,
task 3.5).

## Rollback note

**The migration is additive. On rollback, leave the new tables and columns in
place — no destructive revert is required or recommended.**

- The migration only **adds**: new tables (`canonical_programs`,
  `institution_assets`, `institution_document_templates`,
  `institution_required_documents`, `institution_domains`,
  `user_institution_memberships`, `access_grants`), new **nullable** columns on
  `institutions` / `programs` / `program_intakes` / `applications`, new indexes,
  and `NOT VALID` foreign keys. It never drops or rewrites existing columns, and
  it never touches the legacy string snapshots
  (`applications.institution` / `program` / `intake`).
- To roll back the **application code** to the previous single-tenant release,
  redeploy the prior image. The added tables/columns are simply unused by old
  code — they impose no runtime cost and break nothing. This mirrors the
  payment-hardening rollout's "additive schema = code-only rollback" posture.
- **Do not** attempt to drop the tenant tables/columns as part of a routine
  rollback. A destructive teardown would discard backfilled canonical IDs and
  any tenant configuration created since apply, and is irreversible. If a
  destructive teardown is ever genuinely required (e.g. abandoning the feature
  permanently), it must be a separately reviewed, non-additive script applied
  manually with `--allow-non-additive`, with a fresh backup taken first — never
  through the container-startup `apply_sql_migrations` sweep.
- The legacy columns stay populated throughout, so old applications and
  previously generated official documents remain readable before, during, and
  after any rollback.

## Phase 1 staging evidence (already completed)

- Validated on Neon branch `br-tiny-bonus-ahz81bof` (forked from `main`
  `br-floral-scene-aha2ybfd`), project `wild-bar-37055823`.
- Backfill linked all 33 applications to all four canonical IDs after the
  code-aware backfill fix (see the exception report); 0 manual exceptions.
- All 21 `NOT VALID` FKs validated; all 11 supporting indexes present.
- P16 idempotency + backfill tests pass against the real branch (6/6).
- Production application of the migration is task 28, gated on this staging
  proof.
