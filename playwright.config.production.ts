import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'

// Load production test environment
dotenv.config({ path: '.env.production.test' })

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 3, // More retries for production
  workers: 2, // Fewer workers for production stability
  timeout: 60000, // Longer timeout for production
  
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['junit', { outputFile: 'test-results/production-results.xml' }],
    ['json', { outputFile: 'test-results/production-results.json' }],
    ['@testmonitor/playwright-reporter', {
      domain: process.env.TESTMONITOR_DOMAIN,
      token: process.env.TESTMONITOR_TOKEN
    }]
  ],
  
  use: {
    baseURL: process.env.VITE_BASE_URL || 'https://apply.mihas.edu.zm',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000
  },
  
  projects: [
    {
      name: 'chromium-production',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-production',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-production',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome-production',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari-production',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'tablet-production',
      use: { ...devices['iPad Pro'] },
    }
  ],
  
  // No web server for production tests
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts'
})