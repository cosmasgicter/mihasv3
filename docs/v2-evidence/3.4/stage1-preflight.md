# Task 3.4 — Stage 1: read-only orphan/validation preflight (Neon default branch)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.4**
**Requirements:** R15.3–R15.4, R18.7 | **Findings:** DATA-07
**Branch:** `br-floral-scene-aha2ybfd` (Neon **default**), project `wild-bar-37055823`,
db `neondb`. **Read-only** — every statement is a `SELECT`; no mutation touched the
default branch or the self-hosted production Postgres.
**Raw capture:** [`raw/preflight-neon-default.txt`](raw/preflight-neon-default.txt).

## Why this task exists (DATA-07)

The June 2026 tenant migration scripts add their foreign keys **`NOT VALID`** so they
could ship additively/online (enforced for new rows, existing rows left unscanned).
No validation migration accompanied them, so a schema built by `apply_sql_migrations`
(the self-hosted production DB) carries **28** unvalidated tenant FKs. Task 3.2's
`2026_07_16_03_..._validate.sql` validates the 4 `applications` canonical FKs; this
task (3.4) validates the remaining **24**. R15.4: "a remaining `NOT VALID` tenant
constraint SHALL block V2".

## Inventory — the 24 `NOT VALID` tenant FKs (grep of the June scripts)

`grep -nE 'NOT VALID' backend/scripts/2026_06_*` → 28 tenant FKs added `NOT VALID`:

| June script | NOT VALID FKs | owner |
|---|---|---|
| `2026_06_08_01_multi_tenant_beanola_admissions.sql` | 21 (4 `applications` canonical + 17 tenant) | 4 → task 3.2; 17 → task 3.4 |
| `2026_06_08_03_institution_document_profiles.sql` | 4 (`fk_doc_profiles_*`) | task 3.4 |
| `2026_06_08_04_communication_templates_tenant.sql` | 1 (`fk_comm_templates_institution`) | task 3.4 |
| `2026_06_18_01_institution_domain_lifecycle.sql` | 2 (`institution_domains_{created_by,approved_by}_id_fk`) | task 3.4 |

28 − 4 (applications, task 3.2) = **24** tenant FKs owned + validated by task 3.4.
The always-on test `TestValidationMigrationCoverage` re-derives this set directly from
the June scripts at CI time, so the inventory cannot silently drift.

## Preflight result on the Neon default branch

Run [`inventory.sql`](inventory.sql) against the branch:

- **Block A** (any `NOT VALID` FK anywhere): `[]` — **zero**. The authoring DB is
  Django-built; its tenant FKs already exist **validated** under Django-generated
  names. The June-script *names* are absent here (Block B: all 24 `present=false`).
- **Block C** (orphan preflight, 24 anti-joins): **0 orphans** on every relationship.
- **Block D** (row counts): most tenant tables empty; `programs.canonical_program_id`
  is all-NULL, `communication_templates.institution_id` NULL on the 33 platform rows —
  NULL FK columns never dangle, so nothing to repair.

**Repair/quarantine decision:** none required (0 orphans). No row is mutated; the
task-3.2 exception ledger is not needed for 3.4. If a future environment shows an
orphan, `VALIDATE CONSTRAINT` fails closed (aborts + rolls back) rather than marking
a broken constraint valid — exactly R15.3 — and the operator repairs or quarantines
via the ledger before re-running.

## Where the genuine `NOT VALID` state lives

Because Neon is Django-built, the default branch cannot itself demonstrate the
`NOT VALID → VALIDATE` transition on the June-named constraints. That genuine state
(the self-hosted production shape produced by `apply_sql_migrations`) is faithfully
reproduced and validated on the reused rehearsal branch in
[`stage2-neon-branch.md`](stage2-neon-branch.md), and deterministically in the
Postgres test layer (`test_verify_manifest_gate_fails_then_passes`).
