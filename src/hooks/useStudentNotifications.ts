/**
 * useStudentNotifications Hook
 * 
 * Provides real-time notification updates for students using SSE with polling fallback.
 * 
 * @requirements
 * - 5.6: SSE wired to notification updates
 * - 5.10: Polling fallback when SSE is unavailable
 * 
 * Features:
 * - Real-time notifications via SSE
 * - Automatic polling fallback (30s interval)
 * - Graceful connection/disconnection handling
 * - Battery-friendly (disconnects when page hidden)
 * - Optimistic UI updates for read/delete actions
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createSSEClient, type SSEClient } from '@/lib/sseClient'
import type { StudentNotification } from '@/types/notifications'
import { 
  fetchNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  deleteNotification as apiDeleteNotification 
} from '@/lib/api/adminApi'

/**
 * SSE notification event data structure
 */
interface SSENotificationData {
  id: string
  title: string
  content: string
  type?: 'info' | 'success' | 'warning' | 'error'
  action_url?: string
  created_at: string
  action?: 'new' | 'update' | 'delete'
}

/**
 * Hook configuration options
 */
interface UseStudentNotificationsOptions {
  /** Enable SSE connection (default: true) */
  sseEnabled?: boolean
  /** Polling interval in ms when SSE fails (default: 30000) */
  pollingInterval?: number
  /** Enable polling fallback (default: true) */
  pollingEnabled?: boolean
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<UseStudentNotificationsOptions> = {
  sseEnabled: false, // SSE disabled - Vercel Hobby has 10s function timeout
  pollingInterval: 30000,
  pollingEnabled: true, // Polling uses notifications API which works
}

export function useStudentNotifications(options: UseStudentNotificationsOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { user } = useAuth()
  
  // State
  const [notifications, setNotifications] = useState<StudentNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isSSEConnected, setIsSSEConnected] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Refs for cleanup
  const sseClientRef = useRef<SSEClient | null>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const sseFailedRef = useRef(false)

  /**
   * Format notification from API or SSE response
   */
  const formatNotification = useCallback((notification: any): StudentNotification => ({
    id: notification.id,
    title: notification.title,
    content: notification.content,
    type: notification.type || 'info',
    read: notification.read || false,
    action_url: notification.action_url,
    created_at: notification.created_at,
    read_at: notification.read_at
  }), [])

  /**
   * Load notifications from API
   */
  const loadNotifications = useCallback(async () => {
    if (!user?.id || !mountedRef.current) return

    try {
      setLoading(true)
      const data = await fetchNotifications()
      
      if (!mountedRef.current) return
      
      const formattedNotifications = data.map(formatNotification)
      setNotifications(formattedNotifications)
      setUnreadCount(formattedNotifications.filter(n => !n.read).length)
    } catch (error) {
      console.error('[useStudentNotifications] Error loading notifications:', error)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [user?.id, formatNotification])

  /**
   * Handle incoming SSE notification event
   */
  const handleSSENotification = useCallback((data: SSENotificationData) => {
    if (!mountedRef.current) return

    console.log('[useStudentNotifications] SSE notification received:', data)

    // Handle different notification actions
    if (data.action === 'delete') {
      // Remove notification
      setNotifications(prev => {
        const notification = prev.find(n => n.id === data.id)
        if (notification && !notification.read) {
          setUnreadCount(count => Math.max(0, count - 1))
        }
        return prev.filter(n => n.id !== data.id)
      })
    } else if (data.action === 'update') {
      // Update existing notification
      setNotifications(prev => 
        prev.map(n => n.id === data.id ? formatNotification(data) : n)
      )
    } else {
      // New notification (default action)
      const newNotification = formatNotification(data)
      
      setNotifications(prev => {
        // Check if notification already exists (avoid duplicates)
        if (prev.some(n => n.id === newNotification.id)) {
          return prev.map(n => n.id === newNotification.id ? newNotification : n)
        }
        // Add new notification at the beginning
        return [newNotification, ...prev]
      })
      
      // Increment unread count for new notifications
      if (!newNotification.read) {
        setUnreadCount(count => count + 1)
      }
    }
  }, [formatNotification])

  /**
   * Start polling fallback
   */
  const startPolling = useCallback(() => {
    if (!opts.pollingEnabled || pollingIntervalRef.current) return

    console.log('[useStudentNotifications] Starting polling fallback')
    setIsPolling(true)

    // Initial load
    loadNotifications()

    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        loadNotifications()
      }
    }, opts.pollingInterval)
  }, [opts.pollingEnabled, opts.pollingInterval, loadNotifications])

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  /**
   * Initialize SSE connection
   */
  const initializeSSE = useCallback(() => {
    if (!opts.sseEnabled || !user?.id || sseClientRef.current) return

    console.log('[useStudentNotifications] Initializing SSE connection')

    const client = createSSEClient({
      endpoint: '/api/sessions?action=connect',
      maxRetries: 3,
      initialBackoff: 1000,
      maxBackoff: 30000,
      batteryFriendly: true,
      withCredentials: true,
      onConnect: () => {
        if (!mountedRef.current) return
        console.log('[useStudentNotifications] SSE connected')
        setIsSSEConnected(true)
        setConnectionError(null)
        sseFailedRef.current = false
        
        // Stop polling when SSE connects
        stopPolling()
        
        // Load initial notifications
        loadNotifications()
      },
      onDisconnect: () => {
        if (!mountedRef.current) return
        console.log('[useStudentNotifications] SSE disconnected')
        setIsSSEConnected(false)
      },
      onError: (error) => {
        if (!mountedRef.current) return
        console.error('[useStudentNotifications] SSE error:', error.message)
        setConnectionError(error.message)
        
        // If SSE fails after max retries, fall back to polling
        if (error.message.includes('Max reconnection attempts')) {
          console.log('[useStudentNotifications] SSE failed, falling back to polling')
          sseFailedRef.current = true
          startPolling()
        }
      },
    })

    sseClientRef.current = client

    // Subscribe to notification events
    const unsubscribe = client.subscribe<SSENotificationData>('notification', handleSSENotification)

    // Connect
    client.connect()

    // Return cleanup function
    return () => {
      unsubscribe()
      client.disconnect()
      sseClientRef.current = null
    }
  }, [opts.sseEnabled, user?.id, handleSSENotification, stopPolling, startPolling, loadNotifications])

  /**
   * Mark notification as read
   */
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user?.id) return

    const timestamp = new Date().toISOString()
    
    // Optimistic update
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId 
          ? { ...n, read: true, read_at: timestamp }
          : n
      )
    )
    setUnreadCount(prev => Math.max(0, prev - 1))

    try {
      const success = await markNotificationRead(notificationId)
      if (!success) throw new Error('Failed to mark as read')
    } catch (error) {
      // Revert optimistic update on failure
      console.error('[useStudentNotifications] Failed to mark notification as read:', error)
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, read: false, read_at: undefined }
            : n
        )
      )
      setUnreadCount(prev => prev + 1)
      throw error
    }
  }, [user?.id])

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return

    const timestamp = new Date().toISOString()
    const previousNotifications = [...notifications]
    const previousUnreadCount = unreadCount

    // Optimistic update
    setNotifications(prev => 
      prev.map(n => ({ ...n, read: true, read_at: timestamp }))
    )
    setUnreadCount(0)

    try {
      const success = await markAllNotificationsRead()
      if (!success) throw new Error('Failed to mark all as read')
    } catch (error) {
      // Revert optimistic update on failure
      console.error('[useStudentNotifications] Failed to mark all notifications as read:', error)
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      throw error
    }
  }, [user?.id, notifications, unreadCount])

  /**
   * Delete notification
   */
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user?.id) return

    const notification = notifications.find(n => n.id === notificationId)
    const previousNotifications = [...notifications]
    const previousUnreadCount = unreadCount

    // Optimistic update
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    if (notification && !notification.read) {
      setUnreadCount(prev => Math.max(0, prev - 1))
    }

    try {
      const success = await apiDeleteNotification(notificationId)
      if (!success) throw new Error('Failed to delete')
    } catch (error) {
      // Revert optimistic update on failure
      console.error('[useStudentNotifications] Error deleting notification:', error)
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      throw error
    }
  }, [user?.id, notifications, unreadCount])

  /**
   * Manually refresh notifications
   */
  const refresh = useCallback(() => {
    loadNotifications()
  }, [loadNotifications])

  // Initialize connection on mount
  useEffect(() => {
    mountedRef.current = true

    if (!user?.id) return

    // Try SSE first, fall back to polling if disabled or failed
    if (opts.sseEnabled && !sseFailedRef.current) {
      const cleanup = initializeSSE()
      return () => {
        mountedRef.current = false
        cleanup?.()
        stopPolling()
      }
    } else if (opts.pollingEnabled) {
      // SSE disabled or failed, use polling
      startPolling()
      return () => {
        mountedRef.current = false
        stopPolling()
      }
    }

    // Neither SSE nor polling enabled, just load once
    loadNotifications()

    return () => {
      mountedRef.current = false
    }
  }, [user?.id, opts.sseEnabled, opts.pollingEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (sseClientRef.current) {
        sseClientRef.current.disconnect()
        sseClientRef.current = null
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [])

  return {
    // Data
    notifications,
    loading,
    unreadCount,
    
    // Connection status
    isSSEConnected,
    isPolling,
    connectionError,
    
    // Actions
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh,
  }
}

export default useStudentNotifications
