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
import {
  CreditCard,
  ArrowRight,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { PageShell } from '@/components/ui/PageShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { useAuth } from '@/contexts/AuthContext'
import { logApiError } from '@/lib/apiErrorLogger'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentRecord {
  id: string
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

/** True when the application has no successful payment yet */
function needsPayment(paymentStatus: string | null): boolean {
  const s = paymentStatus?.toLowerCase()
  return s !== 'paid' && s !== 'verified' && s !== 'successful'
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
    queryKey: ['payment-records', applicationIds],
    queryFn: async () => {
      const result: Record<string, PaymentRecord[]> = {}
      await Promise.all(
        applicationIds.map(async (appId) => {
          try {
            const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
              `/payments/?application_id=${encodeURIComponent(appId)}`,
            )
            if (!data) {
              result[appId] = []
              return
            }
            const records: PaymentRecord[] = Array.isArray(data)
              ? data
              : (data as PaymentListResponse).results ?? []
            result[appId] = records
          } catch (err) {
            logApiError('payment-page', `/payments/?application_id=${appId}`, err)
            result[appId] = []
          }
        }),
      )
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
      <PageShell title="Application Payment" subtitle="Loading payment information...">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageShell>
    )
  }

  return (
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
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>Failed to load payment information. Please try again.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchApps()} className="flex-shrink-0">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Application Fee</span>
                <span className="text-2xl font-bold text-primary">K153</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Non-refundable application processing fee
              </p>
            </div>

            <Button
              onClick={handleContinueToWizard}
              className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 min-h-[44px]"
            >
              Continue to Application Wizard
              <ArrowRight className="h-4 w-4 ml-2" />
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
                  const appNeedsPayment = needsPayment(app.payment_status)

                  return (
                    <div
                      key={app.id}
                      className="rounded-lg border border-border p-4 space-y-3"
                    >
                      {/* Application header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {app.program || 'Application'}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            Status: {app.status}
                          </span>
                        </div>
                        {appNeedsPayment && (
                          <Button
                            size="sm"
                            onClick={handleContinueToWizard}
                            className="min-h-[44px] flex-shrink-0"
                          >
                            Pay Now
                            <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        )}
                      </div>

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
                <a href="mailto:admissions@mihas.edu.zm" className="text-primary hover:underline">
                  admissions@mihas.edu.zm
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
