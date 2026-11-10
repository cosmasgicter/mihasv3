import { defineConfig, devices } from '@playwright/test';
import { harnessLaunchOptions } from './tests/harness-e2e/helpers/host-resolver';

/**
 * Admissions V2 — task **13.6 remediation L5 + L6** re-measurement profile.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/`, items **L5** and **L6** of
 * `docs/v2-evidence/13.6/README.md` §8.1. Closes blocking items **B7** and **B8**.
 *
 * ## What it runs, and why it is 13.3's own suites
 *
 * Exactly the four spec files task 13.3 wrote, unchanged in what they measure. L6's
 * job is to make 13.3's numbers different, so the honest instrument is 13.3's own
 * instrument — not a new one written by the lane that did the fixing. Seven of those
 * rows were annotated `test.fail()` because the claim they stated was correct and the
 * platform did not satisfy it; six are now plain `test()` rows asserting the same
 * claims, and the seventh (**GATE-13.3-13**, the 113-character intake name) is
 * deliberately still `test.fail()` because it belongs to the applications/data lane
 * and is not closed. Its docblock says why.
 *
 * The four allow-lists in `helpers/surfaces-13-3.ts` — `KNOWN_SUB44`,
 * `KNOWN_CLS_OVER_BUDGET`, `KNOWN_HEADING_ISSUES`, `KNOWN_AXE_BLOCKING` — are now
 * **empty**, which is the other half of the conversion: while an entry remained, a
 * regression of that control would have been attributed instead of failing.
 *
 * ## Its own directory, because GATE-13.1-07 is live
 *
 * 13.1 §7.1 catalogued three instruments that overwrite an earlier task's
 * Required_Evidence, and the base `playwright.harness.config.ts` is one of them: it
 * hard-codes `../../docs/v2-evidence/0.4/playwright-report.json`. 13.2 and 13.3 both
 * avoided becoming further victims by using their own config and `outputDir`, and this
 * profile does the same — report, `outputDir` and HTML report all land under
 * `docs/v2-evidence/13.6/remediation/L5-L6/raw/`.
 *
 * A config cannot redirect a path computed *inside* a spec, and 13.3's specs compute
 * `docs/v2-evidence/13.3/...` for their screenshots and their `measurements-*.jsonl`.
 * So `V2_EVIDENCE_DIR` below is read by `evidenceRoot()` in
 * `helpers/surfaces-13-3.ts`; it defaults to `13.3` when unset, so re-running 13.3 as
 * 13.3 is unaffected. This narrows GATE-13.1-07 for these four files; it does **not**
 * fix it — the base config is untouched and the repair belongs to the harness lane.
 *
 * ## Video, again, cannot be produced on this OS
 *
 * 13.2 §7 measured it and it has not changed: `video: 'on'` fails at
 * `browserContext.newPage` with `Executable doesn't exist at …/ffmpeg-linux`, and
 * `bunx playwright install ffmpeg` refuses — *"Playwright does not support ffmpeg on
 * ubuntu26.04-x64"*. There is no system ffmpeg. `trace: 'on'` and `screenshot: 'on'`
 * are set instead; traces embed a screencast filmstrip, and this batch's evidence is
 * screenshots and pixel numbers, which is what 13.3's `_Evidence:` line asks for and
 * what GATE-13.3-16 proves is necessary — that finding was caught by *looking*, after
 * every number had passed.
 *
 * Playwright's bundled Chromium is also unsupported here, so `HARNESS_PW_CHANNEL=chrome`
 * selects the system channel. It changes neither topology, data, nor gates.
 *
 * Everything that makes the required profile strict is inherited unchanged from
 * `tests/harness-e2e/harness-fixtures.ts`: no skips, no console errors, no page
 * exceptions, no unasserted failed requests, and `net::ERR_ABORTED` recorded as a
 * cancellation (task 8.3). `forbidOnly`, `retries: 0` and `workers: 1` match the base
 * profile.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';
const channel = process.env.HARNESS_PW_CHANNEL || undefined;

/** Relative to the repo root — mirrored into `V2_EVIDENCE_DIR` for the specs. */
const EVIDENCE_REL = 'docs/v2-evidence/13.6/remediation/L5-L6';
const EVIDENCE = `../../${EVIDENCE_REL}/raw`;

// The specs compute their own screenshot/JSONL paths, so they are told where to write
// rather than being trusted to guess. Set here so a bare `bunx playwright test -c`
// invocation cannot accidentally write into 13.3's directory.
process.env.V2_EVIDENCE_DIR = process.env.V2_EVIDENCE_DIR || EVIDENCE_REL;

const MATRIX = /required\/viewport-pixel-matrix\.spec\.ts$/;
const A11Y = /required\/a11y-zoom-dimensions\.spec\.ts$/;
const AXE = /required\/axe-viewport-sweep\.spec\.ts$/;
const LONG = /required\/long-content-tenant-strings\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/harness-e2e/required',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: `${EVIDENCE}/artifacts`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${EVIDENCE}/playwright-report.json` }],
    /*
      Written for the run, and **not retained** in the evidence directory: it is a
      ~144 MB re-encoding of the same 54 traces already in `artifacts/`, and 13.3
      dropped it for the same reason. `npx playwright show-trace` reads the trace zips
      directly and `playwright-report.json` is the machine-readable index. Kept
      configured here so a *local* run still gets a browsable report.
    */
    ['html', { outputFolder: `${EVIDENCE}/html-report`, open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'on',
    ignoreHTTPSErrors: true,
    // Outside host names do not resolve in the browser (task 3.7, R1.11).
    launchOptions: harnessLaunchOptions,
  },
  projects: [
    {
      name: 'chromium-13-6-L5-L6',
      testMatch: [MATRIX, A11Y, AXE, LONG],
      use: { ...devices['Desktop Chrome'], channel },
    },
    {
      name: 'mobile-13-6-L5-L6',
      testMatch: [MATRIX, A11Y],
      use: { ...devices['Pixel 5'], channel },
    },
  ],
});
