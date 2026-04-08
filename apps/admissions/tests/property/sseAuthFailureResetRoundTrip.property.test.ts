// Feature: ui-overhaul-and-critical-fixes, Property 3: SSE auth failure reset round-trip
/**
 * Property-based test: SSE auth failure reset round-trip
 *
 * For any SSE client that has entered the auth-failed state, calling
 * `resetAuthFailure()` should set `authFailed = false` and allow a subsequent
 * `connect()` call to proceed (i.e., create a new EventSource). This is a
 * round-trip property: `authFail → resetAuthFailure → connect` should restore
 * the client to a connectable state.
 *
 * **Validates: Requirements 7.4**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// MockEventSource — mirrors the pattern from sseAuthFailureStopsReconnect
// ---------------------------------------------------------------------------
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(_type: string, _listener: EventListener) {}
  removeEventListener(_type: string, _listener: EventListener) {}

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  simulateError() {
    this.readyState = 2;
    this.onerror?.(new Event('error'));
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

// Install mocks before module import
vi.stubGlobal('EventSource', MockEventSource);
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createSSEClient } from '@/lib/sseClient';

describe('Property 3: SSE auth failure reset round-trip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.reset();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it(
    'for any maxRetries and auth-failure status (401|403), authFail → resetAuthFailure → connect restores the client to a connectable state',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // maxRetries: 0..20 (reasonable range)
          fc.integer({ min: 0, max: 20 }),
          // auth failure status: 401 or 403
          fc.constantFrom(401, 403),
          async (maxRetries, authStatus) => {
            // --- Setup ---
            MockEventSource.reset();
            mockFetch.mockReset();

            // The HEAD probe returns the auth-failure status
            mockFetch.mockResolvedValue({ status: authStatus });

            const client = createSSEClient({
              endpoint: '/api/test',
              maxRetries,
              initialBackoff: 10,
              batteryFriendly: false,
            });

            // --- Phase 1: Trigger auth failure ---
            client.connect();

            const es = MockEventSource.instances[MockEventSource.instances.length - 1];
            expect(es).toBeDefined();
            es!.simulateError();

            // Flush the fetch probe promise (microtask)
            await vi.advanceTimersByTimeAsync(0);

            // Verify auth failure state
            expect(client.isAuthFailed()).toBe(true);

            const instanceCountAfterAuthFailure = MockEventSource.instances.length;

            // --- Phase 2: Reset auth failure ---
            client.resetAuthFailure();

            // Verify auth failure state is cleared
            expect(client.isAuthFailed()).toBe(false);

            // --- Phase 3: Reconnect after reset ---
            // After reset, fetch probe should return a non-auth status
            mockFetch.mockResolvedValue({ status: 200 });

            client.connect();

            // A new EventSource should have been created
            expect(MockEventSource.instances.length).toBe(instanceCountAfterAuthFailure + 1);

            // The new EventSource should be targeting the same endpoint
            const newEs = MockEventSource.instances[MockEventSource.instances.length - 1];
            expect(newEs).toBeDefined();
            expect(newEs!.url).toBe('/api/test');
            expect(newEs!.closed).toBe(false);

            // Cleanup
            client.disconnect();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
