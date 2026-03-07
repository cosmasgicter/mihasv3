/**
 * Payment Page
 * 
 * Displays payment information and lists applications with payment status.
 * Provides navigation to the Application Wizard for completing payments.
 * 
 * @requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.3
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { 
  CreditCard, 
  ArrowRight, 
  FileText, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertCircle,
  ArrowLeft
} from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { applicationService } from '@/services/applications'
import { useAuth } from '@/contexts/AuthContext'
import { documentService } from '@/services/documents'
import { buildApplicationPaymentUpdate, validatePaymentStep } from './applicationWizard/lib/paymentFlow'
import {
  getPaymentStatusLabel,
  normalizePaymentStatus,
  requiresStudentPaymentAction,
} from '@/lib/paymentStatus'

interface ApplicationWithPayment {
  id: string
  status: string
  payment_status: string | null
  payment_method: string | null
  payer_name: string | null
  payer_phone: string | null
  amount: number | null
  paid_at: string | null
  momo_ref: string | null
  last_payment_audit_notes: string | null
  created_at: string
  program: string | null
}

interface ApplicationsListPayload {
  applications: ApplicationWithPayment[]
  totalCount: number
  page: number
  pageSize: number
}

interface PaymentCompletionForm {
  payment_method: string
  payer_name: string
  payer_phone: string
  amount: string
  paid_at: string
  momo_ref: string
  file: File | null
  error: string | null
}

function createDefaultPaymentForm(): PaymentCompletionForm {
  return {
    payment_method: 'MTN Money',
    payer_name: '',
    payer_phone: '',
    amount: '153',
    paid_at: '',
    momo_ref: '',
    file: null,
    error: null
  }
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Returns the appropriate badge variant and icon for a payment status
 * @requirements 2.3, 2.4 - Payment status indicators
 */
function getPaymentStatusDisplay(paymentStatus: string | null): {
  variant: 'success' | 'warning' | 'destructive' | 'secondary'
  label: string
  icon: React.ReactNode
} {
  switch (normalizePaymentStatus(paymentStatus)) {
    case 'verified':
      return {
        variant: 'success',
        label: 'Verified',
        icon: <CheckCircle className="h-3.5 w-3.5" />
      }
    case 'rejected':
      return {
        variant: 'destructive',
        label: 'Rejected',
        icon: <XCircle className="h-3.5 w-3.5" />
      }
    case 'pending_review':
      return {
        variant: 'warning',
        label: getPaymentStatusLabel(paymentStatus),
        icon: <Clock className="h-3.5 w-3.5" />
      }
    default:
      return {
        variant: 'secondary',
        label: getPaymentStatusLabel(paymentStatus),
        icon: <AlertCircle className="h-3.5 w-3.5" />
      }
  }
}

export default function PaymentPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allApplications, setAllApplications] = useState<ApplicationWithPayment[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null)
  const [submittingApplicationId, setSubmittingApplicationId] = useState<string | null>(null)
  const [paymentForms, setPaymentForms] = useState<Record<string, PaymentCompletionForm>>({})

  const paymentActionRequiredApplications = useMemo(
    () => allApplications.filter(app => requiresStudentPaymentAction(app.payment_status)),
    [allApplications]
  )

  const paymentAwaitingReviewApplications = useMemo(
    () => allApplications.filter(app => normalizePaymentStatus(app.payment_status) === 'pending_review'),
    [allApplications]
  )

  const paymentVerifiedApplications = useMemo(
    () => allApplications.filter(app => normalizePaymentStatus(app.payment_status) === 'verified'),
    [allApplications]
  )

  const getPaymentForm = (applicationId: string) => paymentForms[applicationId] || createDefaultPaymentForm()

  const updatePaymentForm = (applicationId: string, patch: Partial<PaymentCompletionForm>) => {
    setPaymentForms(prev => ({
      ...prev,
      [applicationId]: {
        ...createDefaultPaymentForm(),
        ...prev[applicationId],
        ...patch
      }
    }))
  }

  async function fetchApplications() {
    if (!user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      // Fetch all applications for the user to show payment status
      // @requirements 2.1, 2.2 - Query and display applications with payment status
      // Uses new API client which auto-unwraps the { success, data } envelope
      const response = await applicationService.list({ mine: true })

      // The new client returns the unwrapped payload directly (PaginatedApplicationsResponse)
      // Defensive check: handle paginated object, plain array, or null/undefined
      type ListPayload = ApplicationsListPayload | ApplicationWithPayment[] | null | undefined
      const payload = response as ListPayload
      const listData = payload && !Array.isArray(payload) && Array.isArray(payload.applications)
        ? payload.applications
        : (Array.isArray(payload) ? payload : [])

      const applications = listData.map((app) => ({
        id: app.id,
        status: app.status,
        payment_status: app.payment_status,
        payment_method: app.payment_method,
        payer_name: (app as any).payer_name ?? null,
        payer_phone: (app as any).payer_phone ?? null,
        amount: app.amount,
        paid_at: (app as any).paid_at ?? null,
        momo_ref: app.momo_ref,
        last_payment_audit_notes: (app as any).last_payment_audit_notes ?? null,
        created_at: app.created_at,
        program: app.program
      }))

      setAllApplications(applications)
    } catch (err) {
      console.error('Error fetching applications:', err)
      // @requirements 6.1 - Display error message on failure
      setError('Failed to load payment information. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchApplications()
  }, [user?.id])

  const handleContinueToWizard = () => {
    navigate('/student/application-wizard')
  }

  const handleTogglePaymentForm = (applicationId: string) => {
    const application = allApplications.find(item => item.id === applicationId)
    setExpandedApplicationId(prev => (prev === applicationId ? null : applicationId))
    setPaymentForms(prev => {
      if (prev[applicationId]) {
        return prev
      }

      const seededForm = createDefaultPaymentForm()
      if (!application) {
        return { ...prev, [applicationId]: seededForm }
      }

      return {
        ...prev,
        [applicationId]: {
          ...seededForm,
          payment_method: application.payment_method || seededForm.payment_method,
          payer_name: application.payer_name || '',
          payer_phone: application.payer_phone || '',
          amount: application.amount ? String(application.amount) : seededForm.amount,
          paid_at: toDateTimeLocalValue(application.paid_at),
          momo_ref: application.momo_ref || '',
        }
      }
    })
  }

  const handleSubmitDeferredPayment = async (applicationId: string) => {
    if (!user?.id) {
      setError('Please sign in again to complete payment.')
      return
    }

    const form = getPaymentForm(applicationId)
    const amount = Number(form.amount)
    const setFormError = (message: string | null) => updatePaymentForm(applicationId, { error: message })

    const isValid = validatePaymentStep({
      formData: {
        payment_option: 'pay_now',
        payment_method: form.payment_method as any,
        payer_name: form.payer_name,
        payer_phone: form.payer_phone,
        amount,
        paid_at: form.paid_at,
        momo_ref: form.momo_ref,
      } as any,
      proofOfPaymentFile: form.file,
      setError: () => setFormError(null),
      showError: (message) => setFormError(message),
    })

    if (!isValid || !form.file) {
      return
    }

    try {
      setSubmittingApplicationId(applicationId)
      setFormError(null)
      setError(null)

      const uploadResult = await documentService.upload({
        file: form.file,
        fileType: 'proof_of_payment',
        applicationId,
        userId: user.id,
      }) as { url?: string }

      if (!uploadResult?.url) {
        throw new Error('Upload completed without a document URL')
      }

      const paymentUpdate = buildApplicationPaymentUpdate({
        payment_option: 'pay_now',
        payment_method: form.payment_method as any,
        payer_name: form.payer_name,
        payer_phone: form.payer_phone,
        amount,
        paid_at: form.paid_at,
        momo_ref: form.momo_ref,
      } as any, { markPendingReview: true })

      await applicationService.update(applicationId, {
        ...paymentUpdate,
        pop_url: uploadResult.url,
      } as any)

      setNotice('Payment proof submitted for review.')
      setExpandedApplicationId(null)
      setPaymentForms(prev => {
        const next = { ...prev }
        delete next[applicationId]
        return next
      })
      await fetchApplications()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to submit payment'
      setFormError(message)
    } finally {
      setSubmittingApplicationId(null)
    }
  }

  const handleViewApplication = (applicationId: string) => {
    navigate(`/student/application/${applicationId}`)
  }

  // @requirements 6.3 - Display loading spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading payment information...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <Container size="md">
        {/* Back to Dashboard link */}
        <div className="mb-6">
          <Link 
            to="/student/dashboard" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Application Payment
          </h1>
          <p className="text-muted-foreground">
            Pay before submission or return here later to upload proof for any submitted application that still needs payment follow-up.
          </p>
        </div>

        {notice && (
          <Card className="mb-6 border-success/50 bg-success/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-success">
                  <CheckCircle className="h-5 w-5 flex-shrink-0" />
                  <p>{notice}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setNotice(null)}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {/* @requirements 6.1 - Display error message on failure */}
        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-destructive">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchApplications}
                  className="flex-shrink-0"
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6">
          {allApplications.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-warning/30 bg-warning/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-warning" />
                    <div>
                      <p className="text-sm text-muted-foreground">Payment Action Required</p>
                      <p className="text-2xl font-bold text-foreground">{paymentActionRequiredApplications.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Awaiting Review</p>
                      <p className="text-2xl font-bold text-foreground">{paymentAwaitingReviewApplications.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-success/30 bg-success/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm text-muted-foreground">Verified Payments</p>
                      <p className="text-2xl font-bold text-foreground">{paymentVerifiedApplications.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main Payment Card */}
          {/* @requirements 1.2, 1.3 - Display K153 fee and payment instructions */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Complete Your Payment</CardTitle>
                  <CardDescription>
                    You can pay in the wizard before submission or come back here later to finish payment for a submitted application.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Fee Amount - Prominently displayed */}
              <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Application Fee</span>
                  <span className="text-2xl font-bold text-primary">K153</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Non-refundable application processing fee
                </p>
              </div>

              <div className="bg-card rounded-lg p-4 border border-border">
                <h3 className="font-medium text-foreground mb-2">Payment Instructions</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Continue to the application wizard and choose whether to pay now or pay later</li>
                  <li>If you want to submit first, select <strong className="text-foreground">Pay later</strong> in Step 3</li>
                  <li>Send <strong className="text-foreground">K153</strong> to the provided mobile money number</li>
                  <li>Upload your proof of payment in the wizard or come back to this page later after submission</li>
                  <li>Admissions and finance will review the proof before final payment clearance</li>
                </ol>
              </div>

              {/* @requirements 1.3 - Button to navigate to Application Wizard */}
              <Button 
                onClick={handleContinueToWizard}
                className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 min-h-[44px]"
              >
                Continue to Application Wizard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Applications requiring student payment action */}
          {/* @requirements 1.4, 2.1, 2.2, 2.5 - List pending applications with status */}
          {paymentActionRequiredApplications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Payment Action Required
                </CardTitle>
                <CardDescription>
                  These applications still need proof of payment or a corrected resubmission.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {paymentActionRequiredApplications.map((app) => {
                    const statusDisplay = getPaymentStatusDisplay(app.payment_status)
                    const form = getPaymentForm(app.id)
                    const canCompletePaymentHere = requiresStudentPaymentAction(app.payment_status)
                    const isExpanded = expandedApplicationId === app.id
                    const isSubmitting = submittingApplicationId === app.id
                    const normalizedPaymentStatus = normalizePaymentStatus(app.payment_status)
                    const isRejected = normalizedPaymentStatus === 'rejected'
                    const cardToneClass = isRejected
                      ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                      : 'border-warning/30 bg-warning/5 hover:bg-warning/10'

                    return (
                      <div 
                        key={app.id}
                        className={`rounded-lg border p-3 transition-colors ${cardToneClass}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {app.program || 'Application'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <Badge variant={statusDisplay.variant} className="flex items-center gap-1">
                                {statusDisplay.icon}
                                {statusDisplay.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Status: {app.status}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {normalizedPaymentStatus === 'not_paid'
                                ? 'This application was submitted without payment. Upload proof here when you are ready.'
                                : normalizedPaymentStatus === 'rejected'
                                  ? 'Your previous payment proof was rejected. Update the details below and resubmit for review.'
                                  : 'Payment proof has been submitted and is waiting for review.'}
                            </p>
                            {isRejected && app.last_payment_audit_notes && (
                              <div className="mt-2 rounded-md border border-destructive/20 bg-background/80 px-3 py-2 text-xs text-foreground">
                                <span className="font-medium text-destructive">Review note:</span>{' '}
                                {app.last_payment_audit_notes}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            {canCompletePaymentHere && (
                              <Button
                                variant={isExpanded ? 'outline' : 'default'}
                                size="sm"
                                onClick={() => handleTogglePaymentForm(app.id)}
                                className="min-h-[44px]"
                              >
                                {isExpanded
                                  ? 'Hide Payment Form'
                                  : isRejected
                                    ? 'Resubmit Payment'
                                    : 'Complete Payment'}
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleViewApplication(app.id)}
                              className="min-h-[44px]"
                            >
                              View Application
                            </Button>
                          </div>
                        </div>

                        {canCompletePaymentHere && isExpanded && (
                          <div className={`mt-4 border-t pt-4 ${isRejected ? 'border-destructive/20' : 'border-warning/20'}`}>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`payment-method-${app.id}`}>Payment Method</Label>
                                <select
                                  id={`payment-method-${app.id}`}
                                  value={form.payment_method}
                                  onChange={(event) => updatePaymentForm(app.id, { payment_method: event.target.value, error: null })}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                  <option value="MTN Money">MTN Money</option>
                                  <option value="Airtel Money">Airtel Money</option>
                                  <option value="Zamtel Money">Zamtel Money</option>
                                  <option value="Ewallet">Ewallet</option>
                                  <option value="Bank To Cell">Bank To Cell</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`payer-name-${app.id}`}>Payer Name</Label>
                                <Input
                                  id={`payer-name-${app.id}`}
                                  value={form.payer_name}
                                  onChange={(event) => updatePaymentForm(app.id, { payer_name: event.target.value, error: null })}
                                  placeholder="Name used for the payment"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`payer-phone-${app.id}`}>Payer Phone</Label>
                                <Input
                                  id={`payer-phone-${app.id}`}
                                  value={form.payer_phone}
                                  onChange={(event) => updatePaymentForm(app.id, { payer_phone: event.target.value, error: null })}
                                  placeholder="Phone number used for payment"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`amount-${app.id}`}>Amount Paid</Label>
                                <Input
                                  id={`amount-${app.id}`}
                                  type="number"
                                  min={153}
                                  value={form.amount}
                                  onChange={(event) => updatePaymentForm(app.id, { amount: event.target.value, error: null })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`paid-at-${app.id}`}>Payment Date &amp; Time</Label>
                                <Input
                                  id={`paid-at-${app.id}`}
                                  type="datetime-local"
                                  value={form.paid_at}
                                  onChange={(event) => updatePaymentForm(app.id, { paid_at: event.target.value, error: null })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`momo-ref-${app.id}`}>Reference Number</Label>
                                <Input
                                  id={`momo-ref-${app.id}`}
                                  value={form.momo_ref}
                                  onChange={(event) => updatePaymentForm(app.id, { momo_ref: event.target.value, error: null })}
                                  placeholder="Transaction reference"
                                />
                              </div>
                            </div>

                            <div className="mt-4 space-y-2">
                              <Label htmlFor={`proof-${app.id}`}>Proof of Payment</Label>
                              <Input
                                id={`proof-${app.id}`}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(event) => updatePaymentForm(app.id, {
                                  file: event.target.files?.[0] || null,
                                  error: null
                                })}
                              />
                              <p className="text-xs text-muted-foreground">
                                Upload a screenshot or PDF of your payment confirmation.
                              </p>
                            </div>

                            {form.error && (
                              <p className="mt-3 text-sm text-destructive">{form.error}</p>
                            )}

                            <div className="mt-4 flex flex-col sm:flex-row gap-2">
                              <Button
                                onClick={() => handleSubmitDeferredPayment(app.id)}
                                loading={isSubmitting}
                                className="min-h-[44px]"
                              >
                                Submit Payment for Review
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleTogglePaymentForm(app.id)}
                                disabled={isSubmitting}
                                className="min-h-[44px]"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {paymentAwaitingReviewApplications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Payment Under Review
                </CardTitle>
                <CardDescription>
                  Proof has been received for these applications and is waiting for admissions or finance review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {paymentAwaitingReviewApplications.map((app) => {
                    const statusDisplay = getPaymentStatusDisplay(app.payment_status)

                    return (
                      <div
                        key={app.id}
                        className="rounded-lg border border-primary/20 bg-primary/5 p-3 transition-colors hover:bg-primary/10"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {app.program || 'Application'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant={statusDisplay.variant} className="flex items-center gap-1">
                                {statusDisplay.icon}
                                {statusDisplay.label}
                              </Badge>
                              {app.payment_method && (
                                <span className="text-xs text-muted-foreground">
                                  via {app.payment_method}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Your proof has already been submitted. No further payment action is needed until review is complete.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewApplication(app.id)}
                            className="min-h-[44px] w-full sm:w-auto"
                          >
                            View Application
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Applications with Payment Status */}
          {/* @requirements 2.3, 2.4 - Show verified and rejected payment status */}
          {paymentVerifiedApplications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Payment History
                </CardTitle>
                <CardDescription>
                  Payments already verified and cleared for processing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {paymentVerifiedApplications.map((app) => {
                      const statusDisplay = getPaymentStatusDisplay(app.payment_status)
                      const isVerified = app.payment_status === 'verified'
                      
                      return (
                        <div 
                          key={app.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                            isVerified 
                              ? 'border-success/30 bg-success/5 hover:bg-success/10' 
                              : 'border-border bg-card'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {app.program || 'Application'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {/* @requirements 2.3 - Success indicator for verified */}
                              {/* @requirements 2.4 - Rejection indicator for rejected */}
                              <Badge variant={statusDisplay.variant} className="flex items-center gap-1">
                                {statusDisplay.icon}
                                {statusDisplay.label}
                              </Badge>
                              {app.payment_method && (
                                <span className="text-xs text-muted-foreground">
                                  via {app.payment_method}
                                </span>
                              )}
                            </div>
                            {/* Show rejection reason hint for rejected payments */}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewApplication(app.id)}
                            className="flex-shrink-0 min-h-[44px] w-full sm:w-auto"
                          >
                            View
                          </Button>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State - No applications */}
          {allApplications.length === 0 && !error && (
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Applications Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start your application to see payment information here.
                  </p>
                  <Button onClick={handleContinueToWizard}>
                    Start Application
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help Card */}
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Need help with payment?
                </p>
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
      </Container>
    </div>
  )
}
