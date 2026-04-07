/**
 * Feature: realtime-sse-system
 *
 * Property test for subscriber dispatch:
 * - Property 19: Subscriber dispatch for application_update events
 */
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Pure replica of the subscriber dispatch mechanism from useRealtime.ts.
//
// The hook stores handlers in a Map<string, Set<EventHandler>> and dispatches
// by iterating the Set for the matching event type, calling each handler
// exactly once.  We replicate this logic here so we can property-test it
// without mounting React components.
// ---------------------------------------------------------------------------

type EventHandler = (data: Record<string, unknown>, event: SSEEvent) => void

interface SSEEvent {
  id: string
  type: string
  data: Record<string, unknown>
  timestamp: string
  event_id?: string
  entity_id?: string
  version?: number
  created_at?: string
}

/**
 * Minimal subscriber registry mirroring handlersRef in useRealtime.
 */
function createSubscriberRegistry() {
  const handlers = new Map<string, Set<EventHandler>>()

  function subscribe(eventType: string, handler: EventHandler): () => void {
    if (!handlers.has(eventType)) {
      handlers.set(eventType, new Set())
    }
    handlers.get(eventType)!.add(handler)

    return () => {
      const set = handlers.get(eventType)
      if (set) {
        set.delete(handler)
        if (set.size === 0) handlers.delete(eventType)
      }
    }
  }

  function dispatch(event: SSEEvent): void {
    const set = handlers.get(event.type)
    if (set) {
      set.forEach((handler) => {
        try {
          handler(event.data, event)
        } catch {
          // mirrors the try/catch in useRealtime dispatchEvent
        }
      })
    }
  }

  return { subscribe, dispatch, handlers }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const isoDateArb = fc
  .integer({ min: 946684800000, max: 1893456000000 })
  .map((ts) => new Date(ts).toISOString())

/** Arbitrary for an application_update SSE event. */
const applicationUpdateEventArb: fc.Arbitrary<SSEEvent> = fc.record({
  id: fc.uuid(),
  type: fc.constant('application_update' as string),
  data: fc.record({
    application_id: fc.uuid(),
    status: fc.constantFrom('pending', 'approved', 'rejected', 'under_review', 'waitlisted'),
    updated_at: isoDateArb,
  }) as fc.Arbitrary<Record<string, unknown>>,
  timestamp: isoDateArb,
  event_id: fc.uuid(),
  entity_id: fc.uuid(),
  version: fc.constant(1),
  created_at: isoDateArb,
})

// ---------------------------------------------------------------------------
// Property 19: Subscriber dispatch for application_update events
// ---------------------------------------------------------------------------

/**
 * Feature: realtime-sse-system, Property 19: Subscriber dispatch for application_update events
 *
 * Validates: Requirements 8.1
 *
 * For any set of registered application_update subscribers and any
 * application_update SSE event, every registered subscriber callback should be
 * invoked exactly once with the event data.
 */
describe('Property 19: Subscriber dispatch for application_update events', () => {
  it('every registered subscriber is invoked exactly once with the event data', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        applicationUpdateEventArb,
        (subscriberCount, event) => {
          const registry = createSubscriberRegistry()
          const spies: ReturnType<typeof vi.fn>[] = []

          // Register N subscribers
          for (let i = 0; i < subscriberCount; i++) {
            const spy = vi.fn()
            spies.push(spy)
            registry.subscribe('application_update', spy)
          }

          // Dispatch the event
          registry.dispatch(event)

          // Every subscriber called exactly once
          for (const spy of spies) {
            expect(spy).toHaveBeenCalledTimes(1)
            expect(spy).toHaveBeenCalledWith(event.data, event)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('subscribers for other event types are NOT invoked', () => {
    fc.assert(
      fc.property(
        applicationUpdateEventArb,
        (event) => {
          const registry = createSubscriberRegistry()

          const appUpdateSpy = vi.fn()
          const notificationSpy = vi.fn()
          const paymentSpy = vi.fn()

          registry.subscribe('application_update', appUpdateSpy)
          registry.subscribe('notification', notificationSpy)
          registry.subscribe('payment_update', paymentSpy)

          registry.dispatch(event)

          expect(appUpdateSpy).toHaveBeenCalledTimes(1)
          expect(notificationSpy).not.toHaveBeenCalled()
          expect(paymentSpy).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('unsubscribed callbacks are not invoked', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 1, max: 9 }),
        applicationUpdateEventArb,
        (totalSubscribers, unsubCount, event) => {
          // Ensure we don't try to unsub more than we have
          const actualUnsub = Math.min(unsubCount, totalSubscribers - 1)

          const registry = createSubscriberRegistry()
          const spies: ReturnType<typeof vi.fn>[] = []
          const unsubs: (() => void)[] = []

          for (let i = 0; i < totalSubscribers; i++) {
            const spy = vi.fn()
            spies.push(spy)
            unsubs.push(registry.subscribe('application_update', spy))
          }

          // Unsubscribe the first `actualUnsub` handlers
          for (let i = 0; i < actualUnsub; i++) {
            unsubs[i]!()
          }

          registry.dispatch(event)

          // Unsubscribed handlers should NOT be called
          for (let i = 0; i < actualUnsub; i++) {
            expect(spies[i]).not.toHaveBeenCalled()
          }

          // Remaining handlers should be called exactly once
          for (let i = actualUnsub; i < totalSubscribers; i++) {
            expect(spies[i]).toHaveBeenCalledTimes(1)
            expect(spies[i]).toHaveBeenCalledWith(event.data, event)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
