/**
 * Property-based test: SSE client never probes after authFailed
 *
 * **Validates: Requirements 2.5**
 *
 * Property 5 (Bug Condition): For any random sequence of SSE events where
 * at some point authFailed becomes true (via a 401/403 probe response),
 * all subsequent events result in zero additional HEAD probe calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// --- Mock EventSource ---
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
  dispatchEvent = vi.fn(() => true);

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateError() {
    this.readyState = 2;
    this.onerror?.(new Event('error'));
  }

  static reset() {
    MockEventSource.instances = [];
  }

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
}

vi.stubGlobal('EventSource', MockEventSource);

// --- Mock fetch ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createSSEClient } from '@/lib/sseClient';

/**
 * Event types for the property test generator:
 * - 'open': simulate EventSource open (connection established)
 * - 'error-auth': simulate onerror where probe returns 401 (sets authFailed)
 * - 'error-network': simulate onerror where probe returns 500 (normal reconnect)
 * - 'error-cooldown': simulate onerror where probe returns -1 (cooldown skip)
 */
type SSEEvent = 'open' | 'error-auth' | 'error-network' | 'error-cooldown';

const ENDPOINT = 'http://localhost/api/v1/events/stream/';

describe('[PBT] SSE client never probes after authFailed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.reset();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('after authFailed is set, zero subsequent HEAD probes are dispatched', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom<SSEEvent>('open', 'error-auth', 'error-network', 'error-cooldown'),
          { minLength: 2, maxLength: 12 },
        ).filter((seq) => seq.includes('error-auth')),
        async (events) => {
          // Fresh state per iteration
          MockEventSource.reset();
          mockFetch.mockReset();

          const client = createSSEClient({
            endpoint: ENDPOINT,
            batteryFriendly: false,
            initialBackoff: 1000,
            maxRetries: 50,
          });

          let authFailedSeen = false;
          let probesAfterAuthFailed = 0;

          // Track all HEAD fetch calls
          let totalFetchCalls = 0;

          for (const event of events) {
            // Configure fetch response for this event's probe
            if (event === 'error-auth') {
              mockFetch.mockResolvedValueOnce({ status: 401 });
            } else if (event === 'error-network') {
              mockFetch.mockResolvedValueOnce({ status: 500 });
            } else if (event === 'error-cooldown') {
              mockFetch.mockResolvedValueOnce({ status: 200 });
            }

            const fetchCountBefore = mockFetch.mock.calls.length;

            if (event === 'open') {
              // If not connected yet, connect first
              if (!client.isConnected() && !client.isAuthFailed()) {
                client.connect();
              }
              const es = MockEventSource.instances[MockEventSource.instances.length - 1];
              if (es) {
                es.simulateOpen();
              }
            } else {
              // error-auth, error-network, or error-cooldown
              // Ensure we have a connected EventSource to fire onerror on
              if (!client.isAuthFailed()) {
                if (MockEventSource.instances.length === 0 || !client.isConnected()) {
                  client.connect();
                  const es = MockEventSource.instances[MockEventSource.instances.length - 1];
                  if (es) {
                    es.simulateOpen();
                  }
                }
              }

              const es = MockEventSource.instances[MockEventSource.instances.length - 1];
              if (es) {
                es.simulateError();
              }

              // Flush the probe promise
              await vi.advanceTimersByTimeAsync(0);
            }

            const fetchCountAfter = mockFetch.mock.calls.length;
            const newCalls = fetchCountAfter - fetchCountBefore;

            if (authFailedSeen) {
              probesAfterAuthFailed += newCalls;
            }

            // Check if authFailed was just set
            if (client.isAuthFailed() && !authFailedSeen) {
              authFailedSeen = true;
            }

            // Advance time past probe cooldown (10s) so next event isn't blocked by cooldown
            await vi.advanceTimersByTimeAsync(11_000);
          }

          // Core assertion: after authFailed is set, zero probes dispatched
          expect(probesAfterAuthFailed).toBe(0);

          // Cleanup
          client.disconnect();
        },
      ),
      { numRuns: 50 },
    );
  });
});
