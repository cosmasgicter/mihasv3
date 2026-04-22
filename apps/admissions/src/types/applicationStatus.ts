export const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'conditionally_approved',
  'rejected',
  'waitlisted',
  'withdrawn',
  'expired',
  'enrolled',
  'enrollment_expired'
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

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
