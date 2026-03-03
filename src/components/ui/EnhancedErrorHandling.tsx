import React from 'react'
import { AlertCircle, CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  type: ToastType
  title: string
  message?: string
  duration?: number
  onClose?: () => void
  actions?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }[]
  className?: string
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

const toastStyles = {
  success: {
    container: 'bg-green-50 border-green-200',
    icon: 'text-success',
    title: 'text-accent-foreground',
    message: 'text-accent'
  },
  error: {
    container: 'bg-red-50 border-red-200',
    icon: 'text-error',
    title: 'text-destructive-foreground',
    message: 'text-error'
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200',
    icon: 'text-warning',
    title: 'text-accent-foreground',
    message: 'text-yellow-700'
  },
  info: {
    container: 'bg-blue-50 border-blue-200',
    icon: 'text-primary',
    title: 'text-primary-foreground',
    message: 'text-primary'
  }
}

export function EnhancedToast({
  type,
  title,
  message,
  duration = 5000,
  onClose,
  actions,
  className
}: ToastProps) {
  const [isVisible, setIsVisible] = React.useState(true)
  const [isRemoving, setIsRemoving] = React.useState(false)
  
  const Icon = toastIcons[type]
  const styles = toastStyles[type]

  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose()
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [duration])

  const handleClose = () => {
    setIsRemoving(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 300) // Match transition duration
  }

  if (!isVisible) return null

  return (
    <div className={cn(
      'relative overflow-hidden rounded-lg border shadow-sm p-4',
      'transition-all duration-300 ease-in-out',
      'max-w-sm w-full',
      isRemoving ? 'opacity-0 scale-95 translate-x-full' : 'opacity-100 scale-100 translate-x-0',
      styles.container,
      className
    )}>
      <div className="flex items-start space-x-3">
        <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', styles.icon)} />
        
        <div className="flex-1 min-w-0">
          <h3 className={cn('text-sm font-medium', styles.title)}>
            {title}
          </h3>
          
          {message && (
            <p className={cn('text-sm mt-1', styles.message)}>
              {message}
            </p>
          )}
          
          {actions && actions.length > 0 && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 font-medium',
                    'rounded-lg transition-all duration-200 ease-in-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    'min-h-[44px] px-3 py-2 text-sm',
                    action.variant === 'primary' 
                      ? 'bg-primary text-white hover:bg-primary/90' 
                      : 'border-2 border-input bg-card text-foreground hover:bg-muted'
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {onClose && (
          <button
            onClick={handleClose}
            className={cn(
              'p-1 rounded-full hover:bg-black/5 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              'min-w-[32px] min-h-[32px] flex items-center justify-center',
              'touch-manipulation'
            )}
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Progress bar for timed toasts */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
          <div 
            className={cn(
              'h-full transition-all ease-linear',
              type === 'success' ? 'bg-success' :
              type === 'error' ? 'bg-error' :
              type === 'warning' ? 'bg-warning' : 'bg-primary'
            )}
            style={{
              animation: `shrink ${duration}ms linear forwards`
            }}
          />
        </div>
      )}
    </div>
  )
}

// Enhanced error messages with user-friendly translations
export function formatErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return translateTechnicalError(error)
  }
  
  if (error instanceof Error) {
    return translateTechnicalError(error.message)
  }
  
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as { message?: string; name?: string; code?: string; details?: string }
    
    // Supabase error format
    if (errorObj.message) {
      return translateTechnicalError(errorObj.message)
    }
    
    // Network error format
    if (errorObj.name === 'NetworkError') {
      return 'Please check your internet connection and try again.'
    }
    
    // Validation error format
    if (errorObj.code === 'VALIDATION_ERROR') {
      return errorObj.details || 'Please check your input and try again.'
    }
  }
  
  return 'An unexpected error occurred. Please try again.'
}

// Translate technical errors to user-friendly messages
function translateTechnicalError(message: string): string {
  const lowerMessage = message.toLowerCase()
  
  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return 'Please check your internet connection and try again.'
  }
  
  // Authentication errors
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('auth')) {
    return 'Please log in to continue.'
  }
  
  // File upload errors
  if (lowerMessage.includes('file') && lowerMessage.includes('size')) {
    return 'File too large. Please choose a smaller file.'
  }
  
  if (lowerMessage.includes('file') && lowerMessage.includes('type')) {
    return 'File type not supported. Please choose a different file.'
  }
  
  // Database errors
  if (lowerMessage.includes('duplicate') || lowerMessage.includes('unique')) {
    return 'This information already exists. Please use different details.'
  }
  
  if (lowerMessage.includes('foreign key') || lowerMessage.includes('reference')) {
    return 'Invalid reference. Please check your selection.'
  }
  
  // Validation errors
  if (lowerMessage.includes('required') || lowerMessage.includes('missing')) {
    return 'Please fill in all required fields.'
  }
  
  if (lowerMessage.includes('invalid') && lowerMessage.includes('email')) {
    return 'Please enter a valid email address.'
  }
  
  if (lowerMessage.includes('password')) {
    return 'Password does not meet requirements. Please try again.'
  }
  
  // Rate limiting
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return 'Too many requests. Please wait a moment and try again.'
  }
  
  // Server errors
  if (lowerMessage.includes('500') || lowerMessage.includes('internal server')) {
    return 'Server error. Please try again later.'
  }
  
  if (lowerMessage.includes('503') || lowerMessage.includes('service unavailable')) {
    return 'Service temporarily unavailable. Please try again later.'
  }
  
  // Timeout errors
  if (lowerMessage.includes('timeout')) {
    return 'Request timed out. Please check your connection and try again.'
  }
  
  // Permission errors
  if (lowerMessage.includes('permission') || lowerMessage.includes('forbidden')) {
    return 'You do not have permission to perform this action.'
  }
  
  // Generic fallback
  return message.length > 100 
    ? 'An error occurred. Please try again or contact support if the problem persists.'
    : message
}

// Inline form error component
export function FormError({ 
  message, 
  className 
}: { 
  message?: string
  className?: string 
}) {
  if (!message) return null
  
  return (
    <div className={cn(
      'flex items-center space-x-2 text-sm text-error mt-1',
      className
    )}>
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{formatErrorMessage(message)}</span>
    </div>
  )
}

// Form success message component
export function FormSuccess({ 
  message, 
  className 
}: { 
  message?: string
  className?: string 
}) {
  if (!message) return null
  
  return (
    <div className={cn(
      'flex items-center space-x-2 text-sm text-success mt-1',
      className
    )}>
      <CheckCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// Global error boundary component
export class EnhancedErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo)
    
    // Log error to analytics service
    if (typeof window !== 'undefined') {
      try {
        // Send error to logging service
        fetch('/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: error.message,
            stack: error.stack,
            errorInfo,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          })
        }).catch(() => {
          // Silently fail if logging fails
        })
      } catch {
        // Silently fail if logging fails
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error!} />
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <EnhancedToast
              type="error"
              title="Something went wrong"
              message="The application encountered an unexpected error. Please refresh the page and try again."
              duration={0}
              actions={[
                {
                  label: 'Refresh Page',
                  onClick: () => window.location.reload(),
                  variant: 'primary'
                },
                {
                  label: 'Go Home',
                  onClick: () => window.location.href = '/',
                  variant: 'secondary'
                }
              ]}
            />
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// CSS for progress bar animation
const progressBarStyles = `
@keyframes shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = progressBarStyles
  document.head.appendChild(styleSheet)
}
