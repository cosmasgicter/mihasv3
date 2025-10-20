import React from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'

interface FormErrorProps {
  message?: string
  type?: 'error' | 'success'
}

export function FormError({ message, type = 'error' }: FormErrorProps) {
  if (!message) return null

  return (
    <div className={type === 'error' ? 'form-error' : 'form-success'} role="alert">
      {type === 'error' ? (
        <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  )
}
