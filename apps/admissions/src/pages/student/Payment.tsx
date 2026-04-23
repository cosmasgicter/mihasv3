/**
 * Payment Page
 *
 * Displays payment history and owns post-submission payment recovery. Drafts
 * still return to the wizard, but failed or unpaid submitted applications can
 * be retried here without reopening the application wizard.
 */

import { useCallback, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Seo } from '@/components/seo/Seo'
import {
  CreditCard,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { PageShell } from '@/components/ui/PageShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui'
import { DownloadReceiptButton } from '@/components/student/DownloadReceiptButton'
import { PaymentForm } from '@/components/student/PaymentForm'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { useAuth } from '@/contexts/AuthContext'
import { logApiError } from '@/lib/apiErrorLogger'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import {
  normalizePaymentStatus,
  isPaymentVerified,
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

function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') { const p = Number(value); return Number.isFinite(p) ? p : null }
  return null
}

function formatCurrency(amount: number | string | null, currency: string | null): string {
  const n = normalizeAmount(amount)
  if (n == null) return '—'
  const symbol = currency === 'ZMW' ? 'K' : (currency ?? '')
  return `${symbol}${n.toFixed(2)}`
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

function paymentStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'successful': return { variant: 'success' as const, label: 'Successful', icon: <CheckCircle className="h-3.5 w-3.5" /> }
    case 'failed': return { variant: 'destructive' as const, label: 'Failed', icon: <XCircle className="h-3.5 w-3.5" /> }
    default: return { variant: 'warning' as const, label: 'Pending', icon: <Clock className="h-3.5 w-3.5" /> }
  }
}

function formatApplicationStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getPaymentStatusBadge(status: string | null) {
  switch (normalizePaymentStatus(status)) {
    case 'verified': return { variant: 'success' as const, label: 'Verified' }
    case 'deferred': return { variant: 'secondary' as const, label: 'Deferred' }
    case 'pending_review': return { variant: 'warning' as const, label: 'Awaiting Review' }
    case 'rejected': return { variant: 'destructive' as const, label: 'Rejected' }
    default: return { variant: 'secondary' as const, label: 'Action Required' }
  }
}

function normalizePaymentRecords(response: PaymentListResponse | PaymentRecord[] | null | undefined): PaymentRecord[] {
  if (Array.isArray(response)) return response
  if (!response || typeof response !== 'object') return []
  if (Array.isArray(response.results)) return response.results
  if (Array.isArray(response.payments)) return response.payments
  if (Array.isArray(response.data)) return response.data
  if (response.data && typeof response.data === 'object' && Array.isArray(response.data.results)) return response.data.results
  return []
}

/** Returns true for statuses where the student can pay from this page */
function canPayFromPage(app: ApplicationSummary): boolean {
  if (app.status === 'draft') return false
  const raw = (app.payment_status ?? '').toLowerCase()
  return ['deferred', 'failed', 'not_paid', 'rejected', ''].includes(raw) || requiresStudentPaymentAction(app.payment_status)
}

// ---------------------------------------------------------------------------
// Application Payment Card
// ---------------------------------------------------------------------------

interface ApplicationPaymentCardProps {
  app: ApplicationSummary
  records: PaymentRecord[]
  isSelected: boolean
  onPaymentRefresh: () => Promise<void>
}

function ApplicationPaymentCard({ app, records, isSelected, onPaymentRefresh }: ApplicationPaymentCardProps) {
  const paymentBadge = getPaymentStatusBadge(app.payment_status)
  const showPayForm = canPayFromPage(app)
  const showVerified = isPaymentVerified(app.payment_status)
  const isDeferred = (app.payment_status ?? '').toLowerCase() === 'deferred'
  const [expanded, setExpanded] = useState(isSelected)
  const latestRecord = [...records].sort((left, right) => (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  ))[0]

  const latestAmount = normalizeAmount(latestRecord?.amount) ?? app.application_fee ?? null
  const latestCurrency = latestRecord?.currency ?? 'ZMW'

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="font-medium text-foreground truncate">{app.program || 'Application'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Application: {formatApplicationStatus(app.status)}</Badge>
            <Badge variant={paymentBadge.variant}>Payment: {paymentBadge.label}</Badge>
            {latestAmount != null && <Badge variant="outline">Fee: {formatCurrency(latestAmount, latestCurrency)}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showVerified && (
            <DownloadReceiptButton applicationId={app.id} paymentStatus={app.payment_status ?? ''} />
          )}
          {showPayForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(!expanded)} className="min-h-[44px]">
              {expanded ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Hide</>: <><ChevronDown className="h-3.5 w-3.5 mr-1" />Pay Now</>}
            </Button>
          )}
        </div>
      </div>

      {/* Deferred message */}
      {isDeferred && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Payment is deferred. Your application can still be submitted, and you can pay from this page later.
        </div>
      )}

      {/* Verified details */}
      {showVerified && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <span className="font-medium">Payment verified.</span> Your application fee has been confirmed.
        </div>
      )}

      {/* Rejection note */}
      {app.last_payment_audit_notes && normalizePaymentStatus(app.payment_status) === 'rejected' && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold text-destructive">Review note:</span> {app.last_payment_audit_notes}
        </div>
      )}

      {/* Inline payment form */}
      {showPayForm && expanded && latestAmount != null && (
        <div className="pt-2 border-t border-border">
          <PaymentForm
            applicationId={app.id}
            amount={typeof latestAmount === 'number' ? latestAmount : Number(latestAmount)}
            currency={latestCurrency}
            phone={app.phone ?? ''}
            fullName={app.full_name ?? ''}
            email={app.email ?? ''}
            onPaymentStatusRefresh={onPaymentRefresh}
            onSuccess={onPaymentRefresh}
          />
        </div>
      )}

      {/* Payment records history */}
      {records.length > 0 ? (
        <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
          {records.map((rec) => {
            const badge = paymentStatusBadge(rec.status)
            return (
              <div key={rec.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={badge.variant} className="flex items-center gap-1">{badge.icon}{badge.label}</Badge>
                  <span className="text-foreground font-medium">{formatCurrency(rec.amount, rec.currency)}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatTimestamp(rec.created_at)}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No payment records yet.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const selectedApplicationId = searchParams.get('applicationId')

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
        last_payment_audit_notes: typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
      }))
    },
    enabled: !!user?.id,
    // Longer staleTime: dashboard polling already keeps applications fresh.
    // This avoids a redundant /applications/ call when navigating from dashboard.
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  })

  const paymentApplications = applications.filter((app) => app.status !== 'draft')
  const applicationIds = paymentApplications.map((a) => a.id)

  const {
    data: paymentsByApp = {},
    isLoading: loadingPayments,
    refetch: refetchPayments,
  } = useQuery<Record<string, PaymentRecord[]>>({
    queryKey: ['payment-records', user?.id, applicationIds.join(',')],
    queryFn: async () => {
      const result: Record<string, PaymentRecord[]> = {}
      if (applicationIds.length === 0) return result
      try {
        // Single request to fetch all user payments, then group by application_id
        const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>('/payments/')
        const allRecords = normalizePaymentRecords(data)
        applicationIds.forEach((id) => { result[id] = [] })
        allRecords.forEach((r) => {
          const appId = (r as any).application_id
          if (appId && result[appId]) result[appId].push(r)
          else if (appId) result[appId] = [r]
        })
      } catch (err) {
        logApiError('payment-page', '/payments/', err)
        applicationIds.forEach((id) => { result[id] = [] })
      }
      return result
    },
    enabled: applicationIds.length > 0,
    ...CACHE_CONFIG.applications,
  })

  const loading = loadingApps || loadingPayments

  const handlePaymentRefresh = useCallback(async () => {
    await Promise.all([refetchApps(), refetchPayments()])
  }, [refetchApps, refetchPayments])

  if (loading) {
    return (
      <>
        <Seo title="Payment | MIHAS-KATC Admissions" description="View your application payment history." path="/student/payment" noindex />
        <PageShell title="Application Payment" subtitle="Loading payment information...">
          <div className="space-y-6" role="status" aria-label="Loading payment information">
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2"><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-72" /></div>
                </div>
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="space-y-4">
                <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></div>
                <SkeletonTable rows={4} columns={4} />
                <div className="grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
              </div>
            </div>
          </div>
        </PageShell>
      </>
    )
  }

  return (
    <>
      <Seo title="Payment | MIHAS-KATC Admissions" description="View your application payment history." path="/student/payment" noindex />
      <PageShell
        title="Application Payment"
        subtitle="View payment history and complete outstanding application fees."
        eyebrow="Payments"
        tone="student"
        metrics={[
          { label: 'Applications', value: paymentApplications.length, helper: 'Submitted applications shown here' },
          { label: 'Selected', value: selectedApplicationId ? '1 active' : 'None', helper: 'Current payment focus' },
          { label: 'Gateway', value: 'Lenco', helper: 'Secure payment processing' },
          { label: 'State', value: appsError ? 'Needs attention' : 'Ready', helper: typeof appsError === 'string' ? appsError : 'Outstanding fees can be resolved here' },
        ]}
      >
        <div className="mb-6">
          <Link to="/student/dashboard" className="feature-chip">
            <ArrowLeft className="h-4 w-4 mr-1" />Back to Dashboard
          </Link>
        </div>

        {appsError && (
          <ErrorDisplay variant="section" title="Unable to load payment information" message="Failed to load payment information. Please try again." onRetry={() => void refetchApps()} className="mb-6" />
        )}

        <div className="grid gap-6">
          {/* Info card */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><CreditCard className="h-6 w-6 text-primary" /></div>
                <div>
                  <CardTitle>Application Fee</CardTitle>
                  <CardDescription>Payment is handled securely via the Lenco payment gateway.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
                <p className="text-sm font-medium text-foreground">Pay outstanding fees directly from this page</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No need to go back to the application wizard. Select "Pay Now" on any unpaid application below.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Application cards */}
          {paymentApplications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />Your Applications
                </CardTitle>
                <CardDescription>Payment status and history for each application</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paymentApplications.map((app) => (
                    <ApplicationPaymentCard
                      key={app.id}
                      app={app}
                      records={paymentsByApp[app.id] ?? []}
                      isSelected={selectedApplicationId === app.id}
                      onPaymentRefresh={handlePaymentRefresh}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {paymentApplications.length === 0 && !appsError && (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              heading="No Submitted Fees Yet"
              description="Submitted applications with payment records or outstanding fees will appear here."
              action={{ label: 'Back to dashboard', onClick: () => navigate('/student/dashboard') }}
            />
          )}

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Need help with payment?</p>
                <p className="text-xs text-muted-foreground">
                  Contact support at{' '}
                  <a href="mailto:***REMOVED***" className="text-primary hover:underline">***REMOVED***</a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </>
  )
}
