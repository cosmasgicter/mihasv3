// @vitest-environment jsdom
/**
 * Unit tests for multi-tab auth broadcast module.
 *
 * Verifies:
 * - BroadcastChannel is used when available
 * - Storage event fallback works
 * - Event types are correctly dispatched and received
 * - The module exports the expected functions
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  initAuthBroadcast,
  destroyAuthBroadcast,
  broadcastLogout,
  broadcastLogin,
  broadcastCsrfUpdate,
  onAuthBroadcast,
  _isUsingBroadcastChannel,
  _getListenerCount,
  type AuthBroadcastMessage,
} from '@/lib/authBroadcast'

// ── Mock BroadcastChannel ───────────────────────────────────────────────────

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false
  posted: any[] = []

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: any) {
    this.posted.push(data)
    // Simulate delivery to other instances (other tabs)
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && !instance.closed && instance.onmessage) {
        instance.onmessage(new MessageEvent('message', { data }))
      }
    }
  }

  close() {
    this.closed = true
    MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter((i) => i !== this)
  }

  static reset() {
    MockBroadcastChannel.instances = []
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  MockBroadcastChannel.reset()
  destroyAuthBroadcast()
})

afterEach(() => {
  destroyAuthBroadcast()
  MockBroadcastChannel.reset()
  // Restore BroadcastChannel if we removed it
  if (!(globalThis as any).__bcBackup) return
  ;(globalThis as any).BroadcastChannel = (globalThis as any).__bcBackup
  delete (globalThis as any).__bcBackup
})

// ── 1. Exports ──────────────────────────────────────────────────────────────

describe('Module exports', () => {
  it('exports all expected functions', () => {
    expect(typeof initAuthBroadcast).toBe('function')
    expect(typeof destroyAuthBroadcast).toBe('function')
    expect(typeof broadcastLogout).toBe('function')
    expect(typeof broadcastLogin).toBe('function')
    expect(typeof broadcastCsrfUpdate).toBe('function')
    expect(typeof onAuthBroadcast).toBe('function')
  })
})

// ── 2. BroadcastChannel transport ───────────────────────────────────────────

describe('BroadcastChannel transport (Req 4.5)', () => {
  beforeEach(() => {
    // Install mock BroadcastChannel
    ;(globalThis as any).__bcBackup = (globalThis as any).BroadcastChannel
    ;(globalThis as any).BroadcastChannel = MockBroadcastChannel
  })

  it('uses BroadcastChannel when available', () => {
    initAuthBroadcast()
    expect(_isUsingBroadcastChannel()).toBe(true)
    expect(MockBroadcastChannel.instances.length).toBe(1)
  })

  it('init is idempotent — second call is a no-op', () => {
    initAuthBroadcast()
    initAuthBroadcast()
    // Only one BroadcastChannel instance should exist
    expect(MockBroadcastChannel.instances.length).toBe(1)
  })

  it('dispatches logout events to listeners', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    // Simulate receiving a message from another tab
    const instance = MockBroadcastChannel.instances[0]
    instance.onmessage!(
      new MessageEvent('message', {
        data: { type: 'logout', timestamp: 1000 } as AuthBroadcastMessage,
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('logout')
  })

  it('dispatches login events to listeners', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    const instance = MockBroadcastChannel.instances[0]
    instance.onmessage!(
      new MessageEvent('message', {
        data: { type: 'login', timestamp: 1000, userId: 'u1' } as AuthBroadcastMessage,
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('login')
    expect(received[0].userId).toBe('u1')
  })

  it('dispatches csrf-update events to listeners', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    const instance = MockBroadcastChannel.instances[0]
    instance.onmessage!(
      new MessageEvent('message', {
        data: { type: 'csrf-update', timestamp: 1000, csrfToken: 'tok123' } as AuthBroadcastMessage,
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('csrf-update')
    expect(received[0].csrfToken).toBe('tok123')
  })

  it('broadcastLogout posts a logout message', () => {
    initAuthBroadcast()
    broadcastLogout()
    const instance = MockBroadcastChannel.instances[0]
    expect(instance.posted).toHaveLength(1)
    expect(instance.posted[0].type).toBe('logout')
    expect(typeof instance.posted[0].timestamp).toBe('number')
  })

  it('broadcastLogin posts a login message with userId', () => {
    initAuthBroadcast()
    broadcastLogin('user-42')
    const instance = MockBroadcastChannel.instances[0]
    expect(instance.posted).toHaveLength(1)
    expect(instance.posted[0].type).toBe('login')
    expect(instance.posted[0].userId).toBe('user-42')
  })

  it('broadcastCsrfUpdate posts a csrf-update message', () => {
    initAuthBroadcast()
    broadcastCsrfUpdate('new-csrf-token')
    const instance = MockBroadcastChannel.instances[0]
    expect(instance.posted).toHaveLength(1)
    expect(instance.posted[0].type).toBe('csrf-update')
    expect(instance.posted[0].csrfToken).toBe('new-csrf-token')
  })

  it('destroy closes the channel and clears listeners', () => {
    initAuthBroadcast()
    onAuthBroadcast(() => {})
    expect(_getListenerCount()).toBe(1)

    destroyAuthBroadcast()
    expect(_isUsingBroadcastChannel()).toBe(false)
    expect(_getListenerCount()).toBe(0)
    expect(MockBroadcastChannel.instances.length).toBe(0)
  })

  it('unsubscribe removes only the specific listener', () => {
    initAuthBroadcast()
    const unsub1 = onAuthBroadcast(() => {})
    onAuthBroadcast(() => {})
    expect(_getListenerCount()).toBe(2)

    unsub1()
    expect(_getListenerCount()).toBe(1)
  })
})

// ── 3. Storage event fallback ───────────────────────────────────────────────

describe('Storage event fallback (Req 4.5)', () => {
  beforeEach(() => {
    // Remove BroadcastChannel to force storage fallback
    ;(globalThis as any).__bcBackup = (globalThis as any).BroadcastChannel
    delete (globalThis as any).BroadcastChannel
  })

  it('falls back to storage events when BroadcastChannel is unavailable', () => {
    initAuthBroadcast()
    expect(_isUsingBroadcastChannel()).toBe(false)
  })

  it('dispatches events received via storage event', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    // Simulate a storage event from another tab
    const message: AuthBroadcastMessage = { type: 'logout', timestamp: 2000 }
    const event = new StorageEvent('storage', {
      key: 'beanola-auth-event',
      newValue: JSON.stringify(message),
    })
    window.dispatchEvent(event)

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('logout')
  })

  it('ignores storage events for other keys', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    const event = new StorageEvent('storage', {
      key: 'some-other-key',
      newValue: JSON.stringify({ type: 'logout', timestamp: 3000 }),
    })
    window.dispatchEvent(event)

    expect(received).toHaveLength(0)
  })

  it('ignores storage events with null newValue', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    const event = new StorageEvent('storage', {
      key: 'beanola-auth-event',
      newValue: null,
    })
    window.dispatchEvent(event)

    expect(received).toHaveLength(0)
  })

  it('ignores malformed JSON in storage events', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    const event = new StorageEvent('storage', {
      key: 'beanola-auth-event',
      newValue: 'not-valid-json{{{',
    })
    window.dispatchEvent(event)

    expect(received).toHaveLength(0)
  })

  it('broadcastLogout writes to localStorage in fallback mode', () => {
    initAuthBroadcast()
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    broadcastLogout()

    expect(spy).toHaveBeenCalledWith(
      'beanola-auth-event',
      expect.stringContaining('"type":"logout"'),
    )
    spy.mockRestore()
  })

  it('destroy removes the storage event listener', () => {
    initAuthBroadcast()
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    destroyAuthBroadcast()

    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('accepts legacy storage events during namespace migration', () => {
    initAuthBroadcast()
    const received: AuthBroadcastMessage[] = []
    onAuthBroadcast((msg) => received.push(msg))

    const message: AuthBroadcastMessage = { type: 'logout', timestamp: 4000 }
    const event = new StorageEvent('storage', {
      key: 'mihas-auth-event',
      newValue: JSON.stringify(message),
    })
    window.dispatchEvent(event)

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('logout')
  })
})

// ── 4. Handler error isolation ──────────────────────────────────────────────

describe('Handler error isolation', () => {
  beforeEach(() => {
    ;(globalThis as any).__bcBackup = (globalThis as any).BroadcastChannel
    ;(globalThis as any).BroadcastChannel = MockBroadcastChannel
  })

  it('a throwing handler does not prevent other handlers from running', () => {
    initAuthBroadcast()
    const results: string[] = []

    onAuthBroadcast(() => {
      throw new Error('boom')
    })
    onAuthBroadcast((msg) => {
      results.push(msg.type)
    })

    const instance = MockBroadcastChannel.instances[0]
    instance.onmessage!(
      new MessageEvent('message', {
        data: { type: 'login', timestamp: 5000 } as AuthBroadcastMessage,
      }),
    )

    expect(results).toEqual(['login'])
  })
})
