/**
 * Property Tests for Open Redirect Prevention — P26
 *
 * Feature: website-quality-remediation, Property 26: Open redirect prevention
 *
 * For any action_url string stored in a notification, if the URL is an absolute
 * URL whose origin does not match the application domain, the frontend should
 * not navigate to it, and the API should reject it during notification creation.
 *
 * **Validates: Requirements 27.1, 27.2, 27.3**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  isSafeNavigationUrl,
  isSafeActionUrl,
  APPLICATION_DOMAIN,
} from '../../src/lib/urlSafety';

const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, origin: `https://${APPLICATION_DOMAIN}` },
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

/** Arbitrary: valid relative path (starts with / but not //) */
const relativePathArb = fc
  .webPath()
  .map((p) => (p.startsWith('/') ? p : `/${p}`))
  .filter((p) => !p.startsWith('//'));

/** Arbitrary: foreign domain that is NOT the application domain */
const foreignDomainArb = fc
  .domain()
  .filter((d) => d !== APPLICATION_DOMAIN && !d.endsWith(`.${APPLICATION_DOMAIN}`));

/** Arbitrary: dangerous scheme */
const dangerousSchemeArb = fc.constantFrom(
  'javascript',
  'data',
  'vbscript',
  'ftp',
  'file',
  'gopher',
);

/** Arbitrary: protocol-relative URL */
const protocolRelativeArb = foreignDomainArb.chain((domain) =>
  fc.webPath().map((path) => `//${domain}${path}`),
);

describe('Open Redirect Prevention Property Tests (P26)', () => {
  describe('P26.1: Relative paths are always accepted', () => {
    it('isSafeNavigationUrl accepts any relative path starting with / (not //)', () => {
      fc.assert(
        fc.property(relativePathArb, (path) => {
          expect(isSafeNavigationUrl(path)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('isSafeActionUrl accepts any relative path starting with / (not //)', () => {
      fc.assert(
        fc.property(relativePathArb, (path) => {
          expect(isSafeActionUrl(path)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.2: Same-origin absolute URLs are accepted', () => {
    it('isSafeNavigationUrl accepts HTTPS URLs on the application domain', () => {
      fc.assert(
        fc.property(fc.webPath(), (path) => {
          const url = `https://${APPLICATION_DOMAIN}${path}`;
          expect(isSafeNavigationUrl(url)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('isSafeActionUrl accepts HTTPS URLs on the application domain', () => {
      fc.assert(
        fc.property(fc.webPath(), (path) => {
          const url = `https://${APPLICATION_DOMAIN}${path}`;
          expect(isSafeActionUrl(url)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.3: Cross-origin absolute URLs are always rejected', () => {
    it('isSafeNavigationUrl rejects HTTPS URLs on foreign domains', () => {
      fc.assert(
        fc.property(foreignDomainArb, fc.webPath(), (domain, path) => {
          const url = `https://${domain}${path}`;
          expect(isSafeNavigationUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('isSafeActionUrl rejects HTTPS URLs on foreign domains', () => {
      fc.assert(
        fc.property(foreignDomainArb, fc.webPath(), (domain, path) => {
          const url = `https://${domain}${path}`;
          expect(isSafeActionUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.4: Protocol-relative URLs are always rejected', () => {
    it('isSafeNavigationUrl rejects protocol-relative URLs', () => {
      fc.assert(
        fc.property(protocolRelativeArb, (url) => {
          expect(isSafeNavigationUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('isSafeActionUrl rejects protocol-relative URLs', () => {
      fc.assert(
        fc.property(protocolRelativeArb, (url) => {
          expect(isSafeActionUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.5: Dangerous schemes are always rejected', () => {
    it('isSafeNavigationUrl rejects dangerous scheme URLs', () => {
      fc.assert(
        fc.property(dangerousSchemeArb, fc.string({ minLength: 1, maxLength: 50 }), (scheme, payload) => {
          const url = `${scheme}:${payload}`;
          expect(isSafeNavigationUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('isSafeActionUrl rejects dangerous scheme URLs', () => {
      fc.assert(
        fc.property(dangerousSchemeArb, fc.string({ minLength: 1, maxLength: 50 }), (scheme, payload) => {
          const url = `${scheme}:${payload}`;
          expect(isSafeActionUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.6: HTTP URLs on the application domain are rejected by isSafeActionUrl', () => {
    it('rejects HTTP (non-HTTPS) URLs even on the correct domain', () => {
      fc.assert(
        fc.property(fc.webPath(), (path) => {
          const url = `http://${APPLICATION_DOMAIN}${path}`;
          expect(isSafeActionUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.7: Frontend and server-side agree on safe relative paths', () => {
    it('both functions agree that relative paths are safe', () => {
      fc.assert(
        fc.property(relativePathArb, (path) => {
          const navResult = isSafeNavigationUrl(path);
          const actionResult = isSafeActionUrl(path);
          expect(navResult).toBe(actionResult);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P26.8: Both functions reject empty/falsy inputs', () => {
    it('rejects empty and whitespace-only strings', () => {
      const whitespaceChars = [' ', '\t', '\n', '\r'];
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...whitespaceChars), { minLength: 0, maxLength: 20 }),
          (chars) => {
            const whitespace = chars.join('');
            expect(isSafeNavigationUrl(whitespace)).toBe(false);
            expect(isSafeActionUrl(whitespace)).toBe(false);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
