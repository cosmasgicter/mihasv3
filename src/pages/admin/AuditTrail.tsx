import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import {
  adminAuditService,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditLogResponse
} from '@/services/admin/audit'
import {
  Shield,
  Search,
  Filter,
  RefreshCw,
  User,
  Database,
  Clock,
  Eye,
  FileText,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  Settings,
  Trash2,
  Edit,
  Plus,
  UserCheck,
  Lock,
  Unlock,
  Mail,
  Phone,
  MapPin,
  Globe,
  Zap,
  TrendingUp,
  BarChart3
} from 'lucide-react'

const DEFAULT_PAGE_SIZE = 20

function sanitizeFilters(filters: AuditLogFilters): AuditLogFilters {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value === undefined || value === null) {
      return false
    }
    if (typeof value === 'string') {
      return value.trim().length > 0
    }
    return true
  })

  return Object.fromEntries(entries)
}

function AuditListItem({ entry }: { entry: AuditLogEntry }) {
  const [showDetails, setShowDetails] = useState(false)
  
  const relativeTime = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })
    } catch {
      return entry.createdAt
    }
  }, [entry.createdAt])

  const exactTime = useMemo(() => {
    try {
      return format(new Date(entry.createdAt), 'MMM dd, yyyy HH:mm:ss')
    } catch {
      return entry.createdAt
    }
  }, [entry.createdAt])

  const getActionDetails = (action: string) => {
    const actionLower = action.toLowerCase()
    
    // Authentication actions
    if (actionLower.includes('login') || actionLower.includes('signin')) {
      return { icon: <UserCheck className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'User Login', category: 'Authentication' }
    }
    if (actionLower.includes('logout') || actionLower.includes('signout')) {
      return { icon: <Lock className="h-4 w-4" />, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'User Logout', category: 'Authentication' }
    }
    if (actionLower.includes('register') || actionLower.includes('signup')) {
      return { icon: <Plus className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'User Registration', category: 'Authentication' }
    }
    
    // CRUD operations
    if (actionLower.includes('create') || actionLower.includes('insert') || actionLower.includes('add')) {
      return { icon: <Plus className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Created Record', category: 'Data' }
    }
    if (actionLower.includes('update') || actionLower.includes('modify') || actionLower.includes('edit')) {
      return { icon: <Edit className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Updated Record', category: 'Data' }
    }
    if (actionLower.includes('delete') || actionLower.includes('remove')) {
      return { icon: <Trash2 className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Deleted Record', category: 'Data' }
    }
    if (actionLower.includes('view') || actionLower.includes('read') || actionLower.includes('get')) {
      return { icon: <Eye className="h-4 w-4" />, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', label: 'Viewed Record', category: 'Access' }
    }
    
    // System actions
    if (actionLower.includes('settings') || actionLower.includes('config')) {
      return { icon: <Settings className="h-4 w-4" />, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', label: 'System Settings', category: 'System' }
    }
    if (actionLower.includes('email') || actionLower.includes('notification')) {
      return { icon: <Mail className="h-4 w-4" />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Email/Notification', category: 'Communication' }
    }
    if (actionLower.includes('analytics') || actionLower.includes('report')) {
      return { icon: <BarChart3 className="h-4 w-4" />, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200', label: 'Analytics/Report', category: 'Analytics' }
    }
    
    // Default
    return { icon: <Activity className="h-4 w-4" />, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', label: 'System Action', category: 'General' }
  }

  const actionDetails = getActionDetails(entry.action)
  
  const getTableDisplayName = (table: string) => {
    const tableMap: Record<string, string> = {
      'applications': 'Applications',
      'users': 'Users',
      'programs': 'Programs', 
      'intakes': 'Intakes',
      'documents': 'Documents',
      'notifications': 'Notifications',
      'settings': 'Settings',
      'audit_logs': 'Audit Logs'
    }
    return tableMap[table] || table
  }

  return (
    <div className={`group bg-card border rounded-xl hover:shadow-lg transition-all duration-300 ${actionDetails.border} ${actionDetails.bg} hover:scale-[1.01]`}>
      {/* Main List Item */}
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center justify-between">
          {/* Left Side - Action Info */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            {/* Action Icon */}
            <div className={`p-2 rounded-lg ${actionDetails.bg} ${actionDetails.color} flex-shrink-0`}>
              {actionDetails.icon}
            </div>
            
            {/* Action Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <h3 className="font-semibold text-foreground truncate">{actionDetails.label}</h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${actionDetails.color} ${actionDetails.bg} border ${actionDetails.border}`}>
                  {actionDetails.category}
                </span>
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                {/* Actor */}
                <div className="flex items-center space-x-1">
                  <User className="h-3 w-3" />
                  <span className="truncate max-w-32">{entry.actorEmail || 'System'}</span>
                </div>
                
                {/* Target */}
                {entry.targetTable && (
                  <div className="flex items-center space-x-1">
                    <Database className="h-3 w-3" />
                    <span>{getTableDisplayName(entry.targetTable)}</span>
                    {entry.targetId && (
                      <span className="text-xs text-muted-foreground font-mono">#{entry.targetId}</span>
                    )}
                  </div>
                )}
                
                {/* IP Address */}
                {entry.requestIp && (
                  <div className="flex items-center space-x-1">
                    <Globe className="h-3 w-3" />
                    <span className="font-mono text-xs">{entry.requestIp}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Right Side - Time */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">{relativeTime}</div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground">{exactTime}</div>
            </div>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showDetails ? 'rotate-90' : ''}`} />
          </div>
        </div>
      </div>
      
      {/* Expanded Details */}
      {showDetails && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 bg-muted/50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Actor Details */}
            <div className="bg-card rounded-lg p-3 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Actor Information</span>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Email:</span>
                  <p className="text-sm text-foreground">{entry.actorEmail || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">User ID:</span>
                  <p className="text-sm font-mono text-foreground">{entry.actorId || 'N/A'}</p>
                </div>
                {entry.actorRoles?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Roles:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.actorRoles.map((role, index) => (
                        <span
                          key={`${entry.id}-${role}-${index}`}
                          className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-200 dark:text-blue-800"
                        >
                          {role.replace('_', ' ').toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Request Details */}
            <div className="bg-card rounded-lg p-3 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-semibold text-foreground">Request Details</span>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Action:</span>
                  <p className="text-sm font-mono text-foreground">{entry.action}</p>
                </div>
                {entry.requestId && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Request ID:</span>
                    <p className="text-sm font-mono text-foreground">{entry.requestId}</p>
                  </div>
                )}
                {entry.requestIp && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">IP Address:</span>
                    <p className="text-sm font-mono text-foreground">{entry.requestIp}</p>
                  </div>
                )}
                {entry.userAgent && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">User Agent:</span>
                    <p className="text-xs text-muted-foreground truncate" title={entry.userAgent}>{entry.userAgent}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Target Information */}
          {entry.targetTable && (
            <div className="bg-card rounded-lg p-3 border border-border mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-foreground">Target Information</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Table:</span>
                  <p className="text-sm text-foreground">{getTableDisplayName(entry.targetTable)}</p>
                </div>
                {entry.targetId && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Record ID:</span>
                    <p className="text-sm font-mono text-foreground">{entry.targetId}</p>
                  </div>
                )}
                {entry.targetLabel && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Label:</span>
                    <p className="text-sm text-foreground">{entry.targetLabel}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Metadata */}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div className="bg-card rounded-lg p-3 border border-border mt-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-semibold text-foreground">Additional Data</span>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  {Object.keys(entry.metadata).length} fields
                </span>
              </div>
              <pre className="text-xs bg-accent dark:bg-gray-200 p-3 rounded-lg overflow-auto max-h-40 border font-mono">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AuditTrailPage() {
  const [formFilters, setFormFilters] = useState({
    action: '',
    actorEmail: '',
    targetTable: '',
    category: '',
    from: '',
    to: ''
  })
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [response, setResponse] = useState<AuditLogResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const { error: showError, success: showSuccess, info: showInfo } = useToast()

  const loadAuditEntries = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const payload = await adminAuditService.list({
        ...appliedFilters,
        page,
        pageSize
      })
      setResponse(payload)
      if (payload.data.length === 0 && Object.keys(appliedFilters).length > 0) {
        showInfo('No results', 'No audit entries match your current filters.')
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Failed to load audit log entries'
      setError(message)
      showError('Load failed', message)
    } finally {
      setLoading(false)
    }
  }, [appliedFilters, page, pageSize, showError, showInfo])

  useEffect(() => {
    void loadAuditEntries()
  }, [loadAuditEntries])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    const filters = sanitizeFilters(formFilters)
    setAppliedFilters(filters)
    showSuccess('Filters applied', 'Audit log has been filtered according to your criteria.')
  }

  const handleReset = () => {
    setFormFilters({ action: '', actorEmail: '', targetTable: '', category: '', from: '', to: '' })
    setPage(1)
    setAppliedFilters({})
    showInfo('Filters cleared', 'All filters have been reset.')
  }

  const handleRefresh = () => {
    void loadAuditEntries()
    showInfo('Refreshing', 'Loading latest audit entries...')
  }

  const exportAuditLog = () => {
    if (!response?.data.length) {
      showError('No data', 'No audit entries to export.')
      return
    }
    
    const csv = [
      'Timestamp,Action,Category,Actor Email,Actor ID,Target Table,Target ID,Request IP,User Agent',
      ...response.data.map(entry => {
        const actionDetails = (() => {
          const actionLower = entry.action.toLowerCase()
          if (actionLower.includes('login') || actionLower.includes('signin')) return 'Authentication'
          if (actionLower.includes('logout') || actionLower.includes('signout')) return 'Authentication'
          if (actionLower.includes('register') || actionLower.includes('signup')) return 'Authentication'
          if (actionLower.includes('create') || actionLower.includes('insert') || actionLower.includes('add')) return 'Data'
          if (actionLower.includes('update') || actionLower.includes('modify') || actionLower.includes('edit')) return 'Data'
          if (actionLower.includes('delete') || actionLower.includes('remove')) return 'Data'
          if (actionLower.includes('view') || actionLower.includes('read') || actionLower.includes('get')) return 'Access'
          if (actionLower.includes('settings') || actionLower.includes('config')) return 'System'
          if (actionLower.includes('email') || actionLower.includes('notification')) return 'Communication'
          if (actionLower.includes('analytics') || actionLower.includes('report')) return 'Analytics'
          return 'General'
        })()
        
        return `"${entry.createdAt}","${entry.action}","${actionDetails}","${entry.actorEmail || ''}","${entry.actorId || ''}","${entry.targetTable || ''}","${entry.targetId || ''}","${entry.requestIp || ''}","${(entry.userAgent || '').replace(/"/g, "'")}"`
      })
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mihas-audit-log-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    showSuccess('Export complete', 'Audit log has been downloaded as CSV.')
  }

  const canGoBack = (response?.page ?? 1) > 1
  const canGoForward = (response?.page ?? 1) < (response?.totalPages ?? 1)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">System Audit Trail</h1>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                {response?.totalCount || 0} security events tracked
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="sm:hidden"
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportAuditLog}
              disabled={!response?.data.length}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary uppercase tracking-wide">Total Events</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 dark:text-blue-900">{response?.totalCount || 0}</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/300 rounded-xl">
                <Activity className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">This Page</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{response?.data?.length || 0}</p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-950/300 rounded-xl">
                <FileText className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Page {response?.page || 1}</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">of {response?.totalPages || 1}</p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/300 rounded-xl">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Per Page</p>
                <p className="text-2xl font-bold text-orange-900">{pageSize}</p>
              </div>
              <div className="p-3 bg-orange-500 rounded-xl">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Filters Panel */}
        {showFilters && (
          <div className="bg-card rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 sm:hidden">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1"><Search className="w-5 h-5" /> Search Actions</label>
                <Input
                  value={formFilters.action}
                  onChange={event => setFormFilters(filters => ({ ...filters, action: event.target.value }))}
                  placeholder="e.g. login, create, update, delete"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1"><User className="w-5 h-5" /> User Email</label>
                <Input
                  value={formFilters.actorEmail}
                  onChange={event => setFormFilters(filters => ({ ...filters, actorEmail: event.target.value }))}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">🗂️ Data Type</label>
                <select
                  value={formFilters.targetTable}
                  onChange={event => setFormFilters(filters => ({ ...filters, targetTable: event.target.value }))}
                  className="w-full px-3 py-2 border border-input dark:border-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All data types</option>
                  <option value="applications">Applications</option>
                  <option value="users">Users</option>
                  <option value="programs">Programs</option>
                  <option value="intakes">Intakes</option>
                  <option value="documents">Documents</option>
                  <option value="notifications">Notifications</option>
                  <option value="settings">Settings</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">From</label>
                  <Input
                    type="datetime-local"
                    value={formFilters.from}
                    onChange={event => setFormFilters(filters => ({ ...filters, from: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">To</label>
                  <Input
                    type="datetime-local"
                    value={formFilters.to}
                    onChange={event => setFormFilters(filters => ({ ...filters, to: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  <Search className="h-4 w-4 mr-2" />
                  Apply
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                  Reset
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Desktop Filters */}
        <div className="hidden sm:block bg-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Filters</h2>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1"><Search className="w-5 h-5" /> Search Actions</label>
              <Input
                value={formFilters.action}
                onChange={event => setFormFilters(filters => ({ ...filters, action: event.target.value }))}
                placeholder="e.g. login, create, update, delete"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1"><User className="w-5 h-5" /> User Email</label>
              <Input
                value={formFilters.actorEmail}
                onChange={event => setFormFilters(filters => ({ ...filters, actorEmail: event.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">🗂️ Data Type</label>
              <select
                value={formFilters.targetTable}
                onChange={event => setFormFilters(filters => ({ ...filters, targetTable: event.target.value }))}
                className="w-full px-3 py-2 border border-input dark:border-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All data types</option>
                <option value="applications">Applications</option>
                <option value="users">Users</option>
                <option value="programs">Programs</option>
                <option value="intakes">Intakes</option>
                <option value="documents">Documents</option>
                <option value="notifications">Notifications</option>
                <option value="settings">Settings</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">📂 Category</label>
              <select
                value={formFilters.category}
                onChange={event => setFormFilters(filters => ({ ...filters, category: event.target.value }))}
                className="w-full px-3 py-2 border border-input dark:border-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All categories</option>
                <option value="Authentication">Authentication</option>
                <option value="Data">Data Operations</option>
                <option value="Access">Access & Views</option>
                <option value="System">System Settings</option>
                <option value="Communication">Communications</option>
                <option value="Analytics">Analytics</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">From</label>
              <Input
                type="datetime-local"
                value={formFilters.from}
                onChange={event => setFormFilters(filters => ({ ...filters, from: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">To</label>
              <Input
                type="datetime-local"
                value={formFilters.to}
                onChange={event => setFormFilters(filters => ({ ...filters, to: event.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Apply Filters
              </Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error Loading Audit Log</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="ml-auto text-destructive border-red-300 dark:border-red-700 hover:bg-red-50 dark:bg-red-950/30"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="bg-card rounded-xl border border-border p-6 animate-pulse">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div>
                      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
                      <div className="h-4 bg-accent dark:bg-gray-200 rounded w-24" />
                    </div>
                  </div>
                  <div className="h-4 bg-accent dark:bg-gray-200 rounded w-20" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="h-20 bg-accent dark:bg-gray-200 rounded-lg" />
                  <div className="h-20 bg-accent dark:bg-gray-200 rounded-lg" />
                </div>
                <div className="h-16 bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        ) : response?.data?.length ? (
          <>
            {/* Audit List */}
            <div className="space-y-3 mb-6">
              {response.data.map(entry => (
                <AuditListItem key={entry.id} entry={entry} />
              ))}
            </div>
            
            {/* Pagination */}
            <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing page <span className="font-semibold text-foreground">{response.page}</span> of{' '}
                    <span className="font-semibold text-foreground">{response.totalPages}</span>
                  </div>
                  <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 dark:bg-gray-400" />
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{response.totalCount}</span> total entries
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Page size:</label>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={pageSize}
                    onChange={event => {
                      const next = Number.parseInt(event.target.value, 10)
                      if (!Number.isNaN(next)) {
                        setPageSize(Math.min(Math.max(next, 5), 100))
                        setPage(1)
                      }
                    }}
                    className="w-20"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={!canGoBack}
                  onClick={() => canGoBack && setPage(page - 1)}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(response.totalPages, 5) }, (_, i) => {
                    const pageNum = i + 1
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          pageNum === response.page
                            ? 'bg-blue-600 text-white'
                            : 'text-muted-foreground hover:bg-accent dark:bg-gray-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoForward}
                  onClick={() => canGoForward && setPage(page + 1)}
                  className="flex items-center gap-2"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-border">
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
              <Shield className="h-10 w-10 text-muted-foreground dark:text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No Security Events Found</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {Object.keys(appliedFilters).length > 0 
                ? 'No audit entries match your current search criteria. Try adjusting your filters.' 
                : 'No audit entries have been recorded yet. System activity will appear here.'
              }
            </p>
            {Object.keys(appliedFilters).length > 0 && (
              <Button onClick={handleReset} variant="outline" className="mr-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
            <Button onClick={handleRefresh} variant="primary">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
