import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AnalyticsService } from '@/lib/analytics'

/**
 * Deferred analytics hook that waits until the page is interactive
 * before making any analytics calls to improve LCP.
 * 
 * @requirements 5.7, 5.8, 9.2, 9.3 - Defer analytics queries until after LCP
 */
export function useAnalytics() {
  const { user } = useAuth()
  const sessionId = useRef(Math.random().toString(36).substring(7))
  const pageStartTime = useRef(Date.now())
  const isInitialized = useRef(false)
  const pendingEvents = useRef<Array<() => void>>([])

  // Queue an event to be sent after initialization
  const queueOrSendEvent = useCallback((sendFn: () => void) => {
    if (isInitialized.current) {
      sendFn()
    } else {
      pendingEvents.current.push(sendFn)
    }
  }, [])

  const trackPageView = useCallback((pagePath: string) => {
    queueOrSendEvent(() => {
      AnalyticsService.trackEvent({
        user_id: user?.id,
        session_id: sessionId.current,
        page_path: pagePath,
        action_type: 'page_view',
        metadata: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent
        }
      })
    })
    pageStartTime.current = Date.now()
  }, [user?.id, queueOrSendEvent])

  const trackAction = useCallback((actionType: string, metadata?: Record<string, any>) => {
    queueOrSendEvent(() => {
      AnalyticsService.trackEvent({
        user_id: user?.id,
        session_id: sessionId.current,
        page_path: window.location.pathname,
        action_type: actionType,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString()
        }
      })
    })
  }, [user?.id, queueOrSendEvent])

  const trackFormStart = useCallback((formName: string) => {
    trackAction('form_start', { form_name: formName })
  }, [trackAction])

  const trackFormSubmit = useCallback((formName: string, success: boolean) => {
    trackAction('form_submit', { 
      form_name: formName, 
      success,
      duration_seconds: Math.floor((Date.now() - pageStartTime.current) / 1000)
    })
  }, [trackAction])

  const trackDocumentUpload = useCallback((documentType: string, success: boolean) => {
    trackAction('document_upload', { 
      document_type: documentType, 
      success 
    })
  }, [trackAction])

  const trackEligibilityCheck = useCallback((passed: boolean, failureReason?: string) => {
    trackAction('eligibility_check', { 
      passed, 
      failure_reason: failureReason 
    })
  }, [trackAction])

  useEffect(() => {
    // Defer analytics initialization until after the page is interactive
    // This prevents analytics from blocking LCP
    const initializeAnalytics = () => {
      isInitialized.current = true
      
      // Track initial page view
      AnalyticsService.trackEvent({
        user_id: user?.id,
        session_id: sessionId.current,
        page_path: window.location.pathname,
        action_type: 'page_view',
        metadata: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          deferred: true
        }
      })
      
      // Flush any pending events
      pendingEvents.current.forEach(fn => fn())
      pendingEvents.current = []
    }

    // Use requestIdleCallback if available, otherwise setTimeout
    // This ensures analytics doesn't block the main thread during initial render
    let idleCallbackId: number | undefined
    let timeoutId: NodeJS.Timeout | undefined

    if ('requestIdleCallback' in window) {
      idleCallbackId = window.requestIdleCallback(initializeAnalytics, { timeout: 3000 })
    } else {
      // Fallback for browsers without requestIdleCallback
      timeoutId = setTimeout(initializeAnalytics, 100)
    }

    // Track page duration on unmount
    return () => {
      // Cancel pending initialization if component unmounts quickly
      if (idleCallbackId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleCallbackId)
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }

      // Only track duration if we were initialized
      if (isInitialized.current) {
        const duration = Math.floor((Date.now() - pageStartTime.current) / 1000)
        AnalyticsService.trackEvent({
          user_id: user?.id,
          session_id: sessionId.current,
          page_path: window.location.pathname,
          action_type: 'page_duration',
          duration_seconds: duration
        })
      }
    }
  }, [user?.id])

  return {
    trackPageView,
    trackAction,
    trackFormStart,
    trackFormSubmit,
    trackDocumentUpload,
    trackEligibilityCheck
  }
}