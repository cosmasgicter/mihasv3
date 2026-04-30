import React from 'react'
import { GraduationCap, Calendar, Clock, Share2, Copy, Download, Mail, Trophy, XCircle, Target, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { getStatusEmoji, formatDisplayDate } from '../utils/trackerUtils'
import { animateClasses } from '@/lib/animations'

interface ApplicationStatusHeaderProps {
  application: PublicApplicationStatus
  copied: boolean
  slipLoading: boolean
  emailLoading: boolean
  onShare: () => void
  onCopy: () => void
  onDownloadSlip: () => void
  onEmailSlip: () => void
}

const STATUS_STEPS = ['submitted', 'under_review', 'approved'] as const

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved': return <Trophy className="h-5 w-5" />
    case 'rejected': return <XCircle className="h-5 w-5" />
    case 'under_review': return <Target className="h-5 w-5" />
    case 'submitted': return <Rocket className="h-5 w-5" />
    default: return <Clock className="h-5 w-5" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved': return 'text-emerald-300'
    case 'rejected': return 'text-rose-300'
    case 'under_review': return 'text-sky-300'
    case 'submitted': return 'text-amber-300'
    default: return 'text-white/60'
  }
}

function StepIndicator({ currentStatus }: { currentStatus: string }) {
  const isRejected = currentStatus === 'rejected'
  const currentIdx = STATUS_STEPS.indexOf(currentStatus as typeof STATUS_STEPS[number])

  return (
    <div className="flex items-center gap-1 w-full max-w-xs" aria-label="Application progress">
      {STATUS_STEPS.map((step, i) => {
        const isActive = !isRejected && i <= currentIdx
        return (
          <React.Fragment key={step}>
            <div
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                isRejected ? 'bg-rose-400/40' : isActive ? 'bg-white' : 'bg-white/20'
              }`}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
}

export const ApplicationStatusHeader: React.FC<ApplicationStatusHeaderProps> = ({
  application,
  copied,
  slipLoading,
  emailLoading,
  onShare,
  onCopy,
  onDownloadSlip,
  onEmailSlip
}) => {
  return (
    <div className="border-b border-slate-200 bg-slate-950 p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        {/* Left — Application Info */}
        <div className="flex-1 space-y-4">
          <div className={animateClasses.fadeIn}>
            <p className="text-xs font-medium uppercase tracking-widest text-white/50 mb-2">Application</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span className="text-2xl">{getStatusEmoji(application.status)}</span>
              <span className="break-all font-mono">#{application.application_number}</span>
            </h2>
          </div>
          
          <div className={`space-y-1.5 ${animateClasses.fadeIn}`} style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
            <p className="text-white/90 text-base sm:text-lg font-medium flex items-center gap-2">
              <GraduationCap className="h-5 w-5 flex-shrink-0 text-white/60" />
              <span className="break-words">{application.program_name}</span>
            </p>
            <p className="text-white/70 text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 flex-shrink-0 text-white/50" />
              <span className="break-words">{application.intake_name}</span>
            </p>
          </div>

          {/* Step Indicator */}
          <div className="pt-2">
            <StepIndicator currentStatus={application.status} />
          </div>
        </div>
        
        {/* Right — Status & Actions */}
        <div className={`flex flex-col items-center lg:items-end gap-4 ${animateClasses.fadeIn}`} style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
          {/* Status Badge */}
          <div className={`inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 ${getStatusColor(application.status)}`}>
            {getStatusIcon(application.status)}
            <span className="text-sm font-bold uppercase tracking-wide text-white">
              {application.status.replace('_', ' ')}
            </span>
          </div>
          
          <p className="text-white/50 text-xs flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Updated {formatDisplayDate(application.updated_at)}
          </p>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center lg:justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onShare} className="rounded-lg bg-white/10 border-white/20 text-white hover:bg-white/20">
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={onCopy} className="rounded-lg bg-white/10 border-white/20 text-white hover:bg-white/20">
              <Copy className="h-4 w-4 mr-1.5" />
              {copied ? 'Copied!' : 'Copy #'}
            </Button>
          </div>
          
          <div className="flex flex-wrap justify-center lg:justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onDownloadSlip} loading={slipLoading} className="rounded-lg bg-white/10 border-white/20 text-white hover:bg-white/20">
              <Download className="h-4 w-4 mr-1.5" />
              Download Slip
            </Button>
            <Button variant="outline" size="sm" onClick={onEmailSlip} loading={emailLoading} className="rounded-lg bg-white/10 border-white/20 text-white hover:bg-white/20">
              <Mail className="h-4 w-4 mr-1.5" />
              Email Slip
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
