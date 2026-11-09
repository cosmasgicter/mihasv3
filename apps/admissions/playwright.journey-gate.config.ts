import { defineConfig, devices } from '@playwright/test';
import {
  evidenceDirRelative,
  EVIDENCE_RUN_ID_ENV,
} from './tests/harness-e2e/helpers/evidence-dir';

/**
 * Student journey gate (SJR task 4.2, design R9-b): the blocking CI journey.
 *
 * Runs against the harness stack that `harness/bin/harness journey-gate` brings up
 * with the limiter ON, a private bucket, 20-second signed URLs and a browser-reachable
 * signing endpoint. A student registers, uploads over a 1 Mbit/s uplink, reopens a
 * stored document after its first URL has expired, submits, and downloads the slip.
 *
 *   - journey-gate-mobile  : 390x844 (iPhone 13 metrics), Chromium (the throttle needs CDP).
 *   - journey-gate-desktop : 1440x900, the Submit spec only.
 *
 * No retries and one worker: a flake budget of zero. The harness fixtures' strict
 * gates (console errors, failed requests, no skips) apply, with the status-aware
 * defaults on (a 429 or 5xx on the session and refresh URLs is a violation).
 *
 * Evidence is run-scoped under `apps/admissions/test-results/harness-evidence/<run>/
 * journey-gate/`, never `docs/v2-evidence`: `V2_EVIDENCE_TASK_DIRS` is not honoured here
 * on purpose (the gate is not any task's recorded evidence).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';
process.env[EVIDENCE_RUN_ID_ENV] =
  process.env[EVIDENCE_RUN_ID_ENV] || new Date().toISOString().replace(/[:.]/g, '-');
delete process.env.V2_EVIDENCE_TASK_DIRS;
const EVIDENCE_REL = evidenceDirRelative('journey-gate');
// Same escape hatch as the broad matrix: a system browser where the bundled build is missing.
const channel = process.env.HARNESS_PW_CHANNEL || undefined;

const MOBILE_SPECS = /(student-journey-gate|upload-near-limit|a11y-surfaces)\.spec\.ts$/;
const DESKTOP_SPECS = /submit-desktop\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/harness-e2e/journey-gate',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  outputDir: './test-results/journey-gate-artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: `../../${EVIDENCE_REL}/playwright-report.json` }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Journey-gate fixture mode: 429 and 5xx are never "allowed" by URL.
    statusAwareDefaults: true,
  },
  projects: [
    {
      name: 'journey-gate-mobile',
      testMatch: MOBILE_SPECS,
      // `devices['iPhone 13']` is a WebKit profile; the throttle needs CDP, so only the
      // viewport, touch and user agent are borrowed, on Chromium.
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel },
    },
    {
      name: 'journey-gate-desktop',
      testMatch: DESKTOP_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel },
    },
  ],
});
