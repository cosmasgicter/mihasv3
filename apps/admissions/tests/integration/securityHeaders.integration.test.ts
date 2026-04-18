/**
 * Integration Tests: Security Headers
 * Feature: website-quality-remediation
 *
 * Verifies that vercel.json includes the current monorepo security headers
 * on the global route and cache headers for static assets.
 *
 * **Validates: Requirement 5**
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface HeaderEntry {
  key: string;
  value: string;
}

interface HeaderBlock {
  source: string;
  headers: HeaderEntry[];
}

interface VercelConfig {
  headers: HeaderBlock[];
}

describe('Feature: website-quality-remediation, Security Headers (Req 5)', () => {
  let vercelConfig: VercelConfig;
  let globalHeaders: HeaderBlock;

  beforeAll(() => {
    vercelConfig = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
    );
    globalHeaders = vercelConfig.headers.find(
      (h) => h.source === '/(.*)'
    )!;
  });

  it('should have a global /(.*) header block', () => {
    expect(globalHeaders).toBeDefined();
    expect(globalHeaders.headers.length).toBeGreaterThan(0);
  });

  describe('Content-Security-Policy (Req 5.1)', () => {
    it('should include Content-Security-Policy in global headers', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      );
      expect(csp).toBeDefined();
    });

    it('should restrict default-src to self', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      )!;
      expect(csp.value).toContain("default-src 'self'");
    });

    it('should restrict script-src to self', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      )!;
      expect(csp.value).toContain("script-src 'self'");
    });

    it('should restrict frame-ancestors to none', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      )!;
      expect(csp.value).toContain("frame-ancestors 'none'");
    });

    it('should allow connect-src to the Django API and Neon', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      )!;
      expect(csp.value).toContain("connect-src 'self' ***REMOVED***");
      expect(csp.value).toContain('https://*.neon.tech');
    });

    it('should allow local blob workers and Tesseract language data fetches', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      )!;
      expect(csp.value).toContain("worker-src 'self' blob:");
      expect(csp.value).toContain("child-src 'self' blob:");
      expect(csp.value).toContain('https://cdn.jsdelivr.net');
    });
  });

  describe('Permissions-Policy (Req 5.2)', () => {
    it('should include Permissions-Policy in global headers', () => {
      const pp = globalHeaders.headers.find(
        (h) => h.key === 'Permissions-Policy'
      );
      expect(pp).toBeDefined();
    });

    it('should disable camera, microphone, geolocation, and payment', () => {
      const pp = globalHeaders.headers.find(
        (h) => h.key === 'Permissions-Policy'
      )!;
      expect(pp.value).toContain('camera=()');
      expect(pp.value).toContain('microphone=()');
      expect(pp.value).toContain('geolocation=()');
      expect(pp.value).toContain('payment=()');
    });
  });

  describe('Referrer-Policy (Req 5.3)', () => {
    it('should include Referrer-Policy set to strict-origin-when-cross-origin', () => {
      const rp = globalHeaders.headers.find(
        (h) => h.key === 'Referrer-Policy'
      );
      expect(rp).toBeDefined();
      expect(rp!.value).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Strict-Transport-Security on all routes (Req 5.4)', () => {
    it('should include HSTS in global headers', () => {
      const hsts = globalHeaders.headers.find(
        (h) => h.key === 'Strict-Transport-Security'
      );
      expect(hsts).toBeDefined();
      expect(hsts!.value).toContain('max-age=31536000');
      expect(hsts!.value).toContain('includeSubDomains');
    });
  });

  describe('X-Content-Type-Options and X-Frame-Options (Req 5.5)', () => {
    it('should include X-Content-Type-Options: nosniff in global headers', () => {
      const xcto = globalHeaders.headers.find(
        (h) => h.key === 'X-Content-Type-Options'
      );
      expect(xcto).toBeDefined();
      expect(xcto!.value).toBe('nosniff');
    });

    it('should include X-Frame-Options: DENY in global headers', () => {
      const xfo = globalHeaders.headers.find(
        (h) => h.key === 'X-Frame-Options'
      );
      expect(xfo).toBeDefined();
      expect(xfo!.value).toBe('DENY');
    });
  });

  describe('Static asset cache headers remain intact', () => {
    it('should have an /assets/(.*) header block', () => {
      const assetHeaders = vercelConfig.headers.find(
        (h) => h.source === '/assets/(.*)'
      );
      expect(assetHeaders).toBeDefined();
    });

    it('should cache static assets aggressively', () => {
      const assetHeaders = vercelConfig.headers.find(
        (h) => h.source === '/assets/(.*)'
      )!;
      const cacheControl = assetHeaders.headers.find(
        (h) => h.key === 'Cache-Control'
      );
      expect(cacheControl).toBeDefined();
      expect(cacheControl!.value).toContain('immutable');
      expect(cacheControl!.value).toContain('max-age=31536000');
    });
  });
});
