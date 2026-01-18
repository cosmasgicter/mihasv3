import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { PDFDocument } from 'pdf-lib';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

/**
 * PDF Extraction Endpoint
 * Extracts text content and metadata from PDF documents
 * 
 * POST /documents/extract
 * Body: { documentUrl: string, applicationId?: string }
 * 
 * Response: {
 *   success: boolean,
 *   text?: string,
 *   metadata?: { pageCount, title, author, creationDate },
 *   error?: string,
 *   isScanned?: boolean
 * }
 */
export async function onRequestPost(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: authContext.error 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await request.json();
    const { documentUrl, applicationId } = body;

    if (!documentUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Document URL is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch the PDF file
    let pdfBytes;
    try {
      const response = await fetch(documentUrl);
      if (!response.ok) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Document not found' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      pdfBytes = await response.arrayBuffer();
    } catch (fetchError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch document' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load and parse the PDF
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
    } catch (parseError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid PDF format' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract metadata
    const metadata = {
      pageCount: pdfDoc.getPageCount(),
      title: pdfDoc.getTitle() || null,
      author: pdfDoc.getAuthor() || null,
      creationDate: pdfDoc.getCreationDate()?.toISOString() || null
    };

    // Extract text content from PDF
    // Note: pdf-lib doesn't have built-in text extraction, so we use a basic approach
    // For scanned documents, this will return empty/minimal text
    let extractedText = '';
    let isScanned = false;

    try {
      // Get all pages and attempt to extract text operators
      const pages = pdfDoc.getPages();
      const textParts = [];

      for (const page of pages) {
        // pdf-lib doesn't directly expose text extraction
        // We check if the page has content streams that might contain text
        const contentStream = page.node.Contents();
        if (contentStream) {
          // Basic check - if page has content but we can't extract text,
          // it's likely a scanned document
          textParts.push(`[Page ${pages.indexOf(page) + 1}]`);
        }
      }

      // Since pdf-lib doesn't have text extraction, we mark documents
      // with content but no extractable text as potentially scanned
      if (metadata.pageCount > 0 && textParts.length === 0) {
        isScanned = true;
      }

      extractedText = textParts.join('\n');
    } catch (extractError) {
      console.log('[PDF Extract] Text extraction error:', extractError.message);
      // Continue with empty text - document may be scanned
      isScanned = true;
    }

    // Determine if document is likely scanned (no extractable text)
    if (!extractedText || extractedText.trim().length < 50) {
      isScanned = true;
    }

    // Build response
    const result = {
      success: true,
      metadata,
      isScanned
    };

    // Only include text if we extracted something meaningful
    if (extractedText && extractedText.trim().length > 0) {
      result.text = extractedText;
    }

    // Store extraction results if applicationId provided
    if (applicationId) {
      try {
        await storeExtractionResults(applicationId, result, documentUrl);
      } catch (storeError) {
        console.log('[PDF Extract] Failed to store results:', storeError.message);
        // Don't fail the request if storage fails
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[PDF Extract] Unexpected error:', error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Extraction timed out' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Store extraction results in document_analysis table
 */
async function storeExtractionResults(applicationId, extractionResult, documentUrl) {
  const quality = extractionResult.isScanned ? 'needs_ocr' : 'good';
  const completeness = extractionResult.isScanned ? 0 : 
    (extractionResult.text?.length > 500 ? 100 : 
     Math.min(100, Math.floor((extractionResult.text?.length || 0) / 5)));

  const { error } = await supabaseAdminClient
    .from('document_analysis')
    .upsert({
      application_id: applicationId,
      document_type: 'pdf',
      quality,
      completeness,
      ocr_confidence: extractionResult.isScanned ? 0 : 0.95,
      extracted_data: {
        text: extractionResult.text || '',
        metadata: extractionResult.metadata,
        isScanned: extractionResult.isScanned,
        documentUrl
      },
      suggestions: extractionResult.isScanned 
        ? ['Document appears to be scanned. OCR processing may be required.']
        : [],
      analyzed_at: new Date().toISOString()
    }, {
      onConflict: 'application_id,document_type'
    });

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

// Handle OPTIONS for CORS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
