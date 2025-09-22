import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { SessionWarning as SessionWarningType } from '@/lib/applicationSession'

interface SessionWarningProps {
  warning: SessionWarningType | null
  onExtend: () => Promise<void>
  onDismiss: () => void
}

export function SessionWarning({ warning, onExtend, onDismiss }: SessionWarningProps) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [extending, setExtending] = useState(false)

  useEffect(() => {
    if (!warning) return

    setTimeLeft(warning.timeRemaining)
    
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(interval)
          return 0
        }
        return prev - 1000
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [warning])

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleExtend = async () => {
    setExtending(true)
    try {
      await onExtend()
      onDismiss()
    } catch (error) {
      console.error('Failed to extend session:', error)
    } finally {
      setExtending(false)
    }
  }

  if (!warning) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center space-x-3 mb-4">
          {warning.type === 'timeout' ? (
            <Clock className="h-6 w-6 text-yellow-500" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-red-500" />
          )}
          <h3 className="text-lg font-semibold text-gray-900">
            Session {warning.type === 'timeout' ? 'Timeout Warning' : 'Expired'}
          </h3>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-3">{warning.message}</p>
          
          {timeLeft > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-yellow-800">
                  Time remaining:
                </span>
                <span className="text-lg font-mono font-bold text-yellow-900">
                  {formatTime(timeLeft)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          {warning.canExtend && (
            <Button
              onClick={handleExtend}
              disabled={extending}
              className="flex-1"
            >
              {extending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Extending...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Extend Session
                </>
              )}
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={onDismiss}
            className="flex-1"
          >
            {warning.canExtend ? 'Continue' : 'OK'}
          </Button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Your progress is automatically saved and will be preserved even if the session expires.
        </div>
      </div>
    </div>
  )
}