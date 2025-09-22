import React, { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'
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
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'
import { isReportManagerRole } from '@/lib/auth/roles'
import { AnalyticsService } from '@/lib/analytics'
import { applicationService } from '@/services/applications'

interface ReportConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'regulatory'
  startDate: string
  endDate: string
  includePrograms: boolean
  includeEngagement: boolean
  includeEligibility: boolean
  format: ReportFormat
}

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
    userRole,
    isAdmin,
    isLoading: roleLoading,
    isFetching: roleFetching,
    error: roleError
  } = useRoleQuery()
  const canManageReports = useMemo(
    () => isReportManagerRole(userRole?.role),
    [userRole?.role]
  )
  const roleStatusLoading = roleLoading || roleFetching
  const [config, setConfig] = useState<ReportConfig>({
    type: 'monthly',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
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
        decisionDate: toDateInput(app.decision_date),
        interviewDate: toDateInput(interview?.scheduled_at),
        interviewTime: toTimeInput(interview?.scheduled_at),
        interviewLocation: interview?.location || '',
        interviewMode: interview?.mode || '',
        feedbackSummary: prev.feedbackSummary,
        feedbackStrengths: prev.feedbackStrengths,
        feedbackImprovements: prev.feedbackImprovements,
        feedbackRecommendation: app.review_notes || prev.feedbackRecommendation,
        staffName: prev.staffName,
        staffTitle: prev.staffTitle,
        staffDepartment: prev.staffDepartment,
        staffEmail: prev.staffEmail,
        staffPhone: prev.staffPhone,
        paymentAmountDue: app.application_fee ? String(app.application_fee) : prev.paymentAmountDue,
        paymentAmountPaid: app.amount ? String(app.amount) : prev.paymentAmountPaid,
        paymentBalance: prev.paymentBalance,
        paymentDueDate: prev.paymentDueDate,
        paymentReference: app.momo_ref || prev.paymentReference,
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
        const blob = result.pdf.blob ?? new Blob([result.pdf.bytes], { type: 'application/pdf' })
        downloadPdfDocument(blob, result.pdf.fileName)
        alert('Document generated and downloaded successfully!')
        setPreviewMode('html')
        return
      }

      const content = action === 'html' ? result.html : result.text
      setPreviewMode(action === 'html' ? 'html' : 'text')

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
        alert(action === 'html' ? 'Template HTML copied to clipboard.' : 'Template text copied to clipboard.')
      } else {
        alert('Preview updated below. Copy the contents manually.')
      }
    } catch (error) {
      console.error('Failed to generate document template:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate document template.'
      alert(message)
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

      await AnalyticsService.ensureReportManagerAccess()

      // Fetch application data
      const { data: applications, error: appsError } = await supabase
        .from('applications_new')
        .select(`
          *,
          programs(name),
          intakes(name, year)
        `)
        .gte('created_at', config.startDate)
        .lte('created_at', config.endDate)

      if (appsError) throw appsError

      // Calculate statistics
      const stats = {
        totalApplications: applications?.length || 0,
        submittedApplications: applications?.filter(app => app.status === 'submitted').length || 0,
        approvedApplications: applications?.filter(app => app.status === 'approved').length || 0,
        rejectedApplications: applications?.filter(app => app.status === 'rejected').length || 0,
        pendingApplications: applications?.filter(app => ['submitted', 'under_review'].includes(app.status)).length || 0
      }

      // Program breakdown
      const programStats = applications?.reduce((acc: any, app) => {
        const programName = app.programs?.name || 'Unknown'
        if (!acc[programName]) {
          acc[programName] = { total: 0, approved: 0, rejected: 0, pending: 0 }
        }
        acc[programName].total++
        if (app.status === 'approved') acc[programName].approved++
        if (app.status === 'rejected') acc[programName].rejected++
        if (['submitted', 'under_review'].includes(app.status)) acc[programName].pending++
        return acc
      }, {})

      // Generate report data
      const reportName = `${config.type.charAt(0).toUpperCase() + config.type.slice(1)} Report - ${config.startDate} to ${config.endDate}`

      const reportData = {
        period: `${config.startDate} to ${config.endDate}`,
        generatedAt: new Date().toISOString(),
        statistics: stats,
        programBreakdown: programStats,
        approvalRate: stats.totalApplications > 0
          ? ((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100).toFixed(2)
          : '0',
        metadata: {
          reportType: config.type,
          includePrograms: config.includePrograms,
          includeEngagement: config.includeEngagement,
          includeEligibility: config.includeEligibility,
          exportFormat: config.format,
          reportTitle: reportName
        }
      }

      // Save report to database
      const { error: saveError } = await supabase
        .from('automated_reports')
        .insert({
          report_type: config.type,
          report_name: reportName,
          report_data: reportData
        })

      if (saveError) throw saveError

      await exportReport(reportData, config.format, reportName)

      alert('Report generated and downloaded successfully!')
    } catch (error) {
      console.error('Failed to generate report:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate report. Please try again.'
      alert(message)
    } finally {
      setLoading(false)
    }
  }

  const reportTypes = [
    { value: 'daily', label: 'Daily Report', icon: Calendar },
    { value: 'weekly', label: 'Weekly Report', icon: Calendar },
    { value: 'monthly', label: 'Monthly Report', icon: Calendar },
    { value: 'regulatory', label: 'Regulatory Compliance', icon: FileText }
  ]

  const reportFormats = [
    { value: 'pdf' as ReportFormat, label: 'PDF Document', description: 'Ready-to-share summary', icon: FileDown },
    { value: 'excel' as ReportFormat, label: 'Excel Workbook', description: 'Multi-sheet analytics', icon: FileSpreadsheet },
    { value: 'json' as ReportFormat, label: 'JSON Export', description: 'Raw data for developers', icon: FileText }
  ]

  if (roleStatusLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Generate Reports</h3>
          <p className="text-sm text-gray-600">Create automated reports for analysis and compliance</p>
        </div>
        <div className="p-6 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  if (roleError) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Generate Reports</h3>
          <p className="text-sm text-gray-600">Create automated reports for analysis and compliance</p>
        </div>
        <div className="p-6">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Unable to verify your permissions at this time. Please refresh the page or contact an administrator.
          </div>
        </div>
      </div>
    )
  }

  if (!canManageReports) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Generate Reports</h3>
          <p className="text-sm text-gray-600">Create automated reports for analysis and compliance</p>
        </div>
        <div className="p-6">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            You do not have permission to access analytics report generation. Please contact your administrator if you believe this is a mistake.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Generate Reports</h3>
        <p className="text-sm text-gray-600">Create automated reports for analysis and compliance</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Report Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Report Type</label>
          <div className="grid grid-cols-2 gap-3">
            {reportTypes.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.value}
                  onClick={() => setConfig(prev => ({ ...prev, type: type.value as any }))}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    config.type === type.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Report Sections */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Include Sections</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.includePrograms}
                onChange={(e) => setConfig(prev => ({ ...prev, includePrograms: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Program Analytics</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.includeEngagement}
                onChange={(e) => setConfig(prev => ({ ...prev, includeEngagement: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">User Engagement Metrics</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.includeEligibility}
                onChange={(e) => setConfig(prev => ({ ...prev, includeEligibility: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Eligibility Success Rates</span>
            </label>
          </div>
        </div>

        {/* Output Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Output Format</label>
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
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{format.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">{format.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Generate Button */}
        <div className="pt-4 border-t border-gray-200">
          <Button
            onClick={generateReport}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating Report...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Generate & Download Report
              </>
            )}
          </Button>
        </div>

        {isAdmin ? (
          <div className="pt-8 border-t border-gray-200 space-y-6">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <span>Official Document Templates</span>
              </h4>
              <p className="text-sm text-gray-600">
                Generate structured admissions, interview and finance communications using the details provided below.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    htmlFor="document-template-select"
                  >
                    Template
                  </label>
                  <select
                    id="document-template-select"
                    value={selectedTemplate}
                    onChange={(event) => setSelectedTemplate(event.target.value as DocumentTemplateId)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {templateOptions.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-gray-700">Required placeholders</h5>
                  <ul className="mt-2 space-y-2 text-xs text-gray-600">
                    {selectedTemplateDefinition.tokens.map(token => (
                      <li key={token.token} className="border-b border-gray-200 pb-2 last:border-b-0 last:pb-0">
                        <div className="font-mono text-[11px] text-gray-500">{`{{${token.token}}}`}</div>
                        <div className="text-gray-700">
                          {token.label}
                          {token.required === false && <span className="text-gray-500"> (optional)</span>}
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
                  <div className="flex items-center text-sm text-gray-500">
                    <LoadingSpinner size="sm" className="mr-2" />
                    Preparing document…
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Fill in the relevant sections below. Optional placeholders will be skipped automatically when left blank.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <h5 className="text-sm font-semibold text-gray-700">Prefill from an application</h5>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={prefillApplicationId}
                  onChange={(event) => setPrefillApplicationId(event.target.value)}
                  placeholder="Enter application ID (UUID)"
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    prefillStatus.type === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {prefillStatus.message}
                </p>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Student & Programme</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-student-name">
                        Student full name
                      </label>
                      <input
                        id="document-student-name"
                        type="text"
                        value={documentForm.studentName}
                        onChange={handleDocumentFieldChange('studentName')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-student-email">
                        Student email
                      </label>
                      <input
                        id="document-student-email"
                        type="email"
                        value={documentForm.studentEmail}
                        onChange={handleDocumentFieldChange('studentEmail')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="student@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-student-phone">
                        Student phone (optional)
                      </label>
                      <input
                        id="document-student-phone"
                        type="text"
                        value={documentForm.studentPhone}
                        onChange={handleDocumentFieldChange('studentPhone')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="+260 700 000 000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-program-name">
                        Programme
                      </label>
                      <input
                        id="document-program-name"
                        type="text"
                        value={documentForm.programName}
                        onChange={handleDocumentFieldChange('programName')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Diploma in Accounting"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-intake">
                        Intake period
                      </label>
                      <input
                        id="document-intake"
                        type="text"
                        value={documentForm.intake}
                        onChange={handleDocumentFieldChange('intake')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="January 2025"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-start-date">
                        Programme start date
                      </label>
                      <input
                        id="document-start-date"
                        type="date"
                        value={documentForm.startDate}
                        onChange={handleDocumentFieldChange('startDate')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-response-deadline">
                        Acceptance deadline
                      </label>
                      <input
                        id="document-response-deadline"
                        type="date"
                        value={documentForm.responseDeadline}
                        onChange={handleDocumentFieldChange('responseDeadline')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-orientation-date">
                        Orientation date
                      </label>
                      <input
                        id="document-orientation-date"
                        type="date"
                        value={documentForm.orientationDate}
                        onChange={handleDocumentFieldChange('orientationDate')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-reference-number">
                        Reference number
                      </label>
                      <input
                        id="document-reference-number"
                        type="text"
                        value={documentForm.referenceNumber}
                        onChange={handleDocumentFieldChange('referenceNumber')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="APP-2025-001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-decision-date">
                        Decision date (optional)
                      </label>
                      <input
                        id="document-decision-date"
                        type="date"
                        value={documentForm.decisionDate}
                        onChange={handleDocumentFieldChange('decisionDate')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Interview Details</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-interview-date">
                        Interview date
                      </label>
                      <input
                        id="document-interview-date"
                        type="date"
                        value={documentForm.interviewDate}
                        onChange={handleDocumentFieldChange('interviewDate')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-interview-time">
                        Interview time
                      </label>
                      <input
                        id="document-interview-time"
                        type="time"
                        value={documentForm.interviewTime}
                        onChange={handleDocumentFieldChange('interviewTime')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-interview-mode">
                        Interview mode
                      </label>
                      <input
                        id="document-interview-mode"
                        type="text"
                        value={documentForm.interviewMode}
                        onChange={handleDocumentFieldChange('interviewMode')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Virtual / In-person"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-interview-location">
                        Location or link
                      </label>
                      <input
                        id="document-interview-location"
                        type="text"
                        value={documentForm.interviewLocation}
                        onChange={handleDocumentFieldChange('interviewLocation')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Admissions Centre / Zoom link"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Feedback Notes</h5>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-feedback-summary">
                        Summary
                      </label>
                      <textarea
                        id="document-feedback-summary"
                        value={documentForm.feedbackSummary}
                        onChange={handleDocumentFieldChange('feedbackSummary')}
                        rows={3}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Overall impression and decision rationale"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-feedback-strengths">
                        Strengths (one per line)
                      </label>
                      <textarea
                        id="document-feedback-strengths"
                        value={documentForm.feedbackStrengths}
                        onChange={handleDocumentFieldChange('feedbackStrengths')}
                        rows={3}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={"Strong leadership skills\nClear motivation"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-feedback-improvements">
                        Areas for improvement (one per line)
                      </label>
                      <textarea
                        id="document-feedback-improvements"
                        value={documentForm.feedbackImprovements}
                        onChange={handleDocumentFieldChange('feedbackImprovements')}
                        rows={3}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={"Strengthen quantitative examples\nProvide additional references"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-feedback-recommendation">
                        Recommended next steps (optional)
                      </label>
                      <textarea
                        id="document-feedback-recommendation"
                        value={documentForm.feedbackRecommendation}
                        onChange={handleDocumentFieldChange('feedbackRecommendation')}
                        rows={2}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Suggested improvements or follow-up guidance"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Payment Summary</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-amount-due">
                        Total charges (K)
                      </label>
                      <input
                        id="document-amount-due"
                        type="text"
                        value={documentForm.paymentAmountDue}
                        onChange={handleDocumentFieldChange('paymentAmountDue')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="1250"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-amount-paid">
                        Payments received (K)
                      </label>
                      <input
                        id="document-amount-paid"
                        type="text"
                        value={documentForm.paymentAmountPaid}
                        onChange={handleDocumentFieldChange('paymentAmountPaid')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-balance">
                        Outstanding balance (K)
                      </label>
                      <input
                        id="document-balance"
                        type="text"
                        value={documentForm.paymentBalance}
                        onChange={handleDocumentFieldChange('paymentBalance')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="450"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-payment-due">
                        Payment due date
                      </label>
                      <input
                        id="document-payment-due"
                        type="date"
                        value={documentForm.paymentDueDate}
                        onChange={handleDocumentFieldChange('paymentDueDate')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-payment-reference">
                        Payment reference
                      </label>
                      <input
                        id="document-payment-reference"
                        type="text"
                        value={documentForm.paymentReference}
                        onChange={handleDocumentFieldChange('paymentReference')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="INV-2025-04"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-payment-last">
                        Last payment date (optional)
                      </label>
                      <input
                        id="document-payment-last"
                        type="date"
                        value={documentForm.paymentLastPaymentDate}
                        onChange={handleDocumentFieldChange('paymentLastPaymentDate')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-payment-breakdown">
                      Itemised breakdown (one item per line e.g. Tuition - 950)
                    </label>
                    <textarea
                      id="document-payment-breakdown"
                      value={documentForm.paymentBreakdown}
                      onChange={handleDocumentFieldChange('paymentBreakdown')}
                      rows={3}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={"Tuition - 950\nLibrary Fee - 50"}
                    />
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Staff Contact</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-staff-name">
                        Staff name
                      </label>
                      <input
                        id="document-staff-name"
                        type="text"
                        value={documentForm.staffName}
                        onChange={handleDocumentFieldChange('staffName')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Dr. Chanda Mwila"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-staff-title">
                        Title / role
                      </label>
                      <input
                        id="document-staff-title"
                        type="text"
                        value={documentForm.staffTitle}
                        onChange={handleDocumentFieldChange('staffTitle')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Admissions Director"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-staff-department">
                        Department (optional)
                      </label>
                      <input
                        id="document-staff-department"
                        type="text"
                        value={documentForm.staffDepartment}
                        onChange={handleDocumentFieldChange('staffDepartment')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Admissions Office"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-staff-email">
                        Contact email
                      </label>
                      <input
                        id="document-staff-email"
                        type="email"
                        value={documentForm.staffEmail}
                        onChange={handleDocumentFieldChange('staffEmail')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="admissions@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="document-staff-phone">
                        Contact phone (optional)
                      </label>
                      <input
                        id="document-staff-phone"
                        type="text"
                        value={documentForm.staffPhone}
                        onChange={handleDocumentFieldChange('staffPhone')}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="+260 900 000 000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {documentPreview && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {DOCUMENT_TEMPLATE_DEFINITIONS[documentPreview.templateId].name} preview
                    </p>
                    <p className="text-xs text-gray-500">
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
                <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs bg-white border border-gray-200 rounded-md p-3">
                  {previewMode === 'html' ? documentPreview.html : documentPreview.text}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-8 border-t border-gray-200">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              Document templates are available to authorised staff members.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}