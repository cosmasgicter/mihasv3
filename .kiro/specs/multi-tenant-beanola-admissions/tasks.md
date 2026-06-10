# Implementation Plan: Multi-Tenant Beanola Admissions

## Overview

This plan completes and hardens the Beanola multi-school conversion. The foundation already exists in the repo (models, services, endpoints, wizard) — so the plan is **prove → harden → complete**, not rebuild. The dominant risk is cross-tenant leakage and regression to string-based logic, so correctness work (real-DB migration, assignment, and access scope) comes **before** UI polish and operational tooling.

Sequencing:
- **Phase 0** — Exploration: one property/scoped-access test per correctness property (P1–P19) against current code, recording pass or minimised counter-example.
- **Phase 1** — Database readiness: apply + validate the additive migration and backfill on a real Neon branch.
- **Phase 2** — Assignment correctness (test-first): formalise `OfferingAssignmentService`, submission revalidation, duplicate-by-canonical.
- **Phase 3** — Cross-tenant isolation hardening: `AccessScopeService` across every remaining surface (analytics, search/count, risk views, signed URLs), out-of-scope == not-found.
- **Phase 4** — Tenant config + official documents: onboarding APIs, asset/template integrity, settlement tagging.
- **Phase 5** — Frontend program-first + white-label + dashboards UX.
- **Phase 6** — Observability, ops tooling, and rollout.

Every sub-task references requirements via `_Requirements: R#.#_`. Property tests reference the property number and file path from the design's Testing Strategy, with success pinned to `--hypothesis-seed=0` (≥100 examples, backend) or `fc.assert(prop, { numRuns: 100, seed: 0 })` (frontend). Sub-tasks marked `*` are optional (operational rollout steps or extended coverage that can be deferred for a faster MVP without breaking the core isolation/canonical guarantees). Core implementation and the mandatory isolation/assignment/migration tests are never optional.

Before any task longer than a few turns: read `docs/multi-tenant-beanola-handover.md`, confirm each claim against the repo with `rg`/file reads/tests, and update `docs/multi-tenant-beanola-progress.md` as you go.

## Task Dependency Graph

```
Phase 0 (Exploration: baseline P1–P19)
        │
        ▼
Phase 1 (DB readiness: migration + backfill on Neon branch)
        │
        ▼
Phase 2 (Assignment correctness + duplicate-by-canonical)  ──┐
        │                                                     │
        ▼                                                     │
Phase 3 (Cross-tenant isolation hardening)  ◄─────────────────┘
        │   (Phase 3 depends on Phase 1 tables + Phase 2 canonical keying)
        ▼
Phase 4 (Tenant config + official documents + settlement tagging)
        │   (depends on Phase 1 schema + Phase 3 scope)
        ▼
Phase 5 (Frontend program-first + white-label + dashboards)
        │   (depends on Phase 2 assignment API + Phase 3 scope + Phase 4 config)
        ▼
Phase 6 (Observability, ops, rollout)
            (depends on all prior phases; prod migration gated on Phase 1 staging proof)
```

Critical path: 0 → 1 → 2 → 3 → 4 → 5 → 6. Phases are verification-gated; each ends with a checkpoint requiring green gates before the next begins. Optional (`*`) tasks may be deferred without blocking downstream phases.

```json
{
  "waves": [
    { "wave": 0, "name": "Exploration baseline", "tasks": [1, 2], "dependsOn": [] },
    { "wave": 1, "name": "Database readiness", "tasks": [3, 4, 5], "dependsOn": [0] },
    { "wave": 2, "name": "Assignment correctness", "tasks": [6, 7, 8, 9, 10, 11], "dependsOn": [1] },
    { "wave": 3, "name": "Cross-tenant isolation", "tasks": [12, 13, 14], "dependsOn": [1, 2] },
    { "wave": 4, "name": "Tenant config + documents + settlement", "tasks": [15, 16, 17, 18, 19, 20], "dependsOn": [1, 3] },
    { "wave": 5, "name": "Frontend program-first + white-label + dashboards", "tasks": [21, 22, 23, 24, 25], "dependsOn": [2, 3, 4] },
    { "wave": 6, "name": "Observability, ops, rollout", "tasks": [26, 27, 28, 29, 30, 31], "dependsOn": [1, 2, 3, 4, 5] }
  ]
}
```

## Tasks

## Phase 0 — Exploration: confirm current state against correctness properties

- [x] 1. Exploration tests — baseline all 19 correctness properties against current code
  - Stand up the property/scoped-access test files from the design's Testing Strategy so each property either passes against the current implementation or fails with a minimised counter-example that guides Phases 1–6. No production code changes in this task.
  - _Requirements: R14.1, R14.2, R14.3, R14.4, R14.5, R14.6, R14.7, R14.8_

  - [x] 1.1 Scaffold backend property/test files with shared tenant fixtures
    - Create `backend/tests/property/test_assignment_properties.py`, `test_access_scope_properties.py`, and unit files `test_cross_tenant_isolation.py`, `test_institution_context.py`, `test_duplicate_canonical.py`, `test_application_canonical_ids.py`, `test_official_documents.py`, `test_payment_settlement_tenant.py`, `test_tenant_migration.py`.
    - Add a shared fixture factory that builds `Institution + CanonicalProgram + Program(offering) + Intake + ProgramIntake + Application + Membership + AccessGrant` against the test DB.
    - Success criterion: `cd backend && python3 -m pytest backend/tests/ -k "tenant or assignment or scope or canonical" --collect-only` lists the new ids.
    - _Requirements: R14.1, R14.2_

  - [x] 1.2 Scaffold frontend property/test files
    - Create `apps/admissions/tests/property/programFirstWizard.property.test.ts`, `apps/admissions/tests/unit/whiteLabelContext.test.tsx`, and `apps/admissions/tests/unit/noScopeEmptyState.test.tsx`.
    - Wrap assertions in `fc.assert(..., { numRuns: 100, seed: 0 })` where property-based.
    - Success criterion: `cd apps/admissions && bun run test -- --run tests/property/programFirstWizard` collects the suite.
    - _Requirements: R14.8_

  - [x] 1.3 Exploration — P1/P2 assignment determinism + priority ordering
    - File: `backend/tests/property/test_assignment_properties.py`. Generators over candidate offerings with random `assignment_priority` on offering + program-intake. Invariant: same inputs → same offering; program-intake priority dominates; ties resolved deterministically by code/id.
    - _Requirements: R2.1, R2.5, R14.1_

  - [x] 1.4 Exploration — P3/P4/P5 residency block, archived read-not-assign, capacity
    - File: `backend/tests/property/test_assignment_properties.py`. Generators for `assignment_rules`/`residency_rules` allow/block, `offering_status='archived'`, and capacity-full program-intakes. Invariant: blocked/archived/full candidates excluded from new assignment; archived still readable.
    - _Requirements: R2.1, R2.3, R2.4, R14.1_

  - [x] 1.5 Exploration — P6/P7/P8 access-scope isolation, grant expiry, grant width
    - File: `backend/tests/property/test_access_scope_properties.py`. Generators for membership/grant mixes across ≥2 institutions. Invariant: staff queryset never intersects other-school rows; expired grants drop at the boundary; application/offering grants don't widen to institution.
    - _Requirements: R4.2, R4.7, R4.8, R14.2_

  - [x] 1.6 Exploration — P9 out-of-scope == not-found
    - File: `backend/tests/unit/test_cross_tenant_isolation.py`. Hit application/payment/document detail endpoints as staff for another school's record. Invariant: identical status/shape/message to a truly missing record.
    - _Requirements: R4.4, R14.3_

  - [x] 1.7 Exploration — P10 host resolution edge cases
    - File: `backend/tests/unit/test_institution_context.py`. Inputs: uppercase host, host with port, inactive domain, inactive institution, duplicate hostname. Invariant: case/port-insensitive match; inactive → safe fallback; collision fails safe.
    - _Requirements: R3.3, R3.4, R3.5, R14.4_

  - [x] 1.8 Exploration — P11/P12 duplicate-by-canonical + canonical-IDs-on-create
    - Files: `test_duplicate_canonical.py`, `test_application_canonical_ids.py`. Invariant: duplicate keyed on canonical program + intake; new applications persist all four canonical IDs; legacy null-ID rows still readable.
    - _Requirements: R1.1, R1.4, R8.1, R8.4, R14.7_

  - [x] 1.9 Exploration — P13/P14/P15 documents + settlement metadata
    - Files: `test_official_documents.py`, `test_payment_settlement_tenant.py`. Invariant: token allowlist escapes/rejects injection; missing template → safe default; asset MIME/magic-byte validated; settlement metadata present on every initiation path; "Unassigned" bucket safe.
    - _Requirements: R6.4, R6.5, R7.1, R7.4, R14.5, R14.6_

  - [x] 1.10 Exploration — P16 migration idempotency (against a Neon branch or sqlite-skip)
    - File: `backend/tests/unit/test_tenant_migration.py`. Where a real Postgres branch is available, assert re-applying the migration is a no-op and backfill is idempotent; otherwise mark skipped with a clear reason and defer to Phase 1.
    - _Requirements: R9.1, R14.7_

  - [x] 1.11 Exploration — P17/P18/P19 frontend program-first, white-label, no-scope
    - Files: the three frontend test files. Invariant: payment unreachable before assigned-school checkpoint; white-label host filters offerings + brands from runtime context; no-scope staff sees "No school access assigned", never global zeros.
    - _Requirements: R10.1, R10.3, R11.6, R14.8_

  - [x] 1.12 Record exploration results
    - Capture pass/fail + minimised counter-examples in `.kiro/specs/multi-tenant-beanola-admissions/exploration-results.md` and triage each failing property to the phase task that will fix it.
    - _Requirements: R14.1, R14.2, R14.3, R14.4, R14.5, R14.6, R14.7, R14.8_

- [x] 2. Checkpoint — Exploration baseline
  - Ensure scaffolds run; confirm a recorded pass/fail for all 19 properties exists and each failure maps to a phase task. Ask the user if questions arise.
  - _Requirements: R14.1, R14.2, R14.3, R14.4, R14.5, R14.6, R14.7, R14.8_

## Phase 1 — Database readiness (real Postgres)

- [x] 3. Apply and validate the additive tenant migration on a Neon branch
  - The whole platform's correctness depends on canonical IDs and tenant tables existing. This phase makes them real and audited before any tenant logic is trusted.
  - _Requirements: R9.1, R9.2, R9.3, R9.4, R9.5, R9.6, R9.7_

  - [x] 3.1 Confirm the migration-history prerequisite
    - Verify `2026_05_22_migration_history_extend.sql` is applied so `apply_sql_migrations --dry-run` runs. If not applied, document the blocker and stop before applying the tenant migration.
    - _Requirements: R9.2_

  - [x] 3.2 Backup, dry-run, and apply on a staging Neon branch
    - Create a Neon branch from `main`, take a backup, run `apply_sql_migrations --dry-run`, then apply `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql`. Capture the branch id and migration log for the release PR.
    - _Requirements: R9.1, R9.2_

  - [x] 3.3 Run post-migration validation SQL and produce the exception report
    - Run the handover validation SQL (canonical_programs count; programs without canonical link; applications missing institution_id/program_id/program_offering_id/intake_id; duplicate hostnames; duplicate slugs; duplicate active memberships). Inspect every returned row; write a manual exception report for legacy applications that cannot be linked.
    - _Requirements: R9.3, R9.5_

  - [x] 3.4 Validate NOT VALID foreign keys after backfill resolution
    - Only after backfill issues are triaged, run `VALIDATE CONSTRAINT` for the tenant FKs. Confirm the partial unique active-membership index and supporting indexes are present.
    - _Requirements: R9.4, R9.6_

  - [x] 3.5 Migration idempotency + backfill tests (real DB)
    - File: `backend/tests/unit/test_tenant_migration.py`. Assert re-applying the migration is a no-op; backfill links offerings↔canonical by code and applications↔IDs by case-insensitive string match idempotently; ambiguous rows are left null and reported.
    - _Requirements: R9.1, R9.5, R14.7_

  - [x] 3.6 Document the rollback note
    - Add/extend a runbook (e.g. `docs/runbooks/multi-tenant-beanola-rollout.md`) stating additive tables/columns are safe to leave in place on rollback; no destructive revert required.
    - _Requirements: R9.7_

- [x] 4. Phase 1 verification block
  - `cd backend && python3 -m pytest backend/tests/ -k "tenant or migration"`; `cd backend && python3 manage.py check`. Confirm legacy null-ID applications remain readable and pre-migration official documents are unchanged.
  - _Requirements: R9.5, R12.7_

- [x] 5. Checkpoint — Phase 1 complete
  - Canonical IDs and tenant tables live on staging; backfill exceptions triaged. Ask the user before proceeding to production application.
  - _Requirements: R9.3, R9.4, R9.5_

## Phase 2 — Assignment correctness (test-first)

- [x] 6. TDD — formalise `OfferingAssignmentService` against the design algorithm
  - Write the assignment-matrix tests first, then make `OfferingAssignmentService.assign(...)` deterministic and rule-correct.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.8_

  - [x] 6.1 Assignment unit/property tests (priority, ties, rules, capacity, white-label filter)
    - Extend `backend/tests/property/test_assignment_properties.py` + a unit file. Cover: program-intake priority dominates offering priority; deterministic tie-break; offering `assignment_rules` and program-intake `residency_rules` allow/block by country/nationality; archived offering excluded from new assignment but readable; capacity exhaustion excluded; white-label `institution_id` restricts candidates; `NO_ELIGIBLE_OFFERING` raised when empty.
    - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6_

  - [x] 6.2 Make assignment deterministic and rule-correct
    - Update `backend/apps/catalog/services.py:OfferingAssignmentService` so sorting and rule evaluation match the design exactly and ties are deterministic. Emit `assignment.decided` / `assignment.failed` audit events.
    - Done: sorting now uses the full design tuple `(program_intake.assignment_priority, offering.assignment_priority, code, id)`; the two P2 strict-xfail tests pass as hard passes. Audit-event emission (R2.8) deferred — no test anchor in the suite and no catalog audit infrastructure yet.
    - _Requirements: R2.1, R2.5, R2.6, R2.8_

- [x] 7. Submission-time assignment revalidation
  - _Requirements: R2.7_

  - [x] 7.1 Re-run assignment at submit and define waitlist/error behaviour
    - In the submission path (`backend/apps/applications/`), re-run `assign(...)` with locked snapshot residency inputs. If the assigned offering is ineligible or capacity full, return `OFFERING_NO_LONGER_AVAILABLE` / `OFFERING_CAPACITY_FULL` with a recoverable next action; never silently succeed. Add a unit test for draft-assigned-then-filled-at-submit.
    - _Requirements: R2.7, R2.4_

- [ ] 8. Duplicate-by-canonical correctness
  - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5, R8.6_

  - [x] 8.1 Canonical duplicate keying with legacy fallback
    - Update `backend/apps/applications/duplicate_checker.py` so when canonical IDs are present uniqueness keys on `(student identity, canonical program, intake)`; terminal statuses don't block; a different NRC/passport identity may proceed; null-ID legacy rows preserve the string-keyword shape. Cover at draft-create and submit.
    - Done: both `check_at_create` and `check_at_submit` now key canonical-only (dropped the legacy-string `OR`) when canonical IDs are present, preserving the legacy string shape only when an id is absent. P11 strict-xfail removed; passes.
    - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5, R8.6_

- [x] 9. Register canonical concepts in the truth map
  - Add canonical program, offering, institution scope, membership, and access-grant rows to `docs/canonical-truth-map.md`; add a grep drift-guard test asserting no new runtime logic matches `applications.institution/program/intake` strings outside migration/legacy-fallback.
  - _Requirements: R1.2, R1.3, R1.6_

- [x] 10. Phase 2 verification block
  - `cd backend && python3 -m pytest backend/tests/ -k "assignment or duplicate or canonical"`; `python3 manage.py check`.
  - _Requirements: R12.7, R14.1_

- [x] 11. Checkpoint — Phase 2 complete
  - Assignment is deterministic and revalidated at submit; duplicate keying is canonical. Ask the user if questions arise.
  - _Requirements: R2.1, R2.7, R8.1_

## Phase 3 — Cross-tenant isolation hardening

- [x] 12. Complete `AccessScopeService` enforcement across every surface
  - The single most important security property: no non-super-admin reads another school's data on any surface.
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R4.7, R4.8, R4.9_

  - [x] 12.1 Scope analytics, search/count, risk views, and signed-URL paths
    - Apply `AccessScopeService` filters (or super-admin-only restriction) to analytics endpoints, any cross-school search/count surfaces, risk views, operational reports, and non-obvious document signed-URL paths. Confirm already-scoped surfaces (application list/review, exports, payments list/receipt/verify, documents, dashboard aggregates/activity/needs-attention, admin user listing) remain scoped.
    - _Requirements: R4.3, R4.5_

  - [x] 12.2 Out-of-scope == not-found across detail endpoints
    - Ensure out-of-scope record lookups return identical status/shape/message to a true not-found, with no field/error leakage.
    - Done: `ApplicationDetailView._get_application` scopes admin reads via `AccessScopeService` (was `IsOwnerOrAdmin`-only, leaked full PII at 200) → 404; `PaymentReceiptView`/`PaymentVerifyView` and `_get_authorized_document` mask the admin scope miss as the identical 404 NOT_FOUND envelope (were 403). All three P9 strict-xfail tests pass as hard passes.
    - _Requirements: R4.4_

  - [x] 12.3 No-scope empty results, not global zeros
    - For staff with no membership/grant, scoped surfaces return empty "no school access" results — never global aggregate/zero counts implying platform totals.
    - _Requirements: R4.6_

  - [x] 12.4 Retire reliance on the test-settings legacy-admin compatibility path
    - Add a test asserting the legacy-admin compatibility branch is unreachable under production settings; production scope is membership/grant-driven only.
    - Done: `backend/tests/unit/test_legacy_admin_compat_unreachable.py` pins that `_test_settings_active()` is False for every non-`.test` settings module (prod/staging/dev/base/unset) so the `_legacy_admin_test_scope` branch is unreachable in production, and that with the branch forced off a membership-less admin resolves to an empty non-global scope (membership/grant-driven only). 10 tests pass.
    - _Requirements: R4.9_

  - [x] 12.5 Cross-tenant isolation test suite
    - File: `backend/tests/unit/test_cross_tenant_isolation.py` + `backend/tests/property/test_access_scope_properties.py`. Prove staff cannot read/count/export/download/verify/receipt/configure another school's data; grant scope doesn't widen; expired grants drop.
    - Done: extended `test_cross_tenant_isolation.py` with HTTP-surface isolation classes (list, export, document download/signed-url, payment verify/receipt, settlement summary, grant-fidelity via admin surface under production scope). Service-layer P6/P7/P8 proofs already in `test_access_scope_properties.py` (8 property tests, seed 0). 15 isolation tests pass.
    - _Requirements: R4.2, R4.4, R4.7, R4.8, R14.2, R14.3_

- [x] 13. Phase 3 verification block
  - `cd backend && python3 -m pytest backend/tests/ -k "scope or isolation or tenant"`; `python3 manage.py check`; `python3 manage.py spectacular --file /tmp/schema.yaml`.
  - Done: `-k "scope or isolation or tenant"` → 106 passed, 6 skipped, 0 failed (config.settings.test, venv interpreter); `manage.py check` clean (1 silenced); `spectacular` generates (4 pre-existing unrelated catalog errors/1 warning); `git diff --check` clean.
  - _Requirements: R12.7, R14.2, R14.3_

- [x] 14. Checkpoint — Phase 3 complete
  - Every read/write/export/document/payment/analytics surface is scope-bounded; isolation proven by tests. Ask the user before continuing.
  - _Requirements: R4.3, R4.4, R4.5_

## Phase 4 — Tenant configuration and official documents

- [x] 15. Harden tenant onboarding/config APIs
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7_

  - [x] 15.1 Collision validation + scope on tenant management endpoints
    - Confirm/extend serializers under `backend/apps/catalog/admin_views.py` to reject slug/code/hostname collisions, scope every tenant management read/write to the caller, and filter access grants by institution. Add tests.
    - _Requirements: R5.1, R5.2, R5.5, R5.6_

  - [x] 15.2 Asset upload integrity
    - Validate PNG/JPEG/WebP/SVG MIME + magic bytes, capture SHA-256 checksum, store versioned rows; reject mismatched/oversized files; new versions never alter assets referenced by already-generated documents. Add per-type tests.
    - Done: confirmed the existing `AdminTenantAssetUploadView` path (MIME + magic-byte validation via `validate_asset_magic_bytes`, 2 MiB size guard, SHA-256 capture, versioned-row storage, `ASSET_INVALID` on mismatch/oversize, version immutability for already-referenced assets) and hardened SVG handling: `validate_asset_magic_bytes` now rejects SVGs carrying active/unsafe content (`<script>`, inline `on*=` handlers, `javascript:` URIs, `<foreignObject>`, DOCTYPE/ENTITY/CDATA) scanned over a bounded window, since a stored SVG is reachable via its `public_url` (R6.7). Added per-type tests in `test_official_documents.py` (validator-level active/static SVG) and `test_tenant_asset_upload.py` (endpoint-level active-SVG rejection + safe-SVG accept + render-time SVG-skip safety). 58 asset/document tests green; `tests/ -k "asset or template or tenant or document"` → 236 passed/8 skipped/0 failed.
    - _Requirements: R5.3, R5.4, R6.6, R14.5_

  - [x] 15.3 Template safety (no arbitrary merge engines)
    - Document template create/update accepts only safe sections + allowlisted tokens; rejects arbitrary DOCX/PDF merge documents. Add `TEMPLATE_TOKEN_REJECTED` handling and tests.
    - _Requirements: R5.7, R6.4_

- [x] 16. Official document generation integrity
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7, R6.8_

  - [x] 16.1 Provenance snapshot + token escaping + fallback + SVG safety
    - In `backend/apps/applications/tasks/pdf_generation.py` + `DocumentTemplateService`: render with assigned-school context; snapshot template id+version and asset ids into `verification_notes.official_document`; HTML-escape tokens with allowlist; safe default body on missing template; never silently regenerate; render SVG safely or mark unsupported; record render failures auditably.
    - _Requirements: R6.1, R6.2, R6.5, R6.6, R6.7, R6.8_

  - [x] 16.2 Official document tests
    - File: `backend/tests/unit/test_official_documents.py`. Cover provenance snapshotting, token injection escaping, missing-template fallback, and (where feasible) content extraction for each document type.
    - Done: real tests cover provenance snapshot (`_render_official_pdf` template id+version + logo/signature asset ids), token allowlist + first/second-order injection escaping, missing-template safe fallback per document type, SVG-skip safety, and asset MIME/magic-byte per allowed type. The P13 second-order-injection strict-xfail was fixed (allowlist-bounded single regex pass) and its marker removed.
    - _Requirements: R6.2, R6.4, R6.5, R14.5_

- [x] 17. Central payment collection + settlement tagging
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R7.7_

  - [x] 17.1 Settlement metadata on every initiation path + scoped grouping
    - Confirm/extend payment initiation (`backend/apps/documents/`) to write the Beanola collector marker + institution/canonical/offering/intake snapshot on card initiate, mobile money, and defer. Settlement summary stays tenant-scoped, derives labels from metadata, and buckets missing metadata as "Unassigned". No raw phone numbers persisted.
    - _Requirements: R7.1, R7.2, R7.4, R7.5, R7.7_

  - [x] 17.2 Settlement tagging regression test
    - File: `backend/tests/unit/test_payment_settlement_tenant.py`. Assert the collector marker is present on every initiation path; receipts stay valid after a school rename; "Unassigned" grouping leaks nothing.
    - Done: tests assert `collector="beanola"` + the four canonical-ID snapshot keys on every initiation path, snapshot survives a school rename, scoped grouping excludes other schools, no-scope staff see empty results (legacy test-settings compat disabled), and the "Unassigned" bucket attributes nothing to a real school.
    - _Requirements: R7.3, R7.6, R14.6_

- [x] 18. Settlement CSV export (optional)
  - Add downloadable CSV for settlement summaries if operations needs files rather than JSON grouping; keep it tenant-scoped.
  - _Requirements: R7.4_

- [x] 19. Phase 4 verification block
  - `cd backend && python3 -m pytest backend/tests/ -k "document or settlement or asset or template or tenant"`; `python3 manage.py check`; `python3 manage.py spectacular --file /tmp/schema.yaml`.
  - _Requirements: R12.7, R14.5, R14.6_

- [x] 20. Checkpoint — Phase 4 complete
  - Tenant config is safe and scoped; official documents snapshot provenance; payments tag settlement on every path. Ask the user if questions arise.
  - _Requirements: R5.1, R6.2, R7.1_

## Phase 5 — Frontend program-first, white-label, and dashboards

- [x] 21. Program-first student wizard
  - Consult the three project design skills (`impeccable`, `ui-ux-pro-max`, `design-for-ai`) and load `PRODUCT.md` + `DESIGN.md` before generating any UI. Use canonical primitives, Lucide icons, WCAG AA, ≥44px targets; no purple gradients/gradient text/glassmorphism/nested cards/emoji.
  - _Requirements: R10.1, R10.2, R10.3, R10.4, R10.5, R10.7_

  - [x] 21.1 Step ordering + assigned-school checkpoint before payment
    - In `apps/admissions/src/pages/student/applicationWizard/`, enforce step order (program+intake → assigned-school review → personal → education/docs → payment → review/submit); send `program_id`+`intake_id`; render assigned school, fee, required documents, and contact before payment; block payment until assignment+fee resolve; preserve auto-save and dirty-state protection.
    - _Requirements: R10.1, R10.2, R10.3, R10.5_

  - [x] 21.2 Recoverable assignment-failure path
    - On `NO_ELIGIBLE_OFFERING` / `OFFERING_NO_LONGER_AVAILABLE` / capacity, render recoverable guidance (choose another intake, contact admissions, interest list); never dead-end.
    - _Requirements: R10.4, R2.6, R2.7_

  - [x] 21.3 Wizard property + checkpoint tests
    - File: `apps/admissions/tests/property/programFirstWizard.property.test.ts`. Assert payment is unreachable before the assigned-school checkpoint across generated flows.
    - _Requirements: R10.3, R14.8_

- [x] 22. White-label + shared portal frontend behaviour
  - _Requirements: R3.1, R3.2, R3.6, R10.6_

  - [x] 22.1 Runtime brand + offering filtering from context
    - Resolve `/api/v1/catalog/context/` at load; on white-label host, brand from runtime context (no hard-coded school names) and filter offerings to that institution; on shared portal, Beanola brand without school favouritism.
    - _Requirements: R3.1, R3.2, R3.6, R10.6_

  - [x] 22.2 White-label E2E / host-override verification (optional)
    - Verify white-label behaviour in a real browser with DNS/host overrides (Playwright or manual), including inactive-domain fallback.
    - _Requirements: R3.3, R14.4_

- [x] 23. Admin onboarding + scope-correct dashboards
  - _Requirements: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R11.7_

  - [x] 23.1 Tenant onboarding IA + structured rule builders + edit/deactivate
    - Extend `apps/admissions/src/pages/admin/Tenants.tsx` to the full IA (institutions, domains, assets, offerings, assignment rules, required docs, templates, staff access, grants, settlement, audit), with create/list/edit/deactivate, collision surfacing, asset upload success/failure states, structured rule builders (countries/exclusions/priorities/capacities), template version diff/clone, and an official-document preview where feasible.
    - _Requirements: R11.1, R11.2, R11.7_

  - [x] 23.2 Routing simulator matching the real service
    - Add a "Test routing" simulator whose result matches `OfferingAssignmentService` exactly for the same inputs (call a dedicated backend simulate endpoint that reuses the service).
    - _Requirements: R11.3_

  - [x] 23.3 Scoped vs global dashboards + no-scope empty state
    - Super-admin dashboards show cross-school widgets; school-staff dashboards show only scoped widgets; no-scope users see "No school access assigned" with a support path, never global zeros.
    - _Requirements: R11.4, R11.5, R11.6_

  - [x] 23.4 Frontend tenant + no-scope tests
    - Files: `apps/admissions/tests/unit/whiteLabelContext.test.tsx`, `apps/admissions/tests/unit/noScopeEmptyState.test.tsx`, plus tenant onboarding create/update/deactivate + asset upload state tests.
    - _Requirements: R11.6, R14.8_

- [x] 24. Phase 5 verification block
  - `cd apps/admissions && bun run type-check && bun run lint && bun run test`; then `cd apps/admissions && bun run build`. Run `impeccable detect apps/admissions/src/` and resolve P0 findings.
  - _Requirements: R10.7, R12.7, R14.8_

- [x] 25. Checkpoint — Phase 5 complete
  - Program-first wizard, white-label branding/filtering, and scope-correct dashboards ship. Ask the user if questions arise.
  - _Requirements: R10.1, R3.1, R11.4_

## Phase 6 — Observability, ops, and rollout

- [x] 26. Tenant audit + observability
  - _Requirements: R13.1, R13.2, R13.3, R13.4, R13.5_

  - [x] 26.1 Audit events for assignment, tenant config, uploads, document gen, scope denials
    - Emit non-PII audit events for assignment decisions/failures, tenant config create/update/deactivate, asset uploads, official-document generation, and access-scope denials. Add a super-admin-only view of recent tenant config changes + routing failures; per-institution audit views stay scoped.
    - _Requirements: R13.1, R13.2, R13.3, R13.5_

  - [x] 26.2 PII redaction guard for tenant audit payloads
    - Add/extend a test asserting tenant audit payloads contain no full phone/NRC/passport or document contents — only hashed/masked identifiers.
    - _Requirements: R13.4, R12.4_

- [x] 27. Backward-compatibility regression sweep
  - Confirm no API route/filename/envelope drift; cookie auth + CSRF intact; auto-save preserved; existing drift-guard and canonical-truth suites green. Files: extend existing contract-preservation tests for the new tenant/catalog/official-document/settlement routes.
  - _Requirements: R12.1, R12.2, R12.3, R12.6_

- [ ] 28. Production migration application + post-deploy QA
  - With the migration-history prerequisite satisfied, apply the tenant migration to production behind the documented backup/dry-run/validate procedure; run the post-deploy smoke checklist; confirm legacy applications readable and new applications write canonical IDs.
  - _Requirements: R9.2, R9.5_

- [x] 29. E2E tenant lifecycle drill
  - Create school → add domain → upload logo/signature → create canonical program + offering → attach intake/capacity → configure required docs → configure template → add staff membership → apply on shared portal → apply on white-label portal → confirm assigned school before payment → simulate payment → generate all official docs → confirm school admin sees only assigned records → confirm super admin sees all.
  - _Requirements: R2.1, R3.1, R4.3, R6.1, R7.1_

- [x] 30. Final verification + progress/docs update
  - Run all gates: backend `pytest` + `manage.py check` + `spectacular`; admissions `type-check` + `lint` + `test` + `build`; `git diff --check`. Update `docs/multi-tenant-beanola-progress.md` and `docs/canonical-truth-map.md`; set `.config.kiro` `status: completed` only when all non-optional tasks are done.
  - _Requirements: R12.6, R12.7_

- [ ] 31. Checkpoint — Spec complete
  - All non-optional tasks done; isolation, canonical-ID, assignment, document, and settlement invariants proven by tests; staging migration validated. Confirm production rollout plan with the user.
  - _Requirements: R1.1, R2.1, R4.3, R6.2, R7.1, R9.5_

## Notes

- **Source of truth is the codebase.** The handover (`docs/multi-tenant-beanola-handover.md`) is a map, not gospel. Verify every claim with `rg`, file reads, tests, and DB introspection before acting.
- **Anti-hallucination protocol.** Do not infer cross-school access from role alone (super admin is global; school staff use memberships + grants). Do not trust counts, exports, search, document URLs, or payment endpoints until scoped-access tests prove they cannot leak other schools' data.
- **Migration gating.** `apply_sql_migrations --dry-run` is blocked in this checkout until `2026_05_22_migration_history_extend.sql` is applied. Production application of the tenant migration (task 28) is gated on Phase 1 staging proof.
- **Legacy columns stay.** Do not drop or repurpose `applications.institution/program/intake`; they preserve old applications and previously generated documents.
- **V1 document scope.** Templates are safe sections + allowlisted tokens + uploaded assets only. No arbitrary form builders or DOCX/PDF merge engines in V1.
- **Test-settings compatibility is not the production model.** A legacy-admin scope-compatibility path exists for old unit fixtures; it must not be relied upon or extended into production behaviour (task 12.4).
- **Design skills.** Any task touching `apps/admissions/src/` must consult `impeccable`, `ui-ux-pro-max`, and `design-for-ai`, and load `PRODUCT.md` + `DESIGN.md` first. Hard guardrails: no purple gradients, gradient text, glassmorphism on product surfaces, nested cards, or emoji icons; WCAG AA contrast; ≥44×44px touch targets; preserve auto-save.
- **Verification gates per steering `tech.md`.** Backend changes → `python3 -m pytest`, `manage.py check`, `manage.py spectacular`. Admissions changes → `bun run type-check`, `bun run lint`, `bun run test`, `bun run build`. Always finish with `git diff --check`.
- **Spec completion marker.** Add `"status": "completed"` to `.config.kiro` only when all non-optional tasks are done.
