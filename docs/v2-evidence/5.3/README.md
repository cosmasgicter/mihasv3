# Task 5.3 Evidence — Rebuild capacity, waitlist, withdrawal, and promotion around IDs/locks

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R7.6, R7.7, R10.6_
_Findings: DATA-02, DATA-03_
_Design: design.md §7.3 (Capacity And Waitlist); §7.1 (SQL invariants — task 3.3); §7.2 (assignment snapshot — task 5.2)_
_Required_Evidence (tasks.md): "concurrent last-seat, withdrawal, promotion, and same-name two-tenant tests" + backend suite + authority-matrix gate._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-24 (UTC).
- PBT: task 5.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults: {}`); none to record via `update_pbt_status`.
- Schema: **no schema change** in 5.3. It builds on the DB invariants already
  shipped by task 3.3 (`chk_program_intakes_capacity_nonneg`,
  `chk_program_intakes_enrollment_nonneg`, `chk_intakes_*`,
  `uq_applications_waitlist_position` — canonical-only) and the canonical
  assignment columns from task 5.2 (`program_offering_id`/`intake_ref_id`, etc.).
  No `backend/scripts/*.sql` added; no schema hash to report.

## The two findings closed

- **DATA-02** — capacity + waitlist keyed on `program`/`intake` **display
  strings** (resolved by name via `IdentifierResolver`), fail open on resolution
  failure, and can mix two tenants offering the same-name canonical program on
  the same intake. **Fix:** every capacity/waitlist/withdrawal/promotion
  operation now keys on the canonical Intake_Offering identity
  (`program_offering_id` + `intake_ref_id`) the application already carries
  (task 5.2 snapshot). A same-name other tenant is never counted, ordered,
  decremented, or promoted.
- **DATA-03** — submission locked the application but **not** the last-seat
  `ProgramIntake` counter, so concurrent submits could exceed capacity.
  **Fix:** `CapacityService.take_seat_for_submission` locks the `ProgramIntake`
  capacity row (`SELECT ... FOR UPDATE`), evaluates a drift-free live occupancy
  count **under that lock**, and increments the counter in the same
  transaction. Concurrent last-seat submits serialize on the row lock, so
  exactly one claims the final seat.

## What 5.3 delivers

| Layer | File | Role |
|---|---|---|
| Canonical seam | `backend/apps/applications/capacity_service.py` (**new**) | `CapacityService` — ID-keyed capacity/seat ops with fixed-order row locks: `offering_ids`, `lock_capacity_row`, `live_seat_count`, `take_seat_for_submission` (locked last-seat allocation, raises `CapacityError` when full), `release_seat` (canonical decrement, non-negative floor), `reconcile` (recompute counter from canonical rows). Legacy rows without canonical IDs return `False`/skip → caller keeps the legacy path. |
| Waitlist | `backend/apps/applications/waitlist_manager.py` | `assign_position`/`promote_next`/`reindex_positions`/`get_position` scope on `program_offering_id`+`intake_ref_id` when present (helper `_scoped_waitlist_queryset`), else the legacy strings. New `promote_next_for_application(app)` derives the canonical scope for withdrawal/expiry callers. Forward-only: promotion goes through the `ALLOWED_TRANSITIONS` state machine (`waitlisted → approved`). |
| Capacity check | `backend/apps/applications/intake_enforcer.py` | `check_submission(..., offering_id=None, intake_id=None)` — capacity count + intake resolution key canonically when IDs supplied (advisory pre-lock/TOCTOU check for canonical apps; the authoritative last-seat decision is the locked `take_seat_for_submission`). Backward-compatible signature. |
| Submission | `backend/apps/applications/services.py` (`submit_application`) | Derives canonical IDs; passes them to the pre-lock + in-lock `check_submission`; claims the seat via `CapacityService.take_seat_for_submission` (canonical, locked) and translates `CapacityError` → `ApplicationSubmissionError(409)`; legacy rows keep `IntakeEnforcer.increment_enrollment`. |
| Withdrawal | `backend/apps/applications/withdrawal_service.py` | Releases the seat via `CapacityService.release_seat` (canonical) with legacy `decrement_enrollment` fallback; promotes via `WaitlistManager.promote_next_for_application`. |
| Enrollment expiry | `backend/apps/applications/tasks/enrollment.py` | Same canonical release + `promote_next_for_application`. |
| Admin review | `backend/apps/applications/admin_review_views.py` | After approve/reject, canonical apps `CapacityService.reconcile(offering, intake)` **only** (the name-based `sync_enrollment` must not run for a canonical app — it keys `program_intakes` by program NAME and would sweep a same-name other tenant into the counter). Legacy apps keep `sync_enrollment`. `assign_position(app, ...)` was already app-aware, so it is canonical transparently. |

Fixed lock order everywhere: **capacity row (ProgramIntake) — then application**.
Counter occupancy set (`SEAT_STATUSES`) is kept identical to the legacy
`IntakeEnforcer` set so the canonical counter and any residual legacy sync agree
and `reconcile` does not fight a legacy write.

## Required_Evidence

### 1. Concurrent last-seat + withdrawal races (Postgres) — `raw/backend-5.3-tests.txt`
`backend/tests/unit/test_capacity_concurrency_5_3.py` (`@skipif` non-Postgres):
- `test_concurrent_last_seat_never_exceeds_capacity` — 8 parallel admin-force
  submits race for a **3-seat** offering; the `ProgramIntake` row lock serializes
  them so **exactly 3 win**, 5 are rejected `PROGRAM_CAPACITY_REACHED`, and
  `current_enrollment == 3` (never more) — the DATA-03 proof.
- `test_concurrent_withdrawal_decrement_never_goes_negative` — 6 parallel
  withdrawals decrement the canonical counter by exactly 6 with a non-negative
  floor.

### 2. Same-name two-tenant + withdrawal/promotion logic — `raw/backend-5.3-tests.txt`
`backend/tests/integration/test_capacity_waitlist_canonical_5_3.py` (13 tests,
SQLite + Postgres): live-count tenant isolation; last-seat submission blocks by
canonical offering while the same-name other tenant is unaffected; unlimited
when no limit; waitlist `assign_position`/`get_position`/`promote_next` scoped to
the canonical offering (never the same-name peer); withdrawal releases the seat
on the correct offering and promotes the correct tenant's waitlisted app while
the other tenant's counter is untouched; release floors at 0; `reconcile`
recomputes from canonical rows (ignoring drift, draft/rejected, and the
same-name peer); forward-only promotion skips a non-waitlisted app; legacy row is
a no-op through the canonical path.

**`raw/backend-5.3-tests.txt` → 15 passed** on Postgres (13 logic + 2
concurrency). `raw/sqlite-pg-only-skip.txt` shows the 2 concurrency tests skip
cleanly on the SQLite fast suite (row locks are a Postgres guarantee).

### 3. Backend regression sweep (Postgres) — `raw/backend-5.3-regression.txt`
`test_integrity_constraints_3_3` (incl. its concurrent last-seat waitlist race),
`test_submission_gates`, `test_submission_revalidation`,
`test_assignment_snapshot_isolation`, `test_assignment_config_failure`,
`test_assignment_resolution`, `test_late_applications`, `test_multi_intake` →
**67 passed**. Plus `test_authority_matrix_v2` + `test_late_applications` +
`test_multi_intake` in a separate run → **34 passed**.

- **Fixed as part of 5.3:** `test_integrity_constraints_3_3.py`'s concurrent
  last-seat raw `INSERT` omitted `assignment_version` (a task-5.2 `NOT NULL`
  column with no DB-level default on the schema_editor-built test DB), so it
  failed on Postgres. Added `assignment_version` to that INSERT — this test is a
  capacity/waitlist concurrency test squarely in 5.3's domain.

### 4. Authority-matrix gate (must stay green) — `raw/authority-matrix-gate.txt`
`tests/unit/test_authority_matrix_v2.py` → **16 passed**. 5.3 adds **no new
route** (it deepens existing submission/withdrawal/review/expiry paths), so the
zero-unclassified gate and registry↔route drift guard stay green with **no**
`scripts/authority_matrix_registry.py` edit and **no** canonical-truth-map entry
(no new capability/route/enum).

### 5. Grep-loop review — canonical keying — `raw/grep-loop-canonical-keying.txt`
Shows the capacity/waitlist/withdrawal/promotion sites now key on
`program_offering_id`/`intake_ref_id` (with `_scoped_waitlist_queryset` and
`offering_ids` gating), the submission last-seat is a locked
`take_seat_for_submission`, and the name-based `sync_enrollment` runs **only** on
the legacy (non-canonical) branch of admin review.

## Requirement mapping

- **R7.6** — capacity + waitlist operations key on tenant-scoped canonical IDs,
  lock the capacity row (`ProgramIntake`), and maintain constrained non-negative
  counters (task-3.3 CHECK + `Greatest(…-1, 0)` floor). ✓
- **R7.7** — concurrent last-seat + same-name two-tenant tests prove capacity,
  waitlist order, and routing never cross tenants. ✓ (fee/document isolation is
  task 5.4 / 5.2 territory.)
- **R10.6** — submission re-evaluates capacity under row locks then performs one
  legal state transition; counters are reconciled from canonical rows
  (`CapacityService.reconcile`) before reads rely on them. ✓

## Verified vs. deferred (honest status)

- **Verified now (Postgres, ephemeral Docker `postgres:17-alpine` on
  `localhost:55433` — never Neon/production):** the locked last-seat allocation
  (exactly-N winners), canonical seat release with non-negative floor, canonical
  waitlist ordering/promotion, same-name two-tenant isolation, and reconcile —
  15 new + 67 regression + 16 authority-matrix = **98 passed**; pg-only skip
  proof on SQLite.
- **Deferred (by plan):** full capacity/withdrawal/promotion **E2E** browser
  execution → task 13.2 (per tasks.md phasing); fee-schedule canonicalisation
  (the fee half of R7.4/R7.7) → task 5.4; reroute command (R10.5) → task 6.4.
- **Pre-existing / unrelated (NOT a 5.3 regression):** the admissions unit tests
  that patch `apps.applications.document_views.AccessScopeService`
  (`test_waitlist.py`, `test_withdrawal.py`, `test_enrollment.py`, and ~9 others)
  error at setup because a different in-flight task refactored `document_views`
  to no longer export `AccessScopeService`. This is the same drift documented in
  the task-5.2 evidence §4; no 5.3 file touches `document_views.py`. 5.3's own
  behaviour is proven by the new real-row tests above, which do not depend on
  that fragile patch.
