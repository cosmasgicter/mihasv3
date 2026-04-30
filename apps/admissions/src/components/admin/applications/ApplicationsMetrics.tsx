import React from 'react'
import { animateClasses } from '@/lib/animations'
import { Users, FileText, Send, Clock, CheckCircle, XCircle } from 'lucide-react'

interface ApplicationStats {
  total: number
  draft: number
  submitted: number
  under_review: number
  approved: number
  rejected: number
}

interface ApplicationsMetricsProps {
  stats: ApplicationStats | null
  show: boolean
}

export function ApplicationsMetrics({ stats, show }: ApplicationsMetricsProps) {
  if (!show || !stats) return null

  return (
    <div 
      className={`${animateClasses.slideUp} opacity-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-6 mb-6 sm:mb-8`}
    >
      <div className="relative col-span-2 overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-colors duration-200 hover:bg-muted/30 sm:col-span-1">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">Total</p>
            <p className="text-xl font-bold text-foreground sm:text-3xl">{stats.total}</p>
          </div>
          <Users className="h-6 w-6 text-primary sm:h-8 sm:w-8" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-colors duration-200 hover:bg-muted/30">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">Draft</p>
            <p className="text-xl font-bold text-foreground sm:text-3xl">{stats.draft}</p>
          </div>
          <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-foreground" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-colors duration-200 hover:bg-muted/30">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">Submitted</p>
            <p className="text-xl font-bold text-foreground sm:text-3xl">{stats.submitted}</p>
          </div>
          <Send className="h-6 w-6 text-amber-600 sm:h-8 sm:w-8" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-colors duration-200 hover:bg-muted/30">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">Review</p>
            <p className="text-xl font-bold text-foreground sm:text-3xl">{stats.under_review}</p>
          </div>
          <Clock className="h-6 w-6 text-blue-600 sm:h-8 sm:w-8" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-colors duration-200 hover:bg-muted/30">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">Approved</p>
            <p className="text-xl font-bold text-foreground sm:text-3xl">{stats.approved}</p>
          </div>
          <CheckCircle className="h-6 w-6 text-success sm:h-8 sm:w-8" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-colors duration-200 hover:bg-muted/30">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">Rejected</p>
            <p className="text-xl font-bold text-foreground sm:text-3xl">{stats.rejected}</p>
          </div>
          <XCircle className="h-6 w-6 text-destructive sm:h-8 sm:w-8" />
        </div>
        </div>
      </div>
    </div>
  )
}
