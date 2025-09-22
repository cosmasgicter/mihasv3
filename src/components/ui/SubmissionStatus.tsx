import React from 'react'
import { CheckCircle, AlertCircle, Clock, RefreshCw, X } from 'lucide-react'
import { SubmissionStatus as Status } from '@/types/submission'

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
        return <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />
      case 'processing':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
      case 'retry':
        return <RefreshCw className="h-5 w-5 text-orange-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'pending':
        return 'border-yellow-200 bg-yellow-50'
      case 'processing':
        return 'border-blue-200 bg-blue-50'
      case 'retry':
        return 'border-orange-200 bg-orange-50'
      case 'completed':
        return 'border-green-200 bg-green-50'
      case 'failed':
        return 'border-red-200 bg-red-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <p className="font-medium text-gray-900">{status.message}</p>
            {status.step && (
              <p className="text-sm text-gray-600">Step: {status.step}</p>
            )}
            <p className="text-xs text-gray-500">
              {new Date(status.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {status.status === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          )}
          {(status.status === 'processing' || status.status === 'retry') && onCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}