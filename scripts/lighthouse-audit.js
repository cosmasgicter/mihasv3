/**
 * Comprehensive Lighthouse Performance Audit
 * 
 * Runs Lighthouse audits on all major pages and generates a report.
 * 
 * Requirements: 14.1, 14.5 - Ensure Lighthouse score > 90
 * Task: 25.4 - Run final performance audit
 * 
 * Usage: node scripts/lighthouse-audit.js
 */

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');

// Pages to audit
const PAGES_TO_AUDIT = [
  { name: 'Homepage', url: 'http://localhost:5173/' },
  { name: 'Programs', url: 'http://localhost:5173/programs' },
  { name: 'About', url: 'http://localhost:5173/about' },
  { name: 'Track Application', url: 'http://localhost:5173/track-application' },
  { name: 'Sign In', url: 'http://localhost:5173/auth/signin' },
];

// Lighthouse configuration
const lighthouseConfig = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'desktop',
    throttling: {
      rttMs: 40,
      throughputKbps: 10 * 1024,
      cpuSlowdownMultiplier: 1,
    },
    screenEmulation: {
      mobile: false,
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      disabled: false,
    },
  },
};

// Mobile configuration
const mobileConfig = {
  ...lighthouseConfig,
  settings: {
    ...lighthouseConfig.settings,
    formFactor: 'mobile',
    throttling: {
      rttMs: 150,
      throughputKbps: 1.6 * 1024,
      cpuSlowdownMultiplier: 4,
    },
    screenEmulation: {
      mobile: true,
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      disabled: false,
    },
  },
};

// Performance thresholds - Updated for Requirement 1.6 (95+ score)
const THRESHOLDS = {
  performance: 95,    // Requirement 1.6 - Lighthouse Performance score 95+
  accessibility: 95,  // WCAG 2.1 AA compliance
  bestPractices: 95,
  seo: 95,
  fcp: 500,   // First Contentful Paint (ms) - Requirement 1.1
  lcp: 1500,  // Largest Contentful Paint (ms) - Requirement 1.2
  fid: 100,   // First Input Delay (ms)
  cls: 0.1,   // Cumulative Layout Shift
  tti: 2500,  // Time to Interactive (ms)
};

/**
 * Run Lighthouse audit on a URL
 */
async function runLighthouse(url, config) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = {
    logLevel: 'error',
    output: 'json',
    port: chrome.port,
  };
  
  try {
    const runnerResult = await lighthouse(url, options, config);
    await chrome.kill();
    return runnerResult;
  } catch (error) {
    await chrome.kill();
    throw error;
  }
}

/**
 * Extract key metrics from Lighthouse result
 */
function extractMetrics(lhr) {
  const { categories, audits } = lhr;
  
  return {
    scores: {
      performance: Math.round(categories.performance.score * 100),
      accessibility: Math.round(categories.accessibility.score * 100),
      bestPractices: Math.round(categories['best-practices'].score * 100),
      seo: Math.round(categories.seo.score * 100),
    },
    metrics: {
      fcp: audits['first-contentful-paint'].numericValue,
      lcp: audits['largest-contentful-paint'].numericValue,
      fid: audits['max-potential-fid']?.numericValue || 0,
      cls: audits['cumulative-layout-shift'].numericValue,
      tti: audits['interactive'].numericValue,
      speedIndex: audits['speed-index'].numericValue,
      tbt: audits['total-blocking-time'].numericValue,
    },
    opportunities: audits['diagnostics']?.details?.items || [],
  };
}

/**
 * Check if metrics meet thresholds
 */
function checkThresholds(metrics) {
  const results = {
    performance: metrics.scores.performance >= THRESHOLDS.performance,
    accessibility: metrics.scores.accessibility >= THRESHOLDS.accessibility,
    bestPractices: metrics.scores.bestPractices >= THRESHOLDS.bestPractices,
    seo: metrics.scores.seo >= THRESHOLDS.seo,
    fcp: metrics.metrics.fcp <= THRESHOLDS.fcp,
    lcp: metrics.metrics.lcp <= THRESHOLDS.lcp,
    cls: metrics.metrics.cls <= THRESHOLDS.cls,
    tti: metrics.metrics.tti <= THRESHOLDS.tti,
  };
  
  const allPassed = Object.values(results).every(r => r);
  
  return { results, allPassed };
}

/**
 * Format metric value
 */
function formatMetric(value, unit = 'ms') {
  if (unit === 'ms') {
    return `${Math.round(value)}ms`;
  }
  return value.toFixed(3);
}

/**
 * Print audit results
 */
function printResults(results) {
  console.log('\n' + '='.repeat(80));
  console.log('LIGHTHOUSE PERFORMANCE AUDIT REPORT');
  console.log('='.repeat(80));
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  
  console.log(`\nThresholds:`);
  console.log(`  Performance: >= ${THRESHOLDS.performance}`);
  console.log(`  Accessibility: >= ${THRESHOLDS.accessibility}`);
  console.log(`  Best Practices: >= ${THRESHOLDS.bestPractices}`);
  console.log(`  SEO: >= ${THRESHOLDS.seo}`);
  console.log(`  FCP: <= ${THRESHOLDS.fcp}ms`);
  console.log(`  LCP: <= ${THRESHOLDS.lcp}ms`);
  console.log(`  CLS: <= ${THRESHOLDS.cls}`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('DESKTOP RESULTS');
  console.log('-'.repeat(80));
  
  results.desktop.forEach((result, index) => {
    const status = result.allPassed ? '✓' : '✗';
    const color = result.allPassed ? '\x1b[32m' : '\x1b[31m';
    
    console.log(`\n${index + 1}. ${result.pageName} (${result.url})`);
    console.log(`   ${color}${status} Overall: ${result.allPassed ? 'PASS' : 'FAIL'}\x1b[0m`);
    
    console.log(`\n   Scores:`);
    Object.entries(result.metrics.scores).forEach(([key, value]) => {
      const threshold = THRESHOLDS[key];
      const passed = value >= threshold;
      const scoreColor = passed ? '\x1b[32m' : '\x1b[31m';
      console.log(`     ${scoreColor}${key}: ${value}/100\x1b[0m`);
    });
    
    console.log(`\n   Core Web Vitals:`);
    console.log(`     FCP: ${formatMetric(result.metrics.metrics.fcp)}`);
    console.log(`     LCP: ${formatMetric(result.metrics.metrics.lcp)}`);
    console.log(`     CLS: ${formatMetric(result.metrics.metrics.cls, '')}`);
    console.log(`     TTI: ${formatMetric(result.metrics.metrics.tti)}`);
  });
  
  console.log('\n' + '-'.repeat(80));
  console.log('MOBILE RESULTS');
  console.log('-'.repeat(80));
  
  results.mobile.forEach((result, index) => {
    const status = result.allPassed ? '✓' : '✗';
    const color = result.allPassed ? '\x1b[32m' : '\x1b[31m';
    
    console.log(`\n${index + 1}. ${result.pageName} (${result.url})`);
    console.log(`   ${color}${status} Overall: ${result.allPassed ? 'PASS' : 'FAIL'}\x1b[0m`);
    
    console.log(`\n   Scores:`);
    Object.entries(result.metrics.scores).forEach(([key, value]) => {
      const threshold = THRESHOLDS[key];
      const passed = value >= threshold;
      const scoreColor = passed ? '\x1b[32m' : '\x1b[31m';
      console.log(`     ${scoreColor}${key}: ${value}/100\x1b[0m`);
    });
    
    console.log(`\n   Core Web Vitals:`);
    console.log(`     FCP: ${formatMetric(result.metrics.metrics.fcp)}`);
    console.log(`     LCP: ${formatMetric(result.metrics.metrics.lcp)}`);
    console.log(`     CLS: ${formatMetric(result.metrics.metrics.cls, '')}`);
    console.log(`     TTI: ${formatMetric(result.metrics.metrics.tti)}`);
  });
  
  console.log('\n' + '='.repeat(80));
  
  const desktopPassed = results.desktop.filter(r => r.allPassed).length;
  const mobilePassed = results.mobile.filter(r => r.allPassed).length;
  const totalPages = PAGES_TO_AUDIT.length;
  
  if (desktopPassed === totalPages && mobilePassed === totalPages) {
    console.log('\x1b[32m✓ PERFORMANCE AUDIT PASSED\x1b[0m');
    console.log('All pages meet performance thresholds on both desktop and mobile!');
  } else {
    console.log('\x1b[31m✗ PERFORMANCE AUDIT FAILED\x1b[0m');
    console.log(`Desktop: ${desktopPassed}/${totalPages} pages passed`);
    console.log(`Mobile: ${mobilePassed}/${totalPages} pages passed`);
  }
  
  console.log('='.repeat(80) + '\n');
}

/**
 * Main audit function
 */
async function runAudit() {
  console.log('Starting Lighthouse performance audit...');
  console.log('This may take several minutes...\n');
  
  const results = {
    desktop: [],
    mobile: [],
  };
  
  // Run desktop audits
  console.log('Running desktop audits...');
  for (const page of PAGES_TO_AUDIT) {
    console.log(`  Auditing: ${page.name}...`);
    
    try {
      const result = await runLighthouse(page.url, lighthouseConfig);
      const metrics = extractMetrics(result.lhr);
      const thresholdCheck = checkThresholds(metrics);
      
      results.desktop.push({
        pageName: page.name,
        url: page.url,
        metrics,
        ...thresholdCheck,
      });
    } catch (error) {
      console.error(`  Error auditing ${page.name}:`, error.message);
      results.desktop.push({
        pageName: page.name,
        url: page.url,
        error: error.message,
        allPassed: false,
      });
    }
  }
  
  // Run mobile audits
  console.log('\nRunning mobile audits...');
  for (const page of PAGES_TO_AUDIT) {
    console.log(`  Auditing: ${page.name}...`);
    
    try {
      const result = await runLighthouse(page.url, mobileConfig);
      const metrics = extractMetrics(result.lhr);
      const thresholdCheck = checkThresholds(metrics);
      
      results.mobile.push({
        pageName: page.name,
        url: page.url,
        metrics,
        ...thresholdCheck,
      });
    } catch (error) {
      console.error(`  Error auditing ${page.name}:`, error.message);
      results.mobile.push({
        pageName: page.name,
        url: page.url,
        error: error.message,
        allPassed: false,
      });
    }
  }
  
  // Print results
  printResults(results);
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'lighthouse-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}\n`);
  
  // Exit with appropriate code
  const allPassed = 
    results.desktop.every(r => r.allPassed) &&
    results.mobile.every(r => r.allPassed);
  
  process.exit(allPassed ? 0 : 1);
}

// Check if dev server is running
console.log('Make sure the dev server is running on http://localhost:5173');
console.log('Run: npm run dev\n');

// Run the audit
runAudit().catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
