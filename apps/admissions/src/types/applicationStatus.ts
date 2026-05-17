export const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'waitlisted',
  'conditionally_approved',
  'approved',
  'enrolled',
  'rejected',
  'withdrawn',
  'expired',
  'enrollment_expired'
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const TERMINAL_STATUSES = ['rejected', 'withdrawn', 'expired', 'enrolled', 'enrollment_expired'] as const
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number]

export const ACCEPTED_APPLICATION_STATUSES = [
  'conditionally_approved',
  'approved',
  'enrolled',
] as const satisfies readonly ApplicationStatus[]

export const DECISIONED_APPLICATION_STATUSES = [
  ...ACCEPTED_APPLICATION_STATUSES,
  'rejected',
] as const satisfies readonly ApplicationStatus[]

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  conditionally_approved: 'Conditionally Approved',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  enrolled: 'Enrolled',
  enrollment_expired: 'Enrollment Expired'
}

export const formatApplicationStatus = (status: ApplicationStatus | string): string => {
  return APPLICATION_STATUS_LABELS[status as ApplicationStatus] ?? status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
