import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui'
import { apiClient } from '@/services/client'
import { logApiError } from '@/lib/apiErrorLogger'
import { useAuth } from '@/contexts/AuthContext'

interface AISummaryPanelProps {
  applicationId: string
}

export function AISummaryPanel({ applicationId }: AISummaryPanelProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const fetchSummary = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true)
      else setLoading(true)

      const url = `/applications/${applicationId}/admin-summary/${refresh ? '?refresh=1' : ''}`
      const data = await apiClient.request<{ summary?: string }>(url)
      setSummary(data?.summary ?? null)
    } catch (error) {
      logApiError('ai-summary', `/applications/${applicationId}/admin-summary/`, error)
      setSummary(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [applicationId])

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary])

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading AI summary">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">AI Review Summary</h3>
        {isSuperAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { void fetchSummary(true) }}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
        )}
      </div>

      {summary ? (
        <div className="rounded-lg border border-info/20 bg-info/5 p-4">
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{summary}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No AI summary available for this application.
          </p>
        </div>
      )}
    </div>
  )
}
