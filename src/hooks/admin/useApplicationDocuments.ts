import { useState } from 'react'
import { applicationService } from '@/services/applications'

interface DocumentInfo {
  id: string
  document_type: string
  document_name: string
  file_url: string
  system_generated: boolean
  verification_status: string
  verified_by?: string
  verified_at?: string
  verification_notes?: string
}

export function useApplicationDocuments() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDocuments = async (applicationId: string) => {
    try {
      setLoading(true)
      const response = await applicationService.getById(applicationId, { include: ['documents'] })
      setDocuments(response.documents || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const verifyDocument = async (applicationId: string, documentId: string, status: 'verified' | 'rejected', notes: string) => {
    const documentType = documents.find(doc => doc.id === documentId)?.document_type
    
    await applicationService.verifyDocument(applicationId, {
      documentId,
      documentType,
      status,
      notes
    })

    // Refresh documents
    await fetchDocuments(applicationId)
  }

  return {
    documents,
    loading,
    fetchDocuments,
    verifyDocument
  }
}