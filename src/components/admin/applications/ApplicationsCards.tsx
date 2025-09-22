import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { formatDate, getStatusColor } from '@/lib/utils'
import { 
  Eye, CheckCircle, XCircle, Clock, AlertTriangle, FileText, 
  Bell, FileImage, History, Mail, GraduationCap, Calendar, FileCheck, Zap 
} from 'lucide-react'

interface ApplicationWithDetails {
  id: string
  application_number: string
  full_name: string
  email: string
  program: string
  intake: string
  status: string
  submitted_at?: string
  result_slip_url?: string
  extra_kyc_url?: string
  pop_url?: string
}

interface ApplicationsCardsProps {
  applications: ApplicationWithDetails[]
  selectedApplications: string[]
  updating: string | null
  onToggleSelection: (id: string) => void
  onViewDetails: (application: ApplicationWithDetails) => void
  onSendNotification: (application: ApplicationWithDetails) => void
  onViewDocuments: (application: ApplicationWithDetails) => void
  onViewHistory: (application: ApplicationWithDetails) => void
  onUpdateStatus: (id: string, status: string) => void
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'rejected':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'under_review':
      return <Clock className="h-4 w-4 text-primary" />
    case 'submitted':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'draft':
      return <FileText className="h-4 w-4 text-gray-500" />
    default:
      return <Clock className="h-4 w-4 text-secondary" />
  }
}

export function ApplicationsCards({
  applications,
  selectedApplications,
  updating,
  onToggleSelection,
  onViewDetails,
  onSendNotification,
  onViewDocuments,
  onViewHistory,
  onUpdateStatus
}: ApplicationsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      <AnimatePresence>
        {applications.map((application, index) => (
          <motion.div
            key={application.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.05 }}
          >
            <div 
              className="cursor-pointer"
              onClick={() => onToggleSelection(application.id)}
            >
              <AnimatedCard 
                className={`transition-all duration-300 card-mobile ${
                  selectedApplications.includes(application.id) 
                    ? 'ring-2 ring-primary bg-blue-50' 
                    : 'hover:shadow-xl'
                }`}
                hover3d
              >
                <div className="space-y-3 sm:space-y-4">
                  {/* Header - Mobile Optimized */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2 sm:space-x-3 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedApplications.includes(application.id)}
                        onChange={() => onToggleSelection(application.id)}
                        className="h-5 w-5 mt-1 text-primary focus:ring-primary border-gray-300 rounded touch-target"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base sm:text-lg text-secondary truncate">{application.full_name}</h3>
                        <p className="text-xs sm:text-sm text-secondary/70 font-mono">#{application.application_number}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-1 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2">
                      <div className="text-2xl sm:hidden">
                        {getStatusIcon(application.status)}
                      </div>
                      <div className="hidden sm:block">
                        {getStatusIcon(application.status)}
                      </div>
                      <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                        getStatusColor(application.status)
                      }`}>
                        {application.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Content - Mobile Optimized */}
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-secondary">
                      <Mail className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">{application.email}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-secondary">
                      <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">{application.program}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-secondary">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">{application.intake}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-secondary">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>Submitted {formatDate(application.submitted_at)}</span>
                    </div>
                    
                    {/* Documents - Mobile Optimized */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <div className="flex items-center space-x-2 text-xs sm:text-sm text-secondary">
                        <FileCheck className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>{(application.result_slip_url ? 1 : 0) + (application.extra_kyc_url ? 1 : 0) + (application.pop_url ? 1 : 0)} docs</span>
                      </div>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewDetails(application)
                          }}
                          className="touch-target p-2"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSendNotification(application)
                          }}
                          className="touch-target p-2"
                        >
                          <Bell className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewDocuments(application)
                          }}
                          className="touch-target p-2"
                        >
                          <FileImage className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewHistory(application)
                          }}
                          className="touch-target p-2"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Action Buttons - Mobile Optimized */}
                    <div className="flex space-x-2 pt-2">
                      {application.status === 'submitted' && (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={updating === application.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onUpdateStatus(application.id, 'under_review')
                          }}
                          className="btn-responsive text-blue-600 border-blue-300 hover:bg-blue-50"
                        >
                          <Zap className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Start Review</span>
                          <span className="sm:hidden">Review</span>
                        </Button>
                      )}
                      
                      {application.status === 'under_review' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            loading={updating === application.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              onUpdateStatus(application.id, 'approved')
                            }}
                            className="flex-1 text-green-600 border-green-300 hover:bg-green-50 btn-mobile"
                          >
                            <CheckCircle className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Approve</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            loading={updating === application.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              onUpdateStatus(application.id, 'rejected')
                            }}
                            className="flex-1 text-red-600 border-red-300 hover:bg-red-50 btn-mobile"
                          >
                            <XCircle className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Reject</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}