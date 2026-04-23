import { FileText, Download } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import type { DocumentItem, ApplicationWithDetails } from './applicationDetailTypes'

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
          <div key={i} className="flex items-center justify-between p-4 bg-card border rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20 rounded-full" />
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

  return (
    <div className="space-y-3">
      {allDocuments.map((doc) => {
        const ageBadge = getDocAgeBadge(doc)
        return (
          <div key={doc.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                doc.verification_status === 'verified' ? 'bg-green-100' :
                doc.verification_status === 'rejected' ? 'bg-red-100' : 'bg-green-100'
              }`}>
                <FileText className={`h-5 w-5 ${
                  doc.verification_status === 'verified' ? 'text-success' :
                  doc.verification_status === 'rejected' ? 'text-error' : 'text-warning'
                }`} />
              </div>
              <div>
                <p className="font-medium text-foreground">{doc.document_name}</p>
                <div className="flex items-center gap-2 text-xs text-foreground">
                  <span className={`px-2 py-1 rounded-full ${
                    doc.verification_status === 'verified' ? 'bg-green-100 text-green-900' :
                    doc.verification_status === 'rejected' ? 'bg-red-100 text-red-900' :
                    'bg-green-100 text-green-900'
                  }`}>
                    {doc.verification_status.toUpperCase()}
                  </span>
                  {ageBadge && (
                    <span className={`px-2 py-1 rounded-full ${ageBadge.className}`}>{ageBadge.label}</span>
                  )}
                  {doc.system_generated && (
                    <span className="bg-primary/10 text-foreground px-2 py-1 rounded-full">SYSTEM</span>
                  )}
                  {doc.file_size && <span>{(doc.file_size / 1024).toFixed(1)} KB</span>}
                </div>
                {doc.verification_notes && (
                  <p className="text-xs text-foreground mt-1">{doc.verification_notes}</p>
                )}
              </div>
            </div>
            <a
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 text-sm text-primary hover:text-foreground hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              View
            </a>
          </div>
        )
      })}
    </div>
  )
}
