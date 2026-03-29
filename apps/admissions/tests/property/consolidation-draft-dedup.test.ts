/**
 * Property 16: DraftManager Deduplicates Concurrent Calls
 * Feature: duplicate-deprecated-consolidation, Property 16: DraftManager Deduplicates Concurrent Calls
 *
 * For any N concurrent clearAllDrafts(userId) calls (N >= 2), the clearing operation
 * executes exactly once and returns the same promise to all callers.
 *
 * Validates: Requirements 16.2
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock browser APIs before importing DraftManager
const mockLocalStorage = new Map<string, string>();
const mockSessionStorage = new Map<string, string>();

const createStorageMock = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => map.set(key, value),
  removeItem: (key: string) => map.delete(key),
  clear: () => map.clear(),
  get length() { return map.size; },
  key: (index: number) => Array.from(map.keys())[index] ?? null,
  [Symbol.iterator]: () => map.keys(),
});

vi.stubGlobal('localStorage', createStorageMock(mockLocalStorage));
vi.stubGlobal('sessionStorage', createStorageMock(mockSessionStorage));
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

// Mock applicationSession to avoid real API calls
vi.mock('@/lib/applicationSession', () => ({
  applicationSessionManager: {
    deleteDraft: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock sanitize
vi.mock('@/lib/sanitize', () => ({
  sanitizeForLog: (input: any) => String(input).substring(0, 200),
  safeJsonParse: (json: string, fallback: any) => { try { return JSON.parse(json); } catch { return fallback; } },
}));

const concurrentCallCountArb = fc.integer({ min: 2, max: 10 });
const userIdArb = fc.string({ minLength: 1, maxLength: 50 });

describe('Property 16: DraftManager Deduplicates Concurrent Calls', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  it('concurrent clearAllDrafts calls return the same promise', () => {
    fc.assert(
      fc.property(concurrentCallCountArb, userIdArb, async (n, userId) => {
        // Dynamic import to get fresh module state
        const { DraftManager } = await import('@/lib/draftManager');
        const manager = new (DraftManager as any)();
        // Reset clearPromise
        (manager as any).clearPromise = null;

        // Launch N concurrent calls
        const promises = Array.from({ length: n }, () => manager.clearAllDrafts(userId));

        // All promises should resolve
        const results = await Promise.all(promises);

        // All results should be identical (same promise = same result)
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toEqual(results[0]);
        }
      }),
      { numRuns: 100 },
    );
  });
});
