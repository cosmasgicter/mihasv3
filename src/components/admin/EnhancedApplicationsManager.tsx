import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  TrendingUp
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Application {
  id: string
  application_number: string
  full_name: string
  email: string
  program: string
  status: string
  created_at: string
  submitted_at?: string
}

interface EnhancedApplicationsManagerProps {
  applications: Application[]
  loading: boolean
  onStatusUpdate: (id: string, status: string) => void
  onBulkAction: (action: string, ids: string[]) => void
}

export function EnhancedApplicationsManager({ 
  applications, 
  loading, 
  onStatusUpdate, 
  onBulkAction 
}: EnhancedApplicationsManagerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'under_review':
        return 'bg-blue-100 text-blue-800'
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'under_review':
        return <Clock className="h-4 w-4 text-blue-500" />
      case 'submitted':
        return <Zap className="h-4 w-4 text-yellow-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4"
        >
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm opacity-90">Total</div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white rounded-xl p-4"
        >
          <div className="text-2xl font-bold">{stats.submitted}</div>
          <div className="text-sm opacity-90">Submitted</div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-500 to-indigo-500 text-white rounded-xl p-4"
        >
          <div className="text-2xl font-bold">{stats.under_review}</div>
          <div className="text-sm opacity-90">Review</div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-green-500 to-emerald-500 text-white rounded-xl p-4"
        >
          <div className="text-2xl font-bold">{stats.approved}</div>
          <div className="text-sm opacity-90">Approved</div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-red-500 to-pink-500 text-white rounded-xl p-4"
        >
          <div className="text-2xl font-bold">{stats.rejected}</div>
          <div className="text-sm opacity-90">Rejected</div>
        </motion.div>
      </div>

      {/* Enhanced Controls */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100 p-6"
      >
        <div className="space-y-4">
          {/* Top Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h3 className="text-lg font-bold text-gray-900">🔍 Search & Filter</h3>
            <div className="flex items-center space-x-2">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'cards' ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search applications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="submitted">📋 Submitted</option>
              <option value="under_review">🔍 Under Review</option>
              <option value="approved">✅ Approved</option>
              <option value="rejected">❌ Rejected</option>
            </select>
            
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-')
                setSortBy(field as any)
                setSortOrder(order as any)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="date-desc">📅 Newest First</option>
              <option value="date-asc">📅 Oldest First</option>
              <option value="name-asc">👤 A-Z</option>
              <option value="name-desc">👤 Z-A</option>
              <option value="status-asc">📊 Status</option>
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
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-gray-900">⚡ Bulk Actions</h4>
                <span className="text-sm text-gray-600">{selectedApplications.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => onBulkAction('under_review', selectedApplications)}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Start Review
                </Button>
                <Button
                  size="sm"
                  onClick={() => onBulkAction('approved', selectedApplications)}
                  className="bg-green-500 hover:bg-green-600"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve All
                </Button>
                <Button
                  size="sm"
                  onClick={() => onBulkAction('rejected', selectedApplications)}
                  className="bg-red-500 hover:bg-red-600"
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
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Applications Display */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredApplications.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12 bg-white rounded-xl shadow-lg"
        >
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No Applications Found</h3>
          <p className="text-gray-600">Try adjusting your search filters</p>
        </motion.div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredApplications.map((application, index) => (
            <motion.div
              key={application.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-white rounded-xl shadow-lg border-2 transition-all duration-300 hover:shadow-xl ${
                selectedApplications.includes(application.id) 
                  ? 'border-primary bg-blue-50' 
                  : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedApplications.includes(application.id)}
                      onChange={() => toggleSelection(application.id)}
                      className="h-5 w-5 mt-1 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-gray-900 truncate">{application.full_name}</h3>
                      <p className="text-sm text-gray-500 font-mono">#{application.application_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(application.status)}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(application.status)}`}>
                      {application.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span className="truncate">{application.email}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span className="truncate">{application.program}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Created {new Date(application.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  {application.status === 'submitted' && (
                    <Button
                      size="sm"
                      onClick={() => onStatusUpdate(application.id, 'under_review')}
                      className="flex-1 bg-blue-500 hover:bg-blue-600"
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
                        className="flex-1 bg-green-500 hover:bg-green-600"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onStatusUpdate(application.id, 'rejected')}
                        className="flex-1 bg-red-500 hover:bg-red-600"
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
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedApplications.length === filteredApplications.length && filteredApplications.length > 0}
                      onChange={selectAll}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase">
                    👤 Applicant
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase">
                    🎓 Program
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase">
                    📊 Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase">
                    📅 Date
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700 uppercase">
                    ⚡ Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredApplications.map((application, index) => (
                  <motion.tr 
                    key={application.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`hover:bg-blue-50 transition-colors ${
                      selectedApplications.includes(application.id) ? 'bg-blue-50' : 'bg-white'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedApplications.includes(application.id)}
                        onChange={() => toggleSelection(application.id)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-bold text-gray-900">{application.full_name}</div>
                        <div className="text-sm text-gray-500">{application.email}</div>
                        <div className="text-xs text-gray-400 font-mono">#{application.application_number}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{application.program}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(application.status)}
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(application.status)}`}>
                          {application.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(application.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        {application.status === 'submitted' && (
                          <Button
                            size="sm"
                            onClick={() => onStatusUpdate(application.id, 'under_review')}
                            className="bg-blue-500 hover:bg-blue-600"
                          >
                            <Zap className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {application.status === 'under_review' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => onStatusUpdate(application.id, 'approved')}
                              className="bg-green-500 hover:bg-green-600"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => onStatusUpdate(application.id, 'rejected')}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}