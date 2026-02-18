import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { getAuthUser } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { checkDocumentUploadAccess, isAdmin } from '../lib/auth/ownership';
import { getR2Storage, isR2Available } from '../lib/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * Consolidated Documents API
 * 
 * MIGRATED: Uses custom auth middleware, ownership checks, and R2 storage
 * PROTECTED: Arcjet rate limiting (30 requests per 10 minutes)
 * STORAGE: Cloudflare R2 only (Supabase Storage removed)
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
        return await handleUpload(req, res, user.userId, user.role);

      case 'extract':
        if (req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleExtract(req, res, user.userId, user.role);

      case 'download':
        if (req.method !== 'GET') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleDownload(req, res, user.userId, user.role);

      case 'delete':
        if (req.method !== 'DELETE' && req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleDelete(req, res, user.userId, user.role);

      case 'signed-url':
        if (req.method !== 'GET' && req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleSignedUrl(req, res, user.userId, user.role);

      default:
        return sendError(res, 'Invalid action. Valid: upload, extract, download, delete, signed-url', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, 'documents');
  }
}

/**
 * Upload document to R2
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

  // R2 storage only
  if (!isR2Available()) {
    console.error('[documents/upload] R2 storage is not configured');
    return sendError(res, 'Storage service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }

  const r2 = getR2Storage();
  const result = await r2.upload(storagePath, fileBuffer, mimeType);

  if (!result.success) {
    console.error('[documents/upload] R2 upload failed:', result.error);
    return sendError(res, 'Failed to upload document', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  console.log('[documents/upload] Document uploaded to R2:', result.path);
  return sendSuccess(res, { 
    path: result.path, 
    url: result.url,
    storage: 'r2',
    size: result.size,
  });
}

/**
 * Download document from R2
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

  // R2 storage only
  if (!isR2Available()) {
    console.error('[documents/download] R2 storage is not configured');
    return sendError(res, 'Storage service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }

  const r2 = getR2Storage();
  const data = await r2.download(path);

  if (!data) {
    return sendError(res, 'Document not found', HttpStatus.NOT_FOUND);
  }

  const metadata = await r2.getMetadata(path);
  res.setHeader('Content-Type', metadata?.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', data.length);
  res.setHeader('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
  return res.status(200).send(data);
}

/**
 * Delete document from R2
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

  // R2 storage only
  if (!isR2Available()) {
    console.error('[documents/delete] R2 storage is not configured');
    return sendError(res, 'Storage service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }

  const r2 = getR2Storage();
  const deleted = await r2.delete(path);

  if (!deleted) {
    return sendError(res, 'Document not found or could not be deleted', HttpStatus.NOT_FOUND);
  }

  console.log('[documents/delete] Document deleted from R2:', path);
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

  // R2 storage only
  if (!isR2Available()) {
    console.error('[documents/signed-url] R2 storage is not configured');
    return sendError(res, 'Storage service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }

  const r2 = getR2Storage();
  const exists = await r2.exists(path);

  if (!exists) {
    return sendError(res, 'Document not found', HttpStatus.NOT_FOUND);
  }

  const signedUrl = r2.getSignedUrl(path, expiresIn);
  return sendSuccess(res, { 
    url: signedUrl, 
    expiresIn,
    storage: 'r2',
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

  // Store analysis results (skip if document_analysis table doesn't exist)
  if (applicationId) {
    try {
      // document_analysis table may not exist — skip gracefully
      console.log('[documents/extract] Skipping document_analysis storage (table not configured)');
    } catch {
      console.log('[documents/extract] Failed to store results');
    }
  }

  console.log('[documents/extract] PDF processed, pages:', metadata.pageCount);
  return sendSuccess(res, result);
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
