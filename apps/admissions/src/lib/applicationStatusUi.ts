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
    rejected: 'bg-destructive/10 text-destructive-foreground',
    waitlisted: 'bg-amber-100 text-amber-800',
    pending_documents: 'bg-accent/10 text-accent-foreground'
  }

  return styles[status]
}
