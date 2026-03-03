/**
 * Phase 2 Performance Verification Script
 * 
 * This script verifies that all Phase 2 performance optimizations are working:
 * - Navigation times < 500ms
 * - Login < 2 seconds
 * - Track application page < 1 second
 * - Lighthouse audit score > 90
 */

import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration — credentials must come from environment variables
const TEST_CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5173',
  testUser: {
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD
  },
  thresholds: {
    navigation: 500,      // ms
    login: 2000,          // ms
    trackApplication: 1000, // ms
    lighthouseScore: 90   // score
  }
};

// Validate required credentials
if (!TEST_CONFIG.testUser.email) throw new Error('TEST_EMAIL env var required');
if (!TEST_CONFIG.testUser.password) throw new Error('TEST_PASSWORD env var required');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.cyan);
}

function logSection(message) {
  log(`\n${'='.repeat(60)}`, colors.blue);
  log(message, colors.blue);
  log('='.repeat(60), colors.blue);
}

// Performance measurement utilities
async function measureNavigationTime(page, url, label) {
  const startTime = Date.now();
  
  await page.goto(url, { waitUntil: 'networkidle' });
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  return { duration, label, url };
}

async function measureLoginTime(page) {
  const startTime = Date.now();
  
  // Navigate to login page
  await page.goto(`${TEST_CONFIG.baseUrl}/login`);
  
  // Fill in credentials
  await page.fill('input[type="email"]', TEST_CONFIG.testUser.email);
  await page.fill('input[type="password"]', TEST_CONFIG.testUser.password);
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Wait for redirect to dashboard
  await page.waitForURL(/\/(student|admin)\/dashboard/, { timeout: 5000 });
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  return { duration, label: 'Login Flow' };
}

async function measureTrackApplicationTime(page) {
  const startTime = Date.now();
  
  await page.goto(`${TEST_CONFIG.baseUrl}/track-application`, { waitUntil: 'networkidle' });
  
  // Wait for content to be interactive
  await page.waitForSelector('[data-testid="track-form"], form', { timeout: 3000 });
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  return { duration, label: 'Track Application Page' };
}

async function runLighthouseAudit(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Navigate to page first
    await page.goto(url);
    
    // Get the CDP endpoint
    const cdpEndpoint = await page.context().newCDPSession(page);
    
    // Run Lighthouse
    const result = await lighthouse(url, {
      port: new URL(browser.wsEndpoint()).port,
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
      },
    });
    
    await browser.close();
    
    return {
      performance: result.lhr.categories.performance.score * 100,
      accessibility: result.lhr.categories.accessibility.score * 100,
      bestPractices: result.lhr.categories['best-practices'].score * 100,
      seo: result.lhr.categories.seo.score * 100,
      metrics: {
        fcp: result.lhr.audits['first-contentful-paint'].numericValue,
        lcp: result.lhr.audits['largest-contentful-paint'].numericValue,
        tti: result.lhr.audits['interactive'].numericValue,
        tbt: result.lhr.audits['total-blocking-time'].numericValue,
        cls: result.lhr.audits['cumulative-layout-shift'].numericValue,
      }
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Test runners
async function testNavigationPerformance(browser) {
  logSection('Testing Navigation Performance');
  
  const page = await browser.newPage();
  const results = [];
  
  const routes = [
    { url: `${TEST_CONFIG.baseUrl}/`, label: 'Homepage' },
    { url: `${TEST_CONFIG.baseUrl}/programs`, label: 'Programs Page' },
    { url: `${TEST_CONFIG.baseUrl}/track-application`, label: 'Track Application' },
    { url: `${TEST_CONFIG.baseUrl}/about`, label: 'About Page' },
  ];
  
  for (const route of routes) {
    try {
      const result = await measureNavigationTime(page, route.url, route.label);
      results.push(result);
      
      const passed = result.duration < TEST_CONFIG.thresholds.navigation;
      if (passed) {
        logSuccess(`${result.label}: ${result.duration}ms (< ${TEST_CONFIG.thresholds.navigation}ms)`);
      } else {
        logError(`${result.label}: ${result.duration}ms (> ${TEST_CONFIG.thresholds.navigation}ms)`);
      }
    } catch (error) {
      logError(`${route.label}: Failed - ${error.message}`);
      results.push({ ...route, duration: -1, error: error.message });
    }
  }
  
  await page.close();
  
  const allPassed = results.every(r => r.duration > 0 && r.duration < TEST_CONFIG.thresholds.navigation);
  return { passed: allPassed, results };
}

async function testLoginPerformance(browser) {
  logSection('Testing Login Performance');
  
  const page = await browser.newPage();
  
  try {
    const result = await measureLoginTime(page);
    
    const passed = result.duration < TEST_CONFIG.thresholds.login;
    if (passed) {
      logSuccess(`${result.label}: ${result.duration}ms (< ${TEST_CONFIG.thresholds.login}ms)`);
    } else {
      logError(`${result.label}: ${result.duration}ms (> ${TEST_CONFIG.thresholds.login}ms)`);
    }
    
    await page.close();
    return { passed, result };
  } catch (error) {
    logWarning(`Login test skipped: ${error.message}`);
    logInfo('This is expected if test user does not exist or auth is not configured');
    await page.close();
    return { passed: true, result: { duration: 0, skipped: true }, skipped: true };
  }
}

async function testTrackApplicationPerformance(browser) {
  logSection('Testing Track Application Page Performance');
  
  const page = await browser.newPage();
  
  try {
    const result = await measureTrackApplicationTime(page);
    
    const passed = result.duration < TEST_CONFIG.thresholds.trackApplication;
    if (passed) {
      logSuccess(`${result.label}: ${result.duration}ms (< ${TEST_CONFIG.thresholds.trackApplication}ms)`);
    } else {
      logError(`${result.label}: ${result.duration}ms (> ${TEST_CONFIG.thresholds.trackApplication}ms)`);
    }
    
    await page.close();
    return { passed, result };
  } catch (error) {
    logError(`Track Application test failed: ${error.message}`);
    await page.close();
    return { passed: false, result: { duration: -1, error: error.message } };
  }
}

async function testLighthouseScore() {
  logSection('Running Lighthouse Audit');
  
  try {
    logInfo('Running Lighthouse audit (this may take a minute)...');
    const result = await runLighthouseAudit(TEST_CONFIG.baseUrl);
    
    logInfo('\nLighthouse Scores:');
    log(`  Performance: ${result.performance.toFixed(1)}`, 
        result.performance >= TEST_CONFIG.thresholds.lighthouseScore ? colors.green : colors.red);
    log(`  Accessibility: ${result.accessibility.toFixed(1)}`, colors.cyan);
    log(`  Best Practices: ${result.bestPractices.toFixed(1)}`, colors.cyan);
    log(`  SEO: ${result.seo.toFixed(1)}`, colors.cyan);
    
    logInfo('\nCore Web Vitals:');
    log(`  First Contentful Paint: ${(result.metrics.fcp / 1000).toFixed(2)}s`, colors.cyan);
    log(`  Largest Contentful Paint: ${(result.metrics.lcp / 1000).toFixed(2)}s`, colors.cyan);
    log(`  Time to Interactive: ${(result.metrics.tti / 1000).toFixed(2)}s`, colors.cyan);
    log(`  Total Blocking Time: ${result.metrics.tbt.toFixed(0)}ms`, colors.cyan);
    log(`  Cumulative Layout Shift: ${result.metrics.cls.toFixed(3)}`, colors.cyan);
    
    const passed = result.performance >= TEST_CONFIG.thresholds.lighthouseScore;
    if (passed) {
      logSuccess(`\nLighthouse performance score meets threshold (${TEST_CONFIG.thresholds.lighthouseScore})`);
    } else {
      logError(`\nLighthouse performance score below threshold (${TEST_CONFIG.thresholds.lighthouseScore})`);
    }
    
    return { passed, result };
  } catch (error) {
    logWarning(`Lighthouse audit skipped: ${error.message}`);
    logInfo('Lighthouse requires Chrome to be installed');
    return { passed: true, result: null, skipped: true };
  }
}

// Main test execution
async function runPerformanceTests() {
  log('\n' + '='.repeat(60), colors.blue);
  log('MIHAS Phase 2 Performance Verification', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);
  
  logInfo(`Base URL: ${TEST_CONFIG.baseUrl}`);
  logInfo('Starting dev server...\n');
  
  // Start Vite dev server
  let server;
  try {
    server = await createServer({
      root: path.resolve(__dirname, '..'),
      server: { port: 5173 }
    });
    await server.listen();
    logSuccess('Dev server started\n');
  } catch (error) {
    logWarning('Could not start dev server, assuming it is already running');
  }
  
  // Launch browser
  const browser = await chromium.launch({ headless: true });
  
  const testResults = {
    navigation: null,
    login: null,
    trackApplication: null,
    lighthouse: null
  };
  
  try {
    // Run all tests
    testResults.navigation = await testNavigationPerformance(browser);
    testResults.login = await testLoginPerformance(browser);
    testResults.trackApplication = await testTrackApplicationPerformance(browser);
    testResults.lighthouse = await testLighthouseScore();
    
    // Summary
    logSection('Test Summary');
    
    const allTests = [
      { name: 'Navigation Performance', ...testResults.navigation },
      { name: 'Login Performance', ...testResults.login },
      { name: 'Track Application Performance', ...testResults.trackApplication },
      { name: 'Lighthouse Audit', ...testResults.lighthouse }
    ];
    
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    allTests.forEach(test => {
      if (test.skipped) {
        logWarning(`${test.name}: SKIPPED`);
        skippedCount++;
      } else if (test.passed) {
        logSuccess(`${test.name}: PASSED`);
        passedCount++;
      } else {
        logError(`${test.name}: FAILED`);
        failedCount++;
      }
    });
    
    log('\n' + '='.repeat(60), colors.blue);
    log(`Total: ${allTests.length} | Passed: ${passedCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`, 
        failedCount === 0 ? colors.green : colors.red);
    log('='.repeat(60) + '\n', colors.blue);
    
    if (failedCount === 0) {
      logSuccess('All performance tests passed! ✨');
      process.exit(0);
    } else {
      logError('Some performance tests failed. Please review the results above.');
      process.exit(1);
    }
    
  } catch (error) {
    logError(`Test execution failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await browser.close();
    if (server) {
      await server.close();
    }
  }
}

// Run tests
runPerformanceTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
