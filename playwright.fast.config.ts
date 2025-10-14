import { defineConfig, devices } from '@playwright/test';

// Ultra-fast config for quick test runs
export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/fast/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 6, // Optimized for speed
  timeout: 10000, // Fast timeout
  expect: {
    timeout: 3000,
  },
  reporter: [
    ['dot'], // Minimal console output
  ],
  use: {
    baseURL: '***REMOVED***',
    actionTimeout: 3000,
    navigationTimeout: 8000,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'chrome-fast',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: '***REMOVED***'
      },
    },
  ],
});