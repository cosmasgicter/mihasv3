import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface CapacityWarningProps {
  intake_capacity: number | null | undefined
  intake_enrollment: number | null | undefined
}

/**
 * Displays a capacity warning when an intake is near or at capacity.
 * - Amber warning when enrollment >= 80% of capacity
 * - Red alert when enrollment >= capacity
 * - Renders nothing if capacity data is null/undefined (fail-safe)
 *
 * Req 18.1, 18.2, 18.3 — Admin capacity warning on approval review page
 */
export function CapacityWarning({ intake_capacity, intake_enrollment }: CapacityWarningProps) {
  // Fail-safe: do not render if capacity data is null/undefined
  if (intake_capacity == null || intake_enrollment == null) {
    return null
  }

  // Only show warning at 80% threshold or above
  if (intake_enrollment < 0.8 * intake_capacity) {
    return null
  }

  const percentage = intake_capacity > 0
    ? Math.round((intake_enrollment / intake_capacity) * 100)
    : 0

  const isOverCapacity = intake_enrollment >= intake_capacity

  if (isOverCapacity) {
    return (
      <div
        role="alert"
        data-testid="capacity-warning"
        className="flex items-start gap-3 p-4 rounded-xl border border-red-300 bg-red-50"
      >
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-red-900">
            Intake is at or over capacity ({intake_enrollment}/{intake_capacity}). Approving will exceed the limit.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      data-testid="capacity-warning"
      className="flex items-start gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-amber-900">
          Intake is {percentage}% full ({intake_enrollment}/{intake_capacity})
        </p>
      </div>
    </div>
  )
}
