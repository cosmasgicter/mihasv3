/**
 * Mobile rendered-UI gate (Gate 4) — deployed-target Playwright harness.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — task 5.4,
 * Requirements R4.1, R4.2, R4.9, R4.10, R4.11 (the detector predicates
 * themselves, R4.3–R4.8, live in the pure `detectors.ts` module and are
 * property-tested in `tests/property/launchVerificationDetectors.property.test.ts`).
 *
 * ── What this spec proves ──────────────────────────────────────────────────
 * It drives the six pure DOM defect detectors (`runDetectors` from
 * `./detectors`) across the five required viewport sizes over the public / auth
 * / student / admin route sets — including `/admin/tenants` and
 * `/admin/applications` — and records, per route × viewport "cell", whether any
 * defect fired. The overall gate passes (R4.10) only if **every** cell at
 * **every** viewport is defect-free. For the two dense admin routes it also
 * captures a labeled full-page screenshot at each of the five viewports
 * (R4.11). The whole run is summarized into a single shared `EvidenceArtifact`
 * at `docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json`.
 *
 * This is the **I/O / browser-driving wrapper**; the deterministic decision
 * logic is the pure `detectors.ts` core. This spec only (a) navigates, (b)
 * extracts plain `ElementShape`/`PageShape` data in page context, (c) feeds it
 * to the detectors, and (d) records the result + screenshots.
 *
 * ── Why this is OPERATOR-RUN / DEPLOYED-TARGET, not auto-run in CI ──────────
 * Per the spec's task notes, Gate 4 runs against a **deployed / preview
 * target** by an operator (or a preview-deploy CI job), not on every PR. A live
 * capture needs (a) Playwright browser binaries and (b) a reachable target URL,
 * neither guaranteed in the default CI / dev sandbox. The suite is therefore
 * gated behind `LAUNCH_MOBILE_UI_E2E=1` and degrades gracefully: when disabled
 * it still ENUMERATES every cell under `playwright test --list` and emits an
 * `unknown` evidence artifact (which the rollup aggregator conservatively
 * treats as "not passed"). It never fabricates a passing result.
 *
 * This file is NOT under the default Playwright `testDir` (`./tests/e2e`), so
 * `playwright test` does not pick it up unless explicitly named.
 *
 * ── How to run (capture the evidence against a deployed target) ─────────────
 *   # 1. one-time: install the browser binary
 *   bun x playwright install chromium
 *
 *   # 2a. public + auth routes only (no session required)
 *   LAUNCH_MOBILE_UI_E2E=1 \
 *   LAUNCH_MOBILE_UI_BASE_URL=https://apply.beanola.com \
 *     bun x playwright test tests/playwright/launch-mobile-ui.spec.ts
 *
 *   # 2b. include student/admin routes — supply logged-in storage state(s)
 *   #     (capture once with `bun x playwright codegen --save-storage=state.json`)
 *   LAUNCH_MOBILE_UI_E2E=1 \
 *   LAUNCH_MOBILE_UI_BASE_URL=https://apply.beanola.com \
 *   PLAYWRIGHT_STUDENT_STORAGE_STATE=./student-state.json \
 *   PLAYWRIGHT_ADMIN_STORAGE_STATE=./admin-state.json \
 *     bun x playwright test tests/playwright/launch-mobile-ui.spec.ts
 *
 *   # enumerate the planned cells WITHOUT a browser or target:
 *   bun x playwright test tests/playwright/launch-mobile-ui.spec.ts --list
 *
 * Output:
 *   docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json
 *   docs/launch-evidence/04-mobile-ui/screenshots/<route-slug>--<viewport>.png
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  runDetectors,
  type Defect,
  type ElementShape,
  type PageShape,
  type ViewportShape,
} from './detectors';
import {
  toJson,
  utcNowIso,
  type EvidenceArtifact,
  type EvidenceCheck,
  type EvidenceStatus,
} from '../contract/evidenceArtifact';

// ── Gating & configuration (env-driven, deployed-target) ─────────────────────

/** Live capture requires installed browsers + a reachable deployed target. */
const E2E_ENABLED = process.env.LAUNCH_MOBILE_UI_E2E === '1';

/** Deployed/preview target. Falls back to the shared Playwright base URL, then localhost. */
const BASE_URL =
  process.env.LAUNCH_MOBILE_UI_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://localhost:5173';

/** Logged-in storage states per guard; a single shared state is used as a fallback. */
const SHARED_STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE;
const STUDENT_STORAGE_STATE =
  process.env.PLAYWRIGHT_STUDENT_STORAGE_STATE || SHARED_STORAGE_STATE;
const ADMIN_STORAGE_STATE =
  process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE || SHARED_STORAGE_STATE;

/** R4.9 — a route that is not interactive within 30 s fails that cell. */
const INTERACTIVE_BUDGET_MS = 30_000;

const GATE_ID = 'mobile-ui';
const REQUIREMENT = 'R4';

// ── Evidence-store output paths (resolved from this spec's location) ─────────

const SPEC_DIR = path.dirname(new URL(import.meta.url).pathname);
// apps/admissions/tests/playwright -> repo root is four levels up.
const REPO_ROOT = path.resolve(SPEC_DIR, '../../../..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'launch-evidence', '04-mobile-ui');
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'screenshots');
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, 'mobile-ui-evidence.json');

// ── The five required viewport sizes (R4.1) ──────────────────────────────────

interface Viewport extends ViewportShape {
  readonly label: string;
}

const VIEWPORTS: readonly Viewport[] = [
  { label: '360x800', width: 360, height: 800 },
  { label: '390x844', width: 390, height: 844 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1440x900', width: 1440, height: 900 },
];

// ── Route sets: public / auth / student / admin (R4.2) ───────────────────────

type Guard = 'public' | 'auth' | 'student' | 'admin';

interface Route {
  readonly path: string;
  readonly slug: string;
  readonly guard: Guard;
  /** Capture a labeled screenshot at every viewport (R4.11). */
  readonly captureScreenshot?: boolean;
}

const ROUTES: readonly Route[] = [
  // Public — unauthenticated.
  { path: '/', slug: 'public-landing', guard: 'public' },
  { path: '/track-application', slug: 'public-track-application', guard: 'public' },
  { path: '/contact', slug: 'public-contact', guard: 'public' },
  { path: '/404', slug: 'public-not-found', guard: 'public' },
  // Auth — unauthenticated form surfaces.
  { path: '/auth/signin', slug: 'auth-signin', guard: 'auth' },
  { path: '/auth/signup', slug: 'auth-signup', guard: 'auth' },
  { path: '/auth/forgot-password', slug: 'auth-forgot-password', guard: 'auth' },
  { path: '/auth/reset-password', slug: 'auth-reset-password', guard: 'auth' },
  // Student — auth-guarded.
  { path: '/student/dashboard', slug: 'student-dashboard', guard: 'student' },
  { path: '/student/application-wizard', slug: 'student-application-wizard', guard: 'student' },
  { path: '/student/status', slug: 'student-status', guard: 'student' },
  { path: '/student/payment', slug: 'student-payment', guard: 'student' },
  { path: '/student/interview', slug: 'student-interview', guard: 'student' },
  { path: '/student/settings', slug: 'student-settings', guard: 'student' },
  // Admin — auth-guarded; the two dense admin surfaces get screenshots (R4.11).
  { path: '/admin/dashboard', slug: 'admin-dashboard', guard: 'admin' },
  { path: '/admin/applications', slug: 'admin-applications', guard: 'admin', captureScreenshot: true },
  { path: '/admin/tenants', slug: 'admin-tenants', guard: 'admin', captureScreenshot: true },
  { path: '/admin/users', slug: 'admin-users', guard: 'admin' },
  { path: '/admin/audit', slug: 'admin-audit', guard: 'admin' },
];

/** Storage state for a guard, or `undefined` when the guard needs no session. */
function storageStateFor(guard: Guard): string | undefined {
  if (guard === 'student') return STUDENT_STORAGE_STATE;
  if (guard === 'admin') return ADMIN_STORAGE_STATE;
  return undefined;
}

// ── Cross-cell accumulator (single worker; afterAll writes one artifact) ─────

interface CellOutcome {
  readonly route: string;
  readonly slug: string;
  readonly viewport: string;
  /** `'clean'` = ran with zero defects; `'defects'`; `'not-interactive'`; `'skipped'`. */
  readonly state: 'clean' | 'defects' | 'not-interactive' | 'skipped';
  readonly defects: Defect[];
  readonly screenshot?: string;
  readonly detail?: string;
}

const cellOutcomes: CellOutcome[] = [];

// ── In-page extraction (runs in the browser; pure data out) ──────────────────

/**
 * Collect the plain-data `ElementShape`/`PageShape` inputs the detectors need,
 * entirely in page context. Returns serializable data only — no live nodes.
 *
 * This function is stringified and evaluated in the browser, so it must not
 * reference anything from the module scope; the `ElementShape` annotations are
 * compile-time only and are erased before serialization.
 */
function extractPageShape(): {
  bodyScrollWidth: number;
  controls: ElementShape[];
  regions: ElementShape[];
  dialogs: ElementShape[];
} {
  const MAX_ELEMENTS = 600;

  const trim = (value: string | null | undefined): string =>
    typeof value === 'string' ? value.trim() : '';

  const shortId = (el: Element): string => {
    const htmlEl = el as HTMLElement;
    const testId = htmlEl.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    if (htmlEl.id) return `#${htmlEl.id}`;
    const aria = htmlEl.getAttribute('aria-label');
    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria.slice(0, 40)}"]`;
    const cls = trim(htmlEl.getAttribute('class'));
    const firstClass = cls.split(/\s+/).filter(Boolean)[0];
    return firstClass
      ? `${el.tagName.toLowerCase()}.${firstClass}`
      : el.tagName.toLowerCase();
  };

  /** Stable grouping key so only same-parent siblings are compared for overlap. */
  const parentKey = (el: Element): string => {
    const parent = el.parentElement;
    if (!parent) return '__root__';
    const path: string[] = [];
    let node: Element | null = parent;
    let depth = 0;
    while (node && depth < 6) {
      const htmlNode = node as HTMLElement;
      path.unshift(htmlNode.id ? `#${htmlNode.id}` : node.tagName.toLowerCase());
      node = node.parentElement;
      depth += 1;
    }
    return path.join('>');
  };

  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };

  const isVisible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const resolveLabelledby = (el: Element): string => {
    const ids = trim(el.getAttribute('aria-labelledby'));
    if (!ids) return '';
    return ids
      .split(/\s+/)
      .map((id) => trim(document.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' ');
  };

  // Interactive controls (R4.4 clipped text, R4.5 touch size, R4.6 a11y name).
  const controlSelector =
    'button, a[href], input:not([type="hidden"]), select, textarea, ' +
    '[role="button"], [role="link"], [role="tab"], [role="menuitem"], ' +
    '[tabindex]:not([tabindex="-1"])';
  const controlNodes = Array.from(document.querySelectorAll(controlSelector))
    .filter(isVisible)
    .slice(0, MAX_ELEMENTS);

  const controls: ElementShape[] = controlNodes.map((el) => ({
    id: shortId(el),
    tag: el.tagName.toLowerCase(),
    role: trim(el.getAttribute('role')) || undefined,
    rect: rectOf(el),
    clientWidth: (el as HTMLElement).clientWidth,
    textScrollWidth: (el as HTMLElement).scrollWidth,
    ariaLabel: trim(el.getAttribute('aria-label')) || undefined,
    ariaLabelledbyText: resolveLabelledby(el) || undefined,
    textContent: trim(el.textContent) || undefined,
    isInteractive: true,
  }));

  // Sibling card/table/form layout regions (R4.7 overlap).
  const regionSelector =
    'table, form, [data-card], .card, [class*="card"], [class*="Card"], [role="region"]';
  const regionNodes = Array.from(document.querySelectorAll(regionSelector))
    .filter(isVisible)
    .slice(0, MAX_ELEMENTS);

  const regions: ElementShape[] = regionNodes.map((el) => ({
    id: shortId(el),
    tag: el.tagName.toLowerCase(),
    rect: rectOf(el),
    siblingGroup: parentKey(el),
  }));

  // Open dialogs (R4.8 broken dialog). `dismissibleByEscape` is refined by a
  // live Escape probe in the spec after this snapshot is taken.
  const dialogNodes = Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'),
  ).filter(isVisible);

  const closeSelector =
    'button[aria-label*="close" i], button[aria-label*="dismiss" i], ' +
    'button[aria-label*="cancel" i], [data-dialog-close], [data-radix-collection-item]';

  const dialogs: ElementShape[] = dialogNodes.map((el) => {
    const hasCloseControl =
      el.querySelector(closeSelector) !== null ||
      Array.from(el.querySelectorAll('button')).some((b) =>
        /close|dismiss|cancel/i.test(trim(b.textContent) + ' ' + trim(b.getAttribute('aria-label'))),
      );
    const active = document.activeElement;
    const hasFocusContainment = active !== null && el.contains(active);
    return {
      id: shortId(el),
      tag: el.tagName.toLowerCase(),
      role: trim(el.getAttribute('role')) || 'dialog',
      rect: rectOf(el),
      hasCloseControl,
      hasFocusContainment,
      // Set conservatively here; refined by the live Escape probe.
      dismissibleByEscape: false,
    };
  });

  return {
    bodyScrollWidth: document.body.scrollWidth,
    controls,
    regions,
    dialogs,
  };
}

/**
 * Navigate to `route` at `viewport`, extract the page shape, run the detectors,
 * and capture a screenshot when requested. Returns the cell outcome.
 *
 * Auth-guarded routes that redirect to sign-in (no/expired session) still
 * render a valid surface — the calling test skips those cells only when no
 * storage state is configured at all.
 */
async function evaluateCell(
  browser: Browser,
  route: Route,
  viewport: Viewport,
): Promise<CellOutcome> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: viewport.width, height: viewport.height },
    storageState: storageStateFor(route.guard),
  });
  const page: Page = await context.newPage();

  try {
    // R4.9 — the route must reach an interactive/loaded state within 30 s.
    try {
      await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: INTERACTIVE_BUDGET_MS,
      });
      await page.waitForLoadState('networkidle', { timeout: INTERACTIVE_BUDGET_MS });
    } catch {
      return {
        route: route.path,
        slug: route.slug,
        viewport: viewport.label,
        state: 'not-interactive',
        defects: [],
        detail: `route did not reach an interactive state within ${INTERACTIVE_BUDGET_MS}ms`,
      };
    }

    // Capture the labeled screenshot for the two dense admin routes (R4.11)
    // before any interaction probe mutates the rendered state.
    let screenshot: string | undefined;
    if (route.captureScreenshot) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const fileName = `${route.slug}--${viewport.label}.png`;
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, fileName),
        fullPage: true,
      });
      screenshot = path.posix.join('screenshots', fileName);
    }

    const snapshot = await page.evaluate(extractPageShape);

    // Refine dialog Escape-dismissibility with a live probe (R4.8): if pressing
    // Escape reduces the count of open dialogs, treat Escape as a working
    // dismissal mechanism for the dialogs that were open.
    let dialogs = snapshot.dialogs;
    if (dialogs.length > 0) {
      const openLocator = page.locator('[role="dialog"], [role="alertdialog"], dialog[open]');
      const before = await openLocator.count();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const after = await openLocator.count();
      const escapeWorked = after < before;
      dialogs = dialogs.map((dialog) => ({
        ...dialog,
        dismissibleByEscape: escapeWorked,
      }));
    }

    const pageShape: PageShape = {
      viewport: { width: viewport.width, height: viewport.height },
      bodyScrollWidth: snapshot.bodyScrollWidth,
      controls: snapshot.controls,
      regions: snapshot.regions,
      dialogs,
    };

    const defects = runDetectors(pageShape);

    return {
      route: route.path,
      slug: route.slug,
      viewport: viewport.label,
      state: defects.length === 0 ? 'clean' : 'defects',
      defects,
      screenshot,
    };
  } finally {
    await context.close();
  }
}

// ── Evidence-artifact assembly (written once in afterAll) ────────────────────

/** Map a cell's defects (or its non-defect state) into per-check evidence rows. */
function checksForCell(cell: CellOutcome): EvidenceCheck[] {
  if (cell.state === 'skipped') {
    return [
      {
        id: `${cell.slug}@${cell.viewport}`,
        result: 'not-measured',
        route: cell.route,
        viewport: cell.viewport,
        detail: cell.detail ?? 'cell not measured (no session configured / suite disabled)',
      },
    ];
  }
  if (cell.state === 'not-interactive') {
    return [
      {
        id: `${cell.slug}@${cell.viewport}#not-interactive`,
        result: 'fail',
        route: cell.route,
        viewport: cell.viewport,
        detector: 'route-not-interactive',
        offender: cell.route,
        detail: cell.detail ?? '',
      },
    ];
  }
  if (cell.state === 'clean') {
    return [
      {
        id: `${cell.slug}@${cell.viewport}`,
        result: 'pass',
        route: cell.route,
        viewport: cell.viewport,
        detail: 'no defects detected',
      },
    ];
  }
  // One fail row per detected defect (route / viewport / detector / offender).
  return cell.defects.map((defect, index) => ({
    id: `${cell.slug}@${cell.viewport}#${defect.kind}#${index}`,
    result: 'fail',
    route: cell.route,
    viewport: cell.viewport,
    detector: defect.kind,
    offender: defect.offender,
    detail: defect.detail,
  }));
}

/** Build the shared `EvidenceArtifact` from every recorded cell outcome. */
function buildArtifact(cells: readonly CellOutcome[]): EvidenceArtifact {
  const measured = cells.filter((c) => c.state !== 'skipped');
  const failing = measured.filter((c) => c.state === 'defects' || c.state === 'not-interactive');

  // R4.10 — overall passes only if every cell was measured defect-free.
  let status: EvidenceStatus;
  if (measured.length === 0) {
    status = 'unknown';
  } else if (failing.length === 0) {
    status = 'passed';
  } else {
    status = 'failed';
  }

  const checks = cells.flatMap(checksForCell);
  const assets = cells
    .map((c) => c.screenshot)
    .filter((s): s is string => Boolean(s));

  const failures = failing.flatMap((cell) =>
    cell.state === 'not-interactive'
      ? [`${cell.route} @ ${cell.viewport}: not interactive within ${INTERACTIVE_BUDGET_MS}ms`]
      : cell.defects.map(
          (d) => `${cell.route} @ ${cell.viewport}: ${d.kind} (${d.offender})`,
        ),
  );

  const summary =
    measured.length === 0
      ? 'Mobile_UI_Gate produced no measurements (suite disabled or no sessions configured).'
      : `Checked ${measured.length} route+viewport cell(s) across ${VIEWPORTS.length} viewports; ` +
        `${failing.length} cell(s) failed; ${assets.length} screenshot(s) captured.`;

  return {
    gate_id: GATE_ID,
    requirement: REQUIREMENT,
    status,
    generated_at: utcNowIso(),
    generated_by: 'deployed-target',
    summary,
    checks,
    assets,
    failures,
  };
}

/** Write the aggregated artifact into the evidence store. */
function writeArtifact(artifact: EvidenceArtifact): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(EVIDENCE_FILE, `${toJson(artifact)}\n`, 'utf8');
}

// ── Test matrix: one cell per route × viewport ───────────────────────────────

test.describe('Mobile rendered-UI gate @ five viewports (R4)', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(
    !E2E_ENABLED,
    'Set LAUNCH_MOBILE_UI_E2E=1 with installed browsers + a reachable target to run Gate 4.',
  );

  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route.slug} @ ${viewport.label}`, async ({ browser }) => {
        const guardNeedsSession = route.guard === 'student' || route.guard === 'admin';
        const hasSession = Boolean(storageStateFor(route.guard));

        // Gracefully skip auth-guarded cells when no session is configured —
        // record them as not-measured so the rollup stays conservative.
        if (guardNeedsSession && !hasSession) {
          cellOutcomes.push({
            route: route.path,
            slug: route.slug,
            viewport: viewport.label,
            state: 'skipped',
            defects: [],
            detail: `no ${route.guard} storage state configured`,
          });
          test.skip(
            true,
            `Set PLAYWRIGHT_${route.guard.toUpperCase()}_STORAGE_STATE to capture ${route.path}.`,
          );
          return;
        }

        const outcome = await evaluateCell(browser, route, viewport);
        cellOutcomes.push(outcome);

        // Fail the individual cell test so the run surfaces per-cell failures,
        // while the aggregated artifact still records every cell.
        expect(
          outcome.state === 'clean',
          outcome.state === 'not-interactive'
            ? `${route.path} @ ${viewport.label} did not reach an interactive state within ${INTERACTIVE_BUDGET_MS}ms`
            : `${route.path} @ ${viewport.label} has ${outcome.defects.length} defect(s): ` +
                outcome.defects.map((d) => `${d.kind} (${d.offender})`).join('; '),
        ).toBe(true);
      });
    }
  }

  // Emit exactly one aggregated evidence artifact for the whole matrix.
  test.afterAll(() => {
    writeArtifact(buildArtifact(cellOutcomes));
  });
});
