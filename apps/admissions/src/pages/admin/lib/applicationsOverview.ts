import { normalizePaymentStatus } from '@/lib/paymentStatus'
import type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'
import { ACCEPTED_APPLICATION_STATUSES } from '@/types/applicationStatus'

const ACCEPTED_STATUS_SET = new Set<string>(ACCEPTED_APPLICATION_STATUSES)

export interface ApplicationsOverview {
  total: number
  loadedCount: number
  todaySubmissions: number
  pendingReview: number
  underReview: number
  decisionQueue: number
  approved: number
  conditionallyApproved: number
  enrolled: number
  accepted: number
  rejected: number
  paymentNotPaid: number
  paymentPending: number
  paymentRejected: number
  paymentVerified: number
}

export function buildApplicationsOverview(
  applications: ApplicationSummary[],
  totalCount?: number
): ApplicationsOverview {
  const today = new Date().toDateString()
  const loadedCount = applications.length
  const pendingReview = applications.filter(app => app.status === 'submitted').length
  const underReview = applications.filter(app => app.status === 'under_review').length
  const approved = applications.filter(app => app.status === 'approved').length
  const conditionallyApproved = applications.filter(app => app.status === 'conditionally_approved').length
  const enrolled = applications.filter(app => app.status === 'enrolled').length

  const paymentNotPaid = applications.filter(
    app => normalizePaymentStatus(app.payment_status) === 'not_paid'
  ).length
  const paymentPending = applications.filter(
    app => normalizePaymentStatus(app.payment_status) === 'pending_review'
  ).length
  const paymentRejected = applications.filter(
    app => normalizePaymentStatus(app.payment_status) === 'rejected'
  ).length
  const paymentVerified = applications.filter(
    app => normalizePaymentStatus(app.payment_status) === 'verified'
  ).length

  return {
    total: totalCount && totalCount > 0 ? totalCount : loadedCount,
    loadedCount,
    todaySubmissions: applications.filter(app =>
      new Date(app.submitted_at || app.updated_at || app.created_at || 0).toDateString() === today
    ).length,
    pendingReview,
    underReview,
    decisionQueue: pendingReview + underReview,
    approved,
    conditionallyApproved,
    enrolled,
    accepted: applications.filter(app => ACCEPTED_STATUS_SET.has(app.status)).length,
    rejected: applications.filter(app => app.status === 'rejected').length,
    paymentNotPaid,
    paymentPending,
    paymentRejected,
    paymentVerified,
  }
}
