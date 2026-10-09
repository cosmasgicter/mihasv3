# Task 3.2 — Stage 1 (author + inventory) notes

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.2 Inventory and
remediate canonical assignment data**
**Requirements:** R7.1–R7.2, R15.3–R15.7 | **Findings:** DATA-01, DATA-02, DATA-07,
DATA-10, STU-01
**Stage:** 1 of 3 (author scripts + read-only inventory only — no mutation, no
rehearsal, no tests).
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
**Inventory captured:** 2026-07-16, READ-ONLY against the Neon **default** branch
(project `wild-bar-37055823` / `mihasApplication`, org
`org-nameless-field-86879910`, host `ep-dawn-unit-…-pooler.c-3.us-east-1.aws.neon.tech`,
db `neondb`, Postgres 17.10).

## No-mutation attestation

Every statement issued in Stage 1 against the Neon default branch was a
`SELECT` / introspection query via the Neon MCP `run_sql`. No branch was created,
no script was applied, no rehearsal or test was run. Verified post-hoc that the
default branch carries **none** of the task-3.2 objects yet:
`to_regclass('public.canonical_assignment_exceptions')` = NULL,
`applications.assignment_quarantined` absent, `chk_applications_canonical_assignment`
absent. The default branch is unchanged.

## Before-state inventory (Neon default branch)

Schema note: the canonical assignment columns already exist on `applications`
(added by the June multi-tenant migration), named `institution_id`,
`program_id` (→ `canonical_programs`), `program_offering_id` (→ `programs`),
`intake_id` (→ `intakes`). Legacy display snapshots are `institution` /
`program` / `intake` (varchar).

| Probe | Result |
|---|---|
| **I1** total applications | **33** |
| I1 null `institution_id` / `program_id` (canonical) / `program_offering_id` / `intake_id` | **33 / 33 / 33 / 33** (every row) |
| I1 missing any canonical id | **33**; non-draft missing any = **32** (1 draft) |
| **I2** dangling FKs (institution / canonical / offering / intake) | **0 / 0 / 0 / 0** |
| **I3** snapshot mismatches (institution / offering / intake) | **0 / 0 / 0** (no canonical id set yet, so nothing to disagree) |
| **I4** resolution class: uniquely_resolvable / offering_missing_canonical / no_match / ambiguous | **0 / 33 / 0 / 0** |
| **I5** same-name collisions (institution / offering cross-tenant / intake) | **0 / 0 / 0** |
| **I6** catalog state: canonical_programs / offerings / offerings_without_canonical / institutions / intakes | **0 / 4 / 4 / 2 / 3** |

Catalog ground truth (small tables): institutions = KATC (`Kalulushi Training
Centre`) + MIHAS (`Mukuba Institute of Health and Allied Sciences`); 4 active
offerings (KATC: Diploma in Clinical Medicine, Diploma in Environmental Health;
MIHAS: Certificate In Psychosocial Counselling, Diploma in Registered Nursing),
**all with `canonical_program_id = NULL`**; 3 intakes (January 2026, July 2026,
January 2027).

Bounded sample (`I5b`, 14 distinct legacy tuples): **every** tuple resolves to
exactly one institution, one offering, and one intake (`inst_candidates =
offering_candidates = intake_candidates = 1`) but `offering_with_canonical = 0`
for all of them.

## Interpretation / ambiguities found

- **No ambiguity and no dangling data.** `no_match = 0`, `ambiguous = 0`,
  dangling = 0, snapshot mismatch = 0, same-name collisions = 0. The legacy
  strings are cleanly resolvable — including the code-vs-full-name variance
  (`MIHAS` ⇄ `Mukuba Institute of Health and Allied Sciences`, `KATC` ⇄
  `Kalulushi Training Centre`), which the resolver handles via
  `institutions.name` **OR** `institutions.code`.
- **The single blocker is the un-seeded canonical-program layer.**
  `canonical_programs` is empty and all 4 offerings have `canonical_program_id =
  NULL`, so `program_id` (canonical) cannot be derived for any row. Under the
  deterministic contract this classifies **all 32 non-draft rows** as
  `offering_missing_canonical` → they will be quarantined into the exception
  ledger (never force-resolved). The 1 draft row is exempt. Seeding/linking
  canonical programs is **task 5.1** territory; 3.2 fails closed and records the
  removal path, staying off 5.1's turf (honours R7.5).
- Consequence for Stage 2 rehearsal: on the current default-branch data the
  backfill will backfill **0** rows and quarantine **32**; after task 5.1 links
  offerings to canonical programs, re-running the (idempotent) backfill will
  resolve them and self-heal the quarantine. This is expected, not a defect.

## Files authored / verified in Stage 1

The remediation scripts, a DB-free contract module, and its verifier test already
existed from an earlier pass. Stage 1 **verified them against the live schema**
(rather than rewriting working, tested SQL) and extended the inventory. All SQL
is compatible with the `apply_sql_migrations` additive-only lint (forward scripts
use only `IF NOT EXISTS` / `NOT VALID` / `UPDATE … WHERE` / `INSERT … ON
CONFLICT` / `VALIDATE CONSTRAINT`; the `DROP`/`DELETE` statements live only in
`*_rollback.sql`, which the sweep excludes).

| File | Purpose (one line) |
|---|---|
| `backend/scripts/2026_07_16_01_canonical_assignment_expand.sql` | EXPAND: create the `canonical_assignment_exceptions` ledger (with `owner` + `removal_path`), add `applications.assignment_quarantined`, add the non-null-for-active `chk_applications_canonical_assignment` CHECK **NOT VALID**. Additive + idempotent. |
| `…_01_canonical_assignment_expand_rollback.sql` | Operator-only reverse of the expand objects (DROP check → column → ledger). Excluded from the sweep. |
| `backend/scripts/2026_07_16_02_canonical_assignment_backfill.sql` | BACKFILL: deterministic, WHERE-scoped, idempotent — clears dangling FKs to the ledger, backfills only uniquely-resolvable rows (all four IDs, canonical derived from the offering), quarantines everything else into the ledger with a reason + removal_path, self-heals on re-run. Never force-resolves. |
| `…_02_canonical_assignment_backfill_rollback.sql` | Operator-only bookkeeping reverse (clear quarantine flags, empty the ledger); data backfill is forward-only (revert via Neon-branch discard / backup restore). |
| `backend/scripts/2026_07_16_03_canonical_assignment_validate.sql` | VALIDATE (switch): `VALIDATE CONSTRAINT` the 4 canonical FKs (only where still NOT VALID) and the CHECK — enforces "all four canonical IDs present for every active row unless quarantined". To be run in Stage 2. |
| `…_03_canonical_assignment_validate_rollback.sql` | Deliberate no-op (`VALIDATE` is not independently reversible; the CHECK is dropped by the expand rollback). |
| `backend/apps/common/canonical_assignment.py` | DB-free source of truth for the resolution/quarantine contract (`classify_resolution`, reason codes, `removal_path_for`, post-state `INVARIANT_QUERIES`). The SQL mirrors this exactly. |
| `backend/tests/unit/test_canonical_assignment_remediation.py` | Verifier: pure-contract tests (always on) + Postgres-gated integration that applies expand→backfill→validate against fixtures and asserts backfill/quarantine/draft-exempt/idempotence + validated constraints. (Runs in Stage 3, not Stage 1.) |
| `docs/v2-evidence/3.2/inventory.sql` | READ-ONLY evidence probe. **Extended** this stage with block `I5b` (bounded `GROUP BY` legacy-string distribution + per-tuple candidate counts). Blocks I1–I6 = before-state; I7–I8 = post-state gate (reference ledger/quarantine objects that exist only after EXPAND). |

## Contract note (expand/backfill/verify/switch/contract)

- **expand → backfill → verify → switch**: 01 (expand) + 02 (backfill) + I1–I6 /
  `run_invariants` (verify) + 03 (validate = switch/enforce).
- **contract**: intentionally **out of scope** for task 3.2 — deferred to task
  12.3 (`legacy_columns_drop_2026_08_15.sql` is already parked outside the
  auto-sweep).

## Stage 2 / Stage 3 hand-off

- **Stage 2** (mutation on an isolated Neon branch only): create a branch from the
  default, apply 01→02→03, re-run `inventory.sql` (including the I7/I8 post-state
  gate) to confirm 32 rows quarantined as `offering_missing_canonical`, 0
  dangling, 0 quarantined-without-ledger, CHECK + FKs validated; rehearse the
  rollback; never apply to the default branch or production.
- **Stage 3**: run `backend/tests/unit/test_canonical_assignment_remediation.py`
  (pure-contract + Postgres-gated) and wire the invariants into the release gate.
