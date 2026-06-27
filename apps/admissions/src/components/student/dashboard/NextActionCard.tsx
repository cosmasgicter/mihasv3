import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { FileText, Clock, AlertCircle, Calendar, CheckCircle } from 'lucide-react'
import { studentApplicationLocalResumePath, studentApplicationNewPath, studentApplicationResumePath } from '@/routes/routeRegistry'

interface NextActionCardProps {
  totalDraftCount: number
  hasPendingPayment: boolean
  hasScheduledInterview: boolean
  scheduledInterviewsCount: number
  submittedCount: number
  latestDraftId?: string | null
}

export function NextActionCard({
  totalDraftCount,
  hasPendingPayment,
  hasScheduledInterview,
  scheduledInterviewsCount,
  submittedCount,
  latestDraftId,
}: NextActionCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          totalDraftCount > 0
            ? 'bg-muted text-muted-foreground'
            : hasPendingPayment
              ? 'bg-warning/10 text-warning'
              : hasScheduledInterview
                ? 'bg-primary/10 text-primary'
                : submittedCount > 0
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
        }`}>
          {totalDraftCount > 0
            ? <><Clock className="h-3 w-3" /> Draft</>
            : hasPendingPayment
              ? <><AlertCircle className="h-3 w-3" /> Payment</>
              : hasScheduledInterview
                ? <><Calendar className="h-3 w-3" /> Interview</>
                : submittedCount > 0
                  ? <><CheckCircle className="h-3 w-3" /> Submitted</>
                  : <><FileText className="h-3 w-3" /> New</>}
        </span>
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {totalDraftCount > 0
          ? 'Finish your saved application draft'
          : hasPendingPayment
            ? 'Resolve the pending payment'
            : hasScheduledInterview
              ? 'Prepare for your scheduled interview'
              : submittedCount > 0
                ? 'Monitor your submitted application'
                : 'Start a new application'}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {totalDraftCount > 0
          ? 'Open the draft and complete the remaining fields before submission.'
          : hasPendingPayment
            ? 'Review the payment section so admissions can continue processing your application.'
            : hasScheduledInterview
              ? 'Check your interview schedule and any required preparation notes.'
              : submittedCount > 0
                ? 'Keep an eye on status updates, document requests, and admissions decisions.'
                : 'Create your first application and save progress as you go.'}
      </p>
      <div className="mt-5">
        <Button variant="primary" size="lg" className="min-h-[48px] px-6 text-base font-semibold shadow-sm" asChild>
          <Link to={
            totalDraftCount > 0
              ? latestDraftId
                ? studentApplicationResumePath(latestDraftId)
                : studentApplicationLocalResumePath()
              : hasPendingPayment
                ? '/student/payment'
                : hasScheduledInterview
                  ? '/student/interview'
                  : submittedCount > 0
                    ? '/student/status'
                    : studentApplicationNewPath()
          }>
            {totalDraftCount > 0
              ? 'Continue draft'
              : hasPendingPayment
                ? 'Resolve payment'
                : hasScheduledInterview
                  ? 'View interview'
                  : submittedCount > 0
                    ? 'View status'
                    : 'Start application'}
          </Link>
        </Button>
      </div>
    </div>
  )
}
