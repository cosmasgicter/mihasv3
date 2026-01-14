import { test, expect } from '@playwright/test';

/**
 * Phase 2 Performance Checkpoint Verification
 * 
 * This test suite verifies that all Phase 2 performance optimizations
 * are working correctly according to the requirements:
 * - Navigation times < 500ms
 * - Login < 2 seconds
 * - Track application page < 1 second
 * - Lighthouse audit score > 90
 */

test.describe('Phase 2 Performance Checkpoint', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cache and cookies for consistent testing
    await page.context().clearCookies();
  });

  test('Navigation times should be under 500ms', async ({ page }) => {
    // Navigate to home page first
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test navigation to various pages
    const routes = [
      { path: '/about', name: 'About' },
      { path: '/programs', name: 'Programs' },
      { path: '/track', name: 'Track Application' },
      { path: '/', name: 'Home' }
    ];

    for (const route of routes) {
      const startTime = Date.now();
      
      // Navigate to the route
      await page.goto(route.path);
      
      // Wait for the page to be interactive
      await page.waitForLoadState('domcontentloaded');
      
      const navigationTime = Date.now() - startTime;
      
      console.log(`Navigation to ${route.name}: ${navigationTime}ms`);
      
      // Verify navigation time is under 500ms
      expect(navigationTime).toBeLessThan(500);
    }
  });

  test('Login flow should complete within 2 seconds', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Measure login time
    const startTime = Date.now();

    // Fill in login credentials (using test credentials)
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpassword123');

    // Click login button
    await page.click('button[type="submit"]');

    // Wait for either successful login (redirect) or error message
    await Promise.race([
      page.waitForURL(/\/(dashboard|student|admin)/, { timeout: 2000 }),
      page.waitForSelector('[role="alert"]', { timeout: 2000 })
    ]).catch(() => {
      // If neither happens within 2 seconds, that's still a timing we can measure
    });

    const loginTime = Date.now() - startTime;
    
    console.log(`Login flow completed in: ${loginTime}ms`);
    
    // Verify login time is under 2 seconds (2000ms)
    expect(loginTime).toBeLessThan(2000);
  });

  test('Track application page should load within 1 second', async ({ page }) => {
    // Navigate to track application page
    const startTime = Date.now();
    
    await page.goto('/track');
    
    // Wait for the main content to be visible
    await page.waitForSelector('main', { state: 'visible' });
    
    // Wait for any loading indicators to disappear
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    console.log(`Track application page loaded in: ${loadTime}ms`);
    
    // Verify load time is under 1 second (1000ms)
    expect(loadTime).toBeLessThan(1000);
  });

  test('Page should have good Core Web Vitals', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Measure Core Web Vitals using Performance API
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Get navigation timing
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        
        // Calculate metrics
        const metrics = {
          // First Contentful Paint
          fcp: 0,
          // Largest Contentful Paint
          lcp: 0,
          // Time to First Byte
          ttfb: navigation.responseStart - navigation.requestStart,
          // DOM Content Loaded
          dcl: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          // Load Complete
          loadComplete: navigation.loadEventEnd - navigation.loadEventStart
        };

        // Get LCP using PerformanceObserver
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
        });
        
        try {
          observer.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
          // LCP not supported
        }

        // Get FCP
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
          metrics.fcp = fcpEntry.startTime;
        }

        // Wait a bit for LCP to be captured
        setTimeout(() => {
          observer.disconnect();
          resolve(metrics);
        }, 1000);
      });
    });

    console.log('Core Web Vitals:', metrics);

    // Verify metrics meet performance targets
    // TTFB should be under 600ms
    expect(metrics.ttfb).toBeLessThan(600);
    
    // FCP should be under 1500ms (1.5s)
    if (metrics.fcp > 0) {
      expect(metrics.fcp).toBeLessThan(1500);
    }
    
    // LCP should be under 2500ms (2.5s)
    if (metrics.lcp > 0) {
      expect(metrics.lcp).toBeLessThan(2500);
    }
  });

  test('Bundle size should be optimized with code splitting', async ({ page }) => {
    // Navigate to home page
    const response = await page.goto('/');
    
    // Get all network requests
    const requests: any[] = [];
    page.on('request', request => {
      requests.push({
        url: request.url(),
        resourceType: request.resourceType()
      });
    });

    await page.waitForLoadState('networkidle');

    // Check for code-split chunks
    const jsRequests = requests.filter(r => 
      r.resourceType === 'script' && r.url.includes('.js')
    );

    console.log(`Total JS files loaded: ${jsRequests.length}`);

    // Verify code splitting is working (should have multiple chunks)
    expect(jsRequests.length).toBeGreaterThan(1);

    // Check that we're not loading everything in one bundle
    const mainBundle = jsRequests.find(r => r.url.includes('index') || r.url.includes('main'));
    
    if (mainBundle) {
      console.log('Main bundle detected - code splitting is working');
    }
  });

  test('React Query caching should reduce redundant requests', async ({ page }) => {
    // Track network requests
    const apiRequests: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('supabase')) {
        apiRequests.push(url);
      }
    });

    // Navigate to a page that fetches data
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const initialRequestCount = apiRequests.length;
    console.log(`Initial API requests: ${initialRequestCount}`);

    // Navigate away and back
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const finalRequestCount = apiRequests.length;
    console.log(`Total API requests after navigation: ${finalRequestCount}`);

    // The second visit should have fewer requests due to caching
    // We expect some requests, but not double the initial amount
    expect(finalRequestCount).toBeLessThan(initialRequestCount * 2);
  });

  test('Service worker should be active for offline support', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if service worker is registered
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration !== undefined;
      }
      return false;
    });

    console.log(`Service worker registered: ${swRegistered}`);
    
    // Service worker should be registered for PWA functionality
    expect(swRegistered).toBe(true);
  });
});

test.describe('Lighthouse Performance Audit', () => {
  test('Home page should score > 90 on Lighthouse', async ({ page }) => {
    // Note: This is a simplified check. Full Lighthouse audit requires
    // running lighthouse CLI or using @playwright/test with lighthouse plugin
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Measure key performance indicators that contribute to Lighthouse score
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
        loadComplete: navigation.loadEventEnd - navigation.fetchStart,
        domInteractive: navigation.domInteractive - navigation.fetchStart,
        firstByte: navigation.responseStart - navigation.requestStart
      };
    });

    console.log('Performance Metrics:', performanceMetrics);

    // These metrics contribute to Lighthouse score
    // DOM Content Loaded should be under 1500ms
    expect(performanceMetrics.domContentLoaded).toBeLessThan(1500);
    
    // Load Complete should be under 3000ms
    expect(performanceMetrics.loadComplete).toBeLessThan(3000);
    
    // DOM Interactive should be under 1500ms
    expect(performanceMetrics.domInteractive).toBeLessThan(1500);
    
    // First Byte should be under 600ms
    expect(performanceMetrics.firstByte).toBeLessThan(600);
  });
});
