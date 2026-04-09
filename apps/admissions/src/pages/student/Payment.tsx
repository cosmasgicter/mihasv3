/**
 * Payment Page — Read-only payment history
 *
 * Displays payment status per application and links to the Application Wizard
 * for applications that still need payment. All payment mutations happen
 * exclusively through the Lenco widget inside the wizard.
 *
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Seo } from '@/components/seo/Seo'
import {
  CreditCard,
  ArrowRight,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { PageShell } from '@/components/ui/PageShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { useAuth } from '@/contexts/AuthContext'
import { logApiError } from '@/lib/apiErrorLogger'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import {
  normalizePaymentStatus,
  requiresStudentPaymentAction,
} from '@/lib/paymentStatus'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentRecord {
  id: string
  application_id: string
  status: string
  amount: number | null
  currency: string | null
  created_at: string
  transaction_reference?: string | null
}

interface PaymentListResponse {
  results?: PaymentRecord[]
  [key: string]: unknown
}

interface ApplicationSummary {
  id: string
  status: string
  payment_status: string | null
  program: string | null
  created_at: string
  last_payment_audit_notes?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount == null) return '—'
  const symbol = currency === 'ZMW' ? 'K' : (currency ?? '')
  return `${symbol}${amount.toFixed(2)}`
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function paymentStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'successful':
      return { variant: 'success' as const, label: 'Successful', icon: <CheckCircle className="h-3.5 w-3.5" /> }
    case 'failed':
      return { variant: 'destructive' as const, label: 'Failed', icon: <XCircle className="h-3.5 w-3.5" /> }
    case 'pending':
    default:
      return { variant: 'warning' as const, label: 'Pending', icon: <Clock className="h-3.5 w-3.5" /> }
  }
}

function formatApplicationStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function getPaymentStatusBadge(status: string | null) {
  switch (normalizePaymentStatus(status)) {
    case 'verified':
      return { variant: 'success' as const, label: 'Verified' }
    case 'pending_review':
      return { variant: 'warning' as const, label: 'Awaiting Review' }
    case 'rejected':
      return { variant: 'destructive' as const, label: 'Rejected' }
    default:
      return { variant: 'secondary' as const, label: 'Action Required' }
  }
}

function getPaymentGuidance(app: ApplicationSummary) {
  const normalizedPaymentStatus = normalizePaymentStatus(app.payment_status)

  if (app.status === 'draft') {
    return 'Complete this draft in the wizard. Payment is collected as part of the guided submission flow.'
  }

  if (normalizedPaymentStatus === 'verified') {
    return 'Your application fee has been verified. Payment history remains available below for reference.'
  }

  if (normalizedPaymentStatus === 'pending_review') {
    return 'Your proof of payment has been submitted and is waiting for admissions review.'
  }

  if (normalizedPaymentStatus === 'rejected' && app.last_payment_audit_notes) {
    return app.last_payment_audit_notes
  }

  if (normalizedPaymentStatus === 'rejected') {
    return 'Your previous payment submission was rejected. Review the application status and submit updated proof if requested.'
  }

  return 'This application still needs payment attention before it can move forward in review.'
}

function getPaymentAction(app: ApplicationSummary) {
  if (!requiresStudentPaymentAction(app.payment_status)) {
    return null
  }

  if (app.status === 'draft') {
    return {
      href: '/student/application-wizard',
      label: 'Continue draft in wizard',
    }
  }

  return {
    href: `/student/application/${app.id}/status`,
    label: app.payment_status === 'rejected' ? 'Review rejected payment' : 'Review payment status',
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // ---- Fetch student's applications ----
  const {
    data: applications = [],
    isLoading: loadingApps,
    error: appsError,
    refetch: refetchApps,
  } = useQuery<ApplicationSummary[]>({
    queryKey: ['payment-applications', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const response = await applicationService.list({ mine: true })
      return (response.applications ?? []).map((app) => ({
        id: app.id,
        status: app.status,
        payment_status: typeof app.payment_status === 'string' ? app.payment_status : null,
        program: typeof app.program === 'string' ? app.program : null,
        created_at: typeof app.created_at === 'string' ? app.created_at : new Date().toISOString(),
        last_payment_audit_notes:
          typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
      }))
    },
    enabled: !!user?.id,
    ...CACHE_CONFIG.applications,
  })

  // ---- Fetch payment records for all applications ----
  const applicationIds = applications.map((a) => a.id)

  const {
    data: paymentsByApp = {},
    isLoading: loadingPayments,
  } = useQuery<Record<string, PaymentRecord[]>>({
    queryKey: ['payment-records', user?.id],
    queryFn: async () => {
      const result: Record<string, PaymentRecord[]> = {}

      if (applicationIds.length === 0) {
        return result
      }

      try {
        const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>('/payments/')
        const records: PaymentRecord[] = Array.isArray(data)
          ? data
          : (data as PaymentListResponse).results ?? []

        applicationIds.forEach((appId) => {
          result[appId] = records.filter(record => record.application_id === appId)
        })
      } catch (err) {
        logApiError('payment-page', '/payments/', err)
        applicationIds.forEach((appId) => {
          result[appId] = []
        })
      }

      return result
    },
    enabled: applicationIds.length > 0,
    ...CACHE_CONFIG.applications,
  })

  const loading = loadingApps || loadingPayments

  const handleContinueToWizard = () => {
    navigate('/student/application-wizard')
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <>
      <Seo
        title="Payment | MIHAS-KATC Admissions"
        description="View your application payment history and payment status for MIHAS-KATC admissions."
        path="/student/payment"
        noindex
      />
      <PageShell title="Application Payment" subtitle="Loading payment information...">
        <div className="space-y-6" role="status" aria-label="Loading payment information">
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-72" />
                </div>
              </div>
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
              <SkeletonTable rows={4} columns={4} />
              <div className="grid gap-4 md:grid-cols-2">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </div>
          </div>
        </div>
      </PageShell>
      </>
    )
  }

  return (
    <>
      <Seo
        title="Payment | MIHAS-KATC Admissions"
        description="View your application payment history and payment status for MIHAS-KATC admissions."
        path="/student/payment"
        noindex
      />
    <PageShell
      title="Application Payment"
      subtitle="View your payment history and continue to the Application Wizard to make a payment."
    >
      {/* Back to Dashboard */}
      <div className="mb-6">
        <Link
          to="/student/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Link>
      </div>

      {/* Error display */}
      {appsError && (
        <ErrorDisplay
          variant="section"
          title="Unable to load payment information"
          message="Failed to load payment information. Please try again."
          onRetry={() => void refetchApps()}
          className="mb-6"
        />
      )}

      <div className="grid gap-6">
        {/* Payment instructions + CTA */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Application Fee</CardTitle>
                <CardDescription>
                  Payment is handled securely in the Application Wizard via the Lenco payment gateway.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
              <p className="text-sm font-medium text-foreground">Application fees are resolved per application</p>
              <p className="text-xs text-muted-foreground mt-1">
                The exact fee is calculated in the wizard based on the selected programme and residency details before payment starts.
              </p>
            </div>

            <Button
              asChild
              className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 min-h-[44px]"
            >
              <Link to="/student/application-wizard">
                Continue to Application Wizard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Per-application payment history */}
        {applications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Payment History
              </CardTitle>
              <CardDescription>Payment records for your applications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {applications.map((app) => {
                  const records = paymentsByApp[app.id] ?? []
                  const paymentBadge = getPaymentStatusBadge(app.payment_status)
                  const paymentAction = getPaymentAction(app)

                  return (
                    <div
                      key={app.id}
                      className="rounded-lg border border-border p-4 space-y-3"
                    >
                      {/* Application header */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <p className="font-medium text-foreground truncate">
                            {app.program || 'Application'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              Application: {formatApplicationStatus(app.status)}
                            </Badge>
                            <Badge variant={paymentBadge.variant}>
                              Payment: {paymentBadge.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getPaymentGuidance(app)}
                          </p>
                        </div>
                        {paymentAction && (
                          <Button
                            asChild
                            size="sm"
                            className="min-h-[44px] flex-shrink-0"
                          >
                            <Link to={paymentAction.href}>
                              {paymentAction.label}
                              <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Link>
                          </Button>
                        )}
                      </div>

                      {app.last_payment_audit_notes && normalizePaymentStatus(app.payment_status) === 'rejected' && (
                        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-foreground">
                          <span className="font-semibold text-destructive">Review note:</span>{' '}
                          {app.last_payment_audit_notes}
                        </div>
                      )}

                      {/* Payment records list */}
                      {records.length > 0 ? (
                        <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                          {records.map((rec) => {
                            const badge = paymentStatusBadge(rec.status)
                            return (
                              <div
                                key={rec.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant={badge.variant} className="flex items-center gap-1">
                                    {badge.icon}
                                    {badge.label}
                                  </Badge>
                                  <span className="text-foreground font-medium">
                                    {formatCurrency(rec.amount, rec.currency)}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatTimestamp(rec.created_at)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No payment records yet.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {applications.length === 0 && !appsError && (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            heading="No Applications Yet"
            description="Start your application to see payment information here."
            action={{
              label: 'Start Application',
              onClick: handleContinueToWizard,
            }}
          />
        )}

        {/* Help card */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Need help with payment?</p>
              <p className="text-xs text-muted-foreground">
                Contact support at{' '}
                <a href="mailto:***REMOVED***" className="text-primary hover:underline">
                  ***REMOVED***
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
    </>
  )
}
