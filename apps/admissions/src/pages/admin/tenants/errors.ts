/**
 * Surface backend collision/validation messages on the tenant onboarding UI.
 *
 * The apiClient enhances 4xx errors with a human-readable `message` plus an
 * optional stable `code` (e.g. `ASSET_INVALID`, `TEMPLATE_TOKEN_REJECTED`) and
 * DRF field errors. Tenant collision errors (slug/code/hostname already in use)
 * arrive as the serializer's `ValidationError` message, so we prefer the
 * specific message over a generic fallback.
 */

interface EnhancedApiError {
  message?: string
  code?: string
  status?: number
  fieldErrors?: Record<string, string>
}

export function tenantErrorMessage(error: unknown, fallback: string): string {
  const enhanced = error as EnhancedApiError | null
  if (enhanced?.fieldErrors && Object.keys(enhanced.fieldErrors).length > 0) {
    const parts = Object.values(enhanced.fieldErrors).filter(Boolean)
    if (parts.length > 0) return parts.join('; ')
  }
  const message = enhanced?.message?.trim()
  if (message && !/^api error:/i.test(message)) {
    return message
  }
  return fallback
}

/** True when the error looks like a uniqueness/collision rejection. */
export function isCollisionError(error: unknown): boolean {
  const enhanced = error as EnhancedApiError | null
  const message = (enhanced?.message || '').toLowerCase()
  return (
    enhanced?.status === 409 ||
    message.includes('already in use') ||
    message.includes('already exists') ||
    message.includes('duplicate')
  )
}
