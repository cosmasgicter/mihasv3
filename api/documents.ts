import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { query } from './_lib/db';
import { getAuthUser } from './_lib/auth/middleware';
import { withArcjetProtection } from './_lib/arcjet';
import { getSupabaseAdmin } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * Consolidated Documents API
 * 
 * MIGRATED: Uses custom auth middleware
 * PROTECTED: Arcjet rate limiting (30 requests per 10 minutes)
 * NOTE: Still uses Supabase Storage for file uploads (not auth)
 * 
 * POST /api/documents?action=upload - Upload document
 * POST /api/documents?action=extract - Extract PDF metadata
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Get authenticated user
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const action = req.query.action as string || 'upload';

  try {
    if (action === 'upload') {
      return handleUpload(req, res, user.userId);
    }
    if (action === 'extract') {
      return handleExtract(req, res);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'documents');
  }
}

async function handleUpload(req: VercelRequest, res: VercelResponse, authUserId: string) {
  const { file, fileName, fileType, contentType, userId, applicationId, documentType } = req.body;

  if (!file || !fileName) {
    return sendError(res, 'File and fileName are required', HttpStatus.BAD_REQUEST);
  }

  const fileBuffer = Buffer.from(file, 'base64');

  if (fileBuffer.length > MAX_FILE_SIZE) {
    return sendError(res, 'File size must be less than 10MB', HttpStatus.BAD_REQUEST);
  }

  const mimeType = contentType || fileType || 'application/octet-stream';
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return sendError(res, 'Only PDF, JPG, JPEG, and PNG files are allowed', HttpStatus.BAD_REQUEST);
  }

  const effectiveUserId = userId || authUserId;
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${effectiveUserId}/${applicationId}/${documentType}/${timestamp}-${sanitizedFileName}`;

  // Use Supabase Storage for file uploads (keeping storage, not auth)
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.storage
    .from('app_docs')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

  if (error) {
    console.log('[documents/upload] Storage error');
    return sendError(res, error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const { data: urlData } = supabaseAdmin.storage.from('app_docs').getPublicUrl(data.path);

  console.log('[documents/upload] Document uploaded:', data.path);
  return sendSuccess(res, { path: data.path, url: urlData.publicUrl });
}

async function handleExtract(req: VercelRequest, res: VercelResponse) {
  const { documentUrl, applicationId } = req.body;

  if (!documentUrl) {
    return sendError(res, 'Document URL is required', HttpStatus.BAD_REQUEST);
  }

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

  const { PDFDocument } = await import('pdf-lib');

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes);
  } catch {
    return sendError(res, 'Invalid PDF format', HttpStatus.BAD_REQUEST);
  }

  const metadata = {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle() || null,
    author: pdfDoc.getAuthor() || null,
    creationDate: pdfDoc.getCreationDate()?.toISOString() || null,
  };

  const isScanned = true;
  const result = { metadata, isScanned, text: '' };

  // Store analysis results using database abstraction
  if (applicationId) {
    try {
      const quality = isScanned ? 'needs_ocr' : 'good';
      const upsertQuery = {
        text: `
          INSERT INTO document_analysis (
            application_id, document_type, quality, completeness, 
            ocr_confidence, extracted_data, suggestions, analyzed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (application_id, document_type) DO UPDATE SET
            quality = $3,
            completeness = $4,
            ocr_confidence = $5,
            extracted_data = $6,
            suggestions = $7,
            analyzed_at = NOW()
        `,
        values: [
          applicationId,
          'pdf',
          quality,
          isScanned ? 0 : 100,
          isScanned ? 0 : 0.95,
          JSON.stringify({ text: '', metadata, isScanned, documentUrl }),
          JSON.stringify(isScanned ? ['Document appears to be scanned. OCR processing may be required.'] : []),
        ],
      };
      await query(upsertQuery.text, upsertQuery.values);
    } catch {
      console.log('[documents/extract] Failed to store results');
    }
  }

  console.log('[documents/extract] PDF processed, pages:', metadata.pageCount);
  return sendSuccess(res, result);
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
