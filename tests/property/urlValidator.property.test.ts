/**
 * Property Tests for SSRF URL Validation — P25
 *
 * Feature: website-quality-remediation, Property 25: SSRF URL validation
 *
 * For any URL string provided as documentUrl to the extract endpoint, if the URL
 * scheme is not https, or the hostname resolves to a private IP range, or the
 * hostname is not in the allowed domains list, the API should reject the request
 * with HTTP 400 and error code INVALID_DOCUMENT_URL.
 *
 * **Validates: Requirements 26.1, 26.2**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { isAllowedUrl, isPrivateIP } from '../../lib/urlValidator';

let envBackup: Record<string, string | undefined>;

beforeEach(() => {
  envBackup = {
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN,
  };
  // Set a known R2 domain for deterministic tests
  process.env.R2_PUBLIC_URL = 'https://r2.mihas-storage.com';
  delete process.env.R2_PUBLIC_DOMAIN;
});

afterEach(() => {
  for (const [key, val] of Object.entries(envBackup)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
});

/** Arbitrary: random path segment */
const pathArb = fc.webPath();

/** Arbitrary: allowed domain */
const allowedDomainArb = fc.constantFrom(
  'apply.mihas.edu.zm',
  'r2.mihas-storage.com',
);

/** Arbitrary: non-allowed domain that is not a private IP */
const disallowedDomainArb = fc
  .domain()
  .filter(
    (d) =>
      d !== 'apply.mihas.edu.zm' &&
      d !== 'r2.mihas-storage.com' &&
      !isPrivateIP(d),
  );

/** Arbitrary: private IPv4 addresses */
const privateIPv4Arb = fc.oneof(
  // 127.x.x.x
  fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(([b, c, d]) => `127.${b}.${c}.${d}`),
  // 10.x.x.x
  fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(([b, c, d]) => `10.${b}.${c}.${d}`),
  // 172.16-31.x.x
  fc.tuple(fc.integer({ min: 16, max: 31 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(([b, c, d]) => `172.${b}.${c}.${d}`),
  // 192.168.x.x
  fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(([c, d]) => `192.168.${c}.${d}`),
  // 169.254.x.x
  fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(([c, d]) => `169.254.${c}.${d}`),
);

/** Arbitrary: private IPv6 addresses */
const privateIPv6Arb = fc.constantFrom('::1', 'fc00::1', 'fd00::1', 'fe80::1');

/** Arbitrary: non-HTTPS scheme */
const nonHttpsSchemeArb = fc.constantFrom('http', 'ftp', 'file', 'data', 'gopher');

describe('SSRF URL Validation Property Tests (P25)', () => {
  describe('P25.1: HTTPS URLs on allowed domains are accepted', () => {
    it('accepts any HTTPS URL with an allowed domain', () => {
      fc.assert(
        fc.property(allowedDomainArb, pathArb, (domain, path) => {
          const url = `https://${domain}${path}`;
          expect(isAllowedUrl(url)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P25.2: Non-HTTPS schemes are always rejected', () => {
    it('rejects URLs with non-HTTPS schemes even on allowed domains', () => {
      fc.assert(
        fc.property(nonHttpsSchemeArb, allowedDomainArb, pathArb, (scheme, domain, path) => {
          const url = `${scheme}://${domain}${path}`;
          expect(isAllowedUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P25.3: Private IPv4 addresses are always rejected', () => {
    it('identifies all private IPv4 ranges', () => {
      fc.assert(
        fc.property(privateIPv4Arb, (ip) => {
          expect(isPrivateIP(ip)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects HTTPS URLs pointing to private IPv4', () => {
      fc.assert(
        fc.property(privateIPv4Arb, pathArb, (ip, path) => {
          const url = `https://${ip}${path}`;
          expect(isAllowedUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P25.4: Private IPv6 addresses are always rejected', () => {
    it('identifies all private IPv6 addresses', () => {
      fc.assert(
        fc.property(privateIPv6Arb, (ip) => {
          expect(isPrivateIP(ip)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P25.5: Non-allowlisted domains are always rejected', () => {
    it('rejects HTTPS URLs on non-allowlisted domains', () => {
      fc.assert(
        fc.property(disallowedDomainArb, pathArb, (domain, path) => {
          const url = `https://${domain}${path}`;
          expect(isAllowedUrl(url)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('P25.6: Invalid URL strings are always rejected', () => {
    it('rejects arbitrary non-URL strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 200 }).filter((s) => {
            try {
              new URL(s);
              return false; // valid URL — skip
            } catch {
              return true; // invalid URL — keep
            }
          }),
          (garbage) => {
            expect(isAllowedUrl(garbage)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
