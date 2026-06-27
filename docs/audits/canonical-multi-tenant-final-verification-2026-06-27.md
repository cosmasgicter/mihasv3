# Canonical Multi-Tenant Final Verification - 2026-06-27

This record closes the local release gate for the canonical multi-tenant alignment work. It verifies backend contracts, tenant security boundaries, frontend route/document/brand drift guards, build output, and the gated E2E smoke suite.

## Verified Commands

| Gate | Command | Result |
| --- | --- | --- |
| Backend unit tests | `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest tests/unit -q` | `2190 passed, 94 skipped, 2 xfailed, 1 xpassed` |
| Backend integration tests | `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest tests/integration -q` | `85 passed, 1 skipped` |
| Frontend unit tests | `cd apps/admissions && bun x vitest run tests/unit` | `221 passed, 1 skipped` test files; `1865 passed, 1 skipped` tests |
| Frontend build and CSP check | `cd apps/admissions && bun run build` | Passed; production CSP-compatible HTML confirmed |
| Frontend route/brand/document/API drift | `cd apps/admissions && bun x vitest run tests/unit/canonicalRouteRegistry.test.ts tests/unit/adminRouteActionParity.test.ts tests/unit/brandDriftGuard.test.ts tests/unit/documentFlowDriftGuard.test.ts tests/unit/openApiContractDriftGuard.test.ts tests/unit/tenantConsoleAuthority.test.tsx` | `6 passed`; `87 passed` tests |
| Backend tenant scope/security | `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest tests/unit/test_scenario_tenant_isolation.py tests/unit/test_tenant_config_authorization_boundaries.py tests/property/test_cross_tenant_invisibility.py tests/property/test_capability_gated_writes.py tests/property/test_domain_resolution_fail_closed.py -q` | `18 passed` |
| Backend brand/API/document lifecycle | `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest tests/unit/test_brand_drift_guard.py tests/unit/test_tenant_api_contract_preservation.py tests/unit/test_official_document_signed_download.py tests/property/test_official_document_lifecycle_properties.py -q` | `68 passed` |
| Local E2E smoke | `cd apps/admissions && bun x playwright test tests/e2e/canonicalMultiTenantAlignment.spec.ts` | `10 skipped`; suite is gated by live E2E env/storage state |
| Post-change backend draft/schema/import guards | `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest tests/unit/test_application_student_flow_views.py::TestApplicationDraftView tests/unit/test_application_student_flow_views.py::TestApplicationDraftListView tests/unit/test_launch_verification_spectacular.py::LaunchVerificationSpectacularTests::test_schema_generation_emits_zero_warnings tests/unit/test_canonical_import_boundaries.py -q` | `9 passed` |
| Post-change frontend draft/navigation guards | `cd apps/admissions && bun x vitest run tests/unit/wizardDraftIntent.test.ts tests/unit/applicationWizardUxGuard.test.ts tests/unit/student-dashboard-load-path.test.ts tests/unit/studentNextActionRoutes.test.tsx tests/unit/canonicalRouteRegistry.test.ts tests/unit/routeMobileOverflowGuard.test.tsx` | `6 passed`; `32 passed` tests |
| Post-change frontend type-check | `cd apps/admissions && bun run type-check` | Passed |

## Corrections Made During Final Gate

- Legacy official-document endpoints now preserve the old acceptance-letter and finance-receipt task envelope while delegating to the canonical official-document path.
- Legacy official-document idempotency lookup now uses the historical key and path shape.
- Legacy official-document routes suppress duplicate canonical queue audit entries while still recording the expected legacy audit action.
- Official document version lookup now tolerates mocked or non-model application objects in endpoint tests.
- Tenant program API schema operations now have unique operation IDs.
- Frontend static route tests now validate the canonical route registry instead of stale hard-coded route literals.
- `POST /api/v1/applications/drafts/` now creates canonical draft applications by delegating to the existing application-create path.
- `?localDraft=true` is now parsed as explicit local draft intent instead of falling through to automatic server-draft choice.
- Dashboard draft mutation refresh and draft-abandon replace-navigation are covered by targeted frontend guards.

## Canonical Decisions Confirmed

- Platform brand: Beanola.
- Tenant institutions: MIHAS, KATC, and future schools are tenant data only.
- Admin tenant route: `/admin/tenants`.
- `/beanola-admin-panel/` is not the canonical tenant-admin surface.
- Official documents are backend generated and tenant-profile driven; frontend PDF generators are not the production source of truth.
- Super admin owns tenant onboarding, tenant domains, tenant assets, document profiles, program/offering assignment, and cross-tenant access grants.
- Tenant admin is scoped to assigned tenant data and cannot create tenants.
- Student application intent is explicit: start new and resume selected draft are separate flows.

## Open Risks

- Live E2E workflows were not executed against a real environment because `CANONICAL_MULTI_TENANT_E2E=1` and storage states were not provided. The local suite was discovered and executed, but skipped by design.
- The frontend production build still warns about large PDF/Sentry chunks: `vendor-react-pdf`, `vendor-pdf`, and `vendor-sentry`. This is not a correctness blocker, but it remains a performance budget item.
- Most recent local Lighthouse evidence from `docs/audits/frontend-performance-cleanup-2026-06-27.md` showed Performance `74` and LCP `7.4s`; future optimization should focus on initial-route payload and PDF/Sentry code loading.
- Test output remains noisy with known warnings: React `act(...)`, SSR `useLayoutEffect`, test-only insecure `SECRET_KEY`, missing test `staticfiles/`, and drf-spectacular deprecation warnings.
- This verification did not SSH into EC2 and did not prove the remote database or deployed containers are current. That remains a separate production deployment verification step.

## Release Position

Local code readiness is green for the canonical multi-tenant alignment gate. Production readiness still requires a live environment smoke run, deployment verification, and confirmation that the EC2 database has all migrations and tenant seed/configuration data applied.
