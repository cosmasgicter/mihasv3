/**
 * Application Wizard Analytics Hook
 * 
 * Analytics backend was removed during simplification.
 * This hook is kept as a no-op stub so existing callers don't break.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useAnalytics = (
  _userId: string | undefined,
  _applicationId: string | null,
  _currentStep: number,
  _stepName: string
) => {
  const trackFieldComplete = async (_fieldName: string) => {}
  const trackValidationError = async (_fieldName: string, _error: string) => {}

  return {
    trackFieldComplete,
    trackValidationError
  }
}
