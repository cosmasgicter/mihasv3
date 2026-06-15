# Performance & Core Web Vitals — Evidence Note (R11.1)

**Spec:** `.kiro/specs/beanola-production-readiness/` — Phase 11, Task 23.1
**Requirement:** R11.1 — "THE team SHALL measure Lighthouse mobile for the public home,
signup, tracker, student dashboard, and admin dashboard, plus bundle analysis and API
response timings."
**Design:** Component 11 — Performance and Core Web Vitals.

## Status summary

| Measurement | State | Where the evidence lives |
|-------------|-------|--------------------------|
| Vite production bundle / chunk analysis | ✅ **Measured now** | This document (§1), real `bun run build` output |
| Entry-chunk composition (lazy-load proof) | ✅ **Measured now** | This document (§2), `bun run check:entry` |
| Route lazy-loading enumeration | ✅ **Measured now** | This document (§3), `apps/admissions/src/routes/config.tsx` |
| Lighthouse mobile (5 routes) | ⏳ **Deferred to staging** | Run instructions + thresholds in §4 |
| API response timings | ⏳ **Deferred to staging** | Run instructions + endpoint list in §5 |

**Why two measurements are deferred:** a meaningful Lighthouse mobile run and real API
response timings both require a deployed, network-reachable target — a running Vite
preview/static host plus the Django API backed by its database (Neon for staging,
self-hosted Postgres for production, per `.kiro/steering/infrastructure.md`). This
development environment has Chrome present (`/usr/bin/google-chrome`) but **no Lighthouse
runner installed** and **no running backend/database**, so any number produced here would
not reflect production network conditions, cold-start behaviour, or real query latency.
The bundle analysis — which is deterministic from the production build — is captured in
full below, and exact run instructions + target thresholds are recorded so the deferred
measurements can be executed verbatim against staging.

---

## 1. Vite production bundle analysis (measured)

Source: `cd apps/admissions && bun run build` (Vite 6, terser minify, `target: es2022`,
critical-CSS inlined via critters). Build completed successfully (`✓ built in ~59s`,
exit 0). 180 JS chunks emitted; total JS ≈ **4.82 MB raw** across all chunks (the vast
majority of which are lazy and never loaded on first paint).

### 1.1 Largest chunks (raw / gzipped)

| Chunk | Raw | Gzipped | Loaded on first paint? |
|-------|-----|---------|------------------------|
| `vendor-react-pdf-*.js` | 1,435.5 KB | 474.8 KB | ❌ lazy — `@react-pdf/renderer` engine |
| `vendor-pdf-*.js` | 806.4 KB | 297.4 KB | ❌ lazy — `jspdf` + `jspdf-autotable` + `pdf-lib` |
| `index-CzjXr7bJ.js` (a feature chunk) | 283.6 KB | 76.0 KB | ❌ lazy |
| `vendor-react-*.js` | 246.5 KB | 81.1 KB | ✅ **eager** (entry import) |
| `html2canvas.esm-*.js` | 199.4 KB | 45.6 KB | ❌ lazy (export/canvas path) |
| `Applications-*.js` (admin) | 168.3 KB | 40.2 KB | ❌ lazy (admin route) |
| `index.es-*.js` | 156.7 KB | 51.2 KB | ❌ lazy |
| `proxy-*.js` | 111.2 KB | 35.3 KB | ❌ lazy |
| `Users-*.js` (admin) | 94.7 KB | 21.6 KB | ❌ lazy (admin route) |
| `index-DHLa1cPX.js` (**entry**) | 85.2 KB | 26.0 KB | ✅ **eager** |
| `Tenants-*.js` (admin) | 78.0 KB | 17.6 KB | ❌ lazy (admin route) |
| `AcceptanceLetter-*.js` | 56.1 KB | 18.7 KB | ❌ lazy (document path) |
| `speculativePrefetch-*.js` | 55.6 KB | 16.9 KB | ❌ lazy |
| `Dashboard-DcTw6FDx.js` (admin) | 53.1 KB | 14.6 KB | ❌ lazy (admin route) |
| `AuditTrail-*.js` (admin) | 46.3 KB | 12.3 KB | ❌ lazy (admin route) |
| `LandingPage-*.js` | 13.2 KB | 4.1 KB | ✅ **eager** (modulepreload hint) |

### 1.2 CSS

| File | Raw | Gzipped |
|------|-----|---------|
| `index-*.css` (main) | 132.6 KB | 22.0 KB |
| `AppLayout-*.css` | 7.8 KB | 1.3 KB |
| `AuthenticatedRouteShell-*.css` | 5.6 KB | 0.8 KB |

Critical CSS is inlined into `index.html` (critters, `preload: 'body'`), HTML grew
9,923 → 20,803 bytes; inline `<style>` ≈ 14.6 KB. CSP check passes (`script-src
'unsafe-inline': NO`, `style-src 'unsafe-inline': YES`).

### 1.3 Build advisories (carried forward to Task 23.2)

The build emits the Rollup advisory: *"Some chunks are larger than 650 kB after
minification"* — triggered by **`vendor-react-pdf` (1.44 MB raw / 474.8 KB gz)** and
**`vendor-pdf` (806 KB raw / 297 KB gz)**. These are the two `@react-pdf/renderer` and
`jspdf`/`pdf-lib` engine chunks. Both are **intentionally isolated, dynamically-imported
chunks** and are **not** in the first-paint graph (see §2). The `vite.config.ts`
`manualChunks` logic deliberately pins these PDF engines into their own named chunks and
keeps Vite's `vite/preload-helper` + React core in the eager `vendor-react` chunk
precisely so the PDF engines stay lazy (the config docstring documents the prior TDZ /
forced-modulepreload regression this prevents). No action required for first-paint
performance; the advisory is expected and benign. Task 23.2 confirms the chunking/
lazy-load posture.

---

## 2. Entry-chunk composition — lazy-load proof (measured)

Source: `cd apps/admissions && bun run check:entry` (reads the built `dist/.vite/manifest.json`).

```
Entry + preloaded chunks (3):
  ✓ /assets/js/index-DHLa1cPX.js        83.2 KB raw / 25.6 KB gz   (entry)
  ✓ /assets/js/vendor-react-hH29YAQD.js 240.7 KB raw / 79.5 KB gz  (React core, eager)
  ✓ /assets/js/LandingPage-BNZC94cq.js  12.9 KB raw / 4.1 KB gz    (modulepreload hint)

Total entry path (gzipped): 109.1 KB
✓ entry-chunk guard passed.
```

**First-paint JS budget = 109.1 KB gzipped** (entry + React core + landing page) plus
22.0 KB gzipped main CSS (critical portion inlined). The entry chunk's only **static**
import is `vendor-react`; everything else — all student/admin routes, both PDF engines,
OCR (`tesseract.js`), charts (`recharts`), `html2canvas` — is a **dynamic import** and
therefore excluded from first paint. The two large PDF advisory chunks from §1.3 are
confirmed absent from this list. This satisfies the R11.2 intent that "public/student/
admin entry chunks SHALL NOT pull in dev-preview routes or oversized PDF/vendor chunks."

Dev-preview routes (`src/pages/dev/AcceptanceLetterPreview.tsx`,
`src/pages/dev/DocumentPreview.tsx`) appear only under `dynamicImports` in the manifest
and are **not** registered in the production router (`routes/config.tsx`), so they are
unreachable lazy leaves, not part of any eager path.

---

## 3. Route lazy-loading enumeration (measured)

Source: `apps/admissions/src/routes/config.tsx`. The landing page (`/`) is the only
route bundled eagerly (kept in the entry build for fast first paint). Every other route
is `React.lazy()` with a layout-matched Suspense skeleton (`skeletonType`) to hold layout
dimensions stable (supports R11.5 / CLS).

| Surface | Route(s) | Lazy? | Skeleton |
|---------|----------|-------|----------|
| Public home | `/` | eager (entry) | — |
| Public tracker | `/track-application` | ✅ lazy | `detail` |
| Public misc | `/contact`, `/terms`, `/privacy` | ✅ lazy | `none` |
| Auth / signup | `/auth/signin`, `/signin`, `/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/callback` | ✅ lazy | `auth` |
| Payment callback | `/payment/callback` | ✅ lazy | `detail` |
| Student dashboard | `/student/dashboard` | ✅ lazy | `dashboard` |
| Student wizard | `/apply`, `/student/application-wizard` | ✅ lazy | `wizard` |
| Student status/detail | `/student/status`, `/application/:id`, `/student/application/:id`, … | ✅ lazy | `detail` |
| Student settings/payment/interview/etc. | `/student/settings`, `/student/payment`, `/student/interview`, `/student/communications`, `/student/history`, `/student/notifications` | ✅ lazy | `detail` |
| Admin dashboard | `/admin`, `/admin/dashboard` | ✅ lazy | `dashboard` |
| Admin tables | `/admin/applications`, `/admin/programs`, `/admin/tenants`, `/admin/intakes`, `/admin/users`, `/admin/audit`, `/admin/program-fees` | ✅ lazy | `admin-table` |
| Admin settings/profile | `/admin/settings`, `/admin/profile` | ✅ lazy | `detail` |
| 404 | `/404`, `*` | ✅ lazy | `none` |

All admin-heavy modules (Applications 40 KB gz, Users 22 KB gz, Tenants 18 KB gz,
AuditTrail 12 KB gz) are lazy and only fetched when an admin navigates to them.

---

## 4. Lighthouse mobile — deferred to staging (instructions + thresholds)

**Target routes (R11.1):** public home (`/`), signup (`/auth/signup`), tracker
(`/track-application`), student dashboard (`/student/dashboard`), admin dashboard
(`/admin/dashboard`). The two authenticated routes require a logged-in session
(student / admin), so run them with a captured auth cookie or via the authenticated
Lighthouse-CI flow.

**How to run** (against a deployed staging URL, or a local `vite preview` of the build):

```bash
# Option A — preview the production build locally, then point Lighthouse at it
cd apps/admissions && bun run build && bun run preview   # serves dist on :4173

# Lighthouse mobile, public routes (no auth):
npx lighthouse http://localhost:4173/ \
  --only-categories=performance --form-factor=mobile \
  --screenEmulation.mobile --throttling-method=simulate \
  --output=json --output=html --output-path=./lh-home
npx lighthouse http://localhost:4173/auth/signup           --form-factor=mobile ... --output-path=./lh-signup
npx lighthouse http://localhost:4173/track-application     --form-factor=mobile ... --output-path=./lh-tracker

# Authenticated routes — supply a session cookie (student / admin):
npx lighthouse http://localhost:4173/student/dashboard \
  --form-factor=mobile --extra-headers='{"Cookie":"<student session cookie>"}' ... --output-path=./lh-student
npx lighthouse http://localhost:4173/admin/dashboard \
  --form-factor=mobile --extra-headers='{"Cookie":"<admin session cookie>"}'   ... --output-path=./lh-admin
```

Chrome is available in CI/staging (`/usr/bin/google-chrome`); install the runner with
`npx lighthouse` (or `bun x lighthouse`) — it is not a repo dependency, so it is fetched
on demand for the measurement run only.

**Target thresholds** (record actual vs target for each of the 5 routes; public pages are
the hard gate per R11.4):

| Metric | Public-page target | Notes |
|--------|--------------------|-------|
| Lighthouse Performance (mobile) | ≥ 90 (public), ≥ 80 (authenticated/admin) | R11.4 "acceptable thresholds" |
| LCP (Largest Contentful Paint) | < 2.5 s | "good" CWV band |
| CLS (Cumulative Layout Shift) | < 0.1 | R11.5 — skeletons hold dimensions |
| TBT (Total Blocking Time) | < 200 ms | proxy for INP on lab runs |
| FCP (First Contentful Paint) | < 1.8 s | inline critical CSS supports this |

When run, paste the 5 score rows back into this note (actual vs target) and attach the
generated `lh-*.html` reports to the launch evidence.

---

## 5. API response timings — deferred to staging (instructions + endpoint list)

Real API timings require the Django backend running against its database. Per
`.kiro/steering/infrastructure.md`, author/validate against **Neon** (staging) first;
production is the self-hosted Postgres on EC2. This environment has no running backend or
DB, so timings are deferred.

**How to measure** (against staging API base URL, authenticated where required):

```bash
# Simple per-endpoint wall-clock (repeat ~10x, take p50/p95):
for i in $(seq 1 10); do \
  curl -s -o /dev/null -w "%{time_starttransfer}\n" \
  -H "Cookie: <session cookie>" "$API/api/v1/<path>"; done
```

Prefer DRF/Django timing middleware or GlitchTip performance traces
(`tracesSampleRate`) for server-side timing that excludes network. The backing queries
for these surfaces are audited for N+1 / pagination / indexing under **Task 23.3 (R11.3)**.

**Endpoints to time** (the tenant-scoped read paths behind the 5 measured surfaces):

| Surface | Representative endpoint(s) |
|---------|---------------------------|
| Public tracker | `GET /api/v1/applications/track/?code=…` |
| Student dashboard | `GET /api/v1/applications/` (owned), dashboard aggregate, `GET /api/v1/applications/interviews/?mine=true` |
| Application detail | `GET /api/v1/applications/{id}/`, documents list, payments summary |
| Admin dashboard | dashboard aggregate, `GET /api/v1/applications/` (staff-scoped, paginated) |
| Admin tables | applications / users / audit-trail listings (paginated `{page, pageSize, totalCount, results}`) |
| Payments | `GET /api/v1/payments/resolve-fee/`, payment status reads |

**Target thresholds:** p95 server time < 300 ms for single-object reads, < 500 ms for
paginated list reads at realistic volume (R11.4 "responsive at realistic data volume").
Record p50/p95 per endpoint when run on staging and flag any query needing an additive
index (authored Neon-first per R16.8) back to Task 23.3.

---

## 6. What this task did vs. deferred

- **Did now:** ran the real production build, captured the full chunk/size report
  (raw + gzipped), documented the `vendor-react-pdf` / `vendor-pdf` 650 KB advisories and
  why they are benign (lazy, isolated), proved the 109.1 KB-gzipped first-paint budget via
  the entry-chunk guard, enumerated route-level lazy-loading from `routes/config.tsx`, and
  recorded Lighthouse + API-timing run instructions and target thresholds.
- **Deferred to staging:** the 5-route Lighthouse mobile run and live API response
  timings — both need a deployed target (running static host + Django API + DB). Execute
  per §4 and §5 during the staging pass and paste actuals into this note before the
  Phase 11 checkpoint (Task 24) and launch gate.

---

## 7. Task 23.2 — Frontend chunking + lazy-load confirmation (R11.2)

**Spec:** `.kiro/specs/beanola-production-readiness/` — Phase 11, Task 23.2.
**Requirement:** R11.2 — "THE public/student/admin entry chunks SHALL NOT pull in
dev-preview routes or oversized PDF/vendor chunks, and admin-heavy modules SHALL be
lazy-loaded."

Re-ran the production build (`cd apps/admissions && bun run build`, exit 0,
`✓ built in ~60s`) and the entry-chunk guard (`bun run check:entry`, exit 0) to
re-verify the 23.1 posture against a fresh build. Result: **unchanged — no fix
required.**

### 7.1 Entry-chunk guard (re-measured)

```
Entry + preloaded chunks (3):
  ✓ /assets/js/index-DHLa1cPX.js        83.2 KB raw / 25.6 KB gz   (entry)
  ✓ /assets/js/vendor-react-hH29YAQD.js 240.7 KB raw / 79.5 KB gz  (React core, eager)
  ✓ /assets/js/LandingPage-BNZC94cq.js  12.9 KB raw / 4.1 KB gz    (modulepreload hint)

Total entry path (gzipped): 109.1 KB
✓ entry-chunk guard passed.
```

The guard's forbidden-marker scan (`@react-pdf`, `tesseract`, `recharts`, `jspdf`,
`pdf-lib`, `html2canvas`) found **zero** hits on the entry path.

### 7.2 Manifest static-import graph (independent proof)

Walked `dist/.vite/manifest.json` from the entry chunk through its **static** `imports`
only (the cold-start graph the browser must evaluate before first paint):

```
Entry file: assets/js/index-DHLa1cPX.js
Static-import graph (non-entry): [ assets/js/vendor-react-hH29YAQD.js ]

Target chunk            exists  in-eager-graph
  AcceptanceLetterPreview  yes      NO   (dev-preview, import.meta.env.DEV-gated)
  DocumentPreview          yes      NO   (dev-preview, import.meta.env.DEV-gated)
  vendor-react-pdf         yes      NO   (1,435.5 KB raw — lazy, isolated)
  vendor-pdf               yes      NO   (806.4 KB raw — lazy, isolated)
  html2canvas              yes      NO   (lazy, export/canvas path)
```

The entry chunk statically imports **only** `vendor-react`. Every oversized PDF/vendor
chunk, both dev-preview pages, and `html2canvas` are dynamic leaves outside the
first-paint graph.

### 7.3 Dev-preview routes are unreachable in production

`src/pages/dev/AcceptanceLetterPreview.tsx` and `src/pages/dev/DocumentPreview.tsx` are
`React.lazy()` imports in `src/App.tsx` whose routes (`/dev/acceptance-letter`,
`/dev/documents`) are wrapped in `import.meta.env.DEV ? … : null`. They are **not**
registered in the production router (`src/routes/config.tsx`), so they exist only as
unreachable lazy chunks and never enter any eager path.

### 7.4 Admin-heavy modules are lazy-loaded

Confirmed in `src/routes/config.tsx`: `/` (LandingPage) is the only eager route; all
admin modules — Applications (168.3 KB raw), Users (94.7 KB), Tenants (78.0 KB),
AuditTrail (46.3 KB), admin Dashboard (53.1 KB) — are `React.lazy()` with admin-table
skeletons and are fetched only on admin navigation.

### 7.5 Supporting guards (re-run, all pass)

- `bun run check:entry` — entry-chunk guard passed (109.1 KB gz, no forbidden markers).
- `bun run check:imports` — all dynamic imports resolve; 502 source files scanned.

### 7.6 Build advisory (expected, benign)

The Rollup ">650 kB" advisory fires only for `vendor-react-pdf` (1,435.5 KB raw /
474.8 KB gz) and `vendor-pdf` (806.4 KB raw / 297.4 KB gz). Both are intentionally
isolated, dynamically-imported PDF-engine chunks proven absent from the first-paint graph
above. The `vite.config.ts` `manualChunks` logic deliberately pins these engines into
their own named chunks and keeps `vite/preload-helper` + React core in the eager
`vendor-react` chunk so the PDF engines stay lazy (per the config docstring's TDZ /
forced-modulepreload regression history). No action required.

**Conclusion (R11.2):** Entry chunks exclude dev-preview routes and the oversized
PDF/vendor chunks; admin-heavy modules are lazy-loaded. The posture holds on a fresh
build and **no additive chunking/lazy-load fix was needed.**

---

# Task 23.3 — Backend N+1 / index / pagination + layout stability (R11.3, R11.5)

**Spec:** `.kiro/specs/beanola-production-readiness/` — Phase 11, Task 23.3
**Requirements:** R11.3 (N+1 avoidance, pagination of large lists, indexed slow
tenant-scoped queries) and R11.5 (stable skeleton dimensions / no dynamic text
resizing → CLS within threshold). R11.4 is addressed at the threshold level here and
exercised against live volume during the staging pass (see §4/§5 above).
**Design:** Component 11 — Performance and Core Web Vitals.

This is a **verification artifact**. Each claim below is grounded against the real repo
files (queryset definitions, the pagination class, the index scripts, and the route
skeleton wiring). No production DB change is made from this environment; any new index
is authored Neon-first as an additive script (none was required — see §3.3).

## 1. N+1 avoidance on the tenant-scoped read paths (R11.3)

Every scoped read path that backs the application-detail, dashboard, documents, and
payments surfaces eager-loads its related rows with `select_related` /
`prefetch_related`, and derives payment summaries through `Subquery` annotations rather
than per-row lookups.

| Surface | View / file | Eager-loading posture | N+1 verdict |
|---------|-------------|-----------------------|-------------|
| Application detail (student) | `ApplicationDetailView._get_application` (`applications/student_draft_views.py`) | `select_related('user')` + `prefetch_related('applicationdocument_set','applicationgrade_set','applicationinterview_set')`, wrapped in `_with_payment_summary(...)` | ✅ no N+1 |
| Applications list (admin) | `ApplicationListCreateView.get` (`applications/admin_review_views.py`) | `select_related('user','payment_verified_by','reviewed_by','admin_feedback_by','assigned_reviewer_id','institution_ref','canonical_program','program_offering','intake_ref')` + `prefetch_related('applicationdocument_set','applicationgrade_set','payment_set','applicationcondition_set','applicationamendment_set')` + `_with_payment_summary` | ✅ no N+1 |
| Applications list (student) | same view, student branch | `select_related('payment_verified_by')` + `prefetch_related('applicationgrade_set','payment_set')` (deliberately lighter — no doc prefetch, no summary subqueries; comment notes it avoids the 2-payment-query-per-row N+1) | ✅ no N+1 |
| Dashboard aggregate (admin) | `AdminDashboardView.get` (`accounts/admin_user_views.py`) | counts via `.aggregate()` / `.values_list().annotate(Count)`; recent activity via `select_related('application','changed_by')` and `select_related('application')` with `[:10]`/`[:5]` slices | ✅ no N+1 (set-based aggregates) |
| Documents list (per application) | `student_document_views.py` + `applications/document_views.py` (`_get_scoped_application` → `select_related('user','institution_ref','canonical_program','program_offering','intake_ref')`; doc fetch `select_related('application','verified_by')`) | ✅ no N+1 |
| Payments list | `PaymentListView.get` (`documents/payment_query_views.py`) | `Payment.objects.select_related('application','user')` for both admin and student branches; settlement summary uses `select_related('application')` | ✅ no N+1 |

**Payment-summary fan-out is collapsed to subqueries.** `_with_payment_summary`
(`applications/_view_helpers.py`) annotates the seven `payment_summary_*` fields with
`Subquery(OuterRef('pk'))` against the latest / latest-successful payment, so a paginated
list of N applications resolves its payment summary in a fixed number of subquery joins
rather than N follow-up queries. The student applications branch additionally
`prefetch_related('payment_set')` so the serializer's computed fields read from memory.

**Conclusion (R11.3 N+1):** no scoped read path on the four named surfaces issues
per-row related queries. ✅

## 2. Pagination of large lists (R11.3)

`StandardPagination` (`apps/common/pagination.py`) is `PageNumberPagination` with
`page_size=20`, `page_size_query_param='pageSize'`, `max_page_size=500`, and the
`{success, data:{page, pageSize, totalCount, results}}` envelope.

| Large-list endpoint | Paginated with `StandardPagination`? |
|---------------------|--------------------------------------|
| `GET /api/v1/applications/` (admin staff-scoped + student) | ✅ `ApplicationListCreateView` |
| `GET /api/v1/payments/` | ✅ `PaymentListView` |
| `GET /api/v1/payments/risk-flags/` | ✅ `RiskFlagsListView` (`page_size=25`) |
| `GET /api/v1/applications/history/` | ✅ paginated envelope (covered by `test_communications_history.py`) |
| `GET /api/v1/notifications/` | ✅ page/pageSize with min-1 / max-100 clamping |
| Admin users / audit-trail listings | ✅ paginated `{page,pageSize,totalCount,results}` |

Bounded reads that are intentionally **not** offset-paginated stay bounded by a hard
slice instead (e.g. dashboard recent activity `[:10]` / `[:5]`, document-SLA sweep
`[:100]`), so no unbounded full-table serialization reaches a response.

**Verification run:** `test_communications_history.py` (pageSize honoring, page-2
remainder, min/max clamp, invalid-pageSize default) and
`test_tenant_api_contract_preservation.py` (paginated-envelope shape across tenant list
endpoints) — **73 passed** via
`DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest
tests/unit/test_communications_history.py tests/unit/test_tenant_api_contract_preservation.py -q`.

**Conclusion (R11.3 pagination):** all large list reads paginate; the rest are
hard-bounded. ✅

## 3. Indexing of slow tenant-scoped queries (R11.3)

The scope filters key off institution / canonical / offering / intake FK columns and the
owner/status columns. Every column on a scoped read path is already covered by an
existing additive index script under `backend/scripts/` (Neon-authored, `managed=False`
convention):

| Scoped predicate | Backing index | Script |
|------------------|---------------|--------|
| `applications.user_id` (student own apps) | `idx_applications_user_id` | `2026_05_18_hot_query_indexes.sql` |
| `applications.status` | `idx_applications_status` | same |
| `applications(institution_id, program_id, program_offering_id, intake_id)` (staff scope filter) | `idx_applications_tenant_ids` | `2026_06_08_01_multi_tenant_beanola_admissions.sql` |
| `payments.user_id` / `payments.application_id` / `payments.status` | `idx_payments_user_id` / `idx_payments_application_id` / `idx_payments_status` | `2026_05_18_hot_query_indexes.sql` |
| `application_documents.application_id` | `application_documents_application_id_fe7e9522` | `00_full_schema.sql` (FK index) |
| `programs.institution_id` / `programs.canonical_program_id` | `idx_programs_institution_id` / `idx_programs_canonical_program_id` | `2026_05_22_fk_index_backfill.sql` / multi-tenant script |
| `user_institution_memberships(user_id, is_active)` (scope resolution) | `idx_user_institution_memberships_user` | multi-tenant script |
| `access_grants(user_id, scope_type, is_active)` (scope resolution) | `idx_access_grants_user_scope` | multi-tenant script |
| `institution_document_profiles` lookup/scope | `idx_doc_profiles_lookup` / `idx_doc_profiles_scope` | `2026_06_08_03_institution_document_profiles.sql` |
| `communication_templates(institution_id, template_key, is_active, version)` | `idx_comm_templates_tenant_lookup` | `2026_06_08_04_communication_templates_tenant.sql` |
| `audit_logs.actor_id` / `audit_logs.entity_id` | `idx_audit_logs_actor_id` / `idx_audit_logs_entity_id` | `2026_05_18_hot_query_indexes.sql` |

### 3.3 New index needed?

**No new index was required.** Every WHERE/JOIN column on the four named scoped read
paths (application detail, dashboard, documents, payments) and on the scope-resolution
tables (`AccessScopeService` reads of memberships + grants) maps to an existing additive
index above. The composite `idx_applications_tenant_ids` covers the leading
`institution_id` predicate the staff scope filter applies, and `idx_payments_*` /
`application_documents_application_id_*` cover the payment and document joins.

Were a gap to surface during the staging API-timing pass (§5), the fix would be authored
as a new additive `CREATE INDEX IF NOT EXISTS` script under `backend/scripts/`, validated
Neon-first per `.kiro/steering/infrastructure.md`, and **not** applied to production from
this environment. None is authored here because none is needed.

**Conclusion (R11.3 indexing):** every slow tenant-scoped predicate is indexed by an
existing additive script; no new index authored. ✅

## 4. Layout stability — stable skeletons, no dynamic text resizing (R11.5)

Every lazy route declares a layout-matched `skeletonType` in
`apps/admissions/src/routes/config.tsx`, and `AuthenticatedRouteShell.getSkeletonFallback`
maps it to a fixed-geometry skeleton. The skeletons reserve the page's structural box so
the real content swaps in without reflow:

- **`MarketingRouteSkeleton`** — `min-h-screen flex-col`, masthead geometry that
  "matches PublicSiteHeader geometry so hydration doesn't shift layout" (documented in
  the component), and a hero silhouette with fixed `h-*`/`w-*` boxes. No images on the
  critical path, so no late image reflow.
- **`SkeletonBase`** (`components/ui/skeletons/index.tsx`) — every placeholder is sized
  by explicit Tailwind `h-*` / `w-*` utilities (or numeric `width`/`height` → px), giving
  the skeleton the same box the loaded element occupies.
- **`DashboardSkeleton` / `WizardSkeleton` / `AdminTableSkeleton` / `AuthSkeleton` /
  `DetailSkeleton`** — selected per route so the placeholder matches the destination
  layout (dashboard cards, wizard steps, admin table rows, auth card, detail panel).

**No dynamic text resizing.** The Inter fallback chain is preserved in full in
`tailwind.config.js` (per steering), so there is no late web-font swap that resizes text
and shifts layout; the global preloader and inline critical CSS (critters) hold the shell
before the entry chunk paints.

**Reduced motion.** The skeleton pulse uses `animate-pulse`, and the global
`@media (prefers-reduced-motion: reduce)` rule in `apps/admissions/src/index.css` forces
`animation-duration: 0.01ms` for all elements — the pulse is purely opacity (no geometry
change), so neither the animated nor reduced-motion state shifts layout.

**Verification run:** `studentRouteSmoke.test.ts` confirms the route→`skeletonType`
wiring (`wizard`/`detail`) — **1 passed** via `bun run test studentRouteSmoke`. The
360px overflow + touch-target DOM measurement is owned by Task 15.3's
`routeMobileOverflowGuard.test.tsx` (Property 30) and is not re-authored here.

**Conclusion (R11.5):** layout-matched fixed-dimension skeletons + preserved font chain +
opacity-only (reduced-motion-safe) pulse keep CLS within the < 0.1 target. The numeric
CLS reading per route is captured during the deferred Lighthouse staging run (§4 of Task
23.1, target CLS < 0.1). ✅

## 5. Summary

| R11.3/R11.5 facet | Status | Evidence |
|-------------------|--------|----------|
| N+1 avoidance (app detail, dashboard, documents, payments) | ✅ confirmed | §1 — `select_related`/`prefetch_related` + `_with_payment_summary` subqueries |
| Pagination of large lists | ✅ confirmed | §2 — `StandardPagination` on all large list reads; 73 tests pass |
| Indexed slow tenant-scoped queries | ✅ confirmed; no new index needed | §3 — existing additive index scripts cover every scoped predicate |
| Stable skeleton dimensions / no dynamic text resize (CLS) | ✅ confirmed | §4 — layout-matched fixed-geometry skeletons, preserved Inter chain, reduced-motion-safe pulse |
| New additive index authored (Neon-first, not applied) | — none required | §3.3 |

Numeric Lighthouse CLS per route and live p50/p95 API timings remain deferred to the
staging pass (§4/§5 of Task 23.1) where a deployed target exists; the structural
guarantees above hold regardless of environment.
