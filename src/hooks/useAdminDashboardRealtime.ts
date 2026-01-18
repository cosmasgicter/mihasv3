/**
 * useAdminDashboardRealtime Hook
 * 
 * Provides real-time subscription to Supabase Postgres Changes for admin dashboard.
 * Subscribes to applications, payments, and application_status_history tables.
 * Automatically invalidates React Query cache when database changes occur.
 * Implements debouncing for rapid updates and polling fallback on subscription failure.
 * 
 * @requirements 2.1, 2.2, 2.4, 2.5 - Admin Dashboard Real-time Updates
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured, dispatchRealtimeStatus } from '@/lib/supabase'
import { useToastStore } from '@/components/ui/Toast'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface UseAdminDashboardRealtimeOptions {
  /** Whether to enable the subscription (default: true) */
  enabled?: boolean
  /** Debounce time in milliseconds for rapid updates (default: 500) */
  debounceMs?: number
  /** Polling interval in milliseconds when realtime fails (default: 30000) */
  pollingIntervalMs?: number
  /** Whether to show toast notifications for status changes (default: true) */
  showToasts?: boolean
  /** Callback when an application change is received */
  onApplicationChange?: (payload: RealtimePostgresChangesPayload<any>) => void
  /** Callback when a payment change is received */
  onPaymentChange?: (payload: RealtimePostgresChangesPayload<any>) => void
  /** Callback when a status history change is received */
  onStatusHistoryChange?: (payload: RealtimePostgresChangesPayload<any>) => void
  /** Callback when subscription status changes */
  onStatusChange?: (status: string) => void
}

export interface UseAdminDashboardRealtimeReturn {
  /** Whether the subscription is currently active */
  isSubscribed: boolean
  /** Current subscription status */
  status: string
  /** Whether polling fallback is active */
  isPolling: boolean
  /** Last error message if any */
  error: string | null
  /** Manually reconnect the subscription */
  reconnect: () => void
}

// Query keys to invalidate on application changes
const APPLICATION_QUERY_KEYS = [
  ['applications'],
  ['applications', 'list'],
  ['applications', 'stats'],
  ['applications', 'recent-activity'],
  ['application-stats'],
  ['admin-dashboard'],
  ['applications-with-counts']
] as const

// Query keys to invalidate on payment changes
const PAYMENT_QUERY_KEYS = [
  ['applications'],
  ['payment-status'],
  ['payment-stats'],
  ['payments']
] as const

// Query keys to invalidate on status history changes
const STATUS_HISTORY_QUERY_KEYS = [
  ['application-history'],
  ['application-status-history']
] as const

/**
 * Hook for real-time admin dashboard updates via Supabase Postgres Changes
 * 
 * Subscribes to:
 * - `applications` table (all changes)
 * - `payments` table for payment status
 * - `application_status_history` for audit
 * 
 * Features:
 * - Debouncing for rapid updates (500ms default)
 * - Polling fallback when realtime fails (30s default)
 * - Toast notifications for status changes
 * 
 * @example
 * ```tsx
 * function AdminDashboard() {
 *   const { isSubscribed, isPolling, status } = useAdminDashboardRealtime({
 *     onApplicationChange: (payload) => {
 *       console.log('Application changed:', payload.eventType)
 *     }
 *   })
 *   
 *   return (
 *     <div>
 *       {isSubscribed && <span>Live updates active</span>}
 *       {isPolling && <span>Polling mode (realtime unavailable)</span>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useAdminDashboardRealtime(
  options: UseAdminDashboardRealtimeOptions = {}
): UseAdminDashboardRealtimeReturn {
  const {
    enabled = true,
    debounceMs = 500,
    pollingIntervalMs = 30000,
    showToasts = true,
    onApplicationChange,
    onPaymentChange,
    onStatusHistoryChange,
    onStatusChange
  } = options

  const queryClient = useQueryClient()
  const toast = useToastStore()

  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastUpdateRef = useRef<Record<string, number>>({})
  
  const [status, setStatus] = useState<string>('CLOSED')
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false)
  const [isPolling, setIsPolling] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Use refs to avoid stale closures in callbacks
  const onApplicationChangeRef = useRef(onApplicationChange)
  const onPaymentChangeRef = useRef(onPaymentChange)
  const onStatusHistoryChangeRef = useRef(onStatusHistoryChange)
  const onStatusChangeRef = useRef(onStatusChange)

  // Update refs when callbacks change
  useEffect(() => {
    onApplicationChangeRef.current = onApplicationChange
    onPaymentChangeRef.current = onPaymentChange
    onStatusHistoryChangeRef.current = onStatusHistoryChange
    onStatusChangeRef.current = onStatusChange
  }, [onApplicationChange, onPaymentChange, onStatusHistoryChange, onStatusChange])

  /**
   * Check if update should be debounced
   */
  const shouldDebounce = useCallback((table: string): boolean => {
    const now = Date.now()
    const lastUpdate = lastUpdateRef.current[table] || 0
    
    if (now - lastUpdate < debounceMs) {
      return true
    }
    
    lastUpdateRef.current[table] = now
    return false
  }, [debounceMs])

  /**
   * Invalidate application-related queries
   */
  const invalidateApplicationQueries = useCallback(async () => {
    const invalidationPromises = APPLICATION_QUERY_KEYS.map(queryKey =>
      queryClient.invalidateQueries({
        queryKey: queryKey as readonly string[],
        refetchType: 'all'
      })
    )
    await Promise.all(invalidationPromises)
  }, [queryClient])

  /**
   * Invalidate payment-related queries
   */
  const invalidatePaymentQueries = useCallback(async () => {
    const invalidationPromises = PAYMENT_QUERY_KEYS.map(queryKey =>
      queryClient.invalidateQueries({
        queryKey: queryKey as readonly string[],
        refetchType: 'all'
      })
    )
    await Promise.all(invalidationPromises)
  }, [queryClient])

  /**
   * Invalidate status history queries
   */
  const invalidateStatusHistoryQueries = useCallback(async () => {
    const invalidationPromises = STATUS_HISTORY_QUERY_KEYS.map(queryKey =>
      queryClient.invalidateQueries({
        queryKey: queryKey as readonly string[],
        refetchType: 'all'
      })
    )
    await Promise.all(invalidationPromises)
  }, [queryClient])

  /**
   * Handle application table changes
   */
  const handleApplicationChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<any>) => {
      // Debounce rapid updates
      if (shouldDebounce('applications')) {
        return
      }

      console.log('[AdminDashboardRealtime] Application change received:', payload.eventType)

      // Invalidate queries to trigger refetch
      await invalidateApplicationQueries()

      // Dispatch custom event for components not using React Query
      window.dispatchEvent(new CustomEvent('adminApplicationUpdated', { detail: payload }))

      // Show toast for status changes
      if (showToasts && payload.eventType === 'UPDATE') {
        const newRow = payload.new as any
        const oldRow = payload.old as any
        
        if (newRow?.status !== oldRow?.status) {
          const appNumber = newRow?.application_number || 'Application'
          toast.info(`${appNumber} status changed to ${newRow?.status}`)
        }
      }

      // Call user callback if provided
      onApplicationChangeRef.current?.(payload)
    },
    [shouldDebounce, invalidateApplicationQueries, showToasts, toast]
  )

  /**
   * Handle payment table changes
   */
  const handlePaymentChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<any>) => {
      // Debounce rapid updates
      if (shouldDebounce('payments')) {
        return
      }

      console.log('[AdminDashboardRealtime] Payment change received:', payload.eventType)

      // Invalidate queries to trigger refetch
      await invalidatePaymentQueries()
      // Also invalidate applications since payment status affects them
      await invalidateApplicationQueries()

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('adminPaymentUpdated', { detail: payload }))

      // Show toast for payment verification
      if (showToasts && payload.eventType === 'UPDATE') {
        const newRow = payload.new as any
        const oldRow = payload.old as any
        
        if (newRow?.status !== oldRow?.status) {
          toast.info(`Payment status updated to ${newRow?.status}`)
        }
      }

      // Call user callback if provided
      onPaymentChangeRef.current?.(payload)
    },
    [shouldDebounce, invalidatePaymentQueries, invalidateApplicationQueries, showToasts, toast]
  )

  /**
   * Handle application status history changes
   */
  const handleStatusHistoryChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<any>) => {
      // Debounce rapid updates
      if (shouldDebounce('application_status_history')) {
        return
      }

      console.log('[AdminDashboardRealtime] Status history change received:', payload.eventType)

      // Invalidate queries to trigger refetch
      await invalidateStatusHistoryQueries()

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('adminStatusHistoryUpdated', { detail: payload }))

      // Call user callback if provided
      onStatusHistoryChangeRef.current?.(payload)
    },
    [shouldDebounce, invalidateStatusHistoryQueries]
  )

  /**
   * Start polling fallback when realtime fails
   * Requirements: 2.5 - Fall back to polling every 30 seconds
   */
  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    console.log('[AdminDashboardRealtime] Starting polling fallback')
    setIsPolling(true)

    pollingIntervalRef.current = setInterval(async () => {
      console.log('[AdminDashboardRealtime] Polling for updates...')
      await invalidateApplicationQueries()
      await invalidatePaymentQueries()
    }, pollingIntervalMs)
  }, [pollingIntervalMs, invalidateApplicationQueries, invalidatePaymentQueries])

  /**
   * Stop polling fallback
   */
  const stopPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  /**
   * Setup the realtime subscription
   */
  const setupSubscription = useCallback(() => {
    if (!isSupabaseConfigured) {
      console.log('[AdminDashboardRealtime] Supabase not configured, skipping subscription')
      setError('Supabase not configured')
      startPollingFallback()
      return
    }

    // Clean up existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    console.log('[AdminDashboardRealtime] Setting up subscription')

    // Create a unique channel name
    const channelName = `admin-dashboard-realtime-${Date.now()}`

    const channel = supabase
      .channel(channelName)
      // Subscribe to applications table (all changes)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'applications'
        },
        handleApplicationChange
      )
      // Subscribe to payments table for payment status
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments'
        },
        handlePaymentChange
      )
      // Subscribe to application_status_history for audit
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Only listen to new history entries
          schema: 'public',
          table: 'application_status_history'
        },
        handleStatusHistoryChange
      )
      .subscribe((subscriptionStatus) => {
        console.log('[AdminDashboardRealtime] Subscription status:', subscriptionStatus)
        setStatus(subscriptionStatus)
        onStatusChangeRef.current?.(subscriptionStatus)

        // Dispatch status event for RealtimeStatusContext
        dispatchRealtimeStatus({
          connected: subscriptionStatus === 'SUBSCRIBED',
          channelCount: subscriptionStatus === 'SUBSCRIBED' ? 1 : 0,
          status: subscriptionStatus
        })

        if (subscriptionStatus === 'SUBSCRIBED') {
          console.log('[AdminDashboardRealtime] Realtime subscription active for admin dashboard')
          setIsSubscribed(true)
          setError(null)
          stopPollingFallback() // Stop polling if it was active
        } else if (subscriptionStatus === 'CHANNEL_ERROR') {
          console.error('[AdminDashboardRealtime] Subscription error - falling back to polling')
          setIsSubscribed(false)
          setError('Realtime subscription error')
          startPollingFallback()
        } else if (subscriptionStatus === 'TIMED_OUT') {
          console.warn('[AdminDashboardRealtime] Subscription timed out - falling back to polling')
          setIsSubscribed(false)
          setError('Realtime subscription timed out')
          startPollingFallback()
        }
      })

    channelRef.current = channel
  }, [
    handleApplicationChange,
    handlePaymentChange,
    handleStatusHistoryChange,
    startPollingFallback,
    stopPollingFallback
  ])

  /**
   * Reconnect the subscription manually
   */
  const reconnect = useCallback(() => {
    console.log('[AdminDashboardRealtime] Manual reconnect requested')
    stopPollingFallback()
    setupSubscription()
  }, [setupSubscription, stopPollingFallback])

  // Setup subscription when enabled changes
  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (channelRef.current) {
        console.log('[AdminDashboardRealtime] Cleaning up subscription (disabled)')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        setIsSubscribed(false)
        setStatus('CLOSED')
      }
      stopPollingFallback()
      return
    }

    setupSubscription()

    // Cleanup on unmount or when dependencies change
    return () => {
      if (channelRef.current) {
        console.log('[AdminDashboardRealtime] Cleaning up subscription on unmount')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        setIsSubscribed(false)
        setStatus('CLOSED')
      }
      stopPollingFallback()
    }
  }, [enabled, setupSubscription, stopPollingFallback])

  return {
    isSubscribed,
    status,
    isPolling,
    error,
    reconnect
  }
}

export default useAdminDashboardRealtime
