/**
 * Comprehensive Page Load Performance Audit
 * 
 * Measures Largest Contentful Paint (LCP) and other Core Web Vitals
 * for all major pages in the MIHAS application.
 * 
 * Requirements: 14.1 - Ensure LCP < 2 seconds for all pages
 * 
 * Task: 25.1 - Audit page load performance
 */

import { test, expect, Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Performance thresholds from requirements
const THRESHOLDS = {
  LCP: 2000,  // Largest Contentful Paint < 2s (Requirement 14.1)
  FCP: 1500,  // First Contentful Paint < 1.5s
  FID: 100,   // First Input Delay < 100ms
  CLS: 0.1,   // Cumulative Layout Shift < 0.1
  TTFB: 600,  // Time to First Byte < 600ms
};

// Pages to audit (public pages only for automated testing)
const PUBLIC_PAGES = [
  { name: 'Homepage', url: '/' },
  { name: 'Programs', url: '/programs' },
  { name: 'About', url: '/about' },
  { name: 'Track Application', url: '/track-application' },
  { name: 'Sign In', url: '/auth/signin' },
  { name: 'Sign Up', url: '/auth/signup' },
];

interface PageMetrics {
  lcp: number | null;
  fcp: number | null;
  cls: number;
  fid: number | null;
  ttfb: number | null;
  loadTime: number | null;
  totalTime: number;
}

interface AuditResult {
  pageName: string;
  url: string;
  success: boolean;
  metrics: PageMetrics | null;
  error: string | null;
  allPassed: boolean;
  thresholdCheck: any;
}

/**
 * Measure Core Web Vitals for a page
 */
async function measurePagePerformance(page: Page, url: string): Promise<{
  success: boolean;
  metrics: PageMetrics | null;
  error: string | null;
}> {
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
      return new Promise<PageMetrics>((resolve) => {
        const metrics: PageMetrics = {
          lcp: null,
          fcp: null,
          cls: 0,
          fid: null,
          ttfb: null,
          loadTime: null,
        };
        
        // Get navigation timing
        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
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
        
        // Get FID (if available)
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            const firstInput = entries[0] as any;
            metrics.fid = firstInput.processingStart - firstInput.startTime;
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
      error: (error as Error).message,
    };
  }
}

/**
 * Check if metrics meet thresholds
 */
function checkThresholds(metrics: PageMetrics) {
  const results = {
    lcp: { 
      value: metrics.lcp, 
      threshold: THRESHOLDS.LCP, 
      passed: metrics.lcp !== null && metrics.lcp < THRESHOLDS.LCP 
    },
    fcp: { 
      value: metrics.fcp, 
      threshold: THRESHOLDS.FCP, 
      passed: metrics.fcp !== null && metrics.fcp < THRESHOLDS.FCP 
    },
    cls: { 
      value: metrics.cls, 
      threshold: THRESHOLDS.CLS, 
      passed: metrics.cls < THRESHOLDS.CLS 
    },
    ttfb: { 
      value: metrics.ttfb, 
      threshold: THRESHOLDS.TTFB, 
      passed: metrics.ttfb !== null && metrics.ttfb < THRESHOLDS.TTFB 
    },
  };
  
  const allPassed = Object.values(results).every(r => r.passed);
  
  return { results, allPassed };
}

/**
 * Format metric for display
 */
function formatMetric(value: number | null, unit: string = 'ms'): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (unit === 'ms') {
    return `${Math.round(value)}ms`;
  }
  return value.toFixed(3);
}

// Store audit results for final report
const auditResults: AuditResult[] = [];

test.describe('Page Load Performance Audit', () => {
  
  // Test each public page
  for (const pageInfo of PUBLIC_PAGES) {
    test(`${pageInfo.name} should meet performance thresholds`, async ({ page }) => {
      console.log(`\nAuditing: ${pageInfo.name} (${pageInfo.url})...`);
      
      const result = await measurePagePerformance(page, pageInfo.url);
      
      const auditResult: AuditResult = {
        pageName: pageInfo.name,
        url: pageInfo.url,
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
        
        // Log metrics
        console.log(`  Total Time: ${formatMetric(result.metrics.totalTime)}`);
        console.log(`  LCP: ${formatMetric(result.metrics.lcp)} (threshold: ${THRESHOLDS.LCP}ms)`);
        console.log(`  FCP: ${formatMetric(result.metrics.fcp)} (threshold: ${THRESHOLDS.FCP}ms)`);
        console.log(`  CLS: ${formatMetric(result.metrics.cls, '')} (threshold: ${THRESHOLDS.CLS})`);
        console.log(`  TTFB: ${formatMetric(result.metrics.ttfb)} (threshold: ${THRESHOLDS.TTFB}ms)`);
        
        // Assert thresholds
        expect(result.metrics.lcp, `LCP should be < ${THRESHOLDS.LCP}ms`).toBeLessThan(THRESHOLDS.LCP);
        expect(result.metrics.fcp, `FCP should be < ${THRESHOLDS.FCP}ms`).toBeLessThan(THRESHOLDS.FCP);
        expect(result.metrics.cls, `CLS should be < ${THRESHOLDS.CLS}`).toBeLessThan(THRESHOLDS.CLS);
        expect(result.metrics.ttfb, `TTFB should be < ${THRESHOLDS.TTFB}ms`).toBeLessThan(THRESHOLDS.TTFB);
      } else {
        console.error(`  Error: ${result.error}`);
        throw new Error(`Failed to measure performance: ${result.error}`);
      }
      
      auditResults.push(auditResult);
    });
  }
  
  // Generate summary report after all tests
  test.afterAll(() => {
    console.log('\n' + '='.repeat(80));
    console.log('PAGE LOAD PERFORMANCE AUDIT SUMMARY');
    console.log('='.repeat(80));
    
    const passed = auditResults.filter(r => r.allPassed).length;
    const failed = auditResults.filter(r => !r.allPassed).length;
    const errors = auditResults.filter(r => !r.success).length;
    
    console.log(`\nTotal Pages: ${auditResults.length}`);
    console.log(`✓ Passed: ${passed}`);
    console.log(`✗ Failed: ${failed}`);
    console.log(`⚠ Errors: ${errors}`);
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalPages: auditResults.length,
        passed,
        failed,
        errors,
      },
      thresholds: THRESHOLDS,
      results: auditResults,
    };
    
    const reportPath = join(process.cwd(), 'performance-audit-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDetailed report saved to: ${reportPath}`);
    console.log('='.repeat(80) + '\n');
  });
});

// Individual metric tests for better granularity
test.describe('LCP Performance (Requirement 14.1)', () => {
  for (const pageInfo of PUBLIC_PAGES) {
    test(`${pageInfo.name} LCP should be < 2 seconds`, async ({ page }) => {
      const result = await measurePagePerformance(page, pageInfo.url);
      
      expect(result.success, 'Performance measurement should succeed').toBe(true);
      expect(result.metrics?.lcp, 'LCP should be measured').not.toBeNull();
      expect(result.metrics!.lcp!, `${pageInfo.name} LCP should be < 2000ms`).toBeLessThan(2000);
    });
  }
});

test.describe('Slow Page Identification', () => {
  test('identify and report slow pages', async ({ page }) => {
    const slowPages: Array<{ name: string; url: string; lcp: number }> = [];
    
    for (const pageInfo of PUBLIC_PAGES) {
      const result = await measurePagePerformance(page, pageInfo.url);
      
      if (result.success && result.metrics?.lcp && result.metrics.lcp >= THRESHOLDS.LCP) {
        slowPages.push({
          name: pageInfo.name,
          url: pageInfo.url,
          lcp: result.metrics.lcp,
        });
      }
    }
    
    if (slowPages.length > 0) {
      console.log('\n⚠ SLOW PAGES DETECTED:');
      slowPages.forEach(page => {
        console.log(`  - ${page.name} (${page.url}): LCP = ${Math.round(page.lcp)}ms`);
      });
      console.log('\nThese pages need optimization to meet the 2-second LCP threshold.\n');
    } else {
      console.log('\n✓ All pages meet the LCP threshold!\n');
    }
    
    // This test passes even if there are slow pages - it's informational
    // The individual page tests will fail if thresholds aren't met
    expect(true).toBe(true);
  });
});
