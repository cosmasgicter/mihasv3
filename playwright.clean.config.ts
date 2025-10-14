import { defineConfig, devices } from '@playwright/test';

// Clean config without any Vite/Vitest imports
export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries to save resources
  workers: 4, // Balanced workers to prevent system overload
  timeout: 15000, // Shorter timeout
  expect: {
    timeout: 5000, // Shorter expect timeout
  },
  reporter: [
    ['dot'], // Minimal output
    ['html', { open: 'never', outputFolder: 'test-results/html' }]
  ],
  use: {
    baseURL: '***REMOVED***',
    actionTimeout: 5000, // Shorter action timeout
    navigationTimeout: 10000, // Shorter navigation timeout
    screenshot: 'off', // Disable screenshots to save resources
    video: 'off',
    trace: 'off', // Disable trace to save resources
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