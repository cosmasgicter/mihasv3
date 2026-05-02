import { useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import type { DocumentItem, ApplicationWithDetails } from './applicationDetailTypes'
import { documentService } from '@/services/documents'
import { useToastStore } from '@/hooks/useToast'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function ViewDocButton({ doc }: { doc: DocumentItem }) {
  const [loading, setLoading] = useState(false)
  const showError = useToastStore((state) => state.error)
  const isReal = UUID_RE.test(doc.id)

  const handleClick = async () => {
    if (!isReal) {
      window.open(doc.file_url, '_blank', 'noopener,noreferrer')
      return
    }
    setLoading(true)
    try {
      const result = await documentService.getSignedUrl(doc.id)
      const url = (result as any)?.url || doc.file_url
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
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      View
    </button>
  )
}

interface ApplicationDetailDocumentsProps {
  documents: DocumentItem[]
  loading: boolean
  application?: ApplicationWithDetails | null
}

export function ApplicationDetailDocuments({ documents, loading, application }: ApplicationDetailDocumentsProps) {
  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading documents">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-white p-4">
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

  const allDocuments = [...documents]

  if (application) {
    const existingUrls = new Set(documents.map(d => d.file_url))
    if (application.result_slip_url && !existingUrls.has(application.result_slip_url)) {
      allDocuments.push({
        id: 'result_slip', document_type: 'result_slip', document_name: 'Result Slip',
        file_url: application.result_slip_url, verification_status: 'pending', system_generated: false
      } as DocumentItem)
    }
    if (application.extra_kyc_url && !existingUrls.has(application.extra_kyc_url)) {
      allDocuments.push({
        id: 'extra_kyc', document_type: 'extra_kyc', document_name: 'Identity Support Document',
        file_url: application.extra_kyc_url, verification_status: 'pending', system_generated: false
      } as DocumentItem)
    }
  }

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
    const createdAt = (doc as any).created_at || (doc as any).uploaded_at
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
          <div key={doc.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
                <p className="break-words text-sm font-semibold text-slate-950">{doc.document_name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className={`inline-flex items-center rounded-md border px-2 py-1 font-semibold ${getStatusBadge(doc.verification_status)}`}>
                    {(doc.verification_status || 'pending').replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {ageBadge && (
                    <span className={`rounded-md px-2 py-1 font-semibold ${ageBadge.className}`}>{ageBadge.label}</span>
                  )}
                  {doc.system_generated && (
                    <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700">SYSTEM</span>
                  )}
                  {doc.file_size && <span>{(doc.file_size / 1024).toFixed(1)} KB</span>}
                </div>
                {doc.verification_notes && (
                  <p className="mt-2 break-words text-xs leading-5 text-slate-700">{doc.verification_notes}</p>
                )}
              </div>
            </div>
            <ViewDocButton doc={doc} />
          </div>
        )
      })}
    </div>
  )
}
