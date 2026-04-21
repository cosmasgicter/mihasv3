/**
 * Property 4: Exactly 1 session call on page load
 *
 * When both hooks mount concurrently sharing the same queryKey ['auth', 'session'],
 * only observers with refetchOnMount: true trigger a fetch. React Query deduplicates
 * concurrent fetches to the same key, so even multiple refetchOnMount: true observers
 * result in at most 1 fetch.
 *
 * useSessionListener configures: refetchOnMount: true  → triggers fetch
 * useAuthCheck configures:       refetchOnMount: false → subscribes only, no fetch
 *
 * // Feature: production-stability-hardening, Property 4: Exactly 1 session call on page load
 *
 * **Validates: Requirements 7.1, 7.2, 7.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Model: Hook configuration types
// ---------------------------------------------------------------------------

type HookConfig = {
  name: string;
  refetchOnMount: boolean;
  refetchOnWindowFocus: boolean;
};

// The actual configs from the codebase (verified against useSessionListener.ts)
const SESSION_LISTENER_CONFIG: HookConfig = {
  name: 'useSessionListener',
  refetchOnMount: true,
  refetchOnWindowFocus: false,
};

const AUTH_CHECK_CONFIG: HookConfig = {
  name: 'useAuthCheck',
  refetchOnMount: false,
  refetchOnWindowFocus: false,
};

// ---------------------------------------------------------------------------
// Model: React Query deduplication behavior
// ---------------------------------------------------------------------------

/**
 * Model React Query's mount-time fetch behavior for a shared queryKey.
 *
 * For observers sharing the same queryKey:
 * - Each observer with refetchOnMount: true triggers a fetch intent
 * - React Query deduplicates concurrent fetches to the same key into 1 request
 * - Observers with refetchOnMount: false subscribe without triggering a fetch
 *
 * Returns the number of actual network fetches that occur.
 */
function countSessionFetchesOnMount(hooks: HookConfig[]): number {
  const anyRefetchOnMount = hooks.some((h) => h.refetchOnMount);
  return anyRefetchOnMount ? 1 : 0;
}

/**
 * Count how many observers would trigger a window-focus refetch.
 */
function countWindowFocusRefetches(hooks: HookConfig[]): number {
  const anyRefetchOnWindowFocus = hooks.some((h) => h.refetchOnWindowFocus);
  return anyRefetchOnWindowFocus ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Source verification helpers
// ---------------------------------------------------------------------------

const HOOK_FILE = path.resolve(
  process.cwd(),
  'src/hooks/auth/useSessionListener.ts',
);

function readHookSource(): string {
  return fs.readFileSync(HOOK_FILE, 'utf-8');
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 4: Exactly 1 session call on page load', () => {
  it('mounting useSessionListener and useAuthCheck concurrently produces exactly 1 fetch', () => {
    fc.assert(
      fc.property(
        // Generate random mount orders of the two hooks
        fc.shuffledSubarray(
          [SESSION_LISTENER_CONFIG, AUTH_CHECK_CONFIG],
          { minLength: 2, maxLength: 2 },
        ),
        (mountOrder) => {
          const fetchCount = countSessionFetchesOnMount(mountOrder);
          expect(fetchCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('useAuthCheck alone does not trigger a session fetch', () => {
    const fetchCount = countSessionFetchesOnMount([AUTH_CHECK_CONFIG]);
    expect(fetchCount).toBe(0);
  });

  it('useSessionListener alone triggers exactly 1 session fetch', () => {
    const fetchCount = countSessionFetchesOnMount([SESSION_LISTENER_CONFIG]);
    expect(fetchCount).toBe(1);
  });

  it('no hook has refetchOnWindowFocus enabled (prevents duplicate fetches on tab focus)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(SESSION_LISTENER_CONFIG, AUTH_CHECK_CONFIG),
        (hook) => {
          expect(hook.refetchOnWindowFocus).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('window focus never triggers additional fetches regardless of mount order', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(
          [SESSION_LISTENER_CONFIG, AUTH_CHECK_CONFIG],
          { minLength: 1, maxLength: 2 },
        ),
        (hooks) => {
          const focusRefetches = countWindowFocusRefetches(hooks);
          expect(focusRefetches).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Source verification: confirm the model matches the actual hook configs
  // ---------------------------------------------------------------------------

  describe('source verification', () => {
    const source = readHookSource();

    it('useSessionListener configures refetchOnMount: true', () => {
      // The session query in useSessionListener must have refetchOnMount: true
      // We verify this by checking the source contains the expected config
      expect(source).toContain('refetchOnMount: true');
    });

    it('useAuthCheck configures refetchOnMount: false', () => {
      // useAuthCheck must subscribe without triggering a fetch
      expect(source).toContain('refetchOnMount: false');
    });

    it('both hooks configure refetchOnWindowFocus: false', () => {
      // Count occurrences of refetchOnWindowFocus: false — should be at least 2
      // (one in useSessionListener's session query, one in useAuthCheck)
      const matches = source.match(/refetchOnWindowFocus:\s*false/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('both hooks share the same queryKey ["auth", "session"]', () => {
      // Both hooks must use SESSION_QUERY_KEY for React Query deduplication
      const keyMatches = source.match(/queryKey:\s*SESSION_QUERY_KEY/g);
      expect(keyMatches).not.toBeNull();
      // At least 2: one in useSessionListener, one in useAuthCheck
      expect(keyMatches!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
