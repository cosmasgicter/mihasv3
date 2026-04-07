/**
 * useStudentNotifications Hook
 *
 * Provides a shared student notification store so the header bell and the
 * full notification settings page stay in sync.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/useRealtime'
import { notificationService } from '@/services/notifications'
import type { StudentNotification } from '@/types/notifications'

interface UseStudentNotificationsOptions {
  sseEnabled?: boolean
  pollingInterval?: number
  pollingEnabled?: boolean
}

/** Polling interval when SSE is connected (consistency fallback) */
const SSE_CONNECTED_POLLING_INTERVAL = 60000
/** Polling interval when SSE is disconnected (primary data source) */
const SSE_DISCONNECTED_POLLING_INTERVAL = 30000

const DEFAULT_OPTIONS: Required<UseStudentNotificationsOptions> = {
  sseEnabled: true,
  pollingInterval: SSE_DISCONNECTED_POLLING_INTERVAL,
  pollingEnabled: true,
}

interface SharedNotificationState {
  notifications: StudentNotification[]
  loading: boolean
  unreadCount: number
  isSSEConnected: boolean
  isPolling: boolean
  connectionError: string | null
  lastLoadedAt: string | null
}

const DEFAULT_STATE: SharedNotificationState = {
  notifications: [],
  loading: false,
  unreadCount: 0,
  isSSEConnected: false,
  isPolling: false,
  connectionError: null,
  lastLoadedAt: null,
}

const listeners = new Set<(state: SharedNotificationState) => void>()

let sharedState: SharedNotificationState = { ...DEFAULT_STATE }
let activeUserId: string | null = null
let subscriberCount = 0
let pollingHandle: ReturnType<typeof setInterval> | null = null
let pollingIntervalMs = DEFAULT_OPTIONS.pollingInterval
let attachedVisibilityListeners = false
let inFlightLoad: Promise<void> | null = null

function cloneNotifications(notifications: StudentNotification[]) {
  return notifications.map(notification => ({ ...notification }))
}

function createSnapshot(): SharedNotificationState {
  return {
    ...sharedState,
    notifications: cloneNotifications(sharedState.notifications),
  }
}

function emitState() {
  const snapshot = createSnapshot()
  listeners.forEach(listener => listener(snapshot))
}

function updateState(
  updater:
    | Partial<SharedNotificationState>
    | ((previous: SharedNotificationState) => SharedNotificationState)
) {
  sharedState =
    typeof updater === 'function'
      ? updater(sharedState)
      : { ...sharedState, ...updater }
  emitState()
}

function resetState() {
  sharedState = { ...DEFAULT_STATE }
  emitState()
}

function countUnread(notifications: StudentNotification[]) {
  return notifications.filter(notification => !notification.read).length
}

type NotificationApiShape = Partial<{
  id: string
  title: string
  content: string
  message: string
  type: string
  read: boolean
  is_read: boolean
  action_url: string | null
  created_at: string
  read_at: string | null
}>

export function normalizeNotificationPayload(notification: NotificationApiShape): StudentNotification {
  return {
    id: notification.id ?? '',
    title: notification.title ?? '',
    content: notification.content ?? notification.message ?? '',
    type: (notification.type as StudentNotification['type']) || 'info',
    read: Boolean(notification.read ?? notification.is_read),
    action_url: notification.action_url ?? undefined,
    created_at: notification.created_at ?? '',
    read_at: notification.read_at ?? undefined,
  }
}

function applyNotifications(notifications: StudentNotification[]) {
  updateState(previous => ({
    ...previous,
    notifications,
    unreadCount: countUnread(notifications),
  }))
}

/**
 * Prepend a notification to the shared list, deduplicating by id.
 * If a notification with the same id already exists, skip the prepend.
 */
function prependNotification(notification: StudentNotification) {
  const exists = sharedState.notifications.some(n => n.id === notification.id)
  if (exists) return

  const updated = [notification, ...sharedState.notifications]
  updateState(previous => ({
    ...previous,
    notifications: updated,
    unreadCount: countUnread(updated),
  }))
}

async function loadNotificationsForUser(
  userId: string,
  options: { showLoading?: boolean } = {}
) {
  const { showLoading = true } = options

  if (!userId) {
    return
  }

  if (inFlightLoad) {
    return inFlightLoad
  }

  if (showLoading && !sharedState.loading) {
    updateState(previous => ({ ...previous, loading: true }))
  }

  inFlightLoad = (async () => {
    try {
      const data = await notificationService.list() as StudentNotification[] | null

      if (activeUserId !== userId) {
        return
      }

      const notifications = Array.isArray(data) ? data.map(normalizeNotificationPayload) : []

      updateState(previous => ({
        ...previous,
        notifications,
        unreadCount: countUnread(notifications),
        loading: false,
        connectionError: null,
        lastLoadedAt: new Date().toISOString(),
      }))
    } catch (error) {
      console.error('[useStudentNotifications] Error loading notifications:', error)

      if (activeUserId !== userId) {
        return
      }

      updateState(previous => ({
        ...previous,
        loading: false,
        connectionError:
          error instanceof Error
            ? error.message
            : 'Failed to load notifications',
      }))
    } finally {
      inFlightLoad = null
    }
  })()

  return inFlightLoad
}

function stopPolling() {
  if (pollingHandle) {
    clearInterval(pollingHandle)
    pollingHandle = null
  }

  if (sharedState.isPolling) {
    updateState(previous => ({
      ...previous,
      isPolling: false,
    }))
  }
}

function startPollingForUser(userId: string, intervalMs: number) {
  if (!userId) {
    return
  }

  if (
    pollingHandle &&
    activeUserId === userId &&
    pollingIntervalMs === intervalMs
  ) {
    if (!sharedState.isPolling) {
      updateState(previous => ({
        ...previous,
        isPolling: true,
      }))
    }
    return
  }

  stopPolling()
  pollingIntervalMs = intervalMs

  updateState(previous => ({
    ...previous,
    isPolling: true,
    isSSEConnected: false,
  }))

  void loadNotificationsForUser(userId, {
    showLoading: sharedState.lastLoadedAt === null,
  })

  pollingHandle = setInterval(() => {
    if (activeUserId === userId) {
      void loadNotificationsForUser(userId, { showLoading: false })
    }
  }, intervalMs)
}

function handleVisibilityRefresh() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return
  }

  if (activeUserId) {
    void loadNotificationsForUser(activeUserId, { showLoading: false })
  }
}

function attachVisibilityListeners() {
  if (attachedVisibilityListeners || typeof window === 'undefined') {
    return
  }

  window.addEventListener('focus', handleVisibilityRefresh)
  document.addEventListener('visibilitychange', handleVisibilityRefresh)
  attachedVisibilityListeners = true
}

function detachVisibilityListeners() {
  if (!attachedVisibilityListeners || typeof window === 'undefined') {
    return
  }

  window.removeEventListener('focus', handleVisibilityRefresh)
  document.removeEventListener('visibilitychange', handleVisibilityRefresh)
  attachedVisibilityListeners = false
}

export function useStudentNotifications(options: UseStudentNotificationsOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { user } = useAuth()
  const { subscribe, isConnected: sseConnected } = useRealtime({ enabled: opts.sseEnabled })
  const [state, setState] = useState<SharedNotificationState>(() => createSnapshot())
  const sseConnectedRef = useRef(sseConnected)
  sseConnectedRef.current = sseConnected

  // Subscribe to SSE notification events
  useEffect(() => {
    if (!opts.sseEnabled || !user?.id) return

    const unsubscribe = subscribe('notification', (data) => {
      // The SSE event payload contains notification fields — extract from
      // nested `payload` if present (RealtimeEventEnvelope shape), otherwise
      // treat the data itself as the notification payload.
      const raw = (data.payload && typeof data.payload === 'object')
        ? data.payload as Record<string, unknown>
        : data
      const notification = normalizeNotificationPayload(raw as NotificationApiShape)
      if (notification.id) {
        prependNotification(notification)
      }
    })

    return unsubscribe
  }, [subscribe, opts.sseEnabled, user?.id])

  // Sync SSE connection status into shared state and adjust polling interval
  useEffect(() => {
    if (!user?.id || !opts.pollingEnabled) return

    if (sseConnected) {
      // SSE is live — reduce polling to consistency fallback (60s)
      updateState(prev => ({ ...prev, isSSEConnected: true }))
      startPollingForUser(user.id, SSE_CONNECTED_POLLING_INTERVAL)
    } else {
      // SSE is down — poll at default rate (30s)
      updateState(prev => ({ ...prev, isSSEConnected: false }))
      startPollingForUser(user.id, SSE_DISCONNECTED_POLLING_INTERVAL)
    }
  }, [sseConnected, user?.id, opts.pollingEnabled])

  useEffect(() => {
    const handleSignedOut = () => {
      activeUserId = null
      stopPolling()
      detachVisibilityListeners()
      resetState()
    }

    const listener = (nextState: SharedNotificationState) => {
      setState(nextState)
    }

    listeners.add(listener)
    subscriberCount += 1
    listener(createSnapshot())
    if (typeof window !== 'undefined') {
      window.addEventListener('authSignedOut', handleSignedOut)
    }

    return () => {
      listeners.delete(listener)
      subscriberCount = Math.max(0, subscriberCount - 1)
      if (typeof window !== 'undefined') {
        window.removeEventListener('authSignedOut', handleSignedOut)
      }

      if (subscriberCount === 0) {
        stopPolling()
        detachVisibilityListeners()
        activeUserId = null
        resetState()
      }
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      if (activeUserId !== null) {
        activeUserId = null
        stopPolling()
        detachVisibilityListeners()
        resetState()
      }
      return
    }

    if (activeUserId !== user.id) {
      activeUserId = user.id
      stopPolling()
      resetState()
    }

    attachVisibilityListeners()

    // When SSE is enabled, the SSE connection status effect manages polling intervals
    if (opts.sseEnabled) return

    if (opts.pollingEnabled) {
      startPollingForUser(user.id, opts.pollingInterval)
      return
    }

    stopPolling()
    void loadNotificationsForUser(user.id, { showLoading: true })
  }, [opts.pollingEnabled, opts.pollingInterval, opts.sseEnabled, user?.id])

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user?.id) {
      return
    }

    const notification = sharedState.notifications.find(item => item.id === notificationId)
    if (!notification || notification.read) {
      return
    }

    const timestamp = new Date().toISOString()
    const previousNotifications = cloneNotifications(sharedState.notifications)
    const previousUnreadCount = sharedState.unreadCount

    applyNotifications(
      sharedState.notifications.map(item =>
        item.id === notificationId
          ? { ...item, read: true, read_at: timestamp }
          : item
      )
    )

    try {
      await notificationService.markRead(notificationId)
    } catch (error) {
      console.error('[useStudentNotifications] Failed to mark notification as read:', error)
      updateState(previous => ({
        ...previous,
        notifications: previousNotifications,
        unreadCount: previousUnreadCount,
      }))
      throw error
    }
  }, [user?.id])

  const markAllAsRead = useCallback(async () => {
    if (!user?.id || sharedState.unreadCount === 0) {
      return
    }

    const timestamp = new Date().toISOString()
    const previousNotifications = cloneNotifications(sharedState.notifications)
    const previousUnreadCount = sharedState.unreadCount

    applyNotifications(
      sharedState.notifications.map(notification => ({
        ...notification,
        read: true,
        read_at: timestamp,
      }))
    )

    try {
      await notificationService.markAllRead()
    } catch (error) {
      console.error('[useStudentNotifications] Failed to mark all notifications as read:', error)
      updateState(previous => ({
        ...previous,
        notifications: previousNotifications,
        unreadCount: previousUnreadCount,
      }))
      throw error
    }
  }, [user?.id])

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user?.id) {
      return
    }

    const previousNotifications = cloneNotifications(sharedState.notifications)
    const previousUnreadCount = sharedState.unreadCount

    applyNotifications(
      sharedState.notifications.filter(notification => notification.id !== notificationId)
    )

    try {
      await notificationService.delete(notificationId)
    } catch (error) {
      console.error('[useStudentNotifications] Error deleting notification:', error)
      updateState(previous => ({
        ...previous,
        notifications: previousNotifications,
        unreadCount: previousUnreadCount,
      }))
      throw error
    }
  }, [user?.id])

  const refresh = useCallback(async () => {
    if (!user?.id) {
      return
    }

    await loadNotificationsForUser(user.id, { showLoading: true })
  }, [user?.id])

  return {
    notifications: state.notifications,
    loading: state.loading,
    unreadCount: state.unreadCount,
    isSSEConnected: state.isSSEConnected,
    isPolling: state.isPolling,
    connectionError: state.connectionError,
    lastLoadedAt: state.lastLoadedAt,
    loadNotifications: refresh,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh,
  }
}

export default useStudentNotifications
