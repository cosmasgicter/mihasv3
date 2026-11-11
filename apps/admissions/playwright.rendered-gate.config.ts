import { defineConfig, devices } from '@playwright/test';
import { harnessLaunchOptions } from './tests/harness-e2e/helpers/host-resolver';
/**
 * Rendered design gate (platform-simplification task 22.1, design 12.7).
 *
 * Runs against the harness edge that `harness/bin/harness up` brings up, over the
 * production build of the SPA. Two projects, each visiting the whole Audited_Page_Set:
 *
 *   - desktop : 1440x900
 *   - mobile  : 390x844 (Chromium; the measurements and the type floors apply here)
 *
 * The spec records findings; `scripts/rendered-gate-compare.ts` compares them with the
 * committed baseline. No retries and one worker: a flake budget of zero. The harness
 * fixtures' strict gates apply, and so does the outside-host gate (the Chromium launch
 * carries the same `--host-resolver-rules` argument as every harness configuration).
 *
 *   bunx playwright test -c playwright.rendered-gate.config.ts
 *   bun ../../scripts/rendered-gate-compare.ts
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';
const channel = process.env.HARNESS_PW_CHANNEL || undefined;
export default defineConfig({
  testDir: './tests/harness-e2e/rendered-gate',
  testMatch: /rendered-gate\.spec\.ts$/,
  globalSetup: './tests/harness-e2e/rendered-gate/global-setup.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: './test-results/rendered-gate-artifacts',
  reporter: [['list']],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    launchOptions: harnessLaunchOptions,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Reduced motion keeps screenshots and measurements free of entrance animation.
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, channel },
    },
    {
      name: 'mobile',
      // `devices['iPhone 13']` is a WebKit profile; only its touch and user agent are
      // borrowed, on Chromium, at the gate's own 390x844.
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        channel,
      },
    },
  ],
});
