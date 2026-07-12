# Requirements Document

## Introduction

The platform was partially migrated from a single-tenant MIHAS/KATC admissions
app into a Beanola-owned multi-school platform (spec
`.kiro/specs/multi-tenant-beanola-admissions/`). That spec built the foundation —
canonical programs, school-specific offerings, tenant tables (assets, templates,
required documents, domains, memberships, grants), `OfferingAssignmentService`,
`AccessScopeService`, tenant admin APIs, backend official-document tasks, and the
program-first wizard. It did **not** close every hole. This spec, the
**remediation spec**, captures the remaining work order documented in
`docs/multi-tenant-beanola-remediation-agent-plan.md` and turns each hole into a
precise, testable requirement.

The remediation is grouped into the plan's themes:

1. **Migration delivery** — the tenant migration sits in
   `backend/scripts/migrations/`, a directory `apply_sql_migrations.py`
   intentionally excludes, so production startup never applies the multi-tenant
   schema. Make migrations deployable, ordered, and guarded.
2. **Cross-tenant document security** — the OCR extract endpoint bypasses tenant
   scope for ordinary admins, and official/system-generated documents can be
   soft-deleted through the generic delete path.
3. **Official-document consolidation** — students still download client-side
   MIHAS/KATC PDFs; the backend tenant-aware generator must become the only
   source of official PDFs, with a current-version + fingerprint lifecycle.
4. **Tenant document content** — rich school-specific letter content is
   hard-coded in frontend profiles and must move into backend tenant
   configuration with a safe structured-JSON template policy (no arbitrary
   DOCX/PDF merge engine).
5. **Brand fallback removal** — MIHAS/KATC strings remain in public metadata,
   payment references, application-number fallbacks, communication defaults,
   email components, tracker examples, PDF theme, and student display mapping.
6. **Admin config validation** — required-document, access-grant, and manual
   asset-registration validation gaps, plus SVG render-mismatch warnings.
7. **Tenant-aware communication templates** — emails/notifications resolve
   institution → Beanola platform → safe Beanola default.
8. **Program-first assignment edge cases** — deterministic multi-offer priority,
   capacity-race policy, recoverable no-offering errors, assigned required
   documents, legacy-path metrics, institution-coded application numbers.
9. **Official-document provenance + audit** — full metadata snapshot and audit
   events without PII/secrets/document bodies.
10. **Document UI** — status-gated student/admin actions sourced from the
    backend; no client-only "official" PDFs.
11. **Drift guards** — migration, brand, document-flow, and scope drift tests.
12. **Documentation + rollout runbook honesty** — accurate, non-future-dated
    progress docs and operator rollout steps.
13. **Final verification.**

**Hard constraints that bound every requirement:** Beanola owns the platform and
MIHAS/KATC are tenant data only; no MIHAS/KATC hard-coded fallbacks in generic
flows; legacy string fields on `applications` are never deleted; no production DB
changes are applied from this environment (Neon-first, then production per the
infrastructure steering); no arbitrary DOCX/PDF mail-merge engine; backward data
compatibility is preserved (legacy null-canonical-ID applications stay readable);
out-of-scope reads return a 404 not-found shape (no existence leaks); all
authenticated list endpoints use the `{"success": true, "data": ...}` envelope;
the frontend uses canonical UI primitives, Lucide icons, WCAG AA contrast,
≥44×44px touch targets, and no purple gradients/gradient text/glassmorphism/
nested cards/emoji.

## Glossary

- **Beanola**: The platform owner and central payment collector. Default brand on the Shared_Portal before a school is assigned.
- **Institution / School**: A client tenant (MIHAS, KATC, future schools). Row in `institutions`; identity is `institutions.id`.
- **Canonical_Program**: A shared cross-school program definition (`canonical_programs.id`). What a student chooses.
- **Offering**: A school-specific program (`programs` row) linked to a Canonical_Program via `programs.canonical_program_id` and owned by an institution via `programs.institution_id`.
- **Intake**: An admission window (`intakes`); per-offering availability/capacity/priority lives in `program_intakes`.
- **Assignment_Service**: `backend/apps/catalog/services.py:OfferingAssignmentService`.
- **Access_Scope_Service**: `backend/apps/catalog/services.py:AccessScopeService` — computes the institution/offering/application IDs a non-super-admin may access.
- **Scope_Filters**: The dataclass returned by Access_Scope_Service describing whether the caller is global and which IDs they may access.
- **Super_Admin**: A global actor with platform-wide access.
- **School_Staff**: A non-super-admin admin/reviewer bounded by Memberships and Access_Grants.
- **Migration_Runner**: The management command `backend/apps/common/management/commands/apply_sql_migrations.py`.
- **Excluded_Subdirectory**: A subdirectory under `backend/scripts/` (`applied/`, `archive/`, `migrations/`) that the Migration_Runner does not apply.
- **Tenant_Migration**: The additive, idempotent multi-tenant schema SQL, relocated to the deployable path `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql` (formerly in the runner-excluded `scripts/migrations/` directory).
- **Deployable_Migration_Path**: The top-level `backend/scripts/` location (date-ordered filename) from which the Migration_Runner actually applies SQL.
- **Migration_History_Prerequisite**: `2026_05_22_migration_history_extend.sql`, required before the Migration_Runner will run.
- **Document_Storage_Views**: `backend/apps/documents/document_storage_views.py`.
- **Authorized_Document_Loader**: `_get_authorized_document(request, view, document_id)` in Document_Storage_Views — loads a document and enforces scope, returning a 404 not-found envelope when out of scope.
- **OCR_Extract_View**: `DocumentExtractView` (`POST /api/v1/documents/{id}/extract/`).
- **Document_Delete_View**: `DocumentDeleteView` (`DELETE /api/v1/documents/{id}/delete/`), a soft-delete that sets `verification_status = "deleted"`.
- **Official_Document**: A backend-generated canonical PDF (`ApplicationDocument` row with `system_generated=True`) carrying tenant provenance in `verification_notes.official_document`.
- **Official_Document_Generator**: `backend/apps/applications/tasks/pdf_generation.py` — the tenant-aware backend generator.
- **Client_PDF_Generators**: The frontend functions `generateApplicationSlip`, `generateAcceptanceLetter`, `generatePaymentReceipt` exported from `@/lib/pdf`, plus `slipService.ts` / `useDocumentGeneration.ts`.
- **Current_Official_Version**: The single non-deleted `system_generated=True` Official_Document treated as authoritative for a given `(application, document_type)`.
- **Document_Fingerprint**: A deterministic hash over application ID, document type, application status/updated_at, institution ID, template/profile ID+version, logo/signature asset ID+checksum, and payment/receipt identifiers, used to decide whether a new Official_Document is needed.
- **Institution_Document_Template**: Versioned safe-section/token template in `institution_document_templates`.
- **Institution_Document_Profile**: A richer tenant document-content record (existing template table extended, or a new `institution_document_profiles` table) holding structured JSON sections, fee charts, bank accounts, requirements, signatory, rules, and version.
- **Safe_Template_Policy**: The rule that document content is validated structured JSON with an allowlisted token set rendered by backend-controlled layouts; uploaded DOCX/PDF originals are reference attachments only and are never executed or merged.
- **Required_Document**: Configurable document requirement in `institution_required_documents`, scoped per institution, offering, canonical program, or default.
- **Institution_Asset**: Versioned logo/signature/seal in `institution_assets` (storage key, MIME, checksum, version).
- **Access_Grant**: Row in `access_grants` granting scoped extra access at institution, program-offering, or application scope, optionally time-bounded.
- **Communication_Template**: Row in `communication_templates` driving notification/email content with `{{variable}}` substitution.
- **Brand_Allowlist**: A small reviewed allowlist file (e.g. `docs/legacy-brand-allowlist.json`) naming the files permitted to contain MIHAS/KATC/legacy-domain strings.
- **Audit_Event**: A row written through the platform audit mechanism (`audit_logs`) recording actor, action, target, and non-PII metadata.
- **Legacy_String_Fields**: The pre-existing columns `applications.institution`, `applications.program`, `applications.intake` — immutable display snapshots.

## Requirements

### Requirement 1: Migration Delivery and Ordering

**User Story:** As a platform engineer, I want the Tenant_Migration to be discovered and applied by the Migration_Runner at startup in the correct order, so that the multi-tenant schema is guaranteed present before code that reads tenant columns serves any request.

#### Acceptance Criteria

1. THE Tenant_Migration SHALL reside at a Deployable_Migration_Path that the Migration_Runner applies, and SHALL NOT depend on any file inside an Excluded_Subdirectory for production application.
2. WHEN the Migration_Runner builds its pending-migration list against a configured database, THE Migration_Runner SHALL include the Tenant_Migration at the Deployable_Migration_Path.
3. THE Tenant_Migration SHALL be ordered by filename so that it sorts before any migration that depends on its columns.
4. THE Migration_Runner SHALL continue to exclude rollback files (`*_rollback.sql`), `00_full_schema.sql`, and the `applied/`, `archive/`, and `migrations/` Excluded_Subdirectories.
5. THE Tenant_Migration SHALL remain additive and idempotent: new tables, nullable columns, and indexes only, with best-effort backfills, and SHALL NOT drop or rewrite existing columns.
6. IF a single database would receive the Tenant_Migration under two different migration-history names, THEN THE delivery approach SHALL prevent that duplicate-history condition.
7. WHERE documentation, tests, or specs reference the Tenant_Migration path, THE reference SHALL point to the Deployable_Migration_Path that the Migration_Runner uses.
8. THE Tenant_Migration SHALL NOT be applied to the production database from the development environment; schema changes SHALL be authored and validated on Neon first per the infrastructure steering.

### Requirement 2: Migration Drift Guard

**User Story:** As a platform engineer, I want automated guards that fail when a production migration is mis-placed or a documented migration path is missing, so that the migration-delivery class of bug cannot silently reappear.

#### Acceptance Criteria

1. THE test suite SHALL include a test that fails IF a production (non-rollback, non-archive) migration file is placed inside an Excluded_Subdirectory.
2. THE test suite SHALL include a test asserting the Tenant_Migration appears in the Migration_Runner dry-run discovery list.
3. THE test suite SHALL include a test asserting `00_full_schema.sql` and `*_rollback.sql` remain excluded from discovery.
4. THE test suite SHALL include a test that fails IF a migration path referenced by docs or specs does not exist on disk.
5. IF the Migration_History_Prerequisite is not applied on the configured database, THEN the Migration_Runner SHALL refuse to run and SHALL emit `MIGRATION_HISTORY_NOT_EXTENDED`.

### Requirement 3: OCR Extraction Tenant Scope

**User Story:** As a school staff member, I want the OCR extraction endpoint to enforce tenant scope, so that no ordinary admin can enqueue OCR for another school's document.

#### Acceptance Criteria

1. WHEN the OCR_Extract_View receives a request, THE OCR_Extract_View SHALL authorize the target document through the Authorized_Document_Loader and SHALL complete that authorization before any OCR task is enqueued and before any document state is mutated.
2. IF the Authorized_Document_Loader returns an error response, THEN THE OCR_Extract_View SHALL return that response unchanged, with its original HTTP status and `{"success": false}` envelope, and SHALL NOT enqueue an OCR task or mutate any document state.
3. WHEN a School_Staff user requests extraction for a document outside their scope, THE OCR_Extract_View SHALL return an HTTP 404 response with a `{"success": false}` not-found envelope whose status code, error code, and message are byte-identical to the response returned when the document does not exist, so that document existence cannot be inferred.
4. WHEN a Super_Admin requests extraction for any document, THE OCR_Extract_View SHALL authorize the document and enqueue exactly one OCR task.
5. WHEN a student requests extraction for a document the student owns, THE OCR_Extract_View SHALL authorize the document and enqueue exactly one OCR task.
6. IF a student requests extraction for a document the student does not own, THEN THE OCR_Extract_View SHALL return the HTTP 404 `{"success": false}` not-found envelope defined in criterion 3.
7. WHEN the OCR_Extract_View successfully authorizes and enqueues an OCR task, THE OCR_Extract_View SHALL return an HTTP 2xx `{"success": true, "data": ...}` envelope containing a task or document reference by which the client can poll for OCR readiness.
8. THE OCR_Extract_View SHALL NOT grant access based on the `admin` role alone; scope SHALL be computed through the Access_Scope_Service path used by the Authorized_Document_Loader.

### Requirement 4: Official Document Deletion Protection

**User Story:** As a school, I want official generated documents protected from deletion by students and ordinary admins, so that institutional records remain intact and any privileged deletion is audited.

#### Acceptance Criteria

1. WHEN the Document_Delete_View processes a delete for a document with `system_generated=True` and the actor is not a Super_Admin, THE Document_Delete_View SHALL reject the request with HTTP 403, `success=false`, and code `OFFICIAL_DOCUMENT_IMMUTABLE`.
2. WHEN a student requests deletion of their own non-system-generated document, THE Document_Delete_View SHALL allow the soft-delete only while the application is in an editable status (e.g. `draft`) per the existing editability policy.
3. IF a School_Staff user requests deletion of a document outside their scope, THEN THE Document_Delete_View SHALL return the 404 not-found envelope from the Authorized_Document_Loader.
4. WHEN a Super_Admin soft-deletes any document, including a `system_generated=True` Official_Document, THE Document_Delete_View SHALL complete the soft-delete and SHALL write an Audit_Event recording actor, document ID, application ID, document type, `system_generated`, and institution ID.
5. THE Document_Delete_View SHALL retain the existing soft-delete behaviour (set `verification_status="deleted"`) for permitted deletions and SHALL NOT hard-delete document rows.
6. THE Audit_Event for a deletion SHALL NOT include the document body, full PII, or secrets.

### Requirement 5: Student-Safe Official Document Endpoints

**User Story:** As a student, I want to generate and download my official documents from the backend with status gating, so that the documents I receive are authoritative tenant-branded records rather than client-side renders.

#### Acceptance Criteria

1. THE system SHALL expose student-permitted endpoints to generate and retrieve Official_Documents for an application that return the `{"success": true, "data": ...}` envelope including `document_id`, `document_type`, `status` (`ready`, `queued`, or `failed`), optional `download_url`, `generated_at`, template/profile version, and institution ID.
2. WHEN a student requests an application-slip Official_Document for their own application, THE system SHALL permit generation/download only while the application is in a non-draft submitted state.
3. WHEN a student requests an acceptance-letter Official_Document for their own application, THE system SHALL permit generation/download only while the application is approved.
4. WHEN a student requests a conditional-offer Official_Document for their own application, THE system SHALL permit generation/download only while the application is conditionally approved.
5. WHEN a student requests a payment-receipt Official_Document for their own application, THE system SHALL permit generation/download only when a completed payment exists for that application.
6. WHEN a School_Staff user requests generation/download of an Official_Document, THE system SHALL permit it only for in-scope applications and SHALL otherwise return the 404 not-found envelope.
7. WHEN a Super_Admin requests generation/download of any Official_Document, THE system SHALL permit it.
8. IF a student requests an Official_Document they are not permitted to access, THEN THE system SHALL return the 404 not-found envelope without leaking the application's existence.
9. WHEN an Official_Document is generated asynchronously, THE response SHALL carry `status="queued"` with a task or document reference so the client can poll for readiness.

### Requirement 6: Official Document Current-Version and Fingerprint Lifecycle

**User Story:** As a school, I want repeated official-document requests to reuse the current version unless inputs change, so that clicking download repeatedly does not create unbounded duplicate records.

#### Acceptance Criteria

1. WHEN the Official_Document_Generator runs for an `(application, document_type)`, THE generator SHALL compute a Document_Fingerprint from application ID, document type, application status/updated_at, institution ID, template/profile ID+version, logo and signature asset ID+checksum, and payment/receipt identifiers for receipts.
2. WHEN the Current_Official_Version for the same `(application, document_type)` has a Document_Fingerprint equal to the newly computed fingerprint, THE generator SHALL return the existing Official_Document and SHALL NOT create a new `ApplicationDocument` row.
3. WHEN no Current_Official_Version exists or the computed Document_Fingerprint differs, THE generator SHALL produce a new Official_Document and SHALL store the Document_Fingerprint in `verification_notes.official_document`.
4. WHEN a new Official_Document supersedes a prior one for the same `(application, document_type)`, THE system SHALL designate exactly one Current_Official_Version and SHALL NOT alter or regenerate previously generated documents that retain different fingerprints.
5. WHEN the active template/profile version changes, THE generator SHALL produce a new Official_Document on the next request.
6. WHEN the active logo or signature Institution_Asset changes, THE generator SHALL produce a new Official_Document on the next request.
7. THE Current_Official_Version selection SHALL ignore documents with `verification_status="deleted"`.

### Requirement 7: Frontend Student Document Flow Uses Backend Official Documents

**User Story:** As a student, I want the download and email buttons in the app to use backend-stored official documents, so that what I receive matches the authoritative tenant record and never a client-only PDF.

#### Acceptance Criteria

1. THE student document components (`DocumentButtons`, `ApplicationSlipActions`, `DownloadReceiptButton`) SHALL request Official_Documents through a backend official-document service and SHALL NOT call Client_PDF_Generators for official downloads.
2. WHEN a student triggers an official document action, THE UI SHALL display `Queued`, `Generating`, `Ready`, and `Failed` states reflecting the backend generation status.
3. WHEN an Official_Document is `Ready`, THE download action SHALL retrieve the stored backend document via its authorized download URL or download endpoint.
4. WHEN a student uses an "email document" action, THE system SHALL email the backend-generated stored Official_Document and SHALL NOT email a locally generated blob.
5. THE student-facing official-document actions SHALL respect the current application status and payment state gates defined in Requirement 5.
6. WHERE Client_PDF_Generators remain in the codebase, THE generators SHALL be used only for dev previews or non-official draft previews and SHALL NOT be reachable from student official-download paths.
7. THE student document UI SHALL use canonical UI primitives, Lucide icons, WCAG AA contrast, and ≥44×44px touch targets, and SHALL NOT introduce purple gradients, gradient text, glassmorphism, nested cards, or emoji icons.

### Requirement 8: Tenant Document Profiles Replace Hard-Coded Frontend Content

**User Story:** As a Super_Admin operator, I want rich school-specific document content stored as backend tenant configuration, so that a new school can be onboarded without code changes.

#### Acceptance Criteria

1. THE system SHALL store rich school-specific document content as an Institution_Document_Profile in backend tenant configuration rather than in frontend code, comprising structured sections (maximum 30 sections, each text value up to 5,000 characters), a fee chart (maximum 50 rows), bank accounts (maximum 10), a requirements list (maximum 50 items), a signatory block, rules, and a version recorded as a monotonically increasing positive integer starting at 1.
2. THE Institution_Document_Profile SHALL support optional scoping to an offering, canonical program, and/or intake, and WHEN more than one active profile matches a given application and document type, THE system SHALL resolve deterministically by selecting the most specific match in the order offering+intake, then offering, then canonical-program+intake, then canonical program, then institution default.
3. WHEN the backend renders an acceptance-letter Official_Document, THE renderer SHALL build content solely from the resolved Institution_Document_Profile (letterhead, date/address block, reference line, body, commitment-fee block, bank-account block, fee chart, requirements list, notes, signatory/signature) and tenant assets, and SHALL NOT read content from frontend constants.
4. THE system SHALL provide seed data representing the existing MIHAS RN, KATC COG, and KATC EHT acceptance content as tenant data, sourced from a seed script or management command rather than from frontend constants.
5. WHEN a new Institution_Document_Profile version is created, THE system SHALL retain every prior version as a readable record and SHALL NOT alter, regenerate, or delete Official_Documents already generated from earlier versions.
6. THE Safe_Template_Policy SHALL govern document content: only validated structured-JSON sections containing tokens from the allowlisted token set, rendered by backend-controlled layouts, with every token value HTML-escaped before rendering.
7. THE system SHALL NOT execute or mail-merge arbitrary uploaded DOCX/PDF documents; uploaded originals SHALL be retained only as admin-reference source attachments.
8. THE admin template UI SHALL support choosing document type and optional applies-to offering/canonical-program/intake, choosing a layout, editing structured sections, editing fee-chart rows, editing bank accounts, editing the requirement list, editing signatory text, previewing with sample data, cloning the latest version, and activating/deactivating versions.
9. IF no active Institution_Document_Profile resolves for the application's institution and document type when an Official_Document is rendered, THEN THE renderer SHALL set the generation status to `failed`, SHALL record an error indicating that no document profile is configured for that institution and document type, and SHALL NOT produce an Official_Document from frontend content.
10. IF a submitted Institution_Document_Profile version contains a section that is not valid structured JSON or contains a token outside the allowlisted token set, THEN THE system SHALL reject the save with a descriptive validation error identifying the offending section or token and SHALL NOT persist the version.

### Requirement 9: Remove Public and Platform Brand Fallbacks

**User Story:** As the platform owner, I want generic platform surfaces to present Beanola rather than MIHAS/KATC, so that the shared platform identity is correct and unknown schools never inherit a default school identity.

#### Acceptance Criteria

1. THE public `apps/admissions/index.html` metadata and preloader SHALL present Beanola shared-platform defaults (title, description, OG site name, preloader brand/logo) and SHALL NOT hard-code MIHAS branding; school-specific branding SHALL be applied at React runtime.
2. WHEN a payment reference is generated, THE system SHALL use a Beanola-owned prefix (e.g. `BEANOLA-` or `BNL-`) and SHALL NOT use the `MIHAS-` prefix for new references.
3. WHEN an application number is generated for an assigned application, THE system SHALL use the assigned institution's code and SHALL NOT default to `MIHAS`.
4. IF an institution code is genuinely unavailable for a new flow, THEN THE system SHALL use a platform-level Beanola code or raise a configuration error rather than silently emitting a MIHAS-based number.
5. THE default communication subject, body, signature, and portal URL SHALL be Beanola or tenant-specific and SHALL NOT hard-code `MIHAS Admissions` or `https://apply.mihas.edu.zm`.
6. THE shared-portal tracker examples and email-component defaults SHALL use neutral Beanola/tenant-derived values and SHALL NOT present MIHAS/KATC as universal.
7. WHEN the frontend PDF theme encounters an unknown institution, THE theme SHALL return a Beanola-generic preview or raise an explicit error for official documents and SHALL NOT silently render MIHAS.
8. THE student `ApplicationDetail` display SHALL use the backend-provided institution name (`institution_name ?? institution ?? "Not provided"`) and SHALL NOT use a hard-coded MIHAS/KATC display mapping.
9. THE application-number validation SHALL NOT restrict valid institution prefixes to only `MIHAS` or `KATC`.

### Requirement 10: Brand Drift Guard

**User Story:** As a platform engineer, I want a brand drift guard with a small reviewed allowlist, so that MIHAS/KATC platform fallbacks cannot be reintroduced into generic flows without a failing test.

#### Acceptance Criteria

1. THE test suite SHALL include a guard that fails IF `MIHAS`, `KATC`, `Mukuba`, `Kalulushi`, or `apply.mihas.edu.zm` appear in non-allowlisted production source under `apps/admissions/src`, `apps/admissions/index.html`, or `backend/apps`.
2. THE Brand_Allowlist SHALL enumerate the files permitted to contain those strings (tenant seed fixtures, tests that create MIHAS/KATC institutions, historical docs/sample references, tenant logo assets) and SHALL be kept small and reviewed.
3. WHEN a string match occurs in a file not present in the Brand_Allowlist, THE guard SHALL fail and identify the offending file and line.
4. THE guard SHALL allow MIHAS/KATC strings inside allowlisted files without failing.

### Requirement 11: Admin Required-Document Validation

**User Story:** As a Super_Admin operator, I want required-document configuration validated against canonical relationships, so that bad tenant config cannot create cross-school leaks or duplicates.

#### Acceptance Criteria

1. WHEN a Required_Document is created, THE serializer SHALL verify that the referenced institution exists and is active.
2. WHERE a `program_id` is supplied, THE serializer SHALL verify the program exists, is active, and belongs to the referenced institution.
3. WHERE a `canonical_program_id` is supplied, THE serializer SHALL verify the canonical program exists and is active.
4. WHEN both `program_id` and `canonical_program_id` are supplied, THE serializer SHALL verify the program's `canonical_program_id` matches the supplied canonical program.
5. THE serializer SHALL reject a duplicate active Required_Document for the same `(institution, document_type, program_id, canonical_program_id)` scope.
6. IF any of these validations fail, THEN THE serializer SHALL return a descriptive validation error and SHALL NOT create the row.

### Requirement 12: Admin Access-Grant Validation

**User Story:** As a Super_Admin operator, I want access grants validated against their targets, so that a grant cannot reference an out-of-institution, inactive, expired, or duplicate target.

#### Acceptance Criteria

1. WHERE `scope_type` is `institution`, THE serializer SHALL require an `institution_id` that references an existing institution whose active flag is true, and IF `institution_id` is missing, references no institution, or references an institution whose active flag is false, THEN THE serializer SHALL reject the grant.
2. WHERE `scope_type` is `program_offering`, THE serializer SHALL require a `program_id` that references an existing program that is active and owned by a school (non-global) institution, and IF an `institution_id` is supplied THEN the referenced program SHALL belong to that institution.
3. WHERE `scope_type` is `application`, THE serializer SHALL require an `application_id` that references an existing application, and IF an `institution_id` or `program_id` is supplied THEN the application's institution and program-offering SHALL match the supplied value(s).
4. WHERE an `expires_at` is supplied, THE serializer SHALL require it to be strictly later than the current server time in UTC, and IF `expires_at` is equal to or earlier than the current server time in UTC THEN THE serializer SHALL reject the grant.
5. THE serializer SHALL accept only permission values present in the defined Access_Grant permission allowlist and SHALL reject any permission value not present in that allowlist.
6. THE serializer SHALL reject a new active Access_Grant whose `(user, scope_type, target id)` tuple matches an existing active Access_Grant, except when the operation updates that same existing row.
7. IF `scope_type` is missing or is not one of `institution`, `program_offering`, or `application`, THEN THE serializer SHALL reject the grant.
8. IF any validation in criteria 1–7 fails, THEN THE serializer SHALL return a validation error identifying the offending field and the reason for rejection, SHALL NOT create or modify any Access_Grant row, and SHALL leave existing Access_Grant data unchanged.

### Requirement 13: Manual Asset Registration and SVG Render Safety

**User Story:** As a Super_Admin operator, I want manual asset registration locked down and SVG render limits surfaced, so that asset rows cannot point at arbitrary unvalidated content and admins understand PDF compatibility.

#### Acceptance Criteria

1. THE generic asset-create path that accepts a caller-supplied `storage_key`, `public_url`, `mime_type`, and `checksum_sha256` SHALL be disabled for non-super-admin actors.
2. WHERE manual asset registration remains enabled, THE system SHALL restrict it to Super_Admin, SHALL require the `storage_key` to be under `institution-assets/{institution_id}/`, and SHALL validate the stored object's bytes and checksum rather than trusting the caller-provided checksum.
3. THE multipart upload endpoint SHALL remain the primary asset-creation path and SHALL continue to validate MIME and magic bytes and capture a SHA-256 checksum.
4. WHEN an admin selects or uploads an SVG asset intended for a logo or signature used in official PDFs, THE admin UI SHALL warn that SVG will not render in backend PDFs and SHALL prompt for a raster (PNG/JPEG/WebP) version.
5. WHEN the backend PDF renderer encounters an SVG asset it cannot render, THE renderer SHALL record an `unsupported` render status and SHALL NOT execute untrusted SVG content.

### Requirement 14: Tenant-Aware Communication Templates

**User Story:** As an operator, I want notifications and emails to resolve institution-specific content first, then Beanola platform content, then a safe Beanola default, so that messaging reflects the assigned school or the shared platform rather than a hard-coded MIHAS fallback.

#### Acceptance Criteria

1. WHEN the Communication_Service resolves a Communication_Template for an application's institution and template key, THE Communication_Service SHALL select, in priority order: the active institution-specific template with the highest version for that institution and key, then the active Beanola platform template with the highest version for that key, then the safe Beanola default.
2. THE `communication_templates` table SHALL store an institution association and an integer version (minimum value 1, incremented by 1 per new active revision), and SHALL provide an index supporting tenant-aware lookup by institution, template key, active flag, and version.
3. WHEN the Communication_Service builds template context, THE Communication_Service SHALL derive brand name, contact email, and portal URL from the resolved institution's settings, and SHALL NOT use the hard-coded value `https://apply.mihas.edu.zm`.
4. WHEN an active institution-specific template exists for a key, THE Communication_Service SHALL use it in preference to the active Beanola platform template for that key.
5. WHEN no active institution-specific template exists for a key, THE Communication_Service SHALL use the active Beanola platform template for that key, and WHEN no active template exists at all THE Communication_Service SHALL use the safe Beanola default, which contains only Beanola platform brand name, contact, and portal URL and no school-specific content.
6. WHERE School_Staff are permitted to manage templates, THE management surface SHALL expose and accept changes to templates only for institutions to which the acting School_Staff member is assigned.
7. WHEN communication content is resolved for an unknown or future school, THE resolved content SHALL NOT contain the MIHAS brand name, MIHAS-specific contact details, or the value `https://apply.mihas.edu.zm`.
8. IF the resolved institution's settings do not provide a brand name, contact email, or portal URL, THEN THE Communication_Service SHALL substitute the corresponding Beanola platform default value, SHALL NOT use the value `https://apply.mihas.edu.zm`, and SHALL still produce a complete message.
9. IF a School_Staff member attempts to view or modify a template for an institution to which they are not assigned, THEN THE management surface SHALL reject the request, SHALL return an authorization error indicating the institution is out of scope, and SHALL NOT create or modify any template.

### Requirement 15: Program-First Assignment Edge Cases

**User Story:** As a student, I want deterministic and capacity-correct school assignment with recoverable errors, so that I always get one correct school for my chosen canonical program and intake.

#### Acceptance Criteria

1. WHEN multiple Offerings serve the same Canonical_Program and Intake, THE Assignment_Service SHALL select deterministically by Program_Intake assignment priority, then Offering assignment priority (lower wins), then a stable tie-break on Offering code/id.
2. WHERE a white-label institution context is supplied, THE Assignment_Service SHALL restrict candidates to that institution.
3. WHEN a candidate Program_Intake has exhausted capacity, THE Assignment_Service SHALL exclude that candidate.
4. THE system SHALL define and document whether application creation reserves capacity or whether capacity is advisory until enrollment, and IF creation reserves capacity THEN it SHALL do so under a transaction/lock to prevent capacity races.
5. IF no eligible Offering exists, THEN THE Assignment_Service SHALL raise a stable `NO_ELIGIBLE_OFFERING` error and the API SHALL return a recoverable response with user-facing guidance.
6. WHEN assignment succeeds, THE system SHALL expose the assigned Offering's Required_Documents so the student upload UI reflects school/offering/canonical-program requirements, and missing required documents SHALL block submission per the assigned configuration.
7. WHEN the legacy string-create path (`program`, `intake`, `institution` strings) is used, THE system SHALL record a warning/metric for legacy-path usage while still functioning for backward compatibility.
8. WHEN an application number is generated after assignment, THE number SHALL use the assigned institution's code and SHALL NOT default to MIHAS for an unknown assigned institution.

### Requirement 16: Official Document Provenance and Audit

**User Story:** As an operator resolving a future dispute, I want each Official_Document to carry a full provenance snapshot and audit trail, so that I can identify exactly which school config, assets, and template version produced a PDF.

#### Acceptance Criteria

1. WHEN an Official_Document is generated, THE system SHALL store in `verification_notes.official_document` the document type, institution ID and name, canonical program ID, program offering ID, intake ID, application ID, student number where applicable, template/profile ID and version, logo/signature/seal asset IDs and checksums, payment ID and receipt number for receipts, per-asset render status, generated-by user ID and role where human-triggered, generated-at timestamp, and Document_Fingerprint.
2. WHEN an institution is later renamed, THE stored provenance snapshot SHALL remain unchanged and SHALL continue to reflect the values captured at generation time.
3. THE system SHALL write Audit_Events for official-document queued, generated, generation-failed-permanently, downloaded (admin or student), emailed, and for template/profile and asset create/update/activate/deactivate lifecycle actions.
4. THE Audit_Event payload SHALL exclude the rendered document body bytes, applicant personal identifiers (including NRC or passport number, full date of birth, phone number, email, and physical address), credentials, API keys, signing secrets, and bank account numbers, and SHALL include institution contact values only where those values are explicitly flagged for public display in the institution configuration.
5. IF an Official_Document render fails, THEN THE system SHALL leave any previously stored Official_Document for that application unchanged, SHALL record an Audit_Event identifying the failing stage or asset, and SHALL return to the triggering operator an error response that identifies the affected document and offers a retry action.
6. WHEN an Official_Document has failed to reach the Ready state after 3 generation attempts or has remained unfinished for more than 300 seconds after being queued, THE system SHALL mark it generation-failed-permanently and SHALL write the corresponding Audit_Event.

### Requirement 17: Student and Admin Document UI

**User Story:** As a student or operator, I want document actions in the UI to reflect backend truth with correct status gating and scope, so that no hidden client-only "official" PDFs exist.

#### Acceptance Criteria

1. THE student document UI SHALL show only the document actions allowed by the current application status and payment state.
2. THE student document UI SHALL show `Queued`, `Generating`, `Ready`, and `Failed` states, download stored official documents, and email stored official documents.
3. THE student document UI SHALL reference MIHAS/KATC only when the assigned school is actually MIHAS or KATC and SHALL NOT present them as platform defaults.
4. WHEN an operator triggers admin document generation, THE admin UI SHALL queue the backend Official_Document and then display its status, and SHALL allow viewing the latest Official_Documents per application.
5. THE admin tenant views SHALL be scoped: School_Staff SHALL see only in-scope tenant documents and config, and Super_Admin SHALL see the global tenant dashboard.
6. THE production student document components SHALL NOT use Client_PDF_Generators for official documents.
7. THE document UI SHALL use canonical UI primitives, Lucide icons, WCAG AA contrast, and ≥44×44px touch targets, and SHALL NOT introduce purple gradients, gradient text, glassmorphism, nested cards, or emoji icons.

### Requirement 18: Document-Flow and Scope Drift Guards

**User Story:** As a platform engineer, I want drift guards for document flow and access scope, so that future changes cannot reintroduce client-only official PDFs or admin-role-alone access without a failing test.

#### Acceptance Criteria

1. THE test suite SHALL include a guard that fails IF a non-test student-facing source module references the `@/lib/pdf` barrel or invokes `generateApplicationSlip`, `generateAcceptanceLetter`, or `generatePaymentReceipt` to produce an official, server-issued document for client-side download, where the guard reports the offending module and symbol on failure.
2. THE test suite SHALL include a guard that fails IF an official-document endpoint, given a request whose Document_Fingerprint equals that of an existing Official_Document, produces more than one persisted Official_Document record for that fingerprint instead of returning the existing record, where the guard reports the duplicated fingerprint on failure.
3. THE test suite SHALL include a guard that fails IF a code path authorizes read or write access to application, payment, or document data based on an admin role check alone, without obtaining the permitted scope from the Access_Scope_Service, for any role other than Super_Admin, where the guard reports the offending code path on failure.
4. THE test suite SHALL include a guard that fails IF a document-serving endpoint returns application, payment, or document records whose result set is not constrained by the Access_Scope_Service scope for the requesting role, where the guard reports the unscoped endpoint on failure.
5. WHEN the standard test command for the affected package executes, THE test suite SHALL run all four drift guards in criteria 1 through 4 and SHALL cause the test run to exit with a failing (non-zero) result if any guard's failure condition is met.

### Requirement 19: Documentation and Rollout Runbook Honesty

**User Story:** As a human operator, I want accurate, non-future-dated progress docs and a complete rollout runbook, so that I can deploy the multi-tenant schema safely without guessing.

#### Acceptance Criteria

1. THE progress and handover docs SHALL separate "code complete", "staging validated", and "production applied" states and SHALL NOT mark the work complete while migrations are not deployable, security holes remain open, or students still use client-side official documents.
2. THE progress docs SHALL use real, non-future-dated timestamps.
3. THE rollout runbook SHALL document the operator steps: back up the production DB, verify the migration-history prerequisite, run a dry run and confirm the Tenant_Migration appears, apply the migration in a maintenance window, run post-migration validation SQL, validate sample document generation for MIHAS and KATC, onboard a test future school on staging, validate school-staff scope, validate the student program-first flow, validate payment settlement metadata, monitor audit logs and errors, and follow an application-code rollback plan.
4. THE rollout runbook SHALL reflect the Neon-first then production workflow and SHALL NOT instruct applying production DB changes from the development environment.
5. WHERE a referenced migration path appears in docs, THE path SHALL match the Deployable_Migration_Path used by the Migration_Runner.

### Requirement 20: Backward Compatibility and Platform Guardrails

**User Story:** As a platform owner, I want the remediation to preserve every existing contract and guardrail, so that production data, auth, payments, and admissions flows keep working throughout the rollout.

#### Acceptance Criteria

1. THE remediation SHALL preserve all existing `/api/v1/...` routes such that every route resolvable before the remediation resolves to the same resource afterward, SHALL return the `{"success": true, "data": ...}` envelope on all API responses, and authenticated list endpoints SHALL return the envelope rather than a raw list.
2. WHERE an API response is paginated, THE remediation SHALL place `{page, pageSize, totalCount, results}` inside the `data` field of the envelope.
3. THE remediation SHALL NOT drop, overwrite, or repurpose the Legacy_String_Fields, and WHILE a legacy application has one or more null canonical IDs THE read paths SHALL return that application in read responses using its Legacy_String_Fields values without returning an error response.
4. THE remediation SHALL keep cookie-based auth, CSRF protection on all state-changing authenticated requests, and refresh-token rotation intact, SHALL issue access tokens that expire 30 minutes after issue and refresh tokens that expire 7 days after issue, and SHALL keep JTI blacklisting of rotated/revoked refresh tokens intact.
5. THE remediation SHALL preserve admissions auto-save, SHALL retain in-progress draft data across page refresh and reconnect so a reopened draft shows the last auto-saved field values, SHALL keep every interactive element on admissions and review surfaces at a touch target of at least 44×44 CSS pixels, and SHALL keep the Lenco mobile-money-first payment UX (mobile money as the primary method, card widget secondary, deferral allowed) without reintroducing the retired pre-Lenco payment UX.
6. THE remediation SHALL NOT write PII, secrets, resume/document contents, or raw phone numbers to logs or audit trails, and audit-trail entries SHALL contain no plaintext PII.
7. THE remediation SHALL keep the RBAC role hierarchy intact (`super_admin > admin > reviewer > student`) and SHALL NOT grant an admin cross-school access derived from role alone, returning an authorization-denied response when an admin requests data outside their assigned school.
8. WHEN backend code changes, THE remediation SHALL run backend `pytest`, `manage.py check`, and schema generation, and the change SHALL be treated as passing only when `pytest` completes with zero failures, `manage.py check` reports zero issues, and schema generation completes without errors.
9. WHEN admissions frontend code changes, THE remediation SHALL run `bun run type-check`, `bun run test`, `bun run lint`, and the build for the changed areas, and the change SHALL be treated as passing only when each command completes with zero errors.
10. WHERE a new domain concept or frontend mirror is added, THE concept SHALL be registered in `docs/canonical-truth-map.md` and a drift-guard test SHALL be added for it.
11. IF a new domain concept or frontend mirror is introduced without a corresponding `docs/canonical-truth-map.md` entry or without a drift-guard test, THEN THE remediation SHALL fail the verification gate and report which registration or test is missing.

### Requirement 21: Final Verification

**User Story:** As a quality engineer, I want a final verification pass over the whole remediation, so that the migration, isolation, document lifecycle, brand, and config invariants are confirmed before handoff.

#### Acceptance Criteria

1. THE final verification SHALL run backend `manage.py check` and the backend unit test suite, SHALL treat this step as passing only when `manage.py check` reports zero errors and the backend unit test suite reports zero failures and zero errors, and SHALL record each skipped check together with a written reason.
2. THE final verification SHALL run admissions `bun run type-check`, `bun run lint`, and `bun run test`, and SHALL treat this step as passing only when `bun run type-check` reports zero type errors, `bun run lint` reports zero lint errors, and `bun run test` reports zero test failures.
3. THE final verification SHALL run the targeted brand search and SHALL treat this step as passing only when every remaining MIHAS/KATC/legacy-domain hit is either listed in the documented brand allowlist or recorded with a written rationale that references the requirement permitting it.
4. THE final verification SHALL run the targeted document-generator search and SHALL treat this step as passing only when the search returns zero production student-path imports of Client_PDF_Generators for official documents.
5. THE final verification SHALL run the targeted scoped-access search and SHALL treat this step as passing only when the search returns zero non-super-admin paths that load applications, payments, or documents without the Access_Scope_Service.
6. THE final verification SHALL confirm the Definition of Done conditions and SHALL treat this step as passing only when all of the following hold: the Tenant_Migration is discoverable by the Migration_Runner, rollout docs are accurate and not future-dated, ordinary admins cannot act on out-of-scope records, student official downloads come from backend stored documents, official documents are deletion-protected, backend official documents render from tenant configuration, new schools onboard without code changes, unknown schools never fall back to MIHAS, and shared-portal branding is Beanola.
7. IF any verification step in criteria 1 through 6 does not pass, THEN THE final verification SHALL be recorded as failed, SHALL identify which step failed, and SHALL block handoff until the failure is resolved.
