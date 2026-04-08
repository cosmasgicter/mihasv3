// Feature: ui-overhaul-and-critical-fixes, Property 1: SSE auth failure stops reconnect
/**
 * Property-based test: SSE auth failure stops reconnect
 *
 * For any SSE client with any maxRetries configuration, when the SSE endpoint
 * returns a 401 or 403 status code, the client sets authFailed = true and no
 * further reconnects are scheduled.
 *
 * **Validates: Requirements 7.1**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// MockEventSource — mirrors the pattern from sseClientLifecycle.test.ts
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

describe('Property 1: SSE auth failure stops reconnect', () => {
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
    'for any maxRetries and auth-failure status (401|403), authFailed becomes true and no further reconnects occur',
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

            // --- Act: connect and trigger an error ---
            client.connect();
            const instanceCountBeforeError = MockEventSource.instances.length;

            // Grab the latest EventSource and simulate an error
            const es = MockEventSource.instances[MockEventSource.instances.length - 1];
            es.simulateError();

            // Flush the fetch probe promise (microtask)
            await vi.advanceTimersByTimeAsync(0);

            // --- Assert: auth failure detected ---
            expect(client.isAuthFailed()).toBe(true);

            // Record how many EventSource instances exist right after auth failure
            const instanceCountAfterAuthFailure = MockEventSource.instances.length;

            // Advance timers generously — no new connections should be created
            await vi.advanceTimersByTimeAsync(60_000);

            // No new EventSource instances should have been created
            expect(MockEventSource.instances.length).toBe(instanceCountAfterAuthFailure);

            // Cleanup
            client.disconnect();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
