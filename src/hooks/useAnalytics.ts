import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AnalyticsService } from '@/lib/analytics'

export function useAnalytics() {
  const { user } = useAuth()
  const sessionId = useRef(Math.random().toString(36).substring(7))
  const pageStartTime = useRef(Date.now())

  const trackPageView = (pagePath: string) => {
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
    pageStartTime.current = Date.now()
  }

  const trackAction = (actionType: string, metadata?: Record<string, any>) => {
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
  }

  const trackFormStart = (formName: string) => {
    trackAction('form_start', { form_name: formName })
  }

  const trackFormSubmit = (formName: string, success: boolean) => {
    trackAction('form_submit', { 
      form_name: formName, 
      success,
      duration_seconds: Math.floor((Date.now() - pageStartTime.current) / 1000)
    })
  }

  const trackDocumentUpload = (documentType: string, success: boolean) => {
    trackAction('document_upload', { 
      document_type: documentType, 
      success 
    })
  }

  const trackEligibilityCheck = (passed: boolean, failureReason?: string) => {
    trackAction('eligibility_check', { 
      passed, 
      failure_reason: failureReason 
    })
  }

  useEffect(() => {
    // Track page view on mount
    trackPageView(window.location.pathname)

    // Track page duration on unmount
    return () => {
      const duration = Math.floor((Date.now() - pageStartTime.current) / 1000)
      AnalyticsService.trackEvent({
        user_id: user?.id,
        session_id: sessionId.current,
        page_path: window.location.pathname,
        action_type: 'page_duration',
        duration_seconds: duration
      })
    }
  }, [])

  return {
    trackPageView,
    trackAction,
    trackFormStart,
    trackFormSubmit,
    trackDocumentUpload,
    trackEligibilityCheck
  }
}