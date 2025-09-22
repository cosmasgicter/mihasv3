import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { XCircle, User, Clock, CheckCircle, FileText, CreditCard, Mail, Phone, Calendar, MapPin, Users, GraduationCap, Building, AlertCircle, Download, Send, History, Eye } from 'lucide-react'
import { applicationService } from '@/services/applications'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { ApplicationInterview } from '@/lib/supabase'

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
  average_grade?: number
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
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LoadingSpinner size="sm" />
        <span>Loading grades...</span>
      </div>
    )
  }
  
  if (grades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <GraduationCap className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No grades recorded</p>
      </div>
    )
  }
  
  // Calculate points from best 5 subjects (lowest grades are best)
  const sortedGrades = [...grades].sort((a, b) => a.grade - b.grade)
  const bestFiveGrades = sortedGrades.slice(0, 5)
  const totalPoints = bestFiveGrades.reduce((sum, g) => sum + g.grade, 0)
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
        <div>
          <p className="text-sm font-medium text-blue-900">{grades.length} Subjects</p>
          <p className="text-xs text-blue-700">Grade 12 Results</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-blue-900">{totalPoints}</p>
          <p className="text-xs text-blue-700">Points (Best 5)</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {grades.map((grade, index) => {
          const isBestFive = bestFiveGrades.some(bg => bg.subject_id === grade.subject_id)
          return (
            <div key={index} className={`flex justify-between items-center p-3 border rounded-lg ${
              isBestFive ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
            }`}>
              <div>
                <span className="font-medium text-gray-900">{grade.subject_name}</span>
                {isBestFive && <span className="ml-2 text-xs text-green-600 font-medium">BEST 5</span>}
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                grade.grade <= 3 ? 'bg-green-100 text-green-800' :
                grade.grade <= 6 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
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
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LoadingSpinner size="sm" />
        <span>Loading history...</span>
      </div>
    )
  }
  
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <History className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No status changes recorded</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {history.map((item) => (
        <div key={item.id} className="flex gap-4 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex-shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              item.status === 'approved' ? 'bg-green-100' :
              item.status === 'rejected' ? 'bg-red-100' :
              item.status === 'under_review' ? 'bg-yellow-100' :
              'bg-blue-100'
            }`}>
              {item.status === 'approved' ? <CheckCircle className="h-4 w-4 text-green-600" /> :
               item.status === 'rejected' ? <XCircle className="h-4 w-4 text-red-600" /> :
               item.status === 'under_review' ? <Eye className="h-4 w-4 text-yellow-600" /> :
               <Clock className="h-4 w-4 text-blue-600" />}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-gray-900 capitalize">
                {item.status.replace('_', ' ')}
              </p>
              <p className="text-xs text-gray-500">
                {formatDate(item.created_at)}
              </p>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Changed by {item.changed_by_profile?.full_name || item.changed_by_profile?.email || 'System'}
            </p>
            {item.notes && (
              <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                {item.notes}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DocumentsDisplay({ documents, loading }: { documents: DocumentItem[], loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LoadingSpinner size="sm" />
        <span>Loading documents...</span>
      </div>
    )
  }
  
  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No documents uploaded</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              doc.verification_status === 'verified' ? 'bg-green-100' :
              doc.verification_status === 'rejected' ? 'bg-red-100' :
              'bg-yellow-100'
            }`}>
              <FileText className={`h-5 w-5 ${
                doc.verification_status === 'verified' ? 'text-green-600' :
                doc.verification_status === 'rejected' ? 'text-red-600' :
                'text-yellow-600'
              }`} />
            </div>
            <div>
              <p className="font-medium text-gray-900">{doc.document_name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`px-2 py-1 rounded-full ${
                  doc.verification_status === 'verified' ? 'bg-green-100 text-green-800' :
                  doc.verification_status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {doc.verification_status.toUpperCase()}
                </span>
                {doc.system_generated && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    SYSTEM
                  </span>
                )}
                {doc.file_size && (
                  <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                )}
              </div>
              {doc.verification_notes && (
                <p className="text-xs text-gray-600 mt-1">{doc.verification_notes}</p>
              )}
            </div>
          </div>
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
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

  useEffect(() => {
    setIsGeneratingAcceptance(false)
    setIsGeneratingFinanceReceipt(false)
    setActiveTab('overview')
    setApplicationData(null)
  }, [application?.id, show])

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
      }) as ApplicationDetailResponse
      setApplicationData(response)
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
      case 'approved': return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'rejected': return <XCircle className="h-5 w-5 text-red-600" />
      case 'under_review': return <Eye className="h-5 w-5 text-yellow-600" />
      case 'submitted': return <AlertCircle className="h-5 w-5 text-blue-600" />
      default: return <Clock className="h-5 w-5 text-gray-600" />
    }
  }

  const getPaymentIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'rejected': return <XCircle className="h-5 w-5 text-red-600" />
      default: return <Clock className="h-5 w-5 text-yellow-600" />
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white w-full h-full sm:rounded-xl sm:max-w-6xl sm:w-full sm:max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {application.full_name}
                </h2>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="font-mono">#{application.application_number}</span>
                  <span className="text-gray-400">•</span>
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
              className="hover:bg-white/50"
            >
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
                  <p className="text-gray-600">Loading application details...</p>
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
                            <p className="text-sm font-medium text-gray-900">Application Status</p>
                            <p className="text-lg font-bold text-blue-900 capitalize">
                              {application.status.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-xl">
                        <div className="flex items-center gap-3">
                          {getPaymentIcon(application.payment_status || 'pending')}
                          <div>
                            <p className="text-sm font-medium text-gray-900">Payment Status</p>
                            <p className="text-lg font-bold text-green-900 capitalize">
                              {(application.payment_status || 'pending').replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-xl">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-purple-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">Submitted</p>
                            <p className="text-lg font-bold text-purple-900">
                              {formatDate(application.submitted_at || application.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {hasActiveInterview && (
                      <div className="bg-white border border-blue-100 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-10 w-10 text-blue-500" />
                          <div>
                            <p className="text-sm text-gray-500">Upcoming interview</p>
                            <p className="text-base font-semibold text-gray-900">
                              {formatInterviewDateTime(currentInterview?.scheduled_at)}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          <p className="font-medium text-gray-800">
                            Mode: {formatInterviewModeLabel(currentInterview?.mode)}
                          </p>
                          <p>Status: {formatInterviewStatus(currentInterview?.status)}</p>
                        </div>
                      </div>
                    )}

                    {/* Personal Information */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <User className="h-5 w-5 text-blue-600" />
                        Personal Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-500">Email</p>
                              <p className="font-medium text-gray-900">{application.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-500">Phone</p>
                              <p className="font-medium text-gray-900">{application.phone || 'Not provided'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-500">Date of Birth</p>
                              <p className="font-medium text-gray-900">{application.date_of_birth || 'Not provided'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-500">Residence</p>
                              <p className="font-medium text-gray-900">{application.residence_town || 'Not provided'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Users className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-500">Next of Kin</p>
                              <p className="font-medium text-gray-900">{application.next_of_kin_name || 'Not provided'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-500">NRC Number</p>
                              <p className="font-medium text-gray-900">{application.nrc_number || 'Not provided'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Program Information */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-blue-600" />
                        Program Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center gap-3">
                          <GraduationCap className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-500">Program</p>
                            <p className="font-medium text-gray-900">{application.program}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Building className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-500">Institution</p>
                            <p className="font-medium text-gray-900">{application.institution}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-500">Intake</p>
                            <p className="font-medium text-gray-900">{application.intake}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Payment Information */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-blue-600" />
                        Payment Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Payment Method</p>
                            <p className="font-medium text-gray-900">{application.payment_method || 'Not specified'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Amount Paid</p>
                            <p className="text-2xl font-bold text-green-600">
                              K{application.amount || 0} / K{application.application_fee || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Payer Name</p>
                            <p className="font-medium text-gray-900">{application.payer_name || 'Not provided'}</p>
                          </div>
                        </div>
                        {application.payment_verified_at && (
                          <div className="bg-green-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <p className="font-medium text-green-900">Payment Verified</p>
                            </div>
                            <p className="text-sm text-green-700 mb-1">
                              Verified on {formatDate(application.payment_verified_at)}
                            </p>
                            {(application.payment_verified_by_name || application.payment_verified_by_email) && (
                              <p className="text-sm text-green-700">
                                By: {application.payment_verified_by_name || application.payment_verified_by_email}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Admin Feedback */}
                    {application.admin_feedback && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <AlertCircle className="h-5 w-5" />
                          Admin Feedback
                        </h3>
                        <p className="text-blue-800 mb-2">{application.admin_feedback}</p>
                        {application.admin_feedback_date && (
                          <p className="text-sm text-blue-600">
                            Added on {formatDate(application.admin_feedback_date)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'interview' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        Interview Overview
                      </h3>
                      {hasActiveInterview ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-blue-500" />
                            <div>
                              <p className="text-sm text-gray-500">Scheduled for</p>
                              <p className="text-base font-medium text-gray-900">
                                {formatInterviewDateTime(currentInterview?.scheduled_at)}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                              <p className="text-sm text-blue-700 uppercase tracking-wide">Mode</p>
                              <p className="text-lg font-semibold text-blue-900">
                                {formatInterviewModeLabel(currentInterview?.mode)}
                              </p>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                              <p className="text-sm text-indigo-700 uppercase tracking-wide">Status</p>
                              <p className="text-lg font-semibold text-indigo-900 capitalize">
                                {formatInterviewStatus(currentInterview?.status)}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm font-medium text-gray-600 mb-1">Location / Link</p>
                              <p className="text-base text-gray-900">
                                {currentInterview?.location || 'Not provided'}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600 mb-1">Notes</p>
                              <p className="text-base text-gray-900">
                                {currentInterview?.notes || 'No additional notes recorded.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                          <p className="text-base font-medium text-gray-700 mb-1">No interview scheduled yet</p>
                          <p className="text-sm text-gray-500">
                            Use the form below to schedule and notify the applicant about their interview.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-600" />
                        Manage Interview Schedule
                      </h3>

                      {interviewNotice && (
                        <div
                          className={`p-4 mb-4 rounded-lg border ${
                            interviewNotice.type === 'success'
                              ? 'bg-green-50 border-green-200 text-green-800'
                              : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                        >
                          {interviewNotice.message}
                        </div>
                      )}

                      <form onSubmit={event => { void handleInterviewSubmit(event) }} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="interview-scheduled-at">
                              Interview date &amp; time
                            </label>
                            <input
                              id="interview-scheduled-at"
                              type="datetime-local"
                              value={interviewForm.scheduledAt}
                              onChange={handleInterviewFieldChange('scheduledAt')}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring focus:ring-blue-200"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="interview-mode">
                              Interview mode
                            </label>
                            <select
                              id="interview-mode"
                              value={interviewForm.mode}
                              onChange={handleInterviewFieldChange('mode')}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring focus:ring-blue-200"
                            >
                              <option value="in_person">In person</option>
                              <option value="virtual">Virtual</option>
                              <option value="phone">Phone</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="interview-location">
                            Location / meeting link
                          </label>
                          <input
                            id="interview-location"
                            type="text"
                            value={interviewForm.location}
                            onChange={handleInterviewFieldChange('location')}
                            placeholder={interviewForm.mode === 'virtual' ? 'Zoom/Teams link' : 'Campus room or venue'}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring focus:ring-blue-200"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="interview-notes">
                            Notes for applicant
                          </label>
                          <textarea
                            id="interview-notes"
                            value={interviewForm.notes}
                            onChange={handleInterviewFieldChange('notes')}
                            rows={4}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring focus:ring-blue-200"
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
                              className="text-red-600 border-red-300 hover:bg-red-50"
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
        <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-gray-50">
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
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Start Review
                </Button>
              )}
              
              {application.status === 'under_review' && (
                <>
                  <Button
                    loading={updating === application.id}
                    onClick={() => onUpdateStatus(application.id, 'approved')}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    loading={updating === application.id}
                    onClick={() => onUpdateStatus(application.id, 'rejected')}
                    className="text-red-600 border-red-300 hover:bg-red-50"
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