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

export const ADMIN_APPLICATION_STATUS_BADGES: Record<ApplicationStatus, { cardClassName: string; tableClassName: string }> = {
  draft: {
    cardClassName: 'bg-gray-100/80 text-gray-700',
    tableClassName: 'bg-gray-100 text-gray-800 border-gray-300',
  },
  submitted: {
    cardClassName: 'bg-blue-100/80 text-blue-700',
    tableClassName: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  under_review: {
    cardClassName: 'bg-amber-100/80 text-amber-700',
    tableClassName: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  },
  approved: {
    cardClassName: 'bg-emerald-100/80 text-emerald-700',
    tableClassName: 'bg-green-100 text-green-800 border-green-300',
  },
  conditionally_approved: {
    cardClassName: 'bg-emerald-100/80 text-emerald-700',
    tableClassName: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  rejected: {
    cardClassName: 'bg-red-100/80 text-red-700',
    tableClassName: 'bg-red-100 text-red-800 border-red-300',
  },
  waitlisted: {
    cardClassName: 'bg-amber-100/80 text-amber-700',
    tableClassName: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  withdrawn: {
    cardClassName: 'bg-muted/80 text-muted-foreground',
    tableClassName: 'bg-muted text-foreground border-border',
  },
  expired: {
    cardClassName: 'bg-orange-100/80 text-orange-700',
    tableClassName: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  enrolled: {
    cardClassName: 'bg-emerald-100/80 text-emerald-700',
    tableClassName: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  enrollment_expired: {
    cardClassName: 'bg-orange-100/80 text-orange-700',
    tableClassName: 'bg-orange-100 text-orange-800 border-orange-300',
  },
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
    withdrawn: 'bg-muted text-muted-foreground',
    expired: 'bg-orange-100 text-orange-800',
    enrolled: 'bg-green-100 text-green-800',
    enrollment_expired: 'bg-orange-100 text-orange-800',
  }

  return styles[status]
}
