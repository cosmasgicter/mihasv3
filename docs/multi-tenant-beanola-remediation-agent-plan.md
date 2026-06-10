# Multi-Tenant Beanola Remediation Agent Plan

Last updated: 2026-06-09

Audience: another agentic LLM or senior engineer taking over the multi-tenant Beanola admissions migration.

Purpose: fix the remaining implementation holes after the system was partially migrated from a MIHAS/KATC-specific admissions app into a Beanola-owned multi-school platform.

This document is intentionally direct. Treat it as a work order. Verify every claim against the repo before editing.

## Non-Negotiable Product Goal

Beanola Technologies owns the admissions platform. MIHAS and KATC are client institutions, not the platform identity.

The final product must support:

1. Multiple universities and colleges onboarded by Beanola.
2. Each school having its own logo, signature, seal, branding colors, contact details, domains, document templates, required documents, fees, programs, intakes, and staff access.
3. Students applying program-first. They should choose a canonical program and intake, then the backend should assign the correct school offering automatically unless they are on a white-label school domain where choices are intentionally school-filtered.
4. Beanola super admins having global access.
5. School admins, approvers, reviewers, finance staff, and temporary grantees seeing only their school data or the specific scopes explicitly granted by Beanola.
6. Official documents generated from backend authoritative data, school assets, school template configuration, and versioned provenance.
7. No MIHAS/KATC hard-coded fallbacks in generic platform flows.

## Current State Summary

The foundation exists but is not release-ready.

Implemented pieces already present:

- Canonical programs and school-specific offerings.
- Tenant tables for assets, templates, required documents, domains, memberships, grants.
- Tenant-aware application assignment through `OfferingAssignmentService`.
- Tenant admin APIs under `/api/v1/admin/`.
- Frontend tenant onboarding UI at `/admin/tenants`.
- Backend official document tasks for application slip, acceptance letter, conditional offer, finance receipt, and payment receipt.
- Payment metadata snapshots and settlement grouping.
- Runtime portal context for Beanola shared portal vs white-label school domains.
- Targeted tests for parts of the above.

Known blockers:

- Production migration has not been applied.
- Tenant migration is placed in a directory that the production migration runner intentionally excludes.
- Student document downloads still use old client-side MIHAS/KATC PDFs.
- Backend official documents are generic and do not carry the rich school-specific letter content.
- A document OCR endpoint bypasses tenant scope for ordinary admins.
- Official documents can be soft-deleted through the generic document delete path.
- MIHAS/KATC branding and examples remain in public, email, payment, tracking, and PDF code.
- Admin validation gaps remain around grants, required documents, and manual asset records.

## Working Rules For The Agent

Do not start with broad refactors. Fix the holes in this order:

1. Make migrations deployable and safe.
2. Close cross-tenant security holes.
3. Consolidate document generation around the backend official document model.
4. Move school-specific document content out of hard-coded frontend MIHAS/KATC profiles and into backend tenant configuration.
5. Remove MIHAS/KATC platform fallbacks.
6. Tighten admin configuration validation.
7. Expand tests and run full verification.

Do not:

- Revert unrelated user changes.
- Delete legacy string fields from applications.
- Apply production database changes from this environment.
- Build an arbitrary DOCX/PDF mail-merge engine unless explicitly approved.
- Trust existing progress docs without verifying code and tests.
- Leave student-facing document paths using client-side official PDFs.

## Verification Commands To Run Frequently

Backend focused:

```bash
cd /home/cosmas/Downloads/mihasv3/backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest tests/unit/test_official_documents.py tests/unit/test_template_safety.py tests/unit/test_tenant_asset_upload.py tests/unit/test_cross_tenant_isolation.py -q
```

Frontend focused:

```bash
cd /home/cosmas/Downloads/mihasv3/apps/admissions
bun x vitest run tests/unit/pdf/acceptanceLetterProfiles.test.ts tests/unit/pdf/acceptanceLetter.test.tsx tests/unit/pdf/applicationSlip.test.tsx tests/unit/pdf/paymentReceipt.test.tsx tests/unit/pdf/documentShape.test.tsx tests/unit/useDocumentGeneration.test.tsx tests/unit/tenantOnboarding.test.tsx tests/unit/whiteLabelContext.test.tsx
```

Full gates before handoff:

```bash
cd /home/cosmas/Downloads/mihasv3/backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest tests/unit -q

cd /home/cosmas/Downloads/mihasv3/apps/admissions
bun run type-check
bun run lint
bun run test

cd /home/cosmas/Downloads/mihasv3
git diff --check
```

If full suites are too slow, still run all focused tests plus affected new tests. Record any skipped checks and why.

## Phase 0: Establish Baseline And Protect Existing Work

### Objective

Start from the current dirty worktree safely and document what changed before editing.

### Steps

1. Run:

   ```bash
   cd /home/cosmas/Downloads/mihasv3
   git status --short
   git diff --stat
   ```

2. Confirm the large dirty worktree. Do not revert anything.

3. Read these files before editing:

   - `docs/multi-tenant-beanola-progress.md`
   - `docs/multi-tenant-beanola-handover.md`
   - `docs/runbooks/multi-tenant-beanola-rollout.md`
   - `backend/apps/common/management/commands/apply_sql_migrations.py`
   - `backend/scripts/migrations/0001_multi_tenant_beanola_admissions.sql`
   - `backend/scripts/2026_06_08_student_number.sql`
   - `backend/apps/catalog/services.py`
   - `backend/apps/applications/tasks/pdf_generation.py`
   - `backend/apps/documents/document_storage_views.py`
   - `apps/admissions/src/hooks/useDocumentGeneration.ts`
   - `apps/admissions/src/lib/slipService.ts`
   - `apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts`
   - `apps/admissions/src/lib/pdf/theme/index.ts`

### Acceptance Criteria

- You can explain the current deploy path for SQL migrations.
- You can explain which document flows are backend-generated and which are client-generated.
- You have not reverted unrelated changes.

## Phase 1: Fix Migration Delivery

### Problem

`apply_sql_migrations.py` scans only top-level SQL files in `backend/scripts/` and intentionally excludes `backend/scripts/migrations/`.

The main tenant migration is here:

- `backend/scripts/migrations/0001_multi_tenant_beanola_admissions.sql`

That means production startup will not auto-apply the multi-tenant schema. A top-level script, `backend/scripts/2026_06_08_student_number.sql`, can be applied without the tenant migration, leaving code expecting tenant fields that are missing.

### Required Decision

Choose one of these two approaches. Prefer Approach A unless there is a strong reason not to.

#### Approach A: Move The Tenant Migration To Top-Level `backend/scripts/`

1. Move or duplicate the tenant migration to a top-level date-named file:

   ```text
   backend/scripts/2026_06_08_multi_tenant_beanola_admissions.sql
   ```

2. Keep the old `backend/scripts/migrations/0001...` only if needed for historical reference, but do not allow two copies to be applied to the same DB under different migration history names unless that is deliberate and idempotent. Since the script is idempotent, duplicate application is logically safe, but migration history would show two different names. Avoid that confusion.

3. Update references in docs and tests from:

   ```text
   backend/scripts/migrations/0001_multi_tenant_beanola_admissions.sql
   ```

   to:

   ```text
   backend/scripts/2026_06_08_multi_tenant_beanola_admissions.sql
   ```

4. Ensure lexical ordering places the tenant migration before any script that depends on its columns. If `2026_06_08_student_number.sql` does not depend on tenant columns, it can remain same date. Still prefer ordering names clearly:

   ```text
   2026_06_08_01_multi_tenant_beanola_admissions.sql
   2026_06_08_02_student_number.sql
   ```

   Only rename `student_number` if migration history has not already been applied anywhere. If it has been applied to any shared DB, do not rename without a reconciliation plan.

#### Approach B: Teach The Runner About A Specific Migration Subdirectory

Only use this if the repo intentionally wants subdirectory migrations.

1. Update `apply_sql_migrations.py` to recurse into approved subdirectories.
2. Remove or update comments saying `migrations/` is excluded.
3. Add tests proving `backend/scripts/migrations/0001...sql` is discovered.
4. Do not recurse into `archive/` or `applied/`.

Approach B is riskier because it changes a production bootstrap invariant.

### Update Tests

Add or update tests in:

- `backend/tests/unit/test_apply_sql_migrations.py`
- `backend/tests/unit/test_tenant_migration.py`
- `backend/tests/property/test_migration_history_forward_only.py`

Required test cases:

1. Tenant migration appears in the runner dry-run list.
2. Excluded rollback files remain excluded.
3. `00_full_schema.sql` remains excluded.
4. No production migration file is in an excluded subdirectory by mistake.
5. The migration path referenced by docs exists.

### Update Docs

Update:

- `docs/multi-tenant-beanola-progress.md`
- `docs/multi-tenant-beanola-handover.md`
- `docs/runbooks/multi-tenant-beanola-rollout.md`
- `.kiro/specs/multi-tenant-beanola-admissions/tasks.md`

Correct the false or misleading statement that the implementation is code/test complete if it still is not deployable.

Also fix any future-dated progress timestamp. On this handoff date the current date is 2026-06-09.

### Acceptance Criteria

- `apply_sql_migrations --dry-run` would include the tenant migration on a real configured DB.
- The migration path in docs matches the path the runner uses.
- Tests fail if a future tenant migration is placed in an excluded directory.
- No production rollout doc says the migration has been applied unless it actually has.

## Phase 2: Close Cross-Tenant Document Security Holes

### Issue 2.1: OCR Extraction Bypasses Tenant Scope

File:

- `backend/apps/documents/document_storage_views.py`

Current problem:

- `DocumentExtractView.post` loads `ApplicationDocument` and `Application`.
- It only checks ownership for non-admins.
- Any user with role `admin` can enqueue OCR for any document ID, even if the document belongs to another institution.

### Required Fix

Refactor `DocumentExtractView.post` to reuse `_get_authorized_document(request, self, document_id)`.

Implementation direction:

```python
document, error_response = _get_authorized_document(request, self, document_id)
if error_response is not None:
    return error_response
application = document.application
```

Then enqueue OCR only after authorization.

Use the same not-found masking policy as `_get_authorized_document`: out-of-scope admin reads should return the identical 404 NOT_FOUND envelope.

### Tests

Add tests to `backend/tests/unit/test_cross_tenant_isolation.py` or a new focused file.

Required cases:

1. School A admin can extract School A document.
2. School A admin cannot extract School B document.
3. Out-of-scope admin receives 404 NOT_FOUND, not 403, to avoid existence leaks.
4. Super admin can extract any document.
5. Student can extract only their own document if this endpoint should remain student-accessible.
6. Student cannot extract another student's document.

### Acceptance Criteria

- No admin action path on documents bypasses `AccessScopeService`.
- Existing document signed URL, download, info, delete behavior remains unchanged except where explicitly fixed below.

### Issue 2.2: Official Documents Can Be Soft-Deleted

File:

- `backend/apps/documents/document_storage_views.py`

Current problem:

- `DocumentDeleteView` soft-deletes any authorized document by setting `verification_status = "deleted"`.
- It does not block `system_generated=True`.
- Students likely can delete their own official application slips, acceptance letters, and receipts.

### Required Product Rule

Official generated documents are institutional records. They must not be deleted by students. Regular school admins should not be able to erase official document records either unless Beanola explicitly gives that permission.

Recommended V1 rule:

- Students: can delete only their own uploaded, non-system-generated documents while the application is editable.
- School admins: can mark uploaded applicant documents as deleted only within their scope if they have document-management permission.
- Super admins: can soft-delete any document, including system-generated, but this must write an audit event.
- System-generated official documents: default protected.

### Required Fix

In `DocumentDeleteView.delete` after authorization:

1. If `document.system_generated` is true and user is not `super_admin`, return:

   ```json
   {
     "success": false,
     "error": "Official generated documents cannot be deleted",
     "code": "OFFICIAL_DOCUMENT_IMMUTABLE"
   }
   ```

   Use 403.

2. If role is `student`, enforce application editability:

   - allow only if application status is `draft`, or use existing app editability policy if one exists.

3. Add an audit log row for successful delete attempts with:

   - actor
   - document ID
   - application ID
   - document type
   - system_generated
   - institution ID

4. Ensure out-of-scope admin still receives 404 from `_get_authorized_document`.

### Tests

Required cases:

1. Student cannot delete `system_generated=True` official document.
2. School admin cannot delete out-of-scope official document and gets 404.
3. School admin cannot delete in-scope official document unless product says otherwise.
4. Super admin can soft-delete official document and audit is written.
5. Student can still delete allowed uploaded draft document if that behavior is intended.

### Acceptance Criteria

- Official document record integrity is protected.
- Deletion rules are explicit and tested.

## Phase 3: Consolidate Official Document Generation

### Problem

There are two competing official document systems:

1. Backend official document generator:
   - `backend/apps/applications/tasks/pdf_generation.py`
   - Tenant-aware, stores `ApplicationDocument`, records provenance.

2. Frontend client-side PDF generator:
   - `apps/admissions/src/hooks/useDocumentGeneration.ts`
   - `apps/admissions/src/lib/slipService.ts`
   - `apps/admissions/src/lib/pdf/**`
   - MIHAS/KATC-specific profiles and assets.

Students currently download documents through the frontend generator, which bypasses backend tenant templates, uploaded assets, provenance, and immutable records.

### Target Architecture

Backend is the only source for official PDFs.

Frontend behavior:

- Student clicks "Download Slip" or "Receipt".
- Frontend asks backend for existing generated official document or queues/generates one via a student-safe endpoint.
- Frontend downloads the stored backend document through authorized signed URL/download endpoint.
- The document record carries `system_generated=True`, tenant metadata, template version, logo/signature asset IDs, and render status.

Client-side PDF generation may remain only for:

- Dev previews.
- Non-official draft previews.
- Tests around layout, if still useful.

It must not be used for official student downloads.

### Backend API Work

Add student-safe official document endpoints or extend existing endpoints carefully.

Current admin endpoints are admin-only:

- `POST /api/v1/applications/{id}/application-slip/`
- `POST /api/v1/applications/{id}/acceptance-letter/`
- `POST /api/v1/applications/{id}/conditional-offer/`
- `POST /api/v1/applications/{id}/finance-receipt/`
- `POST /api/v1/applications/{id}/payment-receipt/`

Recommended new endpoint:

```text
POST /api/v1/applications/{id}/official-documents/{document_type}/
GET  /api/v1/applications/{id}/official-documents/
```

Or add student-permitted endpoints under existing application routes with strict status rules.

Rules:

- Student can generate/download application slip only for their own non-draft submitted application.
- Student can generate/download acceptance letter only for their own approved application.
- Student can generate/download conditional offer only for their own conditionally approved application.
- Student can generate/download payment receipt only when a completed payment exists for their own application.
- Finance receipt may remain admin-only if it is internal.
- School admin can generate/download only in-scope applications.
- Super admin can generate/download all.

Return shape should include:

```json
{
  "success": true,
  "data": {
    "document_id": "...",
    "document_type": "application_slip",
    "status": "ready|queued|failed",
    "download_url": "...optional signed URL...",
    "generated_at": "...",
    "template_version": 3,
    "institution_id": "..."
  }
}
```

If async queued:

```json
{
  "success": true,
  "data": {
    "task_id": "...",
    "application_id": "...",
    "document_type": "...",
    "status": "queued"
  }
}
```

### Document Lifecycle Fix

Current task always creates a new `ApplicationDocument` after the one-hour idempotency window.

Implement a "current official version" policy.

Options:

1. Keep history but mark one current:
   - Add metadata in `verification_notes` or add DB column `is_current`.
   - Prefer adding DB column if acceptable:
     - `applications_documents.is_current boolean default true`
     - partial unique index on `(application_id, document_type) WHERE system_generated=true AND is_current=true`
   - When generating a new official doc, mark previous current doc for same application/type as not current.

2. Without schema change:
   - Query latest `system_generated=True`, non-deleted doc by `uploaded_at`.
   - Treat it as current.
   - Do not create another if template/assets/application version has not changed.

Recommended V1: implement option 2 first if schema churn must be minimized. Add option 1 later.

Task behavior:

- Compute a document fingerprint:
  - application ID
  - document type
  - application updated_at/status
  - institution ID
  - template ID/version
  - logo asset ID/checksum
  - signature asset ID/checksum
  - payment ID/receipt number for receipts
- If latest official document has same fingerprint, return existing document rather than creating another.
- Store fingerprint in `verification_notes.official_document.fingerprint`.

### Frontend Work

Replace student document calls:

- `apps/admissions/src/components/student/DocumentButtons.tsx`
- `apps/admissions/src/components/student/ApplicationSlipActions.tsx`
- `apps/admissions/src/components/student/DownloadReceiptButton.tsx`
- `apps/admissions/src/hooks/useDocumentGeneration.ts`
- `apps/admissions/src/hooks/usePaymentReceipt.ts`
- `apps/admissions/src/lib/slipService.ts`

Required behavior:

1. `DocumentButtons` calls backend official-document service, not `generateAcceptanceLetter`.
2. `ApplicationSlipActions` downloads backend-generated slip, not `createApplicationSlip`.
3. `DownloadReceiptButton` downloads backend official receipt, not `generatePaymentReceipt`.
4. Any "email slip" flow should email the backend-generated stored official document, not a locally generated blob.
5. UI must show queued/processing states when backend generation is asynchronous.

Add services:

```text
apps/admissions/src/services/officialDocuments.ts
```

Or extend:

```text
apps/admissions/src/services/applications.ts
```

Keep a clear API:

```ts
generateOfficialDocument(applicationId, documentType)
listOfficialDocuments(applicationId)
downloadOfficialDocument(documentId)
emailOfficialDocument(applicationId, documentType, email)
```

### Test Updates

Frontend:

- Update `tests/unit/useDocumentGeneration.test.tsx` to assert backend service calls instead of local PDF generation.
- Add tests for:
  - slip calls backend endpoint
  - acceptance calls backend endpoint
  - receipt calls backend endpoint
  - status gating in UI still works
  - queued state shown
  - download uses signed URL or document download endpoint

Backend:

- Add tests for student official document generation/download permissions.
- Add tests for no duplicate generation when fingerprint unchanged.
- Add tests for new generation when template version changes.
- Add tests for new generation when active logo/signature changes.

### Acceptance Criteria

- No student-facing official document path imports `generateApplicationSlip`, `generateAcceptanceLetter`, or `generatePaymentReceipt`.
- Official documents downloaded by students exist in `ApplicationDocument`.
- Official documents include tenant provenance.
- Repeated clicks do not create unbounded duplicates.
- School admins cannot generate documents for other schools.

## Phase 4: Move Rich School Document Content Into Backend Tenant Configuration

### Problem

The detailed document work done from:

- `apps/admissions/public/mihasacceptance.pdf`
- `apps/admissions/public/katc cog acceptance.docx`
- `apps/admissions/public/katc eht acceptance.docx`

was implemented in frontend hard-coded files:

- `apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts`
- `apps/admissions/src/lib/pdf/documents/intakeSchedule.ts`

This is not scalable for many institutions.

### Target

School-specific document content must be data, not code.

For each institution/offering/intake, Beanola should configure:

- acceptance letter body
- conditional offer body
- application slip body
- payment receipt body
- signatory title/name
- signature asset
- logo/seal assets
- fee chart
- banking/payment instructions
- required items to bring
- reporting dates
- commitment fee/deadline
- bursary notes
- regulatory indexing fees
- accommodation notes
- optional fees

### Backend Data Model Options

Use the existing `institution_document_templates` and `institution_required_documents` if possible, but they currently support only:

- sections: `body`, `signatory`
- tokens: limited list

This is too small for detailed acceptance letters.

Recommended additive schema:

1. Add richer JSON fields to `institution_document_templates`:

   ```sql
   ALTER TABLE institution_document_templates
     ADD COLUMN IF NOT EXISTS layout_key varchar(80) NULL,
     ADD COLUMN IF NOT EXISTS applies_to_program_id uuid NULL,
     ADD COLUMN IF NOT EXISTS applies_to_canonical_program_id uuid NULL,
     ADD COLUMN IF NOT EXISTS applies_to_intake_id uuid NULL,
     ADD COLUMN IF NOT EXISTS content_schema_version integer NOT NULL DEFAULT 1;
   ```

2. Or create a new table:

   ```text
   institution_document_profiles
   ```

   Fields:

   - id
   - institution_id
   - document_type
   - program_id nullable
   - canonical_program_id nullable
   - intake_id nullable
   - layout_key
   - sections jsonb
   - fee_chart jsonb
   - bank_accounts jsonb
   - requirements jsonb
   - signatory jsonb
   - rules jsonb
   - version
   - is_active
   - created_by_id
   - created_at
   - updated_at

Recommended: new table if the content gets large. Keep `institution_document_templates` for simple V1, or migrate it into the new profile model later.

### Safe Template Policy

Do not add arbitrary DOCX/PDF merge execution by default.

Instead:

- Allow structured JSON document profiles.
- Validate section keys and field types.
- Allow a larger token allowlist.
- Render with backend-controlled layouts.
- Store uploaded original reference files only as source attachments for admin reference, not as executable templates.

If the user later requires true DOCX/PDF template upload:

- Build a separate sandboxed rendering service.
- Strip macros.
- Never execute uploaded scripts or fields.
- Convert in an isolated worker/container.
- Treat it as a separate security project.

### Backend Renderer Work

File:

- `backend/apps/applications/tasks/pdf_generation.py`

Replace generic `_default_body` behavior with layout-specific rendering.

Recommended structure:

```text
backend/apps/applications/tasks/pdf/
  __init__.py
  official_documents.py
  render_context.py
  renderers/
    application_slip.py
    acceptance_letter.py
    conditional_offer.py
    payment_receipt.py
    finance_receipt.py
  layouts/
    simple_letter.py
    fee_chart_letter.py
```

Context should include:

- application
- institution
- canonical program
- offering
- intake
- payment
- active assets
- active template/profile
- required documents
- student number
- generated timestamp
- verification/provenance payload

Acceptance letter renderer should support:

- letterhead
- date/address block
- reference line
- opening body
- commitment fee block
- bank account block
- fee chart
- requirements list
- notes
- signatory/signature
- QR/provenance block if backend has QR support

### Migration Of Existing MIHAS/KATC Content

Create seed data for existing sample profiles:

- MIHAS RN acceptance profile
- KATC COG acceptance profile
- KATC EHT acceptance profile

Put this in a dev/seed script first:

- `backend/scripts/seed_tenant_dev_data.py` or a new management command.

Do not put operational banking details in tests only. They must be configurable data.

### Admin UI Work

Files:

- `apps/admissions/src/pages/admin/Tenants.tsx`
- `apps/admissions/src/pages/admin/tenants/TemplatesPanel.tsx`
- `apps/admissions/src/services/admin/tenants.ts`

Admin template UI must support:

- choosing document type
- choosing optional applies-to offering/canonical program/intake
- choosing layout type
- editing safe structured sections
- editing fee chart rows
- editing bank accounts
- editing requirement list
- editing signatory text
- previewing with sample data
- cloning latest version
- activating/deactivating versions
- warning if SVG logo/signature will not render in backend PDFs

### Tests

Backend:

- Renderer tests for fee chart layout.
- Renderer tests for MIHAS/KATC seeded profiles.
- Template validation tests for structured content.
- Provenance tests include template/profile ID/version and asset checksums.

Frontend:

- Template panel tests for fee rows, bank rows, requirements, clone/version.
- Preview tests do not assume MIHAS/KATC fallback.

### Acceptance Criteria

- No official school-specific document content is hard-coded in frontend code.
- New school can be configured without code changes.
- Existing MIHAS/KATC acceptance letter content can be represented as tenant data.
- Backend official PDFs can render rich acceptance letters from tenant data.

## Phase 5: Remove MIHAS/KATC Platform Fallbacks

### Problem

MIHAS/KATC strings remain across the app. Some are test fixtures and acceptable. Many are product fallbacks and not acceptable for a Beanola platform.

### Search Commands

Run:

```bash
cd /home/cosmas/Downloads/mihasv3
rg -n "MIHAS|KATC|mihas|katc|Mukuba|Kalulushi" apps/admissions/src apps/admissions/index.html backend/apps docs | tee /tmp/brand_hits.txt
```

Classify each hit:

1. Test fixture: acceptable if explicitly testing a tenant.
2. Historical sample/reference: acceptable in docs or seed data.
3. User-visible fallback: must fix.
4. Backend generated reference: must fix or explicitly justify.
5. Public metadata/preloader: must fix.

### Required Fixes

#### Public HTML

File:

- `apps/admissions/index.html`

Replace MIHAS metadata/preloader with Beanola shared platform defaults.

Use:

- title: `Beanola Admissions`
- description: generic multi-school admissions text
- OG site name: `Beanola Admissions`
- preconnect API host: environment-driven if possible, otherwise remove hard-coded `api.mihas.edu.zm`
- preloader brand: Beanola
- preloader logo: Beanola logo asset

Keep school-specific white-label branding in React runtime, not static HTML, unless server-side host-aware HTML rendering is introduced.

#### Payment References

Files:

- `backend/apps/documents/payment_helpers.py`
- `backend/apps/documents/payment_service.py`

Current:

```text
MIHAS-{application_number}-{timestamp}
```

Change to:

```text
BEANOLA-{application_number}-{timestamp}
```

Or:

```text
BNL-{application_number}-{timestamp}
```

Confirm no Lenco integration or reconciliation depends on `MIHAS-`.

Update tests.

#### Application Number Fallback

File:

- `backend/apps/applications/_view_helpers.py`

Current `_resolve_institution_code` falls back to `MIHAS`.

For new program-first flow, there should always be an assigned institution. For true missing institution:

- Use `BNL` only for platform-level references if allowed.
- Or raise a validation/configuration error instead of silently generating MIHAS.

Recommended:

- For application numbers after assignment: require an institution code.
- For legacy fallback only: keep MIHAS only behind a clearly named legacy path and test it.

#### Communication Defaults

File:

- `backend/apps/common/communication_service.py`

Replace default subject/body/signature:

- `MIHAS Admissions` -> `Beanola Admissions`
- `https://apply.mihas.edu.zm` -> `settings.FRONTEND_URL` or tenant-aware portal URL.

Longer-term:

- Communication templates should be tenant-aware.
- `CommunicationTemplate` lookup should consider institution/template key.

#### Email Components

File:

- `backend/apps/common/email/components.py`

Replace module docstrings and default signature assumptions that Dr Solomon/MIHAS/KATC are universal.

The `signature_block` default should be Beanola Admissions Office or require explicit signatory context.

#### Tracker Examples

Files likely include:

- `apps/admissions/src/pages/public/tracker/components/TrackerSearchSection.tsx`
- `apps/admissions/src/pages/public/tracker/components/HelpSection.tsx`
- `apps/admissions/src/pages/public/tracker/utils/trackerUtils.ts`

Replace examples with neutral:

- `BNL202600001`
- `TRK-BNL2026ABCDEF`

Or show dynamic examples based on runtime context.

Do not restrict valid app number pattern to only `MIHAS|KATC`.

#### Frontend PDF Theme

File:

- `apps/admissions/src/lib/pdf/theme/index.ts`

If frontend PDF stays only for dev preview, move MIHAS/KATC registry under dev/sample data. If any production code still imports it for official docs, remove fallback-to-MIHAS behavior.

Unknown institution must not silently render MIHAS.

Recommended behavior:

- Return Beanola generic for platform previews.
- Throw explicit error for official document missing tenant assets/config.

#### Student Views

File:

- `apps/admissions/src/pages/student/ApplicationDetail.tsx`

Remove hard-coded MIHAS/KATC display mapping. Backend should send display name. Frontend can show:

```ts
application.institution_name ?? application.institution ?? 'Not provided'
```

### Tests

Add a brand drift test:

- No user-visible production source can contain MIHAS/KATC except allowlisted tenant-specific files, fixtures, docs, or tests.

Example property/static test:

```text
apps/admissions/tests/property/platformBrandingNoLegacyFallback.property.test.ts
backend/tests/unit/test_platform_branding_no_legacy_fallback.py
```

Use an allowlist file:

```text
docs/legacy-brand-allowlist.json
```

Keep the allowlist small and reviewed.

### Acceptance Criteria

- Shared portal first paint says Beanola, not MIHAS.
- Unknown/new school never falls back to MIHAS.
- Payment references no longer start with MIHAS unless tied to legacy records.
- Communication defaults are Beanola or tenant-specific.
- Tests catch reintroduction of MIHAS/KATC platform fallbacks.

## Phase 6: Tighten Admin Tenant Configuration Validation

### Issue 6.1: Required Document Validation Is Incomplete

File:

- `backend/apps/catalog/admin_serializers.py`

Current:

- Checks `program_id` belongs to `institution_id`.
- Does not verify `canonical_program_id` exists.
- Does not prevent mismatch between `program_id` and `canonical_program_id`.

Required validation:

1. `institution_id` exists and active for create.
2. `program_id`, if present, exists, active, belongs to institution.
3. `canonical_program_id`, if present, exists and active.
4. If both `program_id` and `canonical_program_id` are present, program's `canonical_program_id` must match.
5. Prevent duplicate active required-document rows for same:
   - institution
   - document_type
   - program_id nullable
   - canonical_program_id nullable
   - same rules scope if needed

Add DB partial unique index if product wants strict uniqueness.

### Issue 6.2: Access Grant Validation Is Incomplete

File:

- `backend/apps/catalog/admin_serializers.py`

Current:

- Enforces required target field by `scope_type`.
- Does not verify target belongs to selected institution when both are present.
- Does not verify target is active/in-scope.

Required validation:

For `scope_type = institution`:

- `institution_id` required.
- institution exists and active.

For `scope_type = program_offering`:

- `program_id` required.
- program exists, active, school-owned.
- if `institution_id` supplied, program belongs to that institution.

For `scope_type = application`:

- `application_id` required.
- application exists.
- if `institution_id` supplied, application.institution_ref_id matches.
- if `program_id` supplied, application.program_offering_id matches.

For all:

- `expires_at`, if present, must be in the future.
- `permissions` must be from an allowlist.
- No active duplicate grant for same user/scope/target unless updating same row.

### Issue 6.3: Manual Asset Registration Bypasses Upload Validation

Files:

- `backend/apps/catalog/admin_views.py`
- `backend/apps/catalog/admin_serializers.py`

Current:

- Upload endpoint validates MIME/magic bytes.
- Generic assets create endpoint can accept `storage_key`, `public_url`, `mime_type`, `checksum_sha256` manually.

Required decision:

Preferred V1:

- Disable manual asset record creation through `POST /assets/`.
- Only allow multipart upload endpoint.
- Keep list endpoint.

If manual registration must exist:

- Make it super-admin-only.
- Require `storage_key` to be under `institution-assets/{institution_id}/`.
- Fetch object from storage and validate bytes/checksum before creating row.
- Do not trust user-provided checksum.

### Issue 6.4: SVG Upload And Render Mismatch

Current:

- SVG assets can be uploaded after safety scanning.
- Backend PDF renderer refuses SVG and records `unsupported`.

Required UI behavior:

- Tenant asset UI must warn: SVG can be used for web branding but will not render in official PDFs.
- For logo/signature used in PDFs, require PNG/JPEG/WebP or prompt admin to upload a raster version.

Backend option:

- Add `usage` or `render_targets` metadata.
- Or reject SVG for `asset_type=signature` if signatures must render in PDFs.

### Tests

Add tests:

- Required doc rejects mismatched program/canonical.
- Required doc rejects nonexistent canonical.
- Access grant rejects application outside institution.
- Access grant rejects program outside institution.
- Access grant rejects expired grant on create.
- Manual asset create is blocked or validates storage object.
- SVG PDF render warning/provenance remains tested.

### Acceptance Criteria

- Bad tenant config cannot create cross-school leaks.
- Asset records cannot point at arbitrary unvalidated URLs.
- Admin UI communicates PDF asset compatibility clearly.

## Phase 7: Make Communication Templates Tenant-Aware

### Problem

Communication defaults and templates are global. The system has tenant-specific document templates, but emails/notifications still use global templates and MIHAS fallback language.

### Target

Notifications and emails should resolve in this order:

1. Institution-specific active template for the application's institution and template key.
2. Beanola platform active template for template key.
3. Safe Beanola default fallback.

### Backend Work

Inspect:

- `backend/apps/common/models.py`
- `backend/apps/common/communication_service.py`
- `backend/apps/common/template_urls.py`
- admin template UI/service.

Options:

1. Extend existing `CommunicationTemplate` with `institution_id nullable`.
2. Add `InstitutionCommunicationTemplate`.

Recommended: extend existing table if it is manageable:

```sql
ALTER TABLE communication_templates
  ADD COLUMN IF NOT EXISTS institution_id uuid NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
```

Add index:

```sql
CREATE INDEX IF NOT EXISTS idx_communication_templates_tenant_lookup
ON communication_templates (institution_id, template_key, is_active, version);
```

Update `CommunicationService.render_template`:

- Accept `institution_id` or application.
- Lookup tenant template first.
- Then global.
- Use Beanola fallback.

Update `CommunicationService.send`:

- Build context with institution brand/contact/portal URL.
- Do not hard-code `https://apply.mihas.edu.zm`.

### Frontend/Admin Work

Tenant onboarding should either:

- include communication template management per school, or
- link to a global communication templates page filtered by institution.

### Tests

- Tenant template overrides global.
- Global template used when tenant template missing.
- Beanola fallback used when no template exists.
- MIHAS fallback text no longer appears for unknown/future school.
- School staff can only view/edit templates for their scope if editing is allowed at all.

### Acceptance Criteria

- Emails and notifications reflect assigned school or Beanola shared platform.
- No MIHAS fallback email text remains in generic flow.

## Phase 8: Complete Program-First Assignment Edge Cases

### Current Good Foundation

`ApplicationCreateSerializer` accepts `program_id`, `intake_id`, optional `institution_id`.

`ApplicationReviewView.post` calls `OfferingAssignmentService().assign(...)`, fills assigned institution/program/intake strings and IDs.

### Remaining Edge Cases To Verify/Fix

1. Multiple schools offer same canonical program and same intake.
   - Assignment priority must be deterministic.
   - Capacity must be enforced.
   - White-label institution filter must restrict to that school.

2. No eligible offering.
   - Student must receive clear recoverable error.
   - Admin routing simulator must match real assignment.

3. Capacity race.
   - Current assignment appears to inspect `current_enrollment`, but application create may not atomically reserve capacity.
   - Decide whether application creation reserves a seat or only enrollment does.
   - If it reserves capacity, implement transaction/lock.
   - If not, document that capacity is advisory until enrollment.

4. Required documents.
   - Student upload UI should use backend assigned required documents.
   - Required docs should vary by school/offering/canonical program.
   - Missing required docs should block submission based on assigned school config.

5. Legacy create path.
   - Still accepts string `program`, `intake`, `institution`.
   - Decide if this remains for old clients only.
   - New frontend should always use IDs.
   - Add warnings/metrics for legacy path usage.

6. Application number generation.
   - Must use assigned institution code.
   - Must not default to MIHAS for new flows.

### Tests

Add tests for:

- Two institutions offer same canonical program; lower priority wins.
- Intake priority overrides offering priority.
- Capacity full skips offering.
- White-label domain restricts offering choices.
- Required documents returned for assigned offering.
- Legacy path still works only if explicitly allowed.
- New path fails if assignment returns no offering.
- New path never creates MIHAS application number for unknown assigned institution.

### Acceptance Criteria

- Students choose canonical program only.
- School assignment is deterministic, auditable, and tested.
- No new flow depends on institution display strings.

## Phase 9: Improve Official Document Provenance And Audit

### Required Metadata

Every backend official document should store in `verification_notes.official_document`:

- document_type
- institution_id
- institution_name
- canonical_program_id
- program_offering_id
- intake_id
- application_id
- student_number where applicable
- template/profile ID
- template/profile version
- logo asset ID and checksum
- signature asset ID and checksum
- seal asset ID and checksum if used
- payment ID and receipt number for receipts
- render status per asset
- generated_by user ID if human-triggered
- generated_by role
- generated_at
- fingerprint

Currently metadata is narrower.

### Audit Events

Record audit events for:

- official document queued
- official document generated
- official document generation failed permanently
- official document downloaded by admin/student
- official document emailed
- template/profile created/updated/activated/deactivated
- asset uploaded/activated/deactivated

Ensure audit does not log document body, full PII, bank secrets beyond configured public details, or raw template content if considered sensitive.

### Tests

- Metadata includes all IDs.
- Metadata snapshots survive institution rename.
- Audit created on success/failure/download.
- No raw document body in audit changes.

### Acceptance Criteria

- A future dispute can identify exactly which school config/assets/template version produced a PDF.

## Phase 10: Update Student And Admin UI Around Generated Documents

### Student UI

Areas:

- `apps/admissions/src/components/student/DocumentButtons.tsx`
- `apps/admissions/src/components/student/ApplicationSlipActions.tsx`
- `apps/admissions/src/components/student/DownloadReceiptButton.tsx`
- `apps/admissions/src/pages/student/ApplicationDetail.tsx`
- `apps/admissions/src/pages/student/ApplicationStatus.tsx`

Required behavior:

- Shows only document actions allowed by current status and payment state.
- Uses backend-generated official document services.
- Shows "Queued", "Generating", "Ready", "Failed" states.
- Download button downloads stored official document.
- Email button emails stored official document.
- Does not mention MIHAS/KATC except when the assigned school is actually MIHAS/KATC.

### Admin UI

Areas:

- `apps/admissions/src/pages/admin/Applications.tsx`
- `apps/admissions/src/pages/admin/Tenants.tsx`
- `apps/admissions/src/pages/admin/tenants/*`

Required behavior:

- Admin generate buttons queue backend official docs and then show document status.
- Admin can see latest official documents per application.
- Admin can preview tenant templates using sample data.
- Admin can see asset render compatibility.
- Admin can test routing and see required docs.
- Admin cannot see data outside scope.

### Tests

- UI uses backend service mocks.
- No local PDF generator used in production student components.
- Scoped admin sees only in-scope tenant docs/config.
- Super admin sees global tenant dashboard.

### Acceptance Criteria

- Student/admin document UX reflects backend truth.
- No hidden client-only generated "official" PDFs remain.

## Phase 11: Add Drift Guards

### Migration Drift Guard

Add tests that fail if:

- A production migration is placed in excluded `backend/scripts/migrations/`.
- Docs reference a missing migration.
- Models contain unmanaged fields that are not in migration scripts.

### Brand Drift Guard

Add tests that fail if:

- `MIHAS`, `KATC`, `Mukuba`, `Kalulushi`, or `apply.mihas.edu.zm` appear in non-allowlisted production source.

Allowlist examples:

- Tenant seed fixtures for MIHAS/KATC.
- Tests explicitly creating MIHAS/KATC institutions.
- Historical docs/sample document references.
- Public assets for tenant logos.

### Document Flow Drift Guard

Add tests that fail if:

- Student production components import from `@/lib/pdf` official generation functions.
- Student document hooks call local `generateApplicationSlip`, `generateAcceptanceLetter`, or `generatePaymentReceipt`.
- Official document endpoints create duplicate documents without fingerprint change.

### Scope Drift Guard

Add tests that fail if:

- Admin role alone grants access to application/payment/document data without `AccessScopeService`, outside super admin.
- New document endpoints omit scope filtering.

### Acceptance Criteria

- Future agents cannot accidentally reintroduce the same class of bug without test failures.

## Phase 12: Documentation And Rollout Runbook

### Update Progress Docs Honestly

Update:

- `docs/multi-tenant-beanola-progress.md`
- `docs/multi-tenant-beanola-handover.md`
- `.kiro/specs/multi-tenant-beanola-admissions/tasks.md`

Rules:

- Do not mark complete until migrations are deployable, security holes are closed, and student official documents use backend generation.
- Use real dates.
- Separate "code complete", "staging validated", and "production applied".

### Rollout Runbook

Update:

- `docs/runbooks/multi-tenant-beanola-rollout.md`

Include exact operator steps:

1. Backup production DB.
2. Verify migration history prerequisite.
3. Run dry-run and confirm tenant migration appears.
4. Apply migration in maintenance window.
5. Run validation SQL:
   - tenant columns exist
   - canonical_programs count
   - programs linked
   - applications linked
   - FK constraints present
   - indexes present
   - no duplicate domains
   - no duplicate active memberships
6. Validate sample document generation for MIHAS and KATC.
7. Onboard a test future school on staging.
8. Validate school admin scope.
9. Validate student program-first flow.
10. Validate payment settlement metadata.
11. Monitor audit logs and errors.
12. Rollback plan for application code if migration succeeded but app fails.

### Acceptance Criteria

- A human operator can safely deploy without guessing.
- Docs do not claim production completion until it happens.

## Phase 13: Final Full Verification Checklist

Before final handoff, run:

```bash
cd /home/cosmas/Downloads/mihasv3/backend
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check
DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest tests/unit -q

cd /home/cosmas/Downloads/mihasv3/apps/admissions
bun run type-check
bun run lint
bun run test

cd /home/cosmas/Downloads/mihasv3
git diff --check
```

Also run targeted searches:

```bash
rg -n "MIHAS|KATC|mihas|katc|Mukuba|Kalulushi|apply.mihas.edu.zm" apps/admissions/src apps/admissions/index.html backend/apps
rg -n "generateApplicationSlip|generateAcceptanceLetter|generatePaymentReceipt" apps/admissions/src/components apps/admissions/src/hooks apps/admissions/src/pages
rg -n "ApplicationDocument.objects.get|Payment.objects.get|Application.objects.get" backend/apps | rg -v "AccessScopeService|super_admin|_get_scoped|_get_authorized"
```

For each remaining hit, document whether it is allowed and why.

## Priority Order Summary

Do this sequence:

1. Migration runner/path fix.
2. OCR extraction tenant scope fix.
3. Official document immutability/delete policy.
4. Backend official document retrieval/generation endpoints for students.
5. Frontend student document flows use backend official docs.
6. Duplicate/fingerprint lifecycle for official docs.
7. Rich backend tenant document profiles for MIHAS/KATC and future schools.
8. Remove MIHAS/KATC generic fallbacks.
9. Admin validation hardening.
10. Tenant-aware communication templates.
11. Assignment edge-case hardening.
12. Drift guards.
13. Docs/runbook truth cleanup.
14. Full verification.

## Definition Of Done

The work is done only when all of these are true:

- The tenant migration is discoverable by the production migration runner.
- Production rollout docs are accurate and not future-dated.
- Regular admins cannot access or trigger work on out-of-scope applications, payments, documents, OCR, or official docs.
- Student official document downloads come from backend stored official documents.
- Official documents cannot be deleted by students or ordinary school admins.
- Backend official documents render from tenant configuration and assets, not MIHAS/KATC frontend hard-coded profiles.
- New schools can be onboarded without code changes for logos, signatures, templates, required documents, programs, and staff access.
- Unknown schools do not fall back to MIHAS.
- Shared portal branding is Beanola.
- MIHAS and KATC exist only as tenant data, fixtures, or explicit samples.
- Tests cover migration discovery, tenant isolation, official document lifecycle, brand drift, and admin config validation.
- Full backend and frontend verification passes or any remaining failures are documented with owner-approved exceptions.
