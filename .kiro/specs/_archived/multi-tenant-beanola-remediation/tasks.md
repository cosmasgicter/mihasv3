# Implementation Plan: Multi-Tenant Beanola Remediation

## Overview

This plan closes the twelve remediation holes the foundation spec
(`.kiro/specs/multi-tenant-beanola-admissions/`) left open. It is grounded entirely in the real
files named in `design.md`, and it follows the design's deliberate sequencing — which mirrors the
work-order priority in `docs/multi-tenant-beanola-remediation-agent-plan.md`: **make migrations
deployable → close cross-tenant security holes → consolidate official documents → move document
content into backend tenant config → remove brand fallbacks → tighten validation → comms →
assignment edge cases → provenance/audit → document UI → drift guards → docs/runbook honesty →
final verification.** Correctness- and security-critical work lands before UI polish so each later
phase builds on a proven base.

The work is **additive and backward-compatible** throughout: every `/api/v1/...` route, the
`{"success": true, "data": ...}` envelope, the paginated `{page, pageSize, totalCount, results}`
shape, cookie auth + CSRF + JTI rotation, admissions auto-save, the Lenco mobile-money-first UX,
the immutable `Legacy_String_Fields`, and 404 not-found masking are preserved.

### Read first, before any task

1. Read `docs/multi-tenant-beanola-remediation-agent-plan.md` (the work order) end to end, plus the
   prior spec's `docs/multi-tenant-beanola-handover.md` and `docs/multi-tenant-beanola-progress.md`
   so you start from the real current state, not the planning assumptions.
2. Verify every claim against the repo with `rg`/file reads before editing; the codebase is the
   source of truth.
3. Engineering skills (always-on per `.kiro/steering/engineering-skills.md`): ground every API claim
   with **source-code-context**, plan with **agentic-engineering-workflow**, de-duplicate with
   **code-structure-cleanup**, and drive to merge-ready with **grep-loop-review-workflow**.

### Before any frontend task (Phases 3, 4, 5, 10)

Consult the three design skills — **impeccable**, **ui-ux-pro-max**, **design-for-ai** — and load
`PRODUCT.md` + `DESIGN.md` first (`node .kiro/skills/impeccable/scripts/load-context.mjs`). Honor
the UI guardrails on every surface: canonical primitives (`PageShell`, `SectionCard`,
`ErrorDisplay`, `EmptyState`, `Button asChild`), Lucide icons, WCAG AA contrast, ≥44×44px touch
targets, and **no** purple gradients, gradient text, glassmorphism, nested cards, or emoji icons.
Run `impeccable detect apps/admissions/src/` and resolve P0 findings before a frontend phase closes.

### Hard constraints that bound every task

- **No production DB changes from this environment.** All schema work is authored as additive SQL
  scripts under `backend/scripts/` and validated on a **Neon branch first** (per
  `.kiro/steering/infrastructure.md`). Production application is an operator step in the rollout
  runbook (Phase 12), gated on explicit user confirmation — never an automatic task.
- **No DOCX/PDF merge engine.** Document content is validated structured JSON rendered by
  backend-controlled layouts; uploaded originals are reference attachments only.
- Preserve the `Legacy_String_Fields`, the `{"success": true, "data": ...}` envelope, 404 masking,
  and the UI guardrails above.

### Testing conventions

- Backend property tests: `pytest` + `hypothesis`, **≥100 examples**, success pinned to
  `--hypothesis-seed=0`. Each test carries the comment
  `Feature: multi-tenant-beanola-remediation, Property {n}: {text}` and implements exactly one
  property.
- Frontend property tests: `vitest` + `fast-check`, `fc.assert(prop, { numRuns: 100, seed: 0 })`.
- Test-first where the design calls for it: fingerprint, profile resolution, validation
  serializers, assignment determinism, scope masking.
- Sub-tasks marked `*` are optional/deferrable for a faster MVP. Core security, migration,
  document-lifecycle, and validation work is never optional.

## Task Dependency Graph

### Critical path (ASCII)

```
Phase 1  Migration delivery + drift guards  (R1, R2)
   │
   ▼
Phase 2  Cross-tenant document security  (R3 OCR scope, R4 official-doc deletion)
   │
   ▼
Phase 3  Official-document consolidation  (R5 endpoints, R6 fingerprint/current-version, R7 frontend)
   │
   ├─────────────┬───────────────┬───────────────┐
   ▼             ▼               ▼               ▼
Phase 4       Phase 5         Phase 9         Phase 10
Tenant        Brand           Provenance      Document
document      fallback        + audit         UI states
profiles      removal         (R16)           (R17)
(R8)          (R9, R10)
   │             │
   │             ▼
   │          (frontend service switch reuses Phase 3 officialDocuments.ts)
   ▼
(renderers feed Phase 9 provenance)

Independent of Phase 3, depend only on Phase 1:
Phase 6  Admin config validation  (R11, R12, R13)
Phase 7  Tenant-aware communication templates  (R14)
Phase 8  Program-first assignment edge cases  (R15)

Phase 11 Drift guards  (R18)   ◄── depends on Phases 2, 3, 8 (guards the things they protect)
Phase 12 Docs + rollout runbook honesty  (R19)
Phase 13 Final verification  (R20, R21)  ◄── depends on all
```

Critical path: 1 → 2 → 3 → {4, 9, 10} → 11 → 13. Phases 5, 6, 7, 8 fan out off the early base.
Each phase ends in a verification block and a checkpoint that pauses for the user.

### Waves (JSON)

```json
{
  "waves": [
    { "wave": 0,  "name": "Migration delivery + drift guards",        "tasks": [1, 2, 3],            "dependsOn": [] },
    { "wave": 1,  "name": "Cross-tenant document security",           "tasks": [4, 5, 6],            "dependsOn": [0] },
    { "wave": 2,  "name": "Official-document consolidation",          "tasks": [7, 8, 9, 10, 11],    "dependsOn": [1] },
    { "wave": 3,  "name": "Tenant document profiles",                 "tasks": [12, 13, 14, 15, 16, 17, 18], "dependsOn": [2] },
    { "wave": 4,  "name": "Brand fallback removal + brand drift guard","tasks": [19, 20, 21, 22],     "dependsOn": [2] },
    { "wave": 5,  "name": "Admin config validation",                  "tasks": [23, 24, 25, 26],     "dependsOn": [0] },
    { "wave": 6,  "name": "Tenant-aware communication templates",     "tasks": [27, 28, 29, 30],     "dependsOn": [0] },
    { "wave": 7,  "name": "Program-first assignment edge cases",      "tasks": [31, 32, 33],         "dependsOn": [0] },
    { "wave": 8,  "name": "Official-document provenance + audit",     "tasks": [34, 35, 36],         "dependsOn": [2, 3] },
    { "wave": 9,  "name": "Document UI states",                       "tasks": [37, 38, 39],         "dependsOn": [2, 4] },
    { "wave": 10, "name": "Drift guards",                             "tasks": [40, 41, 42],         "dependsOn": [1, 2, 7] },
    { "wave": 11, "name": "Documentation + rollout runbook honesty",  "tasks": [43, 44],             "dependsOn": [0] },
    { "wave": 12, "name": "Final verification",                       "tasks": [45, 46],             "dependsOn": [0,1,2,3,4,5,6,7,8,9,10,11] }
  ]
}
```

## Tasks

## Phase 1 — Migration delivery and drift guards (R1, R2)

- [x] 1. Relocate and order the Tenant_Migration (Approach A)
  - [x] 1.1 Move the Tenant_Migration to the Deployable_Migration_Path
    - `git mv` (via the relocate tooling) `backend/scripts/migrations/0001_multi_tenant_beanola_admissions.sql` → `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql`, byte-identical, so only the new name exists (move, not copy — avoids duplicate `migration_history` rows).
    - Conditionally rename `backend/scripts/2026_06_08_student_number.sql` → `backend/scripts/2026_06_08_02_student_number.sql` so `_01_` sorts before `_02_`. Only rename if `migration_history` has no row for `2026_06_08_student_number.sql` on any shared DB; otherwise keep its name and prefix the tenant file `_00_` (documented decision in the design). Confirm the lexical-order outcome.
    - Confirm the relocated SQL stays additive/idempotent (new tables, nullable columns, indexes, `NOT VALID` FKs, best-effort backfills only) so it passes `_find_non_additive_violations`. Make no change to `EXCLUDED_SUBDIRS`, `EXCLUDED_TOP_LEVEL_FILES`, or the `*_rollback.sql` suffix filter.
    - _Requirements: R1.1, R1.2, R1.3, R1.5, R1.4, R1.6_

  - [x] 1.2 Validate the relocated migration on a Neon branch
    - Per `.kiro/steering/infrastructure.md`: create a Neon branch (Neon MCP `create_branch`), run `apply_sql_migrations --dry-run` against it and confirm `2026_06_08_01_multi_tenant_beanola_admissions.sql` appears in discovery, apply it, then re-apply to assert idempotence (second run a no-op). Capture the branch id and migration log for the release PR. Do not apply to production from this environment.
    - _Requirements: R1.1, R1.2, R1.8_

  - [x] 1.3 Update every reference to the migration path
    - Repoint `backend/scripts/migrations/0001_...` → `backend/scripts/2026_06_08_01_...` in `docs/multi-tenant-beanola-progress.md`, `docs/multi-tenant-beanola-handover.md`, `docs/runbooks/multi-tenant-beanola-rollout.md`, `docs/canonical-truth-map.md`, and `.kiro/specs/multi-tenant-beanola-admissions/` references (search with `rg "backend/scripts/migrations/0001"`).
    - _Requirements: R1.7, R19.5_

- [x] 2. Migration drift guards
  - [x] 2.1 Tenant-migration discovery + exclusion guards
    - Extend `backend/tests/unit/test_apply_sql_migrations.py` and `backend/tests/unit/test_tenant_migration.py`: assert the Tenant_Migration appears in `_iter_migration_files(DEFAULT_MIGRATIONS_DIR)` dry-run discovery under its new name; assert `00_full_schema.sql` and `*_rollback.sql` remain absent; assert `MIGRATION_HISTORY_NOT_EXTENDED` is emitted (`CommandError`) when `_has_extended_migration_history` is False.
    - _Requirements: R2.2, R2.3, R2.5_

  - [x] 2.2 Mis-placement + doc-path guards
    - Create `backend/tests/unit/test_migration_drift_guard.py`: fail if any non-rollback/non-archive `*.sql` sits inside an Excluded_Subdirectory (`migrations/`, `applied/`, `archive/`); fail if any `backend/scripts/.*\.sql` path referenced in docs/specs does not resolve on disk.
    - _Requirements: R2.1, R2.4_

- [x] 3. Checkpoint — Phase 1
  - Run `cd backend && python3 -m pytest tests/unit/test_apply_sql_migrations.py tests/unit/test_tenant_migration.py tests/unit/test_migration_drift_guard.py -q` and `python3 manage.py check`. Confirm the Tenant_Migration is discoverable and every doc-referenced migration path resolves. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R1.1, R1.2, R2.1, R2.2, R2.4_

## Phase 2 — Cross-tenant document security (R3, R4)

- [x] 4. OCR extraction tenant scope (R3)
  - [x] 4.1 Write the OCR authorize-before-side-effect tests (test-first)
    - File: `backend/tests/unit/test_document_extract_scope.py`. Cases: School A admin extracts School A document (one task enqueued); School A admin on School B document → 404 NOT_FOUND byte-identical to genuine not-found, no task enqueued; super-admin any document → exactly one task; owning student → one task; non-owning student → 404; out-of-scope returns the loader error unchanged before any enqueue/mutation.
    - **Property 14: OCR extraction authorizes before any side effect** — also assert the property in the isolation file (below).
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.7** (`backend/tests/unit/test_document_extract_scope.py`; `--hypothesis-seed=0`, ≥100 examples for the property)
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8_

  - [x] 4.2 Route `DocumentExtractView.post` through `_get_authorized_document`
    - In `backend/apps/documents/document_storage_views.py`, replace the ownership-only block with `document, error_response = _get_authorized_document(request, self, document_id)`; return `error_response` unchanged when present; enqueue `extract_document_text_task.delay(...)` only after authorization succeeds, before any state change. Return the 202 `{"success": true, "data": {task_id, document_id, status: "queued"}}` envelope. Keep the `AIUserScopedRateThrottle` (`ai_document_extract`). Never authorize on `role == "admin"` alone — scope comes only via `AccessScopeService` inside the loader.
    - _Requirements: R3.1, R3.2, R3.4, R3.5, R3.7, R3.8_

- [x] 5. Official-document deletion protection (R4)
  - [x] 5.1 Write the deletion-protection tests (test-first)
    - File: `backend/tests/unit/test_official_document_deletion.py`. Cases: student cannot delete a `system_generated=True` doc (403, `OFFICIAL_DOCUMENT_IMMUTABLE`, not soft-deleted); school admin out-of-scope → 404 from the loader; super-admin soft-deletes a system doc → succeeds, writes audit with actor/doc id/app id/doc type/`system_generated`/institution id, body/PII/secrets excluded; student deletes own non-system draft doc → allowed; permitted delete only sets `verification_status="deleted"`, never hard-deletes.
    - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

  - [x] 5.2 Gate `DocumentDeleteView.delete` on system_generated + audit privileged deletes
    - In `document_storage_views.py`, after `_get_authorized_document`: reject `system_generated` deletes by non-super-admin with 403 `OFFICIAL_DOCUMENT_IMMUTABLE`; enforce student editability (`APPLICATION_NOT_EDITABLE` 403 when not `draft`); keep the existing soft-delete (`verification_status="deleted"`) and `result_slip_url`/`extra_kyc_url` cleanup for permitted deletes; on super-admin system-doc delete write `_audit_official_document_deleted(...)` through the existing `AuditLog`/`TenantAuditService`, carrying only IDs + doc type + `system_generated` + institution id (no body/PII/secrets).
    - _Requirements: R4.1, R4.2, R4.4, R4.5, R4.6_

  - [x] 5.3 Property test — official-document deletion protection
    - **Property 15: Official documents are deletion-protected from non-super-admins**
    - **Validates: Requirements 4.1, 4.5** (`backend/tests/property/test_official_document_deletion_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R4.1, R4.5_

- [x] 6. Checkpoint — Phase 2
  - Run `cd backend && python3 -m pytest tests/unit/test_document_extract_scope.py tests/unit/test_official_document_deletion.py tests/property/test_official_document_deletion_properties.py -q` and `python3 manage.py check`. Confirm no document action path authorizes on admin role alone and out-of-scope reads mask as 404. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R3.3, R3.8, R4.1, R4.3_

## Phase 3 — Official-document consolidation (R5, R6, R7)

- [x] 7. Document_Fingerprint + Current_Official_Version lifecycle (R6) — test-first
  - [x] 7.1 Write fingerprint determinism + lifecycle tests (test-first)
    - Files: `backend/tests/property/test_document_fingerprint_properties.py`, `backend/tests/property/test_official_document_lifecycle_properties.py`. Assert the fingerprint is equal iff all inputs are equal (changing any one input changes it), and that repeated generation with unchanged inputs yields exactly one non-deleted `system_generated` document while a changed input creates a new current version leaving priors unchanged and never selecting `verification_status="deleted"` rows.
    - **Property 16: Document_Fingerprint is a deterministic, input-sensitive function** — **Validates: Requirements 6.1, 6.5, 6.6** (`backend/tests/property/test_document_fingerprint_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - **Property 17: Repeated generation reuses the single current version** — **Validates: Requirements 6.2, 6.3, 6.4, 6.7, 8.5, 16.2, 18.2** (`backend/tests/property/test_official_document_lifecycle_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7_

  - [x] 7.2 Implement `_compute_document_fingerprint` pure helper
    - In `backend/apps/applications/tasks/pdf_generation.py`, add `_compute_document_fingerprint(application, document_type, tenant, template, logo_asset, signature_asset, payment)` — deterministic SHA-256 over canonical JSON of: application id, document type, application `status`+`updated_at`, institution id, template/profile id+version, logo asset id+checksum, signature asset id+checksum, and (receipts only) payment id + receipt number. Keep it pure for isolated testing.
    - _Requirements: R6.1_

  - [x] 7.3 Implement reuse/supersede lifecycle in the generator
    - In `_generate_official_document_task`: derive the Current_Official_Version (latest non-deleted `system_generated` for `(application, document_type)` by `uploaded_at` desc); compute the fingerprint and compare to the current version's stored `verification_notes.official_document.fingerprint` — equal → return existing, create no row; absent/different → render a new document and store the fingerprint. Replace the one-hour wall-clock idempotency window in `_view_helpers._enqueue_document_task` with this input-driven idempotency. Never mutate prior documents.
    - _Requirements: R6.2, R6.3, R6.4, R6.5, R6.6, R6.7_

  - [x] 7.4 Optional `is_current` column path (deferred)
    - Author (do not apply) a documented future additive migration adding `application_documents.is_current boolean default true` + partial unique index `(application_id, document_type) WHERE system_generated AND is_current`, with generator flipping the prior current row. V1 derives "current" by query; this is the drift-resistant upgrade once proven on Neon.
    - _Requirements: R6.4_

- [x] 8. Student-safe official-document endpoints (R5)Sig
  - [x] 8.1 Write status-gating tests (test-first)
    - File: `backend/tests/property/test_official_document_gating_properties.py` (+ frontend mirror, task 11.3). Assert the type gate holds: application_slip → non-draft submitted; acceptance_letter → `approved`; conditional_offer → `conditionally_approved`; payment_receipt → a completed payment exists. Assert school-staff out-of-scope and not-permitted student requests return the 404 masking envelope.
    - **Property 18: Student official-document status gating** — **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.5** (`backend/tests/property/test_official_document_gating_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R5.2, R5.3, R5.4, R5.5, R5.6, R5.8_

  - [x] 8.2 Implement the official-document views + routes
    - Create `backend/apps/applications/official_document_views.py` with `POST /api/v1/applications/{id}/official-documents/{document_type}/` (generate/ensure current), `GET /api/v1/applications/{id}/official-documents/` (list latest per type), `GET /api/v1/applications/{id}/official-documents/{document_type}/` (status + download_url). Authorize via the shared scope path: students by owner check; school staff via `AccessScopeService().filter_applications(...)` with 404 masking out of scope; super-admin global. Enforce the R5 status/payment gates. Return the envelope with `document_id`, `document_type`, `status` (`ready|queued|failed`), optional `download_url`, `generated_at`, `template_version`, `institution_id`; async path returns `status="queued"` with a `task_id`. Wire routes in the application `urls.py` and `backend/config/urls.py` include if needed.
    - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7, R5.8, R5.9_

- [x] 9. Property test — out-of-scope == not-found (masking)
  - [x] 9.1 Cross-surface masking property
    - **Property 13: Out-of-scope document access is indistinguishable from not-found** — across the OCR-extract, official-document, and delete surfaces (byte-identical status/code/message; no task enqueued; no state mutated).
    - **Validates: Requirements 3.3, 3.6, 4.3, 5.6, 5.8** (`backend/tests/property/test_remediation_isolation_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R3.3, R3.6, R4.3, R5.6, R5.8_

- [x] 10. Frontend official-document service + component switch (R7)
  - [x] 10.1 Add `officialDocuments.ts` service
    - Create `apps/admissions/src/services/officialDocuments.ts` with `generateOfficialDocument`, `listOfficialDocuments`, `getOfficialDocument`, `downloadOfficialDocument` (authorized download endpoint), and `emailOfficialDocument`. Use the app-local `apiClient`, the `{"success": true, "data": ...}` envelope, and the `OfficialDocumentStatus` type.
    - _Requirements: R7.1, R7.3, R7.4_

  - [x] 10.2 Rewire student document components to the backend service
    - Switch `apps/admissions/src/components/student/DocumentButtons.tsx`, `ApplicationSlipActions.tsx`, and `DownloadReceiptButton.tsx` to call `officialDocuments.ts` instead of `useDocumentGeneration`/`slipService`/`@/lib/pdf`. Surface `Queued`/`Generating`/`Ready`/`Failed` states from backend status; email path emails the backend-stored document, not a local blob; respect the R5 status + payment gates. Keep `useDocumentGeneration`/`@/lib/pdf` reachable only for dev/draft preview. Apply the UI guardrails (canonical primitives, Lucide, WCAG AA, ≥44px, no purple gradients/gradient text/glassmorphism/nested cards/emoji) — load `PRODUCT.md`/`DESIGN.md` and consult the design skills first.
    - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R7.7_

  - [x] 10.3 Frontend gating property + service-call tests
    - Update `apps/admissions/tests/unit/useDocumentGeneration.test.tsx` to assert backend service calls (not local PDF generation); add `apps/admissions/tests/property/officialDocumentGating.property.test.ts`.
    - **Property 18 (frontend mirror): Student official-document status gating** — **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.5** (`apps/admissions/tests/property/officialDocumentGating.property.test.ts`; `fc.assert(prop, { numRuns: 100, seed: 0 })`)
    - _Requirements: R7.1, R7.2, R7.5_

- [x] 11. Checkpoint — Phase 3
  - Backend: `cd backend && python3 -m pytest tests/property/test_document_fingerprint_properties.py tests/property/test_official_document_lifecycle_properties.py tests/property/test_official_document_gating_properties.py tests/property/test_remediation_isolation_properties.py -q`; `python3 manage.py check`; `python3 manage.py spectacular --file /tmp/schema.yaml`. Frontend: `cd apps/admissions && bun run type-check && bun run test`. Confirm repeated downloads create no duplicate records and students fetch backend-stored documents. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R5.1, R6.2, R7.1, R7.6_

## Phase 4 — Tenant document profiles (R8)

- [x] 12. Author the `institution_document_profiles` migration (additive, Neon-first)
  - [x] 12.1 Write and validate the migration SQL on a Neon branch
    - Create `backend/scripts/2026_06_08_03_institution_document_profiles.sql`: `CREATE TABLE IF NOT EXISTS institution_document_profiles` with the design columns (id, institution_id, document_type, program_id, canonical_program_id, intake_id, layout_key, sections jsonb, fee_chart jsonb, bank_accounts jsonb, requirements jsonb, signatory jsonb, rules jsonb, version, is_active, created_by_id, created_at, updated_at), `idx_doc_profiles_lookup` and `idx_doc_profiles_scope`, and `NOT VALID` FKs to institutions/programs/canonical_programs/intakes. Additive/idempotent only. Validate on a Neon branch (dry-run discovery + apply + re-apply no-op); capture the branch id. Do not apply to production.
    - _Requirements: R8.1, R8.5_

- [x] 13. Profile resolution service (R8.2) — test-first
  - [x] 13.1 Write profile-resolution determinism tests (test-first)
    - **Property 20: Document profile resolution is deterministic and most-specific** — most-specific order offering+intake → offering → canonical-program+intake → canonical program → institution default; deterministic for identical inputs.
    - **Validates: Requirements 8.2** (`backend/tests/property/test_document_profile_resolution_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R8.2_

  - [x] 13.2 Implement `InstitutionDocumentProfileService.resolve`
    - Add the model (`managed = False`) + `InstitutionDocumentProfileService.resolve(application, document_type)` mirroring the specificity ordering used by `OfferingAssignmentService.required_documents`. Returns the single most-specific active profile or `None`.
    - _Requirements: R8.2_

- [x] 14. Safe_Template_Policy for profiles (R8.6, R8.7, R8.10) — test-first
  - [x] 14.1 Write profile content-safety tests (test-first)
    - **Property 19: Document profile/template content is safe** — only allowlisted tokens substituted (unknown/injected render inert), every token value HTML-escaped, and disallowed sections/tokens or DOCX/PDF/RTF/OLE/WordprocessingML merge content rejected with a descriptive error naming the offender, not persisted.
    - **Validates: Requirements 8.6, 8.7, 8.10** (`backend/tests/property/test_template_safety.py` — extend existing; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R8.6, R8.7, R8.10_

  - [x] 14.2 Implement `validate_profile_payload`
    - In `backend/apps/catalog/services.py`, add `validate_profile_payload` reusing `validate_template_payload`'s machinery (allowlisted tokens, `html.escape` at render, `_contains_merge_document`/`_MERGE_FIELD_MARKERS`/`_MERGE_DOCUMENT_SIGNATURES` rejection, per-section size cap) and add the structural caps (≤30 sections × ≤5000 chars, ≤50 fee rows, ≤10 banks, ≤50 requirements) plus fee-chart/bank-account row-shape validation. Reject with the existing `TEMPLATE_TOKEN_REJECTED` 400 code naming the offending section/token; do not persist the version. Retain uploaded DOCX/PDF originals as admin-reference attachments only — never executed/merged.
    - _Requirements: R8.6, R8.7, R8.10_

- [x] 15. Backend renderer package (R8.3, R8.9)
  - [x] 15.1 Build the `pdf/` renderer package
    - Create `backend/apps/applications/tasks/pdf/` with `render_context.py` (tenant + resolved profile + assets + payment context) and `renderers/{application_slip,acceptance_letter,conditional_offer,payment_receipt}.py` + `layouts/{simple_letter,fee_chart_letter}.py`. Replace the generic `_default_body` path in `pdf_generation.py`. The acceptance-letter renderer builds letterhead, date/address, ref line, body, commitment-fee block, bank-account block, fee chart, requirements list, notes, and signatory/signature **solely** from the resolved profile + tenant assets — never frontend constants.
    - _Requirements: R8.3_

  - [x] 15.2 No-profile → failed status (no frontend fallback)
    - When no active profile resolves for institution + document type, set generation status `failed`, record error "no document profile configured for {institution} / {document_type}" (code `DOCUMENT_PROFILE_NOT_CONFIGURED`), and produce no document from frontend content.
    - _Requirements: R8.9_

  - [x] 15.3 Renderer unit tests
    - Cover fee-chart layout rendering, acceptance renderer reads only the resolved profile, structural-cap rejections (≤30/5000/50/10/50), and no-profile → `failed`. File: `backend/tests/unit/test_official_documents.py` (extend).
    - _Requirements: R8.3, R8.9_

- [x] 16. Seed tenant document profiles (R8.4) + versioning (R8.5)
  - [x] 16.1 Seed command + dev seed entry
    - Create `backend/apps/catalog/management/commands/seed_tenant_document_profiles.py` and a dev entry in `backend/scripts/seed_tenant_dev_data.py` that create the MIHAS RN, KATC COG, and KATC EHT acceptance profiles as tenant rows, transcribed from `apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts` + `intakeSchedule.ts` (banking, fee charts, requirements). Data lives as configurable tenant rows, not tests/frontend.
    - _Requirements: R8.4_

  - [x] 16.2 Versioning semantics
    - Creating a new profile version inserts a new row with `version+1`; prior versions are retained as readable records and never alter documents already generated from earlier versions (fingerprint provenance preserves the producing version).
    - _Requirements: R8.5_

- [x] 17. Admin template/profile UI (R8.8)
  - [x] 17.1 Extend TemplatesPanel + tenants service
    - Extend `apps/admissions/src/pages/admin/tenants/TemplatesPanel.tsx` and `apps/admissions/src/services/admin/tenants.ts` to choose document type + optional applies-to offering/canonical-program/intake, choose a layout, edit structured sections, fee-chart rows, bank accounts, requirements, and signatory text, preview with sample data, clone the latest version, and activate/deactivate versions. Apply the UI guardrails (R7.7/R17.7) — load `PRODUCT.md`/`DESIGN.md` and consult the design skills first.
    - _Requirements: R8.8_

  - [x] 17.2 Template panel UI tests
    - Tests for fee rows, bank rows, requirements, clone/version, and that preview does not assume MIHAS/KATC fallback.
    - _Requirements: R8.8_

- [x] 18. Checkpoint — Phase 4
  - `cd backend && python3 -m pytest tests/property/test_document_profile_resolution_properties.py tests/property/test_template_safety.py tests/unit/test_official_documents.py -q`; `python3 manage.py check`. `cd apps/admissions && bun run type-check && bun run lint && bun run test`. Confirm a new school can be configured without code changes and the acceptance renderer reads only tenant data. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R8.2, R8.3, R8.4, R8.8, R8.9_

## Phase 5 — Brand fallback removal + brand drift guard (R9, R10)

- [x] 19. Backend brand fallback removal (R9)
  - [x] 19.1 Payment reference + application-number code
    - In `backend/apps/documents/payment_helpers.py` `_generate_reference`, change `MIHAS-{app}-{ts}` → `BNL-{app}-{ts}`; confirm no Lenco reconciliation depends on `MIHAS-`; update payment tests. In `backend/apps/applications/_view_helpers.py` `_resolve_institution_code`, use the assigned institution's code; for a genuinely missing institution use a platform `BNL` code or raise a config error — never default to `MIHAS`. Keep `MIHAS` only behind a clearly named, tested legacy path.
    - _Requirements: R9.2, R9.3, R9.4, R15.8_

  - [x] 19.2 Communication + email-component defaults
    - In `backend/apps/common/communication_service.py`, change `_DEFAULT_SUBJECT`/`_DEFAULT_BODY`/`_DEFAULT_NOTIFICATION_TEXT` and `_build_context` `portal_url` to Beanola/tenant values; drop `https://apply.mihas.edu.zm`. In `backend/apps/common/email/components.py`, set `signature_block` default to "Beanola Admissions Office" (or require explicit signatory context) and remove "MIHAS/KATC are universal" assumptions.
    - _Requirements: R9.5, R9.6_

  - [x] 19.3 App-number prefix validation (backend)
    - Update application-number validators so valid prefixes are not restricted to `MIHAS`/`KATC`; accept any institution code.
    - _Requirements: R9.9_

- [x] 20. Frontend brand fallback removal (R9)
  - [x] 20.1 index.html + PDF theme + display mapping + tracker examples
    - `apps/admissions/index.html`: Beanola title/description/OG site name, preloader brand "Beanola Admissions" + Beanola logo; replace the hard-coded `api.mihas.edu.zm` preconnect with an env-driven host or remove it (keep school branding at React runtime). `apps/admissions/src/lib/pdf/theme/index.ts` `getInstitution`: unknown institution → Beanola-generic preview profile or raise for official documents, never silently MIHAS. `apps/admissions/src/pages/student/ApplicationDetail.tsx`: display `institution_name ?? institution ?? "Not provided"`, remove the hard-coded MIHAS/KATC map. Public tracker example components: neutral Beanola/tenant-derived examples. Apply UI guardrails; consult the design skills + `PRODUCT.md`/`DESIGN.md` first.
    - _Requirements: R9.1, R9.6, R9.7, R9.8_

  - [x] 20.2 App-number prefix validation (frontend)
    - Update the frontend application-number validator so valid prefixes are not restricted to `MIHAS`/`KATC`.
    - _Requirements: R9.9_

- [x] 21. Brand_Allowlist + brand drift guard (R10)
  - [x] 21.1 Create the allowlist and guards
    - Create `docs/legacy-brand-allowlist.json` enumerating the small reviewed set of files allowed to contain `MIHAS`/`KATC`/`Mukuba`/`Kalulushi`/`apply.mihas.edu.zm` (tenant seed fixtures, MIHAS/KATC-creating tests, historical docs/sample references, tenant logo assets). Add `backend/tests/unit/test_brand_drift_guard.py` (scans `backend/apps`) and `apps/admissions/tests/unit/brandDriftGuard.test.ts` (scans `apps/admissions/src` + `index.html`) that fail — reporting offending file + line — for any non-allowlisted hit and pass for allowlisted files.
    - _Requirements: R10.1, R10.2, R10.3, R10.4_

- [x] 22. Checkpoint — Phase 5
  - `cd backend && python3 -m pytest tests/unit/test_brand_drift_guard.py -q`; `cd apps/admissions && bun run test -- --run tests/unit/brandDriftGuard`. Run `rg -n "MIHAS|KATC|Mukuba|Kalulushi|apply.mihas.edu.zm" apps/admissions/src apps/admissions/index.html backend/apps` and confirm every hit is allowlisted. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R9.1, R9.2, R9.3, R10.1, R10.3_

## Phase 6 — Admin config validation (R11, R12, R13)

- [x] 23. Required-document + access-grant validation — test-first
  - [x] 23.1 Write validation property tests (test-first)
    - **Property 21: Required-document and access-grant validation correctness** — accept iff all canonical-relationship/target rules hold; on rejection a field-level error and no row created/modified.
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8** (`backend/tests/property/test_admin_validation_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R12.1, R12.2, R12.3, R12.4, R12.5, R12.6, R12.7, R12.8_

  - [x] 23.2 Strengthen `AdminRequiredDocumentSerializer.validate`
    - In `backend/apps/catalog/admin_serializers.py`: institution exists + active; if `program_id`, program exists + active + belongs to institution; if `canonical_program_id`, canonical exists + active; if both, `program.canonical_program_id` matches; reject duplicate active row for `(institution, document_type, program_id, canonical_program_id)`; descriptive error and no row on failure.
    - _Requirements: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6_

  - [x] 23.3 Strengthen `AdminAccessGrantSerializer.validate`
    - Cover the full matrix: `institution` scope → existing active institution; `program_offering` → active program owned by a non-global institution (matches supplied `institution_id`); `application` → existing application (matches supplied institution/program); `expires_at` strictly future UTC; permission in the allowlist; reject duplicate active `(user, scope_type, target id)` except self-update; reject missing/invalid `scope_type`; field-level error and no mutation on failure.
    - _Requirements: R12.1, R12.2, R12.3, R12.4, R12.5, R12.6, R12.7, R12.8_

- [x] 24. Manual asset registration lockdown + SVG safety (R13)
  - [x] 24.1 Lock down the caller-metadata asset path
    - In `backend/apps/catalog/admin_serializers.py`/`admin_views.py`: disable the generic `storage_key`/`public_url`/`mime_type`/`checksum`-accepting create path for non-super-admins; where it remains (super-admin only) require `storage_key` under `institution-assets/{institution_id}/` and validate the stored object's bytes + checksum instead of trusting the caller. Keep the multipart `AdminTenantAssetUploadView` primary (MIME + magic bytes + SHA-256 + 2 MiB cap).
    - _Requirements: R13.1, R13.2, R13.3_

  - [x] 24.2 SVG admin warning (UI) + renderer unsupported status
    - Admin UI warns SVG won't render in backend PDFs and prompts for a raster version (apply UI guardrails; consult design skills first). Confirm the backend renderer records an `unsupported` render status for SVG and never executes it (verify in `_draw_asset`).
    - _Requirements: R13.4, R13.5_

  - [x] 24.3 Asset registration tests
    - Cover non-super-admin generic-create rejection, super-admin storage-key constraint + byte/checksum validation, and SVG `unsupported` render status.
    - _Requirements: R13.1, R13.2, R13.5_

- [x] 25. Property test wiring — admin validation
  - [x] 25.1 Ensure Property 21 runs in the standard command
    - Confirm `backend/tests/property/test_admin_validation_properties.py` is collected by the standard backend test command and passes at `--hypothesis-seed=0`.
    - _Requirements: R11.6, R12.8_

- [x] 26. Checkpoint — Phase 6
  - `cd backend && python3 -m pytest tests/property/test_admin_validation_properties.py tests/unit -k "required_document or access_grant or asset" -q`; `python3 manage.py check`; `python3 manage.py spectacular --file /tmp/schema.yaml`. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R11.6, R12.8, R13.1_

## Phase 7 — Tenant-aware communication templates (R14)

- [x] 27. Author the communication-templates migration (additive, Neon-first)
  - [x] 27.1 Write and validate the migration SQL on a Neon branch
    - Create `backend/scripts/2026_06_08_04_communication_templates_tenant.sql`: `ADD COLUMN IF NOT EXISTS institution_id uuid NULL`, `ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`, `idx_comm_templates_tenant_lookup`, and a `NOT VALID` FK to `institutions(id)`. Additive/idempotent only. Validate on a Neon branch (dry-run + apply + re-apply no-op); capture the branch id. Do not apply to production.
    - _Requirements: R14.2_

- [x] 28. Tenant-aware resolution + brand-safe context (R14) — test-first
  - [x] 28.1 Write resolution + brand-safe property tests (test-first)
    - **Property 22: Communication template resolution and brand-safe context** — resolve active institution-specific (highest version) → active Beanola platform (highest version) → safe Beanola default; built context complete and free of the MIHAS brand/contact and `https://apply.mihas.edu.zm` for any institution (including unknown/future and missing-setting cases).
    - **Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.7, 14.8** (`backend/tests/property/test_communication_template_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R14.1, R14.3, R14.4, R14.5, R14.7, R14.8_

  - [x] 28.2 Implement tenant-aware resolution + context
    - In `backend/apps/common/communication_service.py`, make `render_template`/`send` resolve in priority order using `application.institution_ref_id`; derive brand name/contact email/portal URL from the resolved institution's settings in `_build_context`, substituting Beanola platform defaults when missing and never emitting `https://apply.mihas.edu.zm`. The safe Beanola default contains only Beanola brand/contact/portal.
    - _Requirements: R14.1, R14.3, R14.4, R14.5, R14.7, R14.8_

- [x] 29. School-staff template management scope (R14.6, R14.9)
  - [x] 29.1 Scope template management to assigned institutions
    - The template management surface (`backend/apps/common/template_views.py` and related serializer/view) exposes and accepts changes only for institutions the acting School_Staff member is assigned to (via `AccessScopeService`); an out-of-scope view/modify is rejected with an authorization error and no mutation.
    - _Requirements: R14.6, R14.9_

  - [x] 29.2 Comms scope + schema tests
    - Assert the tenant columns/index are present and out-of-scope staff template management is rejected with no mutation.
    - _Requirements: R14.2, R14.6, R14.9_

- [x] 30. Checkpoint — Phase 7
  - `cd backend && python3 -m pytest tests/property/test_communication_template_properties.py tests/unit/test_communication_service.py -q`; `python3 manage.py check`. Confirm unknown/future schools never see MIHAS brand or `apply.mihas.edu.zm`. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R14.1, R14.5, R14.6_

## Phase 8 — Program-first assignment edge cases (R15)

- [x] 31. Formalize assignment determinism + edge cases (R15) — test-first
  - [x] 31.1 Write assignment determinism + app-number property test (test-first)
    - **Property 24: Assignment determinism and institution-coded application numbers** — same `(canonical program, intake, residency, white-label)` always selects the same offering by program-intake priority → offering priority (lower wins) → stable tie-break on code/id; the generated application number begins with the assigned institution's code and never defaults to `MIHAS` (unavailable code → `BNL` or config error).
    - **Validates: Requirements 15.1, 15.8, 9.3, 9.4** (`backend/tests/property/test_assignment_properties.py` — extend existing; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R15.1, R15.8, R9.3, R9.4_

  - [x] 31.2 Formalize determinism, capacity policy, and recoverable errors
    - In `backend/apps/catalog/services.py:OfferingAssignmentService`: confirm the sort key `(program_intake.assignment_priority, offering.assignment_priority, code, id)`; white-label `institution_id` restricts candidates; capacity is advisory until enrollment — creation reserves no seat, `_has_capacity` excludes `current_enrollment >= capacity` at assignment time, and `EnrollmentService` commits the seat under `select_for_update()` (document this decision in `docs/canonical-truth-map.md`). Surface `OfferingAssignmentError(code="NO_ELIGIBLE_OFFERING")` as a 409 recoverable envelope with guidance.
    - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5_

  - [x] 31.3 Assigned required documents + legacy-path metric
    - Confirm `AssignmentResult.required_documents` exposes resolved offering/canonical/default requirements and missing docs block submission per the assigned config (R15.6). Emit a `legacy_string_create` warning/metric via `emit_metric` on the string-create path while keeping it functional (R15.7).
    - _Requirements: R15.6, R15.7_

- [x] 32. Property test wiring — assignment
  - [x] 32.1 Ensure Property 24 runs in the standard command
    - Confirm the extended `test_assignment_properties.py` is collected and passes at `--hypothesis-seed=0`.
    - _Requirements: R15.1, R15.8_

- [x] 33. Checkpoint — Phase 8
  - `cd backend && python3 -m pytest tests/property/test_assignment_properties.py tests/unit -k "assignment" -q`; `python3 manage.py check`. Confirm assignment is deterministic and app numbers are institution-coded. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R15.1, R15.5, R15.8_

## Phase 9 — Official-document provenance + audit (R16)

- [x] 34. Full provenance snapshot + audit events (R16) — test-first
  - [x] 34.1 Write provenance/PII-exclusion property test (test-first)
    - **Property 23: Audit and provenance exclude PII, secrets, and document bodies** — every Official_Document carries the complete `verification_notes.official_document` snapshot; every Audit_Event payload excludes document bytes, applicant PII (NRC/passport, full DOB, phone, email, address), credentials/API keys/signing secrets, and bank account numbers.
    - **Validates: Requirements 4.6, 16.1, 16.4, 20.6** (`backend/tests/property/test_official_document_provenance_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R4.6, R16.1, R16.4, R20.6_

  - [x] 34.2 Extend the provenance snapshot
    - In `pdf_generation.py`, extend `verification_notes.official_document` to the full R16.1 snapshot: document type, institution id + name, canonical program id, program offering id, intake id, application id, student number (where applicable), template/profile id + version, logo/signature/seal asset ids + checksums, payment id + receipt number (receipts), per-asset render status, generated-by user id + role (where human-triggered), generated-at timestamp, and the Document_Fingerprint. The snapshot is immutable once written and survives institution renames.
    - _Requirements: R16.1, R16.2_

  - [x] 34.3 Lifecycle audit events (no PII)
    - Write Audit_Events via `TenantAuditService` for queued, generated, generation-failed-permanently, downloaded (admin/student), emailed, and template/profile + asset create/update/activate/deactivate. Exclude document bytes, applicant PII, credentials, signing secrets, and bank account numbers. A render failure leaves any prior Official_Document unchanged, records a failing-stage audit, and returns a retry-able error; permanent failure after 3 attempts or >300s queued (task `max_retries=3`).
    - _Requirements: R16.3, R16.4, R16.5, R16.6_

- [x] 35. Property test wiring — provenance
  - [x] 35.1 Ensure Property 23 runs in the standard command
    - Confirm `test_official_document_provenance_properties.py` is collected and passes at `--hypothesis-seed=0`.
    - _Requirements: R16.1, R16.4_

- [x] 36. Checkpoint — Phase 9
  - `cd backend && python3 -m pytest tests/property/test_official_document_provenance_properties.py -q`; `python3 manage.py check`. Confirm provenance is complete and audit payloads carry no PII/secrets/bodies. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R16.1, R16.3, R16.4_

## Phase 10 — Document UI states (R17)

- [x] 37. Student + admin document UI states
  - [x] 37.1 Student document UI reflects backend truth
    - Student document UI shows only status/payment-allowed actions (R17.1); `Queued`/`Generating`/`Ready`/`Failed` states with download + email of stored official documents (R17.2); MIHAS/KATC shown only when the assigned school is actually MIHAS/KATC (R17.3); production student components never use client PDF generators for official documents (R17.6). Apply UI guardrails (R17.7) — consult the design skills + `PRODUCT.md`/`DESIGN.md` first.
    - _Requirements: R17.1, R17.2, R17.3, R17.6, R17.7_

  - [x] 37.2 Admin document UI: queue → status, scoped views
    - Admin generation queues the backend document then shows status and lists latest official documents per application (R17.4); admin tenant views are scoped (school staff in-scope only; super-admin global) (R17.5). Apply UI guardrails (R17.7).
    - _Requirements: R17.4, R17.5, R17.7_

  - [x] 37.3 Document UI state tests
    - Cover status-gated action visibility, queued/generating/ready/failed rendering, email-of-stored-document, and admin scoped listing.
    - _Requirements: R17.1, R17.2, R17.4_

- [x] 38. Frontend UI guardrail gate
  - [x] 38.1 Run impeccable detect on the changed surfaces
    - Run `impeccable detect apps/admissions/src/` and resolve P0 findings on the document UI surfaces.
    - _Requirements: R17.7_

- [x] 39. Checkpoint — Phase 10
  - `cd apps/admissions && bun run type-check && bun run lint && bun run test`; then `bun run build`. Confirm no production student component renders a client-only official PDF. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R17.1, R17.6, R17.7_

## Phase 11 — Drift guards (R18)

- [x] 40. Document-flow + fingerprint-dedup guards
  - [x] 40.1 Document-flow drift guard
    - Create `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts`: fail if a non-test student-facing module imports the `@/lib/pdf` barrel or calls `generateApplicationSlip`/`generateAcceptanceLetter`/`generatePaymentReceipt` for official downloads; report the offending module + symbol.
    - _Requirements: R18.1_

  - [x] 40.2 Fingerprint-dedup guard
    - Create `backend/tests/unit/test_official_document_dedup_guard.py`: fail if the official-document endpoint produces >1 persisted record for an unchanged fingerprint; report the duplicated fingerprint.
    - _Requirements: R18.2_

- [x] 41. Scope + unscoped-endpoint guards
  - [x] 41.1 Scope-authorization drift guard
    - Create `backend/tests/unit/test_scope_drift_guard.py`: fail if any non-super-admin code path authorizes application/payment/document access on an admin role check alone without `AccessScopeService`; report the offending path.
    - _Requirements: R18.3_

  - [x] 41.2 Unscoped-endpoint guard
    - Create `backend/tests/unit/test_unscoped_endpoint_guard.py`: fail if a document-serving endpoint returns application/payment/document records not constrained by `AccessScopeService` scope.
    - _Requirements: R18.4_

  - [x] 41.3 Wire all four guards into the standard test command
    - Ensure the document-flow, fingerprint-dedup, scope, and unscoped-endpoint guards run in the standard per-package test command and cause a non-zero exit on failure.
    - _Requirements: R18.5_

- [x] 42. Checkpoint — Phase 11
  - `cd backend && python3 -m pytest tests/unit/test_official_document_dedup_guard.py tests/unit/test_scope_drift_guard.py tests/unit/test_unscoped_endpoint_guard.py -q`; `cd apps/admissions && bun run test -- --run tests/unit/documentFlowDriftGuard`. Ensure all four guards run and pass. Ask the user if questions arise.
  - _Requirements: R18.1, R18.2, R18.3, R18.4, R18.5_

## Phase 12 — Documentation + rollout runbook honesty (R19)

- [x] 43. Update progress/handover/rollout docs + canonical-truth map
  - [x] 43.1 Honest progress/handover docs
    - Update `docs/multi-tenant-beanola-progress.md` and `docs/multi-tenant-beanola-handover.md` to separate "code complete" / "staging validated" / "production applied"; use real, non-future-dated timestamps (handoff date 2026-06-09); point every migration path at the Deployable_Migration_Path; do not mark work complete while migrations aren't deployable, security holes remain open, or students still use client-side official documents.
    - _Requirements: R19.1, R19.2, R19.5_

  - [x] 43.2 Complete the rollout runbook (Neon-first, production gated)
    - Update `docs/runbooks/multi-tenant-beanola-rollout.md` to reflect the Neon-first then production workflow (never apply production DB changes from this environment) and enumerate operator steps: back up the production DB → verify the migration-history prerequisite → dry-run + confirm the Tenant_Migration appears → apply in a maintenance window → post-migration validation SQL → validate MIHAS/KATC sample document generation → onboard a test school on staging → validate school-staff scope → validate the program-first flow → validate payment settlement metadata → monitor audit/errors → application-code rollback plan. Include the `migration_history` reconciliation note for any DB where the old filename was hand-applied, and the student-number rename `SELECT 1 FROM migration_history ...` precheck. **Production apply remains an operator step gated on user confirmation — never an automatic task here.**
    - _Requirements: R19.3, R19.4, R19.5_

  - [x] 43.3 Register new concepts in the canonical-truth map
    - Add `institution_document_profiles`, the official-document current-version/fingerprint lifecycle, the tenant-aware `communication_templates` columns, and the capacity-advisory-until-enrollment decision to `docs/canonical-truth-map.md`; confirm a drift-guard test exists for each frontend mirror.
    - _Requirements: R19.5, R20.10, R20.11_

- [x] 44. Checkpoint — Phase 12
  - Run the migration-drift doc-path guard (`backend/tests/unit/test_migration_drift_guard.py`) and confirm every doc-referenced migration path resolves and no doc marks the work production-applied. Ask the user if questions arise.
  - _Requirements: R19.1, R19.3, R19.5_

## Phase 13 — Final verification (R20, R21)

- [x] 45. Backward-compatibility + full verification gates
  - [x] 45.1 Backward-compatibility property test
    - **Property 25: Legacy null-canonical-ID applications remain readable** — applications with null canonical IDs return via their `Legacy_String_Fields` without error.
    - **Validates: Requirements 20.3** (`backend/tests/property/test_backward_compat_properties.py`; `--hypothesis-seed=0`, ≥100 examples)
    - _Requirements: R20.3_

  - [x] 45.2 Run all backend + frontend gates
    - Backend: `cd backend && python3 manage.py check`, `python3 -m pytest tests/unit -q` (and the new property files), `python3 manage.py spectacular --file /tmp/schema.yaml` — pass only on zero failures/issues/errors. Admissions: `cd apps/admissions && bun run type-check && bun run lint && bun run test`, then `bun run build` — pass only on zero errors. `git diff --check`. Record every skipped check with a written reason. Confirm routes, envelope, paginated shape, auth/CSRF/JTI, auto-save/≥44px/mobile-money-first UX, and RBAC are all preserved (R20.1–R20.9).
    - _Requirements: R20.1, R20.2, R20.4, R20.5, R20.7, R20.8, R20.9, R21.1, R21.2_

  - [x] 45.3 Targeted final searches (Definition of Done)
    - Brand search: `rg -n "MIHAS|KATC|Mukuba|Kalulushi|apply.mihas.edu.zm" apps/admissions/src apps/admissions/index.html backend/apps` → every hit allowlisted or rationale-recorded. Document-generator search → zero production student-path imports of client PDF generators for official documents. Scoped-access search → zero non-super-admin paths loading applications/payments/documents without `AccessScopeService`. Confirm the DoD: Tenant_Migration discoverable, docs accurate/not future-dated, out-of-scope admins blocked, student downloads come from backend stored documents, official documents deletion-protected, backend documents render from tenant config, new schools onboard without code changes, unknown schools never fall back to MIHAS, shared-portal branding is Beanola.
    - _Requirements: R21.3, R21.4, R21.5, R21.6, R21.7_

- [x] 46. Final checkpoint — remediation complete
  - Confirm all verification steps pass; record any failure with the failing step and resolve before handoff. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R21.6, R21.7_

## Notes

- Tasks marked `*` are optional and can be skipped for a faster MVP. Core security (Phase 2),
  migration delivery (Phase 1), document lifecycle (Phase 3), and validation (Phases 6, 7) work is
  never optional. The deferred `is_current` column (7.4) and extended UI/E2E coverage are the
  genuinely deferrable items.
- Each task references specific requirements for traceability; property sub-tasks name the property
  number, the requirements clause it validates, and the exact test file from the design's Testing
  Strategy property-to-test map.
- Property tests succeed only at the pinned seed: backend `--hypothesis-seed=0` (≥100 examples),
  frontend `fc.assert(prop, { numRuns: 100, seed: 0 })`.
- All schema work is authored as additive SQL under `backend/scripts/` and validated on a **Neon
  branch first**; **no production DB change is applied from this environment** — production apply is
  an operator step in `docs/runbooks/multi-tenant-beanola-rollout.md` (Phase 12), gated on explicit
  user confirmation.
- No DOCX/PDF merge engine; preserve `Legacy_String_Fields`, the `{"success": true, "data": ...}`
  envelope, 404 masking, and the UI guardrails (canonical primitives, Lucide, WCAG AA, ≥44px, no
  purple gradients/gradient text/glassmorphism/nested cards/emoji).
- Before any frontend task, load `PRODUCT.md` + `DESIGN.md` and consult the **impeccable**,
  **ui-ux-pro-max**, and **design-for-ai** skills.
