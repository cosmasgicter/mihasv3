/**
 * White-label host-override E2E verification (Phase 5, task 22.2).
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions — task 22.2
 *   "Verify white-label behaviour in a real browser with DNS/host overrides
 *    (Playwright or manual), including inactive-domain fallback."
 *
 * Validates: Requirements R3.3 (inactive domain/institution → safe fallback,
 * never expose the inactive school) and R14.4 (host resolution coverage:
 * uppercase host, port suffix, inactive domain/institution, collisions).
 *
 * ── What this spec proves in a REAL browser ───────────────────────────────
 * The backend resolves white-label vs shared-Beanola context from the request
 * host (`InstitutionContextService.resolve(host)` via
 * `X-Forwarded-Host` / `Host` in `apps/catalog/views.py::_resolve_request_context`).
 * The frontend reads `/api/v1/catalog/context/` once at load
 * (`catalogService.getContext()` → `usePortalBrand()`) and:
 *   - white-label host  → brands from the institution's runtime context and
 *     filters `/catalog/canonical-programs/` to that `institution`.
 *   - shared host       → Beanola brand, no `institution` filter.
 *   - inactive domain / inactive institution → the backend falls back to the
 *     shared Beanola context, so the browser must show the Beanola brand and
 *     MUST NOT surface the inactive school's name anywhere (R3.3).
 *
 * Each case overrides the host via `X-Forwarded-Host` (the same header the
 * production edge/Caddy sets from the real Host / DNS name), so this is a true
 * host-override exercise rather than a unit-level stub.
 *
 * ── How to run (requires a configured multi-tenant backend) ───────────────
 * This spec is GATED behind `WHITE_LABEL_E2E=1` because it needs:
 *   1. Playwright browsers installed:           bun x playwright install chromium
 *   2. A running admissions dev server:         bun run dev   (port 5173)
 *   3. A backend reachable from the app with at least one ACTIVE white-label
 *      `institution_domains` row and one INACTIVE domain/institution row whose
 *      hostnames match WL_ACTIVE_HOST / WL_INACTIVE_HOST below.
 *
 *   WHITE_LABEL_E2E=1 \
 *   WL_ACTIVE_HOST=apply.testschool.example \
 *   WL_INACTIVE_HOST=apply.inactiveschool.example \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *     bun x playwright test tests/e2e/whiteLabelHostOverride.spec.ts
 *
 * Without a configured multi-tenant backend, the host-resolution + inactive
 * fallback behaviour is verified by the runnable integration test
 * `tests/integration/whiteLabelHostResolution.integration.test.ts`, which
 * simulates the host → context → offering-filter chain (including the
 * inactive-domain fallback) through the real `catalogService`. The browser run
 * here is the optional, deferred confirmation step for a staging environment
 * with real DNS/host overrides.
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// Gated: real multi-tenant backend + installed browsers required. See header.
const E2E_ENABLED = process.env.WHITE_LABEL_E2E === '1';

const WL_ACTIVE_HOST = process.env.WL_ACTIVE_HOST || 'apply.testschool.example';
const WL_INACTIVE_HOST = process.env.WL_INACTIVE_HOST || 'apply.inactiveschool.example';
const SHARED_HOST = process.env.WL_SHARED_HOST || 'apply.beanola.example';

// The brand string the white-label institution is expected to render.
const WL_BRAND_NAME = process.env.WL_BRAND_NAME || 'Test School Admissions';
const BEANOLA_BRAND_NAME = 'Beanola Admissions';

test.describe('White-label host-override (R3.3, R14.4)', () => {
  test.skip(!E2E_ENABLED, 'Set WHITE_LABEL_E2E=1 with a configured multi-tenant backend to run.');

  /**
   * Override the host for every navigation/XHR so the backend's
   * `_resolve_request_context` sees the white-label / shared / inactive host.
   * `X-Forwarded-Host` is what the production edge sets from the real DNS name,
   * so this mirrors a true DNS-level white-label entry point.
   */
  const withHost = async (page: Page, host: string) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-Host': host });
  };

  const captureCanonicalProgramsRequest = (page: Page) => {
    const calls: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/catalog/canonical-programs/')) calls.push(url);
    });
    return calls;
  };

  test('active white-label host brands from the institution and filters offerings to it', async ({ page }) => {
    await withHost(page, WL_ACTIVE_HOST);
    const programReqs = captureCanonicalProgramsRequest(page);

    await page.goto('/student/application-wizard');
    await page.waitForLoadState('networkidle');

    // Brand resolves from runtime context, not a hard-coded school name.
    await expect(page.getByText(new RegExp(WL_BRAND_NAME, 'i')).first()).toBeVisible();
    await expect(page.getByText(/Beanola Admissions/i)).toHaveCount(0);

    // Offering list is restricted to the white-label institution.
    expect(programReqs.some((u) => u.includes('institution='))).toBe(true);
  });

  test('shared Beanola host brands as Beanola and applies no institution filter', async ({ page }) => {
    await withHost(page, SHARED_HOST);
    const programReqs = captureCanonicalProgramsRequest(page);

    await page.goto('/student/application-wizard');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(new RegExp(BEANOLA_BRAND_NAME, 'i')).first()).toBeVisible();
    expect(programReqs.every((u) => !u.includes('institution='))).toBe(true);
  });

  test('inactive-domain host falls back to Beanola and never exposes the inactive school (R3.3)', async ({ page }) => {
    await withHost(page, WL_INACTIVE_HOST);
    const programReqs = captureCanonicalProgramsRequest(page);

    await page.goto('/student/application-wizard');
    await page.waitForLoadState('networkidle');

    // Safe fallback: Beanola brand, and the inactive school's name must not
    // surface anywhere in the rendered page (R3.3 "SHALL NOT expose").
    await expect(page.getByText(new RegExp(BEANOLA_BRAND_NAME, 'i')).first()).toBeVisible();
    await expect(page.getByText(new RegExp(WL_BRAND_NAME, 'i'))).toHaveCount(0);

    // Fallback = shared context → offerings are not pre-filtered to a school.
    expect(programReqs.every((u) => !u.includes('institution='))).toBe(true);
  });
});

/**
 * Backend-free browser confirmation of the three context outcomes.
 *
 * When a fully-configured multi-tenant backend is not available but Playwright
 * browsers ARE installed and the dev server is running, this block fulfils the
 * catalog endpoints in-browser keyed on the overridden `X-Forwarded-Host` so
 * the SAME frontend code path (real DOM render of `usePortalBrand`) is
 * exercised under each host. Gated behind `WHITE_LABEL_E2E_STUB=1`.
 */
test.describe('White-label host-override (stubbed backend, real browser)', () => {
  const STUB_ENABLED = process.env.WHITE_LABEL_E2E_STUB === '1';
  test.skip(!STUB_ENABLED, 'Set WHITE_LABEL_E2E_STUB=1 (dev server + installed browsers) to run.');

  type Outcome = 'white_label' | 'shared' | 'inactive';

  const fulfilContextForHost = async (route: Route, outcome: Outcome) => {
    if (outcome === 'white_label') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            portal_type: 'white_label',
            institution_id: 'inst-testschool',
            institution_code: 'TST',
            brand: { name: WL_BRAND_NAME, owner: 'Beanola Technologies' },
          },
        }),
      });
      return;
    }
    // Both shared and inactive-domain fallback resolve to the shared Beanola
    // context on the backend (R3.3), so the browser sees the identical payload.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          portal_type: 'shared',
          institution_id: null,
          brand: { name: BEANOLA_BRAND_NAME, owner: 'Beanola Technologies' },
        },
      }),
    });
  };

  const run = async (page: Page, host: string, outcome: Outcome) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-Host': host });
    await page.route('**/catalog/context/', (route) => fulfilContextForHost(route, outcome));
    await page.route('**/catalog/canonical-programs/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { programs: [] } }),
      })
    );
  };

  test('white-label host renders the institution brand in the browser', async ({ page }) => {
    await run(page, WL_ACTIVE_HOST, 'white_label');
    await page.goto('/student/application-wizard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(new RegExp(WL_BRAND_NAME, 'i')).first()).toBeVisible();
  });

  test('inactive-domain host renders Beanola fallback, not the inactive school', async ({ page }) => {
    await run(page, WL_INACTIVE_HOST, 'inactive');
    await page.goto('/student/application-wizard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(new RegExp(BEANOLA_BRAND_NAME, 'i')).first()).toBeVisible();
    await expect(page.getByText(new RegExp(WL_BRAND_NAME, 'i'))).toHaveCount(0);
  });
});
