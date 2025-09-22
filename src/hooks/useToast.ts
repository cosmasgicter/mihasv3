import { useState, useCallback } from 'react'

export interface Toast {
  id: string
  title?: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface UseToastReturn {
  toasts: Toast[]
  toast: {
    success: (message: string, options?: Partial<Toast>) => void
    error: (message: string, options?: Partial<Toast>) => void
    warning: (message: string, options?: Partial<Toast>) => void
    info: (message: string, options?: Partial<Toast>) => void
    custom: (toast: Omit<Toast, 'id'>) => void
  }
  dismiss: (id: string) => void
  dismissAll: () => void
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000
    }

    setToasts((prev) => [...prev, newToast])

    if (newToast.duration > 0) {
      setTimeout(() => {
        dismiss(id)
      }, newToast.duration)
    }
  }, [dismiss])

  const toast = {
    success: (message: string, options?: Partial<Toast>) =>
      addToast({ ...options, message, type: 'success' }),
    error: (message: string, options?: Partial<Toast>) =>
      addToast({ ...options, message, type: 'error', duration: options?.duration ?? 8000 }),
    warning: (message: string, options?: Partial<Toast>) =>
      addToast({ ...options, message, type: 'warning' }),
    info: (message: string, options?: Partial<Toast>) =>
      addToast({ ...options, message, type: 'info' }),
    custom: (toast: Omit<Toast, 'id'>) => addToast(toast)
  }

  return {
    toasts,
    toast,
    dismiss,
    dismissAll
  }
}