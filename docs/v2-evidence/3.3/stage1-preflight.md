# Task 3.3 — Stage 1: read-only preflight (Neon default branch)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.3 Add catalog,
fee, grant, template, waitlist, and capacity constraints**
**Requirements:** R5.6, R6.7, R7.4–R7.7, R15.5 | **Findings:** TEN-08, DATA-02,
DATA-03, DATA-05, DATA-06
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`, HEAD)
**Database:** Neon project `wild-bar-37055823` (`mihasApplication`), default branch
`br-floral-scene-aha2ybfd`, **read-only** (SELECT-only, no mutation).

Stage 1 runs `inventory.sql` (Block A violation counts + Block B totals) against the
Neon default branch **before** any constraint is authored/applied. This is the
duplicate/violation preflight the two forward scripts require, and specifically the
duplicate preflight the task mandates **before** the legacy global
`UNIQUE(template_key)` is dropped.

## Result — every violation check is zero

Raw capture: [`raw/preflight-neon-default.txt`](raw/preflight-neon-default.txt).

| Check | Constraint it gates | Violations |
|---|---|---|
| P1 duplicate `(program_id, intake_id)` | `uq_program_intakes_program_intake` | **0** |
| P2 >1 active fee per `(program, fee_type, residency)` | `uq_program_fees_one_active` | **0** |
| P3 `scope_type` outside canonical set | `chk_access_grants_scope_target` | **0** |
| P3 scope/target mismatch | `chk_access_grants_scope_target` | **0** |
| P3 duplicate active institution/program/application grant | `uq_access_grants_active_*` | **0 / 0 / 0** |
| P4 duplicate doc-profile scope+version | `uq_doc_profiles_scope_version` | **0** |
| P5 negative capacity/enrollment counters | `chk_*_nonneg` (×4) | **0** |
| P6 duplicate `(key, institution, version)` / active `(key, institution)` | `uq_comm_templates_*` | **0 / 0** |
| P7 duplicate canonical waitlist position | `uq_applications_waitlist_position` | **0** |
| P8 legacy global `UNIQUE(template_key)` present | dropped by script 02 | **1** (present) |

## Data covered

`program_intakes` 12 · `intakes` 3 · `program_fees` 8 (all active) · `access_grants` 0
· `institution_document_profiles` 0 · `communication_templates` 33 · `applications` 33
(0 with a waitlist position). Matches baseline finding `BL-0.5-08`.

## What this proves

- **Every** expand constraint can be created **VALID** — no `NOT VALID`/backfill
  staging is needed because zero existing rows violate any of them.
- **`access_grants` has zero `scope_type='offering'` rows** (and zero rows outside the
  canonical `institution|program_offering|application` set). The `'offering'` spelling
  only ever appeared in **test fixtures**, never in real data — so the
  `chk_access_grants_scope_target` check is safe on production data. (The fixture was
  reconciled in `backend/tests/tenant_fixtures.py`; see the README.)
- **Dropping the global `template_key` unique (script 02) loses no enforcement** the
  tenant-scoped null-safe uniques do not already provide: P6 shows zero duplicate
  `(key, institution, version)` and zero duplicate active `(key, institution)` among the
  33 template rows, and P8 confirms the global unique currently exists.

Nothing was mutated on the default branch. The mutating rehearsal happens on an isolated
branch in Stage 2.
