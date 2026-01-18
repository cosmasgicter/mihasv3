/**
 * useStudentDashboardRealtime Hook
 * 
 * Provides real-time subscription to Supabase Postgres Changes for student dashboard.
 * Automatically invalidates React Query cache when database changes occur.
 * 
 * @requirements 1.1, 1.2 - Dashboard real-time data refresh
 */

import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, dispatchRealtimeStatus } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface UseStudentDashboardRealtimeOptions {
  /** Whether to enable the subscription (default: true) */
  enabled?: boolean
  /** Callback when a change is received */
  onApplicationChange?: (payload: RealtimePostgresChangesPayload<any>) => void
  /** Callback when a notification is received */
  onNotificationChange?: (payload: RealtimePostgresChangesPayload<any>) => void
  /** Callback when subscription status changes */
  onStatusChange?: (status: string) => void
}

export interface UseStudentDashboardRealtimeReturn {
  /** Whether the subscription is currently active */
  isSubscribed: boolean
  /** Current subscription status */
  status: string
  /** Timestamp of last successful connection */
  lastConnectedAt: Date | null
  /** Manually reconnect the subscription */
  reconnect: () => void
}

// Query keys to invalidate on changes
// These must align with all query keys used across the application for application data
const APPLICATION_QUERY_KEYS = [
  ['applications'],
  ['applications', 'stats'],
  ['applications', 'recent-activity'],
  ['student-dashboard'],
  ['payment-status'],
  ['application-stats'],
  ['application_drafts'],        // Used by useApplicationDrafts hook
  ['applications-with-counts'],  // Used by useApplicationsWithCounts hook
  ['application_analytics']      // Used by useApplicationAnalytics hook
] as const

const NOTIFICATION_QUERY_KEYS = [
  ['notifications'],
  ['in-app-notifications']
] as const

/**
 * Hook for real-time student dashboard updates via Supabase Postgres Changes
 * 
 * Subscribes to:
 * - `applications` table filtered by user_id
 * - `in_app_notifications` table filtered by user_id
 * 
 * On any change, invalidates relevant React Query caches to trigger refetch.
 * 
 * @example
 * ```tsx
 * function StudentDashboard() {
 *   const { isSubscribed, status } = useStudentDashboardRealtime({
 *     onApplicationChange: (payload) => {
 *       console.log('Application changed:', payload.eventType)
 *     }
 *   })
 *   
 *   return (
 *     <div>
 *       {isSubscribed && <span>Live updates active</span>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useStudentDashboardRealtime(
  options: UseStudentDashboardRealtimeOptions = {}
): UseStudentDashboardRealtimeReturn {
  const { 
    enabled = true, 
    onApplicationChange, 
    onNotificationChange,
    onStatusChange 
  } = options
  
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  const channelRef = useRef<RealtimeChannel | null>(null)
  const statusRef = useRef<string>('CLOSED')
  const isSubscribedRef = useRef<boolean>(false)
  const lastConnectedAtRef = useRef<Date | null>(null)
  
  // Use refs to avoid stale closures in callbacks
  const onApplicationChangeRef = useRef(onApplicationChange)
  const onNotificationChangeRef = useRef(onNotificationChange)
  const onStatusChangeRef = useRef(onStatusChange)
  
  // Update refs when callbacks change
  useEffect(() => {
    onApplicationChangeRef.current = onApplicationChange
    onNotificationChangeRef.current = onNotificationChange
    onStatusChangeRef.current = onStatusChange
  }, [onApplicationChange, onNotificationChange, onStatusChange])

  /**
   * Invalidate all application-related queries
   * Includes both static query keys and user-specific keys
   */
  const invalidateApplicationQueries = useCallback(async () => {
    const invalidationPromises = APPLICATION_QUERY_KEYS.map(queryKey =>
      queryClient.invalidateQueries({
        queryKey: queryKey as readonly string[],
        refetchType: 'all'
      })
    )
    
    // Also invalidate user-specific query keys
    if (user?.id) {
      invalidationPromises.push(
        // User-specific applications query (used by dashboardPreloader)
        queryClient.invalidateQueries({
          queryKey: ['applications', user.id],
          refetchType: 'all'
        }),
        // User-specific drafts query
        queryClient.invalidateQueries({
          queryKey: ['application_drafts', user.id],
          refetchType: 'all'
        })
      )
    }
    
    await Promise.all(invalidationPromises)
  }, [queryClient, user?.id])

  /**
   * Invalidate all notification-related queries
   */
  const invalidateNotificationQueries = useCallback(async () => {
    const invalidationPromises = NOTIFICATION_QUERY_KEYS.map(queryKey =>
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
      console.log('[StudentDashboardRealtime] Application change received:', payload.eventType)
      
      // Invalidate queries to trigger refetch
      await invalidateApplicationQueries()
      
      // Dispatch custom event for components not using React Query
      window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: payload }))
      
      // Call user callback if provided
      onApplicationChangeRef.current?.(payload)
    },
    [invalidateApplicationQueries]
  )

  /**
   * Handle notification table changes
   */
  const handleNotificationChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[StudentDashboardRealtime] Notification change received:', payload.eventType)
      
      // Invalidate queries to trigger refetch
      await invalidateNotificationQueries()
      
      // Dispatch custom event for notification components
      window.dispatchEvent(new CustomEvent('notificationReceived', { detail: payload }))
      
      // Call user callback if provided
      onNotificationChangeRef.current?.(payload)
    },
    [invalidateNotificationQueries]
  )

  /**
   * Setup the realtime subscription
   */
  const setupSubscription = useCallback(() => {
    if (!user?.id) {
      console.log('[StudentDashboardRealtime] No user ID, skipping subscription')
      return
    }

    // Clean up existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    console.log('[StudentDashboardRealtime] Setting up subscription for user:', user.id)

    // Create a unique channel name for this user
    const channelName = `student-dashboard-${user.id}-${Date.now()}`
    
    const channel = supabase
      .channel(channelName)
      // Subscribe to applications table filtered by user_id
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'applications',
          filter: `user_id=eq.${user.id}`
        },
        handleApplicationChange
      )
      // Subscribe to in_app_notifications table filtered by user_id
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Only listen to new notifications
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${user.id}`
        },
        handleNotificationChange
      )
      .subscribe((status) => {
        console.log('[StudentDashboardRealtime] Subscription status:', status)
        statusRef.current = status
        isSubscribedRef.current = status === 'SUBSCRIBED'
        
        // Track last connected timestamp
        if (status === 'SUBSCRIBED') {
          lastConnectedAtRef.current = new Date()
        }
        
        onStatusChangeRef.current?.(status)
        
        // Dispatch status event for RealtimeStatusContext
        dispatchRealtimeStatus({
          connected: status === 'SUBSCRIBED',
          channelCount: status === 'SUBSCRIBED' ? 1 : 0,
          status,
          lastConnectedAt: lastConnectedAtRef.current
        })
        
        if (status === 'SUBSCRIBED') {
          console.log('[StudentDashboardRealtime] Realtime subscription active for student dashboard')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[StudentDashboardRealtime] Subscription error - realtime may not be enabled')
        } else if (status === 'TIMED_OUT') {
          console.warn('[StudentDashboardRealtime] Subscription timed out - will retry')
        }
      })

    channelRef.current = channel
  }, [user?.id, handleApplicationChange, handleNotificationChange])

  /**
   * Reconnect the subscription manually
   */
  const reconnect = useCallback(() => {
    console.log('[StudentDashboardRealtime] Manual reconnect requested')
    setupSubscription()
  }, [setupSubscription])

  // Setup subscription when user changes or enabled changes
  useEffect(() => {
    if (!enabled || !user?.id) {
      // Clean up if disabled or no user
      if (channelRef.current) {
        console.log('[StudentDashboardRealtime] Cleaning up subscription')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        isSubscribedRef.current = false
        statusRef.current = 'CLOSED'
      }
      return
    }

    setupSubscription()

    // Cleanup on unmount or when dependencies change
    return () => {
      if (channelRef.current) {
        console.log('[StudentDashboardRealtime] Cleaning up subscription on unmount')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        isSubscribedRef.current = false
        statusRef.current = 'CLOSED'
      }
    }
  }, [enabled, user?.id, setupSubscription])

  return {
    isSubscribed: isSubscribedRef.current,
    status: statusRef.current,
    lastConnectedAt: lastConnectedAtRef.current,
    reconnect
  }
}

export default useStudentDashboardRealtime
