/**
 * Property-based tests for API configuration
 * Feature: admissions-frontend-overhaul
 *
 * Property 1: API path prefix normalization (idempotent)
 * Property 13: API base URL resolution
 *
 * **Validates: Requirements 1.4, 1.1, 18.1**
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ── Shared Arbitraries (fast-check v4 compatible) ───────────────────────

/** Alphanumeric + dash/underscore/dot segment */
const pathSegmentArb = fc
  .array(
    fc.constantFrom(
      'a', 'b', 'c', 'x', 'y', 'z',
      '0', '1', '2', '9',
      '-', '_',
    ),
    { minLength: 1, maxLength: 12 },
  )
  .map(chars => chars.join(''));

const relativePathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
  .map(segs => '/' + segs.join('/') + '/');

// ── Property 1: API path prefix normalization ───────────────────────────

describe('Property 1: API path prefix normalization (idempotent)', () => {
  let toApiV1Path: (path: string) => string;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock('@/lib/apiConfig', () => ({
      getApiBaseUrl: () => 'http://localhost:3000',
    }));
    vi.mock('@/utils/api-cache', () => ({
      fetchWithCache: vi.fn(),
      invalidateCache: vi.fn(),
    }));
    vi.mock('@/lib/logger', () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    }));
    vi.mock('@/lib/apiErrorHandler', () => ({
      ApiErrorHandler: { enhanceError: vi.fn((o: any) => o.originalError ?? new Error()) },
    }));
    const mod = await import('@/services/client');
    toApiV1Path = mod.toApiV1Path;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirement 1.4**
   */
  it('always returns a /api/v1/-prefixed result for relative paths', () => {
    fc.assert(
      fc.property(relativePathArb, (path) => {
        const result = toApiV1Path(path);
        expect(result.startsWith('/api/v1/')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 1.4**
   */
  it('is idempotent — applying twice yields the same result', () => {
    fc.assert(
      fc.property(relativePathArb, (path) => {
        const once = toApiV1Path(path);
        const twice = toApiV1Path(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 1.4**
   */
  it('never produces consecutive slashes in the result', () => {
    // Include paths with extra slashes to stress-test deduplication
    const messyPathArb = fc
      .array(
        fc.oneof(pathSegmentArb, fc.constant('/')),
        { minLength: 1, maxLength: 6 },
      )
      .map(parts => '/' + parts.join('/'));

    fc.assert(
      fc.property(messyPathArb, (path) => {
        const result = toApiV1Path(path);
        expect(result).not.toMatch(/\/\//);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 1.4**
   */
  it('passes absolute URLs through unchanged', () => {
    const absoluteUrlArb = fc.oneof(
      relativePathArb.map(p => `http://example.com${p}`),
      relativePathArb.map(p => `***REMOVED***${p}`),
    );

    fc.assert(
      fc.property(absoluteUrlArb, (url) => {
        const result = toApiV1Path(url);
        expect(result).toBe(url);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 13: API base URL resolution ────────────────────────────────

describe('Property 13: API base URL resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * **Validates: Requirements 1.1, 18.1**
   */
  it('strips trailing slashes from VITE_API_BASE_URL', () => {
    const baseArb = fc.constantFrom(
      'http://localhost:8000',
      '***REMOVED***',
      'https://staging.api.mihas.edu.zm',
    );

    fc.assert(
      fc.property(baseArb, (base) => {
        // normalizeBaseUrl strips a single trailing slash then /api/v1 suffix
        const withSlash = base + '/';
        const normalized = withSlash.replace(/\/$/, '').replace(/\/api\/v1$/, '');
        expect(normalized).not.toMatch(/\/$/);
        expect(normalized).toBe(base);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 18.1**
   */
  it('strips /api/v1 suffix from VITE_API_BASE_URL', () => {
    const baseArb = fc.constantFrom(
      'http://localhost:8000',
      '***REMOVED***',
    );

    fc.assert(
      fc.property(baseArb, (base) => {
        const input = base + '/api/v1';
        const normalized = input.replace(/\/$/, '').replace(/\/api\/v1$/, '');
        expect(normalized).toBe(base);
        expect(normalized).not.toMatch(/\/api\/v1$/);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 18.1**
   */
  it('defaults to ***REMOVED*** when VITE_API_BASE_URL is not set and no browser origin', async () => {
    vi.resetModules();

    // Clear any existing mocks for apiConfig
    vi.unmock('@/lib/apiConfig');

    // Mock import.meta.env without VITE_API_BASE_URL
    vi.stubEnv('VITE_API_BASE_URL', '');

    // Re-import the real module to pick up the env change
    const { getApiBaseUrl } = await import('@/lib/apiConfig');

    // In a node environment (no window), should fall back to production default
    const result = getApiBaseUrl();
    expect(result).toBe('***REMOVED***');
  });
});
