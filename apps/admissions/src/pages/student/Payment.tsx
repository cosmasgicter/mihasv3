/**
 * Payment Page
 *
 * Displays payment history and owns post-submission payment recovery. Drafts
 * still return to the wizard, but failed or unpaid submitted applications can
 * be retried here without reopening the application wizard.
 *
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { useCallback } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
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
import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { useAuth } from '@/contexts/AuthContext'
import { logApiError } from '@/lib/apiErrorLogger'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useApplicationPaymentAction } from '@/hooks/useApplicationPaymentAction'
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
  amount: number | string | null
  currency: string | null
  created_at: string
  transaction_reference?: string | null
}

interface PaymentListResponse {
  data?: PaymentRecord[] | { results?: PaymentRecord[] }
  results?: PaymentRecord[]
  payments?: PaymentRecord[]
  [key: string]: unknown
}

interface ApplicationSummary {
  id: string
  status: string
  payment_status: string | null
  program: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  application_fee: number | null
  created_at: string
  last_payment_audit_notes?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | string | null, currency: string | null): string {
  const normalizedAmount = normalizeAmount(amount)
  if (normalizedAmount == null) return '—'
  const symbol = currency === 'ZMW' ? 'K' : (currency ?? '')
  return `${symbol}${normalizedAmount.toFixed(2)}`
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

function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizePaymentRecords(response: PaymentListResponse | PaymentRecord[] | null | undefined): PaymentRecord[] {
  if (Array.isArray(response)) {
    return response
  }

  if (!response || typeof response !== 'object') {
    return []
  }

  if (Array.isArray(response.results)) {
    return response.results
  }

  if (Array.isArray(response.payments)) {
    return response.payments
  }

  if (Array.isArray(response.data)) {
    return response.data
  }

  if (response.data && typeof response.data === 'object' && Array.isArray(response.data.results)) {
    return response.data.results
  }

  return []
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

  if (normalizedPaymentStatus === 'verified') {
    return 'Your application fee has been verified. Payment history remains available below for reference.'
  }

  if (normalizedPaymentStatus === 'pending_review') {
    return 'Your recent payment is awaiting admissions review.'
  }

  if (normalizedPaymentStatus === 'rejected' && app.last_payment_audit_notes) {
    return app.last_payment_audit_notes
  }

  if (normalizedPaymentStatus === 'rejected') {
    return 'Your previous payment was rejected. Review the note below, then retry payment from this page.'
  }

  return 'This application still needs payment. You can complete it here without returning to the application wizard.'
}

function getPaymentAction(app: ApplicationSummary) {
  if (!requiresStudentPaymentAction(app.payment_status)) {
    return null
  }

  return {
    href: `/student/payment?applicationId=${encodeURIComponent(app.id)}`,
    label: app.payment_status === 'rejected' ? 'Retry rejected payment' : 'Pay application fee',
  }
}

interface ApplicationPaymentCardProps {
  app: ApplicationSummary
  records: PaymentRecord[]
  isSelected: boolean
  onPaymentRefresh: () => Promise<void>
}

function ApplicationPaymentCard({
  app,
  records,
  isSelected,
  onPaymentRefresh,
}: ApplicationPaymentCardProps) {
  const paymentBadge = getPaymentStatusBadge(app.payment_status)
  const paymentAction = getPaymentAction(app)
  const canRetryOnPaymentPage = app.status !== 'draft' && requiresStudentPaymentAction(app.payment_status)

  const getCustomerDetails = useCallback(() => ({
    fullName: app.full_name,
    email: app.email,
    phone: app.phone,
  }), [app.email, app.full_name, app.phone])

  const {
    paymentStatus,
    statusMessage,
    initiateError,
    widgetLoading,
    isScriptLoaded,
    startPayment,
  } = useApplicationPaymentAction({
    applicationId: app.id,
    getCustomerDetails,
    onPaymentStatusRefresh: onPaymentRefresh,
  })

  const latestAmount = app.application_fee ?? normalizeAmount(records[0]?.amount) ?? null
  const latestCurrency = records[0]?.currency ?? 'ZMW'
  const paymentInProgress = paymentStatus === 'initiating' || paymentStatus === 'pending'
  const retryDisabled = !isScriptLoaded || widgetLoading || paymentInProgress

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        isSelected ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
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
            {latestAmount != null && (
              <Badge variant="outline">
                Fee: {formatCurrency(latestAmount, latestCurrency)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {getPaymentGuidance(app)}
          </p>
        </div>
        {paymentAction && (
          <Button
            type="button"
            size="sm"
            className="min-h-[44px] flex-shrink-0"
            disabled={retryDisabled}
            loading={paymentStatus === 'initiating' || widgetLoading}
            onClick={() => void startPayment()}
            data-testid={`payment-page-retry-${app.id}`}
          >
            {paymentStatus === 'pending' ? 'Checking payment...' : paymentAction.label}
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </div>

      {canRetryOnPaymentPage && !isScriptLoaded && !widgetLoading && (
        <div className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-foreground">
          Payment widget unavailable. Refresh the page and try again.
        </div>
      )}

      {statusMessage && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {statusMessage}
        </div>
      )}

      {initiateError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {initiateError}
        </div>
      )}

      {app.last_payment_audit_notes && normalizePaymentStatus(app.payment_status) === 'rejected' && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold text-destructive">Review note:</span>{' '}
          {app.last_payment_audit_notes}
        </div>
      )}

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const selectedApplicationId = searchParams.get('applicationId')

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
        full_name: typeof app.full_name === 'string' ? app.full_name : null,
        email: typeof app.email === 'string' ? app.email : null,
        phone: typeof app.phone === 'string' ? app.phone : null,
        application_fee: normalizeAmount(app.application_fee),
        created_at: typeof app.created_at === 'string' ? app.created_at : new Date().toISOString(),
        last_payment_audit_notes:
          typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
      }))
    },
    enabled: !!user?.id,
    ...CACHE_CONFIG.applications,
  })

  const paymentApplications = applications.filter((app) => app.status !== 'draft')

  // ---- Fetch payment records for submitted applications ----
  const applicationIds = paymentApplications.map((a) => a.id)

  const {
    data: paymentsByApp = {},
    isLoading: loadingPayments,
    refetch: refetchPayments,
  } = useQuery<Record<string, PaymentRecord[]>>({
    queryKey: ['payment-records', user?.id, applicationIds.join(',')],
    queryFn: async () => {
      const result: Record<string, PaymentRecord[]> = {}

      if (applicationIds.length === 0) {
        return result
      }

      try {
        const settledPayments = await Promise.allSettled(
          applicationIds.map(async (appId) => {
            const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
              `/payments/?application_id=${encodeURIComponent(appId)}`
            )
            return [appId, normalizePaymentRecords(data)] as const
          })
        )

        settledPayments.forEach((settled, index) => {
          const fallbackAppId = applicationIds[index]
          if (!fallbackAppId) return

          if (settled.status === 'fulfilled') {
            const [appId, records] = settled.value
            result[appId] = records
          } else {
            logApiError('payment-page', `/payments/?application_id=${fallbackAppId}`, settled.reason)
            result[fallbackAppId] = []
          }
        })
      } catch (err) {
        logApiError('payment-page', '/payments/?application_id=<id>', err)
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

  const handleBackToDashboard = () => {
    navigate('/student/dashboard')
  }

  const handlePaymentRefresh = useCallback(async () => {
    await Promise.all([
      refetchApps(),
      refetchPayments(),
    ])
  }, [refetchApps, refetchPayments])

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
      subtitle="View payment history and retry failed or unpaid submitted application fees."
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
                  Payment is handled securely via the Lenco payment gateway.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
              <p className="text-sm font-medium text-foreground">Application fees are resolved per application</p>
              <p className="text-xs text-muted-foreground mt-1">
                Failed or unpaid submitted applications can be retried from this page.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Per-application payment history */}
        {paymentApplications.length > 0 && (
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
                {paymentApplications.map((app) => {
                  const records = paymentsByApp[app.id] ?? []

                  return (
                    <ApplicationPaymentCard
                      key={app.id}
                      app={app}
                      records={records}
                      isSelected={selectedApplicationId === app.id}
                      onPaymentRefresh={handlePaymentRefresh}
                    />
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {paymentApplications.length === 0 && !appsError && (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            heading="No Submitted Fees Yet"
            description="Submitted applications with payment records or outstanding fees will appear here."
            action={{
              label: 'Back to dashboard',
              onClick: handleBackToDashboard,
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
