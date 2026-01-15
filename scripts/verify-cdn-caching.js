#!/usr/bin/env node

/**
 * CDN Caching Verification Script
 * 
 * Verifies that Cloudflare CDN caching is properly configured by:
 * - Checking Cache-Control headers
 * - Verifying X-Cache headers (HIT/MISS)
 * - Testing different asset types
 * - Validating cache TTLs
 */

import https from 'https';
import http from 'http';

const BASE_URL = process.env.VITE_APP_BASE_URL || '***REMOVED***';

// Test cases for different asset types
const TEST_CASES = [
  {
    name: 'HTML - Index Page',
    path: '/',
    expectedCacheControl: /max-age=0/,
    expectedMaxAge: 0,
    shouldCache: false,
  },
  {
    name: 'JavaScript Bundle',
    path: '/assets/index.js',
    expectedCacheControl: /max-age=31536000/,
    expectedMaxAge: 31536000,
    shouldCache: true,
    immutable: true,
  },
  {
    name: 'CSS Bundle',
    path: '/assets/index.css',
    expectedCacheControl: /max-age=31536000/,
    expectedMaxAge: 31536000,
    shouldCache: true,
    immutable: true,
  },
  {
    name: 'Favicon',
    path: '/favicon.ico',
    expectedCacheControl: /max-age=86400/,
    expectedMaxAge: 86400,
    shouldCache: true,
  },
  {
    name: 'Manifest',
    path: '/manifest.json',
    expectedCacheControl: /max-age=3600/,
    expectedMaxAge: 3600,
    shouldCache: true,
  },
  {
    name: 'Service Worker',
    path: '/sw.js',
    expectedCacheControl: /max-age=0/,
    expectedMaxAge: 0,
    shouldCache: false,
  },
  {
    name: 'Robots.txt',
    path: '/robots.txt',
    expectedCacheControl: /max-age=86400/,
    expectedMaxAge: 86400,
    shouldCache: true,
  },
  {
    name: 'Sitemap',
    path: '/sitemap.xml',
    expectedCacheControl: /max-age=3600/,
    expectedMaxAge: 3600,
    shouldCache: true,
  },
];

class CDNVerifier {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Fetch a URL and return headers
   */
  async fetchHeaders(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url, { method: 'HEAD' }, (res) => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Parse Cache-Control header
   */
  parseCacheControl(cacheControl) {
    if (!cacheControl) return {};

    const directives = {};
    cacheControl.split(',').forEach(directive => {
      const [key, value] = directive.trim().split('=');
      directives[key] = value ? parseInt(value) : true;
    });

    return directives;
  }

  /**
   * Verify a single test case
   */
  async verifyTestCase(testCase) {
    const result = {
      name: testCase.name,
      path: testCase.path,
      passed: false,
      issues: [],
      headers: {},
    };

    try {
      const response = await this.fetchHeaders(testCase.path);
      result.statusCode = response.statusCode;
      result.headers = response.headers;

      // Check status code
      if (response.statusCode !== 200 && response.statusCode !== 304) {
        result.issues.push(`Unexpected status code: ${response.statusCode}`);
      }

      // Check Cache-Control header
      const cacheControl = response.headers['cache-control'];
      if (!cacheControl) {
        result.issues.push('Missing Cache-Control header');
      } else {
        result.cacheControl = cacheControl;

        // Verify expected pattern
        if (!testCase.expectedCacheControl.test(cacheControl)) {
          result.issues.push(
            `Cache-Control mismatch. Expected: ${testCase.expectedCacheControl}, Got: ${cacheControl}`
          );
        }

        // Parse and verify max-age
        const directives = this.parseCacheControl(cacheControl);
        if (directives['max-age'] !== testCase.expectedMaxAge) {
          result.issues.push(
            `max-age mismatch. Expected: ${testCase.expectedMaxAge}, Got: ${directives['max-age']}`
          );
        }

        // Check immutable directive
        if (testCase.immutable && !directives.immutable) {
          result.issues.push('Missing immutable directive for long-lived asset');
        }
      }

      // Check X-Cache header (Cloudflare specific)
      const xCache = response.headers['cf-cache-status'];
      if (xCache) {
        result.cfCacheStatus = xCache;
        
        if (testCase.shouldCache && xCache === 'BYPASS') {
          result.issues.push('Asset should be cached but is bypassing CDN');
        }
      }

      // Check security headers
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
      ];

      securityHeaders.forEach(header => {
        if (!response.headers[header]) {
          result.issues.push(`Missing security header: ${header}`);
        }
      });

      result.passed = result.issues.length === 0;
      if (result.passed) {
        this.passed++;
      } else {
        this.failed++;
      }
    } catch (error) {
      result.issues.push(`Request failed: ${error.message}`);
      this.failed++;
    }

    this.results.push(result);
    return result;
  }

  /**
   * Run all test cases
   */
  async runTests() {
    console.log('\n' + '='.repeat(80));
    console.log('CDN CACHING VERIFICATION');
    console.log('='.repeat(80) + '\n');
    console.log(`Testing: ${this.baseUrl}\n`);

    for (const testCase of TEST_CASES) {
      process.stdout.write(`Testing ${testCase.name}... `);
      const result = await this.verifyTestCase(testCase);
      
      if (result.passed) {
        console.log('✅ PASS');
      } else {
        console.log('❌ FAIL');
      }
    }

    this.generateReport();
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(80) + '\n');

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${this.passed} ✅`);
    console.log(`Failed: ${this.failed} ❌`);
    console.log(`Success Rate: ${((this.passed / this.results.length) * 100).toFixed(1)}%\n`);

    // Failed tests details
    const failedTests = this.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('FAILED TESTS:\n');
      
      failedTests.forEach(result => {
        console.log(`❌ ${result.name} (${result.path})`);
        console.log(`   Status: ${result.statusCode || 'N/A'}`);
        if (result.cacheControl) {
          console.log(`   Cache-Control: ${result.cacheControl}`);
        }
        if (result.cfCacheStatus) {
          console.log(`   CF-Cache-Status: ${result.cfCacheStatus}`);
        }
        console.log('   Issues:');
        result.issues.forEach(issue => console.log(`     - ${issue}`));
        console.log('');
      });
    }

    // Passed tests summary
    const passedTests = this.results.filter(r => r.passed);
    if (passedTests.length > 0) {
      console.log('PASSED TESTS:\n');
      
      passedTests.forEach(result => {
        console.log(`✅ ${result.name}`);
        console.log(`   Cache-Control: ${result.cacheControl || 'N/A'}`);
        if (result.cfCacheStatus) {
          console.log(`   CF-Cache-Status: ${result.cfCacheStatus}`);
        }
      });
      console.log('');
    }

    // Recommendations
    console.log('RECOMMENDATIONS:\n');
    console.log('1. Verify _headers file is deployed to Cloudflare Pages');
    console.log('2. Check that asset filenames include content hashes');
    console.log('3. Monitor CF-Cache-Status headers for cache hit rates');
    console.log('4. Review failed tests and adjust cache configuration');
    console.log('5. Test again after making changes to verify fixes\n');

    console.log('='.repeat(80) + '\n');

    return {
      total: this.results.length,
      passed: this.passed,
      failed: this.failed,
      successRate: (this.passed / this.results.length) * 100,
    };
  }
}

// Run verification
const verifier = new CDNVerifier(BASE_URL);
verifier.runTests().then(() => {
  process.exit(verifier.failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});
