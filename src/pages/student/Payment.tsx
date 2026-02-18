/**
 * Payment Page
 * 
 * Displays payment information and lists applications with payment status.
 * Provides navigation to the Application Wizard for completing payments.
 * 
 * @requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.3
 */

import { useEffect, useState } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { applicationsApi } from '@/lib/apiClient'
import { useAuth } from '@/contexts/AuthContext'

interface ApplicationWithPayment {
  id: string
  status: string
  payment_status: string | null
  payment_method: string | null
  amount: number | null
  momo_ref: string | null
  created_at: string
  program: string | null
}

interface ApplicationsListPayload {
  applications: ApplicationWithPayment[]
  totalCount: number
  page: number
  pageSize: number
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
  switch (paymentStatus) {
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
        label: 'Pending Review',
        icon: <Clock className="h-3.5 w-3.5" />
      }
    default:
      return {
        variant: 'secondary',
        label: 'Not Paid',
        icon: <AlertCircle className="h-3.5 w-3.5" />
      }
  }
}

export default function PaymentPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingApplications, setPendingApplications] = useState<ApplicationWithPayment[]>([])
  const [allApplications, setAllApplications] = useState<ApplicationWithPayment[]>([])

  useEffect(() => {
    async function fetchApplications() {
      if (!user?.id) {
        setLoading(false)
        return
      }

      try {
        setError(null)
        
        // Fetch all applications for the user to show payment status
        // @requirements 2.1, 2.2 - Query and display applications with payment status
        // MIGRATED: Using API client instead of direct Supabase calls
        const response = await applicationsApi.list({ mine: true })

        if (!response.success) {
          throw new Error(response.error || 'Failed to load applications')
        }

        const payload = response.data as ApplicationsListPayload | ApplicationWithPayment[] | null | undefined
        const listData = payload && !Array.isArray(payload) && Array.isArray(payload.applications)
          ? payload.applications
          : (Array.isArray(payload) ? payload : [])

        const applications = listData.map((app) => ({
          id: app.id,
          status: app.status,
          payment_status: app.payment_status,
          payment_method: app.payment_method,
          amount: app.amount,
          momo_ref: app.momo_ref,
          created_at: app.created_at,
          program: app.program
        }))

        setAllApplications(applications)
        
        // Filter for pending payments (null or pending_review)
        // @requirements 2.1 - Query applications where payment_status is null or 'pending_review'
        const pending = applications.filter(
          app => app.payment_status === null || app.payment_status === 'pending_review'
        )
        setPendingApplications(pending)
      } catch (err) {
        console.error('Error fetching applications:', err)
        // @requirements 6.1 - Display error message on failure
        setError('Failed to load payment information. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchApplications()
  }, [user?.id])

  const handleContinueToWizard = () => {
    navigate('/student/application-wizard')
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
            Complete your application fee payment to proceed with your application.
          </p>
        </div>

        {/* Error Display */}
        {/* @requirements 6.1 - Display error message on failure */}
        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6">
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
                    Payment is required to submit your application
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
                  <li>Continue to the application wizard</li>
                  <li>Navigate to Step 3 (Payment Information)</li>
                  <li>Send <strong className="text-foreground">K153</strong> to the provided mobile money number</li>
                  <li>Upload your proof of payment</li>
                  <li>Complete and submit your application</li>
                </ol>
              </div>

              {/* @requirements 1.3 - Button to navigate to Application Wizard */}
              <Button 
                onClick={handleContinueToWizard}
                className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              >
                Continue to Application Wizard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Pending Applications - Applications needing payment */}
          {/* @requirements 1.4, 2.1, 2.2, 2.5 - List pending applications with status */}
          {pendingApplications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Applications Awaiting Payment
                </CardTitle>
                <CardDescription>
                  These applications need payment to be completed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingApplications.map((app) => {
                    const statusDisplay = getPaymentStatusDisplay(app.payment_status)
                    return (
                      <div 
                        key={app.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-warning/30 bg-warning/5 hover:bg-warning/10 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {app.program || 'Application'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={statusDisplay.variant} className="flex items-center gap-1">
                              {statusDisplay.icon}
                              {statusDisplay.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Status: {app.status}
                            </span>
                          </div>
                        </div>
                        {/* @requirements 2.5 - View Application button */}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewApplication(app.id)}
                          className="ml-3 flex-shrink-0"
                        >
                          View Application
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Applications with Payment Status */}
          {/* @requirements 2.3, 2.4 - Show verified and rejected payment status */}
          {allApplications.filter(app => app.payment_status === 'verified' || app.payment_status === 'rejected').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Payment History
                </CardTitle>
                <CardDescription>
                  Applications with completed payment processing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {allApplications
                    .filter(app => app.payment_status === 'verified' || app.payment_status === 'rejected')
                    .map((app) => {
                      const statusDisplay = getPaymentStatusDisplay(app.payment_status)
                      const isVerified = app.payment_status === 'verified'
                      const isRejected = app.payment_status === 'rejected'
                      
                      return (
                        <div 
                          key={app.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            isVerified 
                              ? 'border-success/30 bg-success/5 hover:bg-success/10' 
                              : 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {app.program || 'Application'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
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
                            {isRejected && (
                              <p className="text-xs text-destructive mt-1">
                                Payment was rejected. Please contact support or resubmit.
                              </p>
                            )}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewApplication(app.id)}
                            className="ml-3 flex-shrink-0"
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
                  <a href="mailto:admissions@mihas.edu.zm" className="text-primary hover:underline">
                    admissions@mihas.edu.zm
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
