# Beanola Production Readiness Postmortem — 2026-06-16

This postmortem verifies the current Beanola multi-school admissions codebase
after the MIHAS/KATC-to-Beanola migration work. It is intentionally strict:
"production ready" means the code, database, backend contracts, frontend routes,
documents, tenant scoping, branding, mobile UI, and performance have evidence,
not just implementation intent.

## Executive Verdict

**Code-level status: mostly implemented, with several high-value fixes applied
during this pass.**

The core platform identity is now Beanola, the two school names are treated as
tenant data, the product tenant-admin UI is canonical at `/admin/tenants`, and
the Django operational admin is canonical at `/beanola-admin-panel/`. Tenant
onboarding, scoped staff access, tenant document profiles, official document
generation, settlement metadata, and drift guards exist in the codebase and are
covered by targeted tests.

**Production status: not yet 100% production-ready.**

The remaining blockers are operational and evidence-based:

1. Production database migration/application evidence is not captured in this
   local verification.
2. Lighthouse mobile and live API timing evidence are still deferred to a
   deployed staging/production-like target.
3. Mobile rendered UI verification is still incomplete for dense admin routes,
   especially `/admin/tenants` and `/admin/applications`.
4. Large lazy PDF/Sentry chunks remain and must stay isolated from first paint;
   the current entry path is good, but document-generation journeys need
   separate performance acceptance.
5. Active source still intentionally contains MIHAS/KATC tenant preview data in
   the client PDF preview system; it is now guarded, but it remains a future
   cleanup candidate if Beanola wants neutral demo tenants only.

## Fixes Applied During This Verification

These were concrete issues found while auditing, then fixed immediately.

| Area | Fix | Files |
|---|---|---|
| Client PDF preview safety | Unknown or empty acceptance-letter institutions no longer resolve to MIHAS. They now resolve to a neutral Beanola preview profile with "configured in tenant template" banking placeholders. | `apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts`, `apps/admissions/tests/unit/pdf/acceptanceLetterProfiles.test.ts` |
| Payment provider branding | Active Lenco HTTP User-Agent changed from `MIHAS/2.0` to `Beanola/2.0`. Legacy `MIHAS-` payment references remain matchable only for reconciliation. | `backend/apps/documents/payment_helpers.py`, `docs/legacy-brand-allowlist.json` |
| PDF system labels | Generic PDF system comments/docs now say Beanola tenant PDF system instead of MIHAS-KATC. Remaining school names are tenant sample/profile data. | `apps/admissions/src/lib/pdf/README.md`, `apps/admissions/src/lib/pdf/theme/*`, `apps/admissions/src/lib/pdf/documents/types.ts` |
| Brand allowlist | Removed stale allowlist entries for files that no longer contain legacy brand strings. | `docs/legacy-brand-allowlist.json` |
| Canonical truth map | Corrected stale OpenAPI note. Runtime title is now `Beanola Platform APIs`, not MIHAS. | `docs/canonical-truth-map.md` |
| UI icon polish | Replaced production/dev UI emoji icons with Lucide icons. | `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`, `apps/admissions/src/components/ui/ActiveSessions.tsx` |

## Verification Commands Run

All commands below were run locally from this workspace on 2026-06-16.

| Command | Result | Notes |
|---|---:|---|
| `cd apps/admissions && bun run type-check` | PASS | TypeScript build check passed. |
| `cd apps/admissions && bun run lint` | PASS | ESLint passed with `--max-warnings 0`. |
| `cd apps/admissions && bun run build` | PASS with warnings | Production build completed. Vite still warns about chunks larger than 650 KB. |
| `cd apps/admissions && bun run check:entry` | PASS | Entry path is 94.4 KB gzipped. |
| `cd apps/admissions && bun x vitest run tests/unit/brandDriftGuard.test.ts tests/unit/documentFlowDriftGuard.test.ts tests/unit/pdf/acceptanceLetterProfiles.test.ts tests/unit/pdf/theme.test.ts tests/unit/documentUiStates.test.tsx` | PASS | 66 tests passed. |
| `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py check` | PASS | No Django system-check issues; expected local warnings for missing secret/payment env. |
| `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest tests/unit/test_institution_code_resolution.py tests/property/test_payment_reference.py tests/unit/test_payment_retry_reference_refresh.py -q` | PASS | 17 tests passed. |
| `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python -m pytest tests/unit/test_brand_drift_guard.py tests/unit/test_institution_code_resolution.py tests/unit/test_api_docs.py tests/unit/test_official_document_dedup_guard.py tests/unit/test_scope_drift_guard.py tests/unit/test_unscoped_endpoint_guard.py -q` | PASS | 43 tests passed. |
| `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test ./.venv/bin/python manage.py spectacular --file /tmp/beanola-openapi.yaml` | PASS with 1 warning | 0 schema errors; warning on `CanonicalProgramSerializer.get_available_offerings` type hint. |
| `python3 -m json.tool docs/legacy-brand-allowlist.json` | PASS | Allowlist JSON is valid. |
| `rg` platform-brand scans | PASS for hard platform leaks | No `MIHAS Platform APIs`, `MIHAS Admissions`, `MIHAS-KATC PDF`, `MIHAS/2.0`, `mihas-admin-panel`, `admin@mihas.edu.zm`, or `noreply@mihas.edu.zm` in active scanned platform paths. |
| Structural emoji scan in source pages/components | PASS | No listed structural emoji remains in `apps/admissions/src/pages` or `apps/admissions/src/components`. |

## What Is Implemented

### 1. Platform Ownership And Brand Identity

Beanola is the platform owner and default runtime identity.

Evidence:

- API root HTML says `Beanola Admissions API`.
- OpenAPI settings title is `Beanola Platform APIs`.
- Default email values point to Beanola domains.
- Product SEO defaults use Beanola.
- Runtime platform admin route is no longer `/admin/` for Django; it is
  `/beanola-admin-panel/`.
- Product tenant-management UI is `/admin/tenants`.
- Brand drift guards pass.

Remaining caveat:

- MIHAS/KATC names still appear where they are legitimate tenant seed data,
  legacy compatibility, historical examples, or client-side PDF preview
  fixtures. This is tracked by `docs/legacy-brand-allowlist.json`.

### 2. Canonical Admin Routes

There are two different admin concepts and both are now documented correctly.

| Surface | Canonical route | Purpose |
|---|---|---|
| Product tenant-admin UI | `/admin/tenants` | Beanola super-admin/staff UI for onboarding and managing schools, templates, profiles, assets, staff access, settlement, and audit. |
| Django operational admin | `/beanola-admin-panel/` | Low-level Django admin surface. |

Launch smoke checks must not treat these as interchangeable.

### 3. Tenant Onboarding Foundation

The codebase contains the expected multi-tenant foundation:

- `Institution`, `InstitutionDomain`, `InstitutionAsset`,
  `InstitutionDocumentProfile`, `UserInstitutionMembership`, and `AccessGrant`
  models.
- Admin tenant endpoints under `/api/v1/admin/institutions/...`.
- Frontend tenant service wrappers in `apps/admissions/src/services/admin/tenants.ts`.
- Frontend UI route at `/admin/tenants`.
- Tenant audit service for tenant configuration and access-scope events.
- Routing simulator and offering assignment service.
- Access scope service reused across applications, payments, documents, and
  tenant admin reads.

Risk:

- This foundation has local test evidence, but final production confidence still
  requires staging data validation and production migration evidence.

### 4. Program-First Student Flow

The intended business model is represented in the code:

- Students select a program/canonical program path.
- Backend assignment determines the school/offering/intake context.
- Payment metadata captures Beanola collector plus tenant snapshot.
- Official document generation uses backend tenant profiles/assets, not the
  frontend PDF preview constants.

Evidence:

- `documentFlowDriftGuard` passes and confirms official-download paths do not
  call the local `@/lib/pdf` client generators.
- Backend official document dedup/scope tests pass in the targeted suite.
- Tenant lifecycle and admin journey integration tests exist for deeper runs.

Remaining risk:

- I did not run the full integration suite in this pass. The targeted suite is
  strong, but production release should run the full backend suite including
  tenant lifecycle drills.

### 5. Official Documents

Backend official documents are tenant-aware:

- Official renderers use `InstitutionDocumentProfile`.
- Missing required tenant profile fails visibly instead of falling back to
  frontend constants.
- Provenance includes profile/version/assets/fingerprint.
- Current-version/dedup guards exist.
- Client PDF generators are preview/draft only and guarded away from official
  download paths.

Fix applied:

- The legacy client acceptance-letter preview no longer silently falls back to
  MIHAS for unknown institutions. Unknown now renders a neutral Beanola preview
  profile with no MIHAS/KATC bank leakage.

Remaining cleanup:

- If Beanola wants no MIHAS/KATC strings in active frontend source at all, replace
  the preview fixtures with neutral demo tenants or fetch preview data from the
  backend tenant-profile API.

### 6. Tenant Access Control

The access-control direction is sound:

- Staff scope comes from `AccessScopeService`, not role name alone.
- Out-of-scope application/document/payment reads are masked as not-found.
- No-scope staff get empty/zero scoped results.
- Super-admin remains global.
- Tenant audit records scope denials and tenant configuration actions.

Evidence:

- Targeted scope drift and unscoped endpoint tests passed.
- Backend tests explicitly verify unknown institution application numbers use
  platform code `BNL`, not MIHAS.

Remaining release requirement:

- Run full cross-tenant isolation tests and tenant lifecycle drills against the
  release branch and staging database before production.

## Performance Postmortem

### Build Output

Final production build:

- `dist/` size: **38 MB**
- Entry + preloaded chunks: **94.4 KB gzip**
- Main CSS: **132.6 KB raw / 22.0 KB gzip**
- HTML CSP check: PASS
- Critical CSS inlined: yes
- Vite warning: chunks larger than 650 KB

### Entry Path

`bun run check:entry` reports:

| Chunk | Raw | Gzip |
|---|---:|---:|
| `index-BQaMz6I5.js` | 83.6 KB | 25.8 KB |
| `vendor-react-u60liKnQ.js` | 194.2 KB | 64.6 KB |
| `LandingPage-DQ-Xenbm.js` | 12.9 KB | 4.1 KB |
| **Total entry path** | | **94.4 KB gzip** |

Verdict:

- First paint JavaScript is in a good range.
- The public landing page is not pulling the PDF engines into the entry path.
- Route lazy-loading is doing useful work.

### Largest Lazy Chunks

| File | Raw | Gzip | Risk |
|---|---:|---:|---|
| `vendor-react-pdf-Defw06-u.js` | 1,435,536 B | 474,835 B | Very large document-generation chunk. Lazy, but expensive when downloaded. |
| `vendor-pdf-kfa3qnuz.js` | 806,556 B | 297,151 B | Large PDF tooling chunk. Lazy. |
| `vendor-sentry-B9sTa0ut.js` | 431,341 B | 138,830 B | Monitoring bundle is sizable. Confirm it is not loaded before needed. |
| `index-BnvnPJus.js` | 283,702 B | 76,084 B | Feature chunk; identify owner before optimizing. |
| `html2canvas.esm-CyxsxQj2.js` | 199,435 B | 45,619 B | Lazy export/capture path. |
| `Applications-e6_1OBHg.js` | 168,339 B | 40,255 B | Admin-only route chunk. |

Performance verdict:

- **First-load performance is likely acceptable** based on entry size.
- **Whole-app bundle health is not perfect** because document and monitoring
  libraries are heavy. This is acceptable only if lazy isolation stays enforced.
- **Document generation/download flows need their own budget**, because the
  first PDF action can require roughly 772 KB gzipped across the two PDF engines.

Required production performance work:

1. Run Lighthouse mobile on `/`, `/auth/signup`, `/track-application`,
   `/student/dashboard`, and `/admin/dashboard`.
2. Capture p50/p95 API timings on tenant context, catalog offerings, draft save,
   application submit, payment init/status, tenant admin list/detail, official
   document queue/status/download, and settlement summary.
3. Confirm `vendor-react-pdf`, `vendor-pdf`, `html2canvas`, OCR, charts, and
   admin-heavy pages are absent from the entry path in CI.
4. Consider moving PDF generation fully server-side or into a worker boundary if
   document generation becomes a common student action.
5. Review Sentry initialization and sampling so `vendor-sentry` does not hurt
   public route startup.

### Images And Static Assets

Largest image-like files found:

| Asset | Size | Comment |
|---|---:|---|
| `images/signatures/solomon-musonda.png` | 240.7 KB | Tenant signature asset; okay if tenant-document only, avoid loading on public pages. |
| `images/logos/kalulushi training centre logo.png` | 228.0 KB | Tenant logo; PNG needed for PDF, but should not load on Beanola public home. |
| `images/logos/mukuba institute...logo.png` | 191.3 KB | Tenant logo; same constraint. |
| `images/signatures/director-signature.png` | 86.2 KB | Tenant signature. |
| `images/og-image.png` | 53.1 KB | Acceptable. |
| `images/logos/beanolalogo.png` | 49.2 KB | Acceptable; WebP exists at 12.9 KB. |

Recommendation:

- Keep PNG tenant logos only for PDF rendering.
- Use WebP/AVIF for browser UI where possible.
- Verify public Beanola pages do not preload tenant logos/signatures.

## UI And Mobile Postmortem

What improved in current source:

- EducationStep structural emoji labels are already fixed to plain text.
- PaymentStep dev bypass no longer uses emoji.
- ActiveSessions no longer uses emoji device icons.
- Structural emoji scan across pages/components is now clean.

Known UI work remaining:

| Surface | Risk | Action |
|---|---|---|
| `/admin/tenants` | Ten-tab wrapped tab list may be awkward at 360/390 px. | Run Playwright mobile screenshots and overflow/touch-target checks. Consider segmented dropdown or grouped mobile navigation if wrapping is crowded. |
| `/admin/applications` | Dense filters/table/bulk actions need mobile proof. | Confirm intentional horizontal scroll container or convert to cards at mobile widths. |
| Admin dialogs | Several forms are dense. | Verify full-screen/bottom-sheet behavior, focus trap, close/escape behavior, sticky footer, and no clipped fields at 360 px. |
| Student status timeline | Previous audit flagged side-border styling. Source currently uses softer ring/background on the main timeline item, but other navigation/communication components still use `border-l-2`. | Verify this is navigation/list-state styling, not decorative card side-tabs. |
| Existing UI audit docs | `docs/audits/ui-route-critique.md` still has stale issue text for EducationStep emoji. | Either update the audit document or make this postmortem the newer evidence source. |

Production UI gate:

- Run Playwright at 360x800, 390x844, 768x1024, 1024x768, and 1440x900 for
  public, auth, student, and admin routes.
- Fail on horizontal body overflow, clipped button text, touch targets below
  44px, inaccessible icon-only controls, overlapping cards/tables/forms, and
  broken dialog focus.

## Backend And Database Postmortem

What is good:

- Django system check passes.
- OpenAPI generation has zero errors.
- Scope guards and brand guards pass in targeted tests.
- Tenant document profile and asset paths exist.
- Unknown institution defaults use Beanola platform code `BNL`.
- Legacy MIHAS behavior is isolated behind explicitly named compatibility
  paths and tests.

Remaining blockers:

1. **Production migrations not verified here.** This local pass did not apply
   migrations to staging or production.
2. **Production schema drift not proven here.** The plan calls for dry-run,
   staging apply, idempotency apply, validation SQL, backup, production apply,
   and post-apply validation.
3. **OpenAPI warning remains.** `CanonicalProgramSerializer.get_available_offerings`
   needs a type hint or `@extend_schema_field`.
4. **Environment warnings remain in local checks.** `SECRET_KEY` and
   `LENCO_API_SECRET_KEY` are intentionally missing in local/test, but production
   must prove all required env vars are set.
5. **Jobs/automation/integrations modules contain stubs.** They should stay out
   of admissions launch scope unless those domains are explicitly going live.

## Frontend/Backend Sync

Current state:

- Routes and admin endpoint paths are aligned for tenant admin.
- OpenAPI can be generated.
- Frontend service wrappers for tenant admin exist.
- Document UI is guarded to use backend official documents for official flows.

Remaining work:

- Generate a fresh OpenAPI artifact in CI and contract-check all frontend service
  request/response shapes against backend serializers.
- Add or confirm coverage for every tenant admin tab: institution CRUD, domains,
  offerings/rules, routing simulator, required documents, templates, document
  profiles, assets, staff memberships/grants, settlement, audit.
- Confirm frontend error handling maps backend error codes for each tenant-admin
  endpoint, especially recoverable routing failures and out-of-scope 404s.

## Security And Operations

Good signs:

- Schema/docs endpoints require auth in production-mode tests.
- Django admin is no longer on `/admin/`.
- Rate-limit middleware references `/beanola-admin-panel/`.
- Tenant scope denials are audited.
- Out-of-scope records are masked as not-found.
- Brand drift is test-enforced.

Required before production:

- Confirm secure production settings: `DEBUG=False`, strong `SECRET_KEY`, secure
  cookies, trusted origins, CORS/CSRF hosts, HTTPS, HSTS, CSP, rate limits, email
  credentials, payment credentials, object-storage credentials, Sentry DSN.
- Execute backup/restore drill.
- Confirm tenant asset upload security with production object storage.
- Confirm audit retention and sensitive metadata redaction.
- Confirm super-admin account recovery and break-glass procedure.

## Final Issue Register

| Priority | Issue | Current status | Required exit evidence |
|---|---|---|---|
| P0 | Production DB migrations and schema validation not executed in this local pass. | Open | Staging + production migration log, validation SQL, backup proof, rollback/disable posture. |
| P0 | No production smoke test evidence. | Open | Smoke checklist executed against deployed frontend/backend, including `/admin/tenants` and `/beanola-admin-panel/`. |
| P1 | Lighthouse mobile and live API timings deferred. | Open | Five-route Lighthouse reports and p50/p95 API timing table. |
| P1 | `/admin/tenants` mobile behavior unproven. | Open | Playwright screenshots and DOM overflow/touch-target checks at mobile sizes. |
| P1 | `/admin/applications` mobile dense table behavior unproven. | Open | Mobile screenshots proving scroll/card strategy and readable controls. |
| P1 | Large lazy PDF chunks remain. | Accepted with guard | CI entry-path guard plus document-action performance budget. |
| P1 | Client PDF preview still contains MIHAS/KATC tenant sample profiles. | Accepted with guard | Keep allowlist tight or replace with neutral demo/backend-driven preview. |
| P2 | OpenAPI schema warning for `get_available_offerings`. | Open | Add explicit schema field/type hint and regenerate schema with zero warnings. |
| P2 | Existing UI audit doc has stale EducationStep emoji finding. | Open | Update `docs/audits/ui-route-critique.md` or mark superseded by this report. |
| P2 | Jobs/automation/integrations stubs exist. | Scoped out | Confirm `ENABLE_JOBS_OPS_ROUTES=False` for admissions launch unless those modules are shipping. |

## Production-Ready Definition From Here

Do not mark the system production-ready until all of these are true:

1. Full frontend validation passes: type-check, lint, build, unit/property tests,
   Playwright mobile/desktop smoke.
2. Full backend validation passes: Django check, full pytest suite including
   tenant lifecycle/admin/student journeys, OpenAPI generation with zero errors
   and ideally zero warnings.
3. Brand scans pass with only reviewed tenant/legacy/preview allowlist entries.
4. Production/staging database migration evidence is captured.
5. Tenant onboarding smoke works end to end: school create, logo/signature asset,
   document profile/template, program/offering assignment, staff membership,
   access grant, routing simulator, student application, payment, official
   document generation, scoped staff visibility, super-admin global visibility.
6. Performance evidence meets thresholds: public Lighthouse mobile >= 90,
   authenticated/admin >= 80, entry path remains under budget, API p95 targets
   are defined and met.
7. Operational readiness is proven: env vars, backups, logs, Sentry, health
   checks, payment provider, email provider, object storage, rollback posture.

## Bottom Line

The application has moved substantially from a two-school admissions app to a
Beanola-owned multi-tenant platform. The biggest code-level brand leaks found in
this verification were fixed. The current local evidence is strong enough to say
the migration is **code-close**, not strong enough to say it is **production
complete**. The remaining work is mainly production evidence, mobile rendered
proof, full-suite execution, and performance validation under staging conditions.
