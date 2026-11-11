import { Button } from '@/components/ui/Button'
import { XCircle, User, Clock, CheckCircle, Eye, AlertCircle, ArrowLeft } from 'lucide-react'
import type { ApplicationWithDetails } from './applicationDetailTypes'
import { formatApplicationStatus } from '@/types/applicationStatus'

interface ApplicationDetailHeaderProps {
  application: ApplicationWithDetails
  onClose: () => void
  /** `close` is the pane's X; `back` is the full-page review's way back to the queue. */
  variant?: 'close' | 'back'
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved': return <CheckCircle className="h-5 w-5 text-accent-foreground" />
    case 'rejected': return <XCircle className="h-5 w-5 text-destructive" />
    case 'under_review': return <Eye className="h-5 w-5 text-accent-foreground" />
    case 'submitted': return <AlertCircle className="h-5 w-5 text-primary" />
    default: return <Clock className="h-5 w-5 text-foreground" />
  }
}

export function ApplicationDetailHeader({ application, onClose, variant = 'close' }: ApplicationDetailHeaderProps) {
  const Heading = variant === 'back' ? 'h1' : 'h2'
  return (
    <div className="flex-shrink-0 border-b border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 sm:h-12 sm:w-12">
            <User className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            {/* As a page the applicant's name is the page heading; beside the queue it is not. */}
            <Heading className="break-words text-base font-bold text-foreground sm:text-xl">
              {application.full_name}
            </Heading>
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground sm:gap-3 sm:text-sm">
              <span className="break-all font-mono">#{application.application_number}</span>
              <span className="text-foreground hidden sm:inline">•</span>
              <div className="flex items-center gap-1">
                {getStatusIcon(application.status)}
                <span className="truncate">{formatApplicationStatus(application.status)}</span>
              </div>
            </div>
          </div>
        </div>
        {variant === 'back' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="min-h-touch flex-shrink-0 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to applications
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-11 w-11 flex-shrink-0 rounded-lg border border-border bg-card p-0 hover:bg-muted"
            aria-label="Close application details"
          >
            <XCircle className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  )
}
