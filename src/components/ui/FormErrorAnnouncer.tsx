import React from 'react'

interface FormErrorAnnouncerProps {
  errors: Record<string, { message?: string } | undefined>
  fieldLabels?: Record<string, string>
}

/**
 * ARIA live region that announces form validation errors to screen readers.
 * Place this inside any form to make validation errors accessible.
 * 
 * Requirements: R24/AC-1
 */
export function FormErrorAnnouncer({ errors, fieldLabels = {} }: FormErrorAnnouncerProps) {
  const errorMessages = Object.entries(errors)
    .filter(([, err]) => err?.message)
    .map(([field, err]) => {
      const label = fieldLabels[field] || field.replace(/_/g, ' ')
      return `${label}: ${err!.message}`
    })

  if (errorMessages.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      role="status"
      className="sr-only"
    >
      {errorMessages.join('. ')}
    </div>
  )
}
