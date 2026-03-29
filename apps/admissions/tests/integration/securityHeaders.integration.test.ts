/**
 * Integration Tests: Security Headers
 * Feature: website-quality-remediation
 *
 * Verifies that vercel.json includes all required security headers
 * on the global route and that HSTS applies to all routes (not just API).
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

    it('should allow connect-src to self and Neon', () => {
      const csp = globalHeaders.headers.find(
        (h) => h.key === 'Content-Security-Policy'
      )!;
      expect(csp.value).toContain("connect-src 'self' https://*.neon.tech");
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

  describe('API route headers remain intact', () => {
    it('should still have an /api/(.*) header block', () => {
      const apiHeaders = vercelConfig.headers.find(
        (h) => h.source === '/api/(.*)'
      );
      expect(apiHeaders).toBeDefined();
    });

    it('should have X-Content-Type-Options on API routes', () => {
      const apiHeaders = vercelConfig.headers.find(
        (h) => h.source === '/api/(.*)'
      )!;
      const xcto = apiHeaders.headers.find(
        (h) => h.key === 'X-Content-Type-Options'
      );
      expect(xcto).toBeDefined();
      expect(xcto!.value).toBe('nosniff');
    });
  });
});
