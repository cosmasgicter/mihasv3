/**
 * Mobile-breakpoint screenshot evidence (Phase 7, task 15.4).
 *
 * Spec: .kiro/specs/beanola-production-readiness — task 15.4
 *   "Capture screenshot evidence (Playwright) for the key routes at the
 *    Mobile_Breakpoint set, including failure screenshots referenced from the
 *    issue notes in docs/audits/ui-route-critique.md."
 *
 * Validates: Requirements R7.11 (THE UI/UX audit SHALL capture screenshot
 * evidence (Playwright or equivalent) for key routes, including failure
 * screenshots referenced from issue notes).
 *
 * ── Mobile_Breakpoint set (R7.2, requirements.md glossary) ─────────────────
 * Every key route is captured at all five required responsive widths:
 *   360×800   — primary mobile target
 *   390×844   — modern phone
 *   768×1024  — tablet portrait
 *   1024×768  — tablet landscape / small laptop
 *   1440×900  — desktop
 *
 * ── What this spec proves ──────────────────────────────────────────────────
 * It drives the KEY public / student / admin UI_Routes (a representative subset
 * of `apps/admissions/src/routes/config.tsx`, the surfaces named in the
 * Phase-7 matrix and the UI-R7-### issue list) through every Mobile_Breakpoint
 * and writes a full-page PNG per (route × breakpoint) into
 * `test-results/ui-route-screenshots/`. It also captures targeted
 * **failure screenshots** for the open issue IDs in
 * `docs/audits/ui-route-critique.md` (UI-R7-001 … UI-R7-005) so the critique's
 * PASS-star / FAIL notes have rendered evidence.
 *
 * The screenshots are the artifact; this is visual evidence capture, not an
 * assertion-bearing property test. The deterministic 360px overflow/touch
 * checks live in the DOM guard `tests/unit/routeMobileOverflowGuard.test.tsx`
 * (task 15.3, Property 30); the anti-pattern gate is `impeccable detect`.
 *
 * ── Why this is GATED / skippable ──────────────────────────────────────────
 * A live capture needs (a) Playwright browser binaries installed and (b) a
 * running admissions server. Neither is guaranteed in CI / the dev sandbox
 * (e.g. `~/.cache/ms-playwright` may be empty and no dev server is up), so the
 * whole suite is gated behind `UI_SCREENSHOTS_E2E=1` and additionally skips the
 * auth-guarded student/admin routes unless an authenticated storage state is
 * provided. The cases still ENUMERATE under `playwright test --list` so the
 * harness is verifiable without running a browser.
 *
 * ── How to run (capture the evidence) ──────────────────────────────────────
 *   # 1. one-time: install the browser binary
 *   bun x playwright install chromium
 *
 *   # 2. start the admissions app (separate terminal)
 *   bun run dev                       # serves http://localhost:5173
 *
 *   # 3a. public routes only (no auth required)
 *   UI_SCREENSHOTS_E2E=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *     bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts
 *
 *   # 3b. include student/admin routes — supply a logged-in storage state
 *   #     (capture once with `bun x playwright codegen --save-storage=state.json`)
 *   UI_SCREENSHOTS_E2E=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   PLAYWRIGHT_STORAGE_STATE=./state.json \
 *     bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts
 *
 *   # enumerate the planned cases WITHOUT a browser or server:
 *   bun x playwright test tests/e2e/mobileBreakpointScreenshots.spec.ts --list
 *
 * Output: test-results/ui-route-screenshots/<route-slug>--<width>x<height>.png
 *         test-results/ui-route-screenshots/failures/<issue-id>--<width>x<height>.png
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// ── Gating ─────────────────────────────────────────────────────────────────
// Live capture requires installed browsers + a running dev server.
const E2E_ENABLED = process.env.UI_SCREENSHOTS_E2E === '1';
// Auth-guarded routes only run when a logged-in storage state is supplied.
const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE;
const AUTHED = Boolean(STORAGE_STATE);

// ── Mobile_Breakpoint set (R7.2) ─────────────────────────────────────────────
interface Breakpoint {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

const BREAKPOINTS: readonly Breakpoint[] = [
  { label: '360x800', width: 360, height: 800 }, // primary mobile target
  { label: '390x844', width: 390, height: 844 }, // modern phone
  { label: '768x1024', width: 768, height: 1024 }, // tablet portrait
  { label: '1024x768', width: 1024, height: 768 }, // tablet landscape
  { label: '1440x900', width: 1440, height: 900 }, // desktop
];

// ── Key routes (subset of routes/config.tsx named in the Phase-7 matrix) ─────
type Guard = 'public' | 'student' | 'admin';

interface KeyRoute {
  readonly path: string;
  readonly slug: string;
  readonly guard: Guard;
}

const KEY_ROUTES: readonly KeyRoute[] = [
  // Public — no auth required.
  { path: '/', slug: 'public-landing', guard: 'public' },
  { path: '/track-application', slug: 'public-track-application', guard: 'public' },
  { path: '/contact', slug: 'public-contact', guard: 'public' },
  { path: '/auth/signin', slug: 'public-signin', guard: 'public' },
  { path: '/auth/signup', slug: 'public-signup', guard: 'public' },
  { path: '/auth/forgot-password', slug: 'public-forgot-password', guard: 'public' },
  { path: '/404', slug: 'public-not-found', guard: 'public' },
  // Student — auth-guarded.
  { path: '/student/dashboard', slug: 'student-dashboard', guard: 'student' },
  { path: '/student/application-wizard', slug: 'student-application-wizard', guard: 'student' },
  { path: '/student/status', slug: 'student-status', guard: 'student' },
  { path: '/student/payment', slug: 'student-payment', guard: 'student' },
  { path: '/student/interview', slug: 'student-interview', guard: 'student' },
  { path: '/student/settings', slug: 'student-settings', guard: 'student' },
  // Admin — auth-guarded.
  { path: '/admin/dashboard', slug: 'admin-dashboard', guard: 'admin' },
  { path: '/admin/applications', slug: 'admin-applications', guard: 'admin' },
  { path: '/admin/tenants', slug: 'admin-tenants', guard: 'admin' },
  { path: '/admin/users', slug: 'admin-users', guard: 'admin' },
  { path: '/admin/audit', slug: 'admin-audit', guard: 'admin' },
];

// ── Failure screenshots referenced from the issue notes (R7.11) ──────────────
// Each maps to an open issue ID in docs/audits/ui-route-critique.md so the
// critique's FAIL / confirm-in-15.4 notes have rendered evidence.
interface FailureShot {
  readonly issueId: string;
  readonly path: string;
  readonly note: string;
}

const FAILURE_SHOTS: readonly FailureShot[] = [
  {
    issueId: 'UI-R7-001',
    path: '/student/application-wizard',
    note: 'EducationStep emoji category labels (🔬💼📚💻🎨🌍★) used as structural icons (R7.5).',
  },
  {
    issueId: 'UI-R7-003',
    path: '/student/status',
    note: 'StatusTimeline border-l-2 side-tab AI-tell on student status surfaces (R7.4/R7.5).',
  },
  {
    issueId: 'UI-R7-004',
    path: '/admin/applications',
    note: 'Applications table must be an intentional mobile scroll container / cards at 360/390 (R7.9).',
  },
  {
    issueId: 'UI-R7-005',
    path: '/admin/tenants',
    note: '10-tab wrapped TabsList — confirm tabs stay ≥44px and do not overflow at 360/390 (R7.2/R7.3).',
  },
];

const OUTPUT_DIR = path.resolve(process.cwd(), 'test-results', 'ui-route-screenshots');
const FAILURE_DIR = path.join(OUTPUT_DIR, 'failures');

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/**
 * Navigate and let the SPA settle. Auth-guarded routes that redirect to the
 * sign-in page (no/invalid session) still produce a valid rendered surface for
 * the evidence — the per-route skip below only fires when no storage state is
 * configured at all.
 */
const settle = async (page: Page, route: string) => {
  await page.goto(route, { waitUntil: 'networkidle' });
  // Allow lazy route chunk + skeleton swap to finish painting.
  await page.waitForTimeout(500);
};

test.describe('Mobile-breakpoint screenshot evidence (R7.11)', () => {
  test.skip(
    !E2E_ENABLED,
    'Set UI_SCREENSHOTS_E2E=1 with installed browsers + a running dev server to capture screenshots.',
  );

  test.beforeAll(() => {
    ensureDir(OUTPUT_DIR);
    ensureDir(FAILURE_DIR);
  });

  // Apply the authenticated storage state to every context when provided.
  test.use({ storageState: STORAGE_STATE });

  for (const route of KEY_ROUTES) {
    for (const bp of BREAKPOINTS) {
      test(`${route.slug} @ ${bp.label}`, async ({ page }) => {
        // Skip auth-guarded routes when no logged-in session is configured.
        test.skip(
          (route.guard === 'student' || route.guard === 'admin') && !AUTHED,
          `Set PLAYWRIGHT_STORAGE_STATE to a logged-in ${route.guard} session to capture ${route.path}.`,
        );

        await page.setViewportSize({ width: bp.width, height: bp.height });
        await settle(page, route.path);

        const file = path.join(OUTPUT_DIR, `${route.slug}--${bp.label}.png`);
        await page.screenshot({ path: file, fullPage: true });

        // Sanity: a real document rendered (body has measurable width).
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(bodyWidth).toBeGreaterThan(0);
      });
    }
  }
});

test.describe('Failure-screenshot evidence for open UI-R7-### issues (R7.11)', () => {
  test.skip(
    !E2E_ENABLED,
    'Set UI_SCREENSHOTS_E2E=1 with installed browsers + a running dev server to capture failure screenshots.',
  );

  test.beforeAll(() => {
    ensureDir(FAILURE_DIR);
  });

  test.use({ storageState: STORAGE_STATE });

  for (const shot of FAILURE_SHOTS) {
    // Every referenced issue surface is auth-guarded (student/admin).
    const needsAuth = shot.path.startsWith('/student') || shot.path.startsWith('/admin');

    // Capture the issue surface at the two narrowest breakpoints where the
    // failures manifest (360 and 390), per the critique notes.
    for (const bp of BREAKPOINTS.filter((b) => b.width <= 390)) {
      test(`${shot.issueId} ${shot.path} @ ${bp.label}`, async ({ page }) => {
        test.skip(
          needsAuth && !AUTHED,
          `Set PLAYWRIGHT_STORAGE_STATE to a logged-in session to capture ${shot.issueId} (${shot.path}).`,
        );

        await page.setViewportSize({ width: bp.width, height: bp.height });
        await settle(page, shot.path);

        const file = path.join(FAILURE_DIR, `${shot.issueId}--${bp.label}.png`);
        await page.screenshot({ path: file, fullPage: true });

        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(bodyWidth).toBeGreaterThan(0);
      });
    }
  }
});
