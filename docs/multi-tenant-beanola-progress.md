# Multi-Tenant Beanola Admissions Progress

Last updated: 2026-06-09
Handoff date: 2026-06-09

## Current Status

This tracker covers two specs that share these docs: the foundation spec
(`.kiro/specs/multi-tenant-beanola-admissions/`) and the remediation spec
(`.kiro/specs/multi-tenant-beanola-remediation/`). State is reported against
three **distinct** stages so "done in code" is never confused with "live in
production":

| Stage | Meaning | Where proven |
|-------|---------|--------------|
| **Code complete** | The implementation and its tests exist in the repo and pass locally. | `pytest`, `bun run test/type-check/lint/build`, `manage.py check` |
| **Staging / Neon validated** | The additive schema is applied and proven (apply + idempotent re-apply + backfill + FK validation) on a Neon branch. | Neon branch `br-tiny-bonus-ahz81bof` |
| **Production applied** | The schema is applied to the production EC2 Postgres (`mihas-postgres-1`). | **NOT DONE — gated operator step** |

### Work-item state matrix

| Work item | Code complete | Neon validated | Production applied |
|-----------|:---:|:---:|:---:|
| Migrations deployable (relocated to `backend/scripts/2026_06_08_0X_*.sql`, discovered by `apply_sql_migrations`) | ✅ | ✅ | ⛔ pending operator |
| Cross-tenant security holes closed (OCR extract scope, official-doc deletion protection, out-of-scope = 404) | ✅ | ✅ (schema-level) | ⛔ pending operator |
| Official documents consolidated to the backend (students fetch backend-stored official docs; no client-side official PDFs) | ✅ | n/a (code path) | ⛔ pending operator |
| Tenant document profiles replace hard-coded frontend content | ✅ | ✅ | ⛔ pending operator |
| Brand fallbacks removed (`BNL-` payment prefix, institution-coded application numbers, Beanola defaults) | ✅ | n/a (code path) | ⛔ pending operator |
| Admin config validation, tenant-aware comms, assignment edge cases, provenance/audit, document UI, drift guards | ✅ | ✅ where schema-backed | ⛔ pending operator |

**Production is NOT yet applied.** Per the infrastructure steering ("author on
Neon, then copy to production; never make production the first place a change
lands"), applying the additive multi-tenant schema to the production EC2
Postgres is a manual, backup-gated, maintenance-window operation gated on
explicit operator confirmation. It is the remediation spec's **Phase 12 task
43.2** (the rollout runbook), never an automatic task in this environment.

Because production application and the final rollout sign-off are non-optional
and not yet done, `.config.kiro` for both specs is **deliberately left without
`"status": "completed"`** — the completion condition ("only when all
non-optional tasks are done") is not met. The marker should be set by whoever
completes the production rollout. Migrations are deployable, the cross-tenant
security holes are closed, and students do use the backend official-document
flow, so those items are honestly marked code-complete and (where schema-backed)
Neon-validated — but each remains **production-applied: pending**.

## Done

- Added additive SQL migration `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql` (relocated from the runner-excluded `scripts/migrations/` directory to the top-level deployable path so `apply_sql_migrations` applies it at startup).
- Added shared `canonical_programs` and kept `programs` as school-specific offerings.
- Added nullable application IDs for assigned institution, canonical program, program offering, and intake while preserving legacy string snapshots.
- Added model mappings for institution assets, document templates, required documents, domains, user institution memberships, and access grants.
- Added backend services:
  - `OfferingAssignmentService`
  - `InstitutionContextService`
  - `AccessScopeService`
  - `DocumentTemplateService`
- Added public canonical program catalog endpoint: `/api/v1/catalog/canonical-programs/`.
- Updated application create flow to accept `program_id` and `intake_id`, assign a school/offering, persist new IDs, resolve fee from the assigned offering, and return the assigned school.
- Updated duplicate checks to use canonical program + intake when ID fields are present.
- Scoped the main admin application list and review retrieval path for non-super-admin users.
- Updated the student wizard to load canonical programs, send IDs, and show assigned school before payment.
- Added backend admin tenant onboarding endpoints under `/api/v1/admin/`:
  - `institutions/`
  - `institutions/<id>/domains/`
  - `institutions/<id>/assets/`
  - `institutions/<id>/templates/`
  - `institutions/<id>/required-documents/`
  - `memberships/`
  - `access-grants/`
- Added admin tenant serializers with slug/code/domain collision checks and basic template/document/grant validation.
- Applied tenant scoping to application exports for regular admins.
- Applied tenant scoping to payment list, receipt, and verify paths for regular admins.
- Applied tenant scoping to document retrieval/download/delete authorization and admin document upload authorization.
- Added tenant payment metadata snapshots to newly created payment rows:
  - Beanola collector marker
  - institution ID/code/name
  - canonical program ID/name
  - program offering ID/code
  - intake ID/name
- Added tenant fields to payment receipt responses.
- Added scoped settlement grouping endpoint: `/api/v1/payments/settlements/`.
- Added frontend tenant onboarding service wrappers in `apps/admissions/src/services/admin/tenants.ts`.
- Added admin Tenant Onboarding page at `/admin/tenants`.
- Wired tenant onboarding into admin route config and desktop/mobile navigation.
- Expanded the tenant onboarding frontend with create/list controls for:
  - versioned asset records
  - official document templates
  - required documents
  - staff memberships
  - scoped access grants
- Added institution filtering to the admin access grants API so tenant pages can show school-specific grants without exposing unrelated grants.
- Added backend detail `PATCH` endpoints for tenant child resources:
  - domains
  - assets
  - document templates
  - required documents
  - memberships
  - access grants
- Added frontend tenant service update helpers and deactivate actions for tenant child resources.
- Added validated tenant asset upload:
  - super-admin multipart upload endpoint for logos/signatures/seals
  - PNG/JPEG/WebP/SVG MIME and magic-byte validation
  - SHA-256 checksum capture
  - versioned R2/S3-backed `institution_assets` rows
  - frontend file upload control on tenant onboarding
- Replaced the legacy hard-coded acceptance/finance PDF task renderer with tenant-aware official document rendering for:
  - application slip
  - acceptance letter
  - conditional offer
  - finance receipt
  - payment receipt
- Official generated PDFs now snapshot assigned-school metadata, template ID/version, and active logo/signature asset IDs into `verification_notes`.
- Task 23.1 — expanded the admin Tenant Onboarding page (`apps/admissions/src/pages/admin/Tenants.tsx`) to the full IA and resolved its two pre-existing restricted-import lint errors (`@/components/ui/card`, `@/components/ui/badge` → canonical `SectionCard`/`StatusBadge`/`MetricTile` barrel primitives):
  - Tabbed IA: domains, offerings & assignment rules, required documents, templates, assets, staff access, settlement, audit.
  - Institution create/list/edit and deactivate/reactivate, with backend collision messages (slug/code/hostname) surfaced via `tenantErrorMessage`.
  - Structured rule builders replace raw JSON entry: per-offering assignment priority + offering status, and allow/deny country chip lists (`TokenChips`) persisted to `programs.assignment_rules` through the existing admin program PATCH endpoint.
  - Asset upload success/failure states (validated multipart upload + manual-registration fallback) with explicit inline status banner.
  - Document templates gain version diff (side-by-side), clone-into-editor, allowlisted-token insertion, and a sample-data official-document preview.
  - Tenant-scoped settlement summary panel (reads `/payments/settlements/`, groups by offering/currency, "Unassigned" safe) and a configuration-audit panel (scoped `institutions` audit log).
  - New frontend service reads: `listOfferings`, `getOffering`, `updateOfferingRules`, `listSettlements` in `services/admin/tenants.ts`.
  - New tests: `apps/admissions/tests/unit/tenantOnboarding.test.tsx` (collision surfacing + structured rule builder add/de-dupe/remove). Verified `bun run type-check`, `bun run lint` (clean), affected `bun run test`, and `impeccable detect` (no P0) for the changed areas.
- Task 23.2 — "Test routing" simulator wired end-to-end (R11.3):
  - Backend was already complete from the 23.1 wave: super-admin-only `POST /api/v1/admin/routing/simulate/` (`AdminRoutingSimulateView` in `backend/apps/catalog/admin_views.py`) *reuses* `OfferingAssignmentService().assign(...)` directly — it never reimplements routing, so the simulator result matches the real service exactly for the same inputs. Inputs: canonical `program_id` + `intake_id`, optional `country`/`nationality`, optional white-label `institution_id`. Returns the `{"success": true, "data": ...}` envelope with either the assigned offering/institution/decision factors/required-documents (`assigned: true`) or a recoverable `assigned: false` + `NO_ELIGIBLE_OFFERING` detail (never a 500 dead-end). Backed by `backend/tests/unit/test_routing_simulate.py` (7 tests, simulator==service for matched inputs, white-label filter parity, recoverable failure, blocked residency, super-admin-only).
  - Frontend: added `simulateRouting` + `RoutingSimulationResult`/`RoutingSimulationInput` types to `services/admin/tenants.ts`, and a new "Test routing" tab/panel (`apps/admissions/src/pages/admin/tenants/RoutingSimulatorPanel.tsx`) in the admin Tenants page. Canonical-program + intake dropdowns, optional country/nationality, and an opt-in "Restrict to {school}" white-label filter; renders the routed school/offering/decision factors/required documents on success and the recoverable `NO_ELIGIBLE_OFFERING` guidance on failure. Canonical primitives only (`SectionCard`, `Button`, `Input`, `StatusBadge`, `ErrorDisplay`), Lucide icons, ≥44px targets, status colour always paired with icon+label.
  - New test: `apps/admissions/tests/unit/routingSimulatorPanel.test.tsx` (3 tests — posts selected inputs to the simulate endpoint + renders routed school, forwards the institution filter when restricted, renders recoverable failure). Verified `bun run type-check`, `bun run lint` (clean), the new frontend test (3/3) and backend `test_routing_simulate.py` (7/7), `manage.py check` (no issues), and `manage.py spectacular` (generates; 4 pre-existing unrelated catalog errors/1 warning only).
- Added admin application routes/actions for application slip, conditional offer, and payment receipt generation.
- Added public catalog runtime context endpoint `/api/v1/catalog/context/` for shared Beanola vs white-label school resolution.
- Canonical program catalog now automatically filters to the resolved white-label institution when a school domain is used.
- Frontend catalog loading now resolves runtime context and filters program-first choices by the white-label institution when present.
- Updated default SEO site metadata to Beanola Admissions and added a Beanola fallback logo asset.
- Updated the student application wizard to use runtime Beanola/school brand text in metadata and page copy.
- Removed a hard-coded MIHAS/KATC institution-code fallback from wizard snapshot utilities.
- Replaced old MIHAS/KATC visible copy in shared frontend chrome, account pages, student secondary pages, admin page titles, landing metadata/copy, export metadata, communication defaults, and frontend PDF preview metadata with Beanola defaults.
- Reconciled legacy test contracts with the multi-tenant implementation:
  - test-settings-only admin scope compatibility for old unit fixtures without tenant memberships
  - finance receipt generation can still render without a matched payment, while payment receipts remain payment-gated
  - string-only duplicate checks preserve the previous keyword filter shape when new canonical IDs are absent
  - OpenAPI tenant admin routes now carry the existing `admin` tag policy
  - APIView auth classification includes the new tenant, catalog context, official document, and settlement views
  - frontend verification tests now assert Beanola public copy instead of MIHAS/KATC copy
- Extended tenant scoping to admin dashboard aggregates, recent dashboard activity, dashboard needs-attention counts, and admin user listing for regular admins.
- Restored payment receipt and payment verification lookup compatibility while preserving tenant-scope authorization after the payment is loaded.
- Added `docs/multi-tenant-beanola-handover.md` for the next advanced AI/engineer, covering:
  - repo verification rules and anti-hallucination protocol
  - database migration plan and validation SQL
  - canonical-only architecture standard
  - backend/API/frontend implementation map
  - detailed UI/UX and copy plan
  - edge-case checklist and follow-up test plan
- Verified:
  - backend Python compile for touched files
  - Django system check with test settings
  - SQL additive lint unit tests
  - admissions frontend TypeScript check
  - full admissions frontend unit suite: 371 files passed, 2946 tests passed, 1 skipped
  - full backend unit suite: 1404 passed, 86 skipped, 2 xfailed, 1 xpassed
  - `git diff --check`

## Done (Phase 2–4 correctness/isolation hardening)

- P2 (assignment ordering): `OfferingAssignmentService.assign` now sorts by the full design tuple `(program_intake.assignment_priority, offering.assignment_priority, offering.code, offering.id)`; offering priority is a distinct secondary key (no longer coalesced).
- P9 (cross-tenant isolation): out-of-scope reads are now indistinguishable from not-found across the leaking detail endpoints —
  - `ApplicationDetailView._get_application` scopes admin reads via `AccessScopeService` (was `IsOwnerOrAdmin` only, leaked full PII at 200) and returns 404 NOT_FOUND when out of scope;
  - `PaymentReceiptView` + `PaymentVerifyView` mask the admin scope miss as the identical 404 NOT_FOUND envelope (was 403);
  - `_get_authorized_document` (document info/signed-url/download/delete) returns 404 NOT_FOUND on the admin scope miss (was 403).
- P11 (duplicate canonicality): `DuplicateChecker.check_at_create`/`check_at_submit` now use canonical-only keying when canonical IDs are present (dropped the legacy-string `OR`), preserving the legacy string-keyword shape only when an id is absent.
- P10 (hostname collision): `InstitutionContextService.resolve` fails safe to the shared Beanola portal and logs/sentry-reports `domain.collision` when more than one active domain across distinct active institutions matches a hostname case-insensitively (was silent `.first()` pick).
- P13 (official-document token injection): `DocumentTemplateService.render` now does a single non-recursive, allowlist-bounded regex substitution — only `tokens`-listed `{{token}}` placeholders are replaced (HTML-escaped), substituted output is never re-scanned (no second-order injection), and non-allow-listed tokens stay inert.
- Added real Phase 4 test coverage (replacing Phase 0 skip placeholders): official-document provenance snapshot + token allowlist/escaping + SVG-skip + asset MIME/magic-byte per allowed type; payment settlement collector-marker on every initiation path, snapshot-survives-rename, scoped grouping, and "Unassigned" bucket safety.
- Fixed a pre-existing canonical-ID foundation inconsistency: removed the four backend-controlled canonical IDs from `DRAFT_SAFE_FIELDS` (they are declared `read_only=True`; listing them as client-writable failed two PATCH-field-guard property tests).
- Verified: 46 divergence-property tests pass as hard passes (0 xfail/xpass); 62 canonicalization/duplicate-semantics tests pass; 577 application/payment/document/scope unit tests pass with no regressions.

## Done (Phase 1 — task 3.1: migration-history prerequisite confirmed)

- Confirmed the `Migration_History_Prerequisite` (`2026_05_22_migration_history_extend.sql`) is **applied** on the project's Neon main branch (`wild-bar-37055823`), so `apply_sql_migrations --dry-run` will run (it raises `MIGRATION_HISTORY_NOT_EXTENDED` only when `migration_history.checksum` is missing). Verified via Neon read-only introspection:
  - `migration_history` carries the `checksum` and `notes` columns.
  - The `uq_migration_history_migration_name` unique index exists (the `ON CONFLICT (migration_name)` target the runner relies on).
  - `migration_history` contains a row for `2026_05_22_migration_history_extend.sql`.
  - `0001_multi_tenant_beanola_admissions.sql` is **not** yet recorded — correct: the tenant migration is applied on a staging Neon branch first (task 3.2), never directly on main here.
- Gate satisfied → Phase 1 may proceed to task 3.2 (branch → backup → dry-run → apply) on an isolated Neon branch. No production schema was mutated by this confirmation (read-only queries only).

## Done (Phase 1 — task 3.2: applied + validated on a staging Neon branch)

- Created an isolated Neon staging branch from `main` and applied the tenant migration there — production `main` was never touched (Neon copy-on-write branch is the backup/isolation mechanism):
  - Project: `wild-bar-37055823` (`mihasApplication`).
  - Parent (main): `br-floral-scene-aha2ybfd`.
  - **Staging branch: `br-tiny-bonus-ahz81bof`** (`staging-multitenant-beanola-0001`).
- Dry-run equivalence: the prerequisite `migration_history.checksum` column is present (so `apply_sql_migrations` would not abort with `MIGRATION_HISTORY_NOT_EXTENDED`), `0001_multi_tenant_beanola_admissions.sql` was not yet in `migration_history` (pending), and the script passes the additive-only lint (only `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `INSERT … ON CONFLICT` / `UPDATE` / `CREATE INDEX IF NOT EXISTS` / `ADD CONSTRAINT … NOT VALID` — no `DROP`/`TRUNCATE`/`DELETE FROM`).
- Pre-migration baseline on the branch: 33 applications, 2 institutions, 4 programs, 3 intakes; no `canonical_programs` table; tenant migration unrecorded.
- Applied the full `0001_multi_tenant_beanola_admissions.sql` on the branch (all DDL + backfill + indexes + `NOT VALID` FKs), then recorded the `migration_history` row.
- Post-migration validation on the branch:
  - `canonical_programs`: 4 rows; all 4 offerings linked (`programs.canonical_program_id` 4/4).
  - Applications: 33 total (no data loss); **15/33** backfilled with all four canonical IDs; **18/33** legacy rows remain null where the case-insensitive `institution`/`program`/`intake` string snapshots did not match a live row — these are the manual-exception candidates triaged in task 3.3.
  - Institutions: 2/2 backfilled with `slug` + `brand_name` + emails.
  - Migration recorded in `migration_history`.
- The migration is additive and non-destructive: legacy string columns and the 18 unmatched rows are preserved and remain readable; only nullable IDs, new tables, indexes, and `NOT VALID` FKs were added.

## Done (Phase 1 — task 3.3: post-migration validation + exception report)

- Ran the handover post-migration validation SQL on staging branch `br-tiny-bonus-ahz81bof`. All checks clean except the 18 unlinked applications: `canonical_programs`=4, programs-without-canonical=0, duplicate hostnames=0, duplicate slugs=0, duplicate active memberships=0.
- Triaged every one of the 18 unlinked rows (9 distinct institution/program/intake groups). **Root cause:** legacy `applications.institution` stores the institution *code* (`MIHAS`/`KATC`) while `institutions.name` holds the full name, so the original backfill predicate `lower(i.name) = lower(a.institution)` never matched. The rows matched on program + intake name and each resolves to exactly one offering (no ambiguity).
- **Root-cause fix applied to the migration** (`0001_multi_tenant_beanola_admissions.sql`): the applications backfill now matches `lower(i.name) = lower(a.institution) OR lower(i.code) = lower(a.institution)`. Still additive + idempotent (`COALESCE` fills only nulls). Verified on the staging branch: the code-aware backfill linked **all 18** remaining rows → 33/33 applications now carry all four canonical IDs, 0 null.
- Wrote `docs/multi-tenant-beanola-backfill-exception-report.md` with the validation results, the per-group triage table, the root cause, the fix, and the final 0-exception state. **Manual exceptions requiring a human decision: none.**

## Done (Phase 1 — task 3.4: NOT VALID foreign keys validated)

- After the backfill resolution (0 unmatched rows), ran `ALTER TABLE … VALIDATE CONSTRAINT` for all 21 tenant foreign keys on staging branch `br-tiny-bonus-ahz81bof`. Every FK validated without error — confirming every backfilled reference resolves to a real parent row.
- Verified `pg_constraint`: 21/21 tenant FKs now `convalidated = true`, 0 still `NOT VALID`.
- Confirmed all 11 supporting indexes are present, including the partial-unique active-membership index `uq_active_membership_user_institution` and the tenant lookup indexes (`idx_applications_tenant_ids`, `idx_user_institution_memberships_user`, `idx_access_grants_user_scope`, `idx_institution_templates_lookup`).

## Done (Phase 1 — task 3.5: migration idempotency + backfill tests, real DB)

- Proved idempotency directly on staging branch `br-tiny-bonus-ahz81bof`: re-applied the full migration (tables/columns/backfill/indexes) and the schema fingerprint + data counts were byte-identical (175 columns, 53 indexes, 4 canonical_programs, 33 apps, 33 linked — `ON CONFLICT`/`COALESCE` guards held, no duplicates).
- **Production-safety finding (whole-file single transaction).** `apply_sql_migrations` runs the entire SQL file in one `transaction.atomic()`. Verified on a throwaway Neon branch that the whole file — `ADD COLUMN` + backfill `UPDATE` + `CREATE INDEX` + `ADD CONSTRAINT … NOT VALID` — runs cleanly in **one transaction** against committed production-copy data (all 33 apps linked, no error). It is safe because production has **no tenant FK constraints on `applications`/`programs` until the migration's final `DO` block adds them** (as `NOT VALID`), so the backfill queues no FK-check trigger events.
- Ran the authored P16 pytest suite against the real Neon branch (`TENANT_MIGRATION_NEON_BRANCH=1`, branch connection string): **6 passed** (`test_migration_file_exists`, `test_migration_is_additive_only`, `test_canonical_programs_table_queryable`, `test_reapplying_migration_is_noop`, `test_backfill_is_idempotent`, `test_legacy_null_id_application_remains_readable`).
- Fixed two **test-harness artifacts** in `backend/tests/unit/test_tenant_migration.py` (not migration bugs — the Neon whole-file apply proves the migration is correct):
  1. The `unmanaged_schema` conftest fixture creates the tenant tables from the Django models, materialising FKs as `DEFERRABLE INITIALLY DEFERRED` *before* the migration runs — so the backfill `UPDATE` queued deferred FK-check events and the following `CREATE INDEX`/`ADD CONSTRAINT` failed with "pending trigger events". Compensated by prepending `SET CONSTRAINTS ALL IMMEDIATE` inside the migration's own transaction (helper `_apply_migration_immediate_fks`) so FK checks fire per-statement, reproducing production's no-pending-events sequencing.
  2. The same fixture creates `canonical_programs` from the model (Python-side UUID default only), so the migration's `CREATE TABLE … DEFAULT gen_random_uuid()` is a no-op and the id-less backfill INSERT hit a NOT NULL violation. Compensated by setting the DB default before apply (`_ensure_canonical_programs_db_default`).
  3. Marked the two data-backfill tests `@pytest.mark.django_db(transaction=True)` so fixtures are committed before apply, mirroring production.
- Cleaned up: dropped the leftover `test_neondb` and the two throwaway diagnostic branches (`br-polished-brook-ahou7ksi`, `br-wispy-field-ahmni4nf`). The validated staging branch `br-tiny-bonus-ahz81bof` and production `main` are untouched.

## Done (Phase 1 — task 4: verification block)

- `python3 manage.py check` (sqlite/test): only the known environmental `django_ratelimit.E003` (LocMemCache not a shared cache) — present under both dev and test settings, not a regression.
- `pytest -k "tenant or migration"` (sqlite): **141 passed, 30 skipped, 0 failed**. The 30 skips are the Neon-gated P16 tests (run separately, 6/6 pass) plus Postgres-gated schema-reconciliation invariants.
- Fixed 8 stale contract tests that predated the 7 new tenant models / tenant-scoping seams (no production code changed):
  - `test_migration_properties.py` — added the 7 tenant tables to `EXPECTED_TABLE_MAPPING` (catalog), so the schema-compat count/db_table/no-extra-models checks reflect the now-42-model schema.
  - `test_schema_reconciliation_invariants.py::test_migration_history_coverage` — now skips cleanly when `migration_history` is present-but-empty on the ephemeral SQLite test DB (it still runs fully + catches drift on production Postgres), and applies the canonical `_COVERAGE_EXEMPT_SCRIPTS` exemption.
  - `test_post_migration_qa_bugs.py` + `test_post_migration_qa_preservation.py` — patched the new `AccessScopeService.filter_payments/filter_applications` seams as pass-throughs so the role/contract assertions are exercised in isolation (tenant scoping has its own dedicated isolation suites). All original contract assertions preserved.
- Legacy readability confirmed on the staging branch: all 33 applications (including the 18 originally-unmatched legacy rows) remained readable throughout; legacy string columns (`institution`/`program`/`intake`) untouched; the migration only fills nullable IDs and adds tables/indexes/`NOT VALID` FKs.

## Done (Phase 3 — task 12.1: scope analytics, search/count, risk views, signed-URL paths)

- **Closed the one real admissions cross-school analytics leak.** `FunnelAnalyticsView` (`GET /api/v1/analytics/funnel/`) → `AdmissionsAnalyticsService` aggregated **all** `applications`/`payments` rows for any admin, and cached by request filters only — so a School_Staff caller saw platform-wide funnel/timing/payment totals (and could be served another school's cached funnel). Now scoped (R4.3, R4.5, R4.6):
  - `AdmissionsAnalyticsService(user=...)` bounds every base queryset through `AccessScopeService.filter_applications/filter_payments` **before** aggregating. Super_Admin (and the legacy internal `user=None` callers) keep the global view; a no-scope staff member sees zeros-for-their-scope, never platform totals.
  - The funnel view now namespaces its cache key by the caller's resolved scope (`global` for super-admin/all-access, else an md5 of the sorted institution/offering/application IDs), so one school's cached funnel can never be served to another. Response contract (`{"success": true, "data": {funnel, timing, payments}}`) is unchanged — additive scoping only.
- **Confirmed the remaining surfaces need no change (evidence, not redundant filtering):**
  - `RiskFlagsListView` (`/api/v1/payments/risk-flags/`) is already `IsAuthenticated + IsSuperAdmin` — super-admin-only, no School_Staff exposure.
  - `SourceAnalyticsView`, `OutreachAnalyticsView`, `DailyDigestReportView` return static jobs-ops seed data (`sample_*` in `jobs_ops_seed.py`) — no admissions cross-school data.
  - Non-obvious document signed-URL paths (`DocumentSignedUrlView`/`DocumentDownloadView`/`DocumentInfoView`/`DocumentDeleteView`) already route through `_get_authorized_document`, which scopes admin reads via `AccessScopeService.filter_documents` and masks out-of-scope as not-found (R4.4). The applications document-generation views (`AcceptanceLetterView`, `ApplicationSlipView`, `ConditionalOfferView`, `FinanceReceiptView`, `PaymentReceiptView`) scope through `_get_scoped_application`.
  - Already-scoped surfaces verified unchanged: application list/review (`admin_review_views`), exports (`admin_export_views`), payments list/receipt/verify + settlement summary (`payment_query_views`), dashboard aggregates/activity/needs-attention (`AdminDashboardView`), admin user listing.
- Tests: added `backend/tests/unit/test_analytics_scope.py` (8 tests — service-layer funnel/payment scope for School_Staff vs Super_Admin vs no-scope, plus endpoint-layer envelope + per-school total + cross-tenant cache-bleed guard). Drift-guard, envelope-consistency, force-approved-propagation, and cross-tenant-isolation suites stayed green.
- Verification: `pytest -k "scope or isolation or analytics or risk or tenant" --hypothesis-seed=0` → 121 passed, 6 skipped (Neon-gated migration). `manage.py check` clean with a shared cache backend (the `django_ratelimit.E003` LocMemCache note is a pre-existing test-settings artifact, reproduced on the unmodified tree). `manage.py spectacular` regenerates the schema (the 4 pre-existing catalog warnings/errors are unrelated to analytics).

## Done (Phase 5 — task 22.1: runtime brand + offering filtering from context)

- Verified the white-label + shared-portal frontend behaviour (R3.1, R3.2, R3.6, R10.6) is implemented end-to-end and proven by tests; no production code changes were required for this task:
  - `/api/v1/catalog/context/` is resolved at load through `catalogData.useContext()` (React Query, `QUERY_CACHE_CONFIG.static`), normalised by `catalogService.getContext()` into `{ portal_type, institution_id, institution_code, brand }` with a fail-safe shared-Beanola fallback on error (no leaked/hard-coded school name).
  - `usePortalBrand()` centralises brand + offering-filter derivation: white-label host → institution runtime `brandName` + `offeringInstitutionId`; shared portal/fallback → "Beanola Admissions" + `offeringInstitutionId: undefined` (no single-school favouritism).
  - The student wizard (`applicationWizard/index.tsx`) brands its SEO title/description and page subtitle from `usePortalBrand().brandName` — runtime context, not a baked-in school name.
  - Offering filtering: `catalogData.useProgramsForIntake` forwards `institution` into `/catalog/canonical-programs/` only on a white-label host (omitted on shared); `useWizardController` forwards the same white-label `institution_id` into `useAssignmentPreview` so the assigned-school resolution is institution-bounded.
- Tests (seed 0 where property-based): `tests/unit/whiteLabelContext.test.tsx` (7) — brand resolution incl. unknown/future school + Beanola fail-safe, and offering filtering forwarding institution on white-label / omitting on shared; `tests/unit/usePortalBrand.test.tsx` (4). Both suites pass (11/11).
- Verification: `bun run type-check` clean; focused `bun run test` for the two suites green. `bun run lint` surfaces 2 pre-existing errors in `apps/admissions/src/pages/admin/Tenants.tsx` (restricted `@/components/ui/card`/`badge` imports) — that file is untouched by this task and belongs to the still-in-progress task 23.1 admin onboarding IA.

## Done (Phase 5 — task 22.2: white-label E2E / host-override verification)

- Task 22.2 is **optional**. A full real-browser run with DNS/host overrides was **deferred** because this environment has no installed Playwright browser binaries (`~/.cache/ms-playwright` is empty) and no live multi-tenant backend with active/inactive `institution_domains` rows to override against. The best achievable equivalent was delivered and **verified runnable**.
- **Verified (runnable now):** `apps/admissions/tests/integration/whiteLabelHostResolution.integration.test.ts` — simulates the backend host resolver (`InstitutionContextService.resolve`, reached from `X-Forwarded-Host`/`Host` via `_resolve_request_context`) as a faithful fixture, then drives the **real** frontend chain (`catalogService.getContext()` → brand derivation → `getCanonicalPrograms` offering filter) for each host outcome. **8/8 pass** (seed-free; example-based). Covers the gap P18 (`whiteLabelContext.test.tsx`) does not:
  - active white-label host → institution brand + `institution=` offering filter (R3.1/R3.6);
  - R14.4 uppercase host + port-suffix host both still resolve white-label;
  - **inactive-domain fallback (R3.3)** → shared Beanola brand, `institution_id=null`, no `institution=` filter, and the inactive school's name/code leak nowhere;
  - active domain → **inactive institution** → same safe Beanola fallback (R3.3);
  - **hostname collision (R3.5/R14.4)** → fails safe to shared Beanola, neither colliding school picked/branded;
  - unknown host + hard `/catalog/context/` failure both degrade to shared Beanola (never a leaked school).
- **Deferred (env-gated, ready for staging):** `apps/admissions/tests/e2e/whiteLabelHostOverride.spec.ts` — a real-browser Playwright spec that overrides the host via `X-Forwarded-Host` (the header the production Caddy edge sets from the real DNS name) and asserts the rendered DOM brand + the `/catalog/canonical-programs/` `institution=` filter for white-label, shared, and inactive-domain hosts. Two run modes: `WHITE_LABEL_E2E=1` (against a configured multi-tenant backend with real active/inactive domains) and `WHITE_LABEL_E2E_STUB=1` (real browser + dev server, catalog endpoints fulfilled in-browser keyed on the overridden host). The spec **compiles and lists 5 tests** (`bun x playwright test … --list`); it is skipped by default and requires `bun x playwright install chromium` + a running dev server to execute. Run instructions are in the spec header.
- Verification: `bun x vitest run tests/integration/whiteLabelHostResolution.integration.test.ts` → 8 passed; `bun run type-check` clean; `eslint` clean on both new files; `playwright test … --list` enumerates the 5 gated browser cases.

## Done (Phase 6 — task 29: E2E tenant lifecycle drill)

- Added `backend/tests/integration/test_tenant_lifecycle_drill.py` — a single automated integration test that walks the full Beanola multi-school lifecycle end to end against the ephemeral sqlite test DB (`config.settings.test`) and the in-process DRF client. **It never touches the production EC2 Postgres or the Neon authoring branch** (drill/verification only, per task 29 constraints). Steps proven in one transactional flow:
  1. **Create school** → `POST /api/v1/admin/institutions/` (super-admin) (R5.1).
  2. **Add white-label domain** → `POST .../domains/` (`apply.drillschool.edu`) (R3.1).
  3. **Upload logo + signature** → `POST .../assets/upload/` with a real 1×1 PNG (magic-byte validation + SHA-256 + versioned rows), storage stubbed in-memory (no R2 creds) (R6.1).
  4. **Canonical program + offering** → built via `tests.tenant_fixtures` factories (no public create endpoint for canonical programs/offerings in V1), offering linked to the canonical program and owned by the new institution (R2.1).
  5. **Intake + per-offering capacity** → `program_intakes` row (capacity 50) (R2.1).
  6. **Required document** → `POST .../required-documents/` (NRC) (R5.1).
  7. **Official-document template** → `POST .../templates/` (safe `body`/`signatory` sections + allow-listed `student_name`/`institution` tokens) (R6.1).
  8. **Staff membership** → `POST /api/v1/admin/memberships/` (admin scoped to the school).
  9. **Apply on shared portal** → `GET /api/v1/catalog/context/` resolves `shared`; program-first `POST /api/v1/applications/` (no white-label filter) assigns the only eligible school and persists all four canonical IDs in the create transaction (R2.1, R3.2).
  10. **Apply on white-label portal** → `GET /catalog/context/` with `X-Forwarded-Host: apply.drillschool.edu` resolves `white_label` + the institution id; program-first create with the white-label `institution_id` filter assigns the same school (R3.1).
  11. **Confirm assigned school + fee before payment** → `GET /catalog/assignment-preview/` returns the assigned school, resolved fee, contact, and the configured required document (the wizard's pre-payment checkpoint) (R2.1).
  12. **Simulate payment** → `PaymentService.initiate_payment` stamps the Beanola collector marker + the four-ID tenant settlement snapshot onto `payments.metadata`; the scoped `GET /api/v1/payments/settlements/` attributes it to the school (R7.1).
  13. **Generate all official docs** → ran each Celery task (`application_slip`, `acceptance_letter`, `conditional_offer`, `finance_receipt`, `payment_receipt`) synchronously via `.apply()`; every `ApplicationDocument.verification_notes.official_document` snapshots the institution id + logo/signature asset ids (`logo_render != "none"`), and the acceptance letter records the configured `template_id` + `template_version` (R6.1, R6.2).
  14. **School staff sees only assigned records** → under genuine production scope (`_test_settings_active` monkeypatched off, membership/grant-driven), school-A staff's `GET /api/v1/applications/` returns both school-A applications and never school-B's; an out-of-scope detail read is masked as 404; the scoped settlement summary never names school B (R4.3).
  15. **Super admin sees all** → super-admin `GET /api/v1/applications/` and settlement summary include both schools' records (R4.3).
- **Automated vs manual:** the entire lifecycle is **automated** in this test. The only substitutions from a real production walk are (a) canonical-program/offering/program-intake creation via model factories (V1 exposes no super-admin create endpoint for those — they are managed in the catalog directly), and (b) an in-memory storage backend in place of Cloudflare R2 for asset upload + PDF persistence. The white-label host is exercised via the `X-Forwarded-Host` header (exactly what the production Caddy edge sets); a real-DNS browser walk remains the optional task 22.2 deferred Playwright spec.
- Verification: `pytest tests/integration/test_tenant_lifecycle_drill.py` → 1 passed; `pytest -k "tenant or scope or isolation or settlement or assignment or lifecycle"` → **381 passed, 6 skipped** (Neon-gated migration), 0 failed. `manage.py check` clean apart from the pre-existing `django_ratelimit.E003` LocMemCache test-settings artifact. `manage.py spectacular` regenerates the schema (only the 4 pre-existing unrelated catalog errors / 1 warning; this task added no new views or serializers). `git diff --check` clean.

## Done (Phase 6 — task 30: final verification + progress/docs update)

- Ran the full verification gate suite (verification only — **no production EC2 DB or Neon authoring branch was touched**; no migrations applied):
  - **Backend `pytest`** (`config.settings.test`, venv interpreter): **2735 passed, 132 skipped, 2 xfailed, 1 xpassed, 0 failed** (~103s). The 132 skips are the Neon-gated P16 migration tests (run separately, 6/6 pass) plus Postgres-gated schema-reconciliation invariants.
  - **Backend `manage.py check`**: System check identified **no issues (1 silenced)**. The silenced item is the known pre-existing `django_ratelimit.E003` LocMemCache test-settings artifact (not a shared cache) — present on the unmodified tree, not a regression.
  - **Backend `manage.py spectacular --file /tmp/schema.yaml`**: schema **generates cleanly (exit 0)**. The reported **4 errors (1 unique) + 1 warning** are the stable, known, this-spec catalog set — `AdminTenantAssetUploadView` (multipart upload view, no auto-guessable serializer; task 15.2) and the `CanonicalProgramListView > CanonicalProgramSerializer.get_available_offerings` type-hint warning. Benign (graceful APIView fallback / SerializerMethodField default-to-string), unchanged across every Phase 3–6 verification block, not a task-30 regression.
  - **Admissions `bun run type-check`**: clean.
  - **Admissions `bun run lint`**: clean (`--max-warnings 0`).
  - **Admissions `bun run test`**: **3031 passed, 1 skipped, 0 failed** (383 files; includes the fast-check property suites).
  - **Admissions `bun run build`**: production build **succeeds** (the >650 kB chunk-size advisories on `vendor-pdf`/`vendor-react-pdf` are pre-existing and informational; CSP HTML check passes).
  - **`git diff --check`**: clean (exit 0).
- **Fixed two gate failures, both this-spec-introduced (uncommitted on `main`), both verified as intended-contract reconciliation — not functional regressions:**
  1. `tests/unit/test_public_endpoint_policy.py::test_every_allow_any_view_has_public_endpoint_classification` — the spec's new `AssignmentPreviewView` (`GET /api/v1/catalog/assignment-preview/`, the program-first wizard's pre-payment checkpoint, task 21.1) is an `AllowAny` read-only catalog preview but was never registered in the public-endpoint policy. Registered it under `health_meta_catalog_public_read` in `backend/apps/common/public_endpoint_policy.py` (the same category as its sibling `CatalogContextView`/`CanonicalProgramListView`). This makes its public exposure a deliberate, classified decision rather than an accidental permission gap.
  2. `tests/unit/test_api_quality_script.py::test_api_quality_script_passes_against_baseline` — the api-quality gate compared the schema against a baseline frozen before this spec (last refreshed in commit `32ed1be1f`). The reported "9 breaking changes" are **all** the four canonical-ID fields (`program_id`, `program_offering_id`, `intake_id`, `institution_id`) now always present in the `Application`/`ApplicationList` **response** schemas. These are declared `read_only=True` serializer outputs (verified in `backend/apps/applications/serializers.py`) — drf-spectacular marks always-present read-only response fields as `required` in the *response* schema, which is **additive** for clients (extra fields supplied), **not** a request-contract break. The +230 lint delta (669→899) and the 1 spectacular error are this spec's net-new tenant/catalog/settlement API surface. Refreshed both baselines via the documented `make api-quality-baseline` path (`backend/schema/openapi.v1.baseline.yaml` + `backend/schema/lint_baseline.json`) so the gate measures future drift against the spec's intended contract. Baseline == current ⇒ breaking changes drop to 0; gate green.
- **Canonical truth map:** verified all eight of the spec's canonical concepts are already registered (task 9, confirmed by file read) — canonical program, school offering, institution scope, intake, assignment authority, institution context, staff membership scope, access grant scope, scope computation, application uniqueness, payment settlement reporting, official document provenance, plus the drift guard. **No additions were required.**
- **`.config.kiro` `status` left unset on purpose** — tasks 28 (production migration) and 31 (rollout checkpoint) are non-optional and operator-deferred, so the "only when all non-optional tasks are done" condition is not met.
- **Regressions vs pre-existing, explicitly:** zero regressions introduced by this spec after the two reconciliations above. Pre-existing/known-and-unrelated items, distinct from anything this spec changed: the `django_ratelimit.E003` LocMemCache `manage.py check` artifact; the 6 Neon-gated skipped migration tests; and the build's vendor-pdf chunk-size advisories. The 4 spectacular errors + 1 warning are this-spec catalog views (earlier tasks), benign, and stable across all prior Phase 3–6 verification blocks.



- Production database migration application and deeper end-to-end QA in an environment with the migration-history prerequisite applied.
- Real-browser white-label E2E (`whiteLabelHostOverride.spec.ts`) to be run on staging once Playwright browsers + a multi-tenant backend with real DNS/host overrides are available (task 22.2 deferred portion).

## Left To Do

- Apply and validate the SQL migration on real Postgres after migration-history prerequisites are satisfied.
- Add richer frontend edit forms for existing templates, assets, required documents, memberships, and grants beyond the current deactivate lifecycle action.
- Replace remaining legacy MIHAS/KATC comments and frontend PDF preview theme compatibility maps once the old preview system is retired.
- Continue broadening `AccessScopeService` enforcement to any future cross-school search/count surfaces (analytics funnel scoped in task 12.1).
- Add CSV/export formatting for settlement summaries if operations needs downloadable files rather than JSON grouping.
- Add focused tests for assignment rules, access grants, scoped querysets, migrations/backfills, official document rendering, payment settlement grouping, and white-label frontend behavior.

## Notes

- `apply_sql_migrations --dry-run` is blocked in this checkout until `2026_05_22_migration_history_extend.sql` has been applied.
- V1 document templates are safe section/token templates, not arbitrary DOCX/PDF merge engines.

## Done (Beanola Production Readiness — task 3.1: brand `rg` scan + hit classification) — 2026-06-14

Spec `.kiro/specs/beanola-production-readiness/` Phase 2, task 3.1 (R2.2, R2.6,
R16.1). Ran the plan's brand scans over the four active-runtime surfaces
(`apps/admissions/src`, `apps/admissions/index.html`, `backend/apps`,
`backend/config`) and classified every hit. No code was changed by this task —
it is the brand-scan evidence note required by R2.6.

### Scans executed

```
# 1) Primary brand/domain scan
rg -n "MIHAS|KATC|Mukuba|Kalulushi|mihas\.edu\.zm|katc\.edu\.zm|apply\.mihas|api\.mihas|mihas-admin-panel" \
   apps/admissions/src apps/admissions/index.html backend/apps backend/config

# 2) Sender/address scan
rg -n "info@mihas|info@katc|@mihas\.edu\.zm|@katc\.edu\.zm|admissions@mihas|noreply@mihas|support@mihas|mihas\.beanola|mihas\.local|apply\.mihas\.edu\.zm|api\.mihas" \
   apps/admissions/src apps/admissions/index.html backend/apps backend/config
```

`apps/admissions/index.html` returned **zero hits**. 23 files matched across the
other three roots. Classification key (R2.2): **platform-default (must remove)**,
**seeded tenant data**, **dev/PDF-preview fixture** (not reachable from
official-document download paths), **historical/archived doc**, **named
legacy-compatibility code with a guard**, or **intentional test fixture /
non-brand data**.

### Classification — `backend/config` (NOT covered by the backend brand guard)

| File:line | Hit | Classification | Allowlisted? |
|-----------|-----|----------------|--------------|
| `backend/config/settings/base.py:411` | `SPECTACULAR_SETTINGS["TITLE"] = "MIHAS Platform APIs"` | **platform-default (must remove)** — OpenAPI title presents MIHAS as platform identity; R4.1 requires Beanola-branded metadata. The `DESCRIPTION` already reads "Beanola"; only `TITLE` is stale. | **No** |

> **⚠️ Finding F-3.1-A (gap for R4.1 / task 8.1 + R2.1 guard coverage):** This is
> the only **non-allowlisted, platform-default** legacy-brand hit in active
> runtime source. It is currently **invisible to the brand drift guard** because
> `backend/tests/unit/test_brand_drift_guard.py` scans `backend/apps` only
> (`SCAN_ROOT = REPO_ROOT / "backend" / "apps"`) — it does **not** scan
> `backend/config`. Recommended follow-ups (not done here, out of task 3.1 scope):
> (1) rebrand the OpenAPI `TITLE` to a Beanola-branded string under R4.1 / task
> 8.1; (2) extend the backend guard's `SCAN_ROOT` to also cover `backend/config`
> so R2.1 actually protects the surface R2.1 names (`backend/config`). Until (1)
> lands, do **not** allowlist this file — it is a platform default to remove, not
> reviewed tenant/historical data.

### Classification — `backend/apps` (all allowlisted, guard-covered)

| File | Hit summary | Classification | Allowlisted? |
|------|-------------|----------------|--------------|
| `backend/apps/catalog/management/commands/seed_tenant_document_profiles.py` | MIHAS RN / KATC COG / KATC EHT acceptance-letter profile seeds, bank accounts, addresses | **seeded tenant data** | Yes |
| `backend/apps/catalog/management/commands/brand_institutions.py` | MIHAS/KATC `brand_name`/`full_name`/contact/domain seeds | **seeded tenant data** | Yes |
| `backend/apps/applications/_view_helpers.py` | `_LEGACY_INSTITUTION_CODE = 'MIHAS'`, `_resolve_institution_code_legacy()` | **named legacy-compatibility code with a guard** (default flow uses assigned institution code) | Yes |
| `backend/apps/applications/public_views.py` | comment documenting historical MIHAS/KATC app-number pair; validator accepts any code | **historical/archived doc** (comment, no hard-coded prefix) | Yes |
| `backend/apps/applications/models.py` | docstring example `MIHAS/26/00001` student-number format | **historical/archived doc** (docstring sample) | Yes |
| `backend/apps/documents/payment_service.py` | comment: legacy `MIHAS-` references stay matchable; none newly generated | **named legacy-compatibility code with a guard** | Yes |
| `backend/apps/documents/payment_helpers.py` | comment + Lenco `User-Agent: "MIHAS/2.0"` product token | **named legacy-compatibility code with a guard** | Yes |

### Classification — `apps/admissions/src` (all allowlisted, guard-covered)

| File | Hit summary | Classification | Allowlisted? |
|------|-------------|----------------|--------------|
| `apps/admissions/src/pages/dev/DocumentPreview.tsx` | MIHAS/KATC sample fixtures | **dev/PDF-preview fixture** — route `/dev/documents` guarded by `import.meta.env.DEV` in `App.tsx` and tree-shaken from prod; not reachable from official-download paths | Yes |
| `apps/admissions/src/pages/dev/AcceptanceLetterPreview.tsx` | MIHAS/KATC sample fixtures | **dev/PDF-preview fixture** — route `/dev/acceptance-letter` is `import.meta.env.DEV`-gated/tree-shaken | Yes |
| `apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts` | MIHAS RN / KATC COG / KATC EHT client preview profiles | **dev/PDF-preview fixture** (client preview/draft only; backend profiles are official source) | Yes |
| `apps/admissions/src/lib/pdf/documents/AcceptanceLetter.tsx` | docstring referencing historical MIHAS/KATC letters | **dev/PDF-preview fixture** (preview/draft renderer docstring) | Yes |
| `apps/admissions/src/lib/pdf/documents/intakeSchedule.ts` | docstring: MIHAS/KATC two annual intakes | **dev/PDF-preview fixture** (preview docstring) | Yes |
| `apps/admissions/src/lib/pdf/documents/PaymentReceipt.tsx` | docstring: MIHAS FINANCE OFFICE tagline | **dev/PDF-preview fixture** (preview docstring) | Yes |
| `apps/admissions/src/lib/pdf/documents/types.ts` | docstrings with MIHAS/KATC examples | **dev/PDF-preview fixture** (preview type docstrings) | Yes |
| `apps/admissions/src/lib/pdf/components/SignatureBlock.tsx` | docstring: shared MIHAS/KATC Managing Director signatory | **dev/PDF-preview fixture** (preview docstring) | Yes |
| `apps/admissions/src/lib/pdf/theme/index.ts` | MIHAS/KATC registered as preview tenant data + `info@mihas.edu.zm` / `info@katc.edu.zm` | **dev/PDF-preview fixture** — unknown institutions fall back to Beanola-generic; MIHAS never silently rendered (R2.5) | Yes |
| `apps/admissions/src/lib/pdf/theme/colors.ts` | banner "MIHAS-KATC PDF Color System" | **dev/PDF-preview fixture** (preview theme banner) | Yes |
| `apps/admissions/src/lib/pdf/theme/spacing.ts` | banner "MIHAS-KATC PDF Spacing System" | **dev/PDF-preview fixture** (preview theme banner) | Yes |
| `apps/admissions/src/lib/pdf/theme/typography.ts` | banner "MIHAS-KATC PDF Typography System" | **dev/PDF-preview fixture** (preview theme banner) | Yes |
| `apps/admissions/src/lib/pdf/README.md` | "MIHAS-KATC PDF Document System" | **historical/archived doc** | Yes |
| `apps/admissions/src/lib/locationOptions.ts` | `'Kalulushi'` in Zambian town option list | **intentional non-brand data** (real geographic location, unrelated to brand fallback) | Yes |
| `apps/admissions/src/lib/env.ts` | test-only override key `__MIHAS_IMPORT_META_ENV__` | **intentional test fixture** (historical internal identifier, not user-facing) | Yes |

### Sender/address scan results

| File:line | Hit | Classification | Allowlisted? |
|-----------|-----|----------------|--------------|
| `backend/apps/catalog/management/commands/brand_institutions.py:38-40` | `admissions@mihas.beanola.com`, `support@mihas.beanola.com`, `https://mihas.beanola.com` | **seeded tenant data** (MIHAS tenant white-label contacts) | Yes |
| `apps/admissions/src/lib/pdf/theme/index.ts:104,117` | `info@mihas.edu.zm`, `info@katc.edu.zm` | **dev/PDF-preview fixture** (tenant contact in preview theme) | Yes |

### Summary

- **22 of 23** matched files are already in `docs/legacy-brand-allowlist.json`
  with a reviewed single-file entry and a removal-blocked reason; each was
  re-classified above and the recorded reason holds.
- **1 genuine finding (F-3.1-A):** `backend/config/settings/base.py:411`
  (`SPECTACULAR_SETTINGS["TITLE"] = "MIHAS Platform APIs"`) — a **platform-default
  that must be removed** under R4.1, and a **guard-coverage gap** because the
  backend brand drift guard scans only `backend/apps`, not `backend/config`
  (R2.1 names `backend/config` as in-scope). Carried into Phase 4 task 8.1
  (Beanola-branded OpenAPI metadata) and flagged for the R2.1 guard-scope
  extension. Not allowlisted — it is a platform default, not reviewed
  tenant/historical/preview data.
- `apps/admissions/index.html`: clean (no hits).

## Done (beanola-production-readiness Phase 3 — task 6.1: Neon validation — dry-run discovery + apply + reapply + validation SQL)

Spec: `.kiro/specs/beanola-production-readiness/` (R3.1, R3.2, R3.3). This is the
**Neon-side** validation only — the gated production apply (task 6.3) remains an
operator step on the EC2 box and was **not** performed. No production DB change
was made from this environment (R3.1, R16.8). The Neon **default/main branch was
never written** — all work ran on a disposable temporary branch.

### Temporary Neon branch

- Project: `wild-bar-37055823` (`mihasApplication`), org `org-nameless-field-86879910`.
- **Temporary branch id: `br-proud-rice-ah2b0nfg`** (name `task6-1-validation-beanola`),
  forked from the default branch `br-floral-scene-aha2ybfd`.
- Every `run_sql` / `run_sql_transaction` call passed this branch id explicitly.

### Dry-run discovery order + additive-only lint (R3.2)

Reproduced `apply_sql_migrations` discovery (`_iter_migration_files`, lexical
filename sort, top-level only) and the additive-only lint
(`_find_non_additive_violations`) against the real `backend/scripts/`. The four
target scripts are discovered in this correct lexical order — note
`student_number` sorts **last** (`'s'` > `'0'`), which the runbook documents as
correct because `2026_06_08_01_...` already creates the tenant schema first:

1. `2026_06_08_01_multi_tenant_beanola_admissions.sql` — lint: **PASS (additive-only)**
2. `2026_06_08_03_institution_document_profiles.sql` — lint: **PASS (additive-only)**
3. `2026_06_08_04_communication_templates_tenant.sql` — lint: **PASS (additive-only)**
4. `2026_06_08_student_number.sql` — lint: **PASS (additive-only)**

No `DROP` / `TRUNCATE` / unguarded `DELETE` in any script.

### Migration_History_Prerequisite (R3.6 precheck)

On the branch: `migration_history.checksum` column present, unique index
`uq_migration_history_migration_name` present → the runner would not raise
`MIGRATION_HISTORY_NOT_EXTENDED`. None of the four target scripts were recorded
before this validation.

> **Branch-baseline note.** The temp branch (forked from default) carried a
> stale half-state of the eight tenant tables (present but with **no `id`
> default**, 0 rows) while `applications` was still missing its canonical-ID
> columns and `migration_history` had no `2026_06_08*` rows. With user
> confirmation, the `id` defaults were repaired **additively**
> (`ALTER COLUMN id SET DEFAULT gen_random_uuid()`, non-destructive, temp branch
> only) so the scripts' backfill `INSERT`s could run. No table was dropped; no
> production/default-branch object was touched.

### Apply + reapply idempotency (R3.2)

- **First apply** of all four scripts (in lexical order) succeeded; the four
  `migration_history` rows were recorded.
- **Reapply** of all four script bodies succeeded with **no errors** — the
  `CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `INSERT … ON CONFLICT`, and `ADD CONSTRAINT … NOT VALID` (in `IF NOT EXISTS`
  guards) guards made the second run a no-op.
- **Idempotency invariants after reapply:** `migration_history` rows for
  `2026_06_08*` = **4** (reapply added none); `canonical_programs` = **4**
  (no duplicates); `programs` linked to a canonical program = **4**;
  applications with `institution_id` = **33** — all unchanged from first apply.

### Runbook validation SQL (R3.3)

| Check | Result | Expected |
|-------|--------|----------|
| `canonical_programs` count | **4** | non-zero ✓ |
| duplicate hostnames in `institution_domains` | **0 rows** | zero ✓ |
| duplicate slugs in `institutions` | **0 rows** | zero ✓ |
| applications without `institution_id` | 0 | (legacy nulls allowed) |
| applications without `program_id` | 0 | |
| applications without `program_offering_id` | 0 | |
| applications without `intake_id` | 0 | |
| programs without canonical link (active) | 0 | |

Supporting counts (evidence block): institutions = 2, offerings (`programs`) = 4,
intakes = 3, memberships = 0, access_grants = 0, institution_domains = 0,
document_profiles = 0, institution_assets = 0. The `next_student_number('MIHAS', 2026)`
helper returns `MIHAS/26/00001` as expected.

### Status

Neon staging-validated (apply + idempotent reapply + validation SQL all green on
branch `br-proud-rice-ah2b0nfg`). **Production apply remains pending — gated
operator step (task 6.3), not run here.**


## Done (Beanola Production Readiness — task 18: Checkpoint — Phase 8) — 2026-06-14

Spec `.kiro/specs/beanola-production-readiness/` Phase 8, task 18 (R8.1, R8.3,
R8.9; design Component 8). **Verification-only checkpoint — no production DB
change, no schema change, no code change.** Confirms the Phase 8 work tasks
(17.1–17.4) hold together: student/admin E2E flows pass on staging-equivalent,
the negative flows prove the security boundaries, and the manual smoke checklist
exists.

### Evidence confirmed

- **Student E2E (R8.1):** `apps/admissions/tests/e2e/studentJourney.spec.ts`
  (gated Playwright spec, enumerable via `--list`) with its runnable backend
  walk `backend/tests/integration/test_student_journey_e2e.py` — drives signup →
  verification → application/canonical-program/intake → assigned institution →
  document upload → save-draft/resume → pay-or-defer → submission → backend
  application-slip → public tracking → communication → interview → decision →
  acceptance/receipt through the real HTTP surface.
- **Admin E2E (R8.2):** `apps/admissions/tests/e2e/adminJourney.spec.ts` (gated)
  with its runnable backend walk
  `backend/tests/integration/test_admin_journey_drill.py` — super-admin login →
  institution creation → asset upload → document-profile → offering
  creation/assignment → routing simulator → staff + scoped Access_Grant → staff
  scoped-only view → review → payment verification → official-doc generation →
  audit → scoped export.
- **Negative / boundary flows (R8.3–R8.8):** Property 26
  `backend/tests/property/test_production_scope_masking_properties.py` —
  wrong-school staff → Not_Found_Envelope, expired grant → Not_Found_Envelope,
  scoped grant does not widen to a sibling, super-admin permitted everywhere, no
  PII leak; reinforced by `backend/tests/integration/test_tenant_lifecycle_drill.py`.
- **Manual smoke checklist (R8.9):** `docs/runbooks/production-smoke-checklist.md`
  exists and covers public surface, auth, the student critical flow, the
  admin/tenant surface (incl. `/admin/tenants` and `/beanola-admin-panel/`), the
  negative/out-of-scope boundary, and platform health/monitoring, with a
  degradation-posture sign-off linked to `release-and-rollback.md`.

### Verification

`DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest
tests/integration/test_student_journey_e2e.py
tests/integration/test_admin_journey_drill.py
tests/integration/test_tenant_lifecycle_drill.py
tests/property/test_production_scope_masking_properties.py --hypothesis-seed=0`
→ **9 passed** (2 E2E drills + lifecycle drill + 6 Property 26 cases). The live
real-browser Playwright runs remain gated for a provisioned staging environment
(`STUDENT_JOURNEY_E2E=1` / `ADMIN_JOURNEY_E2E=1`), with the backend drills as the
authoritative repo-side evidence. No production EC2 Postgres or Neon authoring
branch was touched.

## Done (Beanola Production Readiness — task 29.3: graceful-degradation posture + progress update) — 2026-06-14

Spec `.kiro/specs/beanola-production-readiness/` Phase 14, task 29.3 (R14.4,
R14.5, R14.6, R14.7, R14.8; design Component 14). **Documentation-only task — no
production DB change, no schema change, no code change.** This task confirms the
launch-time graceful-degradation posture is documented and refreshes this status
document.

### Graceful-degradation posture confirmed/documented (R14.4–R14.7)

The canonical rollback + graceful-degradation posture already lives in
`docs/runbooks/database-backup-restore.md` §"Rollback Posture" (R9.7), and it
covers all of R14.4–R14.7:

- **Disabling a route/action keeps data intact (R14.4):** hide or gate the
  surface (prefer a feature-flag flip back to `False` + redeploy), never delete
  the records behind it.
- **Payment fails after launch (R14.5):** stop payment initiation while keeping
  application submission safe — students may defer payment and submit; submission
  is never blocked on the payment gateway, and a failed payment never produces a
  paid receipt (R8.7).
- **Official-document generation fails (R14.6):** the system shows "generation
  failed" and **blocks the download** rather than serving a stale or
  client-rendered PDF; official documents are backend-only and never fall back to
  the `@/lib/pdf` preview/draft generators; a failed generation records `failed`
  status and leaves any prior Official_Document unchanged (design Property 32).
- **Database rollback is forward-only (R14.7)** unless a tested rollback script
  exists; **code rollback is always allowed** and is the first lever. All
  production schema is additive/idempotent SQL under `backend/scripts/`, so a
  routine rollback rolls back code only and leaves additive columns/tables in
  place (legacy rows stay readable).

**Gap closed this task:** `docs/runbooks/release-and-rollback.md` previously had a
"Database Rollback" section that did not state the forward-only posture or the
graceful-degradation levers. Updated it to (a) state the forward-only,
code-only-routine-rollback posture (R14.7), (b) add a "Graceful-Degradation
Posture (R14.4–R14.7)" section enumerating the tenant-feature / payment /
official-document levers, (c) add the 4-step rollback decision order, and
(d) cross-reference the canonical posture in `database-backup-restore.md`. The
two runbooks are now consistent and each names the R14 acceptance criteria.

### Beanola Production Readiness — spec-run status summary (R14.8)

Phases completed in this spec run (verification + cutover-prep + audit + polish +
prove + ops + security + performance + data-quality + CI gate), all proven
against the repo / Neon staging without touching production:

| Phase | Scope | State |
|-------|-------|-------|
| 1 — Canonical freeze (R1) | Canonical_Truth_Map frozen, both admin routes + scopes recorded, no-new-mirrors guard, legacy-fallback allowlist | ✅ complete |
| 2 — Brand/tenant boundary (R2) | Brand `rg` scans classified, allowlist tightened to single-file entries, PDF-theme unknown-institution behaviour, paired brand drift guards; Property 28 | ✅ complete |
| 3 — Gated production DB cutover, Neon-first (R3) | Neon dry-run + apply + idempotent reapply + validation SQL green on staging branch; additive-only confirmed; idempotence integration test | ✅ Neon-validated · ⛔ production apply (6.3) operator-deferred |
| 4 — Backend API contract audit (R4) | OpenAPI generates Beanola-branded; API contract inventory; envelope/pagination/error-masking; rate limits; Properties 27, 31 | ✅ complete |
| 5 — Tenant scoping + security audit (R5) | Scope endpoint inventory (no unknown-scope rows); scoped-access matrix; scope + unscoped guards; PII/file-security; Property 26 | ✅ complete |
| 6 — Document system audit (R6) | Document-type audit; backend-only official downloads + document-flow guard; failure states/dedup/seed/preview/provenance; Properties 29, 32 | ✅ complete |
| 7 — Per-route + mobile-first UI/UX (R7) | Per-route pass/fail notes; critical form/table/dialog fixes; route-mobile-overflow guard (Property 30); Playwright screenshot evidence | ✅ complete |
| 8 — End-to-end workflow QA (R8) | Student + admin + negative E2E flows; tenant lifecycle drill; manual smoke checklist | ✅ complete |
| 9 — Backend reliability + operations (R9) | Health endpoints; background-task monitoring; idempotency; structured logs; monitoring/alerts; backup script + restore drill; rollback posture | ✅ complete |
| 10 — Security + privacy review (R10) | Auth/cookie/CSRF/JTI; authorization via AccessScopeService; input validation; secrets/env review; payment + privacy controls | ✅ complete |
| 11 — Performance / Core Web Vitals (R11) | Bundle/route-chunk, prefetch, polling, image handling reviewed | ✅ complete |
| 12 — Data quality + seed readiness (R12) | Read-only verification queries (counts/completeness/not-ready flags) reflected in the production evidence block | ✅ complete |
| 13 — CI gate (R13) | Verification_Gate reproduced in CI; no required guard marked optional | ✅ complete |
| 14 — Launch checklist + rollback posture (R14) | Pre-launch env/branch + pre-deploy gate/build/backup/migrate/validate (29.1); smoke set incl. `/admin/tenants` + `/beanola-admin-panel/` (29.2); graceful-degradation posture + this update (29.3) | ✅ docs complete · ⛔ live launch + post-window confirmation operator-deferred |

**Operator-deferred items remaining (non-optional, intentionally not run from
this environment):**

- **Task 6.3 — gated production database cutover.** The additive multi-tenant +
  follow-on scripts are Neon-validated (apply + idempotent reapply + validation
  SQL green); the production apply to the EC2 `mihas-postgres-1` Postgres is a
  backup-gated, maintenance-window operator step gated on explicit user
  confirmation, per `docs/runbooks/multi-tenant-beanola-rollout.md` and the
  Neon-first infrastructure rule. The production evidence block (6.4) is captured
  only after 6.3.
- **Task 31.2 — final Definition-of-Done sign-off.** The DoD exit gate (R15,
  design Property 33) is all-or-nothing and includes "migrations applied to
  staging **and** production with evidence" (R15.3) and the live production
  Smoke_Check set (R15.6). Until 6.3 completes, R15.3/R15.6 are unmet, so the gate
  is **false** and `.config.kiro` keeps no `"status": "completed"` — the marker is
  set by whoever completes the production rollout.

Everything else in the spec is code-complete and verified locally / Neon-validated.

## Done (Phase 13 — task 28: full Verification_Gate checkpoint)

Ran the complete Verification_Gate locally (dev environment only; no production
access, no Neon default-branch writes) and cross-checked the CI Drift_Guard
inventory. **All gate steps pass with zero errors.**

### Gate results

| Step | Command | Result |
|------|---------|--------|
| Backend tests | `pytest tests/unit tests/property -q` | **2909 passed**, 134 skipped, 2 xfailed, 1 xpassed, 0 failed |
| Django checks | `manage.py check` | clean (1 silenced; `LENCO_API_SECRET_KEY` unset note is dev-only) |
| OpenAPI schema | `manage.py spectacular --file /tmp/openapi.yaml` | `Errors: 0 (0 unique)`, 1 unrelated warning |
| Admissions type-check | `bun run type-check` | clean |
| Admissions lint | `bun run lint` | clean (max-warnings 0) |
| Admissions tests | `bun run test` | **3218 passed**, 1 skipped, 0 failed |
| Admissions build | `bun run build` | built OK; HTML CSP-compatible (chunk-size note is informational only) |

### Gate fixes applied (test-only; stale mirrors of this spec's own hardening)

The first gate run surfaced 8 stale test expectations that lagged behind this
spec's intentional, already-shipped hardening. No implementation/production code
was changed — only the stale test expectations were corrected:

- `backend/tests/property/test_middleware_properties.py` — `SCOPE_LIMITS`
  expectation updated to include `/api/v1/applications/bulk-status/ → 20/10m`
  (the R4.8 admin bulk-operation rate limit added in task 8.4).
- `backend/tests/property/test_communications_history_properties.py` (4 tests:
  ordering, envelope, pagination, user-scoped retrieval) — exercised via the
  super-admin "sees all" path; a plain scoped admin now correctly masks an
  unmocked out-of-scope target as `404` (R5.4/R16.4 scope masking added in
  task 11), which these non-scope properties were not setting up.
- `backend/tests/property/test_interview_status_validation.py` — added mocks for
  the pre-mutation scope check (`Application.objects.get` +
  `_staff_can_access_application`) introduced for R5.2/R5.9 so the INVALID_STATUS
  property no longer hits the DB.
- `apps/admissions/tests/unit/page-verification/payment-page.test.tsx` and
  `student-interview.test.tsx` — contact assertion updated from the retired
  `admissions@mihas.edu.zm` to the canonical `admissions@beanola.com` (R2/R7.12
  Beanola brand cleanup). Remaining `mihas.edu.zm` strings in other
  page-verification files are self-supplied mock fixtures, not brand assertions.

### CI required-guard cross-check (R13.2, R13.3, R13.6)

Cross-checked `.github/workflows/ci.yml` against the `docs/canonical-truth-map.md`
Drift_Guard inventory and the task 27.2 required list. Every required guard runs
in CI and is **non-optional** (no `continue-on-error` on any guard job):

- `frontend-drift-guards` job — brand, document-flow, payment-status, error-code,
  role mirror, application-lifecycle (`brandDriftGuard`, `documentFlowDriftGuard`,
  `paymentStatusMappingDriftGuard`, `errorCodesDriftGuard`, `rolesBackendMirror`,
  `applicationStatusDriftGuard`).
- `backend-drift-guards` job — brand, official-document dedup, scope, unscoped
  endpoint, canonical-tenant, payment-status, error-code, schema (migration +
  strict), application-lifecycle (`test_brand_drift_guard`,
  `test_official_document_dedup_guard`, `test_scope_drift_guard`,
  `test_unscoped_endpoint_guard`, `test_canonical_tenant_drift_guard`,
  `test_payment_status_canonical`, `test_error_codes_canonical`,
  `test_migration_drift_guard`, `test_lifecycle_canonical`,
  `test_schema_drift_strict`).
- Verification_Gate (R13.1) reproduced in CI: `backend` job runs `manage.py check`,
  a zero-error `spectacular` assertion, and `pytest tests/unit`; `backend-property`
  runs `tests/property` across 8 shards; `admissions` runs `type-check`, `lint`,
  `test`, `build`. `design-audit` (Impeccable) and `backend-governance`
  (schema/outbox + Neon-fork drift) are additional blocking gates.

All intended test edits are tracked (R13.4) — no untracked files introduced by
this checkpoint.
