import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('Should load pages within acceptable time limits', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000); // 3 seconds
  });

  test('Should have good Core Web Vitals', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Measure performance metrics
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const vitals = {};
          
          entries.forEach((entry) => {
            if (entry.name === 'FCP') {
              vitals.fcp = entry.value;
            }
            if (entry.name === 'LCP') {
              vitals.lcp = entry.value;
            }
            if (entry.name === 'CLS') {
              vitals.cls = entry.value;
            }
          });
          
          resolve(vitals);
        }).observe({ entryTypes: ['measure', 'navigation'] });
        
        // Fallback timeout
        setTimeout(() => resolve({}), 5000);
      });
    });
    
    // Check Core Web Vitals thresholds
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(2500); // LCP < 2.5s
    }
    if (metrics.cls) {
      expect(metrics.cls).toBeLessThan(0.1); // CLS < 0.1
    }
  });

  test('Should optimize image loading', async ({ page }) => {
    await page.goto('/');
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const image = images.nth(i);
      
      // Check for lazy loading
      const loading = await image.getAttribute('loading');
      const isAboveFold = await image.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight;
      });
      
      if (!isAboveFold) {
        expect(loading).toBe('lazy');
      }
      
      // Check for responsive images
      const srcset = await image.getAttribute('srcset');
      const sizes = await image.getAttribute('sizes');
      
      if (srcset) {
        expect(sizes).toBeTruthy();
      }
    }
  });

  test('Should minimize JavaScript bundle size', async ({ page }) => {
    const response = await page.goto('/');
    
    // Check main bundle size
    const resources = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('.js'))
        .map(entry => ({
          name: entry.name,
          size: entry.transferSize,
          duration: entry.duration
        }));
    });
    
    const mainBundle = resources.find(r => r.name.includes('main') || r.name.includes('index'));
    
    if (mainBundle) {
      expect(mainBundle.size).toBeLessThan(500000); // 500KB
    }
  });

  test('Should cache resources effectively', async ({ page }) => {
    // First visit
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Second visit
    await page.reload();
    
    const cachedResources = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(entry => entry.transferSize === 0)
        .length;
    });
    
    expect(cachedResources).toBeGreaterThan(0);
  });

  test('Should handle large datasets efficiently', async ({ page }) => {
    // Mock admin with large dataset
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'mock-admin-token');
      localStorage.setItem('user-role', 'admin');
    });
    
    const startTime = Date.now();
    
    await page.goto('/admin/applications');
    
    // Wait for table to load
    await page.waitForSelector('[data-testid="applications-table"]');
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000); // 5 seconds for large dataset
    
    // Check for virtualization or pagination
    const hasVirtualization = await page.locator('[data-testid="virtual-list"]').count() > 0;
    const hasPagination = await page.locator('[data-testid="pagination"]').count() > 0;
    
    expect(hasVirtualization || hasPagination).toBeTruthy();
  });

  test('Should optimize form interactions', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    const startTime = Date.now();
    
    // Fill form rapidly
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    
    const fillTime = Date.now() - startTime;
    expect(fillTime).toBeLessThan(1000); // Form should be responsive
    
    // Check for debounced validation
    await page.fill('input[name="email"]', 'invalid-email');
    
    // Validation should not trigger immediately
    await page.waitForTimeout(100);
    const immediateError = await page.locator('text=Invalid email').count();
    expect(immediateError).toBe(0);
    
    // But should trigger after debounce
    await page.waitForTimeout(500);
    const debouncedError = await page.locator('text=Invalid email').count();
    expect(debouncedError).toBeGreaterThan(0);
  });

  test('Should handle file uploads efficiently', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to file upload step
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    
    const startTime = Date.now();
    
    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(1024 * 1024) // 1MB file
    });
    
    // Check for progress indicator
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    
    // Wait for upload completion
    await expect(page.locator('text=Upload complete')).toBeVisible();
    
    const uploadTime = Date.now() - startTime;
    expect(uploadTime).toBeLessThan(10000); // 10 seconds for 1MB file
  });

  test('Should optimize search performance', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'mock-admin-token');
      localStorage.setItem('user-role', 'admin');
    });
    
    await page.goto('/admin/applications');
    
    const searchInput = page.locator('[data-testid="search-input"]');
    
    const startTime = Date.now();
    
    // Type search query
    await searchInput.fill('John Doe');
    
    // Check for debounced search
    await page.waitForTimeout(100);
    const immediateResults = await page.locator('[data-testid="search-results"]').count();
    
    // Wait for debounced search
    await page.waitForTimeout(500);
    const debouncedResults = await page.locator('[data-testid="search-results"]').count();
    
    const searchTime = Date.now() - startTime;
    expect(searchTime).toBeLessThan(2000); // 2 seconds for search
    
    expect(debouncedResults).toBeGreaterThan(immediateResults);
  });

  test('Should handle memory usage efficiently', async ({ page }) => {
    await page.goto('/');
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    // Navigate through multiple pages
    await page.goto('/auth/signin');
    await page.goto('/auth/signup');
    await page.goto('/');
    
    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    // Memory should not increase dramatically
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(10000000); // 10MB increase limit
    }
  });

  test('Should optimize API response times', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'mock-student-token');
      localStorage.setItem('user-role', 'student');
    });
    
    // Monitor network requests
    const apiRequests = [];
    
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        apiRequests.push({
          url: response.url(),
          status: response.status(),
          timing: response.timing()
        });
      }
    });
    
    await page.goto('/student/dashboard');
    
    // Wait for all API calls to complete
    await page.waitForLoadState('networkidle');
    
    // Check API response times
    apiRequests.forEach(request => {
      expect(request.status).toBeLessThan(400);
      if (request.timing) {
        expect(request.timing.responseEnd - request.timing.requestStart).toBeLessThan(2000);
      }
    });
  });
});