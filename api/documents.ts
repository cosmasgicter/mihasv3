import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * Consolidated Documents API
 * POST /api/documents?action=upload - Upload document
 * POST /api/documents?action=extract - Extract PDF metadata
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

  const action = req.query.action as string || 'upload';

  try {
    if (action === 'upload') {
      return handleUpload(req, res, auth);
    }
    if (action === 'extract') {
      return handleExtract(req, res);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'documents');
  }
}

async function handleUpload(req: VercelRequest, res: VercelResponse, auth: { user: { id: string } }) {
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

  const effectiveUserId = userId || auth.user.id;
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${effectiveUserId}/${applicationId}/${documentType}/${timestamp}-${sanitizedFileName}`;

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

  if (applicationId) {
    try {
      const quality = isScanned ? 'needs_ocr' : 'good';
      await supabaseAdmin.from('document_analysis').upsert({
        application_id: applicationId,
        document_type: 'pdf',
        quality,
        completeness: isScanned ? 0 : 100,
        ocr_confidence: isScanned ? 0 : 0.95,
        extracted_data: { text: '', metadata, isScanned, documentUrl },
        suggestions: isScanned ? ['Document appears to be scanned. OCR processing may be required.'] : [],
        analyzed_at: new Date().toISOString(),
      }, { onConflict: 'application_id,document_type' });
    } catch {
      console.log('[documents/extract] Failed to store results');
    }
  }

  console.log('[documents/extract] PDF processed, pages:', metadata.pageCount);
  return sendSuccess(res, result);
}
