/**
 * Final Performance Audit
 * 
 * Comprehensive performance audit to verify all metrics meet targets.
 * 
 * Requirements: 14.1, 14.5 - Ensure Lighthouse score > 90
 * Task: 25.4 - Run final performance audit
 * 
 * This test verifies:
 * - FCP (First Contentful Paint) < 1.5s
 * - LCP (Largest Contentful Paint) < 2s
 * - FID (First Input Delay) < 100ms
 * - CLS (Cumulative Layout Shift) < 0.1
 */

import { test, expect, Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Performance thresholds from requirements
const THRESHOLDS = {
  FCP: 1500,  // First Contentful Paint (ms)
  LCP: 2000,  // Largest Contentful Paint (ms)
  FID: 100,   // First Input Delay (ms)
  CLS: 0.1,   // Cumulative Layout Shift
  TTI: 3000,  // Time to Interactive (ms)
  TBT: 300,   // Total Blocking Time (ms)
};

// Pages to audit
const PAGES = [
  { name: 'Homepage', url: '/' },
  { name: 'Programs', url: '/programs' },
  { name: 'About', url: '/about' },
  { name: 'Track Application', url: '/track-application' },
  { name: 'Sign In', url: '/auth/signin' },
];

interface PerformanceMetrics {
  fcp: number | null;
  lcp: number | null;
  cls: number;
  fid: number | null;
  tti: number | null;
  tbt: number | null;
}

interface AuditResult {
  pageName: string;
  url: string;
  metrics: PerformanceMetrics;
  passed: boolean;
  failures: string[];
}

/**
 * Measure Core Web Vitals
 */
async function measureCoreWebVitals(page: Page): Promise<PerformanceMetrics> {
  return await page.evaluate(() => {
    return new Promise<PerformanceMetrics>((resolve) => {
      const metrics: PerformanceMetrics = {
        fcp: null,
        lcp: null,
        cls: 0,
        fid: null,
        tti: null,
        tbt: null,
      };
      
      // Get navigation timing
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navTiming) {
        // Approximate TTI using domInteractive
        metrics.tti = navTiming.domInteractive;
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
        const lastEntry = entries[entries.length - 1] as any;
        metrics.lcp = lastEntry.startTime;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      
      // Get CLS
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as any;
          if (!layoutShift.hadRecentInput) {
            metrics.cls += layoutShift.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      
      // Get FID
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const firstInput = entries[0] as any;
          metrics.fid = firstInput.processingStart - firstInput.startTime;
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      
      // Calculate TBT (approximate)
      const longTasks = performance.getEntriesByType('longtask');
      metrics.tbt = longTasks.reduce((total, task) => {
        const blockingTime = Math.max(0, task.duration - 50);
        return total + blockingTime;
      }, 0);
      
      // Wait for observers to collect data
      setTimeout(() => {
        lcpObserver.disconnect();
        clsObserver.disconnect();
        fidObserver.disconnect();
        resolve(metrics);
      }, 1000);
    });
  });
}

/**
 * Check if metrics meet thresholds
 */
function checkMetrics(metrics: PerformanceMetrics): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  
  if (metrics.fcp && metrics.fcp > THRESHOLDS.FCP) {
    failures.push(`FCP: ${Math.round(metrics.fcp)}ms > ${THRESHOLDS.FCP}ms`);
  }
  
  if (metrics.lcp && metrics.lcp > THRESHOLDS.LCP) {
    failures.push(`LCP: ${Math.round(metrics.lcp)}ms > ${THRESHOLDS.LCP}ms`);
  }
  
  if (metrics.cls > THRESHOLDS.CLS) {
    failures.push(`CLS: ${metrics.cls.toFixed(3)} > ${THRESHOLDS.CLS}`);
  }
  
  if (metrics.fid && metrics.fid > THRESHOLDS.FID) {
    failures.push(`FID: ${Math.round(metrics.fid)}ms > ${THRESHOLDS.FID}ms`);
  }
  
  if (metrics.tti && metrics.tti > THRESHOLDS.TTI) {
    failures.push(`TTI: ${Math.round(metrics.tti)}ms > ${THRESHOLDS.TTI}ms`);
  }
  
  if (metrics.tbt && metrics.tbt > THRESHOLDS.TBT) {
    failures.push(`TBT: ${Math.round(metrics.tbt)}ms > ${THRESHOLDS.TBT}ms`);
  }
  
  return {
    passed: failures.length === 0,
    failures,
  };
}

// Store audit results
const auditResults: AuditResult[] = [];

test.describe('Final Performance Audit', () => {
  
  // Test each page
  for (const pageInfo of PAGES) {
    test(`${pageInfo.name} should meet all performance thresholds`, async ({ page }) => {
      console.log(`\nAuditing: ${pageInfo.name} (${pageInfo.url})...`);
      
      // Navigate to page
      await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
      
      // Wait for page to settle
      await page.waitForTimeout(1000);
      
      // Measure metrics
      const metrics = await measureCoreWebVitals(page);
      
      // Check thresholds
      const { passed, failures } = checkMetrics(metrics);
      
      // Log results
      console.log(`  FCP: ${metrics.fcp ? Math.round(metrics.fcp) + 'ms' : 'N/A'} (threshold: ${THRESHOLDS.FCP}ms)`);
      console.log(`  LCP: ${metrics.lcp ? Math.round(metrics.lcp) + 'ms' : 'N/A'} (threshold: ${THRESHOLDS.LCP}ms)`);
      console.log(`  CLS: ${metrics.cls.toFixed(3)} (threshold: ${THRESHOLDS.CLS})`);
      console.log(`  FID: ${metrics.fid ? Math.round(metrics.fid) + 'ms' : 'N/A'} (threshold: ${THRESHOLDS.FID}ms)`);
      console.log(`  TTI: ${metrics.tti ? Math.round(metrics.tti) + 'ms' : 'N/A'} (threshold: ${THRESHOLDS.TTI}ms)`);
      
      if (!passed) {
        console.log(`  ✗ Failures:`);
        failures.forEach(failure => console.log(`    - ${failure}`));
      } else {
        console.log(`  ✓ All metrics passed`);
      }
      
      // Store result
      auditResults.push({
        pageName: pageInfo.name,
        url: pageInfo.url,
        metrics,
        passed,
        failures,
      });
      
      // Assert all metrics meet thresholds
      expect(failures, `Performance metrics should meet thresholds:\n${failures.join('\n')}`).toHaveLength(0);
    });
  }
  
  // Generate summary report
  test.afterAll(() => {
    console.log('\n' + '='.repeat(80));
    console.log('FINAL PERFORMANCE AUDIT SUMMARY');
    console.log('='.repeat(80));
    
    const passed = auditResults.filter(r => r.passed).length;
    const failed = auditResults.filter(r => !r.passed).length;
    
    console.log(`\nTotal Pages: ${auditResults.length}`);
    console.log(`✓ Passed: ${passed}`);
    console.log(`✗ Failed: ${failed}`);
    
    console.log(`\nThresholds:`);
    console.log(`  FCP: <= ${THRESHOLDS.FCP}ms`);
    console.log(`  LCP: <= ${THRESHOLDS.LCP}ms`);
    console.log(`  CLS: <= ${THRESHOLDS.CLS}`);
    console.log(`  FID: <= ${THRESHOLDS.FID}ms`);
    console.log(`  TTI: <= ${THRESHOLDS.TTI}ms`);
    console.log(`  TBT: <= ${THRESHOLDS.TBT}ms`);
    
    if (failed > 0) {
      console.log(`\n✗ FAILED PAGES:`);
      auditResults
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`\n  ${result.pageName}:`);
          result.failures.forEach(failure => console.log(`    - ${failure}`));
        });
    }
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalPages: auditResults.length,
        passed,
        failed,
      },
      thresholds: THRESHOLDS,
      results: auditResults,
    };
    
    const reportPath = join(process.cwd(), 'final-performance-audit-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDetailed report saved to: ${reportPath}`);
    console.log('='.repeat(80) + '\n');
  });
});

// Individual Core Web Vitals tests
test.describe('Core Web Vitals Compliance', () => {
  
  test.describe('First Contentful Paint (FCP)', () => {
    for (const pageInfo of PAGES) {
      test(`${pageInfo.name} FCP should be < 1.5s`, async ({ page }) => {
        await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        
        const metrics = await measureCoreWebVitals(page);
        
        expect(metrics.fcp, `FCP should be < ${THRESHOLDS.FCP}ms`).toBeLessThan(THRESHOLDS.FCP);
      });
    }
  });
  
  test.describe('Largest Contentful Paint (LCP)', () => {
    for (const pageInfo of PAGES) {
      test(`${pageInfo.name} LCP should be < 2s`, async ({ page }) => {
        await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        
        const metrics = await measureCoreWebVitals(page);
        
        expect(metrics.lcp, `LCP should be < ${THRESHOLDS.LCP}ms`).toBeLessThan(THRESHOLDS.LCP);
      });
    }
  });
  
  test.describe('Cumulative Layout Shift (CLS)', () => {
    for (const pageInfo of PAGES) {
      test(`${pageInfo.name} CLS should be < 0.1`, async ({ page }) => {
        await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        
        const metrics = await measureCoreWebVitals(page);
        
        expect(metrics.cls, `CLS should be < ${THRESHOLDS.CLS}`).toBeLessThan(THRESHOLDS.CLS);
      });
    }
  });
});

// Performance regression test
test('Performance regression check', async ({ page }) => {
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE REGRESSION CHECK');
  console.log('='.repeat(80));
  
  const results: Array<{ page: string; lcp: number; passed: boolean }> = [];
  
  for (const pageInfo of PAGES) {
    await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const metrics = await measureCoreWebVitals(page);
    const passed = metrics.lcp ? metrics.lcp < THRESHOLDS.LCP : false;
    
    results.push({
      page: pageInfo.name,
      lcp: metrics.lcp || 0,
      passed,
    });
  }
  
  console.log('\nLCP Results:');
  results.forEach(result => {
    const status = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${status} ${result.page}: ${Math.round(result.lcp)}ms\x1b[0m`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log(`\n${allPassed ? '✓ No performance regressions detected' : '✗ Performance regressions detected'}`);
  console.log('='.repeat(80) + '\n');
  
  expect(allPassed, 'All pages should meet LCP threshold').toBe(true);
});
