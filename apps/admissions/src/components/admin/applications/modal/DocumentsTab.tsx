import { useState } from 'react'
import { FileText, Download, CheckCircle, Clock, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { documentService } from '@/services/documents'
import { useToastStore } from '@/hooks/useToast'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface DocumentItem {
  id: string
  document_name: string
  file_url: string
  file_size?: number
  verification_status: string
  system_generated: boolean
}

function ViewButton({ doc }: { doc: DocumentItem }) {
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
    <button type="button" onClick={handleClick} disabled={loading} className="inline-flex min-h-touch items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-900 disabled:opacity-50">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      View
    </button>
  )
}

function getStatusBadge(status: string) {
  const normalized = status || 'pending'
  if (normalized === 'verified') return 'border-green-300 bg-green-50 text-green-800'
  if (normalized === 'rejected' || normalized === 'ocr_failed') return 'border-red-300 bg-red-50 text-red-800'
  if (normalized === 'ocr_complete') return 'border-blue-300 bg-blue-50 text-blue-800'
  if (normalized === 'ocr_processing') return 'border-sky-300 bg-sky-50 text-sky-800'
  return 'border-amber-300 bg-amber-50 text-amber-800'
}

export function DocumentsTab({ documents, loading, application }: { documents: DocumentItem[], loading: boolean, application?: any }) {
  if (loading) return (
    <div className="space-y-3 py-4" role="status" aria-label="Loading documents">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 bg-card border rounded-lg">
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
  
  const all = [...documents]
  if (application) {
    const urls = new Set(documents.map(d => d.file_url))
    if (application.result_slip_url && !urls.has(application.result_slip_url)) all.push({ id: 'result_slip', document_name: 'Result Slip', file_url: application.result_slip_url, verification_status: 'pending', system_generated: false } as DocumentItem)
    if (application.extra_kyc_url && !urls.has(application.extra_kyc_url)) all.push({ id: 'extra_kyc', document_name: 'Identity Support Document', file_url: application.extra_kyc_url, verification_status: 'pending', system_generated: false } as DocumentItem)
  }
  
  if (all.length === 0) return <div className="text-center py-8"><FileText className="h-8 w-8 mx-auto mb-2" /><p>No documents</p></div>
  
  return (
    <div className="space-y-3">
      {all.map(d => (
        <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${d.verification_status === 'verified' ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-foreground">{d.document_name}</p>
              <span className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${getStatusBadge(d.verification_status)}`}>
                {d.verification_status === 'verified' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {(d.verification_status || 'pending').replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
          </div>
          <ViewButton doc={d} />
        </div>
      ))}
    </div>
  )
}
