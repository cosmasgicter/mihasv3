/**
 * Required V2 harness — the **six-viewport pixel matrix** (admissions-v2 task
 * **13.3**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third
 *               bullet — *"Run 320x568, 375x667, 390x844, 768x1024, 1280x800, and
 *               1440x900 … Assert 44px targets, no overflow/occlusion/layout
 *               shift, and actual next action in the first mobile viewport."*
 * Requirements: **R16.1** (designed at 320 first), **R16.2** (>= 44 x 44 targets),
 *               **R16.3** (one mobile bottom action surface; the global bottom nav
 *               does not overlap it), **R16.7** (no overflow, clipped text, hidden
 *               commands, overlapping fixed surfaces or layout shift at the six
 *               named widths), **R18.2-R18.4**.
 * Findings:     **STU-03**, **STU-04**, **STU-05**, **STU-10**, **STU-14**,
 *               **STU-20**, **STU-23**, **STU-24**.
 * Evidence:     `docs/v2-evidence/13.3/` — one screenshot per surface per
 *               viewport under `screenshots/<viewport>/`, plus the measured
 *               numbers in `raw/pixel-checks.json`.
 *
 * ## One test per viewport, and why the slicing is the design
 *
 * 13.1 §6.1 recorded six measurements of the existing axe sweep, and every one of
 * its failures was `Test timeout of 30000ms exceeded` rather than a violation,
 * because it walks several routes at two widths inside **one** test budget. A
 * matrix that walked eight surfaces at six widths inside one test would repeat
 * that mistake six times over. So each viewport is its own test: a slow
 * navigation costs one row, the row says which width it was measuring, and a
 * duration result can never be mistaken for a layout one.
 *
 * ## What a "pixel check" is here
 *
 * Every claim below is a **number** read out of the layout engine and published,
 * not a green tick:
 *
 * | claim | measurement |
 * |---|---|
 * | 44 px targets | `getBoundingClientRect()` on every rendered interactive element; offenders printed with their measured size to three decimals |
 * | overflow | `scrollWidth - clientWidth` on the document **and** on every element that scrolls sideways without declaring `overflow-x` |
 * | occlusion | `elementFromPoint` at each control's own centre; a hit that is not the element, its descendant or its ancestor names the covering element |
 * | layout shift | `PerformanceObserver` on `layout-shift`, installed before the document exists, input-driven shifts excluded |
 * | first mobile viewport | the next action's `bottom <= viewportHeight` at `scrollY === 0`, **and** nothing painted over its centre |
 *
 * The helper that does the measuring is `helpers/pixel-checks.ts`, and it hands
 * back the numbers rather than booleans on purpose: the evidence file publishes
 * the value, so a later run can tell drift from noise.
 *
 * ## Not re-derived here
 *
 * `tests/unit/mobileResponsiveness.test.ts` and `productDesignDeFluff.test.tsx`
 * own the jsdom-answerable half (a whole-tree 44 px class scan, six contrast
 * guards, composed-surface walking). jsdom lays nothing out and reports every
 * rect as zero, so none of the five measurements above is expressible there.
 * 11.1-11.5 already captured 320/375/390 for the dashboard, the wizard, documents
 * and the admin lists, and 11.5 ran `/student/history` at all six widths; this
 * file is the sweep across **every** surface at **all six** widths with the
 * numbers recorded.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '../harness-fixtures';
import {
  assertTouchTargets,
  CLS_BUDGET,
  installLayoutShiftObserver,
  measureFirstViewportAction,
  measureOcclusion,
  measureOverflow,
  measureSafeArea,
  measureTouchTargets,
  readLayoutShift,
  trySafeAreaInsetOverride,
} from '../helpers/pixel-checks';
import {
  allowHarnessNoise,
  attributedCls,
  attributedSub44,
  buildStudentWorld,
  evidenceRoot,
  FIRST_MOBILE_VIEWPORT,
  loginStudent,
  settled,
  recordRow,
  SURFACES,
  VIEWPORTS,
  waitForToastsToClear,
  type StudentWorld,
} from '../helpers/surfaces-13-3';

// Task 13.6 remediation L5-L6: resolved rather than hard-coded, so a re-run writes
// into its own directory instead of overwriting 13.3's (GATE-13.1-07). Default is
// unchanged. See `evidenceRoot()` in `../helpers/surfaces-13-3`.
const EVIDENCE_ROOT = evidenceRoot();
const SHOT_ROOT = join(EVIDENCE_ROOT, 'screenshots');
const RAW_ROOT = join(EVIDENCE_ROOT, 'raw');

/**
 * The sub-44 px controls this run **found**, attributed rather than fixed.
 *
 * `AppLayout.tsx` renders the authenticated mobile header actions as
 * `inline-flex h-10 w-10` — **40 x 40 CSS px** — on every authenticated route, for
 * both the student trio (profile, notifications, log out) and the admin pair. R16.2
 * requires >= 44 x 44. Measured here at every one of the six widths, on every
 * authenticated surface, always 40.000 x 40.000.
 *
 * This is finding **GATE-13.3-01** and it belongs to the shell/navigation lane
 * (`src/components/navigation/AppLayout.tsx`, tasks 11.2 / 11.5), not to this one:
 * 13.3 runs and records, it does not repair. The list is keyed on the accessible
 * name **and** the measured size, so it attributes exactly the controls that were
 * measured and nothing else — a *new* sub-44 control, or one of these shrinking
 * further, still fails every row.
 *
 * The correct, unweakened claim is asserted separately by the `test.fail()`-
 * annotated row at the end of this file, following 13.2 §3.6: the assertion states
 * what R16.2 actually requires, the test still executes (a skip is forbidden
 * outright by the harness gate), the counter-example is in the trace, and the day
 * the shell is repointed at `min-h-touch` that row fails *because it passed* —
 * which is the notification the owning lane wants.
 */
/** The dashboard's primary next action — STU-04's core claim, as a selector. */
const NEXT_ACTION_PRIMARY = '[data-testid="next-action-primary"]';
/** The wizard's one bottom action surface (task 11.2, R16.3). */
const WIZARD_ACTION_BAR = '[data-testid="wizard-action-bar"]';
/** The global mobile bottom navigation, which must never compete with it. */
const BOTTOM_NAV = 'nav[aria-label="Bottom navigation"]';

/*
  Deliberately NOT `mode: 'serial'`.

  These rows are independent — each sets its own viewport, each drives its own
  page, and the world they share is built once in `beforeAll`. Under serial mode a
  finding on the second viewport stops the remaining four from being measured at
  all, which is how one known number hides four unknown ones. Measured: the first
  full run reported `320x568` green, `375x667` over the layout-shift budget, and
  then *"7 did not run"*. `workers: 1` still keeps them in order and off each
  other's toes.
*/

let world: StudentWorld | undefined;

test.beforeAll(async () => {
  mkdirSync(RAW_ROOT, { recursive: true });
  for (const viewport of VIEWPORTS) {
    mkdirSync(join(SHOT_ROOT, viewport.label), { recursive: true });
  }
  world = await buildStudentWorld('matrix');
});

test.afterAll(async () => {
  if (world) {
    await world.admin.ctx.dispose();
    world = undefined;
  }
});

/**
 * Load one surface at the current viewport and measure everything about it.
 *
 * The layout-shift observer is installed before the navigation rather than after,
 * because the shifts R16.7 is about happen during first paint — measuring after
 * the page has settled would report a clean 0 for a page that jumped.
 */
async function measureSurface(
  page: Page,
  surface: (typeof SURFACES)[number],
  viewport: (typeof VIEWPORTS)[number],
  project: string,
  violations: string[],
): Promise<void> {
  await installLayoutShiftObserver(page);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(surface.url(world!), { waitUntil: 'domcontentloaded' });
  await settled(page);
  await surface.ready(page);
  // The shift budget is about the load, so give async content its chance to
  // arrive and shift the page before the score is read.
  await page.waitForTimeout(1200);
  const toastsCleared = await waitForToastsToClear(page);

  const [targets, overflow, occlusion, shift] = await Promise.all([
    measureTouchTargets(page),
    measureOverflow(page),
    measureOcclusion(page),
    readLayoutShift(page),
  ]);

  const row: Record<string, unknown> = {
    project,
    viewport: viewport.label,
    surface: surface.label,
    finding: surface.finding,
    touchTargets: {
      scanned: targets.scanned,
      skippedZeroBox: targets.skippedZeroBox,
      minWidth: targets.minWidth,
      minHeight: targets.minHeight,
      offenders: targets.offenders,
    },
    overflow: {
      document: overflow.document,
      body: overflow.body,
      viewportWidth: overflow.viewportWidth,
      clippedCommands: overflow.clippedCommands,
      clippingContainers: overflow.clippingContainers,
      declaredScrollers: overflow.declaredScrollers,
      elementsConsidered: overflow.elementsConsidered,
      widestOffenders: overflow.widestOffenders,
    },
    occlusion: {
      probed: occlusion.probed,
      rescrolled: occlusion.rescrolled,
      occludedAtRest: occlusion.occludedAtRest,
      occluded: occlusion.occluded,
    },
    layoutShift: { cls: shift.cls, observed: shift.observed, shifts: shift.shifts },
    toastsClearedBeforeMeasuring: toastsCleared,
  };

  // The four findings' controls are recorded in full and attributed, so the ledger
  // publishes every offender with its measured size while each row's own assertion
  // is about the surface rather than about primitives other lanes own.
  const newOffenders = targets.offenders.filter((o) => !attributedSub44(o));
  const attributed = targets.offenders
    .map((o) => ({ ...o, ...(attributedSub44(o) ? { finding: attributedSub44(o)!.finding, owner: attributedSub44(o)!.owner } : {}) }))
    .filter((o) => 'finding' in o);
  row.touchTargets = {
    ...(row.touchTargets as object),
    attributedOffenders: attributed,
    unattributedOffenders: newOffenders,
  };
  recordRow(project, row);

  await page.screenshot({
    path: join(SHOT_ROOT, viewport.label, `${surface.id}-${project}.png`),
    fullPage: false,
  });

  /*
    Every row of the matrix is reported, and the assertions are collected rather
    than thrown one at a time. 13.2's matrices establish the shape: *"every row of
    every matrix is a separate test, so the run reports the rows rather than a
    total"*. Throwing on the first surface would have meant the 320 px row told me
    about the header and nothing about the other seven surfaces — which is how a
    single known defect hides six unknown ones.
  */
  const where = `${surface.label} @ ${viewport.label}`;
  if (newOffenders.length > 0) {
    violations.push(
      `${where}: ${newOffenders.length} pointer target(s) under 44x44 (R16.2) — ` +
        newOffenders.map((o) => `${o.tag}[${o.label}] ${o.width}x${o.height}`).join(', '),
    );
  }
  if (overflow.document > 1) {
    violations.push(
      `${where}: horizontal document overflow of ${overflow.document}px (R16.7) — ` +
        `widest: ${JSON.stringify(overflow.widestOffenders)}`,
    );
  }
  if (overflow.clippedCommands.length > 0) {
    violations.push(
      `${where}: ${overflow.clippedCommands.length} command(s) clipped out of a ` +
        `hidden-overflow container (R16.7) — ${JSON.stringify(overflow.clippedCommands)}`,
    );
  }
  if (occlusion.occluded.length > 0) {
    violations.push(
      `${where}: ${occlusion.occluded.length} interactive element(s) still covered ` +
        `after being scrolled into view (R16.3) — ${JSON.stringify(occlusion.occluded)}`,
    );
  }
  /*
    Layout shift is recorded here and asserted in its own row (§10 below).

    It is the one measurement in this file that is a *budget* rather than a
    geometric fact: 44 px, overflow and occlusion are the same number on every run,
    while CLS depends on when async content lands. Folding it into the per-viewport
    rows meant a 0.1172 reading at 375 px suppressed the geometry of four widths
    that had not been measured yet. Same discipline as the axe slicing: never let
    one axis mask another.
  */
  // These two are about the instrument, not the product: a scan that measured
  // nothing must never read as a surface that passed.
  expect(targets.scanned, `${where}: the touch-target scan must have measured something`)
    .toBeGreaterThan(0);
  expect(occlusion.probed, `${where}: the occlusion probe must have had something to probe`)
    .toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// 1-6. One test per viewport. Six columns, six tests.
// ---------------------------------------------------------------------------
for (const viewport of VIEWPORTS) {
  test(`every student surface holds at ${viewport.label}`, async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    const project = testInfo.project.name;
    const violations: string[] = [];
    // The public surface first, so the authenticated session cannot mask a
    // failure on a page an anonymous visitor sees.
    for (const surface of SURFACES.filter((s) => s.auth === 'public')) {
      await measureSurface(page, surface, viewport, project, violations);
    }
    await loginStudent(page, world!);
    for (const surface of SURFACES.filter((s) => s.auth === 'student')) {
      await measureSurface(page, surface, viewport, project, violations);
    }
    expect(
      violations,
      `${SURFACES.length} surfaces measured at ${viewport.label}; ` +
        `${violations.length} produced a violation`,
    ).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// 7. The bullet's most substantive assertion: the ACTUAL next action, unscrolled,
//    in the FIRST mobile viewport.
// ---------------------------------------------------------------------------
/**
 * STU-04's core claim, measured rather than asserted.
 *
 * Three things separate this from what task 11.1 already established, and each
 * one is the difference between a claim and a slogan:
 *
 * 1. **`bottom <= viewportHeight`, not `y < viewportHeight`.** 11.1 measures the
 *    panel's *top* against the viewport height, which says the block starts on
 *    screen. This measures the whole primary control fitting.
 * 2. **`scrollY === 0`.** Playwright's `toBeVisible()` is satisfied by scrolling
 *    the element into view, so a control 900 px down a 568 px viewport passes it.
 *    The page is forced to the top before the box is read.
 * 3. **Nothing painted over it.** A control that is on screen and underneath the
 *    global bottom navigation is not available either — which is exactly STU-03's
 *    complaint about competing surfaces, arriving on STU-04's page.
 *
 * And the action has to be the **server's**: `student-next-action` renders what
 * `readiness` published, so the label measured here is compared against the
 * platform's own `allowed_next_actions[0]`. A dashboard that showed a plausible
 * action it invented in the browser would pass a geometry test and still be the
 * defect STU-04 names.
 */
test('the server-derived next action is fully visible, unscrolled, at 320x568', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const project = testInfo.project.name;
  await loginStudent(page, world!);

  // What the platform says the next action is. `/api/v2/student/...` is the
  // canonical readiness read (task 6.5); 11.1's dashboard journey uses the same one.
  const readinessResp = await page.request.get(
    `/api/v2/student/applications/${world!.draftApplicationId}/readiness/`,
  );
  expect(
    readinessResp.ok(),
    `readiness should be readable (got ${readinessResp.status()}: ${await readinessResp.text()})`,
  ).toBeTruthy();
  const readinessBody = await readinessResp.json();
  const readiness = 'data' in readinessBody ? readinessBody.data : readinessBody;
  const serverActions: { label: string }[] = readiness?.allowed_next_actions ?? [];
  expect(
    serverActions.length,
    'the platform should publish at least one allowed next action for a live draft',
  ).toBeGreaterThan(0);

  await page.setViewportSize({
    width: FIRST_MOBILE_VIEWPORT.width,
    height: FIRST_MOBILE_VIEWPORT.height,
  });
  await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(NEXT_ACTION_PRIMARY).first()).toBeVisible({ timeout: 45_000 });

  const action = await measureFirstViewportAction(page, NEXT_ACTION_PRIMARY);
  recordRow(project, {
    project,
    viewport: FIRST_MOBILE_VIEWPORT.label,
    surface: '/student/dashboard',
    claim: 'server-derived next action fully visible unscrolled',
    serverNextActions: serverActions.map((a) => a.label),
    measured: action,
  });

  await page.screenshot({
    path: join(SHOT_ROOT, FIRST_MOBILE_VIEWPORT.label, `next-action-first-viewport-${project}.png`),
    fullPage: false,
  });

  expect(action.found, 'the dashboard should render a primary next action').toBeTruthy();
  expect(action.scrollY, 'the box must be measured with the page at the top').toBe(0);
  expect(
    action.occludedBy,
    `the next action must not be painted over (covered by ${action.occludedBy})`,
  ).toBeNull();
  /*
    **GATE-13.3-16** is recorded here and asserted, unweakened, by the `test.fail()`
    row at the end of this file: 13 px of the action's 68 px height — 19.1 % — sit
    underneath the fixed bottom navigation, which begins at y = 507 while the action
    spans 452-520.

    The centre-point probe above reports `occludedBy: null` and is right to: the
    control's centre (y ≈ 486) is clear, so the control is clickable. R16.3's clause
    is not about clickability though — *"SHALL not overlap, obscure, or compete"* — and
    neither is R16.7's *"overlapping fixed surfaces"*.

    **Reviewing the screenshot is what caught this**, which is the argument for the
    `_Evidence:` line asking for reviewed screenshots rather than a green suite: the
    second line of the button's label is visibly behind the bar in
    `screenshots/320x568/next-action-first-viewport-*.png`, and no assertion in this
    file was looking for it.
  */
  expect(
    action.fullyVisibleUnscrolled,
    `the whole next action must fit the first ${FIRST_MOBILE_VIEWPORT.label} viewport ` +
      `without scrolling: measured top ${action.top}, bottom ${action.bottom}, ` +
      `viewport height ${action.viewportHeight}`,
  ).toBeTruthy();
  // It is the platform's action, not one the browser guessed.
  expect(
    serverActions.some(
      (a) =>
        action.label.toLowerCase().includes(a.label.toLowerCase()) ||
        a.label.toLowerCase().includes(action.label.toLowerCase()),
    ),
    `the rendered action "${action.label}" should be one the server published ` +
      `(${serverActions.map((a) => a.label).join(' | ')})`,
  ).toBeTruthy();
});

// ---------------------------------------------------------------------------
// 8. Safe areas: the wizard action bar and the bottom nav (R16.3, task 11.2)
// ---------------------------------------------------------------------------
/**
 * The wizard's action bar and the global bottom navigation both sit against the
 * bottom edge, so both have to clear a home indicator, and they must never be on
 * screen together (R16.3: *"THE wizard SHALL render one mobile bottom action
 * surface. The global bottom navigation SHALL not overlap, obscure, or compete
 * with wizard controls"*).
 *
 * Two measurements, and the honest limit is recorded with them. A real device
 * inset cannot be *simulated* by setting a CSS variable, because the bar's
 * padding is written as `env(safe-area-inset-bottom, 0px)` inside a Tailwind
 * arbitrary value and `env()` is resolved by the browser, not the page. So this
 * test first **tries** to make Chrome publish a real inset over CDP
 * (`Emulation.setSafeAreaInsetsOverride`) and records whether that worked; either
 * way it measures the declaration, which is the durable claim — a bar that
 * hardcodes `pb-3` can never clear an indicator no matter what the device says.
 */
test('the wizard action bar and bottom navigation respect the bottom safe area', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const project = testInfo.project.name;
  const insetApplied = await trySafeAreaInsetOverride(page, 34);
  await loginStudent(page, world!);
  await page.setViewportSize({
    width: FIRST_MOBILE_VIEWPORT.width,
    height: FIRST_MOBILE_VIEWPORT.height,
  });

  // (a) The wizard: its own bar, and no global bottom nav next to it.
  await page.goto(`/student/application-wizard?mode=resume&draftId=${world!.draftApplicationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await settled(page);
  await expect(page.locator(WIZARD_ACTION_BAR)).toBeVisible({ timeout: 60_000 });
  const barSafeArea = await measureSafeArea(page, WIZARD_ACTION_BAR);
  const bottomNavOnWizard = await page.locator(BOTTOM_NAV).count();
  const barBox = await page.locator(WIZARD_ACTION_BAR).boundingBox();
  await page.screenshot({
    path: join(SHOT_ROOT, FIRST_MOBILE_VIEWPORT.label, `wizard-safe-area-${project}.png`),
    fullPage: false,
  });

  // (b) The dashboard: the global bottom nav is the bottom-anchored surface there,
  //     and `--bottom-nav-safe-offset` is what keeps content clear of it.
  await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
  await settled(page);
  const navInsetVars = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      safeAreaInsetBottom: root.getPropertyValue('--safe-area-inset-bottom').trim(),
      bottomNavHeight: root.getPropertyValue('--mobile-bottom-nav-height').trim(),
      bottomNavSafeOffset: root.getPropertyValue('--bottom-nav-safe-offset').trim(),
    };
  });
  const navSafeArea = await measureSafeArea(page, BOTTOM_NAV);

  recordRow(project, {
    project,
    viewport: FIRST_MOBILE_VIEWPORT.label,
    claim: 'bottom safe area is respected by the one bottom-anchored surface',
    cdpSafeAreaInsetOverrideApplied: insetApplied,
    wizardActionBar: { ...barSafeArea, box: barBox },
    bottomNavCountOnWizardRoute: bottomNavOnWizard,
    bottomNavSafeArea: navSafeArea,
    rootCustomProperties: navInsetVars,
  });

  // R16.3: exactly one bottom action surface on the wizard route.
  expect(
    bottomNavOnWizard,
    'the global bottom navigation must be suppressed on the wizard route (R16.3)',
  ).toBe(0);
  // The bar's padding-bottom is derived from the inset rather than hardcoded.
  expect(
    barSafeArea.declaresInset,
    `the wizard action bar's bottom padding should derive from ` +
      `env(safe-area-inset-bottom); measured declaration: ${barSafeArea.declaration || '(none found)'}`,
  ).toBeTruthy();
  // And the shell publishes the inset chain the bottom nav offset is built from.
  expect(
    navInsetVars.bottomNavSafeOffset,
    'the shell should publish --bottom-nav-safe-offset for content to clear the bar',
  ).not.toBe('');
});

// ---------------------------------------------------------------------------
// 9. GATE-13.3-01: the unweakened R16.2 claim, stated correctly and expected to fail
// ---------------------------------------------------------------------------
/**
 * **The finding this task found, on the record with the correct claim.**
 *
 * R16.2: *"EVERY pointer target SHALL be at least 44 by 44 CSS pixels."* The
 * authenticated mobile header renders three controls at `h-10 w-10` — 40 x 40 —
 * on every authenticated student route, and the admin header renders one the same
 * way (`src/components/navigation/AppLayout.tsx`, `mobileActions`). So the
 * unweakened whole-tree assertion fails, and the six rows above allow-list exactly
 * those controls by name and measured size so they can still measure everything
 * else.
 *
 * The row was annotated `test.fail()` rather than deleted, weakened, or left red,
 * for the four reasons 13.2 §3.6 sets out:
 *
 * * the assertion states the **correct** claim, so nothing here can be read as
 *   blessing 40 px;
 * * the test still **executes** — `test.skip` is a hard failure in this harness
 *   (GOV-04), and rightly;
 * * the counter-example is captured in the trace and in
 *   `raw/pixel-checks-*.json`; and
 * * the day the shell is repointed at Tailwind's `min-h-touch` / `min-w-touch`,
 *   this row fails **because it passed**, which is exactly the notification the
 *   shell lane wants.
 *
 * ## Converted by task 13.6 remediation L6 — that day came
 *
 * `AppLayout.tsx`'s `mobileActions` are `min-h-touch min-w-touch`, and the other
 * six controls 13.3 found are fixed too (`KNOWN_SUB44` is now empty — see
 * `helpers/surfaces-13-3.ts`). So `test.fail()` became `test()`: the assertion is
 * **byte-for-byte the same claim**, `assertTouchTargets(targets, …)` with no
 * allow-list, and the annotation is gone because the platform now satisfies it.
 *
 * Nothing was relaxed to get here. If any control on this surface drops below
 * 44 x 44 again, this row goes red — which is what it was written for.
 */
test(
  'GATE-13.3-01 (closed): every pointer target is >= 44x44 on the dashboard',
  async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    await loginStudent(page, world!);
    await page.setViewportSize({
      width: FIRST_MOBILE_VIEWPORT.width,
      height: FIRST_MOBILE_VIEWPORT.height,
    });
    await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });

    const targets = await measureTouchTargets(page);
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      viewport: FIRST_MOBILE_VIEWPORT.label,
      surface: '/student/dashboard',
      finding: 'GATE-13.3-01',
      claim: 'R16.2 unweakened: every pointer target >= 44x44',
      expectedToFail: false,
      convertedBy: '13.6 remediation L6',
      owner: 'shell/navigation lane — src/components/navigation/AppLayout.tsx',
      touchTargets: targets,
    });
    await page.screenshot({
      path: join(
        SHOT_ROOT,
        FIRST_MOBILE_VIEWPORT.label,
        `gate-13-3-01-sub44-header-${testInfo.project.name}.png`,
      ),
      fullPage: false,
    });

    // The claim R16.2 actually makes. No allow-list.
    assertTouchTargets(targets, `/student/dashboard @ ${FIRST_MOBILE_VIEWPORT.label} (unweakened)`);
  },
);

// ---------------------------------------------------------------------------
// 10. Layout shift, at all six widths, with every number published
// ---------------------------------------------------------------------------
/**
 * R16.7's *"or layout shifts"* clause, measured as CLS and reported per width.
 *
 * The budget is **0.1** — Core Web Vitals' own "good" threshold, and the one
 * `.agents/skills/core-web-vitals` uses. R16.7 forbids layout shift without naming
 * a number, so the published threshold is used rather than an invented one.
 *
 * This is its own row, and the reason is a measurement rather than a preference:
 * CLS is the only claim in this file that depends on *when* content arrives, so
 * putting it in the six geometry rows meant a single reading at 375 px stopped the
 * other four widths from ever being measured. Here all six are collected first and
 * asserted once, so the failure — if there is one — names every number instead of
 * the first one over the line.
 */
test('cumulative layout shift stays within budget at all six widths', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const project = testInfo.project.name;
  await loginStudent(page, world!);

  const readings: { viewport: string; surface: string; cls: number; shifts: unknown[] }[] = [];
  for (const viewport of VIEWPORTS) {
    for (const [surface, url] of [
      ['/student/dashboard', '/student/dashboard'],
      [
        '/student/application-wizard',
        `/student/application-wizard?mode=resume&draftId=${world!.draftApplicationId}`,
      ],
    ] as const) {
      await installLayoutShiftObserver(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await settled(page);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 60_000 });
      // Async content has to have landed, or a clean score only means "not yet".
      await page.waitForTimeout(2000);
      const shift = await readLayoutShift(page);
      readings.push({
        viewport: viewport.label,
        surface,
        cls: shift.cls,
        shifts: shift.shifts,
      });
      expect(shift.observed, `${surface} @ ${viewport.label}: layout-shift entries must be observable`)
        .toBeTruthy();
    }
  }

  recordRow(project, {
    project,
    claim: `cumulative layout shift <= ${CLS_BUDGET} at all six R16.7 widths`,
    budget: CLS_BUDGET,
    readings,
    worst: readings.reduce((a, b) => (b.cls > a.cls ? b : a), readings[0]),
    overBudget: readings
      .filter((r) => r.cls > CLS_BUDGET)
      .map((r) => ({ ...r, finding: attributedCls(r)?.finding ?? 'UNATTRIBUTED' })),
  });

  const overBudget = readings.filter((r) => r.cls > CLS_BUDGET);
  const unattributed = overBudget.filter((r) => !attributedCls(r));
  expect(
    unattributed.map(
      (r) => `${r.surface} @ ${r.viewport}: CLS ${r.cls} — ${JSON.stringify(r.shifts)}`,
    ),
    `${readings.length} readings taken, budget ${CLS_BUDGET}; ` +
      `${overBudget.length} over budget, ${overBudget.length - unattributed.length} ` +
      `attributed to GATE-13.3-07; all readings: ` +
      readings.map((r) => `${r.viewport}/${r.surface.split('/').pop()}=${r.cls}`).join(' '),
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// 11. GATE-13.3-09 and GATE-13.3-04: the bare `/student/status` route
// ---------------------------------------------------------------------------
/**
 * **The canonical status route with no id, measured — because two findings would
 * otherwise rest on a run whose artifacts were not preserved.**
 *
 * `/student/status` is a registered canonical route
 * (`routeRegistry.ts` → `student.status`), and the sibling `/student/application-status`
 * redirects to it. Measured for a student who owns **two** applications — one draft
 * and one submitted — it renders *"Application Not Found"*.
 *
 * Two findings live on that screen:
 *
 * * **GATE-13.3-09** — the route itself. A student who follows the canonical status
 *   path, or the redirect that points at it, is told their application does not
 *   exist. STU-23's remedy was *"choose one canonical application workspace and
 *   redirect the other"*; the id-bearing route is the workspace, and this one
 *   neither resolves an application nor redirects anywhere. Owner: the student
 *   workspace lane.
 * * **GATE-13.3-04** — `ErrorDisplay`'s own controls. `Contact Support` and
 *   `Go Back` are text-sized links (`inline-flex … text-sm`, no touch minimum) and
 *   measure ~127 x 20 and ~66 x 20 — well under R16.2's 44 px. Because they live in
 *   a shared primitive they appear on **every** error state in the product, not just
 *   this one. Owner: the design-system lane
 *   (`src/components/ui/ErrorDisplay.tsx:64, :109`).
 *
 * The matrix's `status` surface deliberately measures the **id-bearing** route
 * instead, so it publishes the real workspace rather than an error state; this row
 * exists so the error state is still on the record, in the run whose trace is kept.
 *
 * Was annotated `test.fail()` per 13.2 §3.6 — the assertion is R16.2's real claim.
 *
 * ## Converted by task 13.6 remediation L5 + L6
 *
 * * **GATE-13.3-09** — the cause was a missing branch, not a broken read:
 *   `useApplicationWorkspace`'s `enabled: !!id && enabled` meant the bare route
 *   never issued a query, so `application` stayed `null`, `loading` stayed `false`,
 *   and the page fell into its error branch. An absent *parameter* was reported as
 *   an absent *application*. `/student/status` now resolves the student's own
 *   applications: redirect when there is exactly one, **a chooser when there are
 *   several**, and a real "start an application" empty state when there are none.
 *   A chooser rather than a recency guess, because
 *   `.kiro/steering/enterprise-tenancy.md` already settles that question for the
 *   wizard and the same reasoning applies here.
 * * **GATE-13.3-04** — `ErrorDisplay`'s three controls carry `min-h-touch`.
 *
 * The two original assertions are unchanged. A third is **added**, not substituted:
 * a student who owns applications must be able to *reach* one from this route, which
 * is the behaviour STU-23 actually asks for and which "does not say not found" alone
 * would not have caught (an empty page also does not say "not found").
 */
test(
  'GATE-13.3-09/-04 (closed): the bare /student/status route resolves and its controls meet 44px',
  async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    await loginStudent(page, world!);
    await page.setViewportSize({
      width: FIRST_MOBILE_VIEWPORT.width,
      height: FIRST_MOBILE_VIEWPORT.height,
    });
    await page.goto('/student/status', { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1200);

    const [targets, shown] = await Promise.all([
      measureTouchTargets(page),
      page.evaluate(() => {
        const headings = Array.from(
          document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
        )
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => `h${el.tagName.replace('H', '')} "${(el.textContent || '').trim().slice(0, 40)}"`);
        return {
          headings,
          bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
          finalPath: window.location.pathname,
          // Task 13.6 L5: how the route answered — a chooser, or a redirect to the
          // one workspace. Recorded so the evidence shows *which* branch ran.
          choiceLinks: Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid="status-index-choice-link"]'),
          ).length,
          startsAnApplication: Boolean(
            document.querySelector('[data-testid="status-index-start-application"]'),
          ),
        };
      }),
    ]);

    // How many applications the student actually owns, so "not found" is measurable
    // as wrong rather than merely surprising.
    const listResp = await page.request.get('/api/v1/applications/');
    const listBody = await listResp.json();
    const listData = 'data' in listBody ? listBody.data : listBody;
    const owned: unknown[] = Array.isArray(listData) ? listData : (listData?.results ?? []);

    await page.screenshot({
      path: join(
        SHOT_ROOT,
        FIRST_MOBILE_VIEWPORT.label,
        `gate-13-3-09-bare-status-${testInfo.project.name}.png`,
      ),
      fullPage: false,
    });
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      viewport: FIRST_MOBILE_VIEWPORT.label,
      surface: '/student/status (no id)',
      finding: 'GATE-13.3-09 + GATE-13.3-04',
      expectedToFail: false,
      convertedBy: '13.6 remediation L5 + L6',
      owner:
        'student workspace lane (route) + design-system lane (src/components/ui/ErrorDisplay.tsx)',
      applicationsOwnedByThisStudent: owned.length,
      rendered: shown,
      touchTargets: targets,
    });

    // GATE-13.3-09's claim: a student with applications is not told they have none.
    expect(
      shown.bodyText,
      `a student owning ${owned.length} application(s) should not be told none exists ` +
        `on the canonical status route; rendered: "${shown.bodyText}"`,
    ).not.toMatch(/not found/i);

    /*
      And the claim STU-23 actually makes, which the sentence above does not reach:
      the route has to *get the student to a workspace*. An empty page says nothing
      about "not found" either. So for a student who owns more than one application
      the route must offer one link per application, and for a student who owns
      exactly one it must have landed on that application's workspace.
    */
    expect(
      owned.length,
      'this world seeds a student who owns applications; the row is meaningless otherwise',
    ).toBeGreaterThan(0);
    if (owned.length > 1) {
      expect(
        shown.choiceLinks,
        `a student owning ${owned.length} applications should be offered one link each; ` +
          `rendered path ${shown.finalPath}, ${shown.choiceLinks} link(s)`,
      ).toBe(owned.length);
    } else {
      expect(
        shown.finalPath,
        `a student owning exactly one application should land on its workspace; ` +
          `rendered path ${shown.finalPath}`,
      ).toMatch(/^\/student\/application\/[^/]+\/status$/);
    }

    // GATE-13.3-04's claim: every control on this surface meets 44 px.
    assertTouchTargets(targets, '/student/status (no id)');
  },
);

// ---------------------------------------------------------------------------
// 12. GATE-13.3-16: the bottom navigation overlaps the dashboard's primary action
// ---------------------------------------------------------------------------
/**
 * **The finding a screenshot caught and no assertion was looking for.**
 *
 * R16.3: *"THE wizard SHALL render one mobile bottom action surface. The global
 * bottom navigation SHALL not overlap, obscure, or compete with wizard controls."*
 * R16.7 forbids *"overlapping fixed surfaces"*.
 *
 * Measured at 320 × 568 on the dashboard:
 *
 * ```
 * primary next action    top 452.000   bottom 520.000   height 68.000
 * fixed bottom nav       top 507.000
 * overlap               13.000 px  =  19.12 % of the action's height
 * elementFromPoint at the action's centre (y ≈ 486)   →   the action itself
 * ```
 *
 * So the control is clickable — its centre is clear — and its lower fifth is behind
 * the navigation bar, with the second line of *"Pay or defer the application fee"*
 * visibly cut in
 * `screenshots/320x568/next-action-first-viewport-*.png`. A centre-point hit test
 * answers *"is the middle of this tappable"*; the requirement asks about the box.
 *
 * The dashboard reserves `--bottom-nav-safe-offset` for scrolled content, so
 * scrolling clears it — but this is the **first viewport, unscrolled**, which is
 * precisely the position R16.1 and STU-04 are about: the student's next action, as
 * they first see it, partly behind the navigation.
 *
 * Was annotated `test.fail()` per 13.2 §3.6. Owner: the dashboard lane (task 11.1)
 * for the panel's bottom spacing, or the shell lane for the bar — 13.3 did not
 * choose between them, it measured.
 *
 * ## Converted by task 13.6 remediation L6 — and the choice 13.3 declined to make
 *
 * Neither, as it turns out: the fix is **what is above the action**, and it is the
 * requirement's own ordering rule rather than a spacing tweak.
 *
 * `PageShell` renders header `actions` between the page title and the children, and
 * below `md` it stacks them on their own row — so the dashboard's *Refresh* control
 * cost 60 px (a 16 px gap plus a 44 px full-width button) directly above the
 * student's next action at 320 px. R16.5 puts passive controls **after** the next
 * required action, and a Refresh button is not the student's next action. It is now
 * the first control below the panel: same page, one tap away, and no longer between
 * the student and what they came to do.
 *
 * Trimming padding would also have bought the ~19 px needed, and would have been
 * re-broken by the next slightly longer server-published label. Removing 60 px of
 * chrome leaves real headroom, and the measurement below records how much.
 *
 * The assertion is unchanged: `overlappingBars` must be empty, measured as an
 * **area intersection** against every on-screen fixed/sticky bar — the instrument
 * 13.3 upgraded to *after* the screenshot review, because a centre-point probe
 * answers a different question.
 */
test(
  'GATE-13.3-16 (closed): no fixed bar overlaps the next action at 320x568',
  async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    await loginStudent(page, world!);
    await page.setViewportSize({
      width: FIRST_MOBILE_VIEWPORT.width,
      height: FIRST_MOBILE_VIEWPORT.height,
    });
    await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.locator(NEXT_ACTION_PRIMARY).first()).toBeVisible({ timeout: 45_000 });

    const action = await measureFirstViewportAction(page, NEXT_ACTION_PRIMARY);
    await page.screenshot({
      path: join(
        SHOT_ROOT,
        FIRST_MOBILE_VIEWPORT.label,
        `gate-13-3-16-nav-overlaps-action-${testInfo.project.name}.png`,
      ),
      fullPage: false,
    });
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      viewport: FIRST_MOBILE_VIEWPORT.label,
      surface: '/student/dashboard',
      finding: 'GATE-13.3-16',
      expectedToFail: false,
      convertedBy: '13.6 remediation L6',
      owner: 'dashboard lane — the Refresh control moved below the next action (R16.5)',
      claim: 'R16.3/R16.7: no fixed surface overlaps the primary next action, unscrolled',
      measured: action,
    });

    expect(
      action.overlappingBars,
      `no fixed or sticky surface should overlap the primary next action in the ` +
        `first mobile viewport (R16.3, R16.7); the action spans ` +
        `${action.top}-${action.bottom} of a ${action.viewportHeight}px viewport`,
    ).toEqual([]);
  },
);
