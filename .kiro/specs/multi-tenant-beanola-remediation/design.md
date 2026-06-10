# Design Document

## Overview

This is the **remediation/hardening design** for the Beanola multi-school admissions
platform. The foundation spec (`.kiro/specs/multi-tenant-beanola-admissions/`) built the
multi-tenant schema, `OfferingAssignmentService`, `AccessScopeService`,
`DocumentTemplateService`, tenant admin APIs, the backend official-document tasks, and the
program-first wizard. It left twelve concrete holes (enumerated in
`docs/multi-tenant-beanola-remediation-agent-plan.md`). This design turns each hole into a
grounded, additive, test-locked change against the **real files** in `backend/` and
`apps/admissions/`.

The design inherits the two non-negotiable invariants of the foundation design — **canonical-ID
truth** and **cross-tenant isolation** — and adds three remediation invariants:

1. **Deployability.** The multi-tenant schema must actually be applied by the Migration_Runner
   at container startup. Today the Tenant_Migration lives in `backend/scripts/migrations/`, a
   directory `apply_sql_migrations.py` deliberately excludes (`EXCLUDED_SUBDIRS`), so production
   never gets the tenant schema.
2. **Single source of official documents.** Backend `ApplicationDocument` rows
   (`system_generated=True`) with provenance and a current-version/fingerprint lifecycle are the
   *only* official PDFs. Client-side `@/lib/pdf` generators become preview/draft-only.
3. **No Beanola-platform brand fallbacks.** MIHAS/KATC are tenant data only. Generic platform
   surfaces present Beanola; unknown schools never inherit a MIHAS identity.

Every change is **additive and backward-compatible**: it preserves all `/api/v1/...` routes, the
`{"success": true, "data": ...}` envelope, the paginated `{page, pageSize, totalCount, results}`
shape, cookie auth + CSRF + JTI rotation, admissions auto-save, the Lenco mobile-money-first UX,
the immutable `Legacy_String_Fields` (`applications.institution/program/intake`), and 404
not-found masking for out-of-scope reads. **No production DB change is applied from this
environment** — all schema work is authored and validated on Neon first per
`.kiro/steering/infrastructure.md`, then copied to the self-hosted production Postgres.

### What already exists (verified against the repo)

- `apply_sql_migrations.py` — top-level-only sweep of `backend/scripts/*.sql`, with
  `EXCLUDED_SUBDIRS = {"applied", "archive", "migrations"}`, `EXCLUDED_TOP_LEVEL_FILES =
  {"00_full_schema.sql", "legacy_columns_drop_2026_08_15.sql"}`, a `*_rollback.sql` suffix filter
  in `_iter_migration_files`, an additive-only lint, and the `MIGRATION_HISTORY_NOT_EXTENDED`
  prerequisite gate (`_has_extended_migration_history`).
- `backend/scripts/migrations/0001_multi_tenant_beanola_admissions.sql` — the additive, idempotent
  Tenant_Migration (creates `canonical_programs`, `institution_assets`,
  `institution_document_templates`, `institution_required_documents`, `institution_domains`,
  `user_institution_memberships`, `access_grants`; adds nullable canonical-ID columns; backfills;
  `NOT VALID` FKs).
- `backend/scripts/2026_06_08_student_number.sql` — a top-level dated migration; lexical-orders by
  filename, the ordering reference for Approach A.
- `document_storage_views.py` — `_get_authorized_document` (scope + 404 masking),
  `DocumentExtractView` (currently ownership-only, **bypasses scope for admins**),
  `DocumentDeleteView` (soft-delete via `verification_status="deleted"`, **no system_generated
  guard**).
- `applications/tasks/pdf_generation.py` — the Official_Document_Generator (provenance metadata in
  `verification_notes.official_document`, SVG-unsupported handling, render-failure audit) — **no
  fingerprint and no current-version lifecycle yet; one-hour idempotency lives in
  `_view_helpers._enqueue_document_task`**.
- `catalog/services.py` — `OfferingAssignmentService`, `AccessScopeService`,
  `DocumentTemplateService`, `validate_template_payload` / `ALLOWED_TEMPLATE_SECTIONS` /
  `ALLOWED_TEMPLATE_TOKENS`.
- `catalog/admin_serializers.py` + `admin_views.py` — tenant admin CRUD with super-admin write
  gating, asset upload validation (`validate_asset_magic_bytes`, 2 MiB cap,
  `institution-assets/{id}/` keys), template-payload guard, routing simulator.
- `common/communication_service.py` — `CommunicationService` with hard-coded `MIHAS Admissions`
  defaults and `https://apply.mihas.edu.zm` portal URL (**not yet tenant-aware**).
- `documents/payment_helpers.py` — `_generate_reference` uses the `MIHAS-` prefix.
- `applications/_view_helpers.py` — `_resolve_institution_code` falls back to `'MIHAS'`.
- Frontend: `useDocumentGeneration.ts` and `slipService.ts` call client `@/lib/pdf` generators;
  `pdf/theme/index.ts` `getInstitution()` silently falls back to MIHAS; `index.html` is
  MIHAS-branded; `DocumentButtons.tsx` drives the client generators.

The codebase is the source of truth — every claim above was confirmed by reading the file.

## Architecture

### High-level remediation map

```mermaid
flowchart TB
    subgraph Deploy["1. Migration delivery"]
        RUN[apply_sql_migrations.py\nEXCLUDED_SUBDIRS]
        TM[backend/scripts/2026_06_08_01_\nmulti_tenant_beanola_admissions.sql]
        SN[backend/scripts/2026_06_08_02_\nstudent_number.sql]
        MG[migration drift guard tests]
    end

    subgraph Sec["2. Cross-tenant doc security"]
        EXT[DocumentExtractView\n→ _get_authorized_document]
        DEL[DocumentDeleteView\n→ system_generated guard + audit]
    end

    subgraph Docs["3. Official-document consolidation"]
        GEN[Official_Document_Generator\n+ Document_Fingerprint\n+ Current_Official_Version]
        OFFAPI[Student-safe official-document\nendpoints]
        SVC[services/officialDocuments.ts]
        UI[DocumentButtons / ApplicationSlipActions /\nDownloadReceiptButton]
    end

    subgraph Profiles["4. Tenant document profiles"]
        PROF[(institution_document_profiles\nadditive table)]
        REND[layout renderers\n(safe structured JSON)]
        SEED[seed_tenant_document_profiles\nmanagement command]
        TPLUI[admin TemplatesPanel]
    end

    subgraph Brand["5. Brand fallback removal"]
        HTML[index.html Beanola]
        PAYREF[BNL- payment prefix]
        APPNO[institution-coded app number]
        COMMS[Beanola comms defaults]
        THEME[pdf theme Beanola-generic]
        ALLOW[docs/legacy-brand-allowlist.json]
    end

    subgraph Config["6-7. Admin config + comms"]
        VAL[required-doc / access-grant /\nasset validation]
        CT[(communication_templates\n+ institution_id + version)]
    end

    subgraph Guards["11. Drift guards"]
        G1[migration guard]
        G2[brand guard]
        G3[document-flow guard]
        G4[scope guard]
    end

    RUN --> TM --> SN
    EXT --> DEL
    GEN --> OFFAPI --> SVC --> UI
    PROF --> REND
    SEED --> PROF
    OFFAPI --> GEN
    REND --> GEN
```

### Sequencing (mirrors the work order)

The plan's order is intentional and the design follows it: **migrations deployable → close
security holes → consolidate official documents → move document content to backend config →
remove brand fallbacks → tighten validation → tests + verification**. Correctness-critical and
security-critical changes land before UI polish so each later phase builds on a proven base.

### Separation of concerns (unchanged authorities)

- **`AccessScopeService`** remains the *sole* authority for scope. `DocumentExtractView` and
  `DocumentDeleteView` must funnel through `_get_authorized_document`, which already calls it. No
  view may authorize document/payment/application access on `role == "admin"` alone.
- **`OfferingAssignmentService`** remains the sole assignment authority; remediation only
  formalizes determinism, capacity policy, and the recoverable error path.
- **The backend Official_Document_Generator** becomes the sole official-PDF authority;
  `DocumentTemplateService`/profile renderers own content.
- **`CommunicationService`** becomes tenant-aware but stays the sole template-resolution authority.

## Components and Interfaces

### Component 1 — Migration delivery and ordering (R1, R2)

**Decision: Approach A (relocate the Tenant_Migration to top-level `backend/scripts/`).**

Approach B (teaching the runner to recurse into `migrations/`) is rejected: it changes a
production-bootstrap invariant that other excluded directories (`applied/`, `archive/`) rely on,
and the runner's docstring documents `migrations/` as "the legacy directory whose contents have
been moved up one level" — i.e. Approach A is the design the runner already expects.

**Exact target filename and ordering.** Relocate to a date-ordered, sequence-prefixed name so the
Tenant_Migration sorts *before* the student-number migration (which references
`applications` columns and per-institution sequences):

```text
backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql   (Tenant_Migration, moved)
backend/scripts/2026_06_08_02_student_number.sql                    (renamed from 2026_06_08_student_number.sql)
```

Lexical order (the runner sorts `_iter_migration_files` with `sorted(...)`) places `_01_` before
`_02_`, guaranteeing the tenant schema is present before the student-number migration runs.

**Duplicate-history avoidance (R1.6).** The Tenant_Migration is tracked in `migration_history` by
**filename** (`migration_name`). Applying it under two names (`0001_...` and `2026_06_08_01_...`)
on the same DB would create two history rows even though the SQL is idempotent. To prevent that:

- **Move, not copy.** `git mv` (via `smartRelocate`) the file so only the new name exists. The old
  `backend/scripts/migrations/0001_multi_tenant_beanola_admissions.sql` is deleted from the tree.
- **Reconciliation note for already-applied DBs.** The rollout runbook documents that on any DB
  where the old name was hand-applied out-of-band, the operator inserts a `migration_history` row
  for the new filename (the SQL is a no-op re-run because every statement is `IF NOT EXISTS` /
  `ON CONFLICT`), so the runner skips re-applying. This is the only safe way to rename a tracked
  migration; it is an operator step, never an automatic one.
- **`student_number` rename caveat.** Renaming `2026_06_08_student_number.sql` →
  `2026_06_08_02_student_number.sql` is only safe if it has not been recorded in any shared DB's
  `migration_history`. The rollout runbook makes the operator confirm
  `SELECT 1 FROM migration_history WHERE migration_name = '2026_06_08_student_number.sql'` returns
  zero rows before deploying the rename; otherwise the file keeps its name and a `_00_`-prefixed
  copy of the tenant migration is used so the tenant migration still sorts first without touching
  the student-number row.

**Additive/idempotent contract preserved (R1.5).** The relocated SQL is byte-identical; it remains
new-tables/nullable-columns/indexes/best-effort-backfills only, with no `DROP`/rewrite, so it
passes the runner's additive-only lint (`_find_non_additive_violations`).

**Exclusions preserved (R1.4).** No change to `EXCLUDED_SUBDIRS`, `EXCLUDED_TOP_LEVEL_FILES`, or the
`*_rollback.sql` suffix filter. `00_full_schema.sql` and rollback files stay excluded.

**Reference updates (R1.7, R19.5).** Update the path in `docs/multi-tenant-beanola-progress.md`,
`docs/multi-tenant-beanola-handover.md`, `docs/runbooks/multi-tenant-beanola-rollout.md`,
`docs/canonical-truth-map.md`, and `.kiro/specs/multi-tenant-beanola-admissions/` references from
`backend/scripts/migrations/0001_...` to `backend/scripts/2026_06_08_01_...`.

**Migration drift guards (R2)** — added to `backend/tests/unit/test_apply_sql_migrations.py`,
`backend/tests/unit/test_tenant_migration.py`, and a new
`backend/tests/unit/test_migration_drift_guard.py`:

- The Tenant_Migration appears in `apply_sql_migrations --dry-run` discovery against a configured
  DB (calls `_iter_migration_files(DEFAULT_MIGRATIONS_DIR)` and asserts the new filename is
  present).
- `00_full_schema.sql` and `*_rollback.sql` remain absent from discovery.
- **No production (non-rollback, non-archive) migration file sits inside an Excluded_Subdirectory**
  — scans `backend/scripts/migrations/`, `applied/`, `archive/` and fails if any `*.sql` there is
  not a rollback/archive artifact (catches a future tenant-style migration mis-placed in
  `migrations/`).
- **Every migration path referenced in docs/specs exists on disk** — greps docs/specs for
  `backend/scripts/.*\.sql` and asserts each resolves.
- `MIGRATION_HISTORY_NOT_EXTENDED` is emitted when the prerequisite column is absent (exercises
  `_has_extended_migration_history` returning False → `CommandError`).

### Component 2 — Cross-tenant document security (R3, R4)

**2a. `DocumentExtractView` (R3).** Replace the ownership-only block with the same
authorization seam the other document endpoints already use:

```python
# backend/apps/documents/document_storage_views.py — DocumentExtractView.post
def post(self, request, document_id):
    document, error_response = _get_authorized_document(request, self, document_id)
    if error_response is not None:
        return error_response   # 404 not-found-masked for out-of-scope admin (R3.2, R3.3)
    application = document.application
    from apps.documents.tasks import extract_document_text_task
    force = request.data.get("force", False) is True
    task = extract_document_text_task.delay(str(document.id), force=force)
    return Response(
        {"success": True, "data": {"task_id": task.id, "document_id": str(document.id), "status": "queued"}},
        status=status.HTTP_202_ACCEPTED,
    )
```

`_get_authorized_document` already: loads the document, routes `role == "admin"` through
`AccessScopeService().filter_documents(...)` and returns the **identical** `_document_not_found_response()`
(404, `code="NOT_FOUND"`) when out of scope, lets super-admins through, and enforces owner-or-admin
for students. Authorization completes **before** the task is enqueued and before any state change
(R3.1). Super-admin and owning-student enqueue exactly one task (R3.4, R3.5); a non-owning student
or out-of-scope admin gets the byte-identical 404 (R3.3, R3.6). Scope comes only from
`AccessScopeService`, never `role == "admin"` alone (R3.8). The existing
`AIUserScopedRateThrottle` (`ai_document_extract`) is retained.

**2b. `DocumentDeleteView` official-document immutability (R4).** After authorization, gate on
`system_generated` and write an audit event for privileged deletes:

```python
# DocumentDeleteView.delete, after _get_authorized_document
role = getattr(request.user, "role", "student")
if document.system_generated and role != "super_admin":
    return Response(
        {"success": False, "error": "Official generated documents cannot be deleted",
         "code": "OFFICIAL_DOCUMENT_IMMUTABLE"},
        status=status.HTTP_403_FORBIDDEN,
    )
if role not in ("admin", "super_admin"):
    # student: existing editability policy — only while application is editable (draft)
    if document.application.status != "draft":
        return Response(
            {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
            status=status.HTTP_403_FORBIDDEN,
        )
# permitted: keep existing soft-delete (verification_status="deleted"); never hard-delete
...
if role == "super_admin" and document.system_generated:
    _audit_official_document_deleted(request, document)   # actor, doc id, app id, doc type, system_generated, institution id
```

Out-of-scope school staff still receive the 404 from `_get_authorized_document` (R4.3). The
soft-delete behaviour and the `result_slip_url`/`extra_kyc_url` cleanup are unchanged for permitted
deletions (R4.5). The audit payload excludes the document body, PII, and secrets (R4.6,
R16.4) — it carries only IDs, the document type, the `system_generated` flag, and the institution
ID, routed through the existing `AuditLog`/`TenantAuditService` mechanism.

### Component 3 — Official-document consolidation (R5, R6, R7)

**3a. Student-safe official-document endpoints (R5).** Add resource-style routes under the existing
application namespace (admin-only generation endpoints stay):

```text
POST /api/v1/applications/{id}/official-documents/{document_type}/   # generate/ensure current
GET  /api/v1/applications/{id}/official-documents/                   # list latest per type
GET  /api/v1/applications/{id}/official-documents/{document_type}/   # status + download_url
```

Implemented in a new `backend/apps/applications/official_document_views.py`. Each view authorizes
through the shared scope path: students via owner check; school staff via
`AccessScopeService().filter_applications(...)` with **404 not-found masking** when out of scope
(R5.6, R5.8); super-admins global (R5.7). Status gates (R5.2–R5.5):

| document_type | Allowed when |
|---------------|--------------|
| `application_slip` | application in a non-draft submitted state |
| `acceptance_letter` | application `approved` |
| `conditional_offer` | application `conditionally_approved` |
| `payment_receipt` | a completed payment exists (`status ∈ RECEIPT_ELIGIBLE_STATUSES`) |

Response envelope (R5.1, R5.9):

```json
{"success": true, "data": {
  "document_id": "…", "document_type": "application_slip",
  "status": "ready|queued|failed", "download_url": "…optional…",
  "generated_at": "…", "template_version": 3, "institution_id": "…"}}
```

Async path returns `status="queued"` with a `task_id`/`document_id` poll reference.

**3b. Document_Fingerprint + Current_Official_Version lifecycle (R6).** Implemented inside
`pdf_generation._generate_official_document_task`. **Decision: no-schema-change V1** (the plan's
Option 2), with an optional `is_current` column documented as a later path.

- **Current_Official_Version** = the latest `system_generated=True`, **non-deleted**
  (`verification_status != "deleted"`) `ApplicationDocument` for `(application, document_type)`,
  ordered by `uploaded_at` desc (R6.7).
- **Document_Fingerprint** = a deterministic SHA-256 over a canonical-JSON tuple of: application ID,
  document type, application `status` + `updated_at`, institution ID, template/profile ID + version,
  logo asset ID + checksum, signature asset ID + checksum, and (receipts only) payment ID + receipt
  number (R6.1). Computed in a new pure helper `_compute_document_fingerprint(application,
  document_type, tenant, template, logo_asset, signature_asset, payment)` so it is unit/property
  testable in isolation.
- **Reuse vs regenerate:** before rendering, compute the fingerprint and compare to the current
  version's stored `verification_notes.official_document.fingerprint`. Equal → return the existing
  document, create no new row (R6.2). Absent or different → render a new Official_Document and store
  the fingerprint in `verification_notes.official_document` (R6.3). Because template/profile version
  and asset ID+checksum are fingerprint inputs, a template/profile version bump (R6.5) or a
  logo/signature change (R6.6) changes the fingerprint and forces a new document on the next
  request.
- **Supersede, never mutate:** a new version becomes the Current_Official_Version by virtue of the
  latest-non-deleted ordering; prior documents are never altered or regenerated (R6.4, R8.5,
  R16.2). This replaces the one-hour wall-clock idempotency window in
  `_view_helpers._enqueue_document_task` with input-driven idempotency.
- **Optional `is_current` column (documented, deferred):** a later additive migration may add
  `ApplicationDocument.is_current boolean default true` plus a partial unique index
  `(application_id, document_type) WHERE system_generated AND is_current`; the generator would flip
  the prior current row to `is_current=false`. V1 derives "current" by query to minimize schema
  churn; the column is the drift-resistant upgrade once proven on Neon.

**3c. Frontend official-document service + components (R7).** Add
`apps/admissions/src/services/officialDocuments.ts`:

```ts
generateOfficialDocument(applicationId, documentType): Promise<OfficialDocumentStatus>
listOfficialDocuments(applicationId): Promise<OfficialDocumentStatus[]>
getOfficialDocument(applicationId, documentType): Promise<OfficialDocumentStatus>
downloadOfficialDocument(documentId): Promise<void>          // via authorized signed-url/download endpoint
emailOfficialDocument(applicationId, documentType, email): Promise<void>
```

Rewire `DocumentButtons.tsx`, `ApplicationSlipActions.tsx`, and `DownloadReceiptButton.tsx` to call
this service instead of `useDocumentGeneration`/`slipService`/`@/lib/pdf` (R7.1, R7.3). The "email
slip" path emails the backend-stored document, not a local blob (R7.4). UI surfaces `Queued`,
`Generating`, `Ready`, `Failed` states reflecting backend status (R7.2), and respects the R5 status
+ payment gates (R7.5). `useDocumentGeneration`/`@/lib/pdf` remain in the tree for dev/draft preview
only and must be unreachable from official-download paths (R7.6); the document-flow drift guard
(Component 8) enforces this. UI uses canonical primitives, Lucide icons, WCAG AA, ≥44px targets, no
purple gradients/gradient text/glassmorphism/nested cards/emoji (R7.7).

### Component 4 — Tenant document profiles (R8)

**Decision: new additive `institution_document_profiles` table** (the plan's richer option) rather
than overloading `institution_document_templates`. The existing template table supports only `body`
+ `signatory` sections (`ALLOWED_TEMPLATE_SECTIONS`); acceptance letters need fee charts, bank
accounts, requirements, and a signatory block. A dedicated table keeps the simple template path
intact and avoids widening the hot `idx_institution_templates_lookup`.

Additive Neon-first SQL (new top-level migration
`backend/scripts/2026_06_08_03_institution_document_profiles.sql`):

```sql
CREATE TABLE IF NOT EXISTS institution_document_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    document_type varchar(60) NOT NULL,
    program_id uuid NULL,                  -- offering scope
    canonical_program_id uuid NULL,
    intake_id uuid NULL,
    layout_key varchar(80) NOT NULL DEFAULT 'simple_letter',
    sections jsonb NOT NULL DEFAULT '{}'::jsonb,     -- ≤30 keys, each value ≤5000 chars
    fee_chart jsonb NOT NULL DEFAULT '[]'::jsonb,    -- ≤50 rows
    bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,-- ≤10
    requirements jsonb NOT NULL DEFAULT '[]'::jsonb, -- ≤50
    signatory jsonb NOT NULL DEFAULT '{}'::jsonb,
    rules jsonb NULL,
    version integer NOT NULL DEFAULT 1,    -- monotonic ≥1 per (institution, document_type, scope)
    is_active boolean NOT NULL DEFAULT true,
    created_by_id uuid NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_profiles_lookup
    ON institution_document_profiles (institution_id, document_type, is_active, version);
CREATE INDEX IF NOT EXISTS idx_doc_profiles_scope
    ON institution_document_profiles (institution_id, document_type, program_id, canonical_program_id, intake_id, is_active);
-- NOT VALID FKs to institutions/programs/canonical_programs/intakes, validated post-backfill.
```

**Deterministic resolution (R8.2):** most-specific match wins — offering+intake → offering →
canonical-program+intake → canonical program → institution default — implemented in a new
`InstitutionDocumentProfileService.resolve(application, document_type)` that mirrors the
specificity ordering already used by `OfferingAssignmentService.required_documents`.

**Safe_Template_Policy (R8.6, R8.7, R8.10).** Reuse and extend the existing
`validate_template_payload` machinery in `catalog/services.py`:
structured-JSON only, allowlisted tokens, `html.escape` at render time, the `_contains_merge_document`
/ `_MERGE_FIELD_MARKERS` / `_MERGE_DOCUMENT_SIGNATURES` rejection of DOCX/PDF/RTF/OLE/WordprocessingML
content, and the per-section size cap. A new `validate_profile_payload` adds the structural caps
(≤30 sections × ≤5000 chars, ≤50 fee rows, ≤10 banks, ≤50 requirements) and validates fee-chart /
bank-account row shapes. Save is rejected with a descriptive error naming the offending
section/token (mapped to the existing `TEMPLATE_TOKEN_REJECTED` 400 code) and the version is not
persisted (R8.10). Uploaded DOCX/PDF originals are retained only as admin-reference attachments,
never executed or merged (R8.7).

**Backend renderer structure (R8.3, R8.9).** Replace the generic `_default_body` path in
`pdf_generation.py` with layout-specific renderers. New package:

```text
backend/apps/applications/tasks/pdf/
  render_context.py            # builds tenant + profile + assets + payment context
  renderers/application_slip.py
  renderers/acceptance_letter.py   # letterhead, date/address, ref line, body,
                                   # commitment-fee block, bank-account block, fee chart,
                                   # requirements list, notes, signatory/signature
  renderers/conditional_offer.py
  renderers/payment_receipt.py
  layouts/simple_letter.py
  layouts/fee_chart_letter.py
```

The acceptance-letter renderer builds content **solely** from the resolved
Institution_Document_Profile + tenant assets and never reads frontend constants. If no active
profile resolves for the institution + document type, the generator sets status `failed`, records an
error "no document profile configured for {institution} / {document_type}", and produces no
document from frontend content (R8.9).

**Seed migration (R8.4).** A new management command
`backend/apps/catalog/management/commands/seed_tenant_document_profiles.py` (and a dev seed entry in
`backend/scripts/seed_tenant_dev_data.py`) creates the MIHAS RN, KATC COG, and KATC EHT acceptance
profiles as tenant data, transcribed from the existing frontend
`acceptanceLetterProfiles.ts`/`intakeSchedule.ts` (banking, fee charts, requirements). The data
lives as configurable tenant rows, not in tests or frontend code.

**Versioning (R8.5).** Creating a new profile version inserts a new row with `version+1`; prior
versions are retained as readable records and never alter documents already generated from earlier
versions (fingerprint provenance preserves the version that produced each PDF).

**Admin template UI (R8.8).** Extend `apps/admissions/src/pages/admin/tenants/TemplatesPanel.tsx`
and `apps/admissions/src/services/admin/tenants.ts` to choose document type + optional
applies-to offering/canonical-program/intake, choose a layout, edit structured sections, fee-chart
rows, bank accounts, requirements, and signatory text, preview with sample data, clone the latest
version, and activate/deactivate versions — using canonical primitives and the R7.7/R17.7 UI
guardrails.

### Component 5 — Brand fallback removal (R9)

| Surface | File | Change |
|---------|------|--------|
| Public metadata + preloader (R9.1) | `apps/admissions/index.html` | Beanola title/description/OG site name; preloader brand "Beanola Admissions" + Beanola logo; replace hard-coded `api.mihas.edu.zm` preconnect with an env-driven host or remove. School branding stays React-runtime. |
| Payment reference (R9.2) | `backend/apps/documents/payment_helpers.py` `_generate_reference` | `MIHAS-{app}-{ts}` → `BNL-{app}-{ts}`. Confirm no Lenco reconciliation depends on `MIHAS-`; update payment tests. |
| Application number (R9.3, R9.4, R15.8) | `backend/apps/applications/_view_helpers.py` `_resolve_institution_code` | Use the assigned institution's code; for genuinely missing institution use a platform `BNL` code or raise a config error — never default to `MIHAS`. Keep `MIHAS` only behind a clearly named, tested legacy path. |
| Communication defaults (R9.5) | `backend/apps/common/communication_service.py` | `_DEFAULT_SUBJECT`/`_DEFAULT_BODY`/`_DEFAULT_NOTIFICATION_TEXT` and `_build_context` `portal_url` → Beanola/tenant values; drop `https://apply.mihas.edu.zm` (also R14). |
| Email components (R9.6) | `backend/apps/common/email/components.py` | `signature_block` default → "Beanola Admissions Office" or require explicit signatory context; remove "MIHAS/KATC are universal" assumptions. |
| Tracker examples (R9.6) | `apps/admissions/src/pages/public/tracker/...` | Neutral Beanola/tenant-derived examples. |
| PDF theme (R9.7) | `apps/admissions/src/lib/pdf/theme/index.ts` `getInstitution` | For an unknown institution return a Beanola-generic preview profile or raise for official documents — never silently render MIHAS. |
| ApplicationDetail mapping (R9.8) | `apps/admissions/src/pages/student/ApplicationDetail.tsx` | Display `institution_name ?? institution ?? "Not provided"`; remove the hard-coded MIHAS/KATC display map. |
| App-number validation (R9.9) | application-number validators (frontend + backend) | Do not restrict valid prefixes to only `MIHAS`/`KATC`; accept any institution code. |

**Brand_Allowlist + drift guard (R10).** Add `docs/legacy-brand-allowlist.json` enumerating the
small reviewed set of files permitted to contain `MIHAS`/`KATC`/`Mukuba`/`Kalulushi`/
`apply.mihas.edu.zm` (tenant seed fixtures, tests that create MIHAS/KATC institutions, historical
docs/sample references, tenant logo assets). Add a guard
(`backend/tests/unit/test_brand_drift_guard.py` for `backend/apps`; `apps/admissions/tests/unit/brandDriftGuard.test.ts`
for `apps/admissions/src` + `index.html`) that greps those strings and fails — reporting offending
file + line — for any hit not in the allowlist (R10.1, R10.3), while allowing allowlisted files
(R10.4).

### Component 6 — Admin config validation (R11, R12, R13)

**Required-document validation (R11)** — strengthen `AdminRequiredDocumentSerializer.validate`:
institution exists + active; if `program_id` supplied, program exists + active + belongs to the
institution; if `canonical_program_id` supplied, canonical exists + active; if both supplied,
`program.canonical_program_id` matches; reject a duplicate active row for the same
`(institution, document_type, program_id, canonical_program_id)` scope; descriptive error and no
row on failure.

**Access-grant validation (R12)** — strengthen `AdminAccessGrantSerializer.validate` to cover the
full matrix: `institution` scope requires an existing active institution; `program_offering`
requires an active program owned by a non-global institution (and matches a supplied
`institution_id`); `application` requires an existing application (and matches supplied
institution/program); `expires_at` must be strictly future UTC; permission values must be in the
Access_Grant allowlist; reject duplicate active `(user, scope_type, target id)` except self-update;
reject missing/invalid `scope_type`; descriptive field-level error and no mutation on failure.

**Manual asset registration + SVG safety (R13).** Disable the generic
`storage_key`/`public_url`/`mime_type`/`checksum`-accepting create path
(`AdminTenantAssetListCreateView`/`AdminInstitutionAssetSerializer`) for non-super-admins; where it
remains (super-admin only) require `storage_key` under `institution-assets/{institution_id}/` and
validate the stored object's bytes + checksum rather than trusting the caller. The multipart
`AdminTenantAssetUploadView` stays primary (MIME + magic bytes + SHA-256 + 2 MiB cap, already
implemented). Admin UI warns that SVG won't render in backend PDFs and prompts for a raster version
(R13.4); the backend renderer already records an `unsupported` render status for SVG and never
executes it (R13.5, confirmed in `_draw_asset`).

### Component 7 — Tenant-aware communication templates (R14)

Additive Neon-first SQL (new top-level migration
`backend/scripts/2026_06_08_04_communication_templates_tenant.sql`):

```sql
ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS institution_id uuid NULL;
ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant_lookup
    ON communication_templates (institution_id, template_key, is_active, version);
-- NOT VALID FK communication_templates.institution_id → institutions(id).
```

**Resolution order (R14.1, R14.4, R14.5).** `CommunicationService.render_template`/`send` resolve in
priority: active institution-specific template (highest version) for `(institution, key)` → active
Beanola platform template (highest version, `institution_id IS NULL`) for `key` → safe Beanola
default. The application's institution is derived from `application.institution_ref_id`.

**Context derivation (R14.3, R14.8).** `_build_context` derives brand name, contact email, and
portal URL from the resolved institution's settings; when a setting is missing it substitutes the
Beanola platform default and never emits `https://apply.mihas.edu.zm`. The safe Beanola default
contains only Beanola brand/contact/portal and no school-specific content (R14.5, R14.7).

**School-staff template management scope (R14.6, R14.9).** The template management surface exposes
and accepts changes only for institutions the acting School_Staff member is assigned to (via
`AccessScopeService`); an out-of-scope view/modify is rejected with an authorization error and no
mutation.

### Component 8 — Program-first assignment edge cases (R15) and drift guards (R18)

**Assignment (R15)** — formalize the already-present `OfferingAssignmentService` behaviour:

- **Determinism (R15.1):** sort by `program_intake.assignment_priority`, then
  `offering.assignment_priority` (lower wins), then stable tie-break on offering `code`/`id` — the
  exact key already in `assign()`.
- **White-label restriction (R15.2):** `institution_id` filter restricts candidates.
- **Capacity policy decision (R15.4):** **capacity is advisory until enrollment.** Application
  creation does **not** reserve a seat; `_has_capacity` excludes a candidate whose
  `current_enrollment >= capacity` at assignment time (R15.3), and enrollment confirmation
  (`EnrollmentService`) is the point where a seat is committed under the existing
  `select_for_update()` lock. This is documented in `docs/canonical-truth-map.md`. (The
  reserve-at-create alternative is rejected for V1 because it would require holding a lock across
  the multi-step wizard and would strand seats on abandoned drafts.)
- **Recoverable `NO_ELIGIBLE_OFFERING` (R15.5):** `OfferingAssignmentError(code="NO_ELIGIBLE_OFFERING")`
  surfaces as a 409 recoverable envelope with user-facing guidance.
- **Assigned required documents (R15.6):** `AssignmentResult.required_documents` already exposes the
  resolved offering/canonical/default requirements; missing required docs block submission per the
  assigned config.
- **Legacy-path metric (R15.7):** the string-create path emits a `legacy_string_create` warning/
  metric (via `emit_metric`) while still functioning for backward compatibility.
- **Institution-coded application number (R15.8):** see Component 5 (R9.3).

**Drift guards (R18)** — four guards wired into the standard test command (R18.5):

1. **Document-flow guard (R18.1):** fails if a non-test student-facing module imports the `@/lib/pdf`
   barrel or calls `generateApplicationSlip`/`generateAcceptanceLetter`/`generatePaymentReceipt` for
   official downloads; reports offending module + symbol
   (`apps/admissions/tests/unit/documentFlowDriftGuard.test.ts`).
2. **Fingerprint-dedup guard (R18.2):** fails if the official-document endpoint produces more than
   one persisted record for an unchanged fingerprint (`backend/tests/unit/test_official_document_dedup_guard.py`).
3. **Scope-authorization guard (R18.3):** fails if any non-super-admin code path authorizes
   application/payment/document access on an admin role check alone without `AccessScopeService`;
   reports the offending path (`backend/tests/unit/test_scope_drift_guard.py`).
4. **Unscoped-endpoint guard (R18.4):** fails if a document-serving endpoint returns
   application/payment/document records not constrained by `AccessScopeService` scope.

### Component 9 — Provenance + audit (R16)

The generator already writes a provenance metadata block into
`verification_notes.official_document`. Extend it to the full R16.1 snapshot: document type,
institution ID + name, canonical program ID, program offering ID, intake ID, application ID, student
number (where applicable), template/profile ID + version, logo/signature/seal asset IDs + checksums,
payment ID + receipt number (receipts), per-asset render status (already present as
`logo_render`/`signature_render`), generated-by user ID + role (where human-triggered), generated-at
timestamp, and the Document_Fingerprint. The snapshot is immutable once written and survives
institution renames (R16.2). Audit_Events are written for queued, generated,
generation-failed-permanently (already `official_document_render_failed`), downloaded (admin or
student), emailed, and template/profile + asset create/update/activate/deactivate lifecycle actions
(R16.3) via `TenantAuditService`. Audit payloads exclude document body bytes, applicant PII (NRC/
passport, full DOB, phone, email, address), credentials, API keys, signing secrets, and bank account
numbers (R16.4, R20.6). A render failure leaves any prior Official_Document unchanged, records a
failing-stage audit, and returns a retry-able error (R16.5); permanent failure is declared after 3
attempts or >300s queued (R16.6) — the task's `max_retries=3` already bounds attempts.

### Component 10 — Document UI states (R17)

Student and admin document UIs reflect backend truth: only status/payment-allowed actions are
shown (R17.1); `Queued`/`Generating`/`Ready`/`Failed` states with download + email of stored
official documents (R17.2); MIHAS/KATC shown only when the assigned school is actually MIHAS/KATC,
never as a platform default (R17.3); admin generation queues the backend document then shows status
and lists latest official documents per application (R17.4); admin tenant views are scoped (school
staff in-scope only; super-admin global) (R17.5); production student components never use client PDF
generators for official documents (R17.6); all UI honors canonical primitives, Lucide, WCAG AA,
≥44px, no purple gradients/gradient text/glassmorphism/nested cards/emoji (R17.7).

### Component 11 — Documentation + rollout honesty (R19)

Update `docs/multi-tenant-beanola-progress.md`, `docs/multi-tenant-beanola-handover.md`, and
`docs/runbooks/multi-tenant-beanola-rollout.md` to separate "code complete" / "staging validated" /
"production applied", use real non-future-dated timestamps (handoff date 2026-06-09), point every
migration path at the Deployable_Migration_Path, reflect the Neon-first-then-production workflow
(never apply production DB changes from this environment), and enumerate the operator rollout steps
(backup → verify prerequisite → dry-run + confirm Tenant_Migration appears → apply in a maintenance
window → post-migration validation SQL → validate MIHAS/KATC sample document generation → onboard a
test school on staging → validate school-staff scope → validate the program-first flow → validate
payment settlement metadata → monitor audit/errors → app-code rollback plan).

## Data Models

All schema changes are **additive** (new tables, nullable columns, indexes, `NOT VALID` FKs),
authored and validated on Neon first, then copied to production. No column is dropped, rewritten, or
repurposed; the `Legacy_String_Fields` are untouched.

| Table | Change | Migration file |
|-------|--------|----------------|
| (relocate) Tenant_Migration | move `0001_...` → top-level | `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql` |
| (rename) student number | `2026_06_08_student_number.sql` → `_02_` (conditional) | `backend/scripts/2026_06_08_02_student_number.sql` |
| `institution_document_profiles` | **new** rich tenant document content | `backend/scripts/2026_06_08_03_institution_document_profiles.sql` |
| `communication_templates` | **+`institution_id uuid NULL`, `+version integer NOT NULL DEFAULT 1`, +index** | `backend/scripts/2026_06_08_04_communication_templates_tenant.sql` |
| `application_documents` | (optional, deferred) `+is_current boolean` + partial unique index | future, documented only |

`verification_notes.official_document` (JSON on the existing `ApplicationDocument.verification_notes`
text column) gains the full provenance snapshot + `fingerprint` — no schema change. The current
`is_current` derivation is by query (latest non-deleted `system_generated` by `uploaded_at`); the
column is the documented later upgrade.

All affected models (`programs`, `institutions`, `applications`, `communication_templates`) are
`managed = False`; schema ships as SQL scripts under `backend/scripts/`, applied by
`apply_sql_migrations`, never as Django migrations.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a
system — essentially, a formal statement about what the system should do. Properties serve as the
bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The numbering **continues from the foundation spec design**
(`.kiro/specs/multi-tenant-beanola-admissions/design.md`, whose last numbered property was the
twelfth). The remediation adds the thirteenth through twenty-fifth properties below. Where a
remediation criterion is already covered by a foundation property (eligibility, asset magic-byte
validation, host resolution, settlement), it is not restated.

Each property below was derived from the prework analysis. Redundant criteria were folded: the
isolation/masking criteria collapse into one masking property, the fingerprint-lifecycle criteria
into the determinism and single-current-version properties, the template/profile safety criteria
into one content-safety property, and the audit PII-exclusion criteria into one provenance property.

### Property 13: Out-of-scope document access is indistinguishable from not-found

*For any* document and *any* non-super-admin actor (student or school staff) whose scope does not
include that document, the OCR-extract, official-document, and delete surfaces return a response
byte-identical (HTTP status, error code, and message) to the response returned when the document
genuinely does not exist, and no OCR task is enqueued and no document state is mutated.

**Validates: Requirements 3.3, 3.6, 4.3, 5.6, 5.8**

### Property 14: OCR extraction authorizes before any side effect

*For any* extract request, when authorization fails the view returns the authorization error
unchanged and enqueues no OCR task and mutates no document state; when authorization succeeds for an
owning student or super-admin, exactly one OCR task is enqueued.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.7**

### Property 15: Official documents are deletion-protected from non-super-admins

*For any* document with `system_generated=True` and *any* non-super-admin actor, the delete request
is rejected with HTTP 403 and code `OFFICIAL_DOCUMENT_IMMUTABLE`, the document is not soft-deleted,
and the row is not hard-deleted; a permitted delete only ever sets `verification_status="deleted"`.

**Validates: Requirements 4.1, 4.5**

### Property 16: Document_Fingerprint is a deterministic, input-sensitive function

*For any* two generation inputs, the computed Document_Fingerprint is equal if and only if all
fingerprint inputs (application ID, document type, application status/updated_at, institution ID,
template/profile ID+version, logo/signature asset ID+checksum, and payment/receipt identifiers for
receipts) are equal; changing any one input changes the fingerprint.

**Validates: Requirements 6.1, 6.5, 6.6**

### Property 17: Repeated generation reuses the single current version

*For any* `(application, document_type)`, generating repeatedly with unchanged fingerprint inputs
yields exactly one non-deleted `system_generated` Official_Document (the existing one is returned, no
new row is created); when an input changes, a new Official_Document is created, exactly one
Current_Official_Version exists, prior documents are left unchanged, and documents with
`verification_status="deleted"` are never selected as current.

**Validates: Requirements 6.2, 6.3, 6.4, 6.7, 8.5, 16.2, 18.2**

### Property 18: Student official-document status gating

*For any* application status, document type, and payment state, a student is permitted to
generate/download the Official_Document if and only if the type's gate holds: application_slip → a
non-draft submitted status, acceptance_letter → `approved`, conditional_offer →
`conditionally_approved`, payment_receipt → a completed payment exists for the application.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.5**

### Property 19: Document profile/template content is safe

*For any* submitted profile/template content, only tokens in the allowlisted token set are
substituted (unknown/injected tokens render inert), every substituted token value is HTML-escaped,
and any payload containing a disallowed section, an out-of-allowlist token, or arbitrary
DOCX/PDF/RTF/OLE/WordprocessingML merge-document content is rejected with a descriptive error
naming the offending section/token and is not persisted.

**Validates: Requirements 8.6, 8.7, 8.10**

### Property 20: Document profile resolution is deterministic and most-specific

*For any* application + document type and *any* set of active Institution_Document_Profiles, the
resolver returns the single most-specific match in the fixed order offering+intake → offering →
canonical-program+intake → canonical program → institution default, deterministically for identical
inputs.

**Validates: Requirements 8.2**

### Property 21: Required-document and access-grant validation correctness

*For any* required-document or access-grant create/update payload, the serializer accepts the
payload if and only if all canonical-relationship and target rules hold (required-document:
institution active, program active and owned by the institution, canonical active, program↔canonical
match, no duplicate active scope; access-grant: scope_type valid, target exists/active/in-institution
per scope, `expires_at` strictly future UTC, permission in the allowlist, no duplicate active
`(user, scope_type, target id)` except self-update), and on rejection it returns a field-level error
and creates or modifies no row.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8**

### Property 22: Communication template resolution and brand-safe context

*For any* application institution, template key, and set of active templates, resolution returns the
active institution-specific template with the highest version, else the active Beanola platform
template with the highest version, else the safe Beanola default; and for *any* resolved institution
(including unknown/future schools and institutions with missing brand/contact/portal settings) the
built context is complete and contains neither the MIHAS brand name/contact nor
`https://apply.mihas.edu.zm`.

**Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.7, 14.8**

### Property 23: Audit and provenance exclude PII, secrets, and document bodies

*For any* Official_Document generation or deletion and *any* tenant config/asset lifecycle action,
the generated Official_Document carries a complete provenance snapshot in
`verification_notes.official_document` (all enumerated fields), and every Audit_Event payload
contains no rendered document bytes, no applicant PII (NRC/passport, full date of birth, phone,
email, physical address), no credentials/API keys/signing secrets, and no bank account numbers.

**Validates: Requirements 4.6, 16.1, 16.4, 20.6**

### Property 24: Assignment determinism and institution-coded application numbers

*For any* candidate offering set, the same `(canonical program, intake, residency, white-label)`
inputs always select the same single offering by program-intake priority, then offering priority
(lower wins), then a stable tie-break on offering code/id; and *for any* assigned institution, the
generated application number begins with that institution's code and never defaults to `MIHAS` for
an unknown assigned institution (an unavailable code yields a platform `BNL` code or a configuration
error).

**Validates: Requirements 15.1, 15.8, 9.3, 9.4**

### Property 25: Legacy null-canonical-ID applications remain readable

*For any* application with one or more null canonical IDs (`institution_id`, `program_id`,
`program_offering_id`, `intake_id`), the read paths return that application using its
`Legacy_String_Fields` values without returning an error response.

**Validates: Requirements 20.3**

## Error Handling

The remediation reuses the foundation's stable error codes and adds those listed below; every
endpoint keeps the `{"success": boolean, "data": ..., "error": ..., "code": ...}` envelope.

| Code | HTTP | Meaning |
|------|------|---------|
| `NOT_FOUND` (masking) | 404 | Out-of-scope read by non-super-admin — byte-identical to genuine not-found (R3.3, R4.3, R5.6, R5.8) |
| `OFFICIAL_DOCUMENT_IMMUTABLE` | 403 | Non-super-admin attempted to delete a `system_generated` document (R4.1) |
| `APPLICATION_NOT_EDITABLE` | 403 | Student delete/upload on a non-editable (non-draft) application (R4.2) |
| `TEMPLATE_TOKEN_REJECTED` | 400 | Disallowed section/token or merge-document content in a profile/template (R8.6, R8.10) — existing code reused |
| `ASSET_INVALID` | 400 | Asset MIME/magic-byte/size/checksum validation failure (R13) — existing code reused |
| `NO_ELIGIBLE_OFFERING` | 409 | No active offering for the canonical program + intake + residency; recoverable with guidance (R15.5) — existing code reused |
| `DOCUMENT_PROFILE_NOT_CONFIGURED` | 422 / status `failed` | No active profile resolved for the institution + document type; generation status set to `failed`, no frontend-content document produced (R8.9) |

**Graceful degradation (platform hard constraint).** Render failures leave any prior
Official_Document unchanged, record a failing-stage Audit_Event, and return a retry-able error
(R16.5). Permanent failure is declared after 3 attempts or >300s queued (R16.6), bounded by the
task's `max_retries=3`. Assignment failures, missing profiles, and provider issues degrade to
recoverable states, never dead-ends.

## Security Considerations

- **Tenant isolation is the central security property.** Every document/payment/application surface
  authorizes through `AccessScopeService` (never `role == "admin"` alone); out-of-scope reads are
  masked as 404 to close the existence-inference channel (Property 13). The scope and unscoped-
  endpoint drift guards (R18.3, R18.4) fail the build if a future change reintroduces role-only
  authorization.
- **Official-document integrity.** Backend `system_generated` documents are deletion-protected from
  non-super-admins; privileged deletes are audited (Property 15, Property 23). Clients can no longer
  mint "official" PDFs — the document-flow drift guard (R18.1) enforces this.
- **No untrusted document execution.** The Safe_Template_Policy rejects DOCX/PDF/RTF/OLE/
  WordprocessingML merge content and field codes, allowlists tokens, and HTML-escapes every
  substituted value (Property 19). SVG assets are recorded as `unsupported` and never rasterized or
  parsed (R13.5).
- **Asset registration lockdown.** The caller-supplied-metadata asset path is super-admin-only,
  `storage_key` is constrained to `institution-assets/{institution_id}/`, and stored bytes +
  checksum are validated rather than trusting the caller (R13.1, R13.2). Multipart upload validates
  MIME + magic bytes + SHA-256 with a 2 MiB cap.
- **PII/secret hygiene.** Audit payloads and logs exclude rendered document bytes, applicant PII,
  credentials, signing secrets, and bank account numbers (Property 23). Lenco responses persisted in
  payment metadata are already PII-sanitized (`_sanitize_lenco_response`); raw phone numbers are
  never persisted.
- **No production DB writes from this environment.** All schema changes are authored/validated on a
  Neon branch first, then copied to the self-hosted production Postgres per the infrastructure
  steering; the rollout runbook is the only path to production application.
- **Auth/CSRF/JTI preserved.** Cookie auth, CSRF on state-changing requests, 30-min access / 7-day
  refresh tokens, and JTI blacklisting are unchanged (R20.4). New endpoints are authenticated and
  CSRF-protected like their peers.
- **Brand-fallback removal is a trust-boundary fix:** unknown/future schools never inherit a MIHAS
  identity in metadata, payment references, application numbers, communications, or PDFs; the brand
  drift guard (R10) prevents reintroduction.

## Testing Strategy

### Dual approach

- **Unit / example tests** cover specific scenarios, edge cases, and error conditions (migration
  discovery, status gates, envelope shapes, validation rejections, brand-string edits, drift
  guards).
- **Property-based tests** cover the universal invariants in Properties 13–25, each running **≥100
  iterations** with a pinned deterministic seed.
- **Integration tests** (1–3 examples) cover behaviour that does not vary meaningfully with input or
  hits external systems: Neon-branch migration idempotence (apply twice, second run no-op),
  CloudWatch/storage wiring, and end-to-end document generation.

### PBT applicability

PBT applies to the pure/logic layers here — fingerprint computation, profile resolution,
validation serializers, scope masking, template safety, communication resolution, assignment
ordering — all of which have meaningful input variation. PBT does **not** apply to the additive SQL
migrations (verified by snapshot/lint + Neon-branch idempotence), the index.html/brand string edits
(example assertions + the brand drift guard), or the UI visual guardrails (the Impeccable CLI +
example tests). The migration drift guards and document-flow/scope drift guards are deterministic
guard tests, not property tests.

### Property-to-test map

Backend property tests use `pytest` + `hypothesis` (≥100 examples, `--hypothesis-seed=0`); frontend
property tests use `vitest` + `fast-check` (`fc.assert(prop, { numRuns: 100, seed: 0 })`). Each test
is tagged with a comment **`Feature: multi-tenant-beanola-remediation, Property {n}: {text}`** and
implements exactly one property.

| # | Property | Test file |
|---|----------|-----------|
| 13 | Out-of-scope == not-found (extract/official-doc/delete) | `backend/tests/property/test_remediation_isolation_properties.py` |
| 14 | OCR authorize-before-side-effect | `backend/tests/unit/test_document_extract_scope.py` (+ property in isolation file) |
| 15 | Official-document deletion protection | `backend/tests/property/test_official_document_deletion_properties.py` |
| 16 | Fingerprint determinism + input-sensitivity | `backend/tests/property/test_document_fingerprint_properties.py` |
| 17 | Single current version / reuse-on-unchanged | `backend/tests/property/test_official_document_lifecycle_properties.py` |
| 18 | Student status gating | `backend/tests/property/test_official_document_gating_properties.py` |
| 19 | Profile/template content safety | `backend/tests/property/test_template_safety.py` (extends existing) |
| 20 | Profile resolution determinism | `backend/tests/property/test_document_profile_resolution_properties.py` |
| 21 | Required-doc + access-grant validation | `backend/tests/property/test_admin_validation_properties.py` |
| 22 | Communication resolution + brand-safe context | `backend/tests/property/test_communication_template_properties.py` |
| 23 | Audit/provenance PII-exclusion | `backend/tests/property/test_official_document_provenance_properties.py` |
| 24 | Assignment determinism + institution-coded app numbers | `backend/tests/property/test_assignment_properties.py` (extends existing) |
| 25 | Legacy null-canonical-ID readability | `backend/tests/property/test_backward_compat_properties.py` |
| 18 (fe) | Frontend gating mirror | `apps/admissions/tests/property/officialDocumentGating.property.test.ts` |

### Drift guards (example/guard tests, wired into the standard command — R18.5)

| Guard | Test file | Fails when |
|-------|-----------|------------|
| Migration mis-placement | `backend/tests/unit/test_migration_drift_guard.py` | a production migration sits in an Excluded_Subdirectory, or a doc-referenced path is missing |
| Tenant-migration discovery | `backend/tests/unit/test_apply_sql_migrations.py` | the Tenant_Migration is absent from dry-run discovery, or `00_full_schema`/`*_rollback` appear |
| Brand drift | `backend/tests/unit/test_brand_drift_guard.py`, `apps/admissions/tests/unit/brandDriftGuard.test.ts` | a banned brand string appears in a non-allowlisted file |
| Document-flow | `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` | a student-facing module imports `@/lib/pdf`/client generators for official downloads |
| Fingerprint-dedup | `backend/tests/unit/test_official_document_dedup_guard.py` | an unchanged fingerprint produces >1 persisted record |
| Scope authorization | `backend/tests/unit/test_scope_drift_guard.py` | a non-super-admin path authorizes on admin role alone without `AccessScopeService` |
| Unscoped endpoint | `backend/tests/unit/test_unscoped_endpoint_guard.py` | a document-serving endpoint returns records not constrained by scope |

### Example / integration / regression tests

- **Migration:** discovery/order/exclusion (`test_apply_sql_migrations.py`,
  `test_tenant_migration.py`), `MIGRATION_HISTORY_NOT_EXTENDED` emission, Neon-branch
  apply-twice idempotence.
- **Security:** `test_document_extract_scope.py`, `test_official_document_deletion.py`
  (super-admin delete + audit fields, student-draft delete allowed).
- **Official docs:** endpoint envelope/queued shape, template-version-bump and asset-change force a
  new version, no-profile → `failed`.
- **Profiles:** seed command produces MIHAS RN / KATC COG / KATC EHT; acceptance renderer reads only
  resolved profile; structural-cap rejections (≤30/5000/50/10/50).
- **Brand:** `index.html` Beanola metadata/preloader; `_generate_reference` → `BNL-`;
  `getInstitution` unknown → non-MIHAS; `ApplicationDetail` uses `institution_name`.
- **Comms:** schema columns/index present; staff out-of-scope template management rejected.
- **Frontend:** `useDocumentGeneration`/components now call the backend official-document service;
  queued/generating/ready/failed UI states; email path emails the stored document; UI guardrails via
  `impeccable detect apps/admissions/src/`.
- **Backward compatibility (R20):** route + envelope preservation, paginated `{page, pageSize,
  totalCount, results}`, auth/CSRF/JTI, auto-save/≥44px/mobile-money-first UX, RBAC, canonical-truth
  registration + drift-guard presence (R20.10, R20.11).

### Verification gates (per `.kiro/steering/tech.md`, R20.8/R20.9, R21)

- Backend: `cd backend && python3 -m pytest`, `python3 manage.py check`, `python3 manage.py
  spectacular --file /tmp/schema.yaml` — pass only on zero failures/issues/errors.
- Admissions: `cd apps/admissions && bun run type-check && bun run lint && bun run test`, then the
  build — pass only on zero errors.
- Targeted brand search, document-generator search, and scoped-access search must each return zero
  non-allowlisted/violating hits (R21.3–R21.5).
- `git diff --check`. Every skipped check is recorded with a written reason (R21.1).
