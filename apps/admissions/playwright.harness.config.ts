import { defineConfig, devices } from '@playwright/test';
import { harnessLaunchOptions } from './tests/harness-e2e/helpers/host-resolver';

import {
  evidenceDirRelative,
  EVIDENCE_RUN_ID_ENV,
} from './tests/harness-e2e/helpers/evidence-dir';

/**
 * Admissions V2 isolated-harness Playwright config (task 0.4, R1.4 / R18.1-4).
 *
 * This is the STRICT, un-gated V2 profile that replaces the old descriptive,
 * env-gated staging specs (finding GOV-04). It runs against the local harness
 * edge (Caddy) that the `harness/bin/harness` script brings up.
 *
 * Three projects:
 *   - chromium-required  : desktop viewport; real behaviour; MUST pass with
 *                          ZERO skips. Strict gates enforced by
 *                          tests/harness-e2e/harness-fixtures.ts.
 *   - mobile-required    : mobile viewport (Pixel 5); same required tests at a
 *                          mobile breakpoint; MUST pass with ZERO skips.
 *   - gatecheck-negative : deliberately trips each gate; MUST FAIL. The harness
 *                          smoke asserts this project fails, proving the gates
 *                          actually fire (not silently pass).
 *
 * There is no environment gate and no storageState — every run is fresh.
 *
 * ## Where it writes (task 13.6 remediation L8, finding GATE-13.1-07)
 *
 * This config used to hard-code `../../docs/v2-evidence/0.4/playwright-report.json`, so
 * **every** harness run by **any** task overwrote task 0.4's Required_Evidence artifact
 * — the first of the three mechanisms 13.1 §7.1 catalogued. It now resolves through
 * `evidenceDirRelative()` (`tests/harness-e2e/helpers/evidence-dir.ts`): run-scoped
 * under `test-results/` by default, 0.4's own directory only when a run says so with
 * `V2_EVIDENCE_TASK_DIRS=1`.
 *
 * It also stamps `V2_EVIDENCE_RUN_ID` here, in the main process, so the reporter and
 * every spec that computes its own path (11.1–11.5's screenshots, 13.3's
 * `measurements-*.jsonl`) land under the **same** run directory. Worker processes
 * inherit `process.env`, and the `||` keeps the parent's value if the config is
 * re-loaded there.
 *
 * Regenerating 0.4's report on purpose:
 *
 *     V2_EVIDENCE_TASK_DIRS=1 HARNESS_PW_CHANNEL=chrome \
 *       bunx playwright test -c playwright.harness.config.ts
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';

// Stamped before the reporter path is resolved, and before any worker is spawned, so
// one run has one directory. An explicit value (a CI job id, a batch label) wins.
process.env[EVIDENCE_RUN_ID_ENV] =
  process.env[EVIDENCE_RUN_ID_ENV] || new Date().toISOString().replace(/[:.]/g, '-');

/** Repo-relative; the reporter path below is resolved against this config's directory. */
const EVIDENCE_REL = evidenceDirRelative('0.4');

// Optional browser channel escape hatch. Defaults to Playwright's bundled
// Chromium (the clean-machine / CI path on ubuntu-latest). Set HARNESS_PW_CHANNEL
// (e.g. 'chrome') to run against a system-installed browser on OSes where the
// bundled Chromium build is unavailable — this does not change the default.
const channel = process.env.HARNESS_PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests/harness-e2e',
  // A required test may never be silenced by .only.
  forbidOnly: true,
  // Deterministic, serial, no flake-masking retries in the required profile.
  retries: 0,
  workers: 1,
  /*
    Task 13.6 remediation item **M5**, closing L7-L8 §5.5 / §9.4 item 1.

    This config used to set NO `timeout`, so Playwright's 30 s default applied to
    every required test. Task 13.3 then added four measurement specs to
    `tests/harness-e2e/required/` — `viewport-pixel-matrix`, `a11y-zoom-dimensions`,
    `axe-viewport-sweep`, `long-content-tenant-strings` — whose own profile
    (`playwright.harness.13-3.config.ts:83`) sets `timeout: 180_000` because
    `measureSurface()` alone waits 1200 ms per surface across several surfaces at six
    widths. The base profile therefore picked them up and could never pass them:
    L7-L8 measured **7 failures, all `Test timeout of 30000ms exceeded`**, against
    **12 passes in 12.2 minutes** for the same specs with `--timeout=180000`. They had
    not been able to pass under the required profile since 13.3 added them.

    L7-L8 left the harness lane two answers and M5 chose the first:

      (1) raise the base profile's budget            <- this
      (2) exclude those four specs from the base profile, keeping them on their own

    (2) was rejected because it removes four REQUIRED specs from the REQUIRED profile.
    R18.2 asks the required Playwright tests to complete "with zero required skips" and
    R18.3 makes this gate the thing that runs them; a required spec the gate does not
    run is strictly worse than one that is slow. It would also have been invisible:
    `harness/bin/harness` invokes `--project=chromium-required --project=mobile-required`
    by name, so a project-level split silently drops the excluded specs from
    `harness smoke` — which is exactly how GATE-13.1-07's fourth mechanism stayed latent
    ("nobody had typed `harness smoke` since the task that wrote it").

    L7-L8's stated reservation about (1) was that a longer budget means a genuinely hung
    test takes longer to fail, "including the strict no-skip gates". That is answered
    below rather than accepted:

      - The gatecheck project is unaffected, and this is measured, not assumed
        (`raw/44-m5-gatecheck-timing.txt`). All four `gatecheck/*.gate.spec.ts` fail by
        THROW, never by timeout: `skip.gate` throws on the first statement,
        `console.gate` after a 200 ms tick, `failed-request.gate` after 500 ms, and
        `undrained.gate` inside its own `assertRequiredJobsDrained(3000)` bound. None of
        them consumes the per-test budget, so raising it does not slow the project whose
        whole job is to fail.

      - A hung page still fails on the old order of magnitude, because the per-test
        budget is not the instrument that detects one. `navigationTimeout`,
        `actionTimeout` and `expect.timeout` are, and all three are bounded well below
        `timeout`. A `goto` that never resolves fails at 60 s; a click on an element that
        never appears fails at 30 s; an assertion that will never pass fails at 30 s.
        What the 180 s buys is only the sum of a spec's own EXPLICIT `waitForTimeout`
        measurement pauses, which is the one thing the 30 s default was wrong about.

    180_000 / 30_000 are not new numbers: they are the values 13.3's own config and
    L5-L6's re-measurement config already set, so this makes the base profile agree with
    the two profiles these specs have actually been run under, rather than inventing a
    third budget.
  */
  timeout: 180_000,
  expect: { timeout: 30_000 },
  /*
    Task 13.6 remediation L8. Playwright DELETES `outputDir` at the start of every run,
    and its default here is `apps/admissions/test-results` — the same tree the run-scoped
    evidence root lives under. Left at the default, run 2 of a session silently erased
    run 1's report and screenshots, which is GATE-13.1-07's own failure mode ("whoever
    ran it last") relocated into the scratch tree. Naming a SUBdirectory confines the
    cleanup to Playwright's own trace/failure artifacts and leaves
    `test-results/harness-evidence/<run>/` alone. Found by running the probe twice and
    looking for the first run's files; recorded in the evidence README rather than
    quietly corrected.
  */
  outputDir: './test-results/artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: `../../${EVIDENCE_REL}/playwright-report.json` }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // The harness edge issues first-party cookies over http://*.localhost.
    ignoreHTTPSErrors: true,
    // Outside host names do not resolve in the browser (task 3.7, R1.11).
    launchOptions: harnessLaunchOptions,
    /*
      Item M5's half of the raised `timeout` above. These two default to 0 — no limit —
      which means that before M5 the per-test budget was the ONLY bound on a hung
      navigation or a click on an element that never arrives. Bounding them here is what
      makes raising `timeout` to 180 s safe: the budget now covers a spec's own explicit
      measurement pauses, while each individual operation that could hang keeps a bound
      of the same order as the old 30 s default.

      60 s for navigation rather than 30 s because these run against a cold local Caddy +
      Django + Postgres stack and 13.1 §6.1 already recorded a route sweep at 38.3 s on a
      used stack; a first paint that is merely slow must not be reported as a hang.
    */
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-required',
      testMatch: /required\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], channel },
    },
    {
      name: 'mobile-required',
      testMatch: /required\/.*\.spec\.ts$/,
      use: { ...devices['Pixel 5'], channel },
    },
    {
      name: 'gatecheck-negative',
      testMatch: /gatecheck\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], channel },
    },
  ],
});
