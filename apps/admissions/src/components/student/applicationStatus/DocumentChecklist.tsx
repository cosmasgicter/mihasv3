/**
 * The status workspace's "Supporting documents" list.
 *
 * SJR task 3.18 (R5-b, clause 2.22; findings B-03 and B-05). It used to render two
 * snapshot columns (`result_slip_url`, `extra_kyc_url`) as raw links, so a document
 * of any other type (a tenant's own requirement, condition evidence) was invisible,
 * and the two it did show linked to a signature that had expired minutes after the
 * upload. It now reads the documents endpoint, which is the one place every current
 * document is listed, and each row's View is an anchor to the opener, which signs
 * when it is opened.
 *
 * Rows kept: the current version of each document (`is_current !== false`), not the
 * system-generated official documents (those have their own card), not a deleted
 * one, and legacy synthetic rows (applications that pre-date the documents table).
 */
import { useQuery } from '@tanstack/react-query'
import { Eye, FileText } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Skeleton } from '@/components/ui'
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/StatusBadge'
import { animateClasses, staggerChild } from '@/lib/animations'
import { documentOpenHrefForRow } from '@/lib/documentOpen'
import { isRateLimitedError, rateLimitMessage, retryAfterOf } from '@/lib/rateLimitCopy'
import { documentService } from '@/services/documents'
import { requiredDocumentsService } from '@/services/requiredDocuments'

interface DocumentChecklistProps {
  applicationId: string
}

interface DocumentRow {
  id: string
  documentType: string
  documentName: string | null
  verificationStatus: string
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** Keep the current, student-owned rows from the documents endpoint. */
export function currentDocumentRows(raw: readonly unknown[]): DocumentRow[] {
  const rows: DocumentRow[] = []
  for (const entry of raw) {
    const record = (entry ?? {}) as Record<string, unknown>
    const id = asString(record.id)
    if (!id) continue
    if (record.is_current === false) continue
    if (record.system_generated === true) continue
    const verification = asString(record.verification_status) ?? 'pending'
    if (verification === 'deleted') continue
    rows.push({
      id,
      documentType: asString(record.document_type) ?? 'document',
      documentName: asString(record.document_name),
      verificationStatus: verification,
    })
  }
  return rows
}

/** "nursing_council_letter" -> "Nursing council letter"; condition evidence loses its id suffix. */
export function humaniseDocumentType(documentType: string): string {
  const base = documentType.replace(/^condition_evidence[_:].*$/i, 'condition_evidence')
  const words = base.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Document'
}

const STATUS_PRESENTATION: Record<string, { label: string; tone: StatusBadgeTone }> = {
  verified: { label: 'Verified', tone: 'success' },
  approved: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Needs attention', tone: 'warning' },
  changes_required: { label: 'Needs attention', tone: 'warning' },
  pending: { label: 'Awaiting review', tone: 'info' },
}

function statusPresentation(status: string): { label: string; tone: StatusBadgeTone } {
  return STATUS_PRESENTATION[status] ?? { label: 'Awaiting review', tone: 'info' }
}

export function DocumentChecklist({ applicationId }: DocumentChecklistProps) {
  const documents = useQuery({
    queryKey: ['application-documents', applicationId],
    queryFn: () => documentService.listByApplication(applicationId),
    enabled: Boolean(applicationId),
    staleTime: 30_000,
    retry: false,
  })
  // The requirement labels are a nicety: a failed or slow read falls back to the
  // humanised type and never blocks the list.
  const contract = useQuery({
    queryKey: ['required-documents', applicationId],
    queryFn: () => requiredDocumentsService.get(applicationId),
    enabled: Boolean(applicationId),
    staleTime: 60_000,
    retry: false,
  })

  if (documents.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" data-testid="document-checklist-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (documents.isError) {
    const limited = isRateLimitedError(documents.error)
    return (
      <ErrorDisplay
        title="We couldn't load your documents"
        message={
          limited
            ? rateLimitMessage(retryAfterOf(documents.error))
            : 'Your documents are safe. Please try again in a moment.'
        }
        onRetry={() => void documents.refetch()}
        variant="inline"
      />
    )
  }

  const rows = currentDocumentRows(documents.data ?? [])
  const labels = new Map<string, string>()
  for (const requirement of contract.data?.requirements ?? []) {
    labels.set(requirement.documentType, requirement.label)
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-12 w-12" />}
        heading="No supporting documents uploaded"
        description="Upload your documents in your application form. They will appear here."
      />
    )
  }

  return (
    <ul className="space-y-4" aria-label="Your uploaded documents">
      {rows.map((row, index) => {
        const href = documentOpenHrefForRow({ id: row.id })
        const presentation = statusPresentation(row.verificationStatus)
        const label = labels.get(row.documentType) ?? humaniseDocumentType(row.documentType)
        return (
          <li
            key={row.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3 ${animateClasses.fadeIn}`}
            style={staggerChild(index, 100)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="break-words text-base sm:text-sm font-semibold text-foreground">{label}</p>
                {row.documentName && (
                  <p className="truncate text-xs text-muted-foreground">{row.documentName}</p>
                )}
                <StatusBadge label={presentation.label} tone={presentation.tone} size="sm" />
              </div>
            </div>
            {href && (
              <Button asChild variant="outline" size="sm" className="min-h-touch">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${label} (opens in a new tab)`}
                >
                  <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
                  View
                </a>
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
