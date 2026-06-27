import { AlertTriangle, Download, FileText, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton, StatusBadge } from '@/components/ui'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { useToastStore } from '@/hooks/useToast'
import { formatDate } from '@/lib/dateFormat'
import {
  useAdminOfficialDocuments,
  type AdminOfficialDocumentRow,
} from '@/hooks/useAdminOfficialDocuments'
import type { OfficialDocumentUiState } from '@/hooks/useOfficialDocument'
import type { StatusBadgeTone } from '@/components/ui/StatusBadge'

interface AdminOfficialDocumentsPanelProps {
  applicationId: string
}

/** Map a backend-derived UI state to a status pill tone + label (R17.4). */
function statusBadge(uiState: OfficialDocumentUiState): { tone: StatusBadgeTone; label: string } {
  switch (uiState) {
    case 'ready':
      return { tone: 'success', label: 'Ready' }
    case 'queued':
      return { tone: 'info', label: 'Queued' }
    case 'generating':
      return { tone: 'info', label: 'Generating' }
    case 'failed':
      return { tone: 'destructive', label: 'Failed' }
    case 'setup_required':
      return { tone: 'warning', label: 'Setup required' }
    default:
      return { tone: 'muted', label: 'Not generated' }
  }
}

/** The in-button label for the generate/retry action. */
function generateLabel(uiState: OfficialDocumentUiState, hasLatest: boolean): string {
  switch (uiState) {
    case 'generating':
      return 'Generating…'
    case 'queued':
      return 'Queued…'
    case 'failed':
      return 'Retry'
    case 'setup_required':
      return 'Setup Required'
    case 'ready':
      return 'Regenerate'
    default:
      return hasLatest ? 'Regenerate' : 'Generate'
  }
}

function DocumentRow({
  row,
  onGenerate,
  onDownload,
}: {
  row: AdminOfficialDocumentRow
  onGenerate: (row: AdminOfficialDocumentRow) => void
  onDownload: (row: AdminOfficialDocumentRow) => void
}) {
  const badge = statusBadge(row.uiState)
  const generatedAt = row.latest?.generated_at
  const isReady = row.uiState === 'ready' && Boolean(row.latest?.download_url || row.latest?.document_id)
  const showSpinner = row.uiState === 'generating' || row.uiState === 'queued'
  const isSetupRequired = row.uiState === 'setup_required'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-foreground">{row.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge tone={badge.tone} label={badge.label} />
            {generatedAt && <span>Updated {formatDate(generatedAt)}</span>}
            {typeof row.latest?.template_version === 'number' && (
              <span>v{row.latest.template_version}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isReady && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownload(row)}
            className="min-h-touch gap-1.5"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          loading={showSpinner}
          disabled={row.isBusy || isSetupRequired}
          onClick={() => onGenerate(row)}
          aria-live="polite"
          className="min-h-touch gap-1.5"
        >
          {!showSpinner &&
            (isSetupRequired ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : row.uiState === 'failed' ? (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            ))}
          {generateLabel(row.uiState, Boolean(row.latest))}
        </Button>
      </div>
    </div>
  )
}

/**
 * Admin official-document panel — queue → status, latest per type (R17.4, R17.5).
 *
 * Lists the latest Official_Document per type for an application and lets an
 * operator queue backend generation, then surfaces the
 * `Queued`/`Generating`/`Ready`/`Failed` status the backend reports. Every read
 * and write goes through `services/officialDocuments.ts`, whose endpoints are
 * scoped server-side by `AccessScopeService` (school staff see only in-scope
 * applications via 404 masking; super-admins are global), so this panel consumes
 * only backend-scoped data and never presents a cross-tenant affordance (R17.5).
 *
 * No client-side official PDF generation happens here — the document an operator
 * queues, views, and downloads is always the authoritative tenant-branded
 * backend record (R17.6).
 */
export function AdminOfficialDocumentsPanel({ applicationId }: AdminOfficialDocumentsPanelProps) {
  const { rows, isLoading, loadError, generate, download } = useAdminOfficialDocuments(applicationId)
  const { success: showSuccess, error: showError } = useToastStore()

  const handleGenerate = async (row: AdminOfficialDocumentRow) => {
    const ok = await generate(row.type)
    if (ok) {
      showSuccess('Document ready', `${row.label} has been generated.`)
    } else {
      showError('Generation queued', `${row.label} is still being prepared. Check back shortly.`)
    }
  }

  const handleDownload = async (row: AdminOfficialDocumentRow) => {
    const ok = await download(row.type)
    if (!ok) {
      showError('Download unavailable', `${row.label} is not ready for download yet.`)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading official documents">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">Official documents</h4>
      </div>
      <ErrorDisplay message={loadError ?? ''} variant="inline" />
      <p className="text-xs text-muted-foreground">
        Generation queues the official backend document and shows its status. Documents are scoped to
        the schools you can access.
      </p>
      {rows.map((row) => (
        <DocumentRow key={row.type} row={row} onGenerate={handleGenerate} onDownload={handleDownload} />
      ))}
    </div>
  )
}
