/**
 * Comprehensive Page Load Performance Audit
 * 
 * Measures Largest Contentful Paint (LCP) and other Core Web Vitals
 * for all major pages in the MIHAS application.
 * 
 * Requirements: 14.1 - Ensure LCP < 2 seconds for all pages
 * 
 * Usage: node scripts/audit-page-performance.js
 */

import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Pages to audit
const PAGES_TO_AUDIT = [
  { name: 'Homepage', url: '/', requiresAuth: false },
  { name: 'Programs', url: '/programs', requiresAuth: false },
  { name: 'About', url: '/about', requiresAuth: false },
  { name: 'Track Application', url: '/track-application', requiresAuth: false },
  { name: 'Sign In', url: '/auth/signin', requiresAuth: false },
  { name: 'Sign Up', url: '/auth/signup', requiresAuth: false },
  { name: 'Student Dashboard', url: '/student/dashboard', requiresAuth: true },
  { name: 'Student Applications', url: '/student/applications', requiresAuth: true },
  { name: 'Student Profile', url: '/student/profile', requiresAuth: true },
  { name: 'Application Wizard', url: '/apply', requiresAuth: true },
  { name: 'Admin Dashboard', url: '/admin/dashboard', requiresAuth: true },
  { name: 'Admin Applications', url: '/admin/applications', requiresAuth: true },
  { name: 'Admin Programs', url: '/admin/programs', requiresAuth: true },
];

// Performance thresholds
const THRESHOLDS = {
  LCP: 2000,  // Largest Contentful Paint < 2s
  FCP: 1500,  // First Contentful Paint < 1.5s
  FID: 100,   // First Input Delay < 100ms
  CLS: 0.1,   // Cumulative Layout Shift < 0.1
  TTFB: 600,  // Time to First Byte < 600ms
};

/**
 * Measure Core Web Vitals for a page
 */
async function measurePagePerformance(page, url) {
  const startTime = Date.now();
  
  try {
    // Navigate to page
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    
    // Wait for page to settle
    await page.waitForTimeout(1000);
    
    // Measure Core Web Vitals
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        const metrics = {
          lcp: null,
          fcp: null,
          cls: 0,
          fid: null,
          ttfb: null,
          loadTime: null,
        };
        
        // Get navigation timing
        const navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming) {
          metrics.ttfb = navTiming.responseStart - navTiming.requestStart;
          metrics.loadTime = navTiming.loadEventEnd - navTiming.fetchStart;
        }
        
        // Get paint timing
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
          metrics.fcp = fcpEntry.startTime;
        }
        
        // Get LCP
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          metrics.lcp = lastEntry.startTime;
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        
        // Get CLS
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              metrics.cls += entry.value;
            }
          }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        
        // Get FID (if available)
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            metrics.fid = entries[0].processingStart - entries[0].startTime;
          }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
        
        // Wait a bit for observers to collect data
        setTimeout(() => {
          lcpObserver.disconnect();
          clsObserver.disconnect();
          fidObserver.disconnect();
          resolve(metrics);
        }, 500);
      });
    });
    
    const totalTime = Date.now() - startTime;
    
    return {
      success: true,
      metrics: {
        ...metrics,
        totalTime,
      },
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      metrics: null,
      error: error.message,
    };
  }
}

/**
 * Check if metrics meet thresholds
 */
function checkThresholds(metrics) {
  const results = {
    lcp: { value: metrics.lcp, threshold: THRESHOLDS.LCP, passed: metrics.lcp < THRESHOLDS.LCP },
    fcp: { value: metrics.fcp, threshold: THRESHOLDS.FCP, passed: metrics.fcp < THRESHOLDS.FCP },
    cls: { value: metrics.cls, threshold: THRESHOLDS.CLS, passed: metrics.cls < THRESHOLDS.CLS },
    ttfb: { value: metrics.ttfb, threshold: THRESHOLDS.TTFB, passed: metrics.ttfb < THRESHOLDS.TTFB },
  };
  
  const allPassed = Object.values(results).every(r => r.passed);
  
  return { results, allPassed };
}

/**
 * Format metrics for display
 */
function formatMetric(value, unit = 'ms') {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (unit === 'ms') {
    return `${Math.round(value)}ms`;
  }
  return value.toFixed(3);
}

/**
 * Generate performance report
 */
function generateReport(auditResults) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPages: auditResults.length,
      passed: auditResults.filter(r => r.allPassed).length,
      failed: auditResults.filter(r => !r.allPassed).length,
      errors: auditResults.filter(r => !r.success).length,
    },
    thresholds: THRESHOLDS,
    results: auditResults,
  };
  
  return report;
}

/**
 * Print report to console
 */
function printReport(report) {
  console.log('\n' + '='.repeat(80));
  console.log('PAGE LOAD PERFORMANCE AUDIT REPORT');
  console.log('='.repeat(80));
  console.log(`\nTimestamp: ${report.timestamp}`);
  console.log(`\nSummary:`);
  console.log(`  Total Pages: ${report.summary.totalPages}`);
  console.log(`  ✓ Passed: ${report.summary.passed}`);
  console.log(`  ✗ Failed: ${report.summary.failed}`);
  console.log(`  ⚠ Errors: ${report.summary.errors}`);
  
  console.log(`\nThresholds:`);
  console.log(`  LCP: < ${THRESHOLDS.LCP}ms`);
  console.log(`  FCP: < ${THRESHOLDS.FCP}ms`);
  console.log(`  CLS: < ${THRESHOLDS.CLS}`);
  console.log(`  TTFB: < ${THRESHOLDS.TTFB}ms`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('-'.repeat(80));
  
  report.results.forEach((result, index) => {
    const status = result.allPassed ? '✓' : '✗';
    const color = result.allPassed ? '\x1b[32m' : '\x1b[31m';
    
    console.log(`\n${index + 1}. ${result.pageName} (${result.url})`);
    
    if (!result.success) {
      console.log(`   \x1b[31m✗ ERROR: ${result.error}\x1b[0m`);
      return;
    }
    
    console.log(`   ${color}${status} Overall: ${result.allPassed ? 'PASS' : 'FAIL'}\x1b[0m`);
    console.log(`   Total Time: ${formatMetric(result.metrics.totalTime)}`);
    
    if (result.thresholdCheck) {
      const { results } = result.thresholdCheck;
      
      Object.entries(results).forEach(([metric, data]) => {
        const metricStatus = data.passed ? '✓' : '✗';
        const metricColor = data.passed ? '\x1b[32m' : '\x1b[31m';
        const unit = metric === 'cls' ? '' : 'ms';
        
        console.log(
          `   ${metricColor}${metricStatus} ${metric.toUpperCase()}: ` +
          `${formatMetric(data.value, unit)} ` +
          `(threshold: ${formatMetric(data.threshold, unit)})\x1b[0m`
        );
      });
    }
  });
  
  console.log('\n' + '='.repeat(80));
  
  if (report.summary.failed > 0) {
    console.log('\x1b[31m✗ PERFORMANCE AUDIT FAILED\x1b[0m');
    console.log(`${report.summary.failed} page(s) did not meet performance thresholds.`);
  } else if (report.summary.errors > 0) {
    console.log('\x1b[33m⚠ PERFORMANCE AUDIT COMPLETED WITH ERRORS\x1b[0m');
    console.log(`${report.summary.errors} page(s) could not be measured.`);
  } else {
    console.log('\x1b[32m✓ PERFORMANCE AUDIT PASSED\x1b[0m');
    console.log('All pages meet performance thresholds!');
  }
  
  console.log('='.repeat(80) + '\n');
}

/**
 * Main audit function
 */
async function runAudit() {
  console.log('Starting page load performance audit...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  
  const auditResults = [];
  
  // Test public pages (no auth required)
  const publicPages = PAGES_TO_AUDIT.filter(p => !p.requiresAuth);
  
  for (const pageInfo of publicPages) {
    console.log(`Auditing: ${pageInfo.name} (${pageInfo.url})...`);
    
    const result = await measurePagePerformance(page, pageInfo.url);
    
    const auditResult = {
      pageName: pageInfo.name,
      url: pageInfo.url,
      requiresAuth: pageInfo.requiresAuth,
      success: result.success,
      metrics: result.metrics,
      error: result.error,
      allPassed: false,
      thresholdCheck: null,
    };
    
    if (result.success && result.metrics) {
      const thresholdCheck = checkThresholds(result.metrics);
      auditResult.thresholdCheck = thresholdCheck;
      auditResult.allPassed = thresholdCheck.allPassed;
    }
    
    auditResults.push(auditResult);
  }
  
  // Note: Authenticated pages would require login flow
  // For now, we'll skip them or mark as requiring manual testing
  const authPages = PAGES_TO_AUDIT.filter(p => p.requiresAuth);
  for (const pageInfo of authPages) {
    auditResults.push({
      pageName: pageInfo.name,
      url: pageInfo.url,
      requiresAuth: true,
      success: false,
      metrics: null,
      error: 'Requires authentication - manual testing needed',
      allPassed: false,
      thresholdCheck: null,
    });
  }
  
  await browser.close();
  
  // Generate and print report
  const report = generateReport(auditResults);
  printReport(report);
  
  // Save report to file
  const reportPath = join(process.cwd(), 'performance-audit-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}\n`);
  
  // Exit with appropriate code
  const hasFailures = report.summary.failed > 0;
  process.exit(hasFailures ? 1 : 0);
}

// Run the audit
runAudit().catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
