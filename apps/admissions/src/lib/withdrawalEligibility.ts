import type { ApplicationStatus } from '@/types/applicationStatus'

const WITHDRAWABLE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  'submitted',
  'under_review',
  'waitlisted',
  'conditionally_approved',
  'approved',
])

/** Returns true if the application can be withdrawn from the given status. */
export function canWithdraw(status: ApplicationStatus | string): boolean {
  return WITHDRAWABLE_STATUSES.has(status as ApplicationStatus)
}
