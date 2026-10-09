# Task 3.3 — Stage 2: expand rehearsal + introspection (isolated Neon branch)

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.3**
**Branch used:** `br-jolly-pine-ahybtg2e` (name `v2-task-3.2-rehearsal`), a **ready,
non-default, non-protected** branch forked from the default `br-floral-scene-aha2ybfd`.
Reused as the 3.2→3.3 rehearsal chain because the Neon project is at its branch limit
(create returned 422 `branches limit exceeded`); the branch is disposable and isolated
from production. Nothing here touched the default branch or the self-hosted production
Postgres.

## What was applied

The **expand** script — `backend/scripts/2026_07_17_01_integrity_constraints_expand.sql`
— was applied verbatim as an 11-statement transaction (Neon MCP `run_sql_transaction`).
It is additive-only (CREATE INDEX / ADD CHECK), so it is safe to rehearse autonomously.
It applied with **zero errors**, i.e. no existing row on the branch violated any new
constraint — corroborating the Stage 1 default-branch preflight against a second,
post-3.2-shaped data snapshot.

Pre-apply, the branch had only the legacy `communication_templates_template_key_key`
(none of the task 3.3 objects existed).

## Introspection — every object exists with the intended definition

Full capture: [`raw/introspection-neon-branch.txt`](raw/introspection-neon-branch.txt).
Machine-readable manifest (task-3.1 tool): [`schema-manifest-neon-branch.json`](schema-manifest-neon-branch.json).

- **5 CHECK constraints:** `chk_access_grants_scope_target` (canonical
  `institution|program_offering|application` + target-not-null), plus the four
  `chk_{program_intakes,intakes}_{capacity,enrollment}_nonneg` `>= 0` guards.
- **7 partial/null-safe unique indexes:** `uq_program_fees_one_active` (partial on
  `is_active`), the three `uq_access_grants_active_{institution,program,application}`
  (partial on `is_active` + scope), `uq_doc_profiles_scope_version` and
  `uq_comm_templates_key_inst_version` (both `NULLS NOT DISTINCT`), and
  `uq_comm_templates_one_active` (`NULLS NOT DISTINCT` + partial on `is_active`), plus
  `uq_applications_waitlist_position` (partial, canonical-ids-present only).
- **ProgramIntake pair unique:** the pre-existing Django `unique_together`
  `program_intakes_program_id_intake_id_key UNIQUE (program_id, intake_id)` is present, so
  the expand DO-block guard **correctly skipped** creating the duplicate
  `uq_program_intakes_program_intake` — the intended idempotent behaviour.

## Schema manifest (task 3.1 tool) — regenerated after the change

```
schema_manifest --emit ... --dsn-env <branch DSN>
  -> vendor=postgresql tables=71 fingerprint=sha256:9204b18e3e357bdb016432a7048256e213268274b4b10b0c862d4304f784b4bd
schema_manifest --verify schema-manifest-neon-branch.json \
  --required-index uq_program_fees_one_active --required-index uq_comm_templates_one_active \
  --required-index uq_applications_waitlist_position --required-index uq_doc_profiles_scope_version
  -> "0 failures, 0 warning(s)"   (report: schema-manifest-verify.json)
```

## Switch step (script 02, DROP legacy global unique)

The `DROP CONSTRAINT communication_templates_template_key_key` is **destructive DDL** and
was **not** executed autonomously on Neon (infrastructure.md + task rule: confirm
destructive SQL with the operator; production application is a separate operator-gated
step). It is proven correct/safe by:

1. **Preflight** (Stage 1): P6 = 0 duplicate `(key, institution, version)` and 0 duplicate
   active `(key, institution)`, P8 = 1 (present) — dropping loses no enforcement the
   tenant uniques (created first by the expand script) don't already provide.
2. **CI-parity local Postgres**: `test_global_template_key_unique_is_dropped` passes with
   the switch applied via the `conftest.py::unmanaged_schema` mirror, and confirms
   multiple rows per `template_key` are then allowed (one platform + one per institution).

## Cleanup note

The additive expand objects remain on the disposable branch `br-jolly-pine-ahybtg2e`;
they are harmless. Deleting/resetting the branch is a destructive Neon operation left to
the operator (not run autonomously).
