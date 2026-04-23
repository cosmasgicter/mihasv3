import React from 'react'
import { Button } from '@/components/ui/Button'
import { XCircle, User, Clock, CheckCircle, Eye, AlertCircle } from 'lucide-react'
import type { ApplicationWithDetails } from './applicationDetailTypes'

interface ApplicationDetailHeaderProps {
  application: ApplicationWithDetails
  onClose: () => void
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved': return <CheckCircle className="h-5 w-5 text-accent" />
    case 'rejected': return <XCircle className="h-5 w-5 text-destructive" />
    case 'under_review': return <Eye className="h-5 w-5 text-accent" />
    case 'submitted': return <AlertCircle className="h-5 w-5 text-primary" />
    default: return <Clock className="h-5 w-5 text-foreground" />
  }
}

export function ApplicationDetailHeader({ application, onClose }: ApplicationDetailHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.95),rgba(255,255,255,0.88),rgba(224,242,254,0.82))] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-primary to-cyan-500 shadow-[0_18px_30px_-18px_rgba(37,99,235,0.72)] sm:h-12 sm:w-12">
            <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-xl font-bold text-foreground truncate" title={application.full_name}>
              {application.full_name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground sm:gap-3 sm:text-sm">
              <span className="font-mono truncate">#{application.application_number}</span>
              <span className="text-foreground hidden sm:inline">•</span>
              <div className="flex items-center gap-1">
                {getStatusIcon(application.status)}
                <span className="capitalize truncate">{application.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-9 w-9 flex-shrink-0 rounded-full border border-slate-200 bg-white/90 p-0 hover:bg-slate-50"
          aria-label="Close application details"
        >
          <XCircle className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
