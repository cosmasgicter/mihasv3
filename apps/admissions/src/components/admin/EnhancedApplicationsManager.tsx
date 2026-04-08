import React, { useState } from 'react'
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Bell,
  FileImage,
  History,
  Zap,
  Settings,
  X,
  ArrowUp,
  ArrowDown,
  Calendar,
  Users,
  TrendingUp,
  FileText,
  User,
  BarChart3,
  GraduationCap
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/dateFormat'
import { formatApplicationStatus, type ApplicationStatus } from '@/types/applicationStatus'
import { getApplicationStatusBadgeClass, STATUS_FILTER_OPTIONS } from '@/lib/applicationStatusUi'

interface Application {
  id: string
  application_number: string
  full_name: string
  email: string
  program: string
  status: ApplicationStatus
  created_at: string
  submitted_at?: string
}

interface EnhancedApplicationsManagerProps {
  applications: Application[]
  loading: boolean
  onStatusUpdate: (id: string, status: ApplicationStatus) => void
  onBulkAction: (action: 'under_review' | 'approved' | 'rejected', ids: string[]) => void
}

export function EnhancedApplicationsManager({ 
  applications, 
  loading, 
  onStatusUpdate, 
  onBulkAction 
}: EnhancedApplicationsManagerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all')
  const [selectedApplications, setSelectedApplications] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const filteredApplications = applications.filter(app => {
    const matchesSearch = app.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.application_number.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter
    return matchesSearch && matchesStatus
  }).sort((a, b) => {
    let comparison = 0
    switch (sortBy) {
      case 'name':
        comparison = a.full_name.localeCompare(b.full_name)
        break
      case 'status':
        comparison = a.status.localeCompare(b.status)
        break
      case 'date':
      default:
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        break
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const stats = {
    total: applications.length,
    submitted: applications.filter(app => app.status === 'submitted').length,
    approved: applications.filter(app => app.status === 'approved').length,
    rejected: applications.filter(app => app.status === 'rejected').length,
    under_review: applications.filter(app => app.status === 'under_review').length
  }

  const toggleSelection = (id: string) => {
    setSelectedApplications(prev => 
      prev.includes(id) 
        ? prev.filter(appId => appId !== id)
        : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedApplications.length === filteredApplications.length) {
      setSelectedApplications([])
    } else {
      setSelectedApplications(filteredApplications.map(app => app.id))
    }
  }

  const getStatusColor = (status: ApplicationStatus) => getApplicationStatusBadgeClass(status)

  const getStatusIcon = (status: ApplicationStatus) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-success" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-error" />
      case 'under_review':
        return <Clock className="h-4 w-4 text-primary" />
      case 'submitted':
        return <Zap className="h-4 w-4 text-warning" />
      default:
        return <Clock className="h-4 w-4 text-foreground" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div 
          className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4 animate-fade-in"
        >
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm opacity-90">Total</div>
        </div>
        
        <div 
          className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white rounded-xl p-4 animate-fade-in"
          style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
        >
          <div className="text-2xl font-bold">{stats.submitted}</div>
          <div className="text-sm opacity-90">Submitted</div>
        </div>
        
        <div 
          className="bg-gradient-to-br from-purple-500 to-indigo-500 text-white rounded-xl p-4 animate-fade-in"
          style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
        >
          <div className="text-2xl font-bold">{stats.under_review}</div>
          <div className="text-sm opacity-90">Review</div>
        </div>
        
        <div 
          className="bg-gradient-to-br from-green-500 to-emerald-500 text-white rounded-xl p-4 animate-fade-in"
          style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}
        >
          <div className="text-2xl font-bold">{stats.approved}</div>
          <div className="text-sm opacity-90">Approved</div>
        </div>
        
        <div 
          className="bg-gradient-to-br from-red-500 to-pink-500 text-white rounded-xl p-4 animate-fade-in"
          style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}
        >
          <div className="text-2xl font-bold">{stats.rejected}</div>
          <div className="text-sm opacity-90">Rejected</div>
        </div>
      </div>

      {/* Enhanced Controls */}
      <div 
        className="bg-card rounded-xl shadow-lg border border-border p-6 animate-fade-in"
      >
        <div className="space-y-4">
          {/* Top Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h3 className="text-lg font-bold text-foreground"><Search className="w-5 h-5" /> Search & Filter</h3>
            <div className="flex items-center space-x-2">
              <div className="flex bg-accent rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'cards' ? 'bg-card text-primary shadow-sm' : 'text-foreground'
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'table' ? 'bg-card text-primary shadow-sm' : 'text-foreground'
                  }`}
                >
                  Table
                </button>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground" />
              <input
                type="text"
                placeholder="Search applications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full px-3 py-2 border border-input rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">All Status</option>
              {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-')
                const validFields = ['date', 'name', 'status'] as const
                const validOrders = ['asc', 'desc'] as const
                if (validFields.includes(field as typeof validFields[number])) {
                  setSortBy(field as typeof validFields[number])
                }
                if (validOrders.includes(order as typeof validOrders[number])) {
                  setSortOrder(order as typeof validOrders[number])
                }
              }}
              className="w-full px-3 py-2 border border-input rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="date-desc"><Calendar className="w-5 h-5" /> Newest First</option>
              <option value="date-asc"><Calendar className="w-5 h-5" /> Oldest First</option>
              <option value="name-asc"><User className="w-5 h-5" /> A-Z</option>
              <option value="name-desc"><User className="w-5 h-5" /> Z-A</option>
              <option value="status-asc"><BarChart3 className="w-5 h-5" /> Status</option>
            </select>
            
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('')
                setStatusFilter('all')
                setSortBy('date')
                setSortOrder('desc')
              }}
            >
              Clear Filters
            </Button>
          </div>

          {/* Bulk Actions */}
          {selectedApplications.length > 0 && (
            <div
              className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-primary/30 rounded-xl p-4 animate-fade-in"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-foreground"><Zap className="w-5 h-5" /> Bulk Actions</h4>
                <span className="text-sm text-foreground">{selectedApplications.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => onBulkAction('under_review', selectedApplications)}
                  className="bg-primary hover:bg-primary"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Start Review
                </Button>
                <Button
                  size="sm"
                  onClick={() => onBulkAction('approved', selectedApplications)}
                  className="bg-accent hover:bg-success"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve All
                </Button>
                <Button
                  size="sm"
                  onClick={() => onBulkAction('rejected', selectedApplications)}
                  className="bg-destructive hover:bg-error"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedApplications([])}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Applications Display */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 py-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredApplications.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          heading="No Applications Found"
          description="Try adjusting your search filters"
        />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredApplications.map((application, index) => (
            <div
              key={application.id}
              className={`bg-card rounded-xl shadow-lg border-2 transition-all duration-300 hover:shadow-xl animate-fade-in ${
                selectedApplications.includes(application.id) 
                  ? 'border-primary bg-blue-50' 
                  : 'border-border hover:border-border'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedApplications.includes(application.id)}
                      onChange={() => toggleSelection(application.id)}
                      className="h-5 w-5 mt-1 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border-input rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-foreground truncate" title={application.full_name}>{application.full_name}</h3>
                      <p className="text-sm text-foreground font-mono truncate">#{application.application_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(application.status)}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(application.status)}`}>
                      {formatApplicationStatus(application.status)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center space-x-2 text-sm text-foreground min-w-0">
                    <span className="truncate" title={application.email}>{application.email}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-foreground min-w-0">
                    <span className="truncate" title={application.program}>{application.program}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Created {formatDate(application.created_at)}</span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  {application.status === 'submitted' && (
                    <Button
                      size="sm"
                      onClick={() => onStatusUpdate(application.id, 'under_review')}
                      className="flex-1 bg-primary hover:bg-primary"
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      Review
                    </Button>
                  )}
                  
                  {application.status === 'under_review' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => onStatusUpdate(application.id, 'approved')}
                        className="flex-1 bg-accent hover:bg-success"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onStatusUpdate(application.id, 'rejected')}
                        className="flex-1 bg-destructive hover:bg-error"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  
                  {(application.status === 'approved' || application.status === 'rejected') && (
                    <div className="flex-1 text-center py-2">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(application.status)}`}>
                        {application.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div 
          className="bg-card rounded-xl shadow-lg border border-border overflow-hidden animate-fade-in"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-muted to-blue-50">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedApplications.length === filteredApplications.length && filteredApplications.length > 0}
                      onChange={selectAll}
                      className="h-4 w-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border-input rounded"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">
                    <User className="w-5 h-5" /> Applicant
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">
                    <GraduationCap className="w-5 h-5" /> Program
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">
                    <BarChart3 className="w-5 h-5" /> Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">
                    <Calendar className="w-5 h-5" /> Date
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-foreground uppercase">
                    <Zap className="w-5 h-5" /> Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredApplications.map((application, index) => (
                  <tr 
                    key={application.id}
                    className={`hover:bg-blue-50 transition-colors animate-fade-in ${
                      selectedApplications.includes(application.id) ? 'bg-blue-50' : 'bg-card'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedApplications.includes(application.id)}
                        onChange={() => toggleSelection(application.id)}
                        className="h-4 w-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border-input rounded"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="min-w-0 max-w-xs">
                        <div className="font-bold text-foreground truncate" title={application.full_name}>{application.full_name}</div>
                        <div className="text-sm text-foreground truncate" title={application.email}>{application.email}</div>
                        <div className="text-xs text-foreground font-mono truncate">#{application.application_number}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{application.program}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(application.status)}
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(application.status)}`}>
                          {formatApplicationStatus(application.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {formatDate(application.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        {application.status === 'submitted' && (
                          <Button
                            size="sm"
                            onClick={() => onStatusUpdate(application.id, 'under_review')}
                            className="bg-primary hover:bg-primary"
                          >
                            <Zap className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {application.status === 'under_review' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => onStatusUpdate(application.id, 'approved')}
                              className="bg-accent hover:bg-success"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => onStatusUpdate(application.id, 'rejected')}
                              className="bg-destructive hover:bg-error"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}