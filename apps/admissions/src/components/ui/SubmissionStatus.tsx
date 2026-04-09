import React from 'react'
import { CheckCircle, AlertCircle, Clock, RefreshCw, X } from 'lucide-react'
import { SubmissionStatus as Status } from '@/types/submission'
import { formatTimestamp } from '@/lib/dateFormat'

interface SubmissionStatusProps {
  status: Status
  onRetry?: () => void
  onCancel?: () => void
}

export const SubmissionStatus: React.FC<SubmissionStatusProps> = ({
  status,
  onRetry,
  onCancel
}) => {
  const getStatusIcon = () => {
    switch (status.status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-warning animate-pulse" />
      case 'processing':
        return <RefreshCw className="h-5 w-5 text-primary animate-pulse" />
      case 'retry':
        return <RefreshCw className="h-5 w-5 text-warning animate-pulse" />
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-error" />
      default:
        return <Clock className="h-5 w-5 text-foreground" />
    }
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'pending':
        return 'border-warning/30 bg-warning/5'
      case 'processing':
        return 'border-info/30 bg-info/5'
      case 'retry':
        return 'border-warning/30 bg-warning/5'
      case 'completed':
        return 'border-success/30 bg-success/5'
      case 'failed':
        return 'border-destructive/30 bg-destructive/5'
      default:
        return 'border-border bg-muted'
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <p className="font-medium text-foreground">{status.message}</p>
            {status.step && (
              <p className="text-sm text-foreground">Step: {status.step}</p>
            )}
            <p className="text-xs text-foreground">
              {formatTimestamp(status.timestamp)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {status.status === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-sm bg-primary text-foreground rounded hover:bg-primary"
            >
              Retry
            </button>
          )}
          {(status.status === 'processing' || status.status === 'retry') && onCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-foreground hover:text-foreground"
              aria-label="Cancel submission"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
