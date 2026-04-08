// Feature: ui-overhaul-and-critical-fixes, Property 2: SSE auth failure dispatches event to all handlers
/**
 * Property-based test: SSE auth failure dispatches event to all handlers
 *
 * For any N subscribed handlers (N ≥ 0), exactly N invocations occur on auth
 * failure, each receiving the HTTP status code.
 *
 * **Validates: Requirements 7.2**
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

describe('Property 2: SSE auth failure dispatches event to all handlers', () => {
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
    'for any N subscribed handlers and auth-failure status (401|403), exactly N handlers are invoked with the status code',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Number of handlers: 0..20
          fc.integer({ min: 0, max: 20 }),
          // Auth failure status: 401 or 403
          fc.constantFrom(401, 403),
          async (handlerCount, authStatus) => {
            // --- Setup ---
            MockEventSource.reset();
            mockFetch.mockReset();

            // The HEAD probe returns the auth-failure status
            mockFetch.mockResolvedValue({ status: authStatus });

            const client = createSSEClient({
              endpoint: '/api/test',
              maxRetries: 5,
              initialBackoff: 10,
              batteryFriendly: false,
            });

            // Subscribe N handlers to the auth_failure event
            const calls: unknown[] = [];
            const unsubscribers: (() => void)[] = [];

            for (let i = 0; i < handlerCount; i++) {
              const handler = vi.fn((data: unknown) => {
                calls.push(data);
              });
              unsubscribers.push(client.subscribe('auth_failure', handler));
            }

            // --- Act: connect and trigger an error ---
            client.connect();

            const es = MockEventSource.instances[MockEventSource.instances.length - 1];
            expect(es).toBeDefined();
            es!.simulateError();

            // Flush the fetch probe promise (microtask)
            await vi.advanceTimersByTimeAsync(0);

            // --- Assert ---
            // Exactly N handler invocations should have occurred
            expect(calls.length).toBe(handlerCount);

            // Each invocation should receive { status: authStatus }
            for (const call of calls) {
              expect(call).toEqual({ status: authStatus });
            }

            // Cleanup
            unsubscribers.forEach((unsub) => unsub());
            client.disconnect();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
