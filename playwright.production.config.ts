import { defineConfig, devices } from '@playwright/test';

// Production-ready config with all browsers and maximum parallelization
export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/production/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 6, // Balanced for stability
  timeout: 20000,
  expect: {
    timeout: 8000,
  },
  reporter: [
    ['dot'],
    ['html', { open: 'never', outputFolder: 'test-results/production-html' }],
    ['json', { outputFile: 'test-results/production-results.json' }]
  ],
  use: {
    baseURL: '***REMOVED***',
    actionTimeout: 8000,
    navigationTimeout: 15000,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: '***REMOVED***'
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        baseURL: '***REMOVED***'
      },
    },
    {
      name: 'mobile',
      use: { 
        ...devices['Pixel 5'],
        baseURL: '***REMOVED***'
      },
    },
  ],
});