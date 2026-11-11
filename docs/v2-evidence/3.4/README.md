# Task 3.4 — Validate every tenant foreign key (evidence index)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.4**
**Requirements:** R15.3–R15.4, R18.7
**Findings:** DATA-07 (June tenant FKs added `NOT VALID`; no validation migration)
**Required evidence:** zero invalid tenant constraints in each schema manifest
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`, HEAD).
The task-3.4 artifacts (the validation SQL + rollback, the test, this evidence folder)
sit as **untracked / unstaged working-tree changes on top of** that commit, pending
commit. See [`raw/commit.txt`](raw/commit.txt).
**Neon rehearsal-branch fingerprint (after validation):**
`sha256:c6b39faaadce1b143f2e9906f098ec28268777b16b3e4a5ce1e42ed64017c9d4`

This task runs `ALTER TABLE ... VALIDATE CONSTRAINT` for the 24 tenant foreign keys the
June 2026 tenant scripts introduced `NOT VALID`, after a read-only orphan preflight, so
the task-3.1 schema verifier reports **zero invalid tenant constraints** — the R15.4
gate ("a remaining `NOT VALID` tenant constraint SHALL block V2"). Schema work was
**Neon-branch-first**; nothing was applied to the Neon default branch or the
self-hosted production Postgres.

## This task was RESUMED — partial work found and reconciled

A prior dispatch had authored the implementation but produced no verification or
evidence. Verified and kept:

| Artifact | State found | Action |
|---|---|---|
| `backend/scripts/2026_07_18_01_tenant_fk_validate.sql` | complete: guarded, `convalidated`-gated `VALIDATE` loop over the 24 June-named FKs | kept; rehearsed on Neon + Postgres |
| `backend/scripts/2026_07_18_01_tenant_fk_validate_rollback.sql` | documented no-op (`SELECT 1`) | kept; verified additive-lint clean, no `DROP` |
| `backend/tests/unit/test_tenant_fk_validation_3_4.py` | 12-way coverage/hygiene + Postgres reproduction/verifier-gate/idempotence/fail-closed suite | kept; runs **12 passed** on Postgres |

**Gaps this run closed:**

1. **No verification had ever been run.** Executed the full test suite on CI-parity
   local Postgres 17: **12 passed** (incl. the failing-first verifier-gate test).
2. **`docs/v2-evidence/3.4/` did not exist** — the SQL header referenced
   `inventory.sql` / `stage2-rehearsal.md` that were never written. Created the folder,
   ran the read-only preflight on the Neon default branch, and rehearsed the online
   `VALIDATE` + lock measurement on the reused branch.
3. **The inventory was re-grounded** against the live June scripts (`grep -n 'NOT VALID'`)
   and the live Neon catalog — the 24-FK set matches exactly (28 June `NOT VALID` FKs −
   4 `applications` canonical FKs owned by task 3.2).

## The 24 tenant FKs (all additive; `NOT VALID` → `VALIDATE`, R15.1/R15.4)

Validated by `backend/scripts/2026_07_18_01_tenant_fk_validate.sql`:

- `programs_canonical_program_id_fk`
- `institution_assets_{institution_id,created_by_id}_fk`
- `institution_templates_{institution_id,created_by_id}_fk` (on `institution_document_templates`)
- `required_documents_{institution_id,program_id,canonical_program_id}_fk` (on `institution_required_documents`)
- `institution_domains_{institution_id,created_by_id,approved_by_id}_fk`
- `memberships_{user_id,institution_id,created_by_id}_fk` (on `user_institution_memberships`)
- `access_grants_{user_id,institution_id,program_id,application_id,created_by_id}_fk`
- `fk_doc_profiles_{institution,program,canonical_program,intake}` (on `institution_document_profiles`)
- `fk_comm_templates_institution` (on `communication_templates`)

The 4 `applications` canonical FKs (`applications_{institution,program,program_offering,intake}_id_fk`)
are **not** in this set — task 3.2's `2026_07_16_03_..._validate.sql` owns them. The
always-on coverage test enforces this partition so neither task double-owns a constraint.

## Required evidence

- **Zero invalid tenant constraints in each schema manifest** — Neon **default**
  (authoring) branch [`schema-manifest-neon-default.json`](schema-manifest-neon-default.json)
  + verify [`schema-manifest-verify-neon-default.json`](schema-manifest-verify-neon-default.json)
  (**0 failures**); Neon **rehearsal** branch after-validation
  [`schema-manifest-neon-branch-after.json`](schema-manifest-neon-branch-after.json)
  (71 tables) + verify report [`schema-manifest-verify-after.json`](schema-manifest-verify-after.json)
  (**0 failures, 0 warnings**). Local-Postgres before/after pair proves the transition:
  [`schema-manifest-verify-local-before.json`](schema-manifest-verify-local-before.json)
  (**24 `unvalidated_foreign_key` failures**) →
  [`schema-manifest-verify-local-after.json`](schema-manifest-verify-local-after.json) (**0**).
- **Orphan preflight** — [`inventory.sql`](inventory.sql) Block C on the Neon default
  branch: **0 orphans** across all 24 FK relationships
  ([`raw/preflight-neon-default.txt`](raw/preflight-neon-default.txt)).
- **Online validation + lock behaviour** — reproduced the genuine production `NOT VALID`
  state on the reused branch, measured `VALIDATE CONSTRAINT` holds only a
  **`ShareUpdateExclusiveLock`** (reads/writes continue), validated 24→0
  ([`stage2-neon-branch.md`](stage2-neon-branch.md), [`raw/rehearsal-neon-branch.txt`](raw/rehearsal-neon-branch.txt)).
- **Regression suite** — `backend/tests/unit/test_tenant_fk_validation_3_4.py`: **12 passed**
  on Postgres ([`raw/pytest-pg-task-3.4.txt`](raw/pytest-pg-task-3.4.txt)), incl.
  `test_verify_manifest_gate_fails_then_passes` (verifier FAILS with the 24 `NOT VALID`
  FKs, PASSES after the script), idempotence, Django-built no-op, and orphan fail-closed.

## Verification summary

- **Task-3.4 test suite** on CI-parity local Postgres 17: **12 passed** — 3 always-on
  coverage/hygiene, 3 always-on inventory-vs-June-scripts + additive-lint, 6 Postgres
  reproduction/gate/idempotence/no-op/fail-closed.
- **Neon default branch (read-only)**: 0 `NOT VALID` FKs already, 0 orphans (Stage 1).
- **Neon rehearsal branch**: reproduced 24 `NOT VALID` → applied script → **0** `NOT VALID`,
  24 validated; idempotent re-run = no-op; manifest verify **0 failures** (Stage 2).

## Files

| File | What it records |
|---|---|
| `inventory.sql` | READ-ONLY preflight (Block A NOT-VALID scan, Block B June-FK presence, Block C orphan anti-joins, Block D row counts, Block E gate count). Lives under `docs/`, not swept by `apply_sql_migrations`. |
| `stage1-preflight.md` | Neon default-branch read-only preflight (no mutation) + the DATA-07 inventory derivation. |
| `stage2-neon-branch.md` | Reproduce → online `VALIDATE` → lock measurement → after-state on reused branch `br-jolly-pine-ahybtg2e`. |
| `schema-manifest-neon-default.json` | Task-3.1 manifest from the Neon default (authoring) branch, read-only. |
| `schema-manifest-verify-neon-default.json` | Verify report for the default-branch manifest (0 failures). |
| `schema-manifest-neon-branch-after.json` | Task-3.1 manifest emitted from the rehearsal branch (after validation). |
| `schema-manifest-verify-after.json` | `schema_manifest --verify` of the Neon after-manifest (0 failures). |
| `schema-manifest-local-before.json` / `...-after.json` | Local-Postgres full-schema manifests, before (24 NOT VALID reproduced) and after the task-3.4 script. |
| `schema-manifest-verify-local-before.json` / `...-after.json` | Verify reports for the local pair: 24 failures → 0. |
| `raw/preflight-neon-default.txt` | Raw Stage 1 SELECT results (NOT-VALID scan, presence, FK counts, 24 orphan counts, row counts). |
| `raw/rehearsal-neon-branch.txt` | Raw Stage 2 reproduce/lock/validate/after/idempotence results. |
| `raw/pytest-pg-task-3.4.txt` | Raw 12-passed Postgres test run. |
| `raw/commit.txt` | Candidate commit SHA + branch. |

## Operator-gated production path (NOT run here)

Neon default-branch and self-hosted production application remain operator steps
(infrastructure.md: author on Neon, prove, then production; production writes are
backup-first):

1. Back up production (`deploy/backup-db.sh`).
2. Run [`inventory.sql`](inventory.sql) Blocks A–C on the production DB (read-only) to
   confirm 0 orphans; if any orphan exists, repair deterministically or quarantine into
   `canonical_assignment_exceptions` (task 3.2) **before** validating.
3. Apply `2026_07_18_01_tenant_fk_validate.sql` via `apply_sql_migrations` (the boot
   sweep runs the forward script; the `*_rollback.sql` no-op is excluded by suffix).
   `VALIDATE CONSTRAINT` takes only `SHARE UPDATE EXCLUSIVE`, so reads/writes continue
   during the deployment window.
4. Re-run [`inventory.sql`](inventory.sql) Blocks A + E on production to confirm **0**
   `NOT VALID` tenant FKs, and regenerate the production schema manifest for the release
   gate.

`VALIDATE CONSTRAINT` is non-destructive and the rollback is a deliberate no-op (a
validated FK stays valid; the FKs themselves are owned by the June scripts, not this
task), so there is no destructive step in the forward path.
