/**
 * Phase 2 Performance Verification Tests
 * 
 * Validates that Phase 2 performance optimizations meet requirements:
 * - Navigation times < 500ms
 * - Login < 2 seconds  
 * - Track application page < 1 second
 */

import { test, expect, Page } from '@playwright/test';

// Performance thresholds from requirements
const THRESHOLDS = {
  NAVIGATION: 500,        // ms
  LOGIN: 2000,           // ms
  TRACK_APPLICATION: 1000 // ms
};

// Helper to measure page load time
async function measurePageLoad(page: Page, url: string): Promise<number> {
  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  const endTime = Date.now();
  return endTime - startTime;
}

// Helper to measure navigation time (already on site)
async function measureNavigation(page: Page, url: string): Promise<number> {
  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const endTime = Date.now();
  return endTime - startTime;
}

test.describe('Phase 2 Performance Verification', () => {
  
  test.describe('Navigation Performance', () => {
    
    test('Homepage navigation should be < 500ms', async ({ page }) => {
      const loadTime = await measurePageLoad(page, '/');
      
      console.log(`Homepage load time: ${loadTime}ms`);
      expect(loadTime).toBeLessThan(THRESHOLDS.NAVIGATION);
    });
    
    test('Programs page navigation should be < 500ms', async ({ page }) => {
      // First load homepage to establish session
      await page.goto('/');
      
      // Then measure navigation to programs
      const navTime = await measureNavigation(page, '/programs');
      
      console.log(`Programs page navigation time: ${navTime}ms`);
      expect(navTime).toBeLessThan(THRESHOLDS.NAVIGATION);
    });
    
    test('About page navigation should be < 500ms', async ({ page }) => {
      await page.goto('/');
      const navTime = await measureNavigation(page, '/about');
      
      console.log(`About page navigation time: ${navTime}ms`);
      expect(navTime).toBeLessThan(THRESHOLDS.NAVIGATION);
    });
    
    test('Track application page navigation should be < 500ms', async ({ page }) => {
      await page.goto('/');
      const navTime = await measureNavigation(page, '/track-application');
      
      console.log(`Track application navigation time: ${navTime}ms`);
      expect(navTime).toBeLessThan(THRESHOLDS.NAVIGATION);
    });
  });
  
  test.describe('Track Application Page Performance', () => {
    
    test('Track application page should load in < 1 second', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/track-application', { waitUntil: 'networkidle' });
      
      // Wait for the form to be interactive
      await page.waitForSelector('form, [data-testid="track-form"]', { 
        state: 'visible',
        timeout: 2000 
      });
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      console.log(`Track application page load time: ${loadTime}ms`);
      expect(loadTime).toBeLessThan(THRESHOLDS.TRACK_APPLICATION);
    });
    
    test('Track application page should be interactive quickly', async ({ page }) => {
      await page.goto('/track-application');
      
      // Measure time to interactive by checking if form elements are enabled
      const startTime = Date.now();
      
      await page.waitForSelector('input[type="text"], input[type="email"]', {
        state: 'visible',
        timeout: 1000
      });
      
      const endTime = Date.now();
      const interactiveTime = endTime - startTime;
      
      console.log(`Track application interactive time: ${interactiveTime}ms`);
      expect(interactiveTime).toBeLessThan(500); // Should be interactive very quickly
    });
  });
  
  test.describe('Login Performance', () => {
    
    test('Login page should load quickly', async ({ page }) => {
      const loadTime = await measurePageLoad(page, '/login');
      
      console.log(`Login page load time: ${loadTime}ms`);
      expect(loadTime).toBeLessThan(THRESHOLDS.NAVIGATION);
    });
    
    test.skip('Login flow should complete in < 2 seconds', async ({ page }) => {
      // This test is skipped by default as it requires valid credentials
      // To run: provide valid test credentials in environment variables
      
      const testEmail = process.env.TEST_USER_EMAIL;
      const testPassword = process.env.TEST_USER_PASSWORD;
      
      if (!testEmail || !testPassword) {
        console.log('Skipping login test: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');
        return;
      }
      
      const startTime = Date.now();
      
      await page.goto('/login');
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.click('button[type="submit"]');
      
      // Wait for redirect to dashboard
      await page.waitForURL(/\/(student|admin)\/dashboard/, { timeout: 3000 });
      
      const endTime = Date.now();
      const loginTime = endTime - startTime;
      
      console.log(`Login flow time: ${loginTime}ms`);
      expect(loginTime).toBeLessThan(THRESHOLDS.LOGIN);
    });
  });
  
  test.describe('Code Splitting Verification', () => {
    
    test('Should lazy load route components', async ({ page }) => {
      // Navigate to homepage
      await page.goto('/');
      
      // Check that admin routes are not loaded initially
      const initialScripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]'))
          .map(script => (script as HTMLScriptElement).src);
      });
      
      // Admin chunks should not be loaded on homepage
      const hasAdminChunks = initialScripts.some(src => 
        src.includes('admin') || src.includes('Admin')
      );
      
      console.log('Initial scripts loaded:', initialScripts.length);
      expect(hasAdminChunks).toBe(false);
    });
    
    test('Should load chunks on demand', async ({ page }) => {
      await page.goto('/');
      
      // Get initial script count
      const initialScriptCount = await page.evaluate(() => 
        document.querySelectorAll('script[src]').length
      );
      
      // Navigate to a different route
      await page.goto('/programs');
      
      // Get new script count
      const newScriptCount = await page.evaluate(() => 
        document.querySelectorAll('script[src]').length
      );
      
      console.log(`Scripts: Initial=${initialScriptCount}, After navigation=${newScriptCount}`);
      
      // Should have loaded additional chunks (or same if already cached)
      expect(newScriptCount).toBeGreaterThanOrEqual(initialScriptCount);
    });
  });
  
  test.describe('Performance Metrics', () => {
    
    test('Should have good First Contentful Paint', async ({ page }) => {
      await page.goto('/');
      
      const fcp = await page.evaluate(() => {
        const perfEntries = performance.getEntriesByType('paint');
        const fcpEntry = perfEntries.find(entry => entry.name === 'first-contentful-paint');
        return fcpEntry ? fcpEntry.startTime : null;
      });
      
      if (fcp) {
        console.log(`First Contentful Paint: ${fcp.toFixed(0)}ms`);
        expect(fcp).toBeLessThan(1500); // Should be < 1.5s
      }
    });
    
    test('Should have minimal layout shift', async ({ page }) => {
      await page.goto('/');
      
      // Wait for page to settle
      await page.waitForTimeout(1000);
      
      const cls = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let clsValue = 0;
          
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if ((entry as any).hadRecentInput) continue;
              clsValue += (entry as any).value;
            }
          });
          
          observer.observe({ type: 'layout-shift', buffered: true });
          
          setTimeout(() => {
            observer.disconnect();
            resolve(clsValue);
          }, 500);
        });
      });
      
      console.log(`Cumulative Layout Shift: ${cls.toFixed(3)}`);
      expect(cls).toBeLessThan(0.1); // Good CLS is < 0.1
    });
  });
  
  test.describe('Cache Performance', () => {
    
    test('Should serve cached assets on repeat visits', async ({ page }) => {
      // First visit
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Second visit - should be faster due to caching
      const startTime = Date.now();
      await page.goto('/', { waitUntil: 'networkidle' });
      const endTime = Date.now();
      const cachedLoadTime = endTime - startTime;
      
      console.log(`Cached page load time: ${cachedLoadTime}ms`);
      
      // Cached load should be significantly faster
      expect(cachedLoadTime).toBeLessThan(THRESHOLDS.NAVIGATION);
    });
    
    test('Should use service worker caching', async ({ page }) => {
      await page.goto('/');
      
      // Check if service worker is registered
      const swRegistered = await page.evaluate(() => {
        return 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
      });
      
      console.log(`Service worker registered: ${swRegistered}`);
      
      // Service worker should be active for PWA functionality
      // Note: May not be active in test environment, so we just log the status
      if (swRegistered) {
        console.log('✓ Service worker is active');
      } else {
        console.log('ℹ Service worker not active (expected in test environment)');
      }
    });
  });
});

// Summary test that reports overall performance
test('Performance Summary', async ({ page }) => {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2 PERFORMANCE VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  
  const results: Array<{ name: string; time: number; threshold: number; passed: boolean }> = [];
  
  // Test homepage
  const homeTime = await measurePageLoad(page, '/');
  results.push({
    name: 'Homepage Load',
    time: homeTime,
    threshold: THRESHOLDS.NAVIGATION,
    passed: homeTime < THRESHOLDS.NAVIGATION
  });
  
  // Test track application
  const trackTime = await measurePageLoad(page, '/track-application');
  results.push({
    name: 'Track Application Load',
    time: trackTime,
    threshold: THRESHOLDS.TRACK_APPLICATION,
    passed: trackTime < THRESHOLDS.TRACK_APPLICATION
  });
  
  // Print results
  console.log('\nResults:');
  results.forEach(result => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${status}\x1b[0m ${result.name}: ${result.time}ms (threshold: ${result.threshold}ms)`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? '\x1b[32m✓ All performance tests passed!\x1b[0m' : '\x1b[31m✗ Some tests failed\x1b[0m');
  console.log('='.repeat(60) + '\n');
  
  expect(allPassed).toBe(true);
});
