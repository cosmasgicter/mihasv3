import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/dateFormat'
import { User, Clock, CheckCircle, FileText, CreditCard, Mail, Phone, Calendar, MapPin, Users, GraduationCap, Building, AlertCircle, Download, Send, History, Eye, MessageSquare, Shield, Tag, AlertTriangle, ClipboardList } from 'lucide-react'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { logApiError } from '@/lib/apiErrorLogger'
import { Skeleton } from '@/components/ui'
import { calculateBestFivePoints, sanitizeGradeValue } from '@/lib/grades'
import { SendNotificationModal } from './SendNotificationModal'
import AdminCommunicationsPanel from '@/components/admin/AdminCommunicationsPanel'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { getPaymentStatusLabel } from '@/lib/paymentStatus'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'
import { CapacityWarning } from './CapacityWarning'
import { ApplicationDetailHeader } from './ApplicationDetailHeader'
import { ApplicationDetailTimeline } from './ApplicationDetailTimeline'
import { ApplicationDetailDocuments } from './ApplicationDetailDocuments'
import { ApplicationDetailPayment, FeeWaiverDialog } from './ApplicationDetailPayment'
import { ApplicationDetailInterview } from './ApplicationDetailInterview'
import type {
  ApplicationWithDetails,
  ApplicationDetailResponse,
  PaymentRecord,
  PaymentListResponse,
  Grade,
} from './applicationDetailTypes'
import { getInstitutionName } from './applicationDetailTypes'

interface ApplicationDetailModalProps {
 application: ApplicationWithDetails | null
 show: boolean
 updating: string | null
 onClose: () => void
 onSendNotification: (title: string, message: string) => Promise<void>
 onViewDocuments: () => void
 onViewHistory: () => void
 onUpdateStatus: (id: string, status: string, options?: { notes?: string; force?: boolean }) => Promise<any>
 onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => Promise<void>
 onGenerateAcceptanceLetter: () => Promise<void>
 onGenerateFinanceReceipt: () => Promise<void>
}

function GradesDisplay({ grades, loading }: { grades: Grade[], loading: boolean }) {
 if (loading) {
 return (
 <div className="space-y-4" role="status" aria-label="Loading grades">
 <div className="flex justify-between p-4 bg-blue-50 rounded-lg">
 <Skeleton className="h-5 w-24" />
 <Skeleton className="h-6 w-12" />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="flex justify-between p-3 border rounded-lg">
 <Skeleton className="h-4 w-28" />
 <Skeleton className="h-6 w-10 rounded-full" />
 </div>
 ))}
 </div>
 </div>
 )
 }

 if (grades.length === 0) {
 return (
 <div className="text-center py-8 text-foreground">
 <GraduationCap className="h-8 w-8 mx-auto mb-2 text-foreground" />
 <p className="text-sm">No grades recorded</p>
 </div>
 )
 }

 const normalizedGrades = grades
 .map(grade => ({
 ...grade,
 normalized: sanitizeGradeValue(grade.grade)
 }))
 .filter((grade): grade is Grade & { normalized: number } => grade.normalized !== null)

 const bestFiveGrades = normalizedGrades
 .sort((a, b) => a.normalized - b.normalized)
 .slice(0, 5)

 const bestFiveSubjectIds = new Set(bestFiveGrades.map(grade => grade.subject_id))
 const totalPoints = calculateBestFivePoints(normalizedGrades.map(grade => grade.normalized))

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
 <div>
 <p className="text-sm font-medium text-foreground">{grades.length} Subjects</p>
 <p className="text-xs text-info-strong">Grade 12 Results</p>
 </div>
 <div className="text-right">
 <p className="text-lg font-bold text-foreground">{totalPoints}</p>
 <p className="text-xs text-info-strong">Points (Best 5)</p>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {grades.map((grade, index) => {
 const normalized = sanitizeGradeValue(grade.grade)
 const isBestFive = normalized !== null && bestFiveSubjectIds.has(grade.subject_id)
 return (
 <div key={index} className={`flex justify-between items-center p-3 border rounded-lg ${
 isBestFive ? 'bg-green-50 border-green-200' : 'bg-card border-border'
 }`}>
 <div>
 <span className="font-medium text-foreground">{grade.subject_name}</span>
 {isBestFive && <span className="ml-2 text-xs text-accent font-medium">BEST 5</span>}
 </div>
 <span className={`px-3 py-1 rounded-full text-sm font-bold ${
 normalized !== null && normalized <= 3 ? 'bg-green-100 text-green-900' :
 normalized !== null && normalized <= 6 ? 'bg-green-100 text-green-900' :
 'bg-red-100 text-red-900'
 }`}>
 {grade.grade}
 </span>
 </div>
 )
 })}
 </div>
 </div>
 )
}


export function ApplicationDetailModal({
 application,
 show,
 updating,
 onClose,
 onSendNotification,
 onViewDocuments,
 onViewHistory,
 onUpdateStatus,
 onPaymentStatusUpdate,
 onGenerateAcceptanceLetter,
 onGenerateFinanceReceipt
}: ApplicationDetailModalProps) {
 const [isClient, setIsClient] = useState(false)
 const [isGeneratingAcceptance, setIsGeneratingAcceptance] = useState(false)
 const [isGeneratingFinanceReceipt, setIsGeneratingFinanceReceipt] = useState(false)
 const [activeTab, setActiveTab] = useState<'overview' | 'interview' | 'grades' | 'documents' | 'communications' | 'history'>('overview')
 const [applicationData, setApplicationData] = useState<ApplicationDetailResponse | null>(null)
 const [loading, setLoading] = useState(false)
 const [adminFeedback, setAdminFeedback] = useState('')
 const [savingFeedback, setSavingFeedback] = useState(false)
 const [showNotificationModal, setShowNotificationModal] = useState(false)
 const [paymentWarning, setPaymentWarning] = useState<{ applicationId: string; status: string } | null>(null)
 const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([])
 const [loadingPayments, setLoadingPayments] = useState(false)
 const [feeWaiverOpen, setFeeWaiverOpen] = useState(false)
 const [savingFeeWaiver, setSavingFeeWaiver] = useState(false)
 const focusTrapRef = useFocusTrap(show && !!application)
 useEscapeKey(show && !!application, onClose)

 // Client-side rendering guard to prevent hydration mismatch
 useEffect(() => {
 setIsClient(true)
 }, [])

 const loadPaymentRecords = useCallback(async (applicationId: string): Promise<PaymentRecord[]> => {
   const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
     `/payments/?application_id=${encodeURIComponent(applicationId)}`
   )
   return Array.isArray(data) ? data : (data?.results ?? [])
 }, [])

 const loadApplicationDetails = useCallback(async (applicationId: string): Promise<ApplicationDetailResponse> => {
   const response = await applicationService.getById(applicationId, {
     include: ['grades', 'statusHistory', 'documents', 'interview']
   })

   const payload: any = response || {}
   const primaryApplication = payload?.application || application

   return {
     application: primaryApplication,
     grades: payload?.grades || [],
     statusHistory: payload?.statusHistory || [],
     documents: payload?.documents || [],
     interview: payload?.interview || payload?.application?.interview || null
   }
 }, [application])

 const refreshModalData = useCallback(async (applicationId: string) => {
   setLoading(true)
   setLoadingPayments(true)

   const [detailsResult, paymentsResult] = await Promise.allSettled([
     loadApplicationDetails(applicationId),
     loadPaymentRecords(applicationId),
   ])

   if (detailsResult.status === 'fulfilled') {
     setApplicationData(detailsResult.value)
   } else {
     logApiError('admin-application-detail', `/applications/${applicationId}/details/`, detailsResult.reason)
     setApplicationData({
       application: application!,
       grades: [],
       statusHistory: [],
       documents: [],
       interview: null
     })
   }

   if (paymentsResult.status === 'fulfilled') {
     setPaymentRecords(paymentsResult.value)
   } else {
     logApiError('admin-application-detail', `/payments/?application_id=${applicationId}`, paymentsResult.reason)
     setPaymentRecords([])
   }

   setLoading(false)
   setLoadingPayments(false)
 }, [application, loadApplicationDetails, loadPaymentRecords])

 useEffect(() => {
 setIsGeneratingAcceptance(false)
 setIsGeneratingFinanceReceipt(false)
 setActiveTab('overview')
 setApplicationData(null)
 setPaymentRecords([])
 setAdminFeedback(application?.admin_feedback || '')
 }, [application?.id, show])

 const handleSaveFeedback = async () => {
 if (!application?.id || !adminFeedback.trim()) return
 
 try {
 setSavingFeedback(true)
 await applicationService.update(application.id, {
 admin_feedback: adminFeedback.trim(),
 admin_feedback_date: new Date().toISOString()
 })
 // Update local state
 if (applicationData) {
 setApplicationData({
 ...applicationData,
 application: {
 ...applicationData.application,
 admin_feedback: adminFeedback.trim(),
 admin_feedback_date: new Date().toISOString()
 }
 })
 }
 } catch (error) {
 logApiError('admin-application-detail', `/applications/${application.id}/`, error)
 } finally {
 setSavingFeedback(false)
 }
 }

 const handleApplyFeeWaiver = async (feeWaiverForm: { waiver_type: string; reason_code: string; discount_percentage: number }) => {
   if (!application?.id) return
   try {
     setSavingFeeWaiver(true)
     await apiClient.request(`/applications/${application.id}/fee-waiver/`, {
       method: 'POST',
       body: JSON.stringify(feeWaiverForm),
     })
     setFeeWaiverOpen(false)
     if (application?.id) { void refreshModalData(application.id) }
   } catch (error) {
     logApiError('admin-fee-waiver', `/applications/${application.id}/fee-waiver/`, error)
   } finally {
     setSavingFeeWaiver(false)
   }
 }

 useEffect(() => {
 if (show && application?.id) {
 void refreshModalData(application.id)
 }
 }, [show, application?.id, refreshModalData])

 // Handle status update with payment warning support (Req 26.4)
 const handleStatusWithWarning = async (appId: string, newStatus: string) => {
   const result = await onUpdateStatus(appId, newStatus)
   if (result && typeof result === 'object' && 'warning' in result && result.warning === true) {
     setPaymentWarning({ applicationId: appId, status: newStatus })
     return
   }
   window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: { applicationId: appId } }))
   void refreshModalData(appId)
 }

 const handlePaymentWarningConfirm = async () => {
   if (!paymentWarning) return
   try {
     await onUpdateStatus(paymentWarning.applicationId, paymentWarning.status, { force: true })
     window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: { applicationId: paymentWarning.applicationId } }))
     void refreshModalData(paymentWarning.applicationId)
   } finally {
     setPaymentWarning(null)
   }
 }

 if (!show || !application) return null

 // Show skeleton during SSR/initial render to prevent hydration mismatch
 if (!isClient) {
 return (
 <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-0 sm:p-4 z-[60] overflow-hidden">
 <div className="bg-card w-full h-full sm:rounded-lg sm:max-w-6xl sm:w-full sm:max-h-[95vh] overflow-hidden flex flex-col max-w-full">
 {/* Header Skeleton */}
 <div className="flex-shrink-0 p-4 sm:p-6 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50">
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
 <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0" />
 <div className="min-w-0 flex-1 space-y-2">
 <Skeleton className="h-6 w-48" />
 <Skeleton className="h-4 w-32" />
 </div>
 </div>
 <Skeleton className="w-8 h-8" />
 </div>
 </div>
 
 {/* Content Skeleton */}
 <div className="flex-1 overflow-y-auto p-4 sm:p-6">
 <div className="space-y-4">
 <Skeleton className="h-32 rounded-xl" />
 <Skeleton className="h-48 rounded-xl" />
 <Skeleton className="h-48 rounded-xl" />
 </div>
 </div>
 
 {/* Footer Skeleton */}
 <div className="flex-shrink-0 p-4 sm:p-6 border-t border-border bg-muted">
 <div className="flex justify-between gap-4">
 <Skeleton className="h-10 w-32" />
 <Skeleton className="h-10 w-24" />
 </div>
 </div>
 </div>
 </div>
 )
 }

 const tabs = [
 { id: 'overview', label: 'Overview', icon: User },
 { id: 'interview', label: 'Interview', icon: Calendar },
 { id: 'grades', label: 'Grades', icon: GraduationCap },
 { id: 'documents', label: 'Documents', icon: FileText },
 { id: 'communications', label: 'Communications', icon: MessageSquare },
 { id: 'history', label: 'History', icon: History }
 ] as const

 const handleGenerateAcceptance = async () => {
 try {
 setIsGeneratingAcceptance(true)
 await onGenerateAcceptanceLetter()
 } catch (error) {
 console.error('Failed to generate acceptance letter:', error)
 } finally {
 setIsGeneratingAcceptance(false)
 }
 }

 const handleGenerateFinanceReceipt = async () => {
 try {
 setIsGeneratingFinanceReceipt(true)
 await onGenerateFinanceReceipt()
 } catch (error) {
 console.error('Failed to generate finance receipt:', error)
 } finally {
 setIsGeneratingFinanceReceipt(false)
 }
 }

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-slate-950/55 p-0  sm:p-4">
 <div
 ref={focusTrapRef as React.RefObject<HTMLDivElement>}
 role="dialog"
 aria-modal="true"
 aria-label={`Application details for ${application.full_name}`}
 className="flex h-full max-w-full flex-col overflow-hidden bg-white/96 shadow-[0_38px_120px_-52px_rgba(15,23,42,0.55)] animate-in fade-in zoom-in-95 duration-200 sm:max-h-[95vh] sm:w-full sm:max-w-6xl sm:rounded-lg"
 >
 {/* Header */}
 <ApplicationDetailHeader application={application} onClose={onClose} />

 {/* Approval Actions — above the fold */}
 <div className="flex-shrink-0 border-b border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:px-6">
 <ApplicationApprovalActions
 applicationId={application.id}
 currentStatus={application.status}
 currentPaymentStatus={application.payment_status || 'not_paid'}
 onStatusUpdate={handleStatusWithWarning}
 onPaymentStatusUpdate={onPaymentStatusUpdate}
 disabled={updating === application.id}
 />
 </div>

 {/* Tabs */}
 <div className="flex-shrink-0 overflow-x-auto border-b border-slate-200/80 bg-white/90">
 <div className="flex px-2 sm:px-6 min-w-max" role="tablist" aria-label="Application details">
 {tabs.map((tab, index) => {
 const Icon = tab.icon
 return (
 <button
 key={tab.id}
 id={`tab-${tab.id}`}
 role="tab"
 aria-selected={activeTab === tab.id}
 aria-controls={`panel-${tab.id}`}
 tabIndex={activeTab === tab.id ? 0 : -1}
 onClick={() => setActiveTab(tab.id)}
 onKeyDown={(e) => {
 const ids = tabs.map(t => t.id)
 const cur = ids.indexOf(tab.id)
 let next = -1
 if (e.key === 'ArrowRight') next = (cur + 1) % ids.length
 else if (e.key === 'ArrowLeft') next = (cur - 1 + ids.length) % ids.length
 else if (e.key === 'Home') next = 0
 else if (e.key === 'End') next = ids.length - 1
 if (next >= 0) {
 e.preventDefault()
 setActiveTab(ids[next]!)
 document.getElementById(`tab-${ids[next]}`)?.focus()
 }
 }}
 className={`flex items-center gap-1 whitespace-nowrap rounded-t-2xl px-3 py-3 text-xs font-medium transition-all sm:gap-2 sm:px-4 sm:text-sm ${
 activeTab === tab.id
 ? 'bg-slate-950 text-white shadow-[0_16px_28px_-20px_rgba(15,23,42,0.7)]'
 : 'text-foreground hover:bg-slate-50 hover:text-slate-950'
 }`}
 >
 <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
 <span className="hidden sm:inline">{tab.label}</span>
 </button>
 )
 })}
 </div>
 </div>
 {/* Content */}
 <div className="flex-1 overflow-y-auto">
 <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="p-4 sm:p-6">
 {loading ? (
 <div className="flex items-center justify-center py-12" role="status" aria-label="Loading application details">
 <div className="space-y-4 w-full max-w-lg">
 <Skeleton className="h-32 w-full rounded-xl" />
 <Skeleton className="h-48 w-full rounded-xl" />
 <Skeleton className="h-48 w-full rounded-xl" />
 </div>
 </div>
 ) : (
 <div className="space-y-6">
 {activeTab === 'overview' && (
 <div className="space-y-6">
 {/* Capacity Warning (Req 18.1, 18.2, 18.3) */}
 <CapacityWarning
   intake_capacity={applicationData?.application?.intake_capacity ?? application.intake_capacity}
   intake_enrollment={applicationData?.application?.intake_enrollment ?? application.intake_enrollment}
 />
 {/* Quick Stats */}
 <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
 <div className="rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-blue-100 p-4 shadow-sm">
 <div className="flex items-center gap-3">
 {application.status === 'approved' ? <CheckCircle className="h-5 w-5 text-accent" /> :
  application.status === 'under_review' ? <Eye className="h-5 w-5 text-accent" /> :
  application.status === 'submitted' ? <AlertCircle className="h-5 w-5 text-primary" /> :
  <Clock className="h-5 w-5 text-foreground" />}
 <div>
 <p className="text-sm font-medium text-foreground">Application Status</p>
 <p className="text-lg font-bold text-foreground capitalize">
 {application.status.replace('_', ' ')}
 </p>
 </div>
 </div>
 </div>
 
 <div className="rounded-lg border border-emerald-100 bg-gradient-to-r from-green-50 to-green-100 p-4 shadow-sm">
 <div className="flex items-center gap-3">
 <CreditCard className="h-5 w-5 text-accent" />
 <div>
 <p className="text-sm font-medium text-foreground">Payment Status</p>
 <p className="text-lg font-bold text-foreground">
 {getPaymentStatusLabel(application.payment_status)}
 </p>
 </div>
 </div>
 </div>
 
 <div className="rounded-lg border border-purple-100 bg-gradient-to-r from-purple-50 to-purple-100 p-4 shadow-sm">
 <div className="flex items-center gap-3">
 <Calendar className="h-5 w-5 text-secondary" />
 <div>
 <p className="text-sm font-medium text-foreground">Submitted</p>
 <p className="text-lg font-bold text-secondary-foreground">
 {formatDate(application.submitted_at || application.created_at)}
 </p>
 </div>
 </div>
 </div>
 </div>

 {(() => {
   const interview = applicationData?.interview || applicationData?.application?.interview || null
   const hasInterview = Boolean(interview && interview.status !== 'cancelled')
   if (!hasInterview || !interview) return null
   const dt = interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : 'Not scheduled'
   const modeLabel = interview.mode === 'in_person' ? 'In person' : interview.mode === 'virtual' ? 'Virtual' : interview.mode === 'phone' ? 'Phone' : (interview.mode || 'Not specified')
   return (
     <div className="bg-card border border-primary/30 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
       <div className="flex items-center gap-3">
         <Calendar className="h-10 w-10 text-primary" />
         <div>
           <p className="text-sm text-foreground">Upcoming interview</p>
           <p className="text-base font-semibold text-foreground">{dt}</p>
         </div>
       </div>
       <div className="text-sm text-foreground">
         <p className="font-medium text-foreground">Mode: {modeLabel}</p>
         <p>Status: {interview.status ? interview.status.replace(/_/g, ' ') : 'Not scheduled'}</p>
       </div>
     </div>
   )
 })()}

 {/* Admin badges: reviewer, fee waiver, late submission */}
 <div className="flex flex-wrap gap-2">
 {(applicationData?.application?.assigned_reviewer_name || application.assigned_reviewer_name) && (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-800">
 <Shield className="h-3.5 w-3.5" />
 Reviewer: {applicationData?.application?.assigned_reviewer_name || application.assigned_reviewer_name}
 </span>
 )}
 {(applicationData?.application?.fee_waiver || application.fee_waiver) && (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-800">
 <Tag className="h-3.5 w-3.5" />
 Fee waiver: {(applicationData?.application?.fee_waiver || application.fee_waiver)?.reason_code?.replace(/_/g, ' ')}
 {(applicationData?.application?.fee_waiver || application.fee_waiver)?.discount_percentage !== 100 && (
 <> ({(applicationData?.application?.fee_waiver || application.fee_waiver)?.discount_percentage}%)</>
 )}
 </span>
 )}
 {(applicationData?.application?.is_late_submission || application.is_late_submission) && (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800">
 <AlertTriangle className="h-3.5 w-3.5" />
 Late submission
 </span>
 )}
 {!(applicationData?.application?.fee_waiver || application.fee_waiver) && (
 <button
   onClick={() => setFeeWaiverOpen(true)}
   className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 transition-colors"
 >
   <Tag className="h-3.5 w-3.5" />
   Apply Fee Waiver
 </button>
 )}
 </div>

 {/* Fee waiver dialog */}
 <FeeWaiverDialog
   open={feeWaiverOpen}
   onClose={() => setFeeWaiverOpen(false)}
   onApply={(form) => { void handleApplyFeeWaiver(form) }}
   saving={savingFeeWaiver}
 />

 {/* Personal Information */}
 <div className="bg-card border border-border rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <User className="h-5 w-5 text-primary" />
 Personal Information
 </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <Mail className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Email</p>
 <p className="font-medium text-foreground">{applicationData?.application?.email || application.email}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Phone className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Phone</p>
 <p className="font-medium text-foreground">{applicationData?.application?.phone || application.phone || 'Not provided'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Calendar className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Date of Birth</p>
 <p className="font-medium text-foreground">{applicationData?.application?.date_of_birth ? formatDate(applicationData.application.date_of_birth) : (application.date_of_birth ? formatDate(application.date_of_birth) : 'Not provided')}</p>
 </div>
 </div>
 </div>
 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <MapPin className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Residence</p>
 <p className="font-medium text-foreground">{applicationData?.application?.residence_town || application.residence_town || 'Not provided'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Users className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Next of Kin</p>
 <p className="font-medium text-foreground">{applicationData?.application?.next_of_kin_name || application.next_of_kin_name || 'Not provided'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <FileText className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">NRC Number</p>
 <p className="font-medium text-foreground">{applicationData?.application?.nrc_number || application.nrc_number || applicationData?.application?.passport_number || application.passport_number || 'Not provided'}</p>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Program Information */}
 <div className="bg-card border border-border rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <GraduationCap className="h-5 w-5 text-primary" />
 Program Information
 </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="flex items-center gap-3">
 <GraduationCap className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Program</p>
 <p className="font-medium text-foreground">{application.program}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Building className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Institution</p>
 <p className="font-medium text-foreground">{getInstitutionName(application.institution)}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Calendar className="h-4 w-4 text-foreground" />
 <div>
 <p className="text-sm text-foreground">Intake</p>
 <p className="font-medium text-foreground">{application.intake}</p>
 </div>
 </div>
 </div>
 </div>

 {/* Payment Information */}
 <ApplicationDetailPayment
   application={application}
   applicationData={applicationData}
   paymentRecords={paymentRecords}
   loadingPayments={loadingPayments}
   onShowNotificationModal={() => setShowNotificationModal(true)}
 />

 {/* Admin Feedback */}
 <div className="bg-blue-50 border border-primary/30 rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <AlertCircle className="h-5 w-5" />
 Admin Feedback
 </h3>
 
 <div className="space-y-4">
 <textarea
 value={adminFeedback}
 onChange={(e) => setAdminFeedback(e.target.value)}
 placeholder="Add feedback for the applicant..."
 rows={4}
 className="w-full rounded-lg border border-primary/30 px-3 py-2 text-sm focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
 />
 
 <div className="flex items-center justify-between">
 <div className="text-sm text-info-strong">
 {application.admin_feedback_date && (
 <span>Last updated: {formatDate(application.admin_feedback_date)}</span>
 )}
 </div>
 
 <Button
 size="sm"
 onClick={handleSaveFeedback}
 loading={savingFeedback}
 disabled={!adminFeedback.trim() || savingFeedback}
 variant="primary"
 >
 Save Feedback
 </Button>
 </div>
 </div>
 </div>

 {/* Pending Amendment Requests */}
 {((applicationData?.application?.pending_amendments && applicationData.application.pending_amendments.length > 0) || (application.pending_amendments && application.pending_amendments.length > 0)) && (
 <div className="bg-card border border-amber-200 rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <ClipboardList className="h-5 w-5 text-amber-600" />
 Pending Amendment Requests
 </h3>
 <div className="space-y-3">
 {(applicationData?.application?.pending_amendments || application.pending_amendments || []).map((amendment) => (
 <div key={amendment.id} className="flex items-start justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg">
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-foreground capitalize">{amendment.field_name.replace(/_/g, ' ')}</p>
 <p className="text-xs text-muted-foreground mt-0.5">New value: <span className="font-medium text-foreground">{amendment.new_value}</span></p>
 <p className="text-xs text-muted-foreground mt-0.5">Reason: {amendment.reason}</p>
 <p className="text-xs text-muted-foreground mt-0.5">{formatDate(amendment.created_at)}</p>
 </div>
 <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
 {amendment.status}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )}

 {activeTab === 'interview' && (
 <ApplicationDetailInterview
   application={application}
   applicationData={applicationData}
   onApplicationDataChange={setApplicationData}
 />
 )}

 {activeTab === 'grades' && (
 <GradesDisplay
 grades={applicationData?.grades || []}
 loading={loading}
 />
 )}

 {activeTab === 'documents' && (
 <ApplicationDetailDocuments 
 documents={applicationData?.documents || []} 
 loading={loading}
 application={application}
 />
 )}

 {activeTab === 'communications' && (
 (applicationData?.application?.user_id || application.user_id) ? (
 <AdminCommunicationsPanel
 userId={(applicationData?.application?.user_id || application.user_id)!}
 studentName={application.full_name}
 />
 ) : (
 <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
 This application does not include a linked student user id, so communication history cannot be loaded.
 </div>
 )
 )}

 {activeTab === 'history' && (
 <ApplicationDetailTimeline 
 history={applicationData?.statusHistory || []} 
 loading={loading}
 />
 )}
 </div>
 )}
 </div>
 </div>
 {/* Footer Actions */}
 <div className="flex-shrink-0 p-4 sm:p-6 border-t border-border bg-muted">
 <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4">
 <div className="flex flex-wrap gap-2">
 <Button
 variant="outline"
 onClick={() => setShowNotificationModal(true)}
 className="flex items-center gap-2"
 >
 <Send className="h-4 w-4" />
 Send Notification
 </Button>
 
 {application.status === 'approved' && (
 <>
 <Button
 variant="outline"
 loading={isGeneratingAcceptance}
 onClick={() => { void handleGenerateAcceptance() }}
 className="flex items-center gap-2"
 >
 <Download className="h-4 w-4" />
 Acceptance Letter
 </Button>
 <Button
 variant="outline"
 loading={isGeneratingFinanceReceipt}
 onClick={() => { void handleGenerateFinanceReceipt() }}
 className="flex items-center gap-2"
 >
 <CreditCard className="h-4 w-4" />
 Finance Receipt
 </Button>
 </>
 )}
 </div>
 
 <Button variant="outline" onClick={onClose}>
 Close
 </Button>
 </div>
 </div>
 </div>
      
      {/* Payment Warning Dialog (Req 26.4) */}
      {paymentWarning && (
        <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[70]">
          <div className="bg-card rounded-lg max-w-md w-full p-6 shadow-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Payment Not Verified</h3>
            </div>
            <p className="text-sm text-foreground mb-6">
              Payment has not been verified for this application. Are you sure you want to approve it? This action can be overridden.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaymentWarning(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => { void handlePaymentWarningConfirm() }}
              >
                Approve Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      <SendNotificationModal
        show={showNotificationModal}
        applicationNumber={application.application_number}
        studentName={application.full_name}
        onClose={() => setShowNotificationModal(false)}
        onSend={onSendNotification}
      />
 </div>
 )
}
