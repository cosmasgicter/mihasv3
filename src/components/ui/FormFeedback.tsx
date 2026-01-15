/**
 * Form Feedback Component
 * Provides immediate feedback for form submissions
 * Shows loading, success, and error states within 100ms
 */

import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'

export type FormFeedbackStatus = 'idle' | 'loading' | 'success' | 'error' | 'warning'

interface FormFeedbackProps {
  status: FormFeedbackStatus
  message?: string
  details?: string[]
  className?: string
  onDismiss?: () => void
  autoHide?: boolean
  autoHideDuration?: number
}

export function FormFeedback({
  status,
  message,
  details,
  className,
  onDismiss,
  autoHide = false,
  autoHideDuration = 5000,
}: FormFeedbackProps) {
  const prefersReducedMotion = useReducedMotion()
  const [isVisible, setIsVisible] = React.useState(true)

  React.useEffect(() => {
    if (autoHide && (status === 'success' || status === 'error')) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        onDismiss?.()
      }, autoHideDuration)
      return () => clearTimeout(timer)
    }
  }, [autoHide, autoHideDuration, status, onDismiss])

  if (!isVisible || status === 'idle') return null

  const statusConfig = {
    loading: {
      icon: Loader2,
      iconClass: 'text-blue-600 animate-spin',
      bgClass: 'bg-blue-50 border-blue-200',
      textClass: 'text-blue-800',
    },
    success: {
      icon: CheckCircle,
      iconClass: 'text-green-600',
      bgClass: 'bg-green-50 border-green-200',
      textClass: 'text-green-800',
    },
    error: {
      icon: XCircle,
      iconClass: 'text-red-600',
      bgClass: 'bg-red-50 border-red-200',
      textClass: 'text-red-800',
    },
    warning: {
      icon: AlertCircle,
      iconClass: 'text-yellow-600',
      bgClass: 'bg-yellow-50 border-yellow-200',
      textClass: 'text-yellow-800',
    },
  }

  const config = statusConfig[status] || statusConfig.loading
  const Icon = config.icon

  const content = (
    <div
      className={cn(
        'flex items-start space-x-3 p-4 rounded-lg border',
        config.bgClass,
        className
      )}
      role="alert"
      aria-live={status === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.iconClass)} />
      <div className="flex-1 min-w-0">
        {message && (
          <p className={cn('text-sm font-medium', config.textClass)}>
            {message}
          </p>
        )}
        {details && details.length > 0 && (
          <ul className={cn('mt-2 text-sm space-y-1', config.textClass)}>
            {details.map((detail, index) => (
              <li key={index} className="flex items-start">
                <span className="mr-2">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && status !== 'loading' && (
        <button
          onClick={() => {
            setIsVisible(false)
            onDismiss()
          }}
          className={cn(
            'flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors duration-100',
            config.textClass
          )}
          aria-label="Dismiss"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  )

  if (prefersReducedMotion) {
    return content
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.1 }} // 100ms transition
      >
        {content}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Inline Form Feedback (for individual fields)
 */
interface InlineFormFeedbackProps {
  type: 'error' | 'success' | 'warning' | 'info'
  message: string
  className?: string
}

export function InlineFormFeedback({ type, message, className }: InlineFormFeedbackProps) {
  const prefersReducedMotion = useReducedMotion()

  const typeConfig = {
    error: {
      icon: XCircle,
      textClass: 'text-red-600',
    },
    success: {
      icon: CheckCircle,
      textClass: 'text-green-600',
    },
    warning: {
      icon: AlertCircle,
      textClass: 'text-yellow-600',
    },
    info: {
      icon: AlertCircle,
      textClass: 'text-blue-600',
    },
  }

  const config = typeConfig[type]
  const Icon = config.icon

  const content = (
    <div className={cn('flex items-start space-x-2 mt-1.5', className)} role="alert">
      <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', config.textClass)} />
      <p className={cn('text-sm', config.textClass)}>{message}</p>
    </div>
  )

  if (prefersReducedMotion) {
    return content
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.1 }} // 100ms transition
    >
      {content}
    </motion.div>
  )
}

/**
 * Form Submit Button with Loading State
 */
interface FormSubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  loadingText?: string
  children: React.ReactNode
}

export function FormSubmitButton({
  isLoading = false,
  loadingText = 'Submitting...',
  children,
  className,
  disabled,
  ...props
}: FormSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold',
        'bg-blue-600 text-white hover:bg-blue-700',
        'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-all duration-100',
        'active:scale-95',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  )
}

/**
 * Hook for managing form submission state
 */
export function useFormSubmission() {
  const [status, setStatus] = React.useState<FormFeedbackStatus>('idle')
  const [message, setMessage] = React.useState<string>('')
  const [details, setDetails] = React.useState<string[]>([])

  const startSubmission = React.useCallback(() => {
    setStatus('loading')
    setMessage('Submitting...')
    setDetails([])
  }, [])

  const setSuccess = React.useCallback((successMessage: string = 'Success!') => {
    setStatus('success')
    setMessage(successMessage)
    setDetails([])
  }, [])

  const setError = React.useCallback((errorMessage: string, errorDetails?: string[]) => {
    setStatus('error')
    setMessage(errorMessage)
    setDetails(errorDetails || [])
  }, [])

  const setWarning = React.useCallback((warningMessage: string, warningDetails?: string[]) => {
    setStatus('warning')
    setMessage(warningMessage)
    setDetails(warningDetails || [])
  }, [])

  const reset = React.useCallback(() => {
    setStatus('idle')
    setMessage('')
    setDetails([])
  }, [])

  return {
    status,
    message,
    details,
    startSubmission,
    setSuccess,
    setError,
    setWarning,
    reset,
  }
}
