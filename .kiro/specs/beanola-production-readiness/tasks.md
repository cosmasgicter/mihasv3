# Implementation Plan: Beanola Production Readiness

## Overview

This plan takes the multi-school admissions platform from **code-complete** to
**production-ready**. It is a **verification + cutover + audit + polish + launch** plan over a
code-complete base delivered and Neon-validated by the remediation spec
`.kiro/specs/multi-tenant-beanola-remediation/` (R1–R21, all tasks complete, **production apply
pending**). It does **not** re-implement the multi-tenant feature — it **references** that base and
the real repo files, and each task produces a **verification artifact** (an audit inventory doc, a
Drift_Guard, a scoped-access test, screenshot evidence, a smoke checklist, an evidence block) plus
any **gap fix** the audit surfaces.

The plan mirrors the design's 15 components and the follow-up plan's phase sequencing:
freeze (R1) → audits + cutover prep (R2, R4, R5, R6, R3) → polish (R7) → prove (R8) → harden
(R9–R12) → CI gate (R13) → launch (R14) → Definition-of-Done exit gate (R15). R16 (platform
invariants) is a cross-cutting constraint enforced by guards and scoped tests throughout.

### Read first, before any task

1. Read `docs/beanola-production-readiness-followup-plan.md` (the 15-phase plan), this spec's
   `requirements.md` (R1–R16) and `design.md` (Components 1–15, Properties 26–33), and the
   remediation spec's `design.md` (Properties 13–25, referenced not restated).
2. Read `docs/runbooks/multi-tenant-beanola-rollout.md` (the gated 14-step Neon-first operator
   rollout the cutover executes), `docs/canonical-truth-map.md`, `docs/legacy-brand-allowlist.json`,
   `docs/multi-tenant-beanola-progress.md`, and `.kiro/steering/infrastructure.md`.
3. Verify every claim against the repo with `rg`/file reads before editing; the codebase is the
   source of truth. Engineering skills are always-on (source-code-context → agentic-engineering-
   workflow → code-structure-cleanup → grep-loop-review-workflow).

### Before any frontend task (Phases 2, 7)

Load `PRODUCT.md` + `DESIGN.md` (`node .kiro/skills/impeccable/scripts/load-context.mjs`) and
consult **impeccable**, **ui-ux-pro-max**, **design-for-ai**. Honour the UI guardrails on every
surface: canonical primitives (`PageShell`, `SectionCard`, `ErrorDisplay`, `EmptyState`,
`Button asChild`), Lucide icons, WCAG AA contrast, ≥44×44px touch targets, full Inter fallback
chain, reduced-motion, and **no** purple gradients, gradient text, glassmorphism, nested cards, or
emoji. Run `impeccable detect apps/admissions/src/` and resolve P0 findings before a frontend phase
closes.

### Hard constraints that bound every task (R16)

- **Neon-first, never-from-dev additive SQL.** All schema is the four existing additive scripts under
  `backend/scripts/`; authored/validated on Neon first; production apply is a gated operator step on
  the EC2 box, never an automatic task run from this environment (R16.8, R3.1, R3.4).
- **Backend-only official documents** — fingerprinted, versioned, deletion-protected; `@/lib/pdf` is
  preview/draft only and unreachable from official-download paths (R16.5).
- **404 masking** — out-of-scope reads return the Not_Found_Envelope byte-identical to a genuine miss
  (R16.4).
- **Mobile-first** — 360px primary; ≥44px; WCAG AA; Lucide; no purple-gradient/glassmorphism/
  nested-cards/emoji; auto-save + dirty-state protection; reduced-motion; full Inter chain (R16.9).
- **Preserved contract** — `/api/v1/...` routes, API_Envelope, `{page, pageSize, totalCount, results}`
  pagination, cookie auth + CSRF, 30-min access / 7-day refresh + JTI, Lenco mobile-money-first with
  deferral, RBAC `super_admin > admin > reviewer > student` (R16.6).
- **No PII/secrets/document bodies** in logs or audit trails (R16.7).
- **jobs-ops is out of scope** unless a requirement names it (R16.10).

### Testing conventions

- **New properties 26–33 are this spec's**; Properties 13–25 are **referenced** from the remediation
  spec and **not re-authored**.
- Backend property tests: `pytest` + `hypothesis`, **≥100 examples**, `--hypothesis-seed=0`. Each
  test implements exactly one property and carries the tag comment
  `Feature: beanola-production-readiness, Property {n}: {text}`.
- Frontend property tests: `vitest` + `fast-check`, `fc.assert(prop, { numRuns: 100, seed: 0 })`,
  same tag comment.
- Each property task names the **property number**, the **requirement(s) it validates**, and the
  **exact test file** from the design's property-to-test map.
- Sub-tasks marked `*` are optional/deferrable for a faster MVP. Core audit, cutover, security,
  document-lifecycle, and gate work is never optional.

## Tasks

## Phase 1 — Canonical freeze (R1) — Component 1

- [x] 1. Freeze and refresh the Canonical_Truth_Map
  - [x] 1.1 Refresh `docs/canonical-truth-map.md` for the latest Beanola state
    - Verify/refresh every domain concept names exactly one source of truth: application lifecycle,
      payment lifecycle, tenant identity, canonical program/offering/intake, document profile +
      official-doc lifecycle, staff scopes/grants, communication templates, feature flags, public
      routes/SEO, email sender/default contact, OpenAPI metadata, and the Brand_Allowlist (R1.1).
    - Record **both** admin routes with their **distinct scopes**: `/admin/tenants` (verified in
      `apps/admissions/src/routes/config.tsx`, guard `admin`) as the **Beanola product admin tenant
      surface** — authoritative for the launch smoke check (R14.3); and `/beanola-admin-panel/`
      (verified in `backend/config/urls.py`: `path("beanola-admin-panel/", admin.site.urls)`) as the
      **Django operational admin** surface. No route rename is performed.
    - Confirm the "No New Mirrors Without Guard" section is present and explicit (R1.2), and that
      every cross-layer mirror has a registered Drift_Guard or an explicit backend-only note (R1.3).
    - Confirm the map contains no platform-level language presenting MIHAS as platform identity (R1.6).
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 16.1, 16.2_

  - [x] 1.2 Confirm legacy-fallback branches are named, tested, non-executing, and removable
    - Verify the "Legacy-string fallback allowlist (R1.3)" section names every runtime legacy-fallback
      branch (`duplicate_checker.py`, `waitlist_manager.py`, `intake_enforcer.py`,
      `analytics/admissions_analytics.py`), each covered by `test_canonical_tenant_drift_guard.py`,
      non-executing for new canonical records, and with a documented removal condition (R1.5).
    - _Requirements: 1.5_

  - [x] 1.3 Canonical-map / No-New-Mirrors verification check
    - Confirm the Verification_Gate fails if a mirror exists in active runtime source without a map
      entry and a guard: run the existing drift-guard suite and assert the canonical-tenant guard and
      schema/role/error/payment mirrors are all registered in the map (R1.4).
    - _Requirements: 1.4_

- [x] 2. Checkpoint — Phase 1
  - Run the canonical/brand drift-guard subset:
    `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/unit/test_canonical_tenant_drift_guard.py tests/unit/test_brand_drift_guard.py -q`.
    Confirm the frozen map records both admin routes with scopes and has no stale MIHAS platform
    language. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.1, 1.4, 1.6_

## Phase 2 — Brand and tenant boundary cleanup (R2) — Component 2

- [x] 3. Brand scan + allowlist tightening
  - [x] 3.1 Run the brand `rg` scans and classify every hit
    - Run the plan's scans over `apps/admissions/src`, `apps/admissions/index.html`, `backend/apps`,
      `backend/config`:
      `rg -n "MIHAS|KATC|Mukuba|Kalulushi|mihas\.edu\.zm|katc\.edu\.zm|apply\.mihas|api\.mihas|mihas-admin-panel" ...`
      and the sender/address scan. Classify every hit as platform-default (must remove), seeded
      tenant data, dev/PDF-preview fixture not reachable from official paths, historical/archived doc,
      or intentional test fixture (R2.2). Record results as a brand-scan evidence note in
      `docs/multi-tenant-beanola-progress.md` (R2.6).
    - _Requirements: 2.2, 2.6, 16.1_

  - [x] 3.2 Tighten `docs/legacy-brand-allowlist.json` to reviewed single-file entries
    - Remove stale entries; ensure **no whole-directory entries** — each entry names a single file
      path (R2.3) and states why it cannot be removed yet, classified as exactly one of: seeded tenant
      data, historical archived doc, named legacy-compat code with a guard, or dev/PDF-preview fixture
      not reachable from official-download paths (R2.2, R2.4).
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 3.3 Verify PDF theme unknown-institution behaviour and logo resolution
    - Confirm `apps/admissions/src/lib/pdf/theme/index.ts` (`getInstitution()`/`institutions`
      registry) returns a Beanola-generic preview (or raises for official documents) for an unknown
      institution and never renders MIHAS/KATC for an unknown school (R2.5). Confirm Beanola logo
      asset paths referenced by active runtime source resolve to existing assets (R2.7); fix any
      broken path as a gap fix.
    - _Requirements: 2.5, 2.7_

  - [x] 3.4 Confirm the paired brand drift guards pass
    - Run `backend/tests/unit/test_brand_drift_guard.py` and
      `apps/admissions/tests/unit/brandDriftGuard.test.ts`; if a hit is genuinely required, add a
      reviewed single-file allowlist entry rather than weakening the guard (R2.1).
    - _Requirements: 2.1_

- [x] 4. Property test — no non-allowlisted legacy brand string in active source
  - [x] 4.1 Brand-scan property over active runtime source
    - **Property 28: No non-allowlisted legacy brand string in active source**
    - **Validates: Requirements 2.1, 7.12, 16.1**
    - Test artifact: `backend/tests/unit/test_brand_drift_guard.py` +
      `apps/admissions/tests/unit/brandDriftGuard.test.ts` (existing guards; assert the scan property
      over `apps/admissions/src`, `index.html`, `backend/apps`, `backend/config` minus the allowlist).
      Tag: `Feature: beanola-production-readiness, Property 28: No non-allowlisted legacy brand string in active source`.
    - _Requirements: 2.1, 7.12, 16.1_

- [x] 5. Checkpoint — Phase 2
  - Run `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/unit/test_brand_drift_guard.py -q`
    and `cd apps/admissions && bun run test brandDriftGuard`. Confirm the allowlist has only reviewed
    single-file entries and no broken Beanola logo paths exist. Ensure all tests pass, ask the user if
    questions arise.
  - _Requirements: 2.1, 2.3, 2.7_

## Phase 3 — Gated production database cutover, Neon-first (R3) — Component 3

> **This phase executes the existing 14-step runbook** `docs/runbooks/multi-tenant-beanola-rollout.md`.
> It authors **no new schema** — all four scripts already exist as additive/idempotent SQL. Steps
> 6.1–6.2 run on Neon (authoring/staging). Step 6.3 is the **gated operator production apply**.

- [ ] 6. Execute the gated Neon-first production cutover
  - [x] 6.1 Neon validation: dry-run discovery + apply + reapply + validation SQL
    - On a Neon branch (`create_branch`), run `apply_sql_migrations --dry-run` and confirm the four
      top-level scripts are discovered in correct lexical order
      (`2026_06_08_01_multi_tenant_beanola_admissions.sql`, `2026_06_08_student_number.sql`,
      `2026_06_08_03_institution_document_profiles.sql`,
      `2026_06_08_04_communication_templates_tenant.sql`) with the additive-only lint passing (no
      `DROP`/`TRUNCATE`/unguarded `DELETE`) (R3.2). Apply, then reapply to prove idempotency, then run
      the runbook validation SQL: duplicate hostname/slug checks return zero rows and
      `canonical_programs` is non-zero (R3.3). Capture the branch id and migration log. Do not apply
      to production from this environment (R3.1).
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 6.2 Confirm scripts are additive and Migration_History_Prerequisite present
    - Confirm all four scripts are additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
      `INSERT … ON CONFLICT`, `CREATE INDEX IF NOT EXISTS`, `ADD CONSTRAINT … NOT VALID`) — no new
      schema authored here (R3.8). Verify `2026_05_22_migration_history_extend.sql` is applied on the
      target DB (the `checksum` column + `uq_migration_history_migration_name` index both return a
      row); otherwise the Migration_Runner refuses to run with `MIGRATION_HISTORY_NOT_EXTENDED` (R3.6).
    - _Requirements: 3.6, 3.8_

  - [ ] 6.3 GATED OPERATOR PRODUCTION APPLY — NON-AUTOMATIC, requires explicit user confirmation
    - **⚠️ OPERATOR STEP — DO NOT RUN FROM THIS DEVELOPMENT ENVIRONMENT. An agent MUST NOT execute this
      task. It is gated on explicit user confirmation and performed by the Operator on the EC2 box
      (`ssh … ec2-13-244-37-190.af-south-1.compute.amazonaws.com`) during a maintenance window** (R3.4).
    - Per the runbook steps 1–14: take a production DB backup (`./deploy/backup-db.sh`) and confirm it
      is non-empty and restorable before any migration (R3.5); verify the Migration_History_Prerequisite
      (R3.6); run dry-run → apply → post-migration validation SQL; additive-only, no destructive change
      through the container-startup sweep (R3.8); reconcile any double-tracked migration name per the
      runbook's "Migration-history reconciliation" section (R3.10).
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 16.8_

  - [ ] 6.4 Capture the production evidence block
    - Record into `docs/multi-tenant-beanola-progress.md` and the runbook's Phase-1 evidence section:
      migration names applied, `migration_history` rows + checksums, counts (institutions / canonical
      programs / offerings / intakes / applications-with-canonical-IDs / unlinked legacy rows),
      duplicate domain/slug checks, scope-table counts, and document-profile counts (R3.7). Confirm
      legacy null-canonical-ID applications, legacy string snapshots, prior Official_Documents, and
      prior payments/receipts remain readable and unchanged (R3.9, referenced remediation Property 25).
    - _Requirements: 3.7, 3.9_

  - [x] 6.5 Neon-branch idempotence integration test
    - Add/confirm an integration test asserting apply→reapply on a Neon branch is a no-op (second run
      records no new `migration_history` rows) and the validation SQL invariants hold — the
      non-property verification for the operator cutover.
    - _Requirements: 3.2, 3.3_

- [ ] 7. Checkpoint — Phase 3 (Neon side only; production apply remains operator-gated)
  - Confirm the Neon validation evidence (6.1) is complete and the production evidence block (6.4) is
    captured **only after** the operator completes 6.3. Until 6.3 is done, this phase is "staging
    validated, production pending". Ensure all checks pass, ask the user if questions arise.
  - _Requirements: 3.1, 3.3, 3.7_

## Phase 4 — Backend API contract audit (R4) — Component 4

- [x] 8. Generate OpenAPI and build the API contract inventory
  - [x] 8.1 Generate the Beanola-branded OpenAPI schema with zero errors
    - Run `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py spectacular --file /tmp/openapi.yaml`;
      confirm zero errors and Beanola-branded metadata (R4.1).
    - _Requirements: 4.1_

  - [x] 8.2 Author the API contract inventory document
    - Create an inventory doc (e.g. `docs/audits/api-contract-inventory.md`) mapping every admissions
      frontend service method under `apps/admissions/src/services/` to a backend endpoint across auth,
      profile, catalog/context/canonical-programs, applications, student documents, official documents,
      payments, interviews, notifications, and the admin dashboard/applications/users/audit-trail/
      tenant-onboarding/document-profiles/assets/templates/access-grants surfaces (R4.2). For each
      endpoint record envelope shape, error code, pagination shape `{page, pageSize, totalCount,
      results}` inside `data`, auth class, scope filter, serializer fields, frontend type, and UI
      consumer — flag any UI depending on an undocumented field (R4.3, R4.4).
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 8.3 Confirm error normalization and out-of-scope masking at the contract level
    - Verify recoverable student-facing errors carry a stable code + guidance and never expose a raw
      Django/DRF error (R4.6), and out-of-scope targets return the Not_Found_Envelope (R4.7). Apply gap
      fixes where the inventory finds a raw-error leak or an unmasked out-of-scope path.
    - _Requirements: 4.6, 4.7_

  - [x] 8.4 Confirm rate limits exist on the sensitive surfaces
    - Verify rate limits exist for login/register/password-reset, the public tracker, payment
      initiation, document download/sign-URL, and admin bulk operations (R4.8); record gaps as fixes.
    - _Requirements: 4.8_

- [x] 9. Contract tests and OpenAPI drift guard
  - [x] 9.1 Backend serializer-response tests
    - Add backend serializer-response tests asserting the audited endpoints return the API_Envelope
      with the documented serializer fields and paginated shape (R4.5).
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 9.2 Frontend service-normalization tests
    - Add frontend service-normalization tests asserting each `services/` method normalizes the
      backend envelope/pagination into its declared type (R4.5).
    - _Requirements: 4.4, 4.5_

  - [x] 9.3 OpenAPI drift guard (route presence + important fields)
    - Add `apps/admissions/tests/unit/openApiContractDriftGuard.test.ts` asserting every frontend
      service route is present in the generated OpenAPI schema and important fields match (R4.5).
    - _Requirements: 4.5_

  - [x] 9.4 Property test — frontend service shapes match the backend contract
    - **Property 27: Frontend service shapes match the backend contract**
    - **Validates: Requirements 4.3, 4.4, 16.6**
    - Test artifact: `apps/admissions/tests/unit/openApiContractDriftGuard.test.ts` (service shape vs
      generated schema) + `backend/tests/property/test_envelope_pagination_conformance.py` (envelope +
      `{page, pageSize, totalCount, results}` conformance, `--hypothesis-seed=0`, ≥100 examples).
      Tag: `Feature: beanola-production-readiness, Property 27: Frontend service shapes match the backend contract`.
    - _Requirements: 4.3, 4.4, 16.6_

  - [x] 9.5 Property test — recoverable student-facing errors are stable and guidance-bearing
    - **Property 31: Recoverable student-facing errors are stable and guidance-bearing**
    - **Validates: Requirements 4.6**
    - Test artifact: `backend/tests/property/test_student_error_envelope_properties.py`
      (`--hypothesis-seed=0`, ≥100 examples). Tag:
      `Feature: beanola-production-readiness, Property 31: Recoverable student-facing errors are stable and guidance-bearing`.
    - _Requirements: 4.6_

- [x] 10. Checkpoint — Phase 4
  - Run `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py spectacular --file /tmp/openapi.yaml`
    and the new backend serializer + envelope/error property tests; `cd apps/admissions && bun run test openApiContractDriftGuard`.
    Confirm no UI depends on an undocumented field. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 4.1, 4.4, 4.5_

## Phase 5 — Tenant scoping and security audit (R5) — Component 5

- [x] 11. Endpoint inventory and scoped-access tests
  - [x] 11.1 Author the endpoint inventory document (no unknown-scope rows)
    - Create `docs/audits/scope-endpoint-inventory.md` classifying every admissions endpoint as
      public-anonymous, student-owned, staff-scoped, or super-admin-only, with **no unresolved
      "unknown scope" rows** (R5.1). For every staff-scoped endpoint (application, payment, document,
      dashboard aggregate, audit trail, user listing, notification/communication, tenant-onboarding
      child resource) confirm the queryset filters through
      `backend/apps/catalog/services.py:AccessScopeService` and that object-level checks use canonical
      IDs, not Legacy_String_Fields (R5.2, R5.8). Record gap fixes for any unscoped queryset.
    - _Requirements: 5.1, 5.2, 5.8_

  - [x] 11.2 Build the scoped-access test matrix
    - Add scoped-access tests proving: in-scope → API_Envelope (R5.3); out-of-scope →
      Not_Found_Envelope (R5.4); expired Access_Grant → Not_Found_Envelope (R5.5); offering-scoped and
      application-scoped grants permit only that target (R5.6); Super_Admin sees all (R5.7). Cover the
      document auth seam `document_storage_views.py:_get_authorized_document` and every staff/admin
      view returning tenant data.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 11.3 Confirm scope + unscoped-endpoint guards and PII/file-security controls
    - Confirm `backend/tests/unit/test_scope_drift_guard.py` and `test_unscoped_endpoint_guard.py`
      pass and no non-super-admin path bypasses `AccessScopeService` (R5.9). Confirm no PII leaks on
      out-of-scope, anonymous (public tracker), error, audit, or export surfaces, and that signed-URL
      expiry, MIME/magic-byte validation, SVG handling, storage-key naming, document-delete protection,
      and official-doc overwrite protection are enforced (R5.10).
    - _Requirements: 5.9, 5.10_

  - [x] 11.4 Property test — tenant isolation holds across every audited endpoint
    - **Property 26: Tenant isolation holds across every audited endpoint**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 8.3, 8.4, 16.4**
    - Test artifact: `backend/tests/property/test_production_scope_masking_properties.py` (drives every
      endpoint in the R5 inventory through in-scope / out-of-scope / expired-grant / offering-scoped /
      super-admin cases; `--hypothesis-seed=0`, ≥100 examples) +
      `backend/tests/unit/test_scope_drift_guard.py` + `test_unscoped_endpoint_guard.py`. Tag:
      `Feature: beanola-production-readiness, Property 26: Tenant isolation holds across every audited endpoint`.
      Extends remediation Property 13 from the document surfaces to every audited endpoint.
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 8.3, 8.4, 16.4_

- [x] 12. Checkpoint — Phase 5
  - Run `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/property/test_production_scope_masking_properties.py tests/unit/test_scope_drift_guard.py tests/unit/test_unscoped_endpoint_guard.py -q`
    and `python3 manage.py check`. Confirm the inventory has no unknown-scope rows and out-of-scope
    reads mask as 404. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 5.1, 5.4, 5.9_

## Phase 6 — Document system production audit (R6) — Component 6

- [x] 13. Document-type audit and official-only download enforcement
  - [x] 13.1 Author the document-type audit document
    - Create `docs/audits/document-type-audit.md` covering application slip, acceptance letter,
      conditional offer, finance receipt, payment receipt (and any future enrollment/registration
      doc), verifying for each: backend generation path
      (`backend/apps/applications/tasks/pdf_generation.py` + `tasks/pdf/`), profile resolution
      (`InstitutionDocumentProfileService`), required tenant assets, required template tokens,
      fingerprint inputs (`_compute_document_fingerprint`), versioning, storage path, download
      permission, and email-attachment behaviour (R6.1).
    - _Requirements: 6.1_

  - [x] 13.2 Confirm backend-only official downloads + document-flow guard
    - Confirm downloads serve the backend-stored Official_Document, never a client render (R6.2), and
      that client official-PDF actions on the student wizard success screen, student payment page,
      public tracker, and admin application-detail are removed/quarantined so `@/lib/pdf` generators
      are unreachable from official paths — enforced by
      `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` (R6.3). Apply gap fixes for any
      reachable client-PDF action.
    - _Requirements: 6.2, 6.3, 16.5_

  - [x] 13.3 Verify failure states, dedup, seeding, previews, and provenance
    - Verify the no-profile path sets status `failed` with a descriptive error
      (`DOCUMENT_PROFILE_NOT_CONFIGURED`) and produces no frontend-content document (R6.4); that
      missing logo/signature, invalid token, invalid asset MIME, storage failure, and render failure
      surface the failure state and never serve stale/client PDFs (R6.5); that repeated unchanged
      generation reuses the current version by fingerprint with no duplicate records (R6.6, dedup
      guard `backend/tests/unit/test_official_document_dedup_guard.py`); that MIHAS/KATC profiles seed
      from `backend/apps/catalog/management/commands/seed_tenant_document_profiles.py` and a Beanola
      demo profile exists only on staging (R6.7); that previews use sample data and are labelled
      (R6.8); and that provenance includes institution, profile id+version, asset ids, and fingerprint
      with no document bodies/PII/secrets in audit trails (R6.9, referenced remediation Property 23).
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 13.4 Property test — no client-only official PDF reachable from an official-download path
    - **Property 29: No client-only official PDF is reachable from an official-download path**
    - **Validates: Requirements 6.2, 6.3, 16.5**
    - Test artifact: `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` (existing; extend
      platform-wide so no student/admin module on an official-download path imports the `@/lib/pdf`
      barrel or invokes `generateApplicationSlip`/`generateAcceptanceLetter`/`generatePaymentReceipt`
      for an official document). Tag:
      `Feature: beanola-production-readiness, Property 29: No client-only official PDF is reachable from an official-download path`.
    - _Requirements: 6.2, 6.3, 16.5_

  - [x] 13.5 Property test — failed official-document generation never serves a stale or client PDF
    - **Property 32: Failed official-document generation never serves a stale or client PDF**
    - **Validates: Requirements 6.5, 14.6**
    - Test artifact: `backend/tests/property/test_official_document_failure_degradation.py` (extends
      `backend/tests/unit/test_official_document_dedup_guard.py`; `--hypothesis-seed=0`, ≥100 examples)
      — any failed generation records `failed`, leaves prior Official_Documents unchanged, and blocks
      download. Tag:
      `Feature: beanola-production-readiness, Property 32: Failed official-document generation never serves a stale or client PDF`.
    - _Requirements: 6.5, 14.6_

- [x] 14. Checkpoint — Phase 6
  - Run `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/unit/test_official_document_dedup_guard.py tests/property/test_official_document_failure_degradation.py -q`
    and `cd apps/admissions && bun run test documentFlowDriftGuard`. Confirm students/admins download
    only backend official documents and missing-profile fails visibly. Ensure all tests pass, ask the
    user if questions arise.
  - _Requirements: 6.2, 6.4, 6.6_

## Phase 7 — Per-route and mobile-first UI/UX critique and polish (R7) — Component 7

- [x] 15. Per-route critique, mobile-first fixes, and the overflow guard
  - [x] 15.1 Author per-route pass/fail notes for every UI_Route
    - Create `docs/audits/ui-route-critique.md` with pass/fail notes for every public, student, and
      admin UI_Route in the plan's Phase-7 matrix (enumerated in `apps/admissions/src/routes/config.tsx`,
      pages under `apps/admissions/src/pages/`); every fail gets an issue ID or task (R7.1). For each
      route at every Mobile_Breakpoint (360, 390, 768, 1024, ≥1440) record no horizontal overflow, no
      clipped buttons, no overlapping text, no hidden required actions (R7.2); ≥44×44px touch targets
      at 360px (R7.3); WCAG AA contrast with status colour paired with icon/label and Lucide icons
      (R7.4); no purple gradients/gradient text/glassmorphism/nested cards/emoji and full Inter
      fallback chain (R7.5); reduced-motion respected (R7.7); scope/school context visible per role
      (R7.8); Beanola-as-platform copy with school names only from tenant data and no hard-coded
      fees/health-only language on generic surfaces (R7.12). Run `impeccable detect apps/admissions/src/`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.12_

  - [x] 15.2 Apply critical UI fixes — forms, tables, dialogs
    - Fix every critical failure: student forms show labels, field-level + server errors, submit
      disabled/loading, clear success, and preserve auto-save + dirty-state protection on navigation
      and `beforeunload` (R7.6); admin tables become cards/scroll containers with collapsible filters
      and safe bulk actions on mobile (R7.9); dialogs are full-screen/bottom-sheet with focus trap and
      working close/escape/back (R7.10). Use canonical primitives; honour all UI guardrails.
    - _Requirements: 7.6, 7.9, 7.10_

  - [x] 15.3 Add the route-mobile-overflow DOM guard
    - Add `apps/admissions/tests/unit/routeMobileOverflowGuard.test.tsx` measuring, across the route
      set at 360px, no horizontal overflow and ≥44×44px interactive targets.
    - **Property 30: Every UI route is overflow-free with adequate touch targets at 360px**
    - **Validates: Requirements 7.2, 7.3**
    - Test artifact: `apps/admissions/tests/unit/routeMobileOverflowGuard.test.tsx`
      (`fc.assert(prop, { numRuns: 100, seed: 0 })`, DOM-measured). Tag:
      `Feature: beanola-production-readiness, Property 30: Every UI route is overflow-free with adequate touch targets at 360px`.
    - _Requirements: 7.2, 7.3_

  - [x] 15.4 Capture Playwright screenshot evidence
    - Capture screenshot evidence (Playwright) for the key routes at the Mobile_Breakpoint set,
      including failure screenshots referenced from the issue notes in `ui-route-critique.md` (R7.11).
    - _Requirements: 7.11_

- [x] 16. Checkpoint — Phase 7
  - Run `cd apps/admissions && bun run test routeMobileOverflowGuard && bun run lint` and
    `impeccable detect apps/admissions/src/`. Confirm no route overflows at 360px and all critical
    fails are fixed. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 7.1, 7.2, 7.11_

## Phase 8 — End-to-end workflow QA (R8) — Component 8

- [x] 17. Run E2E flows on staging and author the smoke checklist
  - [x] 17.1 Student E2E flow set on staging
    - Run the student E2E_Flow set on the Neon staging branch (signup → verification → application
      creation → canonical-program/intake selection → assigned institution → document upload →
      save-draft/resume → pay-or-defer → submission → backend application-slip download → public
      tracking → communication → interview → decision → acceptance/conditional-offer + receipt
      download) (R8.1), as Playwright scripts or documented manual runs.
    - _Requirements: 8.1_

  - [x] 17.2 Admin E2E flow set on staging
    - Run the admin E2E_Flow set (super-admin login → institution creation → logo/signature upload →
      document-profile creation → offering creation/assignment → routing simulator → add staff →
      scoped Access_Grant → staff scoped-only view → review → payment verification → official-doc
      generation → audit → scoped export) (R8.2).
    - _Requirements: 8.2_

  - [x] 17.3 Negative E2E flows proving the security boundaries
    - Prove: wrong-school staff → Not_Found_Envelope (R8.3); expired grant cannot open
      payment/document (R8.4); no document profile blocks official generation with a clear error
      (R8.5); duplicate application blocked and full intake → recoverable guidance (R8.6); failed
      payment never produces a paid receipt (R8.7, owned by payment-hardening properties); anonymous
      tracker leaks no PII (R8.8). These assert Property 26 holds end-to-end.
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 17.4 Author the manual smoke checklist for production release
    - Create `docs/runbooks/production-smoke-checklist.md` covering the critical flows for production
      release (R8.9); link it from release notes (used by R13.5 and R14.3).
    - _Requirements: 8.9_

- [x] 18. Checkpoint — Phase 8
  - Confirm the student/admin E2E flows pass on staging and the negative flows prove the boundaries;
    confirm the manual smoke checklist exists. Ensure all checks pass, ask the user if questions arise.
  - _Requirements: 8.1, 8.3, 8.9_

## Phase 9 — Backend reliability and operations (R9) — Component 9

- [x] 19. Operations verification + restore drill + rollback posture
  - [x] 19.1 Verify health, background tasks, idempotency, and logging
    - Confirm `/health/live/` and `/health/ready/` report DB connectivity and Redis/Celery readiness
      (R9.1); the Celery Beat surfaces (PDF generation, email queue, payment reconciliation,
      notification dispatch, uptime) are operational and monitored (R9.2); repeated payment initiation,
      webhook, official-doc generation, and email retry behave idempotently (`@idempotent`, webhook
      dedup, fingerprint reuse) (R9.3); structured logs include request ID, user ID where safe,
      institution ID, payment reference, and document ID, with no secrets or full PII (R9.4, R16.7).
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 19.2 Verify monitoring + send a test event
    - Confirm GlitchTip error tracking, a Beanola-default alert email (`ERROR_ALERT_EMAIL`), and
      failed-task/payment-webhook/PDF-render alerts; send a test monitoring event successfully (R9.5).
    - _Requirements: 9.5_

  - [x] 19.3 Backup test + restore drill + rollback posture doc
    - Test `deploy/backup-db.sh`, perform a restore drill on staging/local with documented retention
      (R9.6), and document the rollback posture (forward-only additive migrations, feature-disable
      without data drop, feature flags) in `docs/runbooks/database-backup-restore.md` and the rollout
      runbook (R9.7). Confirm `manage.py check` passes in the staging/prod env (R9.8).
    - _Requirements: 9.6, 9.7, 9.8_

- [x] 20. Checkpoint — Phase 9
  - Run `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 manage.py check` and the
    health/idempotency tests. Confirm the restore drill and rollback posture are documented. Ensure all
    tests pass, ask the user if questions arise.
  - _Requirements: 9.1, 9.6, 9.8_

## Phase 10 — Security and privacy review (R10) — Component 10

- [x] 21. Security/privacy review with a findings register
  - [x] 21.1 Auth, authorization, input validation, secrets/env
    - Verify the auth stack enforces HTTP-only cookies, 30-min access / 7-day refresh + JTI
      blacklisting, refresh rotation, logout/session cleanup, and CSRF on state-changing requests
      (R10.1, R16.6); authorization enforces owner/scope/super-admin/object-level checks per the
      RBAC_Hierarchy (R10.2); inputs are validated and token values HTML-escaped with invalid input
      rejected descriptively (R10.3, referenced remediation Property 19); no secrets in the repo, env
      examples current, prod env reviewed (R10.4).
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 21.2 Payment security, privacy, headers, abuse controls
    - Verify payment controls enforce webhook signature, idempotency keys, reconciliation, and receipt
      authorization with the Lenco mobile-money-first UX + deferral preserved (R10.5, R16.6); privacy
      controls minimize public-tracker data, gate exports, document audit retention, and keep PII out
      of logs (R10.6); responses set CSP (with GlitchTip `report-uri`) / HSTS / X-Frame-Options /
      Referrer-Policy via `apps/admissions/vercel.json` + backend middleware (R10.7); abuse controls
      enforce rate limits, password-reset/public-tracker throttling, and upload size limits (R10.8).
    - _Requirements: 10.5, 10.6, 10.7, 10.8_

  - [x] 21.3 Author the findings register
    - Create `docs/audits/security-privacy-review.md` with a findings register (severity + owner +
      launch decision); confirm no high-severity finding is open and any medium finding is owned with a
      launch decision (R10.9).
    - _Requirements: 10.9_

- [x] 22. Checkpoint — Phase 10
  - Confirm no high-severity finding is open and the headers/abuse controls are verified. Run the auth/
    CSRF/JTI test subset. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 10.1, 10.7, 10.9_

## Phase 11 — Performance and Core Web Vitals (R11) — Component 11

- [x] 23. Performance evidence + fixes
  - [x] 23.1 Measure Lighthouse mobile, bundle, and API timings
    - Measure Lighthouse mobile for public home, signup, tracker, student dashboard, admin dashboard,
      plus Vite bundle analysis and API timings; record in `docs/audits/performance-cwv.md` (R11.1).
    - _Requirements: 11.1_

  - [x] 23.2 Frontend chunking + lazy-load fixes
    - Confirm entry chunks exclude dev-preview routes and oversized PDF/vendor chunks and that
      admin-heavy modules are lazy-loaded via `apps/admissions/src/routes/config.tsx` (R11.2); apply
      lazy-load fixes as gaps are found.
    - _Requirements: 11.2_

  - [x] 23.3 Backend N+1 / index / pagination + layout stability
    - Confirm tenant-scoped queries (application detail, dashboard, documents, payments) avoid N+1,
      paginate large lists, and index slow queries (R11.3); confirm public pages meet acceptable CWV
      thresholds and admin pages stay responsive at realistic volume (R11.4); confirm stable skeleton
      dimensions and no dynamic text resizing keep CLS within threshold (R11.5). Apply index/lazy-load
      gap fixes (additive indexes authored Neon-first if needed).
    - _Requirements: 11.3, 11.4, 11.5_

- [x] 24. Checkpoint — Phase 11
  - Confirm Lighthouse/CWV thresholds are met for public pages and no critical slow query remains
    unindexed. Ensure all checks pass, ask the user if questions arise.
  - _Requirements: 11.1, 11.4_

## Phase 12 — Data quality and seed readiness (R12) — Component 12

- [x] 25. Per-school read-only data-quality verification
  - [x] 25.1 Author per-school read-only verification queries + not-ready flags
    - Create `docs/audits/data-quality-seed-readiness.md` stating all checks as **read-only
      verification queries** (no production writes from dev, R16.8): institution data
      (slug/code/brand/legal name/emails/phones/domains/active) (R12.1); assets
      (logo/signature/seal/checksums/active version) (R12.2); flag any active offering missing a
      canonical-program link, intake, or fee rule as not ready (R12.3); catalog data (canonical
      programs, offerings, intakes, fees, capacity, assignment priority, eligibility rules) (R12.4);
      flag any active school missing a required document profile + assets as not ready (R12.5);
      document config (required docs, profiles, template tokens, bank details, signatory) per school
      (R12.6); staff data (super-admins, institution admins, reviewers, finance approvers, scoped
      grants) (R12.7); comms config (email/SMS templates, sender email, support contact) Beanola-or-
      tenant-derived (R12.8, referenced remediation Property 22). Run against Neon (staging) and
      reflect in the production evidence block.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

- [x] 26. Checkpoint — Phase 12
  - Confirm the per-school checklist is signed off with read-only query results and no active
    school/offering carries an unresolved not-ready flag. Ensure all checks pass, ask the user if
    questions arise.
  - _Requirements: 12.3, 12.5_

## Phase 13 — Verification gate and Drift_Guard CI (R13) — Component 13

- [x] 27. Wire the Verification_Gate + full Drift_Guard inventory into CI
  - [x] 27.1 Reproduce the zero-error command set in CI
    - Ensure CI runs the Verification_Gate with zero errors: backend `python3 -m pytest tests/unit
      tests/property`, `python3 manage.py check`, `python3 manage.py spectacular`; admissions
      `bun run type-check`, `bun run lint`, `bun run test`, `bun run build` (R13.1).
    - _Requirements: 13.1_

  - [x] 27.2 Add CI jobs for the full Drift_Guard list and fail-on-drift policy
    - Ensure CI includes jobs matching the required Drift_Guard inventory (frontend + backend brand
      drift, document-flow drift, official-document dedup, scope drift, unscoped endpoint, canonical-
      tenant drift, payment-status drift, error-code drift, role mirror, application-lifecycle, schema
      drift) cross-checked against `docs/canonical-truth-map.md` (R13.2); CI fails on any type/lint/
      build failure, brand drift, unscoped-endpoint drift, or schema drift (R13.3); no required guard
      is optional (R13.6); all intended new tests are committed with none untracked (R13.4); release
      notes link the Smoke_Check job or manual checklist (R13.5).
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 28. Checkpoint — Phase 13 (full Verification_Gate)
  - Run the full gate locally:
    `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/unit tests/property -q && python3 manage.py check && python3 manage.py spectacular --file /tmp/openapi.yaml`;
    `cd apps/admissions && bun run type-check && bun run lint && bun run test && bun run build`.
    Confirm every required guard runs in CI and is non-optional. Ensure all pass with zero errors, ask
    the user if questions arise.
  - _Requirements: 13.1, 13.2, 13.3_

## Phase 14 — Production launch checklist and rollback posture (R14) — Component 14

- [x] 29. Launch checklist, smoke set, and graceful-degradation posture
  - [x] 29.1 Pre-launch env/branch + pre-deploy gate/build/backup/migrate/validate
    - Pre-launch: freeze a release branch, confirm no uncommitted production code, confirm the required
      env vars (`DATABASE_URL`, `SECRET_KEY`, JWT signing key, email sender creds, Lenco keys, R2/S3
      keys, CORS origins, cookie domain, frontend base URL, error-monitoring DSN) (R14.1). Pre-deploy:
      run the full Verification_Gate + production build, back up the production DB, apply migrations,
      run validation SQL (R14.2). Author/refresh `docs/runbooks/production-launch-checklist.md`.
    - _Requirements: 14.1, 14.2_

  - [x] 29.2 Post-deploy Smoke_Check set (two admin surfaces checked separately)
    - Document the immediate Smoke_Check set: public home Beanola branding, contact mailto Beanola,
      signup/login, catalog, wizard draft, assignment preview, safe-environment payment initiation,
      public tracker no-PII, **admin login at `/admin/tenants`** (the main Beanola product admin tenant
      surface, authoritative per R1), with the **`/beanola-admin-panel/` Django operational admin**
      surface checked **separately**, super-admin tenant onboarding, staff scoped-data check,
      official-document generation for one staged application, Beanola/tenant email render, no
      deployment errors, health checks (R14.3).
    - _Requirements: 14.3_

  - [x] 29.3 Graceful-degradation posture + progress doc update
    - Document the launch-time graceful-degradation posture: failed tenant feature → disable
      route/action keep data intact (R14.4); failed payment → stop initiation keep submission safe
      (R14.5); failed official-doc generation → show "generation failed" and block download rather
      than serve a stale frontend PDF (R14.6, Property 32); DB rollback forward-only unless a tested
      rollback script exists, code rollback allowed (R14.7). After the window, confirm no critical log
      errors and update `docs/multi-tenant-beanola-progress.md` with exact date/time + evidence (R14.8).
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8_

- [x] 30. Checkpoint — Phase 14
  - Confirm the launch checklist, post-deploy smoke set (both admin surfaces), and rollback posture are
    documented and the progress doc is updated. Ensure all checks pass, ask the user if questions arise.
  - _Requirements: 14.1, 14.3, 14.8_

## Phase 15 — Definition-of-Done exit gate (R15) — Component 15

- [ ] 31. Definition-of-Done aggregation + final sign-off
  - [x] 31.1 Implement the all-or-nothing Definition-of-Done evaluator
    - Implement the Definition_of_Done as an all-or-nothing aggregation over the Component 1–14 exit
      conditions: canonical map accurate + allowlist reviewed (R15.1); clean brand scans (R15.2); all
      tenant migrations applied to staging **and** production with evidence (R15.3); every tenant-data
      endpoint scope-reviewed + scoped-tested **and** every frontend service shape matching the
      serializers/OpenAPI (R15.4); every UI_Route passed at every Mobile_Breakpoint + a Smoke_Check per
      critical workflow (R15.5); Verification_Gate + production Smoke_Check pass (R15.6); monitoring/
      backups/error-reporting/alert-email/CORS/cookies/env verified (R15.7). The gate is true iff every
      condition holds; if any is unmet the platform is not production-ready (R15.8).
    - **Property 33: The Definition-of-Done exit gate is all-or-nothing**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
    - Test artifact: `backend/tests/property/test_definition_of_done_gate.py` (gate true ⇔ all
      conditions true; `--hypothesis-seed=0`, ≥100 examples). Tag:
      `Feature: beanola-production-readiness, Property 33: The Definition-of-Done exit gate is all-or-nothing`.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [ ] 31.2 Final sign-off and `.config.kiro` status (after operator rollout only)
    - Aggregate the Component 1–14 artifacts; the gate passes only when all conditions hold. **Set
      `"status": "completed"` in `.kiro/specs/beanola-production-readiness/.config.kiro` only after the
      operator completes the gated production rollout (task 6.3) and every Definition-of-Done condition
      is true** (R15.3, R15.8). Until then, leave no completed status.
    - _Requirements: 15.3, 15.8_

- [ ] 32. Final checkpoint — Definition-of-Done exit gate
  - Run the full Verification_Gate (Phase 13 checkpoint) plus
    `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/property/test_definition_of_done_gate.py -q`.
    Confirm the gate evaluates true only when every condition holds and that `.config.kiro` is not
    marked completed until the operator rollout is done. Ensure all tests pass, ask the user if
    questions arise.
  - _Requirements: 15.6, 15.8_

## Notes

- Tasks marked with `*` are optional/deferrable for a faster MVP. Core audit, cutover, security,
  document-lifecycle, gate, and per-route fix work is never optional.
- Each task references specific requirement clauses for traceability and is incremental/actionable
  coding or verification work only.
- **Properties 26–33 are this spec's new properties**; backend uses pytest+hypothesis (≥100 examples,
  `--hypothesis-seed=0`), frontend uses vitest+fast-check (`numRuns: 100, seed: 0`), each tagged
  `Feature: beanola-production-readiness, Property {n}: {text}`. Properties 13–25 are referenced from
  the remediation spec and not re-authored here.
- **Operator-gated, non-automatic steps** (production DB apply in 6.3; production deploy/restore in
  Phase 14/9.6 on prod) require explicit user confirmation and run on the EC2 box — never from this
  development environment.
- Per-phase checkpoints run the Verification_Gate subset relevant to that phase; Phase 13/15 run the
  full gate.
- Hard constraints (R16) bound every task: Neon-first never-from-dev additive SQL; backend-only
  official documents; 404 masking; mobile-first guardrails; preserved `/api/v1` contract; no
  PII/secrets/doc bodies in logs; jobs-ops out of scope.

## Task Dependency Graph

### Critical path (ASCII)

```
Phase 1  Canonical freeze (R1)
   │
   ▼
   ├──────────────┬──────────────┬──────────────┬──────────────┐
   ▼              ▼              ▼              ▼              ▼
Phase 2        Phase 4        Phase 5        Phase 6        Phase 3
Brand (R2)     API audit(R4)  Scope (R5)     Docs (R6)      Cutover (R3, Neon→gated operator apply)
   │              │              │              │              │
   └──────────────┴──────┬───────┴──────────────┘              │
                         ▼                                     │
                  Phase 7  UI/UX critique + mobile (R7)        │
                         │                                     │
                         ▼                                     ▼
                  Phase 8  E2E workflow QA on staging (R8) ◄───┘
                         │
        ┌────────────────┼────────────────┬────────────────┐
        ▼                ▼                ▼                ▼
   Phase 9 Ops(R9)  Phase 10 Sec(R10)  Phase 11 Perf(R11)  Phase 12 Data(R12)
        └────────────────┴───────┬────────┴────────────────┘
                                 ▼
                  Phase 13  Verification_Gate + Drift_Guard CI (R13)
                                 │
                                 ▼
                  Phase 14  Launch checklist + rollback posture (R14)
                                 │
                                 ▼
                  Phase 15  Definition-of-Done exit gate (R15)
```

Critical path: 1 → {2,4,5,6,3} → 7 → 8 → {9,10,11,12} → 13 → 14 → 15. The audits + cutover prep fan
out off the freeze; polish depends on the audits; E2E depends on polish + cutover; ops/sec/perf/data
harden the proven system; the CI gate aggregates the guards; launch executes the cutover smoke set;
the Definition-of-Done gate is the final all-or-nothing aggregation (reached only after the operator
rollout in 6.3).

### Waves (JSON)

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "6.1", "6.2", "8.1", "8.2", "8.3", "8.4", "11.1", "11.2", "11.3", "13.1", "13.2", "13.3"] },
    { "id": 2, "tasks": ["3.4", "4.1", "9.1", "9.2", "9.3", "9.4", "9.5", "11.4", "13.4", "13.5"] },
    { "id": 3, "tasks": ["6.3"] },
    { "id": 4, "tasks": ["6.4", "6.5"] },
    { "id": 5, "tasks": ["15.1", "15.2", "15.3", "15.4"] },
    { "id": 6, "tasks": ["17.1", "17.2", "17.3", "17.4"] },
    { "id": 7, "tasks": ["19.1", "19.2", "19.3", "21.1", "21.2", "21.3", "23.1", "23.2", "23.3", "25.1"] },
    { "id": 8, "tasks": ["27.1", "27.2"] },
    { "id": 9, "tasks": ["29.1", "29.2", "29.3"] },
    { "id": 10, "tasks": ["31.1"] },
    { "id": 11, "tasks": ["31.2"] }
  ]
}
```
