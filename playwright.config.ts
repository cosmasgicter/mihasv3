import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

const PRODUCTION_URL = '***REMOVED***';

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 3 : 2,
  workers: process.env.CI ? 2 : 1,
  timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '60000'),
  expect: {
    timeout: parseInt(process.env.PLAYWRIGHT_EXPECT_TIMEOUT || '10000'),
  },
  reporter: [
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['line'],
    ['@testmonitor/playwright-reporter', {
      domain: process.env.TESTMONITOR_DOMAIN || 'beanola.testmonitor.com',
      token: process.env.TESTMONITOR_TOKEN || 'HwtbVXcvbqbaKicmFMnXwh6XKjho5ra6',
      projectId: 'mihas',
      testRunName: `MIHAS Production Tests - ${new Date().toISOString()}`,
      includeTestSteps: true,
      includeAttachments: true
    }]
  ],
  use: {
    baseURL: PRODUCTION_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: parseInt(process.env.PLAYWRIGHT_ACTION_TIMEOUT || '15000'),
    navigationTimeout: parseInt(process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT || '60000'),
    extraHTTPHeaders: {
      'User-Agent': 'MIHAS-Production-Test-Suite/1.0.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    ignoreHTTPSErrors: false,
  },
  projects: [
    // Production Desktop Tests
    {
      name: 'production-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: PRODUCTION_URL,
        channel: 'chrome'
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
      name: 'production-safari',
      use: { 
        ...devices['Desktop Safari'],
        baseURL: PRODUCTION_URL
      },
    },
    
    // Production Mobile Tests
    {
      name: 'production-mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        baseURL: PRODUCTION_URL
      },
    },
    {
      name: 'production-mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        baseURL: PRODUCTION_URL
      },
    },
    
    // Production Tablet Tests
    {
      name: 'production-ipad',
      use: { 
        ...devices['iPad Pro'],
        baseURL: PRODUCTION_URL
      },
    },
    
    // Production API Tests
    {
      name: 'production-api',
      testDir: './tests/api',
      use: {
        baseURL: PRODUCTION_URL,
        extraHTTPHeaders: {
          'User-Agent': 'MIHAS-API-Production-Test-Suite/1.0.0',
          'Accept': 'application/json'
        }
      },
    },
  ],
  // Global setup for production environment
  globalSetup: './tests/global-setup.ts',
});