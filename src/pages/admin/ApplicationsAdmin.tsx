import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useBulkOperations } from '@/hooks/useBulkOperations'
import { exportToCSV, exportToExcel } from '@/lib/exportUtils'
import { sanitizeHtml } from '@/lib/sanitizer'
import { Eye, Download, Filter, Search, Mail, CheckSquare, Square } from 'lucide-react'
import { ApplicationsSkeleton } from '@/components/admin/applications'
import { useApplicationsData } from '@/hooks/admin'

interface ApplicationSummary {
  id: string
  application_number: string
  full_name: string
  email: string
  phone: string
  program: string
  intake: string
  institution: string
  status: string
  payment_status: string
  payment_verified_at: string | null
  payment_verified_by: string | null
  payment_verified_by_name: string | null
  payment_verified_by_email: string | null
  last_payment_audit_id: number | null
  last_payment_audit_at: string | null
  last_payment_audit_by_name: string | null
  last_payment_audit_by_email: string | null
  last_payment_audit_notes: string | null
  last_payment_reference: string | null
  application_fee: number
  paid_amount: number
  submitted_at: string
  created_at: string
  result_slip_url: string
  extra_kyc_url: string
  pop_url: string
  grades_summary: string
  total_subjects: number
  average_grade: number
  age: number
  days_since_submission: number
}

export default function ApplicationsAdmin() {
  const {
    applications,
    isInitialLoading,
    isRefreshing,
    isLoadingMore,
    error: dataError,
    loadApplications,
    loadNextPage,
    hasMore,
    pagination,
    updateStatus: updateApplicationStatus,
    updatePaymentStatus: updateApplicationPaymentStatus
  } = useApplicationsData()
  const [operationError, setOperationError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [institutionFilter, setInstitutionFilter] = useState('')
  const [selectedApplications, setSelectedApplications] = useState<string[]>([])
  const [ageFilter, setAgeFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [dateRangeFilter, setDateRangeFilter] = useState({ start: '', end: '' })

  const { bulkUpdateStatus, bulkUpdatePaymentStatus } = useBulkOperations()

  const handleStatusUpdate = async (applicationId: string, newStatus: string) => {
    try {
      setOperationError('')
      await updateApplicationStatus(applicationId, newStatus)
    } catch (err: any) {
      setOperationError(err.message || 'Failed to update application status.')
    }
  }

  const handlePaymentStatusUpdate = async (applicationId: string, newPaymentStatus: string) => {
    try {
      setOperationError('')
      await updateApplicationPaymentStatus(applicationId, newPaymentStatus)
    } catch (err: any) {
      setOperationError(err.message || 'Failed to update payment status.')
    }
  }

  const errorMessage = operationError || dataError

  const toggleSelection = (applicationId: string) => {
    setSelectedApplications(prev => 
      prev.includes(applicationId) 
        ? prev.filter(id => id !== applicationId)
        : [...prev, applicationId]
    )
  }

  const selectAll = () => {
    setSelectedApplications(
      selectedApplications.length === filteredApplications.length 
        ? [] 
        : filteredApplications.map(app => app.id)
    )
  }

  const handleBulkStatusUpdate = async (newStatus: string) => {
    try {
      setOperationError('')
      await bulkUpdateStatus(selectedApplications, newStatus)
      setSelectedApplications([])
      await loadApplications()
    } catch (err: any) {
      console.error('Bulk update failed:', err)
      setOperationError(err.message || 'Failed to complete bulk status update.')
    }
  }

  const handleBulkPaymentUpdate = async (newPaymentStatus: string) => {
    try {
      setOperationError('')
      await bulkUpdatePaymentStatus(selectedApplications, newPaymentStatus)
      setSelectedApplications([])
      await loadApplications()
    } catch (err: any) {
      console.error('Bulk payment update failed:', err)
      setOperationError(err.message || 'Failed to complete bulk payment update.')
    }
  }

  const handleExport = async (format: 'csv' | 'excel') => {
    const dataToExport = filteredApplications.map(app => ({
      ...app,
      submitted_at: app.submitted_at || app.created_at,
      paid_amount: app.paid_amount || 0,
      average_grade: app.average_grade || 0,
      age: app.age || 0,
      days_since_submission: app.days_since_submission || 0
    }))

    const filenameBase = `applications_${new Date().toISOString().split('T')[0]}`

    if (format === 'csv') {
      await exportToCSV(dataToExport, `${filenameBase}.csv`)
    } else {
      await exportToExcel(dataToExport, `${filenameBase}.xlsx`)
    }
  }

  const filteredApplications = applications.filter(app => {
    const matchesSearch = !searchTerm || 
      app.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.application_number.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = !statusFilter || app.status === statusFilter
    const matchesPayment = !paymentFilter || app.payment_status === paymentFilter
    const matchesProgram = !programFilter || app.program === programFilter
    const matchesInstitution = !institutionFilter || app.institution === institutionFilter

    return matchesSearch && matchesStatus && matchesPayment && matchesProgram && matchesInstitution
  })

  const getStatusBadge = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      under_review: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.draft}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }

  const getPaymentBadge = (paymentStatus: string) => {
    const colors = {
      pending_review: 'bg-yellow-100 text-yellow-800',
      verified: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[paymentStatus as keyof typeof colors] || colors.pending_review}`}>
        {paymentStatus.replace('_', ' ').toUpperCase()}
      </span>
    )
  }
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Applications Management
          </h1>
          <p className="text-gray-600">
            Manage student applications and review submissions
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-md bg-red-50 p-4 mb-6">
            <div className="text-sm text-red-700">{errorMessage}</div>
          </div>
        )}
        {isInitialLoading ? (
          <ApplicationsSkeleton />
        ) : (
          <>
            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="md:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name, email, or application number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Payments</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <select
                    value={programFilter}
                    onChange={(e) => setProgramFilter(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Programs</option>
                    <option value="Clinical Medicine">Clinical Medicine</option>
                    <option value="Environmental Health">Environmental Health</option>
                    <option value="Registered Nursing">Registered Nursing</option>
                  </select>
                </div>

                <div>
                  <select
                    value={institutionFilter}
                    onChange={(e) => setInstitutionFilter(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Institutions</option>
                    <option value="Kalulushi Training Centre">Kalulushi Training Centre</option>
                    <option value="Mukuba Institute of Health and Allied Sciences">Mukuba Institute of Health and Allied Sciences</option>
                  </select>
                </div>
              </div>
            </div>

            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-blue-600 mb-4">
                <LoadingSpinner size="sm" />
                <span>Refreshing latest applications…</span>
              </div>
            )}

            {/* Applications Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Application
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Program
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subjects
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredApplications.map((app) => (
                      <tr key={app.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {app.application_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(app.submitted_at || app.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {app.full_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {app.email}
                          </div>
                          <div className="text-sm text-gray-500">
                            {app.phone}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {app.program}
                          </div>
                          <div className="text-sm text-gray-500">
                            {app.institution} • {app.intake}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            {getStatusBadge(app.status)}
                            <select
                              value={app.status}
                              onChange={(e) => handleStatusUpdate(app.id, e.target.value)}
                              className="block w-full text-xs rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            >
                              <option value="draft">Draft</option>
                              <option value="submitted">Submitted</option>
                              <option value="under_review">Under Review</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            {getPaymentBadge(app.payment_status)}
                            <div className="text-xs text-gray-500">
                              K{app.paid_amount || 0} / K{app.application_fee}
                            </div>
                            <select
                              value={app.payment_status}
                              onChange={(e) => handlePaymentStatusUpdate(app.id, e.target.value)}
                              className="block w-full text-xs rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            >
                              <option value="pending_review">Pending Review</option>
                              <option value="verified">Verified</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {app.total_subjects} subjects
                          </div>
                          {app.grades_summary && (
                            <div className="text-xs text-gray-500 max-w-xs truncate" title={sanitizeHtml(app.grades_summary)}>
                              {sanitizeHtml(app.grades_summary)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-y-1">
                          <div className="flex flex-col space-y-1">
                            {app.result_slip_url && (
                              <a
                                href={app.result_slip_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-900 text-xs"
                              >
                                Result Slip
                              </a>
                            )}
                            {app.extra_kyc_url && (
                              <a
                                href={app.extra_kyc_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-900 text-xs"
                              >
                                Extra KYC
                              </a>
                            )}
                            {app.pop_url && (
                              <a
                                href={app.pop_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-900 text-xs"
                              >
                                Proof of Payment
                              </a>
                            )}
                          </div>
                        </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
            {filteredApplications.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-500">No applications found matching your criteria.</div>
              </div>
            )}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-500">
                Showing{' '}
                <span className="font-semibold text-gray-700">{filteredApplications.length}</span>
                {' '}of{' '}
                <span className="font-semibold text-gray-700">{pagination.loadedCount}</span>{' '}
                loaded
                {pagination.totalCount > 0 && (
                  <>
                    {' '}•{' '}
                    <span className="font-semibold text-gray-700">{pagination.totalCount}</span>{' '}
                    total
                  </>
                )}{' '}
                applications
              </div>

              {hasMore ? (
                <button
                  type="button"
                  onClick={loadNextPage}
                  disabled={isLoadingMore}
                  className="inline-flex items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoadingMore && <LoadingSpinner size="sm" className="mr-2" />}
                  {isLoadingMore ? 'Loading more...' : 'Load more applications'}
                </button>
              ) : (
                pagination.totalCount > 0 && (
                  <span className="text-sm text-gray-400">All applications loaded.</span>
                )
              )}
            </div>
          </div>

            {/* Summary Stats */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-gray-900">
                  {pagination.totalCount}
                </div>
                <div className="text-sm text-gray-500">Total Applications</div>
                <div className="text-xs text-gray-400 mt-1">Loaded: {applications.length}</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-blue-600">
                  {applications.filter(app => app.status === 'submitted').length}
                </div>
                <div className="text-sm text-gray-500">Submitted (loaded)</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-yellow-600">
                  {applications.filter(app => app.payment_status === 'pending_review').length}
                </div>
                <div className="text-sm text-gray-500">Pending Payment Review (loaded)</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-green-600">
                  {applications.filter(app => app.status === 'approved').length}
                </div>
                <div className="text-sm text-gray-500">Approved (loaded)</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}