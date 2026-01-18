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
   * @param documentUrl - URL of the PDF document to extract
   * @param applicationId - Optional application ID to store results
   * @returns Extraction result with text, metadata, or error
   */
  extractPDFContent: async (
    documentUrl: string,
    applicationId?: string
  ): Promise<PDFExtractionResult> => {
    try {
      const result = await apiClient.request<PDFExtractionResult>('/documents/extract', {
        method: 'POST',
        body: JSON.stringify({ documentUrl, applicationId }),
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
