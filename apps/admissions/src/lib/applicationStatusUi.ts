import { APPLICATION_STATUSES, formatApplicationStatus, type ApplicationStatus } from '@/types/applicationStatus'

export type BulkApplicationAction = 'approve' | 'reject' | 'review'

export const STATUS_FILTER_OPTIONS = APPLICATION_STATUSES.map(status => ({
  value: status,
  label: formatApplicationStatus(status)
}))

export const BULK_ACTION_STATUS_MAP: Record<BulkApplicationAction, ApplicationStatus> = {
  approve: 'approved',
  reject: 'rejected',
  review: 'under_review'
}

export const getApplicationStatusBadgeClass = (status: ApplicationStatus): string => {
  const styles: Record<ApplicationStatus, string> = {
    draft: 'bg-accent text-foreground',
    submitted: 'bg-primary/10 text-primary-foreground',
    under_review: 'bg-accent/10 text-accent-foreground',
    approved: 'bg-accent/10 text-accent-foreground',
    conditionally_approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-destructive/10 text-destructive-foreground',
    waitlisted: 'bg-amber-100 text-amber-800',
    withdrawn: 'bg-slate-100 text-slate-700',
    expired: 'bg-orange-100 text-orange-800',
    enrolled: 'bg-green-100 text-green-800',
    enrollment_expired: 'bg-orange-100 text-orange-800',
  }

  return styles[status]
}
