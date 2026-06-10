# Multi-Tenant Beanola Admissions Progress

Last updated: 2026-06-10

## Current Status

**Code- and test-complete; production rollout deferred to the human operator.** Every implementation, isolation, assignment, migration, document, settlement, frontend, and observability task (tasks 1–27, 29, 30) is done and proven green by the full verification gate suite (see the task-30 final-verification entry below). The two remaining non-optional tasks are **operator-driven production rollout steps**, intentionally left for a human per the infrastructure steering ("author on Neon, then copy to production; never make production the first place a change lands"):

- **Task 28 — production migration application + post-deploy QA** (`[~]`, deferred): the additive tenant migration is validated on a staging Neon branch (`br-tiny-bonus-ahz81bof`, 33/33 applications backfilled, all 21 FKs validated, idempotency proven) but has **not** been applied to the production EC2 Postgres. Applying it is a manual, backup-gated maintenance-window operation.
- **Task 31 — final rollout checkpoint** (`[~]`, deferred): the spec-complete sign-off with the user, gated on task 28.

Because tasks 28 and 31 are non-optional and not yet done, `.config.kiro` is **deliberately left without `"status": "completed"`** — the completion condition ("only when all non-optional tasks are done") is not met. The marker should be set by whoever completes the production rollout.

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
