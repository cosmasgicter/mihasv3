import { useCallback, useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

export interface WizardValidationError {
  /** The form field name (used to locate the input in the DOM) */
  field: string
  /** Human-readable label for the field */
  label: string
  /** The error message */
  message: string
}

interface WizardErrorSummaryProps {
  errors: WizardValidationError[]
  /** Called when the user clicks a field link in the summary */
  onFieldClick?: (field: string) => void
  className?: string
}

/**
 * Visible error summary displayed at the top of the wizard form when validation fails.
 * Lists all errors with clickable links that focus the corresponding field.
 * Moves keyboard focus to the summary container on mount for screen reader announcement.
 *
 * Requirements: 5.2, 5.3
 */
export function WizardErrorSummary({ errors, onFieldClick, className = '' }: WizardErrorSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null)

  // Focus the summary container when errors appear so screen readers announce it
  useEffect(() => {
    if (errors.length > 0 && summaryRef.current) {
      summaryRef.current.focus({ preventScroll: false })
    }
  }, [errors])

  const focusField = useCallback((field: string) => {
    onFieldClick?.(field)

    // Try to find the field by name attribute first, then by id
    const el =
      document.querySelector<HTMLElement>(`[name="${field}"]`) ||
      document.querySelector<HTMLElement>(`#${CSS.escape(field)}`)

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Small delay to let scroll finish before focusing
      setTimeout(() => el.focus({ preventScroll: true }), 100)
    }
  }, [onFieldClick])

  if (errors.length === 0) return null

  return (
    <div
      ref={summaryRef}
      role="alert"
      aria-label={`${errors.length} validation error${errors.length > 1 ? 's' : ''}`}
      tabIndex={-1}
      className={`mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-destructive">
            Please fix {errors.length} error{errors.length > 1 ? 's' : ''} to continue
          </h3>
          <ul className="mt-2 space-y-1">
            {errors.map((err) => (
              <li key={err.field}>
                <button
                  type="button"
                  onClick={() => focusField(err.field)}
                  className="text-sm text-destructive underline underline-offset-2 hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm text-left"
                >
                  {err.label}: {err.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
