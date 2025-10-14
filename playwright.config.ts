import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const PRODUCTION_URL = '***REMOVED***';

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 8 : 8, // Use maximum workers
  timeout: 30000,
  globalSetup: './tests/global-setup.ts',
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['@testmonitor/playwright-reporter', {
      domain: 'beanola.testmonitor.com',
      token: 'HwtbVXcvbqbaKicmFMnXwh6XKjho5ra6'
    }],
    ['line'],
    ['html', { open: 'never' }]
  ],
  use: {
    baseURL: PRODUCTION_URL,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'production-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: PRODUCTION_URL
      },
    },
    {
      name: 'production-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        baseURL: PRODUCTION_URL
      },
    },
    {
      name: 'production-mobile',
      use: { 
        ...devices['Pixel 5'],
        baseURL: PRODUCTION_URL
      },
    },
  ],
});