import { useState } from 'react'
import { FileText, Download, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import type { DocumentItem, ApplicationWithDetails } from './applicationDetailTypes'
import { documentService } from '@/services/documents'
import { applicationService } from '@/services/applications'
import { useToastStore } from '@/hooks/useToast'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function DocumentVerifyActions({ doc, applicationId, onVerified }: { doc: DocumentItem; applicationId: string; onVerified?: () => void }) {
  const [loading, setLoading] = useState(false)
  const { success: showSuccess, error: showError } = useToastStore()
  const isPending = !doc.verification_status || doc.verification_status === 'pending' || doc.verification_status === 'ocr_complete'

  if (!isPending || !applicationId) return null

  const handleVerify = async (status: 'verified' | 'rejected') => {
    setLoading(true)
    try {
      await applicationService.verifyDocument(applicationId, {
        documentId: doc.id,
        status,
      })
      showSuccess(
        status === 'verified' ? 'Document verified' : 'Document rejected',
        `${doc.document_name} has been ${status}.`
      )
      onVerified?.()
    } catch (error) {
      logApiError('admin-doc-verify', `/applications/${applicationId}/verify-document/`, error)
      showError('Verification failed', toError(error).message || 'Unable to update document status.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={() => { void handleVerify('verified') }}
        disabled={loading}
        className="border-green-300 text-green-700 hover:bg-green-50"
      >
        <CheckCircle className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { void handleVerify('rejected') }}
        disabled={loading}
        className="border-red-300 text-red-700 hover:bg-red-50"
      >
        <XCircle className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function ViewDocButton({ doc }: { doc: DocumentItem }) {
  const [loading, setLoading] = useState(false)
  const showError = useToastStore((state) => state.error)
  const isRealDocumentRecord = UUID_RE.test(doc.id)

  const handleClick = async () => {
    // Legacy/synthetic rows: the backend now ships a fresh short-lived
    // signed URL inline (see ApplicationDocumentsView), so the file_url
    // is already safe to open directly. We never open raw private R2
    // URLs — those always 403. If the URL is not signed, surface a
    // clear error rather than launching a broken tab.
    if (!isRealDocumentRecord) {
      const url = doc.file_url
      if (!url || !url.includes('?')) {
        // Heuristic: a properly signed R2/S3 URL always carries a
        // querystring (X-Amz-Signature, X-Amz-Expires, etc.). If it has
        // no querystring, it is the raw private object URL and will 403.
        showError('Document unavailable', 'The legacy file link is missing a signature. Please refresh the page.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    setLoading(true)
    try {
      const result = await documentService.getSignedUrl(doc.id)
      const url = result?.url
      if (!url) {
        showError('Document unavailable', 'The file link could not be prepared. Please refresh and try again.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      showError('Document unavailable', 'The file link could not be prepared. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex min-h-touch items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      View
    </button>
  )
}

interface ApplicationDetailDocumentsProps {
  documents: DocumentItem[]
  loading: boolean
  applicationId?: string
  /**
   * Retained for backwards compatibility with existing call sites.
   * The component no longer reads `application.result_slip_url` /
   * `application.extra_kyc_url`; the backend documents endpoint now
   * surfaces those legacy attachments as synthesized rows with
   * fresh signed URLs.
   */
  application?: ApplicationWithDetails | null
  onDocumentVerified?: () => void
}

export function ApplicationDetailDocuments({ documents, loading, applicationId, onDocumentVerified }: ApplicationDetailDocumentsProps) {
  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading documents">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  // Backend now synthesizes legacy rows with fresh signed URLs, so we
  // simply render whatever the documents endpoint returned. No frontend
  // fallback is needed (and the previous fallback always 403'd because
  // it opened raw private R2 URLs).
  const allDocuments = [...documents]

  if (allDocuments.length === 0) {
    return (
      <div className="text-center py-8 text-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 text-foreground" />
        <p className="text-sm">No documents uploaded</p>
      </div>
    )
  }

  const getDocAgeBadge = (doc: DocumentItem) => {
    if (doc.verification_status !== 'pending') return null
    const createdAt = doc.created_at || doc.uploaded_at
    if (!createdAt) return null
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
    if (days > 5) return { label: `${days}d pending`, className: 'bg-red-100 text-red-800' }
    if (days >= 3) return { label: `${days}d pending`, className: 'bg-amber-100 text-amber-800' }
    return { label: `${days}d`, className: 'bg-green-100 text-green-800' }
  }

  const getStatusBadge = (status: string) => {
    const normalized = status || 'pending'
    if (normalized === 'verified') {
      return 'border-green-300 bg-green-50 text-green-800'
    }
    if (normalized === 'rejected' || normalized === 'ocr_failed') {
      return 'border-red-300 bg-red-50 text-red-800'
    }
    if (normalized === 'ocr_complete') {
      return 'border-blue-300 bg-blue-50 text-blue-800'
    }
    if (normalized === 'ocr_processing') {
      return 'border-sky-300 bg-sky-50 text-sky-800'
    }
    return 'border-amber-300 bg-amber-50 text-amber-800'
  }

  return (
    <div className="space-y-3">
      {allDocuments.map((doc) => {
        const ageBadge = getDocAgeBadge(doc)
        return (
          <div key={doc.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                doc.verification_status === 'verified' ? 'bg-green-100' :
                doc.verification_status === 'rejected' ? 'bg-red-100' : 'bg-amber-100'
              }`}>
                <FileText className={`h-5 w-5 ${
                  doc.verification_status === 'verified' ? 'text-success' :
                  doc.verification_status === 'rejected' ? 'text-error' : 'text-warning'
                }`} />
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{doc.document_name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={`inline-flex items-center rounded-md border px-2 py-1 font-semibold ${getStatusBadge(doc.verification_status)}`}>
                    {(doc.verification_status || 'pending').replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {ageBadge && (
                    <span className={`rounded-md px-2 py-1 font-semibold ${ageBadge.className}`}>{ageBadge.label}</span>
                  )}
                  {doc.system_generated && (
                    <span className="rounded-md border border-border bg-muted px-2 py-1 font-semibold text-muted-foreground">SYSTEM</span>
                  )}
                  {doc.file_size && <span>{(doc.file_size / 1024).toFixed(1)} KB</span>}
                </div>
                {doc.verification_notes && (
                  <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{doc.verification_notes}</p>
                )}
                {doc.ecz_exam_number && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">ECZ Exam:</span>{' '}
                    {doc.ecz_exam_number}
                    {doc.ecz_exam_year && ` (${doc.ecz_exam_year})`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {applicationId && <DocumentVerifyActions doc={doc} applicationId={applicationId} onVerified={onDocumentVerified} />}
              <ViewDocButton doc={doc} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
