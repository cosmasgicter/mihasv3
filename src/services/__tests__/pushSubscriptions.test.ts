import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('../client', () => ({
  apiClient: {
    request: requestMock
  }
}))

declare global {
  interface Navigator {
    serviceWorker: ServiceWorkerContainer
  }
}

describe('registerPushSubscription', () => {
  let originalNavigator: Navigator
  let originalWindowNavigator: Navigator
  let originalNotification: typeof Notification | undefined
  let originalWindowNotification: typeof Notification | undefined
  let originalPushManager: typeof window.PushManager

  beforeEach(() => {
    vi.resetModules()
    requestMock.mockReset()

    originalNavigator = global.navigator as Navigator
    originalWindowNavigator = window.navigator
    originalNotification = global.Notification
    originalWindowNotification = window.Notification
    originalPushManager = window.PushManager

    const subscribeMock = vi.fn()
    const getSubscriptionMock = vi.fn()

    const pushManager = {
      subscribe: subscribeMock,
      getSubscription: getSubscriptionMock
    }

    const registerMock = vi.fn()
    const getRegistrationMock = vi.fn()

    const readyPromise = Promise.resolve({
      pushManager
    })

    const mockedNavigator = {
      ...originalNavigator,
      userAgent: 'vitest',
      serviceWorker: {
        register: registerMock,
        getRegistration: getRegistrationMock,
        ready: readyPromise
      }
    }

    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: mockedNavigator
    })

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: mockedNavigator
    })

    const notificationMock = {
      requestPermission: vi.fn().mockResolvedValue('granted')
    }

    Object.defineProperty(global, 'Notification', {
      configurable: true,
      value: notificationMock
    })

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: notificationMock
    })

    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {}
    })

    const existingAtob = window.atob
    if (!existingAtob) {
      Object.defineProperty(window, 'atob', {
        configurable: true,
        value: (input: string) => Buffer.from(input, 'base64').toString('binary')
      })
    }
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: originalNavigator
    })

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: originalWindowNavigator
    })

    if (originalNotification) {
      Object.defineProperty(global, 'Notification', {
        configurable: true,
        value: originalNotification
      })
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: originalWindowNotification
      })
    } else {
      delete (global as typeof globalThis & { Notification?: typeof Notification }).Notification
      delete (window as typeof window & { Notification?: typeof Notification }).Notification
    }

    if (originalPushManager) {
      Object.defineProperty(window, 'PushManager', {
        configurable: true,
        value: originalPushManager
      })
    } else {
      delete (window as typeof window & { PushManager?: typeof window.PushManager }).PushManager
    }
  })

  it('requests permission, registers the service worker and stores the subscription', async () => {
    const { registerPushSubscription } = await import('../pushSubscriptions')

    const serviceWorker = navigator.serviceWorker as unknown as {
      register: ReturnType<typeof vi.fn>
      getRegistration: ReturnType<typeof vi.fn>
      ready: Promise<{ pushManager: PushManager }>
    }

    const mockSubscription = {
      endpoint: 'https://example.com/subscription',
      toJSON: () => ({
        endpoint: 'https://example.com/subscription',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
      })
    } as unknown as PushSubscription

    ;(serviceWorker.getRegistration as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

    const pushManager = await serviceWorker.ready.then(reg => reg.pushManager as unknown as {
      subscribe: ReturnType<typeof vi.fn>
      getSubscription: ReturnType<typeof vi.fn>
    })

    pushManager.getSubscription.mockResolvedValueOnce(null)
    pushManager.subscribe.mockResolvedValueOnce(mockSubscription)

    requestMock.mockResolvedValue({ success: true })

    const result = await registerPushSubscription({ vapidPublicKey: 'BElxYS0_' })

    expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
    expect(serviceWorker.register).toHaveBeenCalledWith('/service-worker.js', { type: 'module' })
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)

    const subscribeOptions = pushManager.subscribe.mock.calls[0][0]
    expect(subscribeOptions.userVisibleOnly).toBe(true)
    expect(subscribeOptions.applicationServerKey).toBeInstanceOf(Uint8Array)

    expect(requestMock).toHaveBeenCalledWith('/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        subscription: mockSubscription.toJSON(),
        userAgent: 'vitest'
      })
    })

    expect(result.permission).toBe('granted')
    expect(result.subscription).toBe(mockSubscription)
  })

  it('reuses an existing subscription without creating a new one', async () => {
    const { registerPushSubscription } = await import('../pushSubscriptions')

    const serviceWorker = navigator.serviceWorker as unknown as {
      register: ReturnType<typeof vi.fn>
      getRegistration: ReturnType<typeof vi.fn>
      ready: Promise<{ pushManager: PushManager }>
    }

    const mockSubscription = {
      endpoint: 'https://example.com/subscription',
      toJSON: () => ({ endpoint: 'https://example.com/subscription', keys: {} })
    } as unknown as PushSubscription

    ;(serviceWorker.getRegistration as ReturnType<typeof vi.fn>).mockResolvedValueOnce({} as ServiceWorkerRegistration)

    const pushManager = await serviceWorker.ready.then(reg => reg.pushManager as unknown as {
      subscribe: ReturnType<typeof vi.fn>
      getSubscription: ReturnType<typeof vi.fn>
    })

    pushManager.getSubscription.mockResolvedValueOnce(mockSubscription)

    await registerPushSubscription({ vapidPublicKey: 'BElxYS0_' })

    expect(serviceWorker.register).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('stops when notification permission is denied', async () => {
    Object.defineProperty(global, 'Notification', {
      configurable: true,
      value: {
        requestPermission: vi.fn().mockResolvedValue('denied')
      }
    })

    const { registerPushSubscription } = await import('../pushSubscriptions')

    const result = await registerPushSubscription({ vapidPublicKey: 'BElxYS0_' })

    expect(result.subscription).toBeNull()
    expect(requestMock).not.toHaveBeenCalled()
  })
})
