import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * POST /api/documents/extract
 * Extract text and metadata from PDF documents
 * For scanned documents, returns isScanned: true for OCR processing
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    const { documentUrl, applicationId } = req.body;

    if (!documentUrl) {
      return sendError(res, 'Document URL is required', HttpStatus.BAD_REQUEST);
    }

    // Fetch the PDF file
    let pdfBytes: ArrayBuffer;
    try {
      const response = await fetch(documentUrl);
      if (!response.ok) {
        return sendError(res, 'Document not found', HttpStatus.NOT_FOUND);
      }
      pdfBytes = await response.arrayBuffer();
    } catch {
      return sendError(res, 'Failed to fetch document', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Dynamic import pdf-lib
    const { PDFDocument } = await import('pdf-lib');

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
    } catch {
      return sendError(res, 'Invalid PDF format', HttpStatus.BAD_REQUEST);
    }

    // Extract metadata
    const metadata = {
      pageCount: pdfDoc.getPageCount(),
      title: pdfDoc.getTitle() || null,
      author: pdfDoc.getAuthor() || null,
      creationDate: pdfDoc.getCreationDate()?.toISOString() || null,
    };

    // pdf-lib doesn't have built-in text extraction
    // Mark as potentially scanned for OCR processing
    const isScanned = true; // Conservative - let frontend use tesseract.js for OCR

    const result = {
      metadata,
      isScanned,
      text: '', // Text extraction requires OCR on frontend
    };

    // Store extraction results if applicationId provided
    if (applicationId) {
      try {
        await storeExtractionResults(applicationId, result, documentUrl);
      } catch (storeError) {
        console.log('[extract] Failed to store results');
      }
    }

    console.log('[extract] PDF processed, pages:', metadata.pageCount);
    return sendSuccess(res, result);
  } catch (error) {
    return handleError(res, error, 'documents/extract');
  }
}

/**
 * Store extraction results in document_analysis table
 */
async function storeExtractionResults(
  applicationId: string,
  extractionResult: { metadata: Record<string, unknown>; isScanned: boolean; text: string },
  documentUrl: string
) {
  const quality = extractionResult.isScanned ? 'needs_ocr' : 'good';

  const { error } = await supabaseAdmin.from('document_analysis').upsert(
    {
      application_id: applicationId,
      document_type: 'pdf',
      quality,
      completeness: extractionResult.isScanned ? 0 : 100,
      ocr_confidence: extractionResult.isScanned ? 0 : 0.95,
      extracted_data: {
        text: extractionResult.text || '',
        metadata: extractionResult.metadata,
        isScanned: extractionResult.isScanned,
        documentUrl,
      },
      suggestions: extractionResult.isScanned
        ? ['Document appears to be scanned. OCR processing may be required.']
        : [],
      analyzed_at: new Date().toISOString(),
    },
    {
      onConflict: 'application_id,document_type',
    }
  );

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}
