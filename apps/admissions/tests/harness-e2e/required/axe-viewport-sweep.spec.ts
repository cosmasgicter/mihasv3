/**
 * Required V2 harness — **axe WCAG A/AA across all six R16.7 viewports**
 * (admissions-v2 task **13.3**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third
 *               bullet. Requirements: **R16.2** (WCAG 2.1 AA), **R18.3**
 *               (frontend accessibility tests are part of the gate).
 * Findings:     **STU-03**, **STU-04**, **STU-05**, **STU-14**, **STU-20**,
 *               **STU-23**, **STU-24**.
 *
 * ## Why this is a separate file with one test per viewport
 *
 * This is the part of the task that is designed around a **measurement**, not a
 * preference. 13.1 §6.1 recorded six runs of `design-system-defluff.spec.ts:664`
 * — the existing axe sweep — and the account is unambiguous:
 *
 * | run | result |
 * |---|---|
 * | full profile, desktop x2 | 13.1 s, 13.0 s |
 * | full profile, mobile, run 1 | 19.1 s |
 * | full profile, mobile, run 2 | **timeout at 31.1 s** |
 * | alone, on a used stack | **timeout at 38.3 s** |
 * | alone, on a freshly seeded stack | 17.5 s |
 *
 * **No axe violation in any of the six.** Every failure was `Test timeout of
 * 30000ms exceeded`, because that test walks four routes at two widths inside one
 * 30 s test-level budget. This task scans across **six** widths, so repeating that
 * shape would guarantee the same result and then invite it to be misread.
 *
 * So: **one test per viewport**, each with the profile's own generous per-test
 * budget, and the per-surface scan duration recorded next to each result. A slow
 * navigation therefore costs one row of six rather than the whole sweep, and —
 * the point — a timeout is legible as a **duration** finding rather than an
 * accessibility one. The two are never allowed to look alike: this file records
 * `scanMs` per surface, so a row that fails on time carries the number that says
 * so.
 *
 * ## What is scanned
 *
 * Five surfaces, chosen as one per finding rather than as a sample: the public
 * tracker (STU-24), the dashboard (STU-04), the wizard (STU-03), the canonical
 * application workspace (STU-23) and settings (STU-20). `/student/payment` and
 * `/student/notifications` are covered by the pixel matrix and the aria-snapshot
 * journey; adding them here would spend budget on the axis this file is explicitly
 * conserving, and §the evidence file states the boundary rather than implying
 * coverage.
 *
 * Critical and serious violations fail. Moderate and minor are **recorded** in the
 * evidence rather than dropped, which is 11.5's convention and the honest one: a
 * report that says "zero violations" when it means "zero blocking violations" is
 * the kind of claim this spec exists to stop.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '../harness-fixtures';
import {
  allowHarnessNoise,
  attributedAxeViolation,
  buildStudentWorld,
  evidenceRoot,
  loginStudent,
  recordRow,
  settled,
  VIEWPORTS,
  type StudentWorld,
} from '../helpers/surfaces-13-3';

// Task 13.6 remediation L5-L6: see `evidenceRoot()` and GATE-13.1-07.
const RAW_ROOT = join(evidenceRoot(), 'raw');

interface AxeSurface {
  id: string;
  url: (world: StudentWorld) => string;
  auth: 'public' | 'student';
  finding: string;
  ready: (page: Page) => Promise<void>;
}

const AXE_SURFACES: AxeSurface[] = [
  {
    id: '/track-application',
    url: () => '/track-application',
    auth: 'public',
    finding: 'STU-24',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: /Track (your )?application/i }).first()).toBeVisible({
        timeout: 45_000,
      });
    },
  },
  {
    id: '/student/dashboard',
    url: () => '/student/dashboard',
    auth: 'student',
    finding: 'STU-04',
    ready: async (page) => {
      await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: '/student/application-wizard',
    url: (world) => `/student/application-wizard?mode=resume&draftId=${world.draftApplicationId}`,
    auth: 'student',
    finding: 'STU-03',
    ready: async (page) => {
      await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: '/student/status',
    url: () => '/student/status',
    auth: 'student',
    finding: 'STU-23',
    ready: async (page) => {
      await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: '/student/settings',
    url: () => '/student/settings',
    auth: 'student',
    finding: 'STU-20',
    ready: async (page) => {
      await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
    },
  },
];

/*
  Deliberately NOT `mode: 'serial'`: a finding at one width must not stop the other
  five from being scanned. Each viewport is already its own test with its own budget
  — that slicing is this file's whole reason for existing (13.1 §6.1).
*/

let world: StudentWorld | undefined;

test.beforeAll(async () => {
  mkdirSync(RAW_ROOT, { recursive: true });
  world = await buildStudentWorld('axe');
});

test.afterAll(async () => {
  if (world) {
    await world.admin.ctx.dispose();
    world = undefined;
  }
});

async function scan(
  page: Page,
  surface: AxeSurface,
  viewport: (typeof VIEWPORTS)[number],
  project: string,
  violations: string[],
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const navStarted = Date.now();
  await page.goto(surface.url(world!), { waitUntil: 'domcontentloaded' });
  await settled(page);
  await surface.ready(page);
  const navMs = Date.now() - navStarted;

  const axeStarted = Date.now();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const axeMs = Date.now() - axeStarted;

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  const nonBlocking = results.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor',
  );

  recordRow(project, {
    kind: 'axe',
    project,
    viewport: viewport.label,
    surface: surface.id,
    finding: surface.finding,
    // The two durations, separately, so a slow row is attributable.
    navMs,
    axeMs,
    scanMs: navMs + axeMs,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    blocking: blocking.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      finding: attributedAxeViolation(viewport.label, surface.id, v.id)?.finding ?? 'UNATTRIBUTED',
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 4),
    })),
    nonBlocking: nonBlocking.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodeCount: v.nodes.length,
    })),
  });

  /*
    Violations are **collected** across the whole viewport's sweep, and GATE-13.3-11
    is allow-listed by (viewport, surface, rule) so the remaining surfaces still get
    scanned. Every violation is published in the ledger either way, with its
    `finding` field set to the id or to `UNATTRIBUTED`.

    The durations are recorded next to the result on purpose. 13.1 §6.1's whole point
    is that a timeout and an accessibility violation must never be mistaken for each
    other, so every row carries `navMs`, `axeMs` and the number of checks that
    passed — a row that fails on time says so in numbers.
  */
  for (const v of blocking) {
    if (attributedAxeViolation(viewport.label, surface.id, v.id)) continue;
    violations.push(
      `${surface.id} @ ${viewport.label}: [${v.impact}] ${v.id} — ${v.help} @ ` +
        `${v.nodes.map((n) => n.target.join(' ')).join(' | ')} ` +
        `(nav ${navMs} ms, axe ${axeMs} ms, ${results.passes.length} checks passed)`,
    );
  }
}

for (const viewport of VIEWPORTS) {
  test(`axe WCAG A/AA reports no blocking violation at ${viewport.label}`, async ({
    page,
    gate,
  }, testInfo) => {
    allowHarnessNoise(gate);
    const project = testInfo.project.name;
    const violations: string[] = [];
    for (const surface of AXE_SURFACES.filter((s) => s.auth === 'public')) {
      await scan(page, surface, viewport, project, violations);
    }
    await loginStudent(page, world!);
    for (const surface of AXE_SURFACES.filter((s) => s.auth === 'student')) {
      await scan(page, surface, viewport, project, violations);
    }
    expect(
      violations,
      `${AXE_SURFACES.length} surfaces scanned at ${viewport.label}; ` +
        `${violations.length} unattributed blocking violation(s)`,
    ).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// GATE-13.3-11: the unweakened claim, stated correctly
// ---------------------------------------------------------------------------
/**
 * **The accessibility finding this task found, on the record with the correct claim.**
 *
 * At **320 x 568** — the width R16.1 says the student experience *"SHALL be designed
 * at … first"* — the four bottom-navigation links have no accessible name, so axe
 * reports `link-name` (serious, WCAG 2.4.4 / 4.1.2). The cause is one line:
 * `BottomNavigation.tsx:221` drops the label span below 360 px and nothing replaces
 * it — no `aria-label`, and a decorative icon.
 *
 * Was annotated `test.fail()` for 13.2 §3.6's reasons: the assertion is the correct
 * one, the test still executes, the counter-example is in the trace and in
 * `raw/measurements-*.jsonl`, and the day an `aria-label` is added this row fails
 * because it passed. Deterministic — 320 is always below 360.
 *
 * ## Converted by task 13.6 remediation L6
 *
 * `BottomNavigation` carries `aria-label` on every item **unconditionally**, not
 * only in the `iconOnly` path, because a name that matches the visible text is
 * correct at every width and a conditional one is a second code path that can
 * regress on its own. The icon and the label span are `aria-hidden`, so the
 * accessible name is exactly one string rather than an icon's alt text concatenated
 * with a truncated label. The badge count folds into that name.
 *
 * The `bg-primary/10 text-primary` active pair also became
 * `bg-accent text-accent-foreground` — 4.49 : 1 to 7.2 : 1 — so this scan's
 * `color-contrast` rows on the bar are gone as well (GATE-13.3-12). The assertion is
 * unchanged: **no** blocking violation, no allow-list.
 */
test(
  'GATE-13.3-11 (closed): the bottom navigation has accessible names at 320x568',
  async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    await loginStudent(page, world!);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('nav[aria-label="Bottom navigation"]')
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    // The measured names, so the evidence shows what a screen reader would announce.
    const names = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('nav[aria-label="Bottom navigation"] a, nav[aria-label="Bottom navigation"] button'),
      ).map((el) => ({
        href: el.getAttribute('href'),
        ariaLabel: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim(),
      })),
    );
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      kind: 'axe',
      viewport: '320x568',
      surface: 'nav[aria-label="Bottom navigation"]',
      finding: 'GATE-13.3-11',
      expectedToFail: false,
      convertedBy: '13.6 remediation L6',
      owner: 'shell/navigation lane — src/components/ui/BottomNavigation.tsx:221',
      measuredNames: names,
      blocking: blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    });

    expect(
      blocking.map((v) => `[${v.impact}] ${v.id} x${v.nodes.length}`),
      `the bottom navigation should expose an accessible name for every item at ` +
        `320x568; measured names: ${JSON.stringify(names)}`,
    ).toEqual([]);
  },
);
