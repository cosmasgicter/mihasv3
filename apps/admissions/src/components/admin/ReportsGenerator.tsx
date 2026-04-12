import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui'
import {
  Download,
  FileText,
  Calendar,
  FileDown,
  FileSpreadsheet,
  FileCode,
  ClipboardCopy
} from 'lucide-react'
import { exportReport, ReportFormat } from '@/lib/reportExports'
import {
  DOCUMENT_TEMPLATE_DEFINITIONS,
  DocumentTemplateContext,
  DocumentTemplateId,
  renderTemplateById
} from '@/lib/documentTemplates'
import { useAuth } from '@/contexts/AuthContext'
import { isReportManagerRole } from '@/lib/auth/roles'
import { applicationService } from '@/services/applications'
import { toast } from '@/hooks/useToast'

interface ReportConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'regulatory'
  startDate: string
  endDate: string
  includePrograms: boolean
  includeEngagement: boolean
  includeEligibility: boolean
  format: ReportFormat
}

type ReportApplicationRow = NonNullable<Awaited<ReturnType<typeof applicationService.exportApplications>>>['applications'][number]

type DocumentFormState = {
  studentName: string
  studentPreferredName: string
  studentEmail: string
  studentPhone: string
  programName: string
  intake: string
  startDate: string
  responseDeadline: string
  orientationDate: string
  referenceNumber: string
  decisionDate: string
  interviewDate: string
  interviewTime: string
  interviewLocation: string
  interviewMode: string
  feedbackSummary: string
  feedbackStrengths: string
  feedbackImprovements: string
  feedbackRecommendation: string
  staffName: string
  staffTitle: string
  staffDepartment: string
  staffEmail: string
  staffPhone: string
  paymentAmountDue: string
  paymentAmountPaid: string
  paymentBalance: string
  paymentDueDate: string
  paymentReference: string
  paymentLastPaymentDate: string
  paymentBreakdown: string
}

const initialDocumentForm: DocumentFormState = {
  studentName: '',
  studentPreferredName: '',
  studentEmail: '',
  studentPhone: '',
  programName: '',
  intake: '',
  startDate: '',
  responseDeadline: '',
  orientationDate: '',
  referenceNumber: '',
  decisionDate: '',
  interviewDate: '',
  interviewTime: '',
  interviewLocation: '',
  interviewMode: '',
  feedbackSummary: '',
  feedbackStrengths: '',
  feedbackImprovements: '',
  feedbackRecommendation: '',
  staffName: '',
  staffTitle: '',
  staffDepartment: '',
  staffEmail: '',
  staffPhone: '',
  paymentAmountDue: '',
  paymentAmountPaid: '',
  paymentBalance: '',
  paymentDueDate: '',
  paymentReference: '',
  paymentLastPaymentDate: '',
  paymentBreakdown: ''
}

const parseNumberInput = (value: string) => {
  const normalized = value.replace(/[^0-9.-]/g, '').trim()
  if (!normalized) return undefined
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseListInput = (value: string) =>
  value
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(Boolean)

const parseBreakdownInput = (value: string) =>
  value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [labelPart, amountPart] = line.split(/[:|\-–—]/, 2)
      if (!labelPart || !amountPart) return null
      const amountValue = amountPart.replace(/[^0-9.-]/g, '').trim()
      const parsed = Number.parseFloat(amountValue)
      if (!Number.isFinite(parsed)) return null
      return {
        label: labelPart.trim(),
        amount: parsed
      }
    })
    .filter((entry): entry is { label: string; amount: number } => Boolean(entry && entry.label))

export function ReportsGenerator() {
  const [loading, setLoading] = useState(false)
  const {
    user,
    isAdmin,
    loading: roleStatusLoading,
  } = useAuth()
  const roleError = null
  const canManageReports = useMemo(
    () => isReportManagerRole(user?.role as string | undefined),
    [user?.role]
  )
  const [config, setConfig] = useState<ReportConfig>({
    type: 'monthly',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
    endDate: new Date().toISOString().split('T')[0]!,
    includePrograms: true,
    includeEngagement: true,
    includeEligibility: true,
    format: 'pdf'
  })
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplateId>('offerLetter')
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(initialDocumentForm)
  const [prefillApplicationId, setPrefillApplicationId] = useState('')
  const [prefillStatus, setPrefillStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [documentGenerating, setDocumentGenerating] = useState(false)
  const [documentPreview, setDocumentPreview] = useState<{
    templateId: DocumentTemplateId
    html: string
    text: string
  } | null>(null)
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html')

  const loadApplicationsForReport = useCallback(async () => {
    const rows: ReportApplicationRow[] = []
    let page = 0

    while (true) {
      const response = await applicationService.exportApplications({
        page,
        limit: 500
      })

      const batch = response?.applications ?? []
      if (!batch.length) {
        break
      }

      rows.push(...batch)

      if (!response?.hasMore || batch.length < 500) {
        break
      }

      page += 1
    }

    return rows
  }, [])

  const templateOptions = useMemo(
    () => Object.values(DOCUMENT_TEMPLATE_DEFINITIONS),
    []
  )

  const selectedTemplateDefinition = useMemo(
    () => DOCUMENT_TEMPLATE_DEFINITIONS[selectedTemplate],
    [selectedTemplate]
  )

  useEffect(() => {
    setDocumentPreview(null)
    setPreviewMode('html')
  }, [selectedTemplate])

  const handleDocumentFieldChange = (field: keyof DocumentFormState) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { value } = event.target
    setDocumentForm(prev => ({ ...prev, [field]: value }))
  }

  const toDateInput = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }

  const toTimeInput = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(11, 16)
  }

  const handlePrefillFromApplication = async () => {
    const trimmedId = prefillApplicationId.trim()
    if (!trimmedId) {
      setPrefillStatus({ type: 'error', message: 'Enter an application ID to prefill the template.' })
      return
    }

    try {
      setPrefillLoading(true)
      setPrefillStatus(null)

      const response = await applicationService.getById(trimmedId)
      if (!response || !response.application) {
        throw new Error('Application not found or inaccessible.')
      }

      const app = response.application
      const interview = response.interview || app.interview || null

      // Type-safe extraction of optional fields
      const reviewNotes = typeof app.review_notes === 'string' ? app.review_notes : ''
      const decisionDate = typeof app.decision_date === 'string' ? app.decision_date : undefined
      const applicationFee = typeof app.application_fee === 'number' ? app.application_fee : undefined
      const paidAmount =
        typeof app.paid_amount === 'number'
          ? app.paid_amount
          : typeof app.amount === 'number'
            ? app.amount
            : undefined
      const paymentReference =
        typeof app.last_payment_reference === 'string' && app.last_payment_reference.trim()
          ? app.last_payment_reference
          : ''

      setDocumentForm(prev => ({
        ...prev,
        studentName: app.full_name || '',
        studentPreferredName: prev.studentPreferredName || app.full_name?.split(' ')[0] || '',
        studentEmail: app.email || '',
        studentPhone: app.phone || '',
        programName: app.program || '',
        intake: app.intake || '',
        startDate: prev.startDate,
        responseDeadline: prev.responseDeadline,
        orientationDate: prev.orientationDate,
        referenceNumber: app.application_number || '',
        decisionDate: toDateInput(decisionDate),
        interviewDate: toDateInput(interview?.scheduled_at),
        interviewTime: toTimeInput(interview?.scheduled_at),
        interviewLocation: interview?.location || '',
        interviewMode: interview?.mode || '',
        feedbackSummary: prev.feedbackSummary,
        feedbackStrengths: prev.feedbackStrengths,
        feedbackImprovements: prev.feedbackImprovements,
        feedbackRecommendation: reviewNotes || prev.feedbackRecommendation,
        staffName: prev.staffName,
        staffTitle: prev.staffTitle,
        staffDepartment: prev.staffDepartment,
        staffEmail: prev.staffEmail,
        staffPhone: prev.staffPhone,
        paymentAmountDue: applicationFee ? String(applicationFee) : prev.paymentAmountDue,
        paymentAmountPaid: paidAmount ? String(paidAmount) : prev.paymentAmountPaid,
        paymentBalance: prev.paymentBalance,
        paymentDueDate: prev.paymentDueDate,
        paymentReference: paymentReference || prev.paymentReference,
        paymentLastPaymentDate: prev.paymentLastPaymentDate,
        paymentBreakdown: prev.paymentBreakdown
      }))

      setPrefillStatus({ type: 'success', message: 'Application details loaded successfully.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load application details.'
      setPrefillStatus({ type: 'error', message })
    } finally {
      setPrefillLoading(false)
    }
  }

  const buildDocumentContext = (): DocumentTemplateContext => {
    const strengths = parseListInput(documentForm.feedbackStrengths)
    const improvements = parseListInput(documentForm.feedbackImprovements)
    const breakdown = parseBreakdownInput(documentForm.paymentBreakdown)

    const context: DocumentTemplateContext = {
      student: {
        fullName: documentForm.studentName || undefined,
        preferredName: documentForm.studentPreferredName || undefined,
        email: documentForm.studentEmail || undefined,
        phone: documentForm.studentPhone || undefined,
        program: documentForm.programName || undefined
      },
      application: {
        programName: documentForm.programName || undefined,
        intake: documentForm.intake || undefined,
        startDate: documentForm.startDate || undefined,
        responseDeadline: documentForm.responseDeadline || undefined,
        orientationDate: documentForm.orientationDate || undefined,
        interviewDate: documentForm.interviewDate || undefined,
        interviewTime: documentForm.interviewTime || undefined,
        interviewLocation: documentForm.interviewLocation || undefined,
        interviewMode: documentForm.interviewMode || undefined,
        decisionDate: documentForm.decisionDate || undefined,
        referenceNumber: documentForm.referenceNumber || undefined
      },
      staff: {
        fullName: documentForm.staffName || undefined,
        title: documentForm.staffTitle || undefined,
        department: documentForm.staffDepartment || undefined,
        email: documentForm.staffEmail || undefined,
        phone: documentForm.staffPhone || undefined
      },
      feedback: {
        summary: documentForm.feedbackSummary || undefined,
        strengths: strengths.length ? strengths : undefined,
        improvements: improvements.length ? improvements : undefined,
        recommendation: documentForm.feedbackRecommendation || undefined
      },
      payment: {
        amountDue: parseNumberInput(documentForm.paymentAmountDue),
        amountPaid: parseNumberInput(documentForm.paymentAmountPaid),
        balance: parseNumberInput(documentForm.paymentBalance),
        dueDate: documentForm.paymentDueDate || undefined,
        reference: documentForm.paymentReference || undefined,
        lastPaymentDate: documentForm.paymentLastPaymentDate || undefined,
        breakdown: breakdown.length ? breakdown : undefined
      }
    }

    return context
  }

  const downloadPdfDocument = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDocumentAction = async (
    templateId: DocumentTemplateId,
    action: 'pdf' | 'html' | 'text'
  ) => {
    try {
      setDocumentGenerating(true)
      const context = buildDocumentContext()
      const result = await renderTemplateById(templateId, context)

      setDocumentPreview({
        templateId,
        html: result.html,
        text: result.text
      })

        if (action === 'pdf') {
          const { blob: generatedBlob, bytes } = result.pdf
          const byteSource = bytes instanceof Uint8Array
            ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
            : bytes
          const blob = generatedBlob ?? new Blob([byteSource], { type: 'application/pdf' })
          downloadPdfDocument(blob, result.pdf.fileName)
        toast.success('Success', 'Document generated and downloaded')
        setPreviewMode('html')
        return
      }

      const content = action === 'html' ? result.html : result.text
      setPreviewMode(action === 'html' ? 'html' : 'text')

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
        toast.success('Copied', action === 'html' ? 'Template HTML copied' : 'Template text copied')
      } else {
        toast.info('Preview Updated', 'Copy the contents manually')
      }
    } catch (error) {
      console.error('Failed to generate document template:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate document template.'
      toast.error('Error', message)
    } finally {
      setDocumentGenerating(false)
    }
  }

  const generateReport = async () => {
    try {
      if (!canManageReports) {
        throw new Error('You do not have permission to generate analytics reports.')
      }

      setLoading(true)

      const reportRows = await loadApplicationsForReport()
      const endDate = new Date(config.endDate)
      endDate.setHours(23, 59, 59, 999)

      const applications = reportRows.filter(app => {
        const createdAt = new Date(app.submitted_at || app.created_at || 0)
        const startDate = new Date(config.startDate)
        return createdAt >= startDate && createdAt <= endDate
      })

      const totalApplications = applications.length
      const approvedApplications = applications.filter(app => app.status === 'approved').length
      const rejectedApplications = applications.filter(app => app.status === 'rejected').length
      const pendingApplications = applications.filter(app => ['submitted', 'under_review'].includes(app.status)).length
      const submittedApplications = applications.filter(app => app.status === 'submitted').length
      const paymentVerified = applications.filter(app => app.payment_status === 'verified').length
      const paymentPendingReview = applications.filter(app => app.payment_status === 'pending_review').length
      const paymentRejected = applications.filter(app => app.payment_status === 'rejected').length
      const paymentNotPaid = applications.filter(app => !app.payment_status || app.payment_status === 'not_paid').length
      const applicationsWithPhone = applications.filter(app => Boolean(app.phone?.trim())).length
      const applicationsWithGrades = applications.filter(app => Number(app.total_subjects ?? 0) > 0).length
      const totalSubjectsSubmitted = applications.reduce((sum, app) => sum + Number(app.total_subjects ?? 0), 0)
      const cumulativeBestFivePoints = applications.reduce((sum, app) => sum + Number(app.points ?? 0), 0)
      const totalPaidAmount = applications.reduce((sum, app) => sum + Number(app.paid_amount ?? 0), 0)

      const stats: Record<string, number | string> = {
        totalApplications,
        submittedApplications,
        approvedApplications,
        rejectedApplications,
        pendingApplications,
        paymentVerified,
        paymentPendingReview,
        paymentRejected,
        paymentNotPaid,
        totalPaidAmount: totalPaidAmount.toFixed(2),
        applicationsWithPhone,
        contactCoverage:
          totalApplications > 0
            ? `${((applicationsWithPhone / totalApplications) * 100).toFixed(2)}%`
            : '0.00%',
      }

      if (config.includeEngagement) {
        stats.averageDaysSinceSubmission =
          totalApplications > 0
            ? (
                applications.reduce((sum, app) => sum + Number(app.days_since_submission ?? 0), 0) / totalApplications
              ).toFixed(1)
            : '0.0'
        stats.averagePaidAmount =
          totalApplications > 0
            ? (totalPaidAmount / totalApplications).toFixed(2)
            : '0.00'
      }

      if (config.includeEligibility) {
        stats.applicationsWithGrades = applicationsWithGrades
        stats.averageSubjectsSubmitted =
          applicationsWithGrades > 0 ? (totalSubjectsSubmitted / applicationsWithGrades).toFixed(1) : '0.0'
        stats.averageBestFivePoints =
          applicationsWithGrades > 0 ? (cumulativeBestFivePoints / applicationsWithGrades).toFixed(1) : '0.0'
      }

      const programStats = config.includePrograms
        ? applications.reduce((acc: Record<string, { total: number; approved: number; rejected: number; pending: number }>, app) => {
            const programName = app.program || 'Unknown'
            if (!acc[programName]) {
              acc[programName] = { total: 0, approved: 0, rejected: 0, pending: 0 }
            }
            acc[programName].total++
            if (app.status === 'approved') acc[programName].approved++
            if (app.status === 'rejected') acc[programName].rejected++
            if (['submitted', 'under_review'].includes(app.status)) acc[programName].pending++
            return acc
          }, {})
        : undefined

      const institutionStats = applications.reduce((acc: Record<string, number>, app) => {
        const institutionName =
          typeof app.institution === 'string' && app.institution.trim().length > 0
            ? app.institution
            : 'Unknown'
        acc[institutionName] = (acc[institutionName] || 0) + 1
        return acc
      }, {})

      const paymentBreakdown = {
        Verified: paymentVerified,
        'Awaiting Payment Review': paymentPendingReview,
        'Payment Rejected': paymentRejected,
        'Awaiting Payment': paymentNotPaid,
      }

      const reportName = `${config.type.charAt(0).toUpperCase() + config.type.slice(1)} Report - ${config.startDate} to ${config.endDate}`

      const reportData = {
        period: `${config.startDate} to ${config.endDate}`,
        generatedAt: new Date().toISOString(),
        statistics: stats,
        programBreakdown: programStats,
        approvalRate:
          approvedApplications + rejectedApplications > 0
            ? ((approvedApplications / (approvedApplications + rejectedApplications)) * 100).toFixed(2)
            : '0',
        metadata: {
          reportType: config.type,
          includePrograms: config.includePrograms,
          includeEngagement: config.includeEngagement,
          includeEligibility: config.includeEligibility,
          exportFormat: config.format,
          reportTitle: reportName,
          totalRows: totalApplications,
          appliedFilters: {
            'Report type': config.type,
            'Start date': config.startDate,
            'End date': config.endDate,
            Programs: config.includePrograms ? 'Included' : 'Excluded',
            Engagement: config.includeEngagement ? 'Included' : 'Excluded',
            Eligibility: config.includeEligibility ? 'Included' : 'Excluded',
          },
          institutionBreakdown: institutionStats,
          paymentBreakdown,
        }
      }

      // Note: Report saving to database is skipped as automated_reports table 
      // operations are not exposed via API. Reports are generated and downloaded directly.

      await exportReport(reportData, config.format, reportName)

      toast.success('Success', 'Report generated and downloaded')
    } catch (error) {
      console.error('Failed to generate report:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate report. Please try again.'
      toast.error('Error', message)
    } finally {
      setLoading(false)
    }
  }

  const reportTypes: Array<{ value: ReportConfig['type']; label: string; icon: React.ElementType }> = [
    { value: 'daily', label: 'Daily Report', icon: Calendar },
    { value: 'weekly', label: 'Weekly Report', icon: Calendar },
    { value: 'monthly', label: 'Monthly Report', icon: Calendar },
    { value: 'regulatory', label: 'Regulatory Compliance', icon: FileText }
  ]

  const reportFormats = [
    { value: 'pdf' as ReportFormat, label: 'PDF Document', description: 'Ready-to-share summary', icon: FileDown },
    { value: 'excel' as ReportFormat, label: 'Excel Workbook', description: 'Multi-sheet analytics', icon: FileSpreadsheet },
    { value: 'csv' as ReportFormat, label: 'CSV Export', description: 'Spreadsheet-friendly flat export', icon: FileSpreadsheet },
    { value: 'json' as ReportFormat, label: 'JSON Export', description: 'Raw data for developers', icon: FileText }
  ]

  if (roleStatusLoading) {
    return (
      <div className="bg-card rounded-lg shadow">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">Generate Reports</h3>
          <p className="text-sm text-foreground">Create automated reports for analysis and compliance</p>
        </div>
        <div className="p-6 space-y-4 animate-pulse">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (roleError) {
    return (
      <div className="bg-card rounded-lg shadow">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">Generate Reports</h3>
          <p className="text-sm text-foreground">Create automated reports for analysis and compliance</p>
        </div>
        <div className="p-6">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-error">
            Unable to verify your permissions at this time. Please refresh the page or contact an administrator.
          </div>
        </div>
      </div>
    )
  }

  if (!canManageReports) {
    return (
      <div className="bg-card rounded-lg shadow">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">Generate Reports</h3>
          <p className="text-sm text-foreground">Create automated reports for analysis and compliance</p>
        </div>
        <div className="p-6">
          <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning-strong">
            You do not have permission to access analytics report generation. Please contact your administrator if you believe this is a mistake.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg shadow">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-medium text-foreground">Generate Reports</h3>
        <p className="text-sm text-foreground">Create automated reports for analysis and compliance</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Report Type Selection */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Report Type</label>
          <div className="grid grid-cols-2 gap-3">
            {reportTypes.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.value}
                  onClick={() => setConfig(prev => ({ ...prev, type: type.value }))}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    config.type === type.value
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-input hover:border-input'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{type.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>

        {/* Report Sections */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Include Sections</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.includePrograms}
                onChange={(e) => setConfig(prev => ({ ...prev, includePrograms: e.target.checked }))}
                className="rounded border-input text-primary focus-visible:ring-ring"
              />
              <span className="ml-2 text-sm text-foreground">Program Analytics</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.includeEngagement}
                onChange={(e) => setConfig(prev => ({ ...prev, includeEngagement: e.target.checked }))}
                className="rounded border-input text-primary focus-visible:ring-ring"
              />
              <span className="ml-2 text-sm text-foreground">User Engagement Metrics</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.includeEligibility}
                onChange={(e) => setConfig(prev => ({ ...prev, includeEligibility: e.target.checked }))}
                className="rounded border-input text-primary focus-visible:ring-ring"
              />
              <span className="ml-2 text-sm text-foreground">Eligibility Success Rates</span>
            </label>
          </div>
        </div>

        {/* Output Format */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Output Format</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {reportFormats.map((format) => {
              const Icon = format.icon
              const isActive = config.format === format.value
              return (
                <button
                  key={format.value}
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, format: format.value }))}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    isActive
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-input hover:border-input'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{format.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-foreground">{format.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Generate Button */}
        <div className="pt-4 border-t border-border">
          <Button
            onClick={generateReport}
            disabled={loading}
            loading={loading}
            className="w-full"
          >
            {!loading && <Download className="h-4 w-4 mr-2" />}
            {loading ? 'Generating Report...' : 'Generate & Download Report'}
          </Button>
        </div>

        {isAdmin ? (
          <div className="pt-8 border-t border-border space-y-6">
            <div>
              <h4 className="text-lg font-semibold text-foreground flex items-center space-x-2">
                <FileText className="h-4 w-4 text-primary" />
                <span>Official Document Templates</span>
              </h4>
              <p className="text-sm text-foreground">
                Generate structured admissions, interview and finance communications using the details provided below.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium text-foreground mb-1"
                    htmlFor="document-template-select"
                  >
                    Template
                  </label>
                  <select
                    id="document-template-select"
                    value={selectedTemplate}
                    onChange={(event) => setSelectedTemplate(event.target.value as DocumentTemplateId)}
                    className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {templateOptions.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-muted border border-border rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-foreground">Required placeholders</h5>
                  <ul className="mt-2 space-y-2 text-xs text-foreground">
                    {selectedTemplateDefinition.tokens.map(token => (
                      <li key={token.token} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                        <div className="font-mono text-[11px] text-foreground">{`{{${token.token}}}`}</div>
                        <div className="text-foreground">
                          {token.label}
                          {token.required === false && <span className="text-foreground"> (optional)</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button
                    onClick={() => handleDocumentAction(selectedTemplate, 'pdf')}
                    disabled={documentGenerating}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDocumentAction(selectedTemplate, 'html')}
                    disabled={documentGenerating}
                    className="w-full"
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    Copy HTML
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDocumentAction(selectedTemplate, 'text')}
                    disabled={documentGenerating}
                    className="w-full"
                  >
                    <ClipboardCopy className="h-4 w-4 mr-2" />
                    Copy Text
                  </Button>
                </div>
                {documentGenerating && (
                  <div className="flex items-center text-sm text-foreground">
                    <div className="mr-2 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                    Preparing document…
                  </div>
                )}
                <p className="text-xs text-foreground">
                  Fill in the relevant sections below. Optional placeholders will be skipped automatically when left blank.
                </p>
              </div>
            </div>

            <div className="bg-muted border border-border rounded-lg p-4 space-y-3">
              <h5 className="text-sm font-semibold text-foreground">Prefill from an application</h5>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={prefillApplicationId}
                  onChange={(event) => setPrefillApplicationId(event.target.value)}
                  placeholder="Enter application ID (UUID)"
                  className="flex-1 border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button
                  type="button"
                  onClick={() => { void handlePrefillFromApplication() }}
                  loading={prefillLoading}
                  className="sm:w-auto"
                >
                  Load application
                </Button>
              </div>
              {prefillStatus && (
                <p
                  className={`text-sm ${
                    prefillStatus.type === 'success' ? 'text-success' : 'text-error'
                  }`}
                >
                  {prefillStatus.message}
                </p>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-semibold text-foreground mb-2">Student & Programme</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-student-name">
                        Student full name
                      </label>
                      <input
                        id="document-student-name"
                        type="text"
                        value={documentForm.studentName}
                        onChange={handleDocumentFieldChange('studentName')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-student-email">
                        Student email
                      </label>
                      <input
                        id="document-student-email"
                        type="email"
                        value={documentForm.studentEmail}
                        onChange={handleDocumentFieldChange('studentEmail')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="student@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-student-phone">
                        Student phone (optional)
                      </label>
                      <input
                        id="document-student-phone"
                        type="text"
                        value={documentForm.studentPhone}
                        onChange={handleDocumentFieldChange('studentPhone')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="+260 700 000 000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-program-name">
                        Programme
                      </label>
                      <input
                        id="document-program-name"
                        type="text"
                        value={documentForm.programName}
                        onChange={handleDocumentFieldChange('programName')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Diploma in Accounting"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-intake">
                        Intake period
                      </label>
                      <input
                        id="document-intake"
                        type="text"
                        value={documentForm.intake}
                        onChange={handleDocumentFieldChange('intake')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="January 2025"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-start-date">
                        Programme start date
                      </label>
                      <input
                        id="document-start-date"
                        type="date"
                        value={documentForm.startDate}
                        onChange={handleDocumentFieldChange('startDate')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-response-deadline">
                        Acceptance deadline
                      </label>
                      <input
                        id="document-response-deadline"
                        type="date"
                        value={documentForm.responseDeadline}
                        onChange={handleDocumentFieldChange('responseDeadline')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-orientation-date">
                        Orientation date
                      </label>
                      <input
                        id="document-orientation-date"
                        type="date"
                        value={documentForm.orientationDate}
                        onChange={handleDocumentFieldChange('orientationDate')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-reference-number">
                        Reference number
                      </label>
                      <input
                        id="document-reference-number"
                        type="text"
                        value={documentForm.referenceNumber}
                        onChange={handleDocumentFieldChange('referenceNumber')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="APP-2025-001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-decision-date">
                        Decision date (optional)
                      </label>
                      <input
                        id="document-decision-date"
                        type="date"
                        value={documentForm.decisionDate}
                        onChange={handleDocumentFieldChange('decisionDate')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-foreground mb-2">Interview Details</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-interview-date">
                        Interview date
                      </label>
                      <input
                        id="document-interview-date"
                        type="date"
                        value={documentForm.interviewDate}
                        onChange={handleDocumentFieldChange('interviewDate')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-interview-time">
                        Interview time
                      </label>
                      <input
                        id="document-interview-time"
                        type="time"
                        value={documentForm.interviewTime}
                        onChange={handleDocumentFieldChange('interviewTime')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-interview-mode">
                        Interview mode
                      </label>
                      <input
                        id="document-interview-mode"
                        type="text"
                        value={documentForm.interviewMode}
                        onChange={handleDocumentFieldChange('interviewMode')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Virtual / In-person"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-interview-location">
                        Location or link
                      </label>
                      <input
                        id="document-interview-location"
                        type="text"
                        value={documentForm.interviewLocation}
                        onChange={handleDocumentFieldChange('interviewLocation')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Admissions Centre / Zoom link"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-semibold text-foreground mb-2">Feedback Notes</h5>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-feedback-summary">
                        Summary
                      </label>
                      <textarea
                        id="document-feedback-summary"
                        value={documentForm.feedbackSummary}
                        onChange={handleDocumentFieldChange('feedbackSummary')}
                        rows={3}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Overall impression and decision rationale"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-feedback-strengths">
                        Strengths (one per line)
                      </label>
                      <textarea
                        id="document-feedback-strengths"
                        value={documentForm.feedbackStrengths}
                        onChange={handleDocumentFieldChange('feedbackStrengths')}
                        rows={3}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder={"Strong leadership skills\nClear motivation"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-feedback-improvements">
                        Areas for improvement (one per line)
                      </label>
                      <textarea
                        id="document-feedback-improvements"
                        value={documentForm.feedbackImprovements}
                        onChange={handleDocumentFieldChange('feedbackImprovements')}
                        rows={3}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder={"Strengthen quantitative examples\nProvide additional references"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-feedback-recommendation">
                        Recommended next steps (optional)
                      </label>
                      <textarea
                        id="document-feedback-recommendation"
                        value={documentForm.feedbackRecommendation}
                        onChange={handleDocumentFieldChange('feedbackRecommendation')}
                        rows={2}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Suggested improvements or follow-up guidance"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-foreground mb-2">Payment Summary</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-amount-due">
                        Total charges (K)
                      </label>
                      <input
                        id="document-amount-due"
                        type="text"
                        value={documentForm.paymentAmountDue}
                        onChange={handleDocumentFieldChange('paymentAmountDue')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="1250"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-amount-paid">
                        Payments received (K)
                      </label>
                      <input
                        id="document-amount-paid"
                        type="text"
                        value={documentForm.paymentAmountPaid}
                        onChange={handleDocumentFieldChange('paymentAmountPaid')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-balance">
                        Outstanding balance (K)
                      </label>
                      <input
                        id="document-balance"
                        type="text"
                        value={documentForm.paymentBalance}
                        onChange={handleDocumentFieldChange('paymentBalance')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="450"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-payment-due">
                        Payment due date
                      </label>
                      <input
                        id="document-payment-due"
                        type="date"
                        value={documentForm.paymentDueDate}
                        onChange={handleDocumentFieldChange('paymentDueDate')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-payment-reference">
                        Payment reference
                      </label>
                      <input
                        id="document-payment-reference"
                        type="text"
                        value={documentForm.paymentReference}
                        onChange={handleDocumentFieldChange('paymentReference')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="INV-2025-04"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-payment-last">
                        Last payment date (optional)
                      </label>
                      <input
                        id="document-payment-last"
                        type="date"
                        value={documentForm.paymentLastPaymentDate}
                        onChange={handleDocumentFieldChange('paymentLastPaymentDate')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-payment-breakdown">
                      Itemised breakdown (one item per line e.g. Tuition - 950)
                    </label>
                    <textarea
                      id="document-payment-breakdown"
                      value={documentForm.paymentBreakdown}
                      onChange={handleDocumentFieldChange('paymentBreakdown')}
                      rows={3}
                      className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder={"Tuition - 950\nLibrary Fee - 50"}
                    />
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-foreground mb-2">Staff Contact</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-staff-name">
                        Staff name
                      </label>
                      <input
                        id="document-staff-name"
                        type="text"
                        value={documentForm.staffName}
                        onChange={handleDocumentFieldChange('staffName')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Dr. Chanda Mwila"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-staff-title">
                        Title / role
                      </label>
                      <input
                        id="document-staff-title"
                        type="text"
                        value={documentForm.staffTitle}
                        onChange={handleDocumentFieldChange('staffTitle')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Admissions Director"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-staff-department">
                        Department (optional)
                      </label>
                      <input
                        id="document-staff-department"
                        type="text"
                        value={documentForm.staffDepartment}
                        onChange={handleDocumentFieldChange('staffDepartment')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Admissions Office"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-staff-email">
                        Contact email
                      </label>
                      <input
                        id="document-staff-email"
                        type="email"
                        value={documentForm.staffEmail}
                        onChange={handleDocumentFieldChange('staffEmail')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="admissions@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="document-staff-phone">
                        Contact phone (optional)
                      </label>
                      <input
                        id="document-staff-phone"
                        type="text"
                        value={documentForm.staffPhone}
                        onChange={handleDocumentFieldChange('staffPhone')}
                        className="w-full border border-input rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="+260 900 000 000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {documentPreview && (
              <div className="bg-muted border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {DOCUMENT_TEMPLATE_DEFINITIONS[documentPreview.templateId].name} preview
                    </p>
                    <p className="text-xs text-foreground">
                      Showing {previewMode === 'html' ? 'HTML markup' : 'plain text'} output ready for review.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant={previewMode === 'html' ? 'secondary' : 'outline'}
                      onClick={() => setPreviewMode('html')}
                    >
                      HTML
                    </Button>
                    <Button
                      size="sm"
                      variant={previewMode === 'text' ? 'secondary' : 'outline'}
                      onClick={() => setPreviewMode('text')}
                    >
                      Text
                    </Button>
                  </div>
                </div>
                <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs bg-card border border-border rounded-md p-3">
                  {previewMode === 'html' ? documentPreview.html : documentPreview.text}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-8 border-t border-border">
            <div className="bg-accent/5 border border-yellow-200 rounded-lg p-4 text-sm text-accent-foreground">
              Document templates are available to authorised staff members.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
