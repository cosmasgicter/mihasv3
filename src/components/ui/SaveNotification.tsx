import React, { useEffect, useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'

interface SaveNotificationProps {
  show: boolean
  type: 'success' | 'error' | 'info'
  message: string
  onClose: () => void
  duration?: number
}

export function SaveNotification({ 
  show, 
  type, 
  message, 
  onClose, 
  duration = 3000 
}: SaveNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setIsVisible(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onClose, 300) // Wait for animation to complete
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [show, duration, onClose])

  if (!show && !isVisible) return null

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Check className="h-5 w-5 text-accent" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />
      case 'info':
        return <AlertCircle className="h-5 w-5 text-primary" />
    }
  }

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-accent-foreground'
      case 'error':
        return 'bg-red-50 border-red-200 text-destructive-foreground'
      case 'info':
        return 'bg-blue-50 border-blue-200 text-primary-foreground'
    }
  }

  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    }`}>
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg ${getStyles()}`}>
        {getIcon()}
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={() => {
            setIsVisible(false)
            setTimeout(onClose, 300)
          }}
          className="ml-2 text-muted-foreground hover:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}