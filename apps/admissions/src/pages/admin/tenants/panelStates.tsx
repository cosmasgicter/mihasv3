/**
 * Shared per-panel state surfaces for the authority-specific tenant panels
 * (enterprise-tenant-authority, task 13.2).
 *
 * The backend is the security boundary; these helpers make a panel render the
 * right *usability* state when the backend denies a read or write:
 *
 *   - On a backend **403** the panel shows a precise authorization message and
 *     **no tenant data** (R12.7) — no identifier, name, count, or attribute.
 *   - On any other error it shows a generic message with a retry.
 *   - A capability-gated read the actor lacks renders a quiet "not authorized"
 *     notice instead of leaking data.
 *
 * Reuses the canonical `ErrorDisplay` / `EmptyState` primitives and the shared
 * `tenantErrorMessage` so collision/authorization copy stays consistent.
 */
import { Info, ShieldAlert } from 'lucide-react'

import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'

import { tenantErrorMessage } from './errors'

/** True when the enhanced API error is a backend 403 (authorization denial). */
export function isForbiddenError(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 403
}

/**
 * Per-panel query/mutation error surface (R12.7).
 *
 * A backend 403 yields a precise authorization message and renders no tenant
 * data (no retry — retrying an authorization denial cannot succeed). Any other
 * error yields a generic message with a retry affordance.
 */
export function PanelStateError({
  error,
  onRetry,
  fallback,
}: {
  error: unknown
  onRetry?: () => void
  fallback: string
}) {
  if (isForbiddenError(error)) {
    return (
      <ErrorDisplay
        variant="inline"
        title="You are not authorized"
        message={tenantErrorMessage(
          error,
          'You do not have permission to view this. No information about it is shown.',
        )}
      />
    )
  }
  return <ErrorDisplay variant="inline" message={tenantErrorMessage(error, fallback)} onRetry={onRetry} />
}

/**
 * Quiet "you lack the capability to read this" notice for a capability-gated
 * panel. Renders no tenant data — used when `canForInstitution`/`can` is false
 * but the panel is still mounted.
 */
export function PanelNoAccess({ description }: { description?: string }) {
  return (
    <EmptyState
      icon={<ShieldAlert />}
      heading="Not authorized"
      description={
        description ??
        'Your account does not have permission to view this section. Contact your platform administrator if you believe this is an error.'
      }
    />
  )
}

/**
 * Explains why a readable panel is intentionally read-only. Use this instead
 * of rendering disabled platform-only controls for tenant admins.
 */
export function PanelReadOnlyNotice({ description }: { description: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{description}</span>
    </p>
  )
}
