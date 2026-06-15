# Document-Type Audit — Beanola Production Readiness (R6.1)

**Spec:** `.kiro/specs/beanola-production-readiness/` — Phase 6, Component 6, Task 13.1
**Validates:** Requirement 6.1
**Status:** Verification artifact (no code changes). Every claim below is grounded in the
named repo file/symbol; line-level reads were done against the working tree on the date of
this audit.

## Purpose and scope

This document is the per-document-type audit required by R6.1. For each official document
type it records:

1. **Backend generation path** — the Celery task + the renderer package that draws it.
2. **Profile resolution** — how `InstitutionDocumentProfileService` resolves a tenant profile.
3. **Required tenant assets** — logo / signature / seal participation.
4. **Required template tokens** — the allowlisted `{{token}}` set.
5. **Fingerprint inputs** — exactly what `_compute_document_fingerprint` hashes.
6. **Versioning** — how the Current_Official_Version is selected and superseded.
7. **Storage path** — the storage key layout and backend used.
8. **Download permission** — the authorization + gate path.
9. **Email-attachment behaviour** — whether/how the type is emailed.

R6.2–R6.9 (backend-only downloads, failure states, dedup, seeding, previews, provenance) are
covered by tasks 13.2–13.5; this document is the **inventory** they build on, and cross-links
them where relevant.

## Canonical sources of truth (grounding)

| Concern | Source of truth |
|---------|-----------------|
| Document type config (title/folder/name/status gate) | `DOCUMENT_CONFIG` in `backend/apps/applications/tasks/pdf_generation.py` |
| Generation tasks | `generate_*_task` shared-tasks in `pdf_generation.py` |
| Single generation engine | `_generate_official_document_task()` in `pdf_generation.py` |
| Fingerprint | `_compute_document_fingerprint()` in `pdf_generation.py` |
| Current version selection | `_current_official_version()` in `pdf_generation.py` |
| Staleness recheck | `official_document_matches_current_inputs()` in `pdf_generation.py` |
| Renderer dispatch | `render_official_document()` in `backend/apps/applications/tasks/pdf/renderers/__init__.py` |
| Render context + no-profile seam | `backend/apps/applications/tasks/pdf/render_context.py` |
| Provenance snapshot | `build_metadata()` in `backend/apps/applications/tasks/pdf/renderers/_common.py` |
| Profile resolution | `InstitutionDocumentProfileService.resolve()` in `backend/apps/catalog/services.py` |
| Template tokens allowlist | `ALLOWED_TEMPLATE_TOKENS` in `backend/apps/catalog/services.py` |
| Receipt eligibility | `RECEIPT_ELIGIBLE_STATUSES` in `backend/apps/documents/payment_constants.py` |
| Student/staff download endpoint | `backend/apps/applications/official_document_views.py` |
| Admin generation endpoints | `backend/apps/applications/document_views.py` |
| Profile seeding | `backend/apps/catalog/management/commands/seed_tenant_document_profiles.py` |

## Cross-cutting facts (true for every document type)

### Single generation engine
All five `generate_*_task` shared-tasks delegate to one private engine,
`_generate_official_document_task(task, application_id, document_type)`
(`pdf_generation.py`). The per-type tasks differ only by the `document_type` string they pass:

| Task | document_type |
|------|---------------|
| `generate_application_slip_task` | `application_slip` |
| `generate_acceptance_letter_task` | `acceptance_letter` |
| `generate_conditional_offer_task` | `conditional_offer` |
| `generate_finance_receipt_task` | `finance_receipt` |
| `generate_payment_receipt_task` | `payment_receipt` |

Each task is `@shared_task(bind=True, max_retries=3, default_retry_delay=60)`.

### Render-input gather → fingerprint → reuse-or-render
The engine flow is identical per type (`pdf_generation.py`):

1. Load `Application`; return early if missing.
2. Enforce `DOCUMENT_CONFIG[document_type]["status_required"]` if set (only `acceptance_letter`
   requires `approved`; all others are `None` at the task layer — see per-type rows).
3. For receipts, resolve `_latest_receipt_payment(application)`; skip if none.
4. `_gather_render_inputs(...)` resolves `(tenant, template, logo_asset, signature_asset)` and
   folds the resolved profile id+version into `template` via `_attach_profile_provenance`.
5. `_compute_document_fingerprint(...)` hashes the inputs **before** rendering.
6. `_current_official_version(...)` finds the latest non-deleted `system_generated`
   `ApplicationDocument` for `(application, document_type)`. If its stored fingerprint equals
   the new one → **reuse, no new row** (R6.6).
7. Otherwise render via `_render_official_pdf(...)` → `render_official_document(context, template)`,
   store the PDF, fold `fingerprint` into metadata, and create a new `ApplicationDocument`.

### Storage backend and key layout
`_render_official_pdf` returns `(buffer, metadata)`; the engine writes via
`apps.common.storage.MediaStorage` (Cloudflare R2 via `django-storages`). The storage key is:

```
{folder}/{application_id}/{uuid4().hex}.pdf
```

where `{folder}` comes from `DOCUMENT_CONFIG[document_type]["folder"]`. The persisted
`ApplicationDocument.file_url` is the permanent **unsigned** object URL; the bucket is private
(`AWS_DEFAULT_ACL = None`), so download URLs are **signed on read** by `_signed_download_url`
in `official_document_views.py` (default 15-minute expiry via `generate_signed_url`).

### Persisted record
Every generated document is an `ApplicationDocument` row with:
`system_generated=True`, `verification_status="verified"`, `mime_type="application/pdf"`,
`document_type=<type>`, and `verification_notes = json.dumps({"official_document": metadata})`.
The fingerprint lives at `verification_notes.official_document.fingerprint`.

### Fingerprint inputs (`_compute_document_fingerprint`)
A hex SHA-256 over canonical JSON (`sort_keys=True`) of:

- `application_id`
- `document_type`
- application `status` + `updated_at` (`_canonical_fingerprint_value`)
- `institution_id` (from tenant context)
- `brand`: `{name, primary_color, admissions_email, phone, website}`
- `template_id`, `template_version`
- `profile_id`, `profile_version` (folded in by `_attach_profile_provenance`)
- `logo_asset`: `{id, checksum_sha256}` (`_asset_fingerprint_parts`)
- `signature_asset`: `{id, checksum_sha256}`
- **receipts only** (`document_type in {"payment_receipt","finance_receipt"}`): `payment_id`,
  `receipt_number`

The function is pure (no DB/storage/network) — it reads only attributes already loaded on the
passed objects. The seal asset is **not** a fingerprint input; it participates only in the
provenance snapshot (`build_metadata`).

### Profile resolution (`InstitutionDocumentProfileService.resolve`)
Filters first by `(institution_id, document_type, is_active=True)`, then walks scopes
most-specific → least-specific, taking the highest active `version` within the winning level:

```
offering + intake → offering → canonical-program + intake → canonical program → institution default
```

Returns `None` when no active profile matches. **Profile-required types** are defined by
`PROFILE_REQUIRED_DOCUMENT_TYPES = {"acceptance_letter", "conditional_offer"}`
(`render_context.py`): for these, a `None` profile raises `DocumentProfileNotConfigured`
(`render_official_document`) → the task marks generation `failed` with
`DOCUMENT_PROFILE_NOT_CONFIGURED`, writes a non-PII audit row, and does **not** retry (R6.4).
The slip and receipts are **not** profile-required and keep default-body content when no
profile resolves.

### Template tokens (`ALLOWED_TEMPLATE_TOKENS`)
The single allowlist for both the template path (`DocumentTemplateService._render_value`) and
profile-section substitution (`_substitute_profile_tokens` in `_common.py`):

```
student_name, application_number, program, intake, institution,
receipt_number, amount, currency, date
```

Unknown tokens are left literal (inert), never executed. Config-time validation
(`validate_template_payload`) rejects non-allowlisted tokens with `TEMPLATE_TOKEN_REJECTED`.
`receipt_number`/`amount`/`currency` are only populated when a payment is in context.

### Versioning / supersede
There is no in-place mutation. The Current_Official_Version is purely a **row-selection rule**:
the latest non-deleted `system_generated` `ApplicationDocument` by `uploaded_at` desc
(`_current_official_version`, which `.exclude(verification_status="deleted")`). A changed
fingerprint inserts a newer row that wins the ordering; prior rows are never mutated or
deleted. Profile content versioning is INSERT-only too — `create_new_version` writes a new
`InstitutionDocumentProfile` row at `next_version_for_scope`, leaving prior versions readable
(this is what keeps a document generated from `profile_version=N` provenance valid).

### Staleness recheck before download
`official_document_matches_current_inputs(application, document_type, current)` recomputes the
fingerprint over today's inputs and compares it to the stored one. The student/staff endpoint
calls this before reporting `ready`; a mismatch returns `queued` and re-enqueues, so stale
branding/content is never served as `ready`.

### Download authorization (shared path)
`official_document_views._get_authorized_application` enforces:

- **Super_Admin** → global access (`is_super_admin`).
- **admin / reviewer** → scope **only** via `AccessScopeService().filter_applications(...)`;
  out-of-scope is masked as the byte-identical `_not_found_response()` 404 (never `role=="admin"`
  alone).
- **student / other** → owner check via `IsOwnerOrAdmin.has_object_permission`; non-owner is
  masked as 404.

Students additionally pass a per-type status/payment gate (`_student_gate_open`); a closed gate
returns the same masked 404 so existence cannot be inferred.

---

## Per-document-type rows

### 1. Application slip (`application_slip`)

| Field | Finding |
|-------|---------|
| Generation task | `generate_application_slip_task` → `_generate_official_document_task(..., "application_slip")` |
| Renderer | `application_slip.render` (`renderers/__init__.py`) |
| Status gate (task) | `status_required = None` — generated in any status |
| Profile-required? | **No.** Not in `PROFILE_REQUIRED_DOCUMENT_TYPES`; renders default-body content when no profile resolves |
| Profile resolution | `InstitutionDocumentProfileService.resolve(app, "application_slip")` (most-specific active scope) |
| Required tenant assets | Logo + signature optional (fingerprint inputs); seal optional (provenance only) |
| Template tokens | `student_name, application_number, program, intake, institution, date` (receipt tokens unused) |
| Fingerprint inputs | Standard set; **no** payment inputs |
| Versioning | Latest non-deleted `system_generated` slip by `uploaded_at`; fingerprint reuse |
| Storage path | `application-slips/{application_id}/{uuid}.pdf` |
| Download permission (student) | Gate `_student_gate_open`: status in `{submitted, under_review, waitlisted, conditionally_approved, approved}` (`_NON_DRAFT_SUBMITTED_STATUSES`) |
| Admin generation | `ApplicationSlipView` (`document_views.py`), `permission_classes=[IsAdmin]`, scoped via `_get_scoped_application`, no status precondition |
| Email-attachment | **Details emailed, not the PDF.** `EmailSlipView` (`POST /api/v1/applications/{id}/email-slip/`) queues an HTML email of slip *fields* (number, name, program, tracking code, status) via `queue_email` — **no PDF attachment**. Audited via `TenantAuditService`, recipient email/PII never logged (R16.4). |

### 2. Acceptance letter (`acceptance_letter`)

| Field | Finding |
|-------|---------|
| Generation task | `generate_acceptance_letter_task` → `_generate_official_document_task(..., "acceptance_letter")` |
| Renderer | `acceptance_letter.render` (fee-chart letter layout from profile data) |
| Status gate (task) | `status_required = "approved"` — task skips unless application is `approved` |
| Profile-required? | **Yes.** No active profile → `DocumentProfileNotConfigured` → `failed` + `DOCUMENT_PROFILE_NOT_CONFIGURED`, no document, no retry (R6.4) |
| Profile resolution | `resolve(app, "acceptance_letter")`. Seeded MIHAS RN / KATC COG / KATC EHT profiles are **offering-scoped** (`program_id` set, `canonical_program_id` NULL) |
| Required tenant assets | Logo + signature drive branding/signatory; seal in provenance |
| Template tokens | `student_name, program, intake, institution` used in seeded `sections.body`; full allowlist available |
| Fingerprint inputs | Standard set incl. `profile_id`+`profile_version` (a profile version bump regenerates); **no** payment inputs |
| Versioning | Latest non-deleted letter by `uploaded_at`; profile version bump changes fingerprint |
| Storage path | `acceptance-letters/{application_id}/{uuid}.pdf` |
| Download permission (student) | Gate: status == `approved` |
| Admin generation | `AcceptanceLetterView`, `[IsAdmin]`, requires `status == "approved"` (else `INVALID_STATUS` 400) |
| Email-attachment | No dedicated PDF-attachment email path. Acceptance notifications go through the email component system (`backend/apps/common/email/messages/acceptance.py`); the official letter is downloaded from the backend, not attached. |

### 3. Conditional offer (`conditional_offer`)

| Field | Finding |
|-------|---------|
| Generation task | `generate_conditional_offer_task` → `_generate_official_document_task(..., "conditional_offer")` |
| Renderer | `conditional_offer.render` |
| Status gate (task) | `status_required = None` at task layer; admin endpoint enforces a status precondition (below) |
| Profile-required? | **Yes.** Same no-profile failure path as the acceptance letter (R6.4) |
| Profile resolution | `resolve(app, "conditional_offer")` — most-specific active scope |
| Required tenant assets | Logo + signature; seal in provenance |
| Template tokens | Full allowlist; receipt tokens unused |
| Fingerprint inputs | Standard set incl. profile id/version; **no** payment inputs |
| Versioning | Latest non-deleted offer by `uploaded_at`; fingerprint reuse |
| Storage path | `conditional-offers/{application_id}/{uuid}.pdf` |
| Download permission (student) | Gate: status == `conditionally_approved` |
| Admin generation | `ConditionalOfferView`, `[IsAdmin]`, requires status in `{conditional, conditionally_approved, approved}` (else `INVALID_STATUS` 400) |
| Email-attachment | Conditional-acceptance notification via `backend/apps/common/email/messages/conditional_acceptance.py`; official offer downloaded from backend, not attached. |

> Note: the seed command currently seeds **acceptance_letter** profiles only
> (`DOCUMENT_TYPE = "acceptance_letter"`). A conditional_offer download for an institution
> without a seeded `conditional_offer` profile will correctly fail with
> `DOCUMENT_PROFILE_NOT_CONFIGURED` (R6.4). Seeding `conditional_offer` profiles for live
> tenants is a data-readiness item tracked under R12 (Phase 14), not a code gap.

### 4. Finance receipt (`finance_receipt`)

| Field | Finding |
|-------|---------|
| Generation task | `generate_finance_receipt_task` → `_generate_official_document_task(..., "finance_receipt")` |
| Renderer | `payment_receipt.render` (shared receipt renderer; mapped for both receipt types) |
| Status gate (task) | `status_required = None`; engine skips if `_latest_receipt_payment` is `None` |
| Profile-required? | **No.** Default-body receipt content when no profile resolves |
| Profile resolution | `resolve(app, "finance_receipt")` — optional |
| Required tenant assets | Logo + signature optional; seal in provenance |
| Template tokens | Adds `receipt_number, amount, currency` (populated from the receipt payment) |
| Fingerprint inputs | Standard set **plus** `payment_id` + `receipt_number` (receipt type) |
| Receipt payment selection | `_latest_receipt_payment`: latest `Payment` in `RECEIPT_ELIGIBLE_STATUSES` (`successful`, `force_approved`) by `-verified_at, -created_at` |
| Versioning | Latest non-deleted finance receipt; new eligible payment changes fingerprint → new version |
| Storage path | `finance-receipts/{application_id}/{uuid}.pdf` |
| Download permission (student) | `_student_gate_open` returns **`False`** for `finance_receipt` — students cannot pull this type via the official endpoint (staff/super-admin only via scope) |
| Admin generation | `FinanceReceiptView`, `[IsAdmin]`, requires a completed payment (`COMPLETED_PAYMENT_STATUSES`) else `PAYMENT_REQUIRED` 400 |
| Email-attachment | No PDF-attachment email path; payment notifications via `backend/apps/common/email/messages/payment_received.py`. |

### 5. Payment receipt (`payment_receipt`)

| Field | Finding |
|-------|---------|
| Generation task | `generate_payment_receipt_task` → `_generate_official_document_task(..., "payment_receipt")` |
| Renderer | `payment_receipt.render` |
| Status gate (task) | `status_required = None`; engine skips if `_latest_receipt_payment` is `None` |
| Profile-required? | **No.** Default-body receipt content when no profile resolves |
| Profile resolution | `resolve(app, "payment_receipt")` — optional |
| Required tenant assets | Logo + signature optional; seal in provenance |
| Template tokens | Adds `receipt_number, amount, currency` |
| Fingerprint inputs | Standard set **plus** `payment_id` + `receipt_number` (receipt type) |
| Receipt payment selection | `_latest_receipt_payment` (same as finance receipt) |
| Versioning | Latest non-deleted payment receipt; new eligible payment changes fingerprint → new version |
| Storage path | `payment-receipts/{application_id}/{uuid}.pdf` |
| Download permission (student) | Gate: a completed payment exists (`_has_completed_payment`, `RECEIPT_ELIGIBLE_STATUSES`) |
| Admin generation | `PaymentReceiptView`, `[IsAdmin]`, requires completed payment else `PAYMENT_REQUIRED` 400 |
| Email-attachment | No PDF-attachment email path; payment-received notification via the email component system. |

### 6. Future enrollment / registration document

No `enrollment` or `registration` document type exists in `DOCUMENT_CONFIG`, the renderer map,
or `_DOCUMENT_TASK_NAMES` yet. To add one safely the future change must, per the patterns above:

1. Add a `DOCUMENT_CONFIG` entry (title/folder/name/`status_required`).
2. Add a `generate_*_task` shared-task delegating to `_generate_official_document_task`.
3. Register a renderer in `renderers/__init__.py::_RENDERERS`.
4. Decide profile-required-ness in `PROFILE_REQUIRED_DOCUMENT_TYPES` (a registration/enrollment
   letter built from tenant profile content should be profile-required, mirroring the
   acceptance letter).
5. Add it to `official_document_views._DOCUMENT_TASK_NAMES` and `_student_gate_open` with the
   correct status gate (likely `enrolled`).
6. If it carries payment data, add it to `_RECEIPT_DOCUMENT_TYPES` so payment inputs join the
   fingerprint.

No fingerprint/versioning/storage/permission scaffolding needs to change — the engine is
type-generic.

## Findings summary

- **No gaps in the generation engine.** All five types share one fingerprint/version/storage
  lifecycle; receipts correctly extend the fingerprint with `payment_id`+`receipt_number`,
  non-receipts correctly ignore payment inputs.
- **Profile-required failure is correct (R6.4 preview).** Acceptance letter and conditional
  offer hard-fail with `DOCUMENT_PROFILE_NOT_CONFIGURED` and no document when no profile
  resolves; slip/receipts retain default-body content by design.
- **Downloads are backend-stored, signed-on-read, and 404-masked** for out-of-scope/non-owner
  callers (R6.2 / R5 preview).
- **`finance_receipt` is staff-only** at the student endpoint (`_student_gate_open` → `False`),
  while `payment_receipt` is student-downloadable once a completed payment exists. This is an
  intentional split, recorded here so it is not mistaken for a gap.
- **Email behaviour:** only the **application slip** has a dedicated email path, and it emails
  HTML *details* (no PDF attachment). All other official documents are download-only; their
  notifications go through the `backend/apps/common/email/` component system without attaching
  the official PDF.
- **Seeding caveat (data-readiness, not code):** `seed_tenant_document_profiles` seeds
  `acceptance_letter` profiles only. Conditional-offer profiles for live tenants are an R12
  data-readiness item; their absence produces the correct visible failure, not a silent
  fallback.

## Follow-on tasks (not in scope of 13.1)

- **13.2** — confirm backend-only official downloads + `documentFlowDriftGuard.test.ts` (R6.2/6.3).
- **13.3** — failure states, dedup, seeding-on-staging, previews, provenance (R6.4–R6.9).
- **13.4 / 13.5** — Properties 29 and 32 (no client PDF on official paths; failed generation
  never serves stale/client PDF).

---

## Task 13.3 — Failure states, dedup, seeding, previews, provenance (R6.4–R6.9)

**Validates:** Requirements 6.4, 6.5, 6.6, 6.7, 6.8, 6.9. Verification artifact (no code
changes required — every item below was confirmed against the working tree). Dedup guard
`backend/tests/unit/test_official_document_dedup_guard.py` **passes (4 passed)**.

### R6.4 — No-profile path fails visibly, produces no frontend-content document

**PASS.** For a profile-required type (`acceptance_letter`, `conditional_offer` —
`PROFILE_REQUIRED_DOCUMENT_TYPES` in `pdf/render_context.py`) with no active
`InstitutionDocumentProfile`, `render_official_document()`
(`pdf/renderers/__init__.py`) raises `DocumentProfileNotConfigured` **before any render**.
`_generate_official_document_task` (`pdf_generation.py`) catches it, logs a warning, calls
`_audit_profile_not_configured()` (writes a non-PII `AuditLog` row,
`action="official_document_render_failed"`, `error_code="DOCUMENT_PROFILE_NOT_CONFIGURED"`,
`status="failed"`, `retried=False`), and **returns without creating any `ApplicationDocument`**
— no document is produced from frontend/default content, and the task does **not** retry (a
missing profile will not self-heal). The stable code `DOCUMENT_PROFILE_NOT_CONFIGURED` is the
module constant in `render_context.py`.

### R6.5 — Missing asset / invalid token / invalid MIME / storage failure / render failure never serve stale or client PDFs

**PASS.** All five failure vectors surface a failure state and never fall back to a stale or
client render:

- **Missing logo/signature** — `_active_asset()` returns `None`; `_asset_fingerprint_parts()`
  collapses to a null pair and `_draw_asset()` returns `"none"`. The document still renders
  from the backend profile; nothing client-side is substituted.
- **Invalid template token** — config-time `validate_template_payload` rejects non-allowlisted
  tokens (`TEMPLATE_TOKEN_REJECTED`); at render time unknown `{{tokens}}` are left literal
  (inert) via the `ALLOWED_TEMPLATE_TOKENS` allowlist. No execution path.
- **Invalid asset MIME / magic bytes** — upload-time `AdminTenantAssetSerializer.validate_mime_type`
  + `validate_asset_magic_bytes` + `_validate_stored_asset_object` reject with stable
  `ASSET_INVALID` (400), so an invalid asset never reaches the generator.
- **SVG handling** — `_draw_asset()` treats `image/svg+xml` as `"unsupported"`, never parses or
  rasterises untrusted SVG, and records the omission in the provenance snapshot.
- **Storage / render failure** — any exception in the render/store block is caught by the
  generic `except Exception` handler: it retries with backoff up to `max_retries`, and on
  permanent failure calls `_audit_render_failure()` (non-PII `AuditLog`, only the exception
  **class name**, never the message/body) and returns **without creating a document**. Prior
  Official_Documents are never mutated. The student/staff download endpoint additionally calls
  `official_document_matches_current_inputs()` before reporting `ready`, so a stale fingerprint
  re-enqueues regeneration rather than serving stale branding.

### R6.6 — Repeated unchanged generation reuses Current_Official_Version by fingerprint, no duplicates

**PASS.** `_generate_official_document_task` computes `_compute_document_fingerprint(...)` over
the resolved inputs **before** rendering, then looks up `_current_official_version(...)` (latest
non-deleted `system_generated` `ApplicationDocument` by `uploaded_at` desc). If the stored
fingerprint equals the new one it logs "reuse current version" and **returns with no new row**.
Confirmed by the dedup guard: `test_unchanged_fingerprint_produces_no_duplicate_record` (exactly
one persisted record for an unchanged fingerprint) and the non-triviality companion
`test_changed_fingerprint_creates_second_version` (a perturbed `updated_at` input does create a
second, distinct version). **Test run: 4 passed in ~0.95s.**

### R6.7 — MIHAS/KATC profiles seeded from a backend command; Beanola demo profile only on staging

**PASS (with observation).** MIHAS RN / KATC COG / KATC EHT acceptance-letter profiles seed from
`backend/apps/catalog/management/commands/seed_tenant_document_profiles.py` (idempotent
`update_or_create`, every payload validated through `validate_profile_payload` before any DB
write, `--dry-run` supported). The dev seed `backend/scripts/seed_tenant_dev_data.py` invokes the
same command. **No Beanola demo/test institution profile exists in any production-reachable seed
path** — the binding constraint (a demo profile must not leak into production) holds by absence.
*Observation:* there is no dedicated staging-only demo-profile seed command; provisioning demo
tenant data on staging is a data-readiness/staging-ops item (consistent with how 13.1 records
`conditional_offer` profile seeding as an R12 item), not a production-readiness code gap. No code
fix required for R6.7.

### R6.8 — Previews use sample data and are labelled; official generation uses the persisted profile

**PASS.** The admin document-profile preview (`apps/admissions/src/pages/admin/tenants/ProfilesPanel.tsx`)
renders `{{token}}` substitution via `renderProfilePreview()` with **sample values** (unknown
tokens render inert) and is explicitly labelled "Preview · {document_type} v{version}" with an
`Eye` icon. The dev-only PDF previews (`pages/dev/DocumentPreview.tsx`,
`AcceptanceLetterPreview.tsx`) use hard-coded sample applicants, are labelled "(dev only)", and
are route-guarded by `import.meta.env.DEV` (tree-shaken from production). Official generation runs
server-side through `_render_official_pdf` against the persisted `InstitutionDocumentProfile` —
never the preview path.

### R6.9 — Provenance includes institution, profile id+version, asset ids, and fingerprint; no bodies/PII/secrets in audit trails

**PASS.** `build_metadata()` (`pdf/renderers/_common.py`) records institution id + name,
canonical IDs, `profile_id` + `profile_version`, logo/signature/seal asset ids + checksums,
render statuses, generated-by actor (or `None` for system renders), and `generated_at`; the
generator folds `fingerprint` into this metadata and stores it at
`verification_notes.official_document`. The snapshot is **identifier-only** — no applicant PII and
no document bytes. Both audit writers (`_audit_render_failure`, `_audit_profile_not_configured`)
store only document type, institution id, stable error code/error class name, and flags — never
the exception message (which can carry the institution name), template text, or document content
— honouring the platform no-PII/secrets/bodies rule.

### Summary

All six acceptance criteria (R6.4–R6.9) are satisfied by the current tree; the dedup guard
passes. **No additive gap fixes were required.** One non-blocking observation: there is no
dedicated staging-only Beanola demo-profile seed (R6.7) — the production-safety half of R6.7
holds by absence; provisioning staging demo data is a data-readiness item.
