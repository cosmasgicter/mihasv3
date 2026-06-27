export type TenantDomainTone = 'neutral' | 'info' | 'warning' | 'success' | 'muted'

export function domainStatusTone(status?: string | null): TenantDomainTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'verified':
    case 'pending_review':
      return 'info'
    case 'failed':
      return 'warning'
    case 'disabled':
      return 'muted'
    default:
      return 'neutral'
  }
}

export function domainStatusLabel(status?: string | null): string {
  switch (status) {
    case 'pending_dns':
      return 'Pending DNS'
    case 'pending_review':
      return 'Pending review'
    case 'verified':
      return 'Verified'
    case 'active':
      return 'Active'
    case 'failed':
      return 'Failed'
    case 'disabled':
      return 'Disabled'
    default:
      return status ? String(status) : 'Unknown'
  }
}
