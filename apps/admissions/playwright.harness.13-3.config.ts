import { defineConfig, devices } from '@playwright/test';

/**
 * Admissions V2 — task **13.3** mobile / zoom / accessibility / long-content profile.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third bullet.
 * Requirements: **R16** (whole), **R18.2-R18.4**.
 * Findings: STU-03, STU-04, STU-05, STU-10, STU-14, STU-20, STU-23, STU-24.
 * Required_Evidence: *visual/a11y report with reviewed screenshots and pixel checks*.
 *
 * ## Why this exists rather than reusing `playwright.harness.config.ts`
 *
 * Two reasons, and the second is a recorded finding.
 *
 * **1. The evidence line asks for reviewed screenshots.** The base profile sets
 * `screenshot: 'only-on-failure'` and `trace: 'on-first-retry'` with `retries: 0`,
 * so it emits no trace at all and a screenshot only once something has already
 * broken. A reviewer of 13.3 is asked to *look at* six viewports of a passing
 * surface, so this profile sets `screenshot: 'on'` and `trace: 'on'`.
 *
 * **2. GATE-13.1-07.** 13.1 §7.1 catalogued three instruments that overwrite an
 * earlier task's Required_Evidence; the base harness config is one of them,
 * because it hard-codes `../../docs/v2-evidence/0.4/playwright-report.json`.
 * 13.2 avoided becoming a sixth victim by pointing its own config at its own
 * directory, and this profile does the same: report, `outputDir` and HTML report
 * all land under `docs/v2-evidence/13.3/raw/`. This is **not** a fix for
 * GATE-13.1-07 — the base config is untouched and still does it, and the repair
 * belongs to the harness lane.
 *
 * ## Video cannot be produced on this OS
 *
 * 13.2 §7 measured it: `video: 'on'` fails every test at `browserContext.newPage`
 * with `Executable doesn't exist at …/ffmpeg-1011/ffmpeg-linux`, and
 * `bunx playwright install ffmpeg` refuses outright —
 * `Playwright does not support ffmpeg on ubuntu26.04-x64`. There is no system
 * ffmpeg either. This task's `_Evidence:` line asks for **screenshots and pixel
 * checks** rather than video, so nothing here depends on it; traces still embed a
 * screencast filmstrip for anyone who wants to step through a journey. `video`
 * should be turned on wherever ffmpeg exists (CI's `ubuntu-latest`).
 *
 * ## Per-file test budgets, because the axe budget is already thin
 *
 * 13.1 §6.1 recorded **six** measurements of `design-system-defluff.spec.ts:664`
 * — the existing axe sweep — and every failure was `Test timeout of 30000ms
 * exceeded` rather than an axe violation. It sweeps several admin routes at two
 * widths inside **one** test-level budget, so its margin is thin by construction:
 * 17.5 s on a freshly seeded stack, 38.3 s alone on a used one.
 *
 * This task runs axe across **six** viewports, so it does not repeat that shape.
 * `axe-viewport-sweep.spec.ts` spends **one test per viewport**, each with its own
 * budget, so a slow navigation costs one row rather than the whole scan — and a
 * timeout is legible as a *duration* result instead of masquerading as an
 * accessibility one. `timeout` below is the per-test budget for that slicing.
 *
 * ## Projects
 *
 * - `chromium-13-3` — Desktop Chrome. Every 13.3 file. The six-viewport matrix
 *   drives `setViewportSize` itself, so the device profile only supplies the
 *   engine, the DPR and a mouse pointer.
 * - `mobile-13-3` — Pixel 5 (touch, DPR 2.75, coarse pointer). The two files
 *   whose claims are *about* a touch device: the viewport matrix and the
 *   a11y/zoom dimensions. Tailwind's `touch` variant is
 *   `(hover: none) and (pointer: coarse)`, so a 44 px rule expressed through it
 *   is only actually exercised under this project.
 *
 * All four spec files live in `tests/harness-e2e/required/`, so the **base**
 * required profile picks them up at both viewports from now on. Everything that
 * makes that profile strict lives in `tests/harness-e2e/harness-fixtures.ts`
 * (no skips, no console errors, no page exceptions, no unasserted failed
 * requests, `net::ERR_ABORTED` recorded as a cancellation per 8.3) and is
 * inherited unchanged, as are `forbidOnly`, `retries: 0` and `workers: 1`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';

// Same escape hatch as the base profile: Playwright's bundled Chromium is
// unsupported on this OS, so a system channel (HARNESS_PW_CHANNEL=chrome) may be
// selected. It changes neither topology, data, nor gates.
const channel = process.env.HARNESS_PW_CHANNEL || undefined;

const EVIDENCE = '../../docs/v2-evidence/13.3/raw';

/** The four files this task adds. Named so the projects can slice them. */
const MATRIX = /required\/viewport-pixel-matrix\.spec\.ts$/;
const A11Y = /required\/a11y-zoom-dimensions\.spec\.ts$/;
const AXE = /required\/axe-viewport-sweep\.spec\.ts$/;
const LONG = /required\/long-content-tenant-strings\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/harness-e2e/required',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // Per-test budget. Generous enough that a slow navigation on a load-limited box
  // is not reported as an accessibility or layout result, and small enough that a
  // genuinely hung page still fails the row rather than the run.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: `${EVIDENCE}/artifacts`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${EVIDENCE}/playwright-report.json` }],
    ['html', { outputFolder: `${EVIDENCE}/html-report`, open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'on',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium-13-3',
      testMatch: [MATRIX, A11Y, AXE, LONG],
      use: { ...devices['Desktop Chrome'], channel },
    },
    {
      name: 'mobile-13-3',
      testMatch: [MATRIX, A11Y],
      use: { ...devices['Pixel 5'], channel },
    },
  ],
});
