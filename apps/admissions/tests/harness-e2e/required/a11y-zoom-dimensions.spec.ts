/**
 * Required V2 harness — **keyboard, screen-reader semantics, focus, reduced
 * motion, 200/400 % zoom, slow 3G and offline** (admissions-v2 task **13.3**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third
 *               bullet — *"Test keyboard, screen reader semantics, focus
 *               restore/error focus, reduced motion, 200/400 percent zoom, safe
 *               areas, slow 3G/offline, and long tenant/program/localized
 *               strings."*
 * Requirements: **R16.2** (focus order, visible focus, names, descriptions,
 *               errors, modal focus containment at WCAG 2.1 AA), **R16.6** (product
 *               dialogs, never `window.confirm`), **R16.8** (next action, status,
 *               autosave state, payment action and error recovery remain
 *               understandable under 400 % text zoom, reduced motion, slow network
 *               and offline/reconnect), **R18.2-R18.4**.
 * Findings:     **STU-03**, **STU-04**, **STU-10**, **STU-20**, **STU-23**.
 *
 * This file owns **seven** of the bullet's nine dimensions. Safe areas are in
 * `viewport-pixel-matrix.spec.ts` (they are a pixel claim about the bottom bar);
 * long tenant/program/localized strings are in
 * `long-content-tenant-strings.spec.ts` (they need a tenant configured with long
 * names, which the harness does not seed).
 *
 * | # | dimension | how it is measured |
 * |---|---|---|
 * | 1 | keyboard | the real `Tab` sequence is walked and recorded; every stop must have a visible focus indicator and an accessible name, and the primary action must be reachable |
 * | 2 | screen-reader semantics | `ariaSnapshot()` of the surface's `main` — the accessibility tree a screen reader reads, not the DOM — plus landmark/heading-order checks |
 * | 3 | focus restore | a product dialog is opened from a known trigger, contained, dismissed, and focus must return **to that trigger** |
 * | 4 | error focus | a refused sign-in must move focus or announce through a live region; the message must be reachable without sight of the layout |
 * | 5 | reduced motion | `prefers-reduced-motion: reduce` is emulated and every animation/transition duration on the page is read from computed style |
 * | 6 | 200 % / 400 % zoom | a 32 px and a 64 px root font, at the widths each standard actually specifies |
 * | 7 | slow 3G / offline | CDP `Network.emulateNetworkConditions` at Chrome's own Slow-3G preset, then a real offline/reconnect cycle |
 *
 * Reduced motion is enforced globally in `apps/admissions/src/index.css` and is
 * **never overridden** here — dimension 5 asserts the enforcement, it does not
 * install it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '../harness-fixtures';
import {
  clearBrowserCache,
  clearNetworkEmulation,
  emulateNetwork,
  measureOverflow,
  measureTouchTargets,
  SLOW_3G,
} from '../helpers/pixel-checks';
import {
  allowHarnessNoise,
  attributedHeadingIssue,
  buildStudentWorld,
  evidenceRoot,
  FIRST_MOBILE_VIEWPORT,
  loginStudent,
  recordRow,
  settled,
  type StudentWorld,
} from '../helpers/surfaces-13-3';

// Task 13.6 remediation L5-L6: resolved rather than hard-coded, so a re-run writes
// into its own directory instead of overwriting 13.3's (GATE-13.1-07). Default is
// unchanged. See `evidenceRoot()` in `../helpers/surfaces-13-3`.
const EVIDENCE_ROOT = evidenceRoot();
const SHOT_ROOT = join(EVIDENCE_ROOT, 'screenshots');
const RAW_ROOT = join(EVIDENCE_ROOT, 'raw');
const DIMENSION_DIR = join(SHOT_ROOT, 'dimensions');

/*
  Deliberately NOT `mode: 'serial'`. These seven dimensions are independent, and
  under serial mode the heading-order finding on dimension 2 stopped dimensions 3
  through 7 from running at all — measured: *"1 failed, 6 did not run"*. One known
  number must not hide six unknown ones.
*/

let world: StudentWorld | undefined;

test.beforeAll(async () => {
  mkdirSync(RAW_ROOT, { recursive: true });
  mkdirSync(DIMENSION_DIR, { recursive: true });
  world = await buildStudentWorld('dims');
});

test.afterAll(async () => {
  if (world) {
    await world.admin.ctx.dispose();
    world = undefined;
  }
});

// ---------------------------------------------------------------------------
// Dimension 1 — keyboard
// ---------------------------------------------------------------------------
/**
 * The real `Tab` sequence, walked and recorded.
 *
 * Three things are measured at every stop, because R16.2 names all three
 * ("keyboard focus order, visible focus, names"):
 *
 * * **the stop exists and moved** — the sequence is recorded, so a focus trap
 *   outside a dialog shows up as the same element twice in a row;
 * * **a visible focus indicator** — read from computed style
 *   (`outline-width`, `box-shadow`, or a ring custom property). A focusable
 *   control with no visible indicator is a WCAG 2.4.7 failure that no screenshot
 *   catches, because the screenshot is taken with nothing focused;
 * * **an accessible name** — `aria-label`, text content, `title`, or a labelled
 *   form control. A tab stop a screen-reader user cannot identify is a 4.1.2
 *   failure.
 *
 * The dashboard is the surface, because its primary control is the one STU-04 is
 * about, and reaching it by keyboard is the claim that matters.
 */
test('the dashboard is fully operable by keyboard, with a visible focus indicator at every stop', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  await loginStudent(page, world!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });

  const stops: {
    index: number;
    tag: string;
    name: string;
    hasVisibleFocus: boolean;
    focusStyle: string;
    isPrimaryNextAction: boolean;
  }[] = [];

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let reachedPrimary = false;
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = window.getComputedStyle(el);
      const outlineWidth = parseFloat(style.outlineWidth || '0');
      const hasOutline = outlineWidth > 0 && style.outlineStyle !== 'none';
      const hasShadow = style.boxShadow !== 'none' && style.boxShadow.trim() !== '';
      const labelled = (() => {
        const aria = el.getAttribute('aria-label');
        if (aria && aria.trim()) return aria.trim();
        const text = (el.textContent || '').trim();
        if (text) return text;
        const title = el.getAttribute('title');
        if (title && title.trim()) return title.trim();
        const describedBy = el.getAttribute('aria-labelledby');
        if (describedBy) {
          const target = document.getElementById(describedBy.split(/\s+/)[0]);
          if (target) return (target.textContent || '').trim();
        }
        if (el.id) {
          const label = document.querySelector(`label[for="${el.id}"]`);
          if (label) return (label.textContent || '').trim();
        }
        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.trim()) return placeholder.trim();
        return '';
      })();
      return {
        tag: el.tagName.toLowerCase(),
        name: labelled.replace(/\s+/g, ' ').slice(0, 60),
        hasVisibleFocus: hasOutline || hasShadow,
        focusStyle: `outline:${style.outlineStyle} ${style.outlineWidth}; shadow:${(style.boxShadow || 'none').slice(0, 60)}`,
        isPrimaryNextAction: Boolean(el.closest('[data-testid="next-action-primary"]')) ||
          el.getAttribute('data-testid') === 'next-action-primary',
      };
    });
    if (!stop) break;
    stops.push({ index: i + 1, ...stop });
    if (stop.isPrimaryNextAction) {
      reachedPrimary = true;
      break;
    }
  }

  await page.screenshot({
    path: join(DIMENSION_DIR, `keyboard-focus-${testInfo.project.name}.png`),
    fullPage: false,
  });

  const unnamed = stops.filter((s) => !s.name);
  const invisibleFocus = stops.filter((s) => !s.hasVisibleFocus);
  recordRow(testInfo.project.name, {
    project: testInfo.project.name,
    dimension: 'keyboard',
    surface: '/student/dashboard',
    tabStopsWalked: stops.length,
    reachedPrimaryNextActionWithinStops: reachedPrimary ? stops.length : null,
    unnamedStops: unnamed,
    stopsWithoutVisibleFocus: invisibleFocus,
    sequence: stops.map((s) => `${s.index}:${s.tag}[${s.name}]`),
  });

  expect(stops.length, 'the dashboard should expose keyboard-focusable controls').toBeGreaterThan(2);
  expect(
    reachedPrimary,
    `the primary next action should be reachable by Tab; walked ${stops.length} stops: ` +
      stops.map((s) => `${s.tag}[${s.name}]`).join(' > '),
  ).toBeTruthy();
  expect(
    unnamed.map((s) => `${s.index}:${s.tag}`),
    'every tab stop should have an accessible name (WCAG 4.1.2)',
  ).toEqual([]);
  expect(
    invisibleFocus.map((s) => `${s.index}:${s.tag}[${s.name}] ${s.focusStyle}`),
    'every tab stop should paint a visible focus indicator (WCAG 2.4.7)',
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Dimension 2 — screen-reader semantics
// ---------------------------------------------------------------------------
/**
 * What a screen reader actually reads, captured from the accessibility tree.
 *
 * `locator.ariaSnapshot()` is the right instrument rather than a DOM query,
 * because it reports roles and computed accessible names — the two things a
 * screen-reader user navigates by — and it collapses presentational markup the
 * way an assistive technology does. The snapshot is written into the evidence so
 * a reviewer can read the page the way a screen reader would, which is what
 * "screen reader semantics" asks for and what no screenshot can show.
 *
 * On top of the snapshot, three structural claims that are objectively checkable:
 * one `main` landmark, exactly one `h1`, and no heading level skipped — the
 * navigation contract a screen-reader user relies on (WCAG 1.3.1, 2.4.6).
 */
test('the student surfaces expose a coherent accessibility tree to a screen reader', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  await loginStudent(page, world!);
  await page.setViewportSize({ width: 390, height: 844 });

  const snapshots: Record<string, string> = {};
  const structural: string[] = [];
  for (const [label, url] of [
    ['dashboard', '/student/dashboard'],
    ['status', `/student/application/${world!.submittedApplicationId}/status`],
    ['payment', '/student/payment'],
  ] as const) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
    /*
      Wait for the element the claim is about (task 13.6 remediation L6).

      `main` is the **shell's** landmark and it is visible before the routed page
      mounts, so on a load-limited box this row could measure a route-level skeleton
      and report `0 level-1 headings` for a page that has one. Measured: the mobile
      project did exactly that on `/student/dashboard` in 13.6's re-run — the
      `ariaSnapshot` taken microseconds later shows
      `heading "Welcome back, Harness" [level=1]`, so the h1 arrived between the two
      reads, and the chromium project measured 8 headings on the same surface.

      This is 13.3 §14's own rule 1 ("measure the element you asserted on") applied to
      13.3's own instrument. It is a strengthening, not a relaxation: if no `h1` ever
      appears the wait times out and the row fails, which is what the assertion below
      wants.
    */
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 45_000 });

    const structure = await page.evaluate(() => {
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]'),
      )
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({
          level: Number(el.getAttribute('aria-level') || el.tagName.replace('H', '')) || 0,
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        }));
      const skips: string[] = [];
      for (let i = 1; i < headings.length; i += 1) {
        if (headings[i].level - headings[i - 1].level > 1) {
          skips.push(`h${headings[i - 1].level} -> h${headings[i].level} at "${headings[i].text}"`);
        }
      }
      const firstH1 = headings.findIndex((h) => h.level === 1);
      return {
        mainLandmarks: document.querySelectorAll('main, [role="main"]').length,
        h1Count: headings.filter((h) => h.level === 1).length,
        headingsBeforeH1: firstH1 < 0 ? headings.length : firstH1,
        headings,
        skippedLevels: skips,
        liveRegions: Array.from(
          document.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"]'),
        ).length,
      };
    });

    const snapshot = await page.locator('main').first().ariaSnapshot();
    snapshots[label] = snapshot;

    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      dimension: 'screen-reader semantics',
      surface: url,
      ...structure,
      ariaSnapshotLines: snapshot.split('\n').length,
    });

    if (structure.mainLandmarks !== 1) {
      structural.push(`${url}: ${structure.mainLandmarks} main landmarks, expected 1 (WCAG 1.3.1)`);
    }
    if (structure.h1Count !== 1) {
      structural.push(`${url}: ${structure.h1Count} level-1 headings, expected 1`);
    }
    for (const skip of structure.skippedLevels) {
      if (!attributedHeadingIssue(url, skip)) {
        structural.push(`${url}: heading level skipped — ${skip} (WCAG 1.3.1)`);
      }
    }
    if (structure.headingsBeforeH1 > 0 && !attributedHeadingIssue(url, 'before-h1')) {
      structural.push(
        `${url}: ${structure.headingsBeforeH1} heading(s) precede the h1 (WCAG 2.4.6)`,
      );
    }
    // Not attributable to any lane, and not negotiable: the instrument must have
    // seen a real accessibility tree, or a clean row means nothing.
    expect(
      structure.liveRegions,
      `${url}: at least one live region, so state changes are announced`,
    ).toBeGreaterThan(0);
    expect(snapshot.length, `${url}: the accessibility tree should not be empty`).toBeGreaterThan(40);
  }

  writeFileSync(
    join(RAW_ROOT, `aria-snapshots-${testInfo.project.name}.txt`),
    Object.entries(snapshots)
      .map(([label, snapshot]) => `===== ${label} =====\n${snapshot}\n`)
      .join('\n'),
    'utf8',
  );
  expect(
    structural,
    `3 surfaces measured; ${structural.length} produced an unattributed structural ` +
      `violation (GATE-13.3-08's two are attributed)`,
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Dimension 3 — focus restore, and containment while open
// ---------------------------------------------------------------------------
/**
 * Focus restore is the half of R16.2's modal clause that is easy to forget.
 *
 * Containment while a dialog is open is already asserted by 11.5's
 * `design-system-defluff.spec.ts` journey 5 on the onboarding guard. What is
 * **not** asserted anywhere is what happens on dismissal: a dialog that returns
 * focus to `document.body` strands a keyboard user at the top of the page with no
 * indication of where they were, and neither an axe scan nor a screenshot sees
 * it.
 *
 * The instrument is the student settings surface, because it is STU-20's page and
 * because STU-10 replaced its `window.confirm` calls with product dialogs — so
 * the dialog under test is one this spec's own findings created. Any product
 * dialog reachable from a labelled trigger satisfies the claim, so the test finds
 * one rather than hardcoding a copy string, and **records which trigger it
 * used**. If no dialog is reachable on this surface the row says so explicitly
 * instead of passing silently.
 */
test('a product dialog contains focus and returns it to the trigger on dismissal', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await loginStudent(page, world!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });

  // Find a control that opens a product dialog, and remember which one it was.
  const candidates = page.locator(
    'button[aria-haspopup="dialog"], button[data-testid*="delete"], ' +
      'button[data-testid*="dialog"], [data-testid="draft-management"] button',
  );
  const candidateCount = await candidates.count();
  let openedWith: string | null = null;
  let contained = false;
  let restoredToTrigger = false;
  let escapeClosed = false;

  for (let i = 0; i < candidateCount; i += 1) {
    const trigger = candidates.nth(i);
    if (!(await trigger.isVisible().catch(() => false))) continue;
    const label = ((await trigger.getAttribute('aria-label')) || (await trigger.innerText()) || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 50);
    await trigger.focus();
    await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el) el.setAttribute('data-13-3-trigger', 'yes');
    });
    await trigger.click();
    const dialog = page.locator('[role="dialog"], [aria-modal="true"]').first();
    if (!(await dialog.isVisible({ timeout: 2500 }).catch(() => false))) {
      await page.evaluate(() =>
        document.querySelector('[data-13-3-trigger]')?.removeAttribute('data-13-3-trigger'),
      );
      continue;
    }
    openedWith = label || `candidate #${i + 1}`;

    // Containment: Tab must never leave the dialog (WCAG 2.1.2 / R16.2).
    contained = true;
    for (let t = 0; t < 8; t += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return Boolean(active?.closest('[role="dialog"], [aria-modal="true"]'));
      });
      if (!inside) {
        contained = false;
        break;
      }
    }
    await page.screenshot({
      path: join(DIMENSION_DIR, `dialog-focus-${testInfo.project.name}.png`),
      fullPage: false,
    });

    // Escape closes it, and focus returns to the element that opened it.
    await page.keyboard.press('Escape');
    escapeClosed = await dialog.isHidden({ timeout: 5000 }).catch(() => false);
    restoredToTrigger = await page.evaluate(
      () => document.activeElement?.getAttribute('data-13-3-trigger') === 'yes',
    );
    await page.evaluate(() =>
      document.querySelector('[data-13-3-trigger]')?.removeAttribute('data-13-3-trigger'),
    );
    break;
  }

  recordRow(testInfo.project.name, {
    project: testInfo.project.name,
    dimension: 'focus restore',
    surface: '/student/dashboard',
    dialogTriggerCandidates: candidateCount,
    openedWith,
    focusContainedWhileOpen: contained,
    escapeClosedDialog: escapeClosed,
    focusRestoredToTrigger: restoredToTrigger,
    nativeDialogsObserved: nativeDialogs,
  });

  // R16.6 / STU-10: no native confirm owns a production workflow, whatever else
  // this surface did or did not offer.
  expect(nativeDialogs, 'no native window.confirm should be used (R16.6, STU-10)').toEqual([]);
  expect(
    openedWith,
    `a product dialog should be reachable from the dashboard; ` +
      `${candidateCount} candidate triggers were probed and none opened one`,
  ).not.toBeNull();
  expect(contained, `focus should stay inside the dialog opened by "${openedWith}"`).toBeTruthy();
  expect(escapeClosed, 'Escape should dismiss the dialog').toBeTruthy();
  expect(
    restoredToTrigger,
    `focus should return to the trigger ("${openedWith}") after dismissal (WCAG 2.4.3)`,
  ).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Dimension 4 — error focus
// ---------------------------------------------------------------------------
/**
 * A refused sign-in, and where the refusal goes.
 *
 * The claim is not "an error appears" — that is visual. It is that a user who
 * cannot see the layout learns about it: either focus moves to the message (or to
 * the field that caused it), or the message is inside a live region that will be
 * announced. Either satisfies WCAG 3.3.1; neither happening is the failure, and
 * it is invisible to a screenshot because the error is on screen.
 *
 * Sign-in is the surface because a wrong password is a refusal the platform is
 * *designed* to produce, so no fault has to be injected to reach it — the 401 is a
 * declared error path, registered with the harness gate rather than suppressed.
 */
test('a refused sign-in reaches a user who cannot see the layout', async ({ page, gate }, testInfo) => {
  allowHarnessNoise(gate);
  // A declared error path (R18.4): the platform is *supposed* to refuse this.
  gate.allowRequest('/api/v1/auth/login');
  await page.setViewportSize({
    width: FIRST_MOBILE_VIEWPORT.width,
    height: FIRST_MOBILE_VIEWPORT.height,
  });
  await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });
  await settled(page);

  const email = page.getByLabel('Email');
  const password = page.getByLabel('Password', { exact: true });
  await email.fill(world!.studentEmail);
  await password.fill('DefinitelyNotThePassword123!');
  const submit = page.getByRole('button', { name: /^sign in$/i });
  await expect(submit).toBeEnabled({ timeout: 30_000 });

  /*
    The **refusal** is waited for, not just the click.

    The first recorded attempt clicked and then looked for a live region, and
    measured `activeElement: body`, no invalid field and no banner — i.e. nothing
    had been refused yet, so the row was about the instrument rather than about the
    product. Waiting on the login response makes the precondition observable: the
    status code is recorded, so "no announcement" can only mean the platform refused
    and said nothing, which is the claim this row is actually for.
  */
  const [loginResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login/'), { timeout: 60_000 }),
    submit.click(),
  ]);
  const refusalStatus = loginResponse.status();

  const alert = page.locator('[role="alert"], [aria-live="assertive"], [aria-live="polite"]').first();
  const announced = await alert.isVisible({ timeout: 30_000 }).catch(() => false);

  const errorReach = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const regions = Array.from(
      document.querySelectorAll<HTMLElement>('[role="alert"], [aria-live]'),
    ).filter((el) => (el.textContent || '').trim().length > 0);
    const invalidFields = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-invalid="true"]'),
    ).map((el) => el.getAttribute('name') || el.id || el.tagName.toLowerCase());
    return {
      activeElement: active ? `${active.tagName.toLowerCase()}[${(active.getAttribute('name') || active.getAttribute('aria-label') || '').slice(0, 30)}]` : null,
      focusInsideLiveRegion: Boolean(active?.closest('[role="alert"], [aria-live]')),
      liveRegionTexts: regions.map((el) =>
        (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      ),
      liveRegionPoliteness: regions.map(
        (el) => el.getAttribute('aria-live') || (el.getAttribute('role') === 'alert' ? 'assertive (role=alert)' : 'none'),
      ),
      invalidFields,
      stillOnSignIn: window.location.pathname.includes('/auth/signin'),
    };
  });

  await page.screenshot({
    path: join(DIMENSION_DIR, `error-focus-${testInfo.project.name}.png`),
    fullPage: false,
  });

  recordRow(testInfo.project.name, {
    project: testInfo.project.name,
    dimension: 'error focus',
    surface: '/auth/signin',
    loginResponseStatus: refusalStatus,
    alertVisible: announced,
    ...errorReach,
  });

  expect(
    refusalStatus,
    `the platform should refuse a wrong password (measured HTTP ${refusalStatus})`,
  ).toBeGreaterThanOrEqual(400);
  expect(errorReach.stillOnSignIn, 'a refused sign-in should not navigate away').toBeTruthy();
  expect(
    announced && errorReach.liveRegionTexts.length > 0,
    'the refusal should be published inside a live region so it is announced (WCAG 3.3.1); ' +
      `measured regions: ${JSON.stringify(errorReach.liveRegionTexts)}`,
  ).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Dimension 5 — reduced motion
// ---------------------------------------------------------------------------
/**
 * `prefers-reduced-motion: reduce`, emulated, then read back from computed style.
 *
 * The enforcement is global — `apps/admissions/src/index.css` clamps every
 * animation and transition to `0.01ms !important` inside the media query — and
 * this test **asserts** that rather than installing it. What makes the assertion
 * worth running in a browser is that `!important` inside a media query is exactly
 * the kind of rule an inline `style` attribute or a JS-driven animation can
 * outrun, and only computed style at runtime knows which won.
 *
 * `scroll-behavior` is checked too, because a smooth-scrolling page is motion a
 * vestibular-sensitive user asked not to receive, and it is set in the same rule.
 */
test('reduced motion is honoured on every animated surface', async ({ page, gate }, testInfo) => {
  allowHarnessNoise(gate);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginStudent(page, world!);
  await page.setViewportSize({ width: 390, height: 844 });

  const measurements: Record<string, unknown>[] = [];
  for (const [label, url] of [
    ['dashboard', '/student/dashboard'],
    ['wizard', `/student/application-wizard?mode=resume&draftId=${world!.draftApplicationId}`],
  ] as const) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(600);

    const motion = await page.evaluate(() => {
      const offenders: { tag: string; cls: string; animation: string; transition: string }[] = [];
      let scanned = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        scanned += 1;
        const style = window.getComputedStyle(el);
        const durations = [
          ...style.animationDuration.split(','),
          ...style.transitionDuration.split(','),
        ]
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => (value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000))
          .filter((ms) => Number.isFinite(ms));
        // The global rule clamps to 0.01ms; anything meaningfully longer escaped it.
        if (durations.some((ms) => ms > 1)) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 100),
            animation: style.animationDuration,
            transition: style.transitionDuration,
          });
        }
      }
      return {
        scanned,
        offenders: offenders.slice(0, 12),
        offenderCount: offenders.length,
        rootScrollBehavior: window.getComputedStyle(document.documentElement).scrollBehavior,
        matchesReduceQuery: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    });
    measurements.push({ surface: url, ...motion });
    await page.screenshot({
      path: join(DIMENSION_DIR, `reduced-motion-${label}-${testInfo.project.name}.png`),
      fullPage: false,
    });

    expect(motion.matchesReduceQuery, `${url}: the reduce query should match`).toBeTruthy();
    expect(
      motion.offenders,
      `${url}: no element should animate or transition for more than 1 ms under ` +
        `prefers-reduced-motion: reduce; scanned ${motion.scanned}`,
    ).toEqual([]);
    expect(
      motion.rootScrollBehavior,
      `${url}: scroll behaviour should not be smooth under reduced motion`,
    ).not.toBe('smooth');
  }

  recordRow(testInfo.project.name, {
    project: testInfo.project.name,
    dimension: 'reduced motion',
    measurements,
  });
  await page.emulateMedia({ reducedMotion: null });
});

// ---------------------------------------------------------------------------
// Dimension 6 — 200 % and 400 % text zoom
// ---------------------------------------------------------------------------
/**
 * Two zoom levels, each at the width its own standard specifies.
 *
 * * **200 %** is applied at **320 x 568** — the width R16.1 designs for — because
 *   WCAG 1.4.4 (Resize Text) is a text-only scale claim that has to hold on the
 *   narrowest supported viewport. Tasks 11.1 and 11.2 already captured a
 *   `-320-text200` screenshot for two surfaces; this measures the numbers across
 *   the student journey.
 * * **400 %** is applied at **1280 x 1024**, which is WCAG 1.4.10 (Reflow)'s own
 *   construction: that window at 400 % *is* a 320 CSS-px-equivalent viewport.
 *   11.5 §journey 7 established why applying a 4x root font to a viewport that is
 *   already 320 px asks for an 80 px-equivalent space no standard requires — the
 *   header alone reaches 848 px, which is arithmetic about the premise rather than
 *   a defect.
 *
 * The claim at both levels is R16.8's: the student's **next action** is still
 * there and still readable, and nothing scrolls sideways.
 */
for (const zoom of [
  { label: '200', rootPx: 32, width: 320, height: 568, standard: 'WCAG 1.4.4 at the 320 px design width' },
  { label: '400', rootPx: 64, width: 1280, height: 1024, standard: "WCAG 1.4.10's 1280x1024 reflow construction" },
]) {
  test(`the next action survives ${zoom.label} percent text zoom (${zoom.standard})`, async ({
    page,
    gate,
  }, testInfo) => {
    allowHarnessNoise(gate);
    await loginStudent(page, world!);
    await page.setViewportSize({ width: zoom.width, height: zoom.height });
    // The root size has to be in place before first paint, and an init script runs
    // before `document.documentElement` exists — hence the re-apply on
    // DOMContentLoaded (11.5 measured the naive one-liner throwing a page error).
    await page.addInitScript((px) => {
      const apply = () => {
        document.documentElement?.style.setProperty('font-size', `${px}px`);
      };
      apply();
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }, zoom.rootPx);

    const rows: Record<string, unknown>[] = [];
    for (const [label, url] of [
      ['dashboard', '/student/dashboard'],
      ['payment', '/student/payment'],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await settled(page);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(600);

      const overflow = await measureOverflow(page);
      const targets = await measureTouchTargets(page);
      const rootFontSize = await page.evaluate(
        () => window.getComputedStyle(document.documentElement).fontSize,
      );
      // Clipped text is the other half of R16.7: an element whose content is taller
      // or wider than its own box with overflow hidden has lost characters.
      const clipped = await page.evaluate(() => {
        const offenders: { tag: string; cls: string; text: string; overflowY: number }[] = [];
        let considered = 0;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          // A visually-hidden (`sr-only`) element IS a 1x1 clip box holding a
          // sentence — that is how a screen-reader-only string is built, and
          // counting it as clipped text would report an accessibility feature as a
          // defect. Detected from the box, not from a class name.
          if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
          if (style.clip && style.clip !== 'auto') continue;
          if (style.clipPath && style.clipPath.includes('inset(50%)')) continue;
          if (style.overflow !== 'hidden' && style.overflowY !== 'hidden') continue;
          if (style.textOverflow === 'ellipsis') continue; // a declared truncation
          considered += 1;
          const overflowY = el.scrollHeight - el.clientHeight;
          if (overflowY <= 2) continue;
          // Own text only: a wrapper hiding a taller decorative child has clipped
          // nothing a student was reading.
          const ownText = Array.from(el.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => (node.textContent || '').trim())
            .join(' ')
            .trim();
          if (!ownText) continue;
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 90),
            text: ownText.replace(/\s+/g, ' ').slice(0, 60),
            overflowY,
          });
        }
        return { offenders: offenders.slice(0, 8), considered };
      });

      await page.screenshot({
        path: join(DIMENSION_DIR, `zoom${zoom.label}-${label}-${testInfo.project.name}.png`),
        fullPage: false,
      });

      rows.push({
        surface: url,
        rootFontSize,
        documentOverflow: overflow.document,
        widestOffenders: overflow.widestOffenders,
        clippedCommands: overflow.clippedCommands,
        clippingContainers: overflow.clippingContainers,
        declaredScrollers: overflow.declaredScrollers,
        elementsConsidered: overflow.elementsConsidered,
        touchTargetsScanned: targets.scanned,
        touchTargetOffenders: targets.offenders,
        clippedTextBlocks: clipped.offenders,
        clipCandidatesConsidered: clipped.considered,
      });

      expect(rootFontSize, `${url}: the ${zoom.label}% root font should be applied`).toBe(
        `${zoom.rootPx}px`,
      );
      expect(
        overflow.document,
        `${url} at ${zoom.label}% zoom should not scroll sideways (R16.8); ` +
          `widest: ${JSON.stringify(overflow.widestOffenders)}`,
      ).toBeLessThanOrEqual(1);
      expect(
        clipped.offenders,
        `${url} at ${zoom.label}% zoom should not clip its own text out of a ` +
          `hidden-overflow box (${clipped.considered} clipping candidates considered)`,
      ).toEqual([]);
    }

    // R16.8 names the next action explicitly: it must still be understandable.
    await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
    await settled(page);
    const primary = page.locator('[data-testid="next-action-primary"]').first();
    await expect(primary).toBeVisible({ timeout: 45_000 });
    const primaryText = (await primary.innerText()).trim();
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      dimension: `${zoom.label}% text zoom`,
      standard: zoom.standard,
      viewport: `${zoom.width}x${zoom.height}`,
      rootPx: zoom.rootPx,
      nextActionStillReadable: primaryText.replace(/\s+/g, ' ').slice(0, 80),
      surfaces: rows,
    });
    expect(
      primaryText.length,
      `the next action should still carry its label at ${zoom.label}% zoom`,
    ).toBeGreaterThan(0);
  });
}

// ---------------------------------------------------------------------------
// Dimension 7 — slow 3G, then offline and reconnect
// ---------------------------------------------------------------------------
/**
 * Chrome's own Slow-3G preset, applied over CDP, then a real offline cycle.
 *
 * R16.8 asks that *"the student next action, current status, autosave state,
 * payment action, and error recovery … remain understandable under … slow network
 * and offline/reconnect scenarios"*, and the only honest way to test that is to
 * make the network genuinely slow rather than to stub a loading prop. The numbers
 * recorded are the wall time to first paint of the next action under the throttle,
 * and what the wizard says about the student's work while the connection is gone.
 *
 * A `net::ERR_ABORTED` during the offline navigation is a **cancellation**, not a
 * failure — task 8.3 established that the browser withdrawing a call is not the
 * platform answering badly — and the offline navigation failure itself is a
 * declared error path.
 */
test('the next action and autosave state stay understandable on slow 3G and offline', async ({
  page,
  gate,
  context,
}, testInfo) => {
  allowHarnessNoise(gate);
  await loginStudent(page, world!);
  await page.setViewportSize({
    width: FIRST_MOBILE_VIEWPORT.width,
    height: FIRST_MOBILE_VIEWPORT.height,
  });

  /*
    (a) Slow 3G, in **two legs**, because a cold and a warm load are different
    questions and only one of them is worth asserting — and in this order, because
    the order was a bug the first time.

    The first attempt threw: `student-next-action` never appeared within 120 s of a
    *cold* load at Chrome's own Slow-3G preset (400 kbps down/up, 2 000 ms RTT).
    That is arithmetic about the profile, not a defect — a first-visit SPA download
    at 400 kbps with a 2 s round trip is minutes of transfer — and reporting it as
    "the next action is unreachable on slow 3G" would be a duration result
    masquerading as a capability one, which is exactly the confusion 13.1 §6.1
    warns about.

    The second attempt put the cold leg first and abandoned its navigation with a
    `.catch()`; the *next*, asserted navigation then inherited an in-flight load and
    failed at full speed. So the legs now run warm-first:

    1. load at full speed and assert the next action — which also warms the cache;
    2. throttle, reload, and measure the **warm** time. Asserted: this is the
       returning student R16.8 is about.
    3. empty the HTTP cache (`Network.clearBrowserCache`) and reload still
       throttled — the **cold** first visit. Its time is *recorded*, not asserted;
       what is asserted is that the student is never left staring at nothing, which
       is R16.8's actual clause.
  */
  await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 60_000 });

  const applied = await emulateNetwork(page, SLOW_3G);
  const warmStarted = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 120_000 });
  const slowMs = Date.now() - warmStarted;
  const slowLabel = (await page.locator('[data-testid="next-action-primary"]').first().innerText())
    .trim()
    .replace(/\s+/g, ' ');
  await page.screenshot({
    path: join(DIMENSION_DIR, `slow3g-warm-dashboard-${testInfo.project.name}.png`),
    fullPage: false,
  });

  const COLD_BUDGET_MS = 90_000;
  const cacheCleared = await clearBrowserCache(page);
  const coldStarted = Date.now();
  await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
  const coldArrived = await page
    .getByTestId('student-next-action')
    .isVisible({ timeout: COLD_BUDGET_MS })
    .catch(() => false);
  const coldMs = Date.now() - coldStarted;
  // Whatever the page managed to paint by then — the boot overlay, a skeleton, or
  // the real thing. "Nothing at all" is the failure R16.8 forbids.
  /*
    `waitUntil: 'commit'` returns as soon as the navigation is committed, which on a
    genuinely slow connection is *before* there is a `document.body` — the first
    version of this read `document.body.innerText` and threw
    `Cannot read properties of null`. The document is given a bounded chance to
    reach `domcontentloaded`, and the read is null-guarded either way, because "the
    body does not exist yet" is a legitimate answer to "what had the page painted".
  */
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  const coldAffordance = await page.evaluate(() => ({
    documentReadyState: document.readyState,
    bodyExists: Boolean(document.body),
    preloaderPresent: document.querySelectorAll('.beanola-preloader').length > 0,
    skeletons: document.querySelectorAll('[data-testid*="skeleton"], .animate-pulse').length,
    visibleText: (document.body?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
  }));
  await page.screenshot({
    path: join(DIMENSION_DIR, `slow3g-cold-dashboard-${testInfo.project.name}.png`),
    fullPage: false,
  });
  await clearNetworkEmulation(page);

  // (b) Offline: the wizard must say so, and the work must survive the outage.
  await page.goto(`/student/application-wizard?mode=resume&draftId=${world!.draftApplicationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await settled(page);
  await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });

  /*
    The outage's error path is **declared**, not suppressed (R18.4).

    Going offline while the wizard is mounted makes its in-flight reads and its
    not-yet-fetched lazy chunks fail with `net::ERR_INTERNET_DISCONNECTED` — a real
    transport failure, not a `net::ERR_ABORTED` cancellation (task 8.3), so the
    harness gate is right to demand it be named. Measured, the outage produced
    exactly five: three application-scoped reads, the required-documents read, and
    one route chunk. Each pattern below is the specific thing this injection breaks;
    a 500 on anything else still fails the run.
  */
  gate.allowRequest(`/api/v1/applications/${world!.draftApplicationId}`);
  gate.allowRequest('/assets/js/');
  /*
    A sixth declared path (task 13.6 remediation L6).

    13.6's re-run produced two additional `net::ERR_INTERNET_DISCONNECTED` failures on
    `/api/v1/catalog/canonical-programs/` — **on the Pixel 5 project only**, while the
    desktop project produced the same five 13.3 measured. The wizard's catalogue read
    is a React Query revalidation on mount, so whether it is still in flight when the
    outage is injected 2.5 s later is a fact about how loaded the box is, not about the
    platform.

    Declared by its specific path rather than by a `/api/v1/catalog/` prefix, and for
    the same reason as the five above: this is a read the *injected* outage breaks, and
    every other transport failure and every HTTP >= 400 still fails the run. 13.3's own
    note that the outage produced "exactly five" is a measurement of one recording, not
    a contract.
  */
  gate.allowRequest('/api/v1/catalog/canonical-programs/');
  gate.allowConsole('Failed to fetch');
  gate.allowConsole('dynamically imported module');

  await context.setOffline(true);
  await page.waitForTimeout(2500);
  const offlineState = await page.evaluate(() => {
    const badge = document.querySelector('[data-testid="wizard-offline-badge"]');
    const bar = document.querySelector('[data-testid="wizard-action-bar"]');
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');
    return {
      navigatorOnLine: navigator.onLine,
      offlineBadgeVisible: Boolean(badge && (badge as HTMLElement).getBoundingClientRect().height > 0),
      offlineBadgeText: (badge?.textContent || '').trim().replace(/\s+/g, ' '),
      actionBarStillPresent: Boolean(bar && (bar as HTMLElement).getBoundingClientRect().height > 0),
      actionBarText: (bar?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      // What the student can actually read while the connection is gone. R16.8's
      // clause is that the state stays *understandable*, so the words matter.
      mentionsOffline: /offline|no connection|connection lost|reconnect/i.test(bodyText),
      liveRegionTexts: Array.from(
        document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"], [aria-live]'),
      )
        .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '))
        .filter((t) => t.length > 0)
        .slice(0, 6),
      visibleText: bodyText.trim().slice(0, 300),
    };
  });
  await page.screenshot({
    path: join(DIMENSION_DIR, `offline-wizard-${testInfo.project.name}.png`),
    fullPage: false,
  });

  // (c) Reconnect: the surface recovers without the student reloading anything.
  await context.setOffline(false);
  await page.waitForTimeout(2000);
  await page.waitForTimeout(2000);
  const reconnected = await page.evaluate(() => ({
    navigatorOnLine: navigator.onLine,
    offlineBadgeStillVisible: Boolean(
      document.querySelector('[data-testid="wizard-offline-badge"]'),
    ),
    wizardUsableAgain: Boolean(document.querySelector('[data-testid="wizard-action-bar"]')),
    retryAffordance: Array.from(document.querySelectorAll<HTMLElement>('button, a'))
      .map((el) => (el.textContent || '').trim())
      .filter((t) => /retry|try again|reload|refresh/i.test(t))
      .slice(0, 4),
  }));

  recordRow(testInfo.project.name, {
    project: testInfo.project.name,
    dimension: 'slow 3G / offline / reconnect',
    slow3gProfileApplied: applied,
    cold: {
      httpCacheCleared: cacheCleared,
      budgetMs: COLD_BUDGET_MS,
      nextActionArrived: coldArrived,
      msToNextActionOrBudget: coldMs,
      affordanceShownMeanwhile: coldAffordance,
    },
    warmDashboardNextActionMs: slowMs,
    warmDashboardNextActionLabel: slowLabel,
    offline: offlineState,
    afterReconnect: reconnected,
    finding: offlineState.actionBarStillPresent ? null : 'GATE-13.3-10',
    cancelledRequestsRecorded: gate.cancelledRequests.length,
  });

  expect(applied, 'the slow-3G profile should have been applied over CDP').not.toBeNull();
  // The cold leg's claim: the student is never left with nothing while they wait.
  expect(
    coldAffordance.preloaderPresent ||
      coldAffordance.skeletons > 0 ||
      coldAffordance.visibleText.length > 0,
    `on a cold slow-3G load the page must show *something* while it waits ` +
      `(R16.8); measured after ${coldMs} ms: ${JSON.stringify(coldAffordance)}`,
  ).toBeTruthy();
  // The warm leg's claim: the returning student's next action really arrives.
  expect(
    slowLabel.length,
    `the next action should arrive on slow 3G with a warm cache (took ${slowMs} ms)`,
  ).toBeGreaterThan(0);
  expect(offlineState.navigatorOnLine, 'the context should really be offline').toBeFalsy();
  /*
    R16.8's offline clause, asserted in the form that is actually true and
    measured — and the difference is a finding.

    The first version asserted that the action bar *survives* the outage. It does
    not: with the connection cut while the wizard is mounted, the bar is gone from
    the DOM within 2.5 s and the surface is replaced. That is recorded as
    **GATE-13.3-10** (wizard lane) rather than asserted as correct, and rather than
    asserted as broken — because R16.8's requirement is that the student *stays
    informed*, and the platform does meet that: the outage is named on screen.

    So what is asserted here is the requirement: the student is told, in words,
    that the connection is gone; and after reconnect the wizard is usable again
    without the student reloading anything. Both are the claims a student would
    recognise.
  */
  /*
    **GATE-13.3-10.** With the connection cut while the wizard is mounted, the
    measured screen is:

    > *"Something went wrong · Cannot read properties of undefined (reading
    > 'SessionMonitor') · Try Again · Contact Support"*

    Three things at once, and only the third is acceptable:

    1. a **whole-page error boundary replaces the wizard** — the in-progress form is
       gone from the DOM within 2.5 s;
    2. the message shown to the student is a **raw JavaScript TypeError**, which
       names an internal module (`SessionMonitor`) and not the connection; and
    3. a recovery affordance *is* offered (`Try Again`, `Contact Support`), and
       reconnect does restore the wizard.
    
    The mechanism is a **lazy route chunk failing to load while offline**
    (`/assets/js/SessionMonitor-*.js`, `net::ERR_INTERNET_DISCONNECTED`), which
    throws inside a component and trips the boundary. **Honest caveat:** the
    preceding cold-load leg empties the HTTP cache, which is what made the chunk
    un-cached and this reproduction deterministic. A student who already has the
    chunk cached would not see it — but a student who lands on the wizard on an
    unstable connection is exactly the case R16.8 exists for, so this is a real
    failure mode rather than an artefact.

    Asserted below is what is **true and required**: the student is not dead-ended,
    and reconnect restores the surface. The unweakened R16.8 claim — that the
    message names the connection rather than an internal error — is asserted by the
    `test.fail()`-annotated row at the end of this file, so the finding is on the
    record stated correctly (13.2 §3.6's pattern). Owner: the wizard/shell lane.
  */
  expect(
    offlineState.mentionsOffline ||
      offlineState.offlineBadgeVisible ||
      offlineState.liveRegionTexts.length > 0 ||
      /try again|contact support/i.test(offlineState.visibleText),
    `during the outage the student must not be dead-ended — some statement and some ` +
      `recovery affordance (R16.8); measured on screen: "${offlineState.visibleText}"`,
  ).toBeTruthy();
  expect(reconnected.navigatorOnLine, 'the context should be back online').toBeTruthy();
  /*
    Recovery is asserted by **using** it, not by hoping the boundary self-heals.

    Measured, the error boundary does not re-render on reconnect: it offers a
    `Try Again` control and waits to be pressed. That is a legitimate recovery design
    — an automatic retry on every reconnect can loop — so the claim R16.8 actually
    supports is that the affordance exists *and works*. The first version asserted
    self-healing and failed on a behaviour that is defensible; this presses the
    button the student would press and requires the wizard back.
  */
  expect(
    reconnected.retryAffordance.length,
    `after reconnect there must be a recovery control to use; measured: ` +
      `${JSON.stringify(reconnected)}`,
  ).toBeGreaterThan(0);
  let recoveredVia: string | null = null;
  if (!reconnected.wizardUsableAgain) {
    const retry = page.getByRole('button', { name: /try again|retry|reload/i }).first();
    await retry.click();
    await settled(page);
    await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    recoveredVia = 'Try Again';
  } else {
    recoveredVia = 'automatic on reconnect';
  }
  recordRow(testInfo.project.name, {
    project: testInfo.project.name,
    dimension: 'offline recovery',
    recoveredVia,
    wizardUsableAfterRecovery: true,
  });
});

// ---------------------------------------------------------------------------
// GATE-13.3-10: the unweakened R16.8 offline claim, stated correctly
// ---------------------------------------------------------------------------
/**
 * **The finding this task found on the offline path, on the record correctly.**
 *
 * R16.8: *"THE student next action, current status, autosave state, payment action,
 * and error recovery SHALL remain understandable under 400 percent text zoom,
 * reduced motion, slow network, and offline/reconnect scenarios."*
 *
 * *Understandable* is the operative word. When a lazy route chunk cannot be fetched
 * because the connection is gone, the wizard is replaced by an error boundary whose
 * message is the raw exception — `Cannot read properties of undefined (reading
 * 'SessionMonitor')`. A student reading that cannot tell that their connection
 * dropped, cannot tell whether their work was saved, and is shown the name of an
 * internal module.
 *
 * The claim below is the one R16.8 makes: whatever the platform shows, it names the
 * connection. It was annotated `test.fail()` for 13.2 §3.6's four reasons — the
 * assertion states the correct requirement so nothing here blesses the current
 * message, the test still executes (`test.skip` is a hard failure in this harness),
 * the counter-example is in the trace and in `raw/measurements-*.jsonl`, and the day
 * the boundary learns to say *"you appear to be offline"* this row fails **because
 * it passed**.
 *
 * Deterministic by construction: the HTTP cache is emptied before the connection is
 * cut, so the chunk genuinely is not available. Owner: the wizard/shell lane.
 *
 * ## Converted by task 13.6 remediation L6 — three separate causes
 *
 * 1. **The message.** `ErrorBoundary` piped `state.error?.message` straight into
 *    copy. It now classifies the exception through `lib/errorBoundaryCopy.ts` —
 *    offline / chunk / network / unknown, four sentences, none of which can contain
 *    an exception — and the exception itself goes only to `reportBoundaryError` and
 *    `onError`, which is where a stack trace belongs.
 * 2. **Why it was a `TypeError` at all.** `lazy(() => import(m).then((mod) => ({
 *    default: mod.SessionMonitor })))` reads a property off whatever the loader
 *    returned, so a failed fetch became *"Cannot read properties of undefined"* —
 *    which also defeated `LazyLoadErrorBoundary`'s own `isChunkError` classifier, so
 *    the app's chunk-recovery path never ran either. `lazyNamed` in
 *    `AuthenticatedRouteShell.tsx` throws a named chunk-load error instead.
 * 3. **Why the wizard disappeared.** `SessionMonitor` is a background session
 *    watcher that renders nothing, mounted as a *sibling* of the route boundary — so
 *    its chunk failing took the whole authenticated tree with it, in-progress form
 *    and all. It has its own boundary with `fallback={null}` now, so the student
 *    keeps the page they were filling in.
 *
 * Both original assertions are unchanged, and 13.3's third measurement
 * (`wizardStillMounted`) stays **recorded rather than asserted** — L6 tried to assert
 * it and withdrew, for the reason set out beside the assertions below. The short
 * version: a boundary cannot keep a form mounted whose code cannot be fetched, and
 * this platform ships no service worker by design.
 */
test(
  'GATE-13.3-10 (closed): an offline chunk failure tells the student about the connection',
  async ({ page, gate, context }, testInfo) => {
    allowHarnessNoise(gate);
    gate.allowRequest(`/api/v1/applications/`);
    gate.allowRequest('/assets/');
    gate.allowConsole('Failed to fetch');
    gate.allowConsole('dynamically imported module');
    gate.allowConsole('SessionMonitor');

    await loginStudent(page, world!);
    await page.setViewportSize({
      width: FIRST_MOBILE_VIEWPORT.width,
      height: FIRST_MOBILE_VIEWPORT.height,
    });
    await page.goto(
      `/student/application-wizard?mode=resume&draftId=${world!.draftApplicationId}`,
      { waitUntil: 'domcontentloaded' },
    );
    await settled(page);
    await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });

    await clearBrowserCache(page);
    await context.setOffline(true);
    await page.waitForTimeout(3000);

    const shown = await page.evaluate(() => {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      return {
        text: text.slice(0, 400),
        namesTheConnection: /offline|connection|network|internet|reconnect/i.test(text),
        leaksInternalError:
          /cannot read propert|undefined \(reading|TypeError|is not a function/i.test(text),
        wizardStillMounted: Boolean(document.querySelector('[data-testid="wizard-action-bar"]')),
      };
    });
    await page.screenshot({
      path: join(DIMENSION_DIR, `gate-13-3-10-offline-boundary-${testInfo.project.name}.png`),
      fullPage: false,
    });
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      dimension: 'offline error legibility',
      finding: 'GATE-13.3-10',
      expectedToFail: false,
      convertedBy: '13.6 remediation L6',
      owner: 'wizard/shell lane — lazy route chunk failure trips the error boundary',
      measured: shown,
    });
    await context.setOffline(false);

    // R16.8's claim, unweakened — exactly the two assertions 13.3 wrote.
    expect(
      shown.namesTheConnection,
      `an offline failure must name the connection; measured: "${shown.text}"`,
    ).toBeTruthy();
    expect(
      shown.leaksInternalError,
      `an offline failure must not print an internal error at the student; ` +
        `measured: "${shown.text}"`,
    ).toBeFalsy();

    /*
      `wizardStillMounted` is **recorded, not asserted** — and this batch tried to
      assert it and then withdrew the assertion, which is worth stating rather than
      quietly not mentioning.

      13.3 §8.10 listed three things happening at once and asserted only two of them.
      The third — *"a whole-page error boundary replaces the wizard"* — was measured
      and left unasserted. 13.6 remediation L6 added it, measured it, and found it is
      **not achievable for the wizard's own chunk**:

      * `SessionMonitor` really was taking the page down with it, and that is fixed:
        it is a background session watcher rendering nothing, and it now has its own
        boundary with `fallback={null}` (which also required fixing `ErrorBoundary`,
        where `if (this.props.fallback)` treated `null` as *"no fallback given"*).
      * But `pages/student/applicationWizard/index.tsx` wraps the whole wizard in its
        own `ErrorBoundary level="section"`, and when a chunk the *wizard* needs cannot
        be fetched, there is no code to render. The platform ships **no service
        worker** — `vite-plugin-pwa` and the Workbox caches were removed outright
        (`.kiro/steering/tech.md`) — so an un-cached chunk on a dead connection is
        genuinely unavailable. A boundary cannot keep a form mounted whose code is not
        there.

      What protects the student is therefore not the DOM but the draft: auto-save is
      mandatory on every student form, the draft is an `Application(status='draft')`
      row on the server plus a local recovery snapshot, and the copy now says so
      ("Anything you had already saved is safe"). The recovery leg above already
      asserts that `Try Again` after reconnect brings the wizard back.

      So the number is published and the residual is named, in the style 13.3 used for
      the same measurement.
    */
  },
);
