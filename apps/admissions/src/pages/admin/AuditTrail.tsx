import React, { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceFromNow, formatTimestampFull } from '@/lib/dateFormat'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { DashboardSkeleton } from '@/components/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToastStore } from '@/hooks/useToast'
import {
  adminAuditService,
  type AuditCategory,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditLogResponse,
} from '@/services/admin/audit'
import {
  exportAuditEntriesToCsv,
  exportAuditEntriesToJson,
  exportAuditEntriesToPdf,
  type AuditExportFormat,
} from '@/lib/auditExports'
import { sanitizeForDisplay } from '@/lib/sanitize'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Eye,
  EyeOff,
  Filter,
  Globe,
  RefreshCw,
  Search,
  Settings,
  Shield,
  User,
} from 'lucide-react'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'

const DEFAULT_PAGE_SIZE = 20

const CATEGORY_OPTIONS: AuditCategory[] = [
  'Authentication',
  'Data',
  'Access',
  'System',
  'Communication',
  'Analytics',
  'General',
]

const ENTITY_OPTIONS = [
  { value: '', label: 'All entities' },
  { value: 'applications', label: 'Applications' },
  { value: 'profiles', label: 'Profiles' },
  { value: 'users', label: 'Users' },
  { value: 'programs', label: 'Programs' },
  { value: 'institutions', label: 'Institutions' },
  { value: 'payments', label: 'Payments' },
  { value: 'documents', label: 'Documents' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'settings', label: 'Settings' },
]

const PAGE_SIZE_OPTIONS = [20, 50, 100]

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

function formatCategoryStyles(category: AuditCategory) {
  if (category === 'Authentication') {
    return 'border-success/30 bg-success/5 text-success'
  }

  if (category === 'Data') {
    return 'border-info/30 bg-info/5 text-info'
  }

  if (category === 'Access') {
    return 'border-border bg-muted text-muted-foreground'
  }

  if (category === 'System') {
    return 'border-secondary-foreground/30 bg-secondary text-secondary-foreground'
  }

  if (category === 'Communication') {
    return 'border-warning/30 bg-warning/5 text-warning'
  }

  if (category === 'Analytics') {
    return 'border-primary/30 bg-primary/5 text-primary'
  }

  return 'border-border bg-muted text-foreground'
}

function formatEntityLabel(entityType: string | undefined) {
  if (!entityType) {
    return 'Unknown'
  }

  return entityType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function stringifyPayload(value: unknown) {
  if (!value) {
    return ''
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const AuditEntryCard = React.memo(function AuditEntryCard({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  const relativeTime = useMemo(() => {
    try {
      return formatDistanceFromNow(new Date(entry.createdAt))
    } catch {
      return entry.createdAt
    }
  }, [entry.createdAt])

  const exactTime = useMemo(() => {
    try {
      return formatTimestampFull(new Date(entry.createdAt))
    } catch {
      return entry.createdAt
    }
  }, [entry.createdAt])

  const actorDisplay = sanitizeForDisplay(entry.actorName || entry.actorEmail) || 'System'
  const actorRole = entry.actorRoles?.[0]
    ? sanitizeForDisplay(entry.actorRoles[0].replace(/_/g, ' '))
    : 'system'
  const payloadText = stringifyPayload(entry.changes || entry.metadata)

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${formatCategoryStyles(entry.category)}`}>
              {sanitizeForDisplay(entry.category)}
            </span>
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {sanitizeForDisplay(formatEntityLabel(entry.targetTable))}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-foreground">{sanitizeForDisplay(entry.action)}</h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Actor
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{actorDisplay}</p>
              <p className="text-xs text-muted-foreground">{actorRole}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Target
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{sanitizeForDisplay(formatEntityLabel(entry.targetTable))}</p>
              <p className="truncate text-xs text-muted-foreground">{sanitizeForDisplay(entry.targetId) || 'No target id'}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                IP Hash
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{sanitizeForDisplay(entry.ipHash) || 'Unavailable'}</p>
              <p className="text-xs text-muted-foreground">Privacy-safe correlation value</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                Time
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{relativeTime}</p>
              <p className="text-xs text-muted-foreground">{exactTime}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <>
                <EyeOff className="h-4 w-4" />
                Hide details
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                View details
              </>
            )}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-border bg-muted/15 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-sm font-semibold text-foreground">Request context</h4>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Actor email</dt>
                  <dd className="text-foreground">{sanitizeForDisplay(entry.actorEmail) || 'Unavailable'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Actor id</dt>
                  <dd className="break-all font-mono text-foreground">{sanitizeForDisplay(entry.actorId) || 'System'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">User agent hash</dt>
                  <dd className="break-words text-foreground">{sanitizeForDisplay(entry.userAgentHash) || 'Unavailable'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Request IP</dt>
                  <dd className="break-words text-foreground">{sanitizeForDisplay(entry.requestIp) || 'Restricted or unavailable'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Request user agent</dt>
                  <dd className="break-words text-foreground">{sanitizeForDisplay(entry.requestUserAgent) || 'Restricted or unavailable'}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-sm font-semibold text-foreground">Change payload</h4>
              {payloadText ? (
                <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground">
                  {payloadText}
                </pre>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No structured payload was captured for this event.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
})

export default function AuditTrailPage() {
  const [formFilters, setFormFilters] = useState({
    action: '',
    actorEmail: '',
    targetTable: '',
    category: '',
    from: '',
    to: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [showFilters, setShowFilters] = useState(true)
  const [exportingFormat, setExportingFormat] = useState<AuditExportFormat | null>(null)
  const { error: showError, success: showSuccess, info: showInfo } = useToastStore()

  const { data: response = null, isLoading: loading, error: queryError, refetch: loadAuditEntries } = useQuery({
    queryKey: ['admin', 'audit', appliedFilters, page, pageSize],
    queryFn: async () => {
      const payload = await adminAuditService.list({
        ...appliedFilters,
        page,
        pageSize,
      })

      if (payload.entries.length === 0 && Object.keys(appliedFilters).length > 0) {
        showInfo('No results', 'No audit records match the current filter set.')
      }

      return payload
    },
  })

  const error = queryError?.message || null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setAppliedFilters(sanitizeFilters(formFilters))
    showSuccess('Filters applied', 'Audit activity has been refreshed with the selected filters.')
  }

  const handleReset = () => {
    const cleared = {
      action: '',
      actorEmail: '',
      targetTable: '',
      category: '',
      from: '',
      to: '',
    }

    setFormFilters(cleared)
    setAppliedFilters({})
    setPage(1)
    showInfo('Filters cleared', 'Audit activity is back to the default view.')
  }

  const handleExport = useCallback(async (format: AuditExportFormat) => {
    if (!response?.entries.length || exportingFormat) {
      return
    }

    setExportingFormat(format)

    try {
      const payload = {
        entries: response.entries,
        filters: appliedFilters,
        summary: response.summary,
        filenameBase: `beanola-audit-${new Date().toISOString().slice(0, 10)}`,
      }

      if (format === 'csv') {
        exportAuditEntriesToCsv(payload)
      } else if (format === 'json') {
        exportAuditEntriesToJson(payload)
      } else {
        await exportAuditEntriesToPdf(payload)
      }

      showSuccess('Export complete', `Audit activity exported as ${format.toUpperCase()}.`)
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unable to export audit activity right now.'
      showError('Export failed', message)
    } finally {
      setExportingFormat(null)
    }
  }, [appliedFilters, exportingFormat, response, showError, showSuccess])

  const summary = response?.summary
  const topCategory = useMemo(() => {
    if (!summary) {
      return null
    }

    return Object.entries(summary.categoryBreakdown).sort((left, right) => right[1] - left[1])[0] || null
  }, [summary])

  const topEntity = summary?.entityBreakdown[0] || null
  const activeFilterCount = Object.keys(appliedFilters).length
  const canGoBack = (response?.page || 1) > 1
  const canGoForward = (response?.page || 1) < (response?.totalPages || 1)

  const visiblePages = useMemo(() => {
    const currentPage = response?.page || 1
    const totalPages = response?.totalPages || 1
    const start = Math.max(1, currentPage - 2)
    const end = Math.min(totalPages, start + 4)
    const pages: number[] = []

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.push(pageNumber)
    }

    return pages
  }, [response?.page, response?.totalPages])

  return (
    <>
      <Seo
        title="Audit Trail | Beanola Admissions"
        description="Review operational history across authentication, data changes, and staff actions."
        path="/admin/audit"
        noindex
      />
    <PageShell
      title="Audit Trail"
      eyebrow="Traceability"
      subtitle="Review real operational history across authentication, application management, settings, and staff actions."
      maxWidth="7xl"
      tone="admin"
      metrics={[
        { label: 'Total events', value: response?.totalCount || 0, helper: `${response?.entries.length || 0} loaded in this view` },
        { label: 'Actors', value: summary?.uniqueActors || 0, helper: 'Unique staff or system actors' },
        { label: 'Top category', value: topCategory?.[0] || 'None', helper: topCategory ? `${topCategory[1]} events` : 'No activity loaded' },
        { label: 'Page', value: `${response?.page || 1}/${response?.totalPages || 1}`, helper: 'Current export and review window' },
      ]}
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((current) => !current)}
            className="w-full sm:w-auto"
          >
            <Filter className="h-4 w-4" />
            {showFilters ? 'Hide filters' : 'Show filters'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAuditEntries()}
            loading={loading}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!response?.entries.length || Boolean(exportingFormat)}
                loading={Boolean(exportingFormat)}
                className="w-full sm:w-auto"
              >
                <Download className="h-4 w-4" />
                {exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}` : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleExport('csv')}>
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport('json')}>
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport('pdf')}>
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total events</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{response?.totalCount || 0}</p>
              </div>
              <div className="rounded-lg bg-foreground/10 p-3">
                <Activity className="h-5 w-5 text-foreground" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Unique actors</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{summary?.uniqueActors || 0}</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <User className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top category</p>
                <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{topCategory?.[0] || 'None yet'}</p>
                <p className="text-sm text-muted-foreground">{topCategory ? `${topCategory[1]} events` : 'No activity loaded'}</p>
              </div>
              <div className="rounded-lg bg-success/10 p-3">
                <Settings className="h-5 w-5 text-success" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Most active entity</p>
                <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{topEntity ? formatEntityLabel(topEntity.label) : 'None yet'}</p>
                <p className="text-sm text-muted-foreground">{topEntity ? `${topEntity.count} events` : 'No entity activity loaded'}</p>
              </div>
              <div className="rounded-lg bg-warning/10 p-3">
                <Database className="h-5 w-5 text-warning" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Category breakdown</h2>
                <p className="text-sm text-muted-foreground">
                  Current counts reflect the active filter set, not a hard-coded summary.
                </p>
              </div>
              <div className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {activeFilterCount} filters active
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CATEGORY_OPTIONS.map((category) => (
                <div key={category} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${formatCategoryStyles(category)}`}>
                    {category}
                  </div>
                  <p className="mt-3 text-2xl font-bold text-foreground">
                    {summary?.categoryBreakdown[category] || 0}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold text-foreground">Most frequent actions</h2>
            <p className="text-sm text-muted-foreground">
              The timeline below is backed by live action frequencies from the audit API.
            </p>

            <div className="mt-4 space-y-3">
              {(summary?.actionBreakdown || []).length > 0 ? (
                summary?.actionBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">Ranked from current filter set</p>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {item.count}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                  <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">No action summary is available for the current view yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {showFilters ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Filter activity</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Input
                  label="Action search"
                  value={formFilters.action}
                  onChange={(event) => setFormFilters((current) => ({ ...current, action: event.target.value }))}
                  placeholder="login, payment, settings, notification"
                  icon={<Search className="h-4 w-4" />}
                />

                <Input
                  label="Actor email"
                  value={formFilters.actorEmail}
                  onChange={(event) => setFormFilters((current) => ({ ...current, actorEmail: event.target.value }))}
                  placeholder="staff@beanola.com"
                  icon={<User className="h-4 w-4" />}
                />

                <div className="w-full">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Entity</label>
                  <select
                    value={formFilters.targetTable}
                    onChange={(event) => setFormFilters((current) => ({ ...current, targetTable: event.target.value }))}
                    className="h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {ENTITY_OPTIONS.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
                  <select
                    value={formFilters.category}
                    onChange={(event) => setFormFilters((current) => ({ ...current, category: event.target.value }))}
                    className="h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All categories</option>
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="From"
                  type="datetime-local"
                  value={formFilters.from}
                  onChange={(event) => setFormFilters((current) => ({ ...current, from: event.target.value }))}
                />

                <Input
                  label="To"
                  type="datetime-local"
                  value={formFilters.to}
                  onChange={(event) => setFormFilters((current) => ({ ...current, to: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit">
                  <Search className="h-4 w-4" />
                  Apply filters
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                  Reset
                </Button>
                <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Page size</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number.parseInt(event.target.value, 10) || DEFAULT_PAGE_SIZE)
                      setPage(1)
                    }}
                    className="h-12 rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                <div>
                  <h3 className="font-semibold text-foreground">Audit activity could not be loaded</h3>
                  <p className="mt-1 text-sm text-destructive">{error}</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void loadAuditEntries()}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="text-center">
              <DashboardSkeleton />
            </div>
          </div>
        ) : response?.entries.length ? (
          <>
            <div className="space-y-4">
              {response.entries.map((entry) => (
                <AuditEntryCard key={entry.id} entry={entry} />
              ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing page <span className="font-semibold text-foreground">{response.page}</span> of{' '}
                  <span className="font-semibold text-foreground">{response.totalPages}</span> with{' '}
                  <span className="font-semibold text-foreground">{response.totalCount}</span> matching events
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canGoBack}
                    onClick={() => canGoBack && setPage((current) => current - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {visiblePages.map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={`h-11 min-w-touch rounded-lg px-3 text-sm font-semibold transition-colors ${
                          pageNumber === response.page
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground hover:bg-muted/80'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canGoForward}
                    onClick={() => canGoForward && setPage((current) => current + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No audit activity found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeFilterCount > 0
                ? 'No events match the current filter set. Clear or broaden the filters to see more activity.'
                : 'Audit records will appear here as staff and system actions are captured.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {activeFilterCount > 0 ? (
                <Button variant="outline" onClick={handleReset}>
                  Clear filters
                </Button>
              ) : null}
              <Button onClick={() => void loadAuditEntries()}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Shield className="h-4 w-4 text-primary" />
              Authentication coverage
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Login, logout, session, password, and registration activity now resolve into the audit category filter and summary cards.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BellRing className="h-4 w-4 text-primary" />
              Communication visibility
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Notification and email actions now surface inside the same category model used by the admin activity timeline.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Export-ready view
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Export the visible audit result set as CSV, JSON, or PDF directly from this page.
            </p>
          </div>
        </div>
      </div>
    </PageShell>
    </>
  )
}
