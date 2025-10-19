import { apiClient } from './client'

const DEFAULT_SERVICE_WORKER_URL = '/service-worker.js'

export type PushSubscriptionPayload = {
  subscription: PushSubscriptionJSON
  userAgent?: string | null
}

export type DispatchPushPayload = {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

export const pushSubscriptionsService = {
  save: (payload: PushSubscriptionPayload) =>
    apiClient.request('/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  dispatch: (payload: DispatchPushPayload) =>
    apiClient.request('/push-subscriptions/dispatch', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
}

export interface RegisterPushSubscriptionOptions {
  vapidPublicKey?: string
  serviceWorkerUrl?: string
}

export interface RegisterPushSubscriptionResult {
  permission: NotificationPermission
  subscription: PushSubscription | null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export async function registerPushSubscription(
  options: RegisterPushSubscriptionOptions = {}
): Promise<RegisterPushSubscriptionResult> {
  if (typeof window === 'undefined') {
    return { permission: 'denied', subscription: null }
  }

  const { Notification: NotificationConstructor } = window
  const serviceWorkerApi = navigator.serviceWorker

  if (!NotificationConstructor || !serviceWorkerApi || !('PushManager' in window)) {
    return { permission: 'denied', subscription: null }
  }

  const permission = await NotificationConstructor.requestPermission()

  if (permission !== 'granted') {
    return { permission, subscription: null }
  }

  const vapidPublicKey = options.vapidPublicKey ?? import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    console.error('Push notifications: missing VAPID public key configuration')
    return { permission, subscription: null }
  }

  const serviceWorkerUrl = options.serviceWorkerUrl ?? DEFAULT_SERVICE_WORKER_URL

  try {
    let registration = await serviceWorkerApi.getRegistration(serviceWorkerUrl)

    if (!registration) {
      registration = await serviceWorkerApi.register(serviceWorkerUrl, { type: 'module' })
    }

    const readyRegistration = await serviceWorkerApi.ready

    let subscription = await readyRegistration.pushManager.getSubscription()

    if (!subscription) {
      subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      })
    }

    await pushSubscriptionsService.save({
      subscription: subscription.toJSON(),
      userAgent: window.navigator.userAgent
    })

    return { permission, subscription }
  } catch (error) {
    console.error('Push notifications: registration failed', error)
    return { permission, subscription: null }
  }
}
