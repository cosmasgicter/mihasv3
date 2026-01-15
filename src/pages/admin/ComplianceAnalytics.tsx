import React, { useState } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'
import { Shield, CheckCircle, AlertTriangle, XCircle, RefreshCw, Download, FileText } from 'lucide-react'
import { useComplianceCheck, useGenerateComplianceReport, useValidateCompliance } from '@/hooks/useAnalyticsQueries'
import type { ComplianceCheck } from '@/services/analyticsService'

export default function ComplianceAnalytics() {
  const [selectedCheck, setSelectedCheck] = useState<ComplianceCheck | null>(null)
  const { success: showSuccess, error: showError } = useToastStore()
  
  // Use React Query hooks
  const { data: report, isLoading, refetch, isFetching } = useComplianceCheck(true)
  const generateReportMutation = useGenerateComplianceReport()
  const validateMutation = useValidateCompliance()

  const refreshData = async () => {
    try {
      await refetch()
      showSuccess('Compliance report refreshed successfully')
    } catch (error) {
      showError('Failed to refresh compliance report', error instanceof Error ? error.message : undefined)
    }
  }

  const generateReport = async () => {
    try {
      const blob = await generateReportMutation.mutateAsync({
        format: 'pdf',
        includeDetails: true
      })

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `compliance-report-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      showSuccess('Compliance report generated successfully')
    } catch (error) {
      console.error('Failed to generate report:', error)
      showError('Failed to generate report', error instanceof Error ? error.message : undefined)
    }
  }

  const validateCompliance = async () => {
    try {
      const result = await validateMutation.mutateAsync()
      showSuccess('Compliance validation completed', result.message)
    } catch (error) {
      console.error('Failed to validate compliance:', error)
      showError('Failed to validate compliance', error instanceof Error ? error.message : undefined)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-error" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />
      default:
        return <Shield className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'bg-success/10 text-success'
      case 'failed':
        return 'bg-error/10 text-error'
      case 'warning':
        return 'bg-warning/10 text-warning'
      default:
        return 'bg-muted text-gray-900'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6" />
                Compliance Analytics
              </h1>
              <p className="text-sm text-white/90 mt-2">
                Monitor regulatory compliance and data protection standards
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={refreshData}
                disabled={isFetching}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={validateCompliance}
                disabled={validateMutation.isPending}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Validate
              </Button>
              <Button
                onClick={generateReport}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Compliance Score</p>
                <p className="text-2xl sm:text-3xl font-bold text-primary">
                  {report?.complianceScore || 0}%
                </p>
                <p className="text-xs text-gray-600 mt-1">Overall rating</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Shield className="h-8 w-8 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Passed Checks</p>
                <p className="text-2xl sm:text-3xl font-bold text-success">
                  {report?.passedChecks || 0}
                </p>
                <p className="text-xs text-gray-600 mt-1">Out of {report?.totalChecks || 0}</p>
              </div>
              <div className="p-3 bg-success/10 rounded-2xl">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Warnings</p>
                <p className="text-2xl sm:text-3xl font-bold text-warning">
                  {report?.warningChecks || 0}
                </p>
                <p className="text-xs text-gray-600 mt-1">Needs attention</p>
              </div>
              <div className="p-3 bg-warning/10 rounded-2xl">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Failed Checks</p>
                <p className="text-2xl sm:text-3xl font-bold text-error">
                  {report?.failedChecks || 0}
                </p>
                <p className="text-xs text-gray-600 mt-1">Critical issues</p>
              </div>
              <div className="p-3 bg-error/10 rounded-2xl">
                <XCircle className="h-8 w-8 text-error" />
              </div>
            </div>
          </div>
        </div>

        {/* Overall Status */}
        <div className="bg-card rounded-2xl shadow-lg border border-border p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Overall Compliance Status</h3>
              <p className="text-sm text-gray-600">
                Last updated: {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : 'N/A'}
              </p>
            </div>
            <div>
              <span className={`inline-flex items-center px-4 py-2 text-sm font-semibold rounded-full ${
                report?.overallStatus === 'compliant'
                  ? 'bg-success/10 text-success'
                  : report?.overallStatus === 'non-compliant'
                  ? 'bg-error/10 text-error'
                  : 'bg-warning/10 text-warning'
              }`}>
                {report?.overallStatus === 'compliant' && <CheckCircle className="h-4 w-4 mr-2" />}
                {report?.overallStatus === 'non-compliant' && <XCircle className="h-4 w-4 mr-2" />}
                {report?.overallStatus === 'partial' && <AlertTriangle className="h-4 w-4 mr-2" />}
                {report?.overallStatus?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
          </div>
        </div>

        {/* Compliance Checks Table */}
        <div className="bg-card rounded-2xl shadow-lg border border-border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-muted to-blue-50 border-b border-border">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Detailed Compliance Checks
            </h3>
          </div>
          <div className="p-6">
            {!report || report.checks.length === 0 ? (
              <div className="text-center text-gray-600 py-8">
                No compliance checks available. Run a validation to generate a report.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Check Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Message
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {report.checks.map((check) => (
                      <tr key={check.id} className="hover:bg-muted transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(check.status)}`}>
                            {getStatusIcon(check.status)}
                            <span className="ml-1">{check.status.toUpperCase()}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {check.checkType}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {check.message}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(check.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button
                            onClick={() => setSelectedCheck(check)}
                            className="bg-primary hover:bg-primary text-white px-3 py-1 text-xs"
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Details Modal */}
        {selectedCheck && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Check Details</h3>
                <button
                  onClick={() => setSelectedCheck(null)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-900">Check Type</label>
                  <p className="text-gray-900 mt-1">{selectedCheck.checkType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-900">Status</label>
                  <p className="mt-1">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedCheck.status)}`}>
                      {getStatusIcon(selectedCheck.status)}
                      <span className="ml-1">{selectedCheck.status.toUpperCase()}</span>
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-900">Message</label>
                  <p className="text-gray-900 mt-1">{selectedCheck.message}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-900">Timestamp</label>
                  <p className="text-gray-900 mt-1">{new Date(selectedCheck.timestamp).toLocaleString()}</p>
                </div>
                {selectedCheck.details && (
                  <div>
                    <label className="text-sm font-medium text-gray-900">Additional Details</label>
                    <pre className="mt-1 p-4 bg-muted rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(selectedCheck.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
