import { apiClient } from './client'

/**
 * PDF Extraction Response Interface
 */
export interface PDFExtractionResult {
  success: boolean
  text?: string
  metadata?: {
    pageCount: number
    title?: string | null
    author?: string | null
    creationDate?: string | null
  }
  error?: string
  isScanned?: boolean
}

/**
 * Document Extraction Service
 * Handles PDF text extraction via the backend API
 */
export const documentExtractionService = {
  /**
   * Extract text content from a PDF document
   * 
   * @param documentUrlOrId - Uploaded document ID, or a legacy document URL
   * @param applicationId - Optional legacy application ID used to resolve references
   * @returns Extraction result with text, metadata, or error
   */
  extractPDFContent: async (
    documentUrlOrId: string,
    applicationId?: string
  ): Promise<PDFExtractionResult> => {
    try {
      void applicationId
      const candidate = documentUrlOrId.trim()
      const documentId = /^[0-9a-fA-F-]{36}$/.test(candidate) ? candidate : null

      if (!documentId) {
        return {
          success: false,
          error: 'Document extraction requires an uploaded document ID on the Django backend'
        }
      }

      const result = await apiClient.request<PDFExtractionResult>(`/documents/${encodeURIComponent(documentId)}/extract/`, {
        method: 'POST',
        skipCache: true
      })

      if (!result) {
        return {
          success: false,
          error: 'No response from extraction service'
        }
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Extraction failed'
      return {
        success: false,
        error: errorMessage
      }
    }
  },

  /**
   * Check if a document is likely scanned (no extractable text)
   * 
   * @param result - Extraction result to check
   * @returns true if document appears to be scanned
   */
  isScannedDocument: (result: PDFExtractionResult): boolean => {
    return result.isScanned === true || 
           (!result.text || result.text.trim().length < 50)
  },

  /**
   * Get extraction quality assessment
   * 
   * @param result - Extraction result to assess
   * @returns Quality rating: 'good', 'partial', 'needs_ocr', or 'failed'
   */
  getExtractionQuality: (result: PDFExtractionResult): 'good' | 'partial' | 'needs_ocr' | 'failed' => {
    if (!result.success) {
      return 'failed'
    }

    if (result.isScanned) {
      return 'needs_ocr'
    }

    const textLength = result.text?.trim().length || 0
    if (textLength > 500) {
      return 'good'
    }

    if (textLength > 50) {
      return 'partial'
    }

    return 'needs_ocr'
  }
}
