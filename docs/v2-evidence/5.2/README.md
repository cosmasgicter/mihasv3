# Task 5.2 Evidence — Make assignment and requirement resolution canonical and fail closed

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R7.1-R7.3, R7.5, R10.5-R10.6, R11.6_
_Findings: DATA-01, DATA-04, STU-01, STU-13_
_Design: design.md §7.2 (Application Assignment), §8.3 (Readiness), §9.3 (Required Documents snapshotted to the application assignment)_
_Required_Evidence: same-name tenant isolation integration test + dependency-failure integration test (fail-closed retryable error, not empty requirements) + backend suite results + authority-matrix gate result + frontend verification._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`)
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-24 (UTC).
- PBT: task 5.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults: {}`); none to record.

## Schema change (additive, EXPAND phase)

Four additive, nullable/defaulted columns on `applications` so a canonical
StartDraft-style assignment can snapshot the resolved offering configuration
onto the application row (design §7.2/§8.3/§9.3):

| Column | Type | Purpose |
|---|---|---|
| `configuration_version` | `varchar(64)` NULL | deterministic content version of the resolved configuration under one transactionally consistent read (R7.2); readiness recomputes + compares for drift |
| `requirements_snapshot` | `jsonb` NULL | versioned dynamic Required_Documents for the assigned scope (R11.6, §9.3) |
| `eligibility_snapshot` | `jsonb` NULL | eligibility rules resolved for the offering (§7.2) |
| `assignment_version` | `integer NOT NULL DEFAULT 1` | optimistic-concurrency version (reroute bumps it — task 6.4) |

- Forward: `backend/scripts/2026_07_23_01_application_assignment_snapshot.sql`
  — sha256 `e5e514adfc4b19b052b63225720773e728f9a459f7b48161a448c5f4f0cb1966`
- Rollback: `backend/scripts/2026_07_23_01_application_assignment_snapshot_rollback.sql`
  — sha256 `44c6943eeb6f692e3305409446fb81c70fa3abf7e1ba75fe539402f39d42bc01`
- Auto-discovered by `apply_sql_migrations` (top-level `backend/scripts/*.sql`,
  lexical order; the `*_rollback.sql` sibling is excluded). No manifest edit needed.
- **Online-safe & idempotent**: `ADD COLUMN IF NOT EXISTS` is metadata-only on
  PG11+; verified apply + re-apply are both clean no-ops (see
  `raw/grep-loop-no-fallback.txt` note and the idempotence proof below). Legacy
  rows keep NULL snapshots + `assignment_version=1` and read through the
  additive fallback path.
- **Neon/production**: additive EXPAND script; per infra rules it is authored to
  apply Neon-first then production in the deploy window. It was validated for
  idempotence against an isolated ephemeral Postgres 16 (never Neon/production):
  applied twice, exit 0 both times, all four columns present with correct types.

## What 5.2 delivers

Canonical resolution seam + fail-closed wiring (design §7.2/§8.3/§9.3):

| Layer | File | Role |
|---|---|---|
| Resolution service | `backend/apps/applications/assignment_resolution.py` | `resolve_assignment_snapshot()` — **canonical IDs only** (reuses `OfferingAssignmentService`; no `IdentifierResolver`/name/code). Resolves under one `atomic` read, snapshots required documents + eligibility, stamps a deterministic `configuration_version`. `AssignmentConfigurationError` = stable retryable **503 `CONFIGURATION_UNAVAILABLE`**. `resolve_required_documents`/`resolve_eligibility_rules` distinguish "resolved to empty" (valid `[]`) from "could not evaluate" (fail closed). |
| Create path | `backend/apps/applications/admin_review_views.py` (`ApplicationListCreateView.post`) | When `program_id`+`intake_id` supplied → canonical write: resolve snapshot, derive every field server-side, snapshot columns onto the row, return `configuration_version` + `required_documents`. `AssignmentConfigurationError`→503 retryable; `OfferingAssignmentError`→400. Legacy string-create retained (R15.7) with `emit_metric("legacy_string_create")` telemetry. Draft create delegates here so `/applications/` and `/applications/drafts/` cannot drift. |
| Create serializer | `backend/apps/applications/serializers.py` (`ApplicationCreateSerializer.validate`) | Canonical path returns from `validate()` **before** any `IdentifierResolver`/`_institution_name_for_program`/`validate_program_intake_compatibility` fallback. Canonical field validators are strict existence checks (no fallback). |
| Submission | `backend/apps/applications/services.py` (`_required_documents_for_submission`, `_missing_assigned_required_documents`) | Prefers the versioned `requirements_snapshot` (drift-free); a canonical app whose config is unreadable raises `ApplicationSubmissionError("CONFIGURATION_UNAVAILABLE", 503, retryable=True)` — never an empty-requirements success (DATA-04, STU-13). Legacy/non-canonical rows keep the additive skip. |
| Model | `backend/apps/applications/models.py` (`Application`) | Adds `configuration_version`/`requirements_snapshot`/`eligibility_snapshot`/`assignment_version`; FK attrs `institution_ref_id`/`canonical_program_id`/`program_offering_id`/`intake_ref_id` are the routing authority. |

## Required_Evidence

### 1. Same-name two-tenant isolation integration test (R7.1, R7.2, R11.6)
`backend/tests/integration/test_assignment_snapshot_isolation.py` — two tenants
offer the **same canonical program on the same intake**, each with its own
required-document config. Proves each resolution/snapshot/create resolves ONLY
its own institution + offering + requirements + `configuration_version`, and
never leaks the other tenant's. Includes a create-endpoint assertion that the
persisted row snapshot is tenant-A-only. **3 tests pass.**

### 2. Dependency-failure integration test (R7.5, R11.6 — fail closed, not empty) 
`backend/tests/integration/test_assignment_config_failure.py` — injects a
requirement-store failure and asserts:
- create endpoint → **503 `CONFIGURATION_UNAVAILABLE`, `retryable: true`, no row created** (not a 201 with empty requirements);
- submission → `ApplicationSubmissionError(CONFIGURATION_UNAVAILABLE, 503, retryable)`, application stays `draft`;
- drift-free snapshot path submits without re-resolving;
- legacy non-canonical row keeps the additive skip (no 503).
**4 tests pass.**

### 3. Unit tests (service internals) 
`backend/tests/unit/test_assignment_resolution.py` — canonical-only resolution,
snapshot-column mapping, no-offering→400 (not 503), required-doc + eligibility
fail-closed, empty-config→`[]`, `configuration_version` determinism + content
sensitivity + tenant divergence. **12 tests pass.**

### 4. Backend suite results
- `raw/backend-5.2-tests.txt` — the 3 files above: **19 passed**.
- Regression sweep (this dispatch): `test_canonical_assignment_remediation.py`,
  `test_institution_resolution_draft_save.py`, `test_catalog_write_freeze.py` →
  **34 passed**; `test_submission_gates.py`, `test_submission_revalidation.py`,
  `test_application_canonical_ids.py`, `test_application_contract_alignment.py`,
  `test_applications_serializers.py`, `test_draft_delete_payment_protection.py` →
  **41 passed**.
- **Pre-existing unrelated failure (NOT a 5.2 regression):**
  `tests/unit/test_application_endpoints.py` (22 errors) patches
  `apps.applications.document_views.AccessScopeService`, an attribute that
  module no longer exports (official-document / task-10.4 territory). That file
  is modified by a *different* in-flight worktree task, not 5.2; no 5.2 file
  touches `document_views.py`. Left as-is (out of scope).

### 5. Authority-matrix gate (must stay green)
`raw/authority-matrix-gate.txt` — `tests/unit/test_authority_matrix_v2.py`
**16 passed**. 5.2 adds **no new route** (it deepens the existing
`POST /api/v1/applications/` + `/applications/drafts/` create path), so the
zero-unclassified gate and registry↔live-route drift guard stay green with no
registry edit.

### 6. Grep-loop review — no name/code fallback in new writes (DATA-01, STU-13)
`raw/grep-loop-no-fallback.txt` — the only `IdentifierResolver` mentions in
`assignment_resolution.py` and the create view are documentation comments; the
canonical create path uses `resolve_assignment_snapshot` (canonical IDs only)
and `ApplicationCreateSerializer.validate()` short-circuits before any fallback.
Submission prefers the snapshot and fails closed.

### 7. Frontend verification
No frontend change in 5.2. The admissions client already sends canonical
`program_id`/`intake_id` on create (task 5.1 froze legacy catalog writes and
made the program form require `canonical_program_id`); the new response fields
(`configuration_version`, `required_documents`) are additive and consumed by
readiness in task 6.5. No UI change → no Impeccable/ui-ux-pro-max pass required.

## Requirement mapping

- **R7.1** — new catalog/assignment writes follow Canonical_Program → Program_Offering → Intake_Offering; canonical create resolves offering+intake IDs only, no display strings. ✓
- **R7.2** — server derives tenant/snapshots/currency/fee/required-documents/eligibility/capacity from canonical IDs under one transactionally consistent `configuration_version`. ✓
- **R7.3** — admin/student canonical create endpoints; no name/code fallback in new writes. ✓
- **R7.5** — a canonical offering that cannot resolve a required doc/eligibility/config fails closed with a stable retryable `CONFIGURATION_UNAVAILABLE`. ✓
- **R10.5-R10.6** — assignment fields derived + snapshotted at draft creation with `assignment_version=1` (reroute/submission revalidation land in 6.4/6.5, which consume this snapshot); submission re-evaluates required documents under the existing submission locks and fails closed on canonical config. ✓ (reroute command itself = task 6.4)
- **R11.6** — required-document controls render from the versioned `requirements_snapshot`; failure to evaluate canonical requirements blocks readiness/submission with a retryable service error, never empty requirements. ✓

## Verified vs. deferred (honest status)

- **Verified now:** canonical-only resolution + fail-closed create & submission;
  same-name two-tenant isolation (3) + dependency-failure fail-closed (4) + unit
  (12) integration/unit tests = 19 passed; regression sweep 75 passed;
  authority-matrix gate 16 passed; grep-loop zero name/code fallback in new
  writes; additive SQL script idempotence proven on an isolated Postgres 16.
- **Deferred (by plan):** the `ChangeSelectionCommand` reroute (R10.5) → task 6.4;
  authoritative readiness recompute/compare of `configuration_version` (R10.6,
  §8.3) → task 6.5; catalog/assignment E2E execution → task 13.2; Neon→production
  application of the additive script → deploy window (infra rules).
- **Pre-existing/unrelated:** `test_application_endpoints.py` document-view
  fixture drift (see §4) — owned by the official-documents task, not 5.2.
