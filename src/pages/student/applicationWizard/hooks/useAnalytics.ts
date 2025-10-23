import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface AnalyticsEvent {
  event_type: 'step_enter' | 'step_exit' | 'field_complete' | 'validation_error' | 'save_draft'
  step_number?: number
  step_name?: string
  event_data?: Record<string, any>
}

export const useAnalytics = (
  userId: string | undefined,
  applicationId: string | null,
  currentStep: number,
  stepName: string
) => {
  const stepStartTime = useRef<number>(Date.now())
  const previousStep = useRef<number>(currentStep)

  useEffect(() => {
    if (!userId) return

    const trackEvent = async (event: AnalyticsEvent) => {
      try {
        await supabase.from('application_analytics').insert({
          user_id: userId,
          application_id: applicationId,
          event_type: event.event_type,
          step_number: event.step_number ?? currentStep,
          step_name: event.step_name ?? stepName,
          event_data: event.event_data || {},
          time_spent_seconds: Math.floor((Date.now() - stepStartTime.current) / 1000)
        })
      } catch (error) {
        // Silently fail - analytics should not block user flow
      }
    }

    // Track step enter
    if (currentStep !== previousStep.current) {
      // Track exit from previous step
      trackEvent({
        event_type: 'step_exit',
        step_number: previousStep.current,
        step_name: stepName
      })

      // Track enter to new step
      trackEvent({
        event_type: 'step_enter',
        step_number: currentStep,
        step_name: stepName
      })

      stepStartTime.current = Date.now()
      previousStep.current = currentStep
    }

    // Track on unmount
    return () => {
      if (userId) {
        trackEvent({
          event_type: 'step_exit',
          step_number: currentStep,
          step_name: stepName
        }).catch(err => console.error('Cleanup tracking error:', err))
      }
    }
  }, [userId, applicationId, currentStep, stepName])

  const trackFieldComplete = async (fieldName: string) => {
    if (!userId) return
    try {
      await supabase.from('application_analytics').insert({
        user_id: userId,
        application_id: applicationId,
        event_type: 'field_complete',
        step_number: currentStep,
        step_name: stepName,
        event_data: { field: fieldName },
        time_spent_seconds: Math.floor((Date.now() - stepStartTime.current) / 1000)
      })
    } catch (error) {
      // Silently fail - analytics should not block user flow
    }
  }

  const trackValidationError = async (fieldName: string, error: string) => {
    if (!userId) return
    try {
      await supabase.from('application_analytics').insert({
        user_id: userId,
        application_id: applicationId,
        event_type: 'validation_error',
        step_number: currentStep,
        step_name: stepName,
        event_data: { field: fieldName, error },
        time_spent_seconds: Math.floor((Date.now() - stepStartTime.current) / 1000)
      })
    } catch (error) {
      // Silently fail - analytics should not block user flow
    }
  }

  return {
    trackFieldComplete,
    trackValidationError
  }
}
