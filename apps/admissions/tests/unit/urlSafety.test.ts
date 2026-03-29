/**
 * Unit Tests for URL Safety — Open Redirect Prevention
 *
 * Tests isSafeNavigationUrl() and isSafeActionUrl() from src/lib/urlSafety.ts
 *
 * Feature: website-quality-remediation, Requirement 27
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isSafeNavigationUrl, isSafeActionUrl, APPLICATION_DOMAIN } from '../../src/lib/urlSafety';

describe('isSafeNavigationUrl', () => {
  // jsdom provides window.location — set origin for deterministic tests
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, origin: 'https://apply.mihas.edu.zm' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  describe('relative paths', () => {
    it('allows simple relative paths', () => {
      expect(isSafeNavigationUrl('/dashboard')).toBe(true);
      expect(isSafeNavigationUrl('/applications/123')).toBe(true);
      expect(isSafeNavigationUrl('/admin/users')).toBe(true);
    });

    it('allows root path', () => {
      expect(isSafeNavigationUrl('/')).toBe(true);
    });

    it('allows paths with query strings', () => {
      expect(isSafeNavigationUrl('/search?q=test')).toBe(true);
    });

    it('allows paths with hash fragments', () => {
      expect(isSafeNavigationUrl('/page#section')).toBe(true);
    });
  });

  describe('protocol-relative URLs', () => {
    it('rejects protocol-relative URLs (//evil.com)', () => {
      expect(isSafeNavigationUrl('//evil.com/path')).toBe(false);
      expect(isSafeNavigationUrl('//attacker.com')).toBe(false);
    });
  });

  describe('same-origin absolute URLs', () => {
    it('allows same-origin HTTPS URLs', () => {
      expect(isSafeNavigationUrl('https://apply.mihas.edu.zm/dashboard')).toBe(true);
      expect(isSafeNavigationUrl('https://apply.mihas.edu.zm/')).toBe(true);
    });
  });

  describe('cross-origin absolute URLs', () => {
    it('rejects different-domain URLs', () => {
      expect(isSafeNavigationUrl('https://evil.com/steal')).toBe(false);
      expect(isSafeNavigationUrl('https://phishing.example.com')).toBe(false);
    });

    it('rejects HTTP URLs to same domain (different origin)', () => {
      expect(isSafeNavigationUrl('http://apply.mihas.edu.zm/dashboard')).toBe(false);
    });

    it('rejects subdomain variations', () => {
      expect(isSafeNavigationUrl('https://evil.apply.mihas.edu.zm/path')).toBe(false);
    });
  });

  describe('dangerous schemes', () => {
    it('rejects javascript: URLs', () => {
      expect(isSafeNavigationUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects data: URLs', () => {
      expect(isSafeNavigationUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('rejects vbscript: URLs', () => {
      expect(isSafeNavigationUrl('vbscript:MsgBox("XSS")')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('rejects empty string', () => {
      expect(isSafeNavigationUrl('')).toBe(false);
    });

    it('rejects whitespace-only string', () => {
      expect(isSafeNavigationUrl('   ')).toBe(false);
    });

    it('rejects null/undefined coerced to string', () => {
      expect(isSafeNavigationUrl(null as unknown as string)).toBe(false);
      expect(isSafeNavigationUrl(undefined as unknown as string)).toBe(false);
    });

    it('handles URLs with whitespace padding', () => {
      expect(isSafeNavigationUrl('  /dashboard  ')).toBe(true);
    });
  });
});

describe('isSafeActionUrl', () => {
  it('exports APPLICATION_DOMAIN constant', () => {
    expect(APPLICATION_DOMAIN).toBe('apply.mihas.edu.zm');
  });

  describe('relative paths', () => {
    it('allows simple relative paths', () => {
      expect(isSafeActionUrl('/applications/123')).toBe(true);
      expect(isSafeActionUrl('/dashboard')).toBe(true);
      expect(isSafeActionUrl('/')).toBe(true);
    });

    it('rejects protocol-relative URLs', () => {
      expect(isSafeActionUrl('//evil.com/path')).toBe(false);
    });
  });

  describe('absolute URLs', () => {
    it('allows HTTPS URLs on the application domain', () => {
      expect(isSafeActionUrl('https://apply.mihas.edu.zm/applications/123')).toBe(true);
      expect(isSafeActionUrl('https://apply.mihas.edu.zm/')).toBe(true);
    });

    it('rejects HTTP URLs on the application domain', () => {
      expect(isSafeActionUrl('http://apply.mihas.edu.zm/dashboard')).toBe(false);
    });

    it('rejects HTTPS URLs on different domains', () => {
      expect(isSafeActionUrl('https://evil.com/steal')).toBe(false);
      expect(isSafeActionUrl('https://google.com')).toBe(false);
    });

    it('rejects subdomain variations of the application domain', () => {
      expect(isSafeActionUrl('https://evil.apply.mihas.edu.zm/path')).toBe(false);
    });
  });

  describe('dangerous schemes', () => {
    it('rejects javascript: URLs', () => {
      expect(isSafeActionUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects data: URLs', () => {
      expect(isSafeActionUrl('data:text/html,<h1>XSS</h1>')).toBe(false);
    });

    it('rejects ftp: URLs', () => {
      expect(isSafeActionUrl('ftp://files.example.com/doc.pdf')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('rejects empty string', () => {
      expect(isSafeActionUrl('')).toBe(false);
    });

    it('rejects null/undefined', () => {
      expect(isSafeActionUrl(null as unknown as string)).toBe(false);
      expect(isSafeActionUrl(undefined as unknown as string)).toBe(false);
    });

    it('rejects random garbage strings', () => {
      expect(isSafeActionUrl('not-a-url')).toBe(false);
    });
  });
});
