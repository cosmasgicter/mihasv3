import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { secureTimeout } from '@/lib/secureExecution'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void
  showSuccess: (title: string, message?: string) => void
  showError: (title: string, message?: string, duration?: number) => void
  showWarning: (title: string, message?: string) => void
  showInfo: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2)}`
    const newToast = { ...toast, id }
    
    setToasts(prev => [...prev, newToast])
    
    secureTimeout(() => {
      removeToast(id)
    }, toast.duration || 5000)
  }, [removeToast])

  const showSuccess = useCallback((title: string, message?: string) => {
    showToast({ type: 'success', title, message })
  }, [showToast])

  const showError = useCallback((title: string, message?: string, duration?: number) => {
    showToast({ type: 'error', title, message, duration: duration || 2000 })
  }, [showToast])

  const showWarning = useCallback((title: string, message?: string) => {
    showToast({ type: 'warning', title, message })
  }, [showToast])

  const showInfo = useCallback((title: string, message?: string) => {
    showToast({ type: 'info', title, message })
  }, [showToast])

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-5 w-5" />
      case 'error': return <XCircle className="h-5 w-5" />
      case 'warning': return <AlertTriangle className="h-5 w-5" />
      case 'info': return <Info className="h-5 w-5" />
    }
  }

  const getColors = (type: Toast['type']) => {
    switch (type) {
      case 'success': return 'bg-green-50 border-green-200 text-green-800'
      case 'error': return 'bg-red-50 border-red-200 text-red-800'
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800'
    }
  }

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className={`max-w-sm rounded-lg border p-4 shadow-lg ${getColors(toast.type)}`}
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  {getIcon(toast.type)}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium">{toast.title}</p>
                  {toast.message && (
                    <p className="mt-1 text-sm opacity-90">{toast.message}</p>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="ml-4 flex-shrink-0 opacity-70 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}