# Runbook — Multi-Tenant Beanola Admissions Migration Rollout

Spec: `.kiro/specs/multi-tenant-beanola-remediation/` (remediation), building on
`.kiro/specs/multi-tenant-beanola-admissions/` (original feature).

This runbook is the operator-facing procedure for deploying the additive
multi-tenant admissions schema and validating the remediation behaviours
(cross-tenant scope, backend-stored official documents, tenant document
profiles, tenant-aware communication templates, program-first assignment, and
payment settlement metadata). It complements:

- `docs/multi-tenant-beanola-handover.md` (architecture map + validation SQL),
- `docs/multi-tenant-beanola-progress.md` (code-complete / staging-validated /
  production-applied state), and
- `docs/multi-tenant-beanola-backfill-exception-report.md` (Phase 1 staging
  validation evidence).

## Deployable migrations (top-level `backend/scripts/`)

The Migration_Runner (`apply_sql_migrations`) sweeps **only** the top level of
`backend/scripts/*.sql` (it excludes `applied/`, `archive/`, and `migrations/`),
sorts by filename, and skips `*_rollback.sql`. The four migrations this rollout
applies, in lexical (apply) order:

1. `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql` — the
   Tenant_Migration: canonical/tenant tables, nullable canonical-ID columns,
   backfill, `NOT VALID` FKs.
2. `backend/scripts/2026_06_08_student_number.sql` — per-`(institution_code,
   year)` student-number sequences and the `next_student_number(p_code, p_year)`
   SQL helper. Depends on the tenant schema, so it must sort **after** the
   Tenant_Migration.
3. `backend/scripts/2026_06_08_03_institution_document_profiles.sql` — tenant
   document profiles that drive official-document (acceptance-letter, slip,
   receipt) generation per institution/offering/program.
4. `backend/scripts/2026_06_08_04_communication_templates_tenant.sql` —
   tenant-aware communication templates.

Each migration is additive and idempotent (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `INSERT … ON CONFLICT`, `CREATE INDEX IF NOT
EXISTS`, `ADD CONSTRAINT … NOT VALID`). Re-running the runner is a no-op once a
file is recorded in `migration_history`.

> **Ordering note (student-number filename).** The remediation design specified
> renaming `2026_06_08_student_number.sql` → `2026_06_08_02_student_number.sql`
> so it sorts immediately after the `_01_` tenant migration. That rename is
> **only safe on a DB where the old filename has not already been recorded in
> `migration_history`** (see the precheck under "Migration-history
> reconciliation" below). On this checkout the file keeps its original name
> `2026_06_08_student_number.sql`; lexically `2026_06_08_01_...` still sorts
> before `2026_06_08_student_number.sql`, so the tenant schema is present before
> the student-number migration runs. Do not reference a `_02_` path that does
> not exist on disk.

## Golden rule — Neon first, production second

**The database you author against is not the database production runs on.**
See `.kiro/steering/infrastructure.md`.

- **Neon** (serverless Postgres, project `mihasApplication` /
  `wild-bar-37055823`, region `aws-us-east-1`) is the **authoring / staging**
  database. Branch it, apply, and prove every change here first. Reach it via
  the Neon MCP tools or the `DATABASE_URL` in `backend/.env`.
- **Production** is the self-hosted Docker Postgres container `mihas-postgres-1`
  (`postgres:17-alpine`) on the AWS EC2 host
  `ec2-13-244-37-190.af-south-1.compute.amazonaws.com`. It is **not** exposed on
  a public port; reach it only by SSH-ing to the box and using
  `docker compose exec postgres`.

> **Never apply production DB changes from this development environment.** This
> repo / dev shell authors and validates against Neon. The production apply is a
> separate operator action performed on the EC2 box, during a maintenance
> window, and **gated on explicit user confirmation — it is never an automatic
> task run from here.**

## Prerequisite gate — Migration_History_Prerequisite

`apply_sql_migrations` refuses to run until the migration-history-extend
prerequisite is applied — it raises `MIGRATION_HISTORY_NOT_EXTENDED` when
`migration_history.checksum` is missing.

- Prerequisite script: `backend/scripts/2026_05_22_migration_history_extend.sql`.
- Confirm it is applied on the target DB before doing anything else:
  ```sql
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'migration_history' AND column_name = 'checksum';
  -- and the unique index the ON CONFLICT target relies on:
  SELECT 1 FROM pg_indexes WHERE indexname = 'uq_migration_history_migration_name';
  ```
  Both must return a row before proceeding. Stop if either is missing.

---

## Operator rollout steps (in order)

Work top-to-bottom. Steps 1–8 happen on Neon (authoring/staging). Steps 9–14
are the gated production apply + validation on the EC2 box. **Do not start the
production apply (step 9) without explicit user confirmation.**

### 1. Back up the production DB

Always back up before any production write. Use the repo's backup helper, run
**on the EC2 box** (`deploy/backup-db.sh`, which `pg_dump`s out of the
`mihas-postgres-1` container), or follow `deploy/RUNBOOK.md` §3 and
`docs/runbooks/database-backup-restore.md`.

```bash
ssh -i /home/cosmas/Downloads/mihasapplication2026.pem \
  ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com
cd ~/mihas
./deploy/backup-db.sh        # writes a timestamped pg_dump of mihas-postgres-1
```

Confirm the backup file exists and is non-empty before continuing. Never leave a
plaintext dump on disk longer than needed (`shred -u` when done).

### 2. Verify the Migration_History_Prerequisite

Run the prerequisite checks from the "Prerequisite gate" section above against
the target DB (Neon for staging, then the production container for the gated
apply). If `2026_05_22_migration_history_extend.sql` is not applied, apply it
first (Neon → production) and re-verify. Stop if it is missing.

### 3. Dry-run + confirm the Tenant_Migration appears in discovery

On Neon (and again on the box before the production apply):

```bash
cd backend
python manage.py apply_sql_migrations --dry-run
```

Confirm the output lists the pending Tenant_Migration
`2026_06_08_01_multi_tenant_beanola_admissions.sql` (and the other three
top-level migrations not yet recorded), that they sort with `_01_` first, and
that the additive-only lint passes (no `DROP`/`TRUNCATE`/`DELETE FROM`). If the
tenant migration does **not** appear, it is mis-placed in an excluded
subdirectory — stop and fix the relocation (this is exactly what the
`test_migration_drift_guard.py` guards catch).

For risky validation, create a Neon branch first (`create_branch`) and dry-run
against the branch, exactly as Phase 1 did.

### 4. Apply in a maintenance window

Apply only after the dry-run is clean and the prerequisite is verified. On Neon
first (default branch or a validated branch promoted in), then — as the gated
production step — on the EC2 box during a short maintenance window:

```bash
cd backend
python manage.py apply_sql_migrations
```

The runner executes each file in one `transaction.atomic()`. The Tenant_Migration
adds its FK constraints as `NOT VALID` in the final `DO` block, so the in-transaction
backfill `UPDATE`s queue no FK-check trigger events and the `CREATE INDEX` /
`ADD CONSTRAINT` statements are unobstructed (verified on a Neon branch against
production-copy data, Phase 1).

> The production image also runs `apply_sql_migrations` on boot, so a normal
> redeploy of the box applies any pending top-level migration. Running it
> manually in the maintenance window lets you watch the output and validate
> before traffic resumes.

### 5. Post-migration validation SQL

Run against the just-migrated DB (canonical source: handover doc §"Production
Migration Procedure" step 5). Inspect every returned row:

```sql
select count(*) as canonical_programs from canonical_programs;
select count(*) as programs_without_canonical
  from programs
  where canonical_program_id is null and coalesce(is_active, true) = true;
select count(*) as applications_without_institution_id from applications where institution_id is null;
select count(*) as applications_without_program_id   from applications where program_id is null;
select count(*) as applications_without_offering_id  from applications where program_offering_id is null;
select count(*) as applications_without_intake_id    from applications where intake_id is null;
select hostname, count(*) from institution_domains group by hostname having count(*) > 1;
select slug, count(*) from institutions where slug is not null group by slug having count(*) > 1;
```

`canonical_programs` must be non-zero. Duplicate hostname/slug queries must
return **zero** rows. Legacy applications with null canonical IDs are expected
and must remain readable (step 7 of the handover procedure); triage them in the
backfill exception report before running `VALIDATE CONSTRAINT` on the `NOT VALID`
FKs.

### 6. Validate MIHAS / KATC sample official-document generation

Official documents are now **profile-driven** and generated/stored on the
backend (no client-side official PDFs). Seed the tenant document profiles, then
generate a sample for each institution:

```bash
cd backend
python manage.py seed_tenant_document_profiles
```

Then generate a sample acceptance letter / application slip / receipt for a
MIHAS application and a KATC application and confirm:

- the correct institution brand (logo, name, support/admissions email) renders
  from the institution's document profile, not a hard-coded fallback;
- the KATC nursing-style division line and signatory render correctly;
- documents generated **before** the migration remain readable and unchanged.

### 7. Onboard a test school on staging

On Neon/staging only, onboard a future test school end-to-end (institution row,
slug, brand assets, `institution_domains` hostname, a canonical-program link,
and an offering). Confirm:

- the white-label host resolves to the test school's brand;
- the shared Beanola brand still renders for the default portal host;
- the test school's catalog choices are filtered correctly for its host.

Do this on staging — do not create throwaway test schools in production.

### 8. Validate school-staff scope (out-of-scope = 404)

Sign in as a regular (non-super-admin) staff member scoped to one institution
via `user_institution_memberships` / `access_grants` and confirm
`AccessScopeService` enforces tenant isolation:

- in-scope applications, payments, and documents load normally;
- **out-of-scope** applications, payments, and documents return **404** (masked,
  not 403) — including the admin document-extract path;
- a super-admin still sees everything.

There must be **no** non-super-admin path that loads applications, payments, or
documents without going through `AccessScopeService`.

### 9. Validate the program-first flow

> **Production apply gate.** Steps 9 onward against production happen only after
> explicit user confirmation, on the EC2 box, in the maintenance window. On
> staging you can run them freely.

Create a new application through the program-first wizard and confirm:

- the student picks a **canonical program** first, then `OfferingAssignmentService`
  resolves institution + offering + intake + required documents;
- assignment is revalidated at submission, not only at draft creation;
- the new application writes **all four** canonical IDs (`institution_id`,
  `program_id`, `program_offering_id`, `intake_id`);
- residency/nationality and capacity rules apply; ties break deterministically.

### 10. Validate payment settlement metadata

Drive a payment to settlement (or replay a `collection.settled` webhook on
staging) and confirm the settlement snapshot is captured on `payments.metadata`
(`institution_id`, `institution_name`, `program_id`, and the `settlement`
block), and that `GET /api/v1/payments/settlements/` groups tenant-scoped
payments by institution / offering / currency with an explicit "Unassigned"
bucket for missing metadata. Settlement events update metadata only — they must
not mutate payment status.

### 11. Monitor audit logs and errors

After apply, watch:

- `audit_logs` for assignment, scope, document-generation, and payment events;
- GlitchTip (project 22431) for new backend/frontend errors;
- container logs (`docker compose -f docker-compose.prod.yml logs web beat
  celery`) for migration or runtime errors;
- the post-migration validation counts again after some live traffic.

Hold the maintenance window open until error and audit signals are clean.

### 12. Application-code rollback plan

**The schema is additive — there is no schema revert in a routine rollback.**

- To roll back behaviour, redeploy the **previous backend image** (or flip the
  relevant feature path). The added tenant tables/columns are simply unused by
  older code; they impose no runtime cost and break nothing.
- The legacy string snapshots (`applications.institution` / `program` /
  `intake`) stay populated throughout, so old applications and previously
  generated official documents remain readable before, during, and after a
  rollback.
- **Do not** drop the tenant tables/columns as part of a routine rollback — that
  would discard backfilled canonical IDs and any tenant configuration created
  since apply, and is irreversible. A genuine destructive teardown (abandoning
  the feature) must be a separately reviewed non-additive script applied
  manually with `--allow-non-additive`, with a fresh backup first — never
  through the container-startup sweep.

> **Canonical rollback posture:** the full platform rollback posture (code
> rollback, forward-only additive migrations, feature-flag disable-without-data-
> drop, and graceful-degradation levers) lives in
> [`database-backup-restore.md` → "Rollback Posture (R9.7)"](database-backup-restore.md#rollback-posture-r97),
> cross-referenced by [`release-and-rollback.md`](release-and-rollback.md). This
> §12 covers the tenant-cutover-specific case; the canonical doc governs the
> general decision order.

---

## Migration-history reconciliation (out-of-band applies)

If the Tenant_Migration was ever hand-applied to a DB under its **old**
pre-relocation filename `0001_multi_tenant_beanola_admissions.sql` (when it
still lived in `backend/scripts/migrations/`), then `migration_history` records
the old name, and the runner would try to apply the relocated
`2026_06_08_01_multi_tenant_beanola_admissions.sql` a second time. The SQL is a
safe no-op re-run (every statement is `IF NOT EXISTS` / `ON CONFLICT`), but to
avoid a duplicate history row and an unnecessary re-run, insert a history row
for the **new** filename so the runner skips it:

```sql
-- Only on a DB where the OLD filename was hand-applied out-of-band.
-- Insert a history row for the NEW filename so the runner treats it as applied.
INSERT INTO migration_history (migration_name, applied_at)
VALUES ('2026_06_08_01_multi_tenant_beanola_admissions.sql', now())
ON CONFLICT (migration_name) DO NOTHING;
```

This is the only safe way to reconcile a renamed/relocated tracked migration. It
is an **operator step, never an automatic one**, and only applies to DBs where
the old name was applied out-of-band.

### Student-number rename precheck

Before renaming `2026_06_08_student_number.sql` to a `_02_`-prefixed name on any
shared DB, confirm the old filename has **not** been recorded:

```sql
SELECT 1 FROM migration_history
WHERE migration_name = '2026_06_08_student_number.sql';
```

- **Zero rows returned** → the rename to `2026_06_08_02_student_number.sql` is
  safe (the runner has never recorded the old name).
- **One or more rows** → **do not rename.** Keep the file as
  `2026_06_08_student_number.sql` and, if you need the tenant migration to sort
  first under a new sequence scheme, use a `_00_`-prefixed copy of the tenant
  migration so it still sorts ahead of the student-number file **without**
  touching the existing student-number history row.

On the current checkout the file is `2026_06_08_student_number.sql` (rename not
applied), which already sorts after `2026_06_08_01_...`, so no action is needed
here beyond honouring this precheck on any DB before a future rename.

---

## Phase 1 staging evidence (already completed)

- Validated on Neon branch `br-tiny-bonus-ahz81bof` (forked from `main`
  `br-floral-scene-aha2ybfd`), project `wild-bar-37055823`.
- Backfill linked all 33 applications to all four canonical IDs after the
  code-aware backfill fix (see the exception report); 0 manual exceptions.
- All 21 `NOT VALID` FKs validated; all 11 supporting indexes present.
- P16 idempotency + backfill tests pass against the real branch (6/6).
- **Production application has NOT happened.** It remains the gated operator
  step above, performed on the EC2 box and confirmed by the user.
