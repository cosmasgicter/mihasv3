// Feature: ui-overhaul-and-critical-fixes, Property 4: SSE maxRetries cap
/**
 * Property-based test: SSE maxRetries cap
 *
 * For any `maxRetries = N` (N ≥ 0), total reconnect-triggered `connect()`
 * calls never exceed N. The initial `connect()` call doesn't count toward
 * the retry cap — only reconnect-scheduled calls do.
 *
 * **Validates: Requirements 7.6**
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

describe('Property 4: SSE maxRetries cap', () => {
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
    'for any maxRetries = N (N ≥ 0), reconnect-triggered connect() calls never exceed N',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // maxRetries: 0..15 (reasonable range — keeps test fast)
          fc.integer({ min: 0, max: 15 }),
          async (maxRetries) => {
            // --- Setup ---
            MockEventSource.reset();
            mockFetch.mockReset();

            // HEAD probe returns 500 (non-auth error) so reconnects proceed
            mockFetch.mockResolvedValue({ status: 500 });

            const client = createSSEClient({
              endpoint: '/api/test',
              maxRetries,
              initialBackoff: 10,
              maxBackoff: 100,
              batteryFriendly: false,
            });

            // --- Act: initial connect (does NOT count toward retry cap) ---
            client.connect();
            expect(MockEventSource.instances.length).toBe(1);

            // Record the instance count after the initial connect
            const initialInstanceCount = 1;

            // Simulate error → probe → scheduleReconnect loop
            // We iterate more than maxRetries to ensure the cap holds
            for (let i = 0; i < maxRetries + 5; i++) {
              const currentEs =
                MockEventSource.instances[MockEventSource.instances.length - 1];
              if (!currentEs || currentEs.closed) break;

              // Trigger error on the current EventSource
              currentEs.simulateError();

              // Flush the async probe (microtask)
              await vi.advanceTimersByTimeAsync(0);

              // Advance timers to trigger the scheduled reconnect timeout
              // Use a generous amount to cover any backoff delay
              await vi.advanceTimersByTimeAsync(200);
            }

            // --- Assert ---
            // Total reconnect-triggered connections = total instances - 1 (initial)
            const reconnectConnections =
              MockEventSource.instances.length - initialInstanceCount;

            expect(reconnectConnections).toBeLessThanOrEqual(maxRetries);

            // Verify the client reports retries exhausted when maxRetries > 0
            // (for maxRetries = 0, the first error exhausts retries immediately)
            if (maxRetries >= 0) {
              expect(client.isRetriesExhausted()).toBe(true);
            }

            // Cleanup
            client.disconnect();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
