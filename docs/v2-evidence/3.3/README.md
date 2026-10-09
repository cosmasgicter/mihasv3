# Task 3.3 — Add catalog, fee, grant, template, waitlist, and capacity constraints (evidence index)

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.3**
**Requirements:** R5.6, R6.7, R7.4–R7.7, R15.5
**Findings:** TEN-08, DATA-02, DATA-03, DATA-05, DATA-06
**Required evidence:** concurrent duplicate/last-seat tests **and** constraint introspection
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`, HEAD). The
task-3.3 artifacts (SQL scripts, tests, conftest mirror, view 409 translation, this
evidence folder, the `tenant_fixtures.py` reconciliation) currently sit as **untracked /
unstaged working-tree changes on top of** that commit, pending commit.
**Schema fingerprint (Neon rehearsal branch, post-expand):** `sha256:9204b18e3e357bdb016432a7048256e213268274b4b10b0c862d4304f784b4bd`

This task adds the DB-level guardrails that make the catalog/fee/grant/template/waitlist/
capacity invariants fail closed at the database, and translates the resulting
`IntegrityError`s to registered stable `409` codes. Schema work was **Neon-branch-first**;
nothing was applied to the Neon default branch or the self-hosted production Postgres.

## This task was RESUMED — partial work found and reconciled

Prior attempts had already authored most of the implementation. Verified and kept:

| Artifact | State found | Action |
|---|---|---|
| `backend/scripts/2026_07_17_01_integrity_constraints_expand.sql` (+ `_rollback`) | complete, additive+idempotent | kept; validated on Neon branch |
| `backend/scripts/2026_07_17_02_communication_template_unique_switch.sql` (+ `_rollback`) | complete | kept; drop is operator-gated |
| `backend/tests/conftest.py::unmanaged_schema` | already mirrors all 3.3 constraints (Postgres-guarded) | kept |
| `backend/tests/unit/test_integrity_constraints_3_3.py` | 21-way constraint/concurrency/rollback suite | kept; runs green on PG |
| `backend/tests/unit/test_integrity_constraints_409.py` | 4 view-layer 409 translation tests | kept; green |
| View 409 translation (`ALREADY_LINKED`, `DUPLICATE_ACCESS_GRANT`, `DUPLICATE_ACTIVE_FEE`, `DUPLICATE_DOCUMENT_PROFILE_VERSION`) | implemented in catalog/documents views | kept |
| `docs/canonical-truth-map.md` "Catalog integrity 409 codes" table | present | kept |

**Gaps this run closed:**

1. **This evidence folder** (`docs/v2-evidence/3.3/`) did not exist — the SQL scripts
   referenced a preflight `inventory.sql` that was never written. Created it, ran the
   preflight, and captured Stage 1 / Stage 2 evidence.
2. **`scope_type` reconciliation bug (regression the partial work introduced).** The new
   `chk_access_grants_scope_target` requires the canonical `program_offering`, but the
   shared test fixture `build_access_grant` (and several access-scope suites) persisted
   the legacy shorthand `'offering'`. Under Postgres this raised
   `IntegrityError: … violates check constraint "chk_access_grants_scope_target"` in
   `test_scoped_access_matrix.py`, `test_access_scope_properties.py`, and
   `test_production_scope_masking_properties.py`. Root cause: the runtime
   `AccessScopeService.filters_for_user` keys off the populated target column
   (`program_id`), **not** the `scope_type` string, so `'offering'` "worked" at runtime
   but is not the canonical value (`AdminAccessGrantSerializer.VALID_GRANT_SCOPE_TYPES`
   and the canonical truth map use `program_offering`). **Fix:** normalise the legacy
   `'offering'` alias to `'program_offering'` at the single choke point
   (`backend/tests/tenant_fixtures.py::build_access_grant`) — behaviour-preserving for the
   scope service, and every persisted row now satisfies the check. Verified the affected
   offering-grant tests pass on Postgres afterwards.
3. **Stale canonical-truth-map prose** claimed "no DB unique constraint exists on
   `(program_id, intake_id)`" for `ALREADY_LINKED` — corrected to reflect the task-3.3
   DB unique (and the check-then-insert fast path), consistent with the 409-codes table.

## Constraints added (all additive; expand → switch → contract model, R15.1)

Backed by `2026_07_17_01_integrity_constraints_expand.sql` unless noted:

- **ProgramIntake / Intake_Offering:** unique `(program_id, intake_id)` (idempotent
  `uq_program_intakes_program_intake`, coexisting with the Django
  `program_intakes_program_id_intake_id_key`). — R7.4
- **Capacity:** `>= 0` checks on `program_intakes` + `intakes`
  `max_capacity`/`current_enrollment` (NULL allowed = unconfigured). — R7.6
- **Active fee:** one active fee per `(program_offering, fee_type, residency)`
  (`uq_program_fees_one_active`, partial). — R7.4 / DATA-05
- **Access grant:** `chk_access_grants_scope_target` (scope ∈
  `institution|program_offering|application` + its target id not null) and three
  partial active-duplicate uniques. — R6.7 / DATA-06
- **Document profile:** one row per scope+version
  (`uq_doc_profiles_scope_version`, `NULLS NOT DISTINCT`). — R15.5 / DATA-06
- **Communication template:** null-safe tenant `(key, institution, version)` uniqueness
  and one-active `(key, institution)` (`uq_comm_templates_*`); the legacy global
  `UNIQUE(template_key)` is dropped by `2026_07_17_02_…switch.sql` **after** the
  preflight. — R5.6 / R15.5 / TEN-08
- **Waitlist:** unique canonical `(program_offering_id, intake_id, waitlist_position)`
  (partial; legacy string-only rows unconstrained until task 5.2 backfills IDs). — R7.6/R7.7

`IntegrityError` → stable `409` translation (canonical-truth-map "Catalog integrity 409
codes"): `ALREADY_LINKED`, `DUPLICATE_ACCESS_GRANT`, `DUPLICATE_ACTIVE_FEE`,
`DUPLICATE_DOCUMENT_PROFILE_VERSION`. Template + waitlist service-layer 409s are owned by
the later template-management / waitlist-rebuild (task 5.3) tasks, as noted in the map.

## Required evidence

- **Constraint introspection** — Stage 2 introspection on the Neon branch
  ([`raw/introspection-neon-branch.txt`](raw/introspection-neon-branch.txt)) + the
  regenerated task-3.1 schema manifest
  ([`schema-manifest-neon-branch.json`](schema-manifest-neon-branch.json), verify report
  [`schema-manifest-verify.json`](schema-manifest-verify.json), `0 failures`) + the
  in-suite `TestConstraintIntrospection` (uses `build_manifest_from_connection`).
- **Concurrent duplicate / last-seat tests** —
  `test_integrity_constraints_3_3.py::TestConcurrentRaces`:
  `test_concurrent_duplicate_program_intake_link` and
  `test_concurrent_last_seat_waitlist_position` (8 threads behind a barrier; exactly one
  winner, ≥1 `IntegrityError`). Full PG run: **21 passed** —
  [`raw/pytest-pg-task-3.3.txt`](raw/pytest-pg-task-3.3.txt).

## Verification summary

- Task 3.3 suites on **CI-parity local Postgres 17** (`test_integrity_constraints_3_3.py`
  + `test_integrity_constraints_409.py`): **21 passed**.
- Reconciled access-scope suites on Postgres after the fixture fix: offering-grant cases
  pass. (4 unrelated `test_scoped_access_matrix.py` failures remain — they compare full
  404 bodies including a random per-request `request_id`; they also fail on SQLite where
  the 3.3 CHECK is not applied, so they are **pre-existing** and belong to the
  authority-matrix tasks (2.1/2.2), not 3.3.)
- Constrained-row admin suites on Postgres (`test_admin_program_intake_create.py`,
  `test_document_profile_versioning.py`, `test_fee_resolver_international.py`): **27 passed**.

## Files

| File | What it records |
|---|---|
| `inventory.sql` | READ-ONLY preflight (Block A violations, Block B totals, Block C post-apply introspection). Lives under `docs/`, not swept by `apply_sql_migrations`. |
| `stage1-preflight.md` | Neon default-branch read-only preflight (no mutation). |
| `stage2-neon-branch.md` | Expand rehearsal + introspection on isolated branch `br-jolly-pine-ahybtg2e`. |
| `schema-manifest-neon-branch.json` | Task-3.1 schema manifest emitted from the branch (post-expand). |
| `schema-manifest-verify.json` | `schema_manifest --verify` report (0 failures, task 3.3 indexes required-present). |
| `raw/preflight-neon-default.txt` | Raw Stage 1 counts + totals. |
| `raw/introspection-neon-branch.txt` | Raw Stage 2 constraint definitions. |
| `raw/pytest-pg-task-3.3.txt` | Raw 21-passed Postgres test run. |
| `raw/commit.txt` | Candidate commit SHA. |

## Operator-gated production path (NOT run here)

Neon default-branch and self-hosted production application remain operator steps:

1. Back up production (`deploy/backup-db.sh`).
2. Apply `2026_07_17_01_integrity_constraints_expand.sql` then
   `2026_07_17_02_communication_template_unique_switch.sql` via `apply_sql_migrations`
   (the boot sweep also runs the forward scripts; `*_rollback.sql` are excluded).
3. Re-run `inventory.sql` Block C on production to confirm the objects exist.

The `*_switch.sql` `DROP CONSTRAINT` is destructive DDL — confirm before applying.
