import { defineConfig, devices } from '@playwright/test';

/**
 * Admissions V2 — task **13.2** two-tenant golden + adversarial matrix profile.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, second bullet.
 * Requirements: **R18** (whole). Evidence: *Playwright traces/videos/screenshots,
 * DB invariant report, drained queues*.
 *
 * ## Why this exists at all, rather than reusing `playwright.harness.config.ts`
 *
 * Two of 13.2's three named artifacts are **capture settings**, and the base
 * profile cannot produce them:
 *
 * ```ts
 * // playwright.harness.config.ts
 * retries: 0,
 * use: { trace: 'on-first-retry', screenshot: 'only-on-failure' },   // no video
 * ```
 *
 * `trace: 'on-first-retry'` with `retries: 0` means a trace is **never**
 * written — there is no first retry to write one on. So the base profile emits
 * no trace, no video, and a screenshot only when something already failed. A
 * reviewer of 13.2 is asked to be able to *watch* a journey, including one that
 * passed, so this profile sets `trace: 'on'` and `screenshot: 'on'` and points
 * them at `docs/v2-evidence/13.2/raw/artifacts/`.
 *
 * ## Video is off, and that is an environment limit rather than a choice
 *
 * `video: 'on'` was set first and every test failed identically at
 * `browserContext.newPage`:
 *
 * ```
 * Error: browserContext.newPage: Executable doesn't exist at
 *   /home/cosmas/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux
 * ```
 *
 * and installing it is refused outright:
 *
 * ```
 * $ bunx playwright install ffmpeg
 * Error: ERROR: Playwright does not support ffmpeg on ubuntu26.04-x64
 * ```
 *
 * This is the same class of limit as `HARNESS_PW_CHANNEL` (Playwright's bundled
 * Chromium is unsupported on this OS too). There is no system `ffmpeg` either and
 * no non-interactive way to add one, so **video cannot be produced here** and
 * asking for it only fails every test before it starts.
 *
 * What carries the requirement instead: a Playwright **trace** already embeds a
 * screencast filmstrip — one screenshot per action, plus the DOM snapshot, the
 * console and every network call at each step — so `npx playwright show-trace
 * <trace.zip>` lets a reviewer step through the journey frame by frame, which is
 * what "watch a failure, not just read a line" asks for. `video` should be turned
 * back on wherever ffmpeg is available (CI's `ubuntu-latest`, per
 * `.github/workflows/v2-harness-smoke.yml`); the line below is the only change
 * needed.
 *
 * It also gives the run **its own report path**. The base config hard-codes
 * `../../docs/v2-evidence/0.4/playwright-report.json`, which is task 0.4's
 * Required_Evidence artifact — finding **GATE-13.1-07**, one of the three write
 * paths 13.1 §7.1 catalogued. This profile is *not* a fix for that finding (the
 * base config is untouched and still does it, and the fix belongs to the harness
 * lane); it simply does not add a sixth task to the list of victims.
 *
 * Everything that makes the base profile *strict* is inherited unchanged, because
 * it lives in the specs' fixtures rather than in the config:
 * `tests/harness-e2e/harness-fixtures.ts` still forbids `test.skip`/`test.fixme`,
 * still fails on unexpected console errors and page exceptions, and still fails on
 * any unasserted failed request (with `net::ERR_ABORTED` recorded as a
 * *cancellation* rather than a failure — task 8.3). `forbidOnly`, `retries: 0` and
 * `workers: 1` are identical: a required journey may not be silenced, and flake
 * must not be retried away.
 *
 * ## Projects
 *
 * - `chromium-13-2` — desktop; all three matrices (isolation, golden, adversarial).
 * - `mobile-13-2`   — Pixel 5; the **golden journey** only.
 *
 * The mobile project is deliberately narrower than the desktop one *for this
 * task's own run*, and the reason is measured rather than assumed: 12.4 §12.2 and
 * 13.1 §6.1 both established this machine is load-limited, and the isolation and
 * adversarial matrices make almost no viewport-dependent claim (they assert
 * authority, ledger and queue state over HTTP plus a small number of rendered
 * surfaces). R18.2's "desktop and mobile" clause is carried by the journey that is
 * actually a journey.
 *
 * All three spec files live in `tests/harness-e2e/required/`, so the **base**
 * required profile picks them up at both viewports from now on — that is the
 * point of putting them there, and 13.1's count of 220 required tests is
 * superseded by it.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';

// Same escape hatch as the base profile: bundled Chromium is unavailable on some
// OSes, so a system channel (HARNESS_PW_CHANNEL=chrome) may be selected. It
// changes neither topology, data, nor gates.
const channel = process.env.HARNESS_PW_CHANNEL || undefined;

const EVIDENCE = '../../docs/v2-evidence/13.2/raw';

export default defineConfig({
  testDir: './tests/harness-e2e/required',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // The matrices walk long, real journeys (a payment collection settles, a PDF
  // renders, a sweep runs). The per-test budget is stated here rather than
  // sprinkled through the specs.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  outputDir: `${EVIDENCE}/artifacts`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${EVIDENCE}/playwright-report.json` }],
    ['html', { outputFolder: `${EVIDENCE}/html-report`, open: 'never' }],
  ],
  use: {
    baseURL,
    // Two of the three named evidence artifacts. `video: 'on'` belongs here and
    // is omitted only because this OS has no ffmpeg Playwright will accept — see
    // the header. Traces carry the filmstrip in the meantime.
    trace: 'on',
    screenshot: 'on',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium-13-2',
      testMatch: /required\/two-tenant-(isolation-matrix|golden-journey|adversarial-matrix)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], channel },
    },
    {
      name: 'mobile-13-2',
      testMatch: /required\/two-tenant-golden-journey\.spec\.ts$/,
      use: { ...devices['Pixel 5'], channel },
    },
  ],
});
