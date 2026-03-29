import React from 'react'
import { animateClasses, staggerChild } from '@/lib/animations'
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
      <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-blue-500 to-blue-600 text-white col-span-2 sm:col-span-1">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-xs sm:text-sm font-medium">Total</p>
            <p className="text-xl sm:text-3xl font-bold">{stats.total}</p>
          </div>
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-blue-200" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-muted-foreground to-foreground text-white">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-foreground text-xs sm:text-sm font-medium">Draft</p>
            <p className="text-xl sm:text-3xl font-bold">{stats.draft}</p>
          </div>
          <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-foreground" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-yellow-100 text-xs sm:text-sm font-medium">Submitted</p>
            <p className="text-xl sm:text-3xl font-bold">{stats.submitted}</p>
          </div>
          <Send className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-200" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-purple-500 to-indigo-500 text-white">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-100 text-xs sm:text-sm font-medium">Review</p>
            <p className="text-xl sm:text-3xl font-bold">{stats.under_review}</p>
          </div>
          <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-purple-200" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-green-500 to-emerald-500 text-white">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-100 text-xs sm:text-sm font-medium">Approved</p>
            <p className="text-xl sm:text-3xl font-bold">{stats.approved}</p>
          </div>
          <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-200" />
        </div>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-red-500 to-pink-500 text-white">
        <div className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-red-100 text-xs sm:text-sm font-medium">Rejected</p>
            <p className="text-xl sm:text-3xl font-bold">{stats.rejected}</p>
          </div>
          <XCircle className="h-6 w-6 sm:h-8 sm:w-8 text-red-200" />
        </div>
        </div>
      </div>
    </div>
  )
}