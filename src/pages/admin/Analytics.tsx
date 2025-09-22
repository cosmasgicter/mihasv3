import React, { useState, useEffect } from 'react'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { AnalyticsService, ApplicationStats, ProgramAnalytics, EligibilityAnalytics, AutomatedReport } from '@/lib/analytics'
import { ReportsGenerator } from '@/components/admin/ReportsGenerator'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { exportReport, ReportExportData, ReportFormat } from '@/lib/reportExports'
import { TrendingUp, Users, FileText, CheckCircle, Download, Plus, Edit, Trash2, RefreshCw, Eye, Filter, BarChart3 } from 'lucide-react'
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'
import { isReportManagerRole } from '@/lib/auth/roles'
import { useToast } from '@/components/ui/Toast'

export default function Analytics() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'programs' | 'eligibility' | 'reports'>('overview')
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  
  const [applicationStats, setApplicationStats] = useState<ApplicationStats[]>([])
  const [programAnalytics, setProgramAnalytics] = useState<ProgramAnalytics[]>([])
  const [eligibilityAnalytics, setEligibilityAnalytics] = useState<EligibilityAnalytics[]>([])
  const [automatedReports, setAutomatedReports] = useState<AutomatedReport[]>([])
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null)
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [createType, setCreateType] = useState<'application' | 'program' | 'eligibility'>('application')
  const [formData, setFormData] = useState<any>({})
  const [exportFormat, setExportFormat] = useState<ReportFormat>('pdf')
  const {
    userRole,
    isLoading: roleLoading,
    isFetching: roleFetching,
    error: roleError
  } = useRoleQuery()
  const canManageReports = isReportManagerRole(userRole?.role)
  const roleStatusLoading = roleLoading || roleFetching
  const { showSuccess, showError, showInfo } = useToast()

  useEffect(() => {
    loadAnalytics()
  }, [dateRange])

  useEffect(() => {
    if (canManageReports) {
      loadAutomatedReports()
    } else {
      setAutomatedReports([])
    }
  }, [canManageReports])

  useEffect(() => {
    if (!canManageReports && activeTab === 'reports') {
      setActiveTab('overview')
    }
  }, [activeTab, canManageReports])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const summary = await AnalyticsService.getAnalyticsSummary(dateRange.start, dateRange.end)
      
      setApplicationStats(summary.applicationStats)
      setProgramAnalytics(summary.programAnalytics)
      setEligibilityAnalytics(summary.eligibilityAnalytics)
      setAnalyticsSummary(summary)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAutomatedReports = async () => {
    try {
      const reports = await AnalyticsService.getAutomatedReports(20)
      setAutomatedReports(reports)
    } catch (error) {
      console.error('Failed to load reports:', error)
    }
  }

  const refreshData = async () => {
    try {
      setRefreshing(true)
      await AnalyticsService.refreshAnalyticsData()
      await loadAnalytics()
      await loadAutomatedReports()
    } catch (error) {
      console.error('Failed to refresh data:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const handleCreate = async () => {
    try {
      if (createType === 'application') {
        await AnalyticsService.createApplicationStats(formData)
      } else if (createType === 'program') {
        await AnalyticsService.createProgramAnalytics(formData)
      } else if (createType === 'eligibility') {
        await AnalyticsService.createEligibilityAnalytics(formData)
      }

      setShowCreateDialog(false)
      setFormData({})
      await loadAnalytics()
      showSuccess('Record created successfully!')
    } catch (error) {
      console.error('Failed to create record:', error)
      const fallbackMessage = 'Failed to create record'
      const message = error instanceof Error ? error.message : fallbackMessage
      showError(fallbackMessage, message !== fallbackMessage ? message : undefined)
    }
  }

  const handleEdit = async () => {
    try {
      if (!selectedItem?.id) return
      
      if (selectedItem.type === 'application') {
        await AnalyticsService.updateApplicationStats(selectedItem.id, formData)
      } else if (selectedItem.type === 'program') {
        await AnalyticsService.updateProgramAnalytics(selectedItem.id, formData)
      } else if (selectedItem.type === 'eligibility') {
        await AnalyticsService.updateEligibilityAnalytics(selectedItem.id, formData)
      }
      
      setShowEditDialog(false)
      setSelectedItem(null)
      setFormData({})
      await loadAnalytics()
      showSuccess('Record updated successfully!')
    } catch (error) {
      console.error('Failed to update record:', error)
      const fallbackMessage = 'Failed to update record'
      const message = error instanceof Error ? error.message : fallbackMessage
      showError(fallbackMessage, message !== fallbackMessage ? message : undefined)
    }
  }

  const handleDelete = async () => {
    try {
      if (!selectedItem?.id) return
      
      if (selectedItem.type === 'application') {
        await AnalyticsService.deleteApplicationStats(selectedItem.id)
      } else if (selectedItem.type === 'program') {
        await AnalyticsService.deleteProgramAnalytics(selectedItem.id)
      } else if (selectedItem.type === 'eligibility') {
        await AnalyticsService.deleteEligibilityAnalytics(selectedItem.id)
      } else if (selectedItem.type === 'report') {
        await AnalyticsService.deleteAutomatedReport(selectedItem.id)
      }
      
      setShowDeleteDialog(false)
      setSelectedItem(null)
      await loadAnalytics()
      await loadAutomatedReports()
      showSuccess('Record deleted successfully!')
    } catch (error) {
      console.error('Failed to delete record:', error)
      const fallbackMessage = 'Failed to delete record'
      const message = error instanceof Error ? error.message : fallbackMessage
      showError(fallbackMessage, message !== fallbackMessage ? message : undefined)
    }
  }

  const generateReport = async () => {
    try {
      if (!canManageReports) {
        throw new Error('You do not have permission to generate analytics reports.')
      }

      const { report } = await AnalyticsService.generateDailyReport(exportFormat)
      await loadAutomatedReports()

      const reportData: ReportExportData = report.reportData || (report as any).report_data
      const reportName = report.reportName || (report as any).report_name || 'Daily Report'

      await exportReport(reportData, exportFormat, reportName)

      showInfo('Analytics report ready', 'The report was generated and downloaded successfully.')
    } catch (error) {
      console.error('Failed to generate report:', error)
      const fallbackMessage = 'Failed to generate report'
      const message = error instanceof Error ? error.message : fallbackMessage
      showError(fallbackMessage, message !== fallbackMessage ? message : undefined)
    }
  }

  const totalApplications = analyticsSummary?.totalApplications || 0
  const totalApproved = analyticsSummary?.totalApproved || 0
  const totalRejected = analyticsSummary?.totalRejected || 0
  const overallApprovalRate = analyticsSummary?.overallApprovalRate || 0
  const avgEligibilitySuccess = analyticsSummary?.avgEligibilitySuccess || 0
  const uniqueUsers = analyticsSummary?.uniqueUsers || 0
  const avgSessionDuration = analyticsSummary?.avgSessionDuration || 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <AdminNavigation />
      
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-teal-600 rounded-2xl p-6 text-white shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">📊 Analytics & Reporting</h1>
              <p className="text-xl text-white/90 mt-2">Application statistics and trends analysis with full CRUD functionality</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={refreshData}
                disabled={refreshing}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <div className="text-right">
                <div className="text-3xl font-bold">{totalApplications}</div>
                <div className="text-sm text-white/80">Total Applications</div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 mb-8">
          <div className="flex flex-wrap border-b border-gray-200">
            {[
              { key: 'overview', label: '📊 Overview', icon: BarChart3 },
              { key: 'applications', label: '📋 Applications', icon: FileText },
              { key: 'programs', label: '🎓 Programs', icon: Users },
              { key: 'eligibility', label: '✅ Eligibility', icon: CheckCircle },
              { key: 'reports', label: '📄 Reports', icon: Download }
            ].map((tab) => {
              const Icon = tab.icon
              const isReportsTab = tab.key === 'reports'
              const disabled = isReportsTab && (!canManageReports || roleStatusLoading || Boolean(roleError))
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    if (disabled) {
                      return
                    }
                    setActiveTab(tab.key as any)
                  }}
                  disabled={disabled}
                  className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-green-500 text-green-600 bg-green-50'
                      : disabled
                        ? 'border-transparent text-gray-300 cursor-not-allowed'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters & Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setCreateType('application')
                  setFormData({})
                  setShowCreateDialog(true)
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stats
              </Button>
              <Button
                onClick={generateReport}
                disabled={!canManageReports || roleStatusLoading || Boolean(roleError)}
                className={`bg-blue-600 text-white ${(!canManageReports || roleStatusLoading || Boolean(roleError)) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-700'}`}
              >
                <Download className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
              {roleError && (
                <p className="text-xs text-red-600 w-full">
                  Unable to verify analytics permissions. Please refresh and try again.
                </p>
              )}
              {!roleError && !roleStatusLoading && !canManageReports && (
                <p className="text-xs text-amber-600 w-full">
                  Report generation is limited to authorised admissions, registrar, finance or admin staff.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              />
            </div>
            <div>
              <label htmlFor="quick_range" className="block text-sm font-medium text-gray-700 mb-2">Quick Range</label>
              <select
                id="quick_range"
                onChange={(e) => {
                  const days = parseInt(e.target.value)
                  if (days > 0) {
                    setDateRange({
                      start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      end: new Date().toISOString().split('T')[0]
                    })
                  }
                }}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              >
                <option value="">Select Range</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
              </select>
            </div>
            <div>
              <label htmlFor="export_format" className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
              <select
                id="export_format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ReportFormat)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              >
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Total Applications</p>
                    <p className="text-3xl font-bold text-gray-900">{totalApplications}</p>
                    <p className="text-xs text-gray-500 mt-1">+12% from last month</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-2xl">
                    <FileText className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Approval Rate</p>
                    <p className="text-3xl font-bold text-green-600">{overallApprovalRate}%</p>
                    <p className="text-xs text-gray-500 mt-1">+5% from last month</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-2xl">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Eligibility Success</p>
                    <p className="text-3xl font-bold text-purple-600">{avgEligibilitySuccess}%</p>
                    <p className="text-xs text-gray-500 mt-1">+8% from last month</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-2xl">
                    <TrendingUp className="h-8 w-8 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Active Users</p>
                    <p className="text-3xl font-bold text-indigo-600">{uniqueUsers}</p>
                    <p className="text-xs text-gray-500 mt-1">+15% from last month</p>
                  </div>
                  <div className="p-3 bg-indigo-100 rounded-2xl">
                    <Users className="h-8 w-8 text-indigo-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Program Analytics */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 mb-8 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  🏆 Program Performance
                </h3>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          🎓 Program
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          📋 Applications
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          ✅ Approval Rate
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          ⏱️ Avg Processing
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {programAnalytics.map((program, index) => (
                        <tr key={index} className="hover:bg-blue-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{sanitizeForDisplay(program.programName)}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                              {program.applicationsCount}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                              {program.approvalRate}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                              {program.averageProcessingDays} days
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex space-x-2">
                              <Button
                                onClick={() => {
                                  setSelectedItem({ ...program, type: 'program' })
                                  setFormData(program)
                                  setShowEditDialog(true)
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={() => {
                                  setSelectedItem({ ...program, type: 'program' })
                                  setShowDeleteDialog(true)
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'applications' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">📋 Application Statistics</h3>
              <Button
                onClick={() => {
                  setCreateType('application')
                  setFormData({})
                  setShowCreateDialog(true)
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Record
              </Button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rejected</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {applicationStats.map((stat, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(stat.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.totalApplications}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.submittedApplications}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.approvedApplications}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.rejectedApplications}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => {
                                setSelectedItem({ ...stat, type: 'application' })
                                setFormData(stat)
                                setShowEditDialog(true)
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => {
                                setSelectedItem({ ...stat, type: 'application' })
                                setShowDeleteDialog(true)
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'eligibility' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">✅ Eligibility Analytics</h3>
              <Button
                onClick={() => {
                  setCreateType('eligibility')
                  setFormData({})
                  setShowCreateDialog(true)
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Record
              </Button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Checks</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passed</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {eligibilityAnalytics.map((analytics, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(analytics.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{analytics.totalChecks}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{analytics.passedChecks}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            analytics.successRate >= 70 
                              ? 'bg-green-100 text-green-800'
                              : analytics.successRate >= 50
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {analytics.successRate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => {
                                setSelectedItem({ ...analytics, type: 'eligibility' })
                                setFormData(analytics)
                                setShowEditDialog(true)
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => {
                                setSelectedItem({ ...analytics, type: 'eligibility' })
                                setShowDeleteDialog(true)
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          !canManageReports ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center text-sm text-amber-700">
              You do not have permission to view analytics reports.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900">📄 Automated Reports</h3>
                </div>
                <div className="p-6">
                  {automatedReports.length === 0 ? (
                    <div className="text-center text-sm text-gray-500 py-6">
                      No automated reports available yet. Generate a report to populate this list.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {automatedReports.map((report, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-gray-900">{sanitizeForDisplay(report.reportName)}</h4>
                              <p className="text-sm text-gray-500">{sanitizeForDisplay(report.reportType)}</p>
                              <p className="text-xs text-gray-400">{new Date(report.createdAt || '').toLocaleString()}</p>
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                onClick={async () => {
                                  try {
                                    const format = (report as any).format || (report.reportData?.metadata?.exportFormat as ReportFormat) || 'json'
                                    const reportData: ReportExportData = report.reportData || (report as any).report_data
                                    await exportReport(reportData, format, report.reportName || (report as any).report_name || 'automated_report')
                                    showInfo('Report downloaded', 'The report has been downloaded successfully.')
                                  } catch (error) {
                                    console.error('Failed to download report:', error)
                                    const fallbackMessage = 'Failed to download report'
                                    const message = error instanceof Error ? error.message : fallbackMessage
                                    showError(fallbackMessage, message !== fallbackMessage ? message : undefined)
                                  }
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={() => {
                                  setSelectedItem({ ...report, type: 'report' })
                                  setShowDeleteDialog(true)
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <ReportsGenerator />
            </div>
          )
        )}

        {/* Create Dialog */}
        {showCreateDialog && (
          <Dialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.date || ''}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              
              {createType === 'application' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total Applications</label>
                    <input
                      type="number"
                      value={formData.totalApplications || ''}
                      onChange={(e) => setFormData({ ...formData, totalApplications: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Submitted Applications</label>
                    <input
                      type="number"
                      value={formData.submittedApplications || ''}
                      onChange={(e) => setFormData({ ...formData, submittedApplications: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Approved Applications</label>
                    <input
                      type="number"
                      value={formData.approvedApplications || ''}
                      onChange={(e) => setFormData({ ...formData, approvedApplications: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rejected Applications</label>
                    <input
                      type="number"
                      value={formData.rejectedApplications || ''}
                      onChange={(e) => setFormData({ ...formData, rejectedApplications: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </>
              )}

              {createType === 'eligibility' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total Checks</label>
                    <input
                      type="number"
                      value={formData.totalChecks || ''}
                      onChange={(e) => setFormData({ ...formData, totalChecks: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Passed Checks</label>
                    <input
                      type="number"
                      value={formData.passedChecks || ''}
                      onChange={(e) => setFormData({ ...formData, passedChecks: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Success Rate (%)</label>
                    <input
                      type="number"
                      value={formData.successRate || ''}
                      onChange={(e) => setFormData({ ...formData, successRate: parseFloat(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  onClick={() => setShowCreateDialog(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Create
                </Button>
              </div>
            </div>
          </Dialog>
        )}

        {/* Edit Dialog */}
        {showEditDialog && (
          <Dialog
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.date || ''}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              
              {selectedItem?.type === 'application' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total Applications</label>
                    <input
                      type="number"
                      value={formData.totalApplications || ''}
                      onChange={(e) => setFormData({ ...formData, totalApplications: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Approved Applications</label>
                    <input
                      type="number"
                      value={formData.approvedApplications || ''}
                      onChange={(e) => setFormData({ ...formData, approvedApplications: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  onClick={() => setShowEditDialog(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEdit}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Update
                </Button>
              </div>
            </div>
          </Dialog>
        )}

        {/* Delete Dialog */}
        {showDeleteDialog && (
          <Dialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <div className="space-y-4">
              <p className="text-gray-600">
                Are you sure you want to delete this {selectedItem?.type} record? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  onClick={() => setShowDeleteDialog(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Dialog>
        )}
      </main>
    </div>
  )
}