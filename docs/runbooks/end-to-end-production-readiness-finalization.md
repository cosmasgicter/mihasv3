# End-to-End Production Readiness Finalization Runbook

Last updated: 2026-06-22

## Purpose

This runbook is the final execution plan for taking the Beanola admissions
platform from "major implementation complete" to "100% end-to-end production
ready".

It covers the remaining gaps from the verification pass:

- Missing launch evidence for migration, smoke, performance, mobile UI, and
  onboarding.
- Performance cache rollout not yet proven in production settings.
- Notification polling still using the count-based list path.
- Postgres-specific validation not yet rerun against a real Postgres target.
- Legacy MIHAS/KATC public and operations surfaces still present.
- A large dirty worktree that is not yet release-shaped.
- Frontend future-readiness: no legacy tenant assumptions, no role-string
  authority, no hard-coded school behavior, and no stale single-tenant code.

The platform is production-ready only when every section below is complete and
the launch rollup returns `production-launch-ready`.

## Non-Negotiable Launch Rules

1. Beanola Technologies is the platform owner and platform identity.
2. MIHAS, KATC, and every other school are tenant data only.
3. Student flows must be program-first. A student chooses a program/offering;
   tenant selection, fees, required documents, branding, signatures, and
   document templates resolve automatically from tenant configuration.
4. Admin authority is capability-based:
   - Super admins manage the platform and all tenants.
   - Tenant admins manage only their assigned tenant scope.
   - Reviewers/approvers see only the applications, documents, payments, and
     actions explicitly granted to them.
5. The frontend must not invent authority from local role strings. It must
   consume `/api/v1/admin/scope/` and `/api/v1/admin/capabilities/`.
6. No production launch is approved without real, readable launch evidence for
   all eleven gates.
7. No production launch is approved while the release branch has accidental
   untracked or unrelated changes.

## Current Known State

The latest verification established:

- Backend targeted tests passed under `config.settings.test`: `68 passed`.
- Frontend targeted Vitest suite passed: `68 passed`.
- `bun run type-check` passed.
- `bun run build` passed with the CSP check.
- Bundle guard passed:
  - Entry path: `139.3 KB gz`, threshold `150 KB`.
  - First PDF action: `757.4 KB gz`, threshold `772 KB`.
  - Sentry absent from public entry path.
- Brand scan passed across the configured active source set.
- Scope gate passes when `ENABLE_JOBS_OPS_ROUTES=False`.
- Rollup still reports `not-production-launch-ready` because these artifacts
  are missing or unreadable:
  - `01-migration/migration-evidence.json`
  - `02-smoke/smoke-evidence.json`
  - `03-performance/performance-evidence.json`
  - `04-mobile-ui/mobile-ui-evidence.json`
  - `10-onboarding/onboarding-evidence.json`

## Canonical Route Map

Use this route map consistently in specs, tests, smoke checks, docs, and UI:

| Surface | Canonical route |
| --- | --- |
| Frontend tenant admin console | `/admin/tenants` |
| Frontend tenant onboarding wizard | `/admin/tenants/new` |
| Backend tenant admin API | `/api/v1/admin/tenants/...` by URL mount and `backend/apps/catalog/admin_urls.py` paths under `/api/v1/admin/` |
| Backend scope endpoint | `/api/v1/admin/scope/` |
| Backend capabilities endpoint | `/api/v1/admin/capabilities/` |
| Django operational admin | `/beanola-admin-panel/` |

Do not use `/beanola-admin-panel/` as the product tenant admin surface. It is
the Django framework admin only.

## Phase 1: Release Hygiene And Branch Control

### Objective

Turn the current dirty worktree into a release-shaped branch that another
engineer can review, test, and deploy.

### Steps

1. Capture the worktree state:

   ```bash
   git status --short
   git diff --stat
   ```

2. Classify every changed/untracked file into one of these buckets:
   - Tenant authority and multi-tenant backend.
   - Frontend tenant admin and multi-tenant UX.
   - Performance hardening.
   - Launch verification and evidence.
   - Branding cleanup.
   - Operational docs/deploy.
   - Unrelated or generated artifact.

3. Remove accidental generated artifacts unless they are required launch
   evidence. Do not delete user work. If a file is unclear, mark it for manual
   review in the release notes.

4. Split the work into reviewable commits or PRs:
   - PR 1: tenant authority and backend scoping.
   - PR 2: frontend tenant admin and capability-driven navigation.
   - PR 3: performance hardening and notification cursor polling.
   - PR 4: launch evidence and runbooks.
   - PR 5: final legacy branding purge.

5. Each PR must include:
   - Scope summary.
   - Risk summary.
   - Tests run.
   - Evidence artifacts created or updated.
   - Rollback path.

### Exit Criteria

- `git status --short` contains only intentional files for the active PR.
- No build output is committed unless it is an explicit evidence artifact.
- Every untracked file is either added intentionally or removed.

## Phase 2: Frontend Legacy Purge And Multi-Tenant Future-Readiness

### Objective

Remove legacy single-tenant assumptions from the frontend and ensure every user
surface is tenant-aware, capability-aware, and future-school-ready.

### Legacy Code Policy

Frontend legacy code is allowed only when all of these are true:

- It is isolated in a named compatibility module.
- It has a removal condition.
- It has tests proving it does not run for new canonical tenant data.
- It does not render MIHAS/KATC as platform identity.

Anything else is a launch blocker.

### Required Audits

Run these scans from the repo root:

```bash
rg -n "MIHAS|Mihas|mihas|KATC|katc|Mukuba|Kalulushi|mihas\\.edu\\.zm|katc\\.edu\\.zm|apply\\.mihas|api\\.mihas" \
  apps/admissions/src apps/admissions/public apps/admissions/index.html apps/admissions/Caddyfile

rg -n "role ===|role !==|user\\.role|isSuperAdmin\\(|isAdmin\\(" \
  apps/admissions/src

rg -n "institution_id|institutionId|selectedInstitution|tenant|school" \
  apps/admissions/src

rg -n "localStorage|sessionStorage|mihas:|MIHAS" \
  apps/admissions/src
```

For each hit, classify it as:

- Tenant data rendering.
- Compatibility migration.
- Test fixture.
- Platform-brand leak.
- Role-string authority leak.
- Hard-coded tenant assumption.

Only the first three categories may remain, and each remaining hit must be
documented in `docs/legacy-brand-allowlist.json` or a dedicated frontend
legacy allowlist with a removal condition.

### Mandatory Frontend Fixes

1. Replace `apps/admissions/public/.well-known/security.txt` with Beanola
   contacts, Beanola canonical URL, and Beanola policy URL.

2. Remove or quarantine legacy public assets:
   - School logos may remain only as tenant sample assets or seed fixtures.
   - Signatures must not live in generic public paths. They must be tenant
     assets, versioned PDF assets, or backend-managed institution assets.
   - Any school-specific asset used by runtime UI must be selected through
     tenant context, not by a hard-coded import.

3. Ensure all tenant branding comes from:
   - `GET /api/v1/catalog/context/`
   - tenant asset APIs
   - tenant document profile APIs
   - official document generation responses

4. Remove school-specific defaults from:
   - SEO metadata.
   - page titles.
   - auth pages.
   - navigation labels.
   - student dashboard empty states.
   - application wizard copy.
   - notification settings.
   - payment pages.
   - PDF preview UI.

5. Ensure admin navigation is capability-driven:
   - `/admin/tenants` is visible to super admins and tenant admins with
     `tenant.profile.read`.
   - `/admin/tenants/new` is super-admin-only.
   - Platform-only routes are hidden from tenant admins.
   - Mobile and desktop navs produce the same capability-gated route set.

6. Ensure the application wizard is program-first:
   - The student does not choose MIHAS/KATC or any school as a platform concept.
   - The selected program offering resolves `institution_id`, fees, required
     documents, intakes, branding, and document templates.
   - White-label tenant domains narrow offerings automatically.
   - Shared Beanola portal can show all eligible offerings without leaking
     tenant admin data.

7. Ensure frontend state is tenant-safe:
   - Storage keys must be Beanola namespaced.
   - Tenant-specific state must include tenant/user dimensions.
   - Legacy storage migrations must be tested and eventually removable.
   - No stale selected institution may survive if it is no longer in scope.

8. Replace notification polling with cursor mode:
   - Add an optional `after` parameter to `notificationService.list`.
   - Track the newest loaded notification id in `useNotificationPolling`.
   - Poll with `?after=<id>` after initial load.
   - Merge new results into cache without duplicates.
   - Keep page-number mode only for the full communications page.
   - Add tests proving the polling hook does not call count mode after initial
     load.

### Frontend Verification Commands

Run from `apps/admissions`:

```bash
bun run type-check
bun run test -- \
  tests/unit/launchBundleGuard.test.ts \
  tests/unit/useAdminDashboardPolling.test.ts \
  tests/unit/adminNavAccess.test.ts \
  tests/unit/tenantConsoleSplit.test.tsx \
  tests/unit/tenantNav.test.ts \
  tests/unit/routingSimulatorPanel.test.tsx \
  tests/unit/tenantOnboardingState.test.tsx \
  tests/property/selectedScopePersistence.property.test.ts \
  tests/property/capabilityDerivation.property.test.ts \
  tests/property/navParity.property.test.ts
bun run build
bun scripts/launch-bundle-guard.ts
```

### Exit Criteria

- No unauthorized MIHAS/KATC/mihas.edu.zm hits in active frontend runtime code.
- No role-string authority checks remain outside compatibility helpers or tests.
- Notification polling uses cursor mode after the initial request.
- Frontend build and bundle guard pass.
- Mobile and desktop tenant navigation parity tests pass.

## Phase 3: Backend, Database, And Contract Sync

### Objective

Prove that backend authority, schema, SQL migrations, caches, and frontend
contracts are synchronized against a real Postgres target.

### Required Backend Fixes

1. Enable performance caches deliberately:
   - `PERF_CACHE_CAPABILITIES=true`
   - `PERF_CACHE_DASHBOARD=true`
   - `PERF_CACHE_CATALOG=true`

   Roll them out in staging first in this order:
   capabilities -> dashboard -> catalog.

2. Verify cache invalidation:
   - membership create/update/deactivate invalidates capability cache.
   - access grant create/update/deactivate invalidates capability cache.
   - tenant update/deactivate invalidates dashboard/catalog caches.
   - program/intake/required-document/template updates invalidate catalog and
     tenant document profile cache paths.

3. Apply and verify the performance index:

   ```bash
   psql "$DATABASE_URL" -f backend/scripts/perf_idx_applications_status_submitted_at.sql
   psql "$DATABASE_URL" -c "\di+ idx_applications_status_submitted_at"
   ```

4. Run schema drift checks against Postgres:

   ```bash
   cd backend
   DJANGO_SETTINGS_MODULE=config.settings.prod \
     ./venv/bin/python manage.py check_schema_drift \
       --check-fk-indexes \
       --check-migration-history-coverage
   ```

5. Prove tenant isolation with real Postgres:
   - Tenant admin A cannot list tenant B applications.
   - Tenant admin A cannot create institutions.
   - Tenant admin A cannot activate domains for tenant B.
   - Tenant admin A cannot grant themselves capabilities.
   - Super admin can create tenants, domains, memberships, templates, document
     profiles, and program assignments.

6. Rebuild and compare OpenAPI:

   ```bash
   cd backend
   DJANGO_SETTINGS_MODULE=config.settings.test \
     ./venv/bin/python manage.py spectacular --file /tmp/openapi.yaml
   ```

   Then run the contract sync gate from the launch verification scripts.

### Backend Verification Commands

From repo root:

```bash
DJANGO_SETTINGS_MODULE=config.settings.test ./backend/.venv/bin/python -m pytest \
  backend/tests/integration/test_perf_golden_snapshots.py \
  backend/tests/unit/test_payment_reconciliation_task.py \
  backend/tests/unit/test_conditions.py \
  backend/tests/unit/test_expiry.py \
  backend/tests/property/test_capability_gated_writes.py \
  backend/tests/property/test_cross_tenant_invisibility.py \
  backend/tests/property/test_no_self_escalation.py \
  -q

DJANGO_SETTINGS_MODULE=config.settings.test ./backend/.venv/bin/python -m pytest \
  backend/tests/property/test_launch_verification_performance.py \
  backend/tests/unit/test_perf_baseline_harness.py \
  backend/tests/property/test_launch_verification_scope.py \
  backend/tests/property/test_launch_verification_brand.py \
  -q
```

Then repeat the critical backend tests against a Postgres-backed settings file.
SQLite passing is useful, but it is not enough for production launch.

### Exit Criteria

- Targeted SQLite tests pass.
- Targeted Postgres tests pass.
- Postgres schema drift passes.
- Performance index exists on the production-like database.
- Cache flags are enabled and validated in staging.
- Contract sync evidence is fresh.

## Phase 4: Tenant Domain And Onboarding End-To-End

### Objective

Prove a new school can be onboarded without code changes and can receive real
student applications through its configured portal.

### Scenario

Run this against staging first.

1. Super admin signs in.
2. Super admin opens `/admin/tenants`.
3. Super admin creates a new institution.
4. Super admin uploads:
   - logo
   - signature
   - document header/footer assets if applicable
5. Super admin creates or clones:
   - application templates
   - acceptance/offer letter profile
   - required documents
   - settlement/payment configuration
6. Super admin assigns canonical programs to the tenant.
7. Super admin creates intakes or attaches tenant offerings to existing intakes.
8. Super admin configures a tenant domain.
9. Domain verification transitions through the documented status machine.
10. Super admin invites a tenant admin.
11. Tenant admin signs in and can see only their tenant data.
12. Tenant admin cannot:
    - create a new institution
    - see other tenant applications
    - activate another tenant domain
    - grant themselves super admin capabilities
13. Student visits tenant domain.
14. Student sees tenant branding.
15. Student applies for a program.
16. Application is created with canonical `institution_ref_id`,
    `program_ref_id`, and `intake_ref_id`.
17. Required documents match tenant configuration.
18. Payment amount and currency match tenant/program fee configuration.
19. Official documents render using the tenant logo/signature/template.
20. Admin dashboard and application list show the application only to authorized
    users.

### Evidence Command

Use the onboarding smoke harness:

```bash
DJANGO_SETTINGS_MODULE=config.settings.prod \
  python3 scripts/launch-verification/run-onboarding-smoke.py \
  --base-url https://staging.beanola.com
```

If the harness requires operator-supplied cookies or credentials, provide them
through environment variables or an input file that stores only derived facts.
Do not write secrets into evidence artifacts.

### Exit Criteria

- `docs/launch-evidence/10-onboarding/onboarding-evidence.json` exists.
- The onboarding gate status is `passed`.
- The created tenant can be deactivated without leaving active staff scope.
- The same flow works for a second tenant with the same canonical program.

## Phase 5: Launch Evidence Completion

### Objective

Generate all missing evidence artifacts so the conservative rollup can approve
launch.

### Gate 1: Migration Evidence

Follow `docs/runbooks/launch-verification.md` Gate 1.

Required artifact:

```text
docs/launch-evidence/01-migration/migration-evidence.json
```

Minimum proof:

- backup completed before production apply
- dry-run passed
- staging apply passed
- idempotency apply passed
- migration history rows recorded
- tenant invariants validated
- rollback posture recorded

### Gate 2: Smoke

Follow `docs/runbooks/post-deploy-smoke-check.md`.

Required artifact:

```text
docs/launch-evidence/02-smoke/smoke-evidence.json
```

Minimum smoke coverage:

- health live/ready
- public landing
- auth session
- CSRF flow
- student sign-in
- admin sign-in
- `/admin/tenants`
- `/admin/dashboard`
- catalog context on shared portal
- catalog context on tenant domain
- application create/draft/submit
- payment initiation safe path
- document generation safe path
- notification list cursor path

### Gate 3: Performance

Follow `docs/runbooks/launch-verification.md` Gate 3.

Required artifact:

```text
docs/launch-evidence/03-performance/performance-evidence.json
```

Minimum proof:

- Lighthouse route medians captured.
- API timing samples captured.
- dashboard cache enabled and observed.
- catalog cache enabled and observed.
- capability cache enabled and observed.
- notification cursor polling observed.
- bundle guard evidence current.
- no entry-path regression.

### Gate 4: Mobile UI

Follow `docs/runbooks/launch-verification.md` Gate 4.

Required artifact:

```text
docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json
```

Minimum proof:

- 360x800, 390x844, 768x1024, 1024x768, and 1440x900 checked.
- public, auth, student, admin, tenant onboarding, and application wizard paths
  checked.
- no overlap defects.
- no clipped buttons.
- no inaccessible mobile nav states.
- tenant admin and super admin views both checked.

### Gate 10: Onboarding

Follow Phase 4 above.

Required artifact:

```text
docs/launch-evidence/10-onboarding/onboarding-evidence.json
```

### Rollup

After all artifacts exist:

```bash
python3 scripts/launch-verification/rollup.py
cat docs/launch-evidence/launch-readiness.md
```

### Exit Criteria

- Rollup verdict is `production-launch-ready`.
- No gate is `unknown`.
- No evidence artifact is missing or unreadable.

## Phase 6: Operations And Documentation Cleanup

### Objective

Make operations documentation match the current Beanola platform, not the old
MIHAS deployment.

### Required Cleanup

1. Rewrite stale MIHAS operations docs:
   - `deploy/RUNBOOK.md`
   - `deploy/GRAFANA-DASHBOARDS-AND-ALERTS.md`
   - `deploy/GRAFANA-CLOUD-STEP-BY-STEP.md`
   - `deploy/.env.prod.example`
   - `deploy/docker-compose.prod.yml` comments
   - `deploy/harden-host.sh` comments
   - `deploy/backup-db.sh` backup prefix and bucket examples

2. Rewrite public security metadata:
   - `apps/admissions/public/.well-known/security.txt`

3. Rewrite old API docs that still describe MIHAS as the product:
   - `docs/api/VERSIONING.md`
   - `docs/api/ROLLBACK.md`
   - `docs/api/DEPLOYMENT_CHECKLIST.md`

4. Keep tenant-specific historical docs only if clearly marked as historical or
   sample tenant data.

5. Update monitoring labels:
   - use `beanola-ec2` or the actual production hostname
   - use Beanola dashboard names
   - use Beanola alert folder names

6. Prove backup and restore:

   ```bash
   ./deploy/backup-db.sh
   ```

   Then restore the backup into a disposable Postgres target and record:
   - backup completion time
   - restore completion time
   - row-count variance
   - RTO
   - RPO

7. Run operational readiness with production-derived facts, not synthetic only:

   ```bash
   DJANGO_SETTINGS_MODULE=config.settings.prod \
     python3 scripts/launch-verification/check-operational-readiness.py \
     --inputs derived-production-operational-facts.json
   ```

### Exit Criteria

- No public or operational surface presents MIHAS as the platform.
- Backup restore drill evidence exists.
- Operational readiness evidence is based on production-derived facts.
- Disk gate, image prune, and rollback are documented and tested.

## Phase 7: Performance Hardening Closure

### Objective

Close the remaining performance items for the single 2GB EC2 deployment.

### Required Work

1. Enable and observe scoped caches:
   - capabilities: 60s
   - dashboard: 45s
   - catalog: 450s

2. Add staging smoke assertions:
   - first dashboard request computes
   - second same-scope dashboard request hits cache
   - tenant A and tenant B never share cache keys
   - Redis failure degrades to DB computation

3. Complete notification cursor polling frontend work from Phase 2.

4. Confirm payment polling is bounded:
   - max 10 per run
   - Lenco timeout <= 10s
   - retries <= 2
   - task wall time <= 90s

5. Confirm expiry tasks are batched:
   - condition expiry uses `bulk_update` and bulk notification/email helpers
   - draft expiry uses bulk transition and bulk notification/email helpers

6. Keep bundle budgets enforced:
   - entry path <= 150KB gz
   - first PDF action <= 772KB gz
   - no Sentry on public entry
   - no PDF/chart/admin-only chunks on public entry

7. Confirm public images:
   - no oversized PNGs in first-route public path
   - tenant logos use optimized assets
   - PDF-only assets are not fetched on public first load

### Exit Criteria

- Performance gate passes.
- Bundle guard passes.
- Lighthouse/API timing evidence exists.
- No performance item is only "implemented but disabled".

## Phase 8: Final Release Decision

### Required Command Set

Run this full set before declaring ready:

```bash
# Backend local logic
DJANGO_SETTINGS_MODULE=config.settings.test ./backend/.venv/bin/python -m pytest \
  backend/tests/integration/test_perf_golden_snapshots.py \
  backend/tests/unit/test_payment_reconciliation_task.py \
  backend/tests/unit/test_conditions.py \
  backend/tests/unit/test_expiry.py \
  backend/tests/property/test_capability_gated_writes.py \
  backend/tests/property/test_cross_tenant_invisibility.py \
  backend/tests/property/test_no_self_escalation.py \
  -q

# Backend launch properties
DJANGO_SETTINGS_MODULE=config.settings.test ./backend/.venv/bin/python -m pytest \
  backend/tests/property/test_launch_verification_performance.py \
  backend/tests/unit/test_perf_baseline_harness.py \
  backend/tests/property/test_launch_verification_scope.py \
  backend/tests/property/test_launch_verification_brand.py \
  -q

# Frontend
cd apps/admissions
bun run type-check
bun run test -- \
  tests/unit/launchBundleGuard.test.ts \
  tests/unit/useAdminDashboardPolling.test.ts \
  tests/unit/adminNavAccess.test.ts \
  tests/unit/tenantConsoleSplit.test.tsx \
  tests/unit/tenantNav.test.ts \
  tests/unit/routingSimulatorPanel.test.tsx \
  tests/unit/tenantOnboardingState.test.tsx \
  tests/property/selectedScopePersistence.property.test.ts \
  tests/property/capabilityDerivation.property.test.ts \
  tests/property/navParity.property.test.ts
bun run build
bun scripts/launch-bundle-guard.ts
cd ../..

# Launch gates
python3 scripts/launch-verification/run-brand-scan.py
python3 scripts/launch-verification/check-launch-scope.py --no-django
python3 scripts/launch-verification/rollup.py
```

Then run the Postgres-backed backend suite, deployed smoke, performance,
mobile UI, and onboarding gates against staging/production-like targets.

### Final Go / No-Go Checklist

Launch is approved only when all answers are yes:

- Is the branch clean and release-shaped?
- Are all migrations proven on Postgres?
- Is backup/restore evidence real, not synthetic?
- Are all performance caches enabled and observed?
- Does notification polling use cursor mode?
- Does frontend active runtime code have zero unauthorized legacy tenant leaks?
- Does every tenant admin surface enforce tenant scope?
- Can a super admin onboard a new school without code changes?
- Can a tenant domain route students to the correct school context?
- Are tenant assets, signatures, templates, and documents tenant-configured?
- Do mobile/admin/student/public routes pass visual defect checks?
- Does `docs/launch-evidence/launch-readiness.md` say
  `production-launch-ready`?

If any answer is no, the release is not production-ready.

## Owner Handoff Notes For Another Agent

Start with these tasks in order:

1. Fix frontend notification polling to use backend cursor mode after initial
   load.
2. Replace stale MIHAS public and operations documentation with Beanola
   canonical content.
3. Generate the five missing launch evidence artifacts.
4. Run Postgres-backed backend verification.
5. Enable performance cache flags in staging and capture performance evidence.
6. Execute the tenant onboarding smoke from new tenant creation through student
   application and official document generation.
7. Run final rollup and stop unless it returns `production-launch-ready`.

Do not spend time polishing non-launch docs before these seven tasks are done.
