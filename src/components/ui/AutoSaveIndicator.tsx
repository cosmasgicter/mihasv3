import { useEffect, useState } from 'react'

interface AutoSaveIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt?: number | null
  className?: string
}

function AutoSaveIndicator({ status, lastSavedAt, className = '' }: AutoSaveIndicatorProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'saved') {
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 3000)
      return () => clearTimeout(timer)
    }
    setVisible(status !== 'idle')
  }, [status])

  // Screen reader text for all states (always rendered for aria-live)
  const srText =
    status === 'saving'
      ? 'Saving...'
      : status === 'saved'
        ? 'Saved'
        : status === 'error'
          ? 'Save failed'
          : ''

  return (
    <div
      aria-live="polite"
      role="status"
      className={`inline-flex items-center gap-1.5 text-sm ${className}`}
    >
      {/* Visual indicator */}
      {status === 'saving' && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
          Saving...
        </span>
      )}

      {status === 'saved' && (
        <span
          className={`inline-flex items-center gap-1.5 text-muted-foreground transition-opacity duration-slow ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <svg
            className="h-4 w-4 text-success"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Saved
        </span>
      )}

      {status === 'error' && (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          Save failed
        </span>
      )}

      {/* Hidden live region text for screen readers when visual is fading */}
      {status === 'idle' && <span className="sr-only">{srText}</span>}
    </div>
  )
}

export { AutoSaveIndicator }
export type { AutoSaveIndicatorProps }
