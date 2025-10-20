import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { XCircle, User, Clock, CheckCircle, FileText, CreditCard, Mail, Phone, Calendar, MapPin, Users, GraduationCap, Building, AlertCircle, Download, Send, History, Eye } from 'lucide-react'
import { applicationService } from '@/services/applications'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { ApplicationInterview } from '@/lib/supabase'
import { calculateBestFivePoints, sanitizeGradeValue } from '@/utils/grades'

// Institution code to name mapping
const INSTITUTION_NAMES: Record<string, string> = {
 'KATC': 'Kalulushi Training Centre',
 'katc': 'Kalulushi Training Centre',
 'MIHAS': 'Mukuba Institute of Health and Allied Sciences',
 'mihas': 'Mukuba Institute of Health and Allied Sciences'
}

const getInstitutionName = (code?: string) => {
 if (!code) return 'Not specified'
 return INSTITUTION_NAMES[code] || code
}

interface ApplicationWithDetails {
 id: string
 application_number: string
 full_name: string
 email: string
 phone?: string
 date_of_birth?: string
 sex?: string
 nrc_number?: string
 passport_number?: string
 residence_town?: string
 next_of_kin_name?: string
 program: string
 intake: string
 institution?: string
 payment_method?: string
 amount?: number
 application_fee?: number
 payer_name?: string
 payment_status?: string
 payment_verified_at?: string | null
 payment_verified_by_name?: string | null
 payment_verified_by_email?: string | null
 last_payment_audit_at?: string | null
 last_payment_audit_by_name?: string | null
 last_payment_audit_by_email?: string | null
 last_payment_audit_notes?: string | null
 last_payment_reference?: string | null
 status: string
 submitted_at?: string
 created_at?: string
 updated_at?: string
 result_slip_url?: string
 extra_kyc_url?: string
 pop_url?: string
 admin_feedback?: string
 admin_feedback_date?: string
 admin_feedback_by?: string
 review_started_at?: string
 decision_date?: string
 total_subjects?: number
 points?: number
 grades_summary?: string
 interview?: ApplicationInterview | null
}

interface StatusHistoryItem {
 id: string
 status: string
 changed_by: string
 notes?: string
 created_at: string
 changed_by_profile?: {
 email: string
 full_name?: string
 }
}

interface DocumentItem {
 id: string
 document_type: string
 document_name: string
 file_url: string
 file_size?: number
 mime_type?: string
 verification_status: string
 verified_by?: string
 verified_at?: string
 verification_notes?: string
 system_generated: boolean
}

interface Grade {
 subject_id: string
 grade: number
 subject_name?: string
}

interface ApplicationDetailResponse {
 application: ApplicationWithDetails
 grades?: Grade[]
 statusHistory?: StatusHistoryItem[]
 documents?: DocumentItem[]
 interview?: ApplicationInterview | null
}

interface ApplicationDetailModalProps {
 application: ApplicationWithDetails | null
 show: boolean
 updating: string | null
 onClose: () => void
 onSendNotification: () => void
 onViewDocuments: () => void
 onViewHistory: () => void
 onUpdateStatus: (id: string, status: string) => void
 onGenerateAcceptanceLetter: () => Promise<void>
 onGenerateFinanceReceipt: () => Promise<void>
}

function GradesDisplay({ grades, loading }: { grades: Grade[], loading: boolean }) {
 if (loading) {
 return (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <LoadingSpinner size="sm" />
 <span>Loading grades...</span>
 </div>
 )
 }

 if (grades.length === 0) {
 return (
 <div className="text-center py-8 text-muted-foreground">
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
 <div className="flex items-center justify-between p-4 bg-primary/5/30 rounded-lg">
 <div>
 <p className="text-sm font-medium text-primary-foreground">{grades.length} Subjects</p>
 <p className="text-xs text-primary">Grade 12 Results</p>
 </div>
 <div className="text-right">
 <p className="text-lg font-bold text-primary-foreground">{totalPoints}</p>
 <p className="text-xs text-primary">Points (Best 5)</p>
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
 normalized !== null && normalized <= 3 ? 'bg-accent/10 text-accent-foreground' :
 normalized !== null && normalized <= 6 ? 'bg-accent/10 text-accent-foreground' :
 'bg-destructive/10 text-destructive-foreground'
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

function StatusHistoryDisplay({ history, loading }: { history: StatusHistoryItem[], loading: boolean }) {
 if (loading) {
 return (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <LoadingSpinner size="sm" />
 <span>Loading history...</span>
 </div>
 )
 }
 
 if (history.length === 0) {
 return (
 <div className="text-center py-8 text-muted-foreground">
 <History className="h-8 w-8 mx-auto mb-2 text-foreground" />
 <p className="text-sm">No status changes recorded</p>
 </div>
 )
 }
 
 return (
 <div className="space-y-3">
 {history.map((item) => (
 <div key={item.id} className="flex gap-4 p-4 bg-card border border-border rounded-lg">
 <div className="flex-shrink-0">
 <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
 item.status === 'approved' ? 'bg-accent/10' :
 item.status === 'rejected' ? 'bg-destructive/10' :
 item.status === 'under_review' ? 'bg-accent/10' :
 'bg-primary/10'
 }`}>
 {item.status === 'approved' ? <CheckCircle className="h-4 w-4 text-accent" /> :
 item.status === 'rejected' ? <XCircle className="h-4 w-4 text-destructive" /> :
 item.status === 'under_review' ? <Eye className="h-4 w-4 text-accent" /> :
 <Clock className="h-4 w-4 text-primary" />}
 </div>
 </div>
 <div className="flex-1">
 <div className="flex items-center justify-between mb-1">
 <p className="font-medium text-foreground capitalize">
 {item.status.replace('_', ' ')}
 </p>
 <p className="text-xs text-muted-foreground">
 {formatDate(item.created_at)}
 </p>
 </div>
 <p className="text-sm text-muted-foreground mb-2">
 Changed by {item.changed_by_profile?.full_name || item.changed_by_profile?.email || 'System'}
 </p>
 {item.notes && (
 <p className="text-sm text-foreground bg-muted p-2 rounded">
 {item.notes}
 </p>
 )}
 </div>
 </div>
 ))}
 </div>
 )
}

function DocumentsDisplay({ documents, loading, application }: { documents: DocumentItem[], loading: boolean, application?: ApplicationWithDetails | null }) {
 if (loading) {
 return (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <LoadingSpinner size="sm" />
 <span>Loading documents...</span>
 </div>
 )
 }
 
 // Merge application documents with detailed documents
 const allDocuments = [...documents]
 
 // Add original uploaded documents if they exist and aren't already in the list
 if (application) {
 const existingUrls = new Set(documents.map(d => d.file_url))
 
 if (application.result_slip_url && !existingUrls.has(application.result_slip_url)) {
 allDocuments.push({
 id: 'result_slip',
 document_type: 'result_slip',
 document_name: 'Result Slip',
 file_url: application.result_slip_url,
 verification_status: 'pending',
 system_generated: false
 } as DocumentItem)
 }
 if (application.extra_kyc_url && !existingUrls.has(application.extra_kyc_url)) {
 allDocuments.push({
 id: 'extra_kyc',
 document_type: 'extra_kyc',
 document_name: 'Extra KYC Documents',
 file_url: application.extra_kyc_url,
 verification_status: 'pending',
 system_generated: false
 } as DocumentItem)
 }
 if (application.pop_url && !existingUrls.has(application.pop_url)) {
 allDocuments.push({
 id: 'proof_of_payment',
 document_type: 'proof_of_payment',
 document_name: 'Proof of Payment',
 file_url: application.pop_url,
 verification_status: 'pending',
 system_generated: false
 } as DocumentItem)
 }
 }
 
 if (allDocuments.length === 0) {
 return (
 <div className="text-center py-8 text-muted-foreground">
 <FileText className="h-8 w-8 mx-auto mb-2 text-foreground" />
 <p className="text-sm">No documents uploaded</p>
 </div>
 )
 }
 
 return (
 <div className="space-y-3">
 {allDocuments.map((doc) => (
 <div key={doc.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
 doc.verification_status === 'verified' ? 'bg-accent/10' :
 doc.verification_status === 'rejected' ? 'bg-destructive/10' :
 'bg-accent/10'
 }`}>
 <FileText className={`h-5 w-5 ${
 doc.verification_status === 'verified' ? 'text-success' :
 doc.verification_status === 'rejected' ? 'text-error' :
 'text-warning'
 }`} />
 </div>
 <div>
 <p className="font-medium text-foreground">{doc.document_name}</p>
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <span className={`px-2 py-1 rounded-full ${
 doc.verification_status === 'verified' ? 'bg-accent/10 text-accent-foreground' :
 doc.verification_status === 'rejected' ? 'bg-destructive/10 text-destructive-foreground' :
 'bg-accent/10 text-accent-foreground'
 }`}>
 {doc.verification_status.toUpperCase()}
 </span>
 {doc.system_generated && (
 <span className="bg-primary/10 text-primary-foreground px-2 py-1 rounded-full">
 SYSTEM
 </span>
 )}
 {doc.file_size && (
 <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
 )}
 </div>
 {doc.verification_notes && (
 <p className="text-xs text-muted-foreground mt-1">{doc.verification_notes}</p>
 )}
 </div>
 </div>
 <a
 href={doc.file_url}
 target="_blank"
 rel="noopener noreferrer"
 className="flex items-center gap-1 px-3 py-2 text-sm text-primary hover:text-primary-foreground hover:bg-primary/5/30 rounded-lg transition-colors"
 >
 <Download className="h-4 w-4" />
 View
 </a>
 </div>
 ))}
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
 onGenerateAcceptanceLetter,
 onGenerateFinanceReceipt
}: ApplicationDetailModalProps) {
 const [isGeneratingAcceptance, setIsGeneratingAcceptance] = useState(false)
 const [isGeneratingFinanceReceipt, setIsGeneratingFinanceReceipt] = useState(false)
 const [activeTab, setActiveTab] = useState<'overview' | 'interview' | 'grades' | 'documents' | 'history'>('overview')
 const [applicationData, setApplicationData] = useState<ApplicationDetailResponse | null>(null)
 const [loading, setLoading] = useState(false)
 const [isSavingInterview, setIsSavingInterview] = useState(false)
 const [isCancellingInterview, setIsCancellingInterview] = useState(false)
 const [interviewNotice, setInterviewNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
 const [interviewForm, setInterviewForm] = useState({
 scheduledAt: '',
 mode: 'in_person' as ApplicationInterview['mode'],
 location: '',
 notes: ''
 })
 const [adminFeedback, setAdminFeedback] = useState('')
 const [savingFeedback, setSavingFeedback] = useState(false)

 useEffect(() => {
 setIsGeneratingAcceptance(false)
 setIsGeneratingFinanceReceipt(false)
 setActiveTab('overview')
 setApplicationData(null)
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
 console.error('Failed to save feedback:', error)
 } finally {
 setSavingFeedback(false)
 }
 }

 useEffect(() => {
 if (show && application?.id) {
 loadApplicationDetails()
 }
 }, [show, application?.id])

 const loadApplicationDetails = async () => {
 if (!application?.id) return

 try {
 setLoading(true)
 const response = await applicationService.getById(application.id, { 
 include: ['grades', 'statusHistory', 'documents'] 
 })
 
 // Handle the API response structure
 // API returns: { success, data, application, grades, documents, statusHistory, interview }
 const data = response?.data || response
 setApplicationData({
 application: data,
 grades: response?.grades || data?.grades || [],
 statusHistory: response?.statusHistory || data?.statusHistory || [],
 documents: response?.documents || data?.documents || [],
 interview: response?.interview || data?.interview || null
 })
 } catch (error) {
 console.error('Failed to load application details:', error)
 // Set empty data on error to prevent infinite loading
 setApplicationData({
 application: application,
 grades: [],
 statusHistory: [],
 documents: [],
 interview: null
 })
 } finally {
 setLoading(false)
 }
 }

 const formatDateTimeLocal = (value?: string | null) => {
 if (!value) return ''
 const date = new Date(value)
 if (Number.isNaN(date.getTime())) {
 return ''
 }
 return date.toISOString().slice(0, 16)
 }

 const formatInterviewDateTime = (value?: string | null) => {
 if (!value) return 'Not scheduled'
 const date = new Date(value)
 if (Number.isNaN(date.getTime())) {
 return 'Not scheduled'
 }
 const datePart = formatDate(date.toISOString())
 const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
 return `${datePart} • ${timePart}`
 }

 const formatInterviewModeLabel = (mode?: string | null) => {
 switch (mode) {
 case 'in_person':
 return 'In person'
 case 'virtual':
 return 'Virtual'
 case 'phone':
 return 'Phone'
 case undefined:
 case null:
 return 'Not specified'
 default:
 return mode
 }
 }

 const formatInterviewStatus = (status?: string | null) => {
 if (!status) return 'Not scheduled'
 return status.replace(/_/g, ' ')
 }

 useEffect(() => {
 const currentInterview = applicationData?.interview || applicationData?.application?.interview || null

 if (!currentInterview || currentInterview.status === 'cancelled') {
 setInterviewForm(prev => ({
 ...prev,
 scheduledAt: '',
 location: '',
 notes: ''
 }))
 return
 }

 setInterviewForm({
 scheduledAt: formatDateTimeLocal(currentInterview.scheduled_at),
 mode: currentInterview.mode,
 location: currentInterview.location || '',
 notes: currentInterview.notes || ''
 })
 }, [applicationData?.interview, applicationData?.application?.interview])

 const currentInterview = applicationData?.interview || applicationData?.application?.interview || null
 const hasActiveInterview = Boolean(currentInterview && currentInterview.status !== 'cancelled')

 const handleInterviewFieldChange = (
 field: 'scheduledAt' | 'mode' | 'location' | 'notes'
 ) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
 const value = event.target.value
 setInterviewForm(prev => ({
 ...prev,
 [field]: value
 }))
 }

 const updateInterviewState = (updatedInterview: ApplicationInterview) => {
 setApplicationData(prev => {
 if (!prev) return prev
 return {
 ...prev,
 interview: updatedInterview,
 application: {
 ...prev.application,
 interview: updatedInterview
 }
 }
 })

 setInterviewForm({
 scheduledAt: formatDateTimeLocal(updatedInterview.scheduled_at),
 mode: updatedInterview.mode,
 location: updatedInterview.location || '',
 notes: updatedInterview.notes || ''
 })
 }

 const handleInterviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
 event.preventDefault()

 if (!interviewForm.scheduledAt) {
 setInterviewNotice({ type: 'error', message: 'Please select an interview date and time.' })
 return
 }

 try {
 setIsSavingInterview(true)
 setInterviewNotice(null)

 const scheduledIso = new Date(interviewForm.scheduledAt)
 if (Number.isNaN(scheduledIso.getTime())) {
 throw new Error('Invalid interview date provided.')
 }

 const payload = {
 scheduledAt: scheduledIso.toISOString(),
 mode: interviewForm.mode,
 location: interviewForm.location.trim() || undefined,
 notes: interviewForm.notes.trim() || undefined
 }

 const shouldSchedule = !currentInterview || currentInterview.status === 'cancelled'

 const updatedInterview = shouldSchedule
 ? await applicationService.scheduleInterview(application.id, payload)
 : await applicationService.rescheduleInterview(application.id, payload)

 if (!updatedInterview) {
 throw new Error('No interview data was returned by the server.')
 }

 updateInterviewState(updatedInterview)

 setInterviewNotice({
 type: 'success',
 message: shouldSchedule ? 'Interview scheduled successfully.' : 'Interview updated successfully.'
 })
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unable to save interview details.'
 setInterviewNotice({ type: 'error', message })
 } finally {
 setIsSavingInterview(false)
 }
 }

 const handleInterviewCancel = async () => {
 if (!currentInterview || currentInterview.status === 'cancelled') {
 setInterviewNotice({ type: 'error', message: 'No active interview to cancel.' })
 return
 }

 try {
 setIsCancellingInterview(true)
 setInterviewNotice(null)

 const updatedInterview = await applicationService.cancelInterview(application.id, {
 notes: interviewForm.notes.trim() || undefined
 })

 if (!updatedInterview) {
 throw new Error('Interview cancellation did not return updated details.')
 }

 updateInterviewState(updatedInterview)

 setInterviewNotice({ type: 'success', message: 'Interview cancelled successfully.' })
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Failed to cancel interview.'
 setInterviewNotice({ type: 'error', message })
 } finally {
 setIsCancellingInterview(false)
 }
 }

 if (!show || !application) return null

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'approved': return <CheckCircle className="h-5 w-5 text-accent" />
 case 'rejected': return <XCircle className="h-5 w-5 text-destructive" />
 case 'under_review': return <Eye className="h-5 w-5 text-accent" />
 case 'submitted': return <AlertCircle className="h-5 w-5 text-primary" />
 default: return <Clock className="h-5 w-5 text-muted-foreground" />
 }
 }

 const getPaymentIcon = (status: string) => {
 switch (status) {
 case 'verified': return <CheckCircle className="h-5 w-5 text-accent" />
 case 'rejected': return <XCircle className="h-5 w-5 text-destructive" />
 default: return <Clock className="h-5 w-5 text-accent" />
 }
 }

 const tabs = [
 { id: 'overview', label: 'Overview', icon: User },
 { id: 'interview', label: 'Interview', icon: Calendar },
 { id: 'grades', label: 'Grades', icon: GraduationCap },
 { id: 'documents', label: 'Documents', icon: FileText },
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
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 sm:p-4 z-[60]">
 <div className="bg-card w-full h-full sm:rounded-xl sm:max-w-6xl sm:w-full sm:max-h-[95vh] overflow-hidden flex flex-col">
 {/* Header */}
 <div className="flex-shrink-0 p-6 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
 <User className="h-6 w-6 text-white" />
 </div>
 <div>
 <h2 className="text-xl font-bold text-foreground">
 {application.full_name}
 </h2>
 <div className="flex items-center gap-3 text-sm text-muted-foreground">
 <span className="font-mono">#{application.application_number}</span>
 <span className="text-muted-foreground">•</span>
 <div className="flex items-center gap-1">
 {getStatusIcon(application.status)}
 <span className="capitalize">{application.status.replace('_', ' ')}</span>
 </div>
 </div>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={onClose}
 className="hover:bg-white/90/30"
 >
 <XCircle className="h-5 w-5" />
 </Button>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex-shrink-0 border-b border-border bg-card">
 <div className="flex px-6">
 {tabs.map((tab) => {
 const Icon = tab.icon
 return (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
 activeTab === tab.id
 ? 'border-primary text-primary'
 : 'border-transparent text-muted-foreground hover:text-foreground hover:border-input'
 }`}
 >
 <Icon className="h-4 w-4" />
 {tab.label}
 </button>
 )
 })}
 </div>
 </div>
 {/* Content */}
 <div className="flex-1 overflow-y-auto">
 <div className="p-6">
 {loading ? (
 <div className="flex items-center justify-center py-12">
 <div className="text-center">
 <LoadingSpinner size="lg" className="mx-auto mb-4" />
 <p className="text-muted-foreground">Loading application details...</p>
 </div>
 </div>
 ) : (
 <div className="space-y-6">
 {activeTab === 'overview' && (
 <div className="space-y-6">
 {/* Quick Stats */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-xl">
 <div className="flex items-center gap-3">
 {getStatusIcon(application.status)}
 <div>
 <p className="text-sm font-medium text-foreground">Application Status</p>
 <p className="text-lg font-bold text-primary-foreground capitalize">
 {application.status.replace('_', ' ')}
 </p>
 </div>
 </div>
 </div>
 
 <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-xl">
 <div className="flex items-center gap-3">
 {getPaymentIcon(application.payment_status || 'pending')}
 <div>
 <p className="text-sm font-medium text-foreground">Payment Status</p>
 <p className="text-lg font-bold text-accent-foreground capitalize">
 {(application.payment_status || 'pending').replace('_', ' ')}
 </p>
 </div>
 </div>
 </div>
 
 <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-xl">
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

 {hasActiveInterview && (
 <div className="bg-card border border-primary/30 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
 <div className="flex items-center gap-3">
 <Calendar className="h-10 w-10 text-primary" />
 <div>
 <p className="text-sm text-muted-foreground">Upcoming interview</p>
 <p className="text-base font-semibold text-foreground">
 {formatInterviewDateTime(currentInterview?.scheduled_at)}
 </p>
 </div>
 </div>
 <div className="text-sm text-muted-foreground">
 <p className="font-medium text-foreground">
 Mode: {formatInterviewModeLabel(currentInterview?.mode)}
 </p>
 <p>Status: {formatInterviewStatus(currentInterview?.status)}</p>
 </div>
 </div>
 )}

 {/* Personal Information */}
 <div className="bg-card border border-border rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <User className="h-5 w-5 text-primary" />
 Personal Information
 </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <Mail className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Email</p>
 <p className="font-medium text-foreground">{application.email}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Phone className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Phone</p>
 <p className="font-medium text-foreground">{application.phone || 'Not provided'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Calendar className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Date of Birth</p>
 <p className="font-medium text-foreground">{application.date_of_birth || 'Not provided'}</p>
 </div>
 </div>
 </div>
 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <MapPin className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Residence</p>
 <p className="font-medium text-foreground">{application.residence_town || 'Not provided'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Users className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Next of Kin</p>
 <p className="font-medium text-foreground">{application.next_of_kin_name || 'Not provided'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <FileText className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">NRC Number</p>
 <p className="font-medium text-foreground">{application.nrc_number || 'Not provided'}</p>
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
 <GraduationCap className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Program</p>
 <p className="font-medium text-foreground">{application.program}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Building className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Institution</p>
 <p className="font-medium text-foreground">{getInstitutionName(application.institution)}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Calendar className="h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm text-muted-foreground">Intake</p>
 <p className="font-medium text-foreground">{application.intake}</p>
 </div>
 </div>
 </div>
 </div>

 {/* Payment Information */}
 <div className="bg-card border border-border rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <CreditCard className="h-5 w-5 text-primary" />
 Payment Information
 </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-4">
 <div>
 <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
 <p className="font-medium text-foreground">{application.payment_method || 'Not specified'}</p>
 </div>
 <div>
 <p className="text-sm text-muted-foreground mb-1">Amount Paid</p>
 <p className="text-2xl font-bold text-accent">
 K{application.amount || 0} / K{application.application_fee || 0}
 </p>
 </div>
 <div>
 <p className="text-sm text-muted-foreground mb-1">Payer Name</p>
 <p className="font-medium text-foreground">{application.payer_name || 'Not provided'}</p>
 </div>
 </div>
 {application.payment_verified_at && (
 <div className="bg-accent/10/30 p-4 rounded-lg">
 <div className="flex items-center gap-2 mb-2">
 <CheckCircle className="h-4 w-4 text-accent" />
 <p className="font-medium text-accent-foreground">Payment Verified</p>
 </div>
 <p className="text-sm text-accent mb-1">
 Verified on {formatDate(application.payment_verified_at)}
 </p>
 {(application.payment_verified_by_name || application.payment_verified_by_email) && (
 <p className="text-sm text-accent">
 By: {application.payment_verified_by_name || application.payment_verified_by_email}
 </p>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Admin Feedback */}
 <div className="bg-primary/5/30 border border-primary/30 rounded-xl p-6">
 <h3 className="text-lg font-semibold text-primary-foreground mb-4 flex items-center gap-2">
 <AlertCircle className="h-5 w-5" />
 Admin Feedback
 </h3>
 
 <div className="space-y-4">
 <textarea
 value={adminFeedback}
 onChange={(e) => setAdminFeedback(e.target.value)}
 placeholder="Add feedback for the applicant..."
 rows={4}
 className="w-full rounded-lg border border-primary/30 px-3 py-2 text-sm focus:border-primary focus:ring focus:ring-blue-200"
 />
 
 <div className="flex items-center justify-between">
 <div className="text-sm text-primary">
 {application.admin_feedback_date && (
 <span>Last updated: {formatDate(application.admin_feedback_date)}</span>
 )}
 </div>
 
 <Button
 size="sm"
 onClick={handleSaveFeedback}
 loading={savingFeedback}
 disabled={!adminFeedback.trim() || savingFeedback}
 className="bg-primary hover:bg-primary"
 >
 Save Feedback
 </Button>
 </div>
 </div>
 </div>
 </div>
 )}

 {activeTab === 'interview' && (
 <div className="space-y-6">
 <div className="bg-card border border-border rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <Calendar className="h-5 w-5 text-primary" />
 Interview Overview
 </h3>
 {hasActiveInterview ? (
 <div className="space-y-4">
 <div className="flex items-center gap-3">
 <Clock className="h-5 w-5 text-primary" />
 <div>
 <p className="text-sm text-muted-foreground">Scheduled for</p>
 <p className="text-base font-medium text-foreground">
 {formatInterviewDateTime(currentInterview?.scheduled_at)}
 </p>
 </div>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="bg-primary/5/30 border border-primary/30 rounded-lg p-4">
 <p className="text-sm text-primary uppercase tracking-wide">Mode</p>
 <p className="text-lg font-semibold text-primary-foreground">
 {formatInterviewModeLabel(currentInterview?.mode)}
 </p>
 </div>
 <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
 <p className="text-sm text-primary uppercase tracking-wide">Status</p>
 <p className="text-lg font-semibold text-primary-foreground capitalize">
 {formatInterviewStatus(currentInterview?.status)}
 </p>
 </div>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <p className="text-sm font-medium text-muted-foreground mb-1">Location / Link</p>
 <p className="text-base text-foreground">
 {currentInterview?.location || 'Not provided'}
 </p>
 </div>
 <div>
 <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
 <p className="text-base text-foreground">
 {currentInterview?.notes || 'No additional notes recorded.'}
 </p>
 </div>
 </div>
 </div>
 ) : (
 <div className="text-center py-8">
 <Calendar className="h-12 w-12 mx-auto mb-3 text-foreground" />
 <p className="text-base font-medium text-foreground mb-1">No interview scheduled yet</p>
 <p className="text-sm text-muted-foreground">
 Use the form below to schedule and notify the applicant about their interview.
 </p>
 </div>
 )}
 </div>

 <div className="bg-card border border-border rounded-xl p-6">
 <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
 <Users className="h-5 w-5 text-primary" />
 Manage Interview Schedule
 </h3>

 {interviewNotice && (
 <div
 className={`p-4 mb-4 rounded-lg border ${
 interviewNotice.type === 'success'
 ? 'bg-green-50 border-green-200 text-accent-foreground'
 : 'bg-red-50 border-red-200 text-destructive-foreground'
 }`}
 >
 {interviewNotice.message}
 </div>
 )}

 <form onSubmit={event => { void handleInterviewSubmit(event) }} className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-scheduled-at">
 Interview date &amp; time
 </label>
 <input
 id="interview-scheduled-at"
 type="datetime-local"
 value={interviewForm.scheduledAt}
 onChange={handleInterviewFieldChange('scheduledAt')}
 className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus:ring focus:ring-blue-200"
 required
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-mode">
 Interview mode
 </label>
 <select
 id="interview-mode"
 value={interviewForm.mode}
 onChange={handleInterviewFieldChange('mode')}
 className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus:ring focus:ring-blue-200"
 >
 <option value="in_person">In person</option>
 <option value="virtual">Virtual</option>
 <option value="phone">Phone</option>
 </select>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-location">
 Location / meeting link
 </label>
 <input
 id="interview-location"
 type="text"
 value={interviewForm.location}
 onChange={handleInterviewFieldChange('location')}
 placeholder={interviewForm.mode === 'virtual' ? 'Zoom/Teams link' : 'Campus room or venue'}
 className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus:ring focus:ring-blue-200"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1" htmlFor="interview-notes">
 Notes for applicant
 </label>
 <textarea
 id="interview-notes"
 value={interviewForm.notes}
 onChange={handleInterviewFieldChange('notes')}
 rows={4}
 className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus:ring focus:ring-blue-200"
 placeholder="Add preparation details, required documents or virtual meeting instructions"
 />
 </div>

 <div className="flex flex-wrap gap-3">
 <Button type="submit" loading={isSavingInterview} className="flex items-center gap-2">
 <CheckCircle className="h-4 w-4" />
 {hasActiveInterview ? 'Update interview' : 'Schedule interview'}
 </Button>

 {hasActiveInterview && (
 <Button
 type="button"
 variant="outline"
 loading={isCancellingInterview}
 onClick={() => { void handleInterviewCancel() }}
 className="text-destructive border-destructive/30 hover:bg-destructive/5/30"
 >
 <XCircle className="h-4 w-4 mr-2" />
 Cancel interview
 </Button>
 )}
 </div>
 </form>
 </div>
 </div>
 )}

 {activeTab === 'grades' && (
 <GradesDisplay
 grades={applicationData?.grades || []}
 loading={loading}
 />
 )}

 {activeTab === 'documents' && (
 <DocumentsDisplay 
 documents={applicationData?.documents || []} 
 loading={loading}
 application={application}
 />
 )}

 {activeTab === 'history' && (
 <StatusHistoryDisplay 
 history={applicationData?.statusHistory || []} 
 loading={loading}
 />
 )}
 </div>
 )}
 </div>
 </div>
 {/* Footer Actions */}
 <div className="flex-shrink-0 p-6 border-t border-border bg-muted">
 <div className="flex flex-col sm:flex-row justify-between gap-4">
 <div className="flex flex-wrap gap-2">
 <Button
 variant="outline"
 onClick={onSendNotification}
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
 
 <div className="flex gap-2">
 {application.status === 'submitted' && (
 <Button
 loading={updating === application.id}
 onClick={() => onUpdateStatus(application.id, 'under_review')}
 className="bg-primary hover:bg-primary"
 >
 Start Review
 </Button>
 )}
 
 {application.status === 'under_review' && (
 <>
 <Button
 loading={updating === application.id}
 onClick={() => onUpdateStatus(application.id, 'approved')}
 className="bg-success hover:bg-success text-white"
 >
 <CheckCircle className="h-4 w-4 mr-2" />
 Approve
 </Button>
 <Button
 variant="outline"
 loading={updating === application.id}
 onClick={() => onUpdateStatus(application.id, 'rejected')}
 className="text-destructive border-destructive/30 hover:bg-destructive/5/30"
 >
 <XCircle className="h-4 w-4 mr-2" />
 Reject
 </Button>
 </>
 )}
 
 <Button variant="outline" onClick={onClose}>
 Close
 </Button>
 </div>
 </div>
 </div>
 </div>
 </div>
 )
}