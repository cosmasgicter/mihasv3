/**
 * `/student/payment` — the post-submission half of the payment ownership split.
 *
 * Admissions-v2 task 8.3 (**R12.3**, R12.4, R12.6, R13.1, R13.2); findings
 * **STU-08**, **STU-09**, **STU-24**.
 *
 * R12.3 draws the line: the wizard owns pre-submission pay-or-defer, and this page
 * owns every state after submission — deferred, failed, expired, pending recovery
 * — plus payment history. Neither surface does the other's job:
 *
 * - Drafts never appear here. Their fee is paid in the wizard before submission,
 *   so a student with only a draft is handed back to the wizard rather than shown
 *   an empty payment page (that hand-off is a path forward, not a dead end).
 * - The wizard does not render history or recovery. It is the surface where a
 *   price is first minted and a first attempt is made.
 *
 * Everything shown is server-authored: amounts come from the canonical payment row
 * or the held fee quote, the waiting states come from the server-derived `phase`
 * (task 8.2), and the support contact comes from resolved tenant context — this
 * page used to print one platform email address into every tenant's UI (STU-24).
 */

import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, FileText, Mail, Wallet } from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageShell } from '@/components/ui/PageShell'
import { SectionCard } from '@/components/ui/SectionCard'
import { Skeleton, SkeletonTable } from '@/components/ui'
import {
  PaymentApplicationCard,
  type PaymentApplicationSummary,
} from '@/components/student/payment/PaymentApplicationCard'
import { useAuth } from '@/contexts/AuthContext'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { logApiError } from '@/lib/apiErrorLogger'
import { isPaymentVerified, normalizePaymentStatus } from '@/lib/paymentStatus'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import { studentApplicationNewPath, studentApplicationResumePath } from '@/routes/routeRegistry'
import { applicationService } from '@/services/applications'
import { listPayments, type PaymentRow } from '@/services/payments'

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaymentPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { brandName, supportEmail } = usePortalBrand()

  // Tenant-resolved support contact. On the neutral shared portal this is the
  // in-app contact route — never a hardcoded school address (STU-24).
  const support = useMemo(
    () =>
      resolveTenantSupportContact({
        supportEmail,
        brandName,
        subject: 'Help with my application fee payment',
        bodyLines: [
          'Hello Admissions team,',
          '',
          'I need help with the application fee payment for my application.',
        ],
      }),
    [supportEmail, brandName],
  )

  const {
    data: applications = [],
    isLoading: loadingApps,
    error: appsError,
    refetch: refetchApps,
  } = useQuery<PaymentApplicationSummary[]>({
    queryKey: ['payment-applications', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const response = await applicationService.list({ mine: true })
      return (response.applications ?? []).map((app) => ({
        id: app.id,
        status: app.status,
        payment_status: asString(app.payment_status),
        program: asString(app.program),
        application_number: asString(app.application_number),
        full_name: asString(app.full_name),
        email: asString(app.email),
        phone: asString(app.phone),
        created_at: asString(app.created_at) ?? new Date().toISOString(),
        last_payment_audit_notes: asString(app.last_payment_audit_notes),
      }))
    },
    enabled: !!user?.id,
    // Dashboard polling already keeps applications fresh; this avoids a
    // redundant /applications/ call when navigating from the dashboard.
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  })

  // Drafts belong to the wizard (R12.3). The newest one is kept only so the
  // empty state can hand the student back to the surface that owns it.
  const firstDraftId = applications.find((app) => app.status === 'draft')?.id ?? null
  const submittedApplications = applications.filter((app) => app.status !== 'draft')
  const applicationIds = submittedApplications.map((app) => app.id)

  const {
    data: paymentsByApp = {},
    isLoading: loadingPayments,
    refetch: refetchPayments,
  } = useQuery<Record<string, PaymentRow[]>>({
    queryKey: ['payment-records', user?.id, applicationIds.join(',')],
    queryFn: async () => {
      const result: Record<string, PaymentRow[]> = {}
      if (applicationIds.length === 0) return result
      try {
        // One request for every payment row this student owns, grouped locally.
        const allRecords = await listPayments()
        applicationIds.forEach((id) => {
          result[id] = []
        })
        allRecords.forEach((record) => {
          const appId = record.application_id
          if (!appId) return
          if (result[appId]) result[appId].push(record)
          else result[appId] = [record]
        })
      } catch (err) {
        logApiError('payment-page', '/payments/', err)
        applicationIds.forEach((id) => {
          result[id] = []
        })
      }
      return result
    },
    enabled: applicationIds.length > 0,
    ...CACHE_CONFIG.applications,
  })

  const handlePaymentRefresh = useCallback(async () => {
    await Promise.all([refetchApps(), refetchPayments()])
  }, [refetchApps, refetchPayments])

  /**
   * Order the next required action first (R13.1): an application whose fee is not
   * settled leads, and within each group the newest application leads. The
   * ordering reads the server's own projection — it does not re-derive payment
   * truth.
   */
  const orderedApplications = useMemo(
    () =>
      [...submittedApplications].sort((left, right) => {
        const leftSettled = isPaymentVerified(left.payment_status) ? 1 : 0
        const rightSettled = isPaymentVerified(right.payment_status) ? 1 : 0
        if (leftSettled !== rightSettled) return leftSettled - rightSettled
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      }),
    [submittedApplications],
  )

  const outstandingCount = submittedApplications.filter(
    (app) => !isPaymentVerified(app.payment_status),
  ).length
  const deferredCount = submittedApplications.filter(
    (app) => normalizePaymentStatus(app.payment_status) === 'deferred',
  ).length

  const loading = loadingApps || loadingPayments
  const seoTitle = `Payment | ${brandName}`

  if (loading) {
    return (
      <>
        <Seo
          title={seoTitle}
          description="Complete outstanding application fees and review your payment history."
          path="/student/payment"
          noindex
        />
        <PageShell title="Application payment" subtitle="Loading your payments…" eyebrow="Payments" tone="student">
          <SectionCard title="Your applications">
            <div className="space-y-4" role="status" aria-label="Loading payment information">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <SkeletonTable rows={3} columns={3} />
            </div>
          </SectionCard>
        </PageShell>
      </>
    )
  }

  return (
    <>
      <Seo
        title={seoTitle}
        description="Complete outstanding application fees and review your payment history."
        path="/student/payment"
        noindex
      />
      <PageShell
        title="Application payment"
        subtitle={
          outstandingCount > 0
            ? 'Complete an outstanding application fee, or check a payment that is still in progress.'
            : 'Your application fees and every payment attempt recorded against them.'
        }
        eyebrow="Payments"
        tone="student"
        actions={
          <Button asChild variant="outline" size="sm" className="min-h-touch">
            <Link to="/student/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        }
      >
        {appsError && (
          <ErrorDisplay
            variant="section"
            title="Unable to load your payments"
            message="We could not load your applications and payment history. Please try again."
            onRetry={() => void refetchApps()}
            className="mb-6"
          />
        )}

        <div className="space-y-6">
          {orderedApplications.length > 0 && (
            <SectionCard
              title="Your applications"
              description={
                outstandingCount > 0
                  ? `${outstandingCount} of ${orderedApplications.length} still needs a payment${
                      deferredCount > 0 ? ` — ${deferredCount} deferred` : ''
                    }.`
                  : 'Every application fee here is paid.'
              }
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              contentClassName="space-y-6"
            >
              {orderedApplications.map((app) => (
                <PaymentApplicationCard
                  key={app.id}
                  app={app}
                  records={paymentsByApp[app.id] ?? []}
                  isSelected={false}
                  support={support}
                  onPaymentRefresh={handlePaymentRefresh}
                />
              ))}
            </SectionCard>
          )}

          {/* Drafts are the wizard's job — hand the student back to it (R12.3). */}
          {orderedApplications.length === 0 && firstDraftId && !appsError && (
            <SectionCard title="Nothing to pay here yet" icon={<Wallet className="h-5 w-5" aria-hidden="true" />}>
              <EmptyState
                icon={<CreditCard />}
                heading="Your application fee is paid in the application form"
                description="You have an application in progress. The fee — and the option to pay later — is on the payment step, just before you submit."
                action={{
                  label: 'Continue your application',
                  onClick: () => navigate(studentApplicationResumePath(firstDraftId)),
                }}
              />
            </SectionCard>
          )}

          {orderedApplications.length === 0 && !firstDraftId && !appsError && (
            <SectionCard title="No payments yet" icon={<Wallet className="h-5 w-5" aria-hidden="true" />}>
              <EmptyState
                icon={<CreditCard />}
                heading="No application fees yet"
                description="Once you submit an application, its fee and every payment attempt against it appear here."
                action={{
                  label: 'Start an application',
                  onClick: () => navigate(studentApplicationNewPath()),
                }}
              />
            </SectionCard>
          )}

          {/* Support — resolved from tenant context, with a neutral platform fallback */}
          <SectionCard
            title="Need help with a payment?"
            description={support.description}
            icon={<Mail className="h-5 w-5" aria-hidden="true" />}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm" className="min-h-touch">
                {support.isExternal ? (
                  <a href={support.href} data-testid="payment-page-support" data-support-kind={support.kind}>
                    {support.label}
                  </a>
                ) : (
                  <Link to={support.href} data-testid="payment-page-support" data-support-kind={support.kind}>
                    {support.label}
                  </Link>
                )}
              </Button>
              {support.email && (
                <span className="font-mono text-sm text-muted-foreground">{support.email}</span>
              )}
            </div>
          </SectionCard>
        </div>
      </PageShell>
    </>
  )
}
