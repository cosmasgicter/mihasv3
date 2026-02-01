import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_cors';
import { query } from './_db';
import { getAuthUser } from './_auth_middleware';
import { withArcjetProtection } from './_arcjet';
import { getSupabaseAdmin } from './_supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_errorHandler';
import { checkDocumentUploadAccess, isAdmin } from './_auth_ownership';
import { getR2Storage, isR2Available } from './_storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * Consolidated Documents API
 * 
 * MIGRATED: Uses custom auth middleware, ownership checks, and R2 storage
 * PROTECTED: Arcjet rate limiting (30 requests per 10 minutes)
 * STORAGE: Cloudflare R2 (primary) with Supabase Storage fallback
 * 
 * POST /api/documents?action=upload - Upload document
 * POST /api/documents?action=extract - Extract PDF metadata
 * GET /api/documents?action=download&path=xxx - Download document
 * DELETE /api/documents?action=delete&path=xxx - Delete document
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // Get authenticated user
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const action = req.query.action as string || 'upload';

  try {
    switch (action) {
      case 'upload':
        if (req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return handleUpload(req, res, user.userId, user.role);

      case 'extract':
        if (req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return handleExtract(req, res, user.userId, user.role);

      case 'download':
        if (req.method !== 'GET') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return handleDownload(req, res, user.userId, user.role);

      case 'delete':
        if (req.method !== 'DELETE' && req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return handleDelete(req, res, user.userId, user.role);

      case 'signed-url':
        if (req.method !== 'GET' && req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return handleSignedUrl(req, res, user.userId, user.role);

      default:
        return sendError(res, 'Invalid action. Valid: upload, extract, download, delete, signed-url', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, 'documents');
  }
}

/**
 * Upload document to R2 (primary) or Supabase Storage (fallback)
 */
async function handleUpload(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const { file, fileName, fileType, contentType, userId, applicationId, documentType } = req.body;

  if (!file || !fileName) {
    return sendError(res, 'File and fileName are required', HttpStatus.BAD_REQUEST);
  }

  // Ownership check: verify user can upload to this application
  if (applicationId) {
    const canUpload = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canUpload) {
      return sendError(res, 'Access denied: cannot upload to this application', HttpStatus.FORBIDDEN);
    }
  }

  const fileBuffer = Buffer.from(file, 'base64');

  if (fileBuffer.length > MAX_FILE_SIZE) {
    return sendError(res, 'File size must be less than 10MB', HttpStatus.BAD_REQUEST);
  }

  const mimeType = contentType || fileType || 'application/octet-stream';
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return sendError(res, 'Only PDF, JPG, JPEG, and PNG files are allowed', HttpStatus.BAD_REQUEST);
  }

  // Only admins can upload on behalf of other users
  const effectiveUserId = isAdmin(userRole) && userId ? userId : authUserId;
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${effectiveUserId}/${applicationId || 'general'}/${documentType || 'document'}/${timestamp}-${sanitizedFileName}`;

  // Try R2 first, fallback to Supabase
  if (isR2Available()) {
    const r2 = getR2Storage();
    const result = await r2.upload(storagePath, fileBuffer, mimeType);

    if (result.success) {
      console.log('[documents/upload] Document uploaded to R2:', result.path);
      return sendSuccess(res, { 
        path: result.path, 
        url: result.url,
        storage: 'r2',
        size: result.size,
      });
    }

    console.warn('[documents/upload] R2 upload failed, falling back to Supabase:', result.error);
  }

  // Fallback to Supabase Storage
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.storage
    .from('app_docs')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

  if (error) {
    console.error('[documents/upload] Supabase storage error:', error.message);
    return sendError(res, error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const { data: urlData } = supabaseAdmin.storage.from('app_docs').getPublicUrl(data.path);

  console.log('[documents/upload] Document uploaded to Supabase:', data.path);
  return sendSuccess(res, { 
    path: data.path, 
    url: urlData.publicUrl,
    storage: 'supabase',
  });
}

/**
 * Download document from R2 or Supabase
 */
async function handleDownload(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const path = req.query.path as string;
  const applicationId = req.query.applicationId as string;

  if (!path) {
    return sendError(res, 'Path is required', HttpStatus.BAD_REQUEST);
  }

  // Ownership check if applicationId provided
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }
  }

  // Try R2 first
  if (isR2Available()) {
    const r2 = getR2Storage();
    const data = await r2.download(path);

    if (data) {
      const metadata = await r2.getMetadata(path);
      res.setHeader('Content-Type', metadata?.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', data.length);
      res.setHeader('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
      return res.status(200).send(data);
    }
  }

  // Fallback: redirect to Supabase URL
  const supabaseAdmin = getSupabaseAdmin();
  const { data: urlData } = supabaseAdmin.storage.from('app_docs').getPublicUrl(path);

  return res.redirect(302, urlData.publicUrl);
}

/**
 * Delete document from R2 or Supabase
 */
async function handleDelete(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const path = (req.query.path as string) || (req.body?.path as string);
  const applicationId = (req.query.applicationId as string) || (req.body?.applicationId as string);

  if (!path) {
    return sendError(res, 'Path is required', HttpStatus.BAD_REQUEST);
  }

  // Only admins can delete documents
  if (!isAdmin(userRole)) {
    // Check if user owns the document (path starts with their user ID)
    if (!path.startsWith(authUserId)) {
      return sendError(res, 'Access denied: cannot delete this document', HttpStatus.FORBIDDEN);
    }
  }

  // Ownership check if applicationId provided
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }
  }

  let deleted = false;

  // Try R2 first
  if (isR2Available()) {
    const r2 = getR2Storage();
    deleted = await r2.delete(path);
    if (deleted) {
      console.log('[documents/delete] Document deleted from R2:', path);
    }
  }

  // Also try Supabase (might exist in both during migration)
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.storage.from('app_docs').remove([path]);

  if (!error) {
    deleted = true;
    console.log('[documents/delete] Document deleted from Supabase:', path);
  }

  if (!deleted) {
    return sendError(res, 'Document not found or could not be deleted', HttpStatus.NOT_FOUND);
  }

  return sendSuccess(res, { deleted: true, path });
}

/**
 * Generate signed URL for temporary access
 */
async function handleSignedUrl(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const path = (req.query.path as string) || (req.body?.path as string);
  const applicationId = (req.query.applicationId as string) || (req.body?.applicationId as string);
  const expiresIn = parseInt((req.query.expiresIn as string) || (req.body?.expiresIn as string) || '3600', 10);

  if (!path) {
    return sendError(res, 'Path is required', HttpStatus.BAD_REQUEST);
  }

  // Ownership check if applicationId provided
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }
  }

  // Try R2 first
  if (isR2Available()) {
    const r2 = getR2Storage();
    const exists = await r2.exists(path);

    if (exists) {
      const signedUrl = r2.getSignedUrl(path, expiresIn);
      return sendSuccess(res, { 
        url: signedUrl, 
        expiresIn,
        storage: 'r2',
      });
    }
  }

  // Fallback to Supabase signed URL
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.storage
    .from('app_docs')
    .createSignedUrl(path, expiresIn);

  if (error) {
    return sendError(res, 'Failed to generate signed URL', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return sendSuccess(res, { 
    url: data.signedUrl, 
    expiresIn,
    storage: 'supabase',
  });
}

/**
 * Extract PDF metadata
 */
async function handleExtract(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const { documentUrl, applicationId } = req.body;

  if (!documentUrl) {
    return sendError(res, 'Document URL is required', HttpStatus.BAD_REQUEST);
  }

  // Ownership check: verify user can access this application's documents
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, 'Access denied: cannot access this application', HttpStatus.FORBIDDEN);
    }
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
