import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { getAuthUser } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { checkDocumentUploadAccess, isAdmin } from '../lib/auth/ownership';
import { getR2Storage, isR2Available } from '../lib/storage';
import { requireCsrf } from '../lib/csrf';
import { validateBody } from '../lib/validation/middleware';
import { uploadDocumentBodySchema, extractDocumentBodySchema, deleteDocumentBodySchema, resolveReferenceBodySchema, registerSlipBodySchema } from '../lib/validation/documents';
import { logAuditEvent } from '../lib/auditLogger';
import { validateServerEnv } from '../lib/envValidator';
import { isAllowedUrl, isPrivateIP } from '../lib/urlValidator';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_EXTRACT_RESPONSE_SIZE = 20 * 1024 * 1024; // 20MB
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * Consolidated Documents API
 * 
 * MIGRATED: Uses custom auth middleware, ownership checks, and R2 storage
 * PROTECTED: Arcjet rate limiting (30 requests per 10 minutes)
 * STORAGE: R2-backed object storage only
 * 
 * POST /api/documents?action=upload - Upload document
 * POST /api/documents?action=extract - Extract PDF metadata
 * GET /api/documents?action=download&path=xxx - Download document
 * DELETE /api/documents?action=delete&path=xxx - Delete document
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // CSRF validation for state-changing requests
  if (await requireCsrf(req, res)) return;

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

      case 'register-slip':
        if (req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleRegisterSlip(req, res, user.userId, user.role);

      case 'resolve-reference':
        if (req.method !== 'POST') {
          return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleResolveReference(req, res, user.userId, user.role);

      default:
        return sendError(res, 'Invalid action. Valid: upload, extract, download, delete, signed-url, register-slip, resolve-reference', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, 'documents');
  }
}

function normalizeLegacySupabasePath(reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/app_docs\/(.+)$/i);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function handleRegisterSlip(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const { applicationNumber, path, publicUrl, documentName } = req.body || {};

  if (!applicationNumber || !path) {
    return sendError(res, 'applicationNumber and path are required', HttpStatus.BAD_REQUEST);
  }

  const applicationResult = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM applications WHERE application_number = $1 LIMIT 1`,
    [applicationNumber]
  );

  const application = applicationResult.rows[0];
  if (!application) {
    return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
  }

  const adminRoles = ['admin', 'super_admin', 'admissions_officer'];
  if (!adminRoles.includes(userRole) && application.user_id !== authUserId) {
    return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
  }

  const r2 = getR2Storage();
  const fileUrl = publicUrl || r2.getPublicUrl(path);
  const safeDocumentName = documentName || `Application Slip - ${applicationNumber}.pdf`;

  const existingResult = await query<{ id: string }>(
    `SELECT id FROM application_documents
     WHERE application_id = $1 AND document_type = 'application_slip'
     ORDER BY created_at DESC
     LIMIT 1`,
    [application.id]
  );

  const existingId = existingResult.rows[0]?.id;
  let documentId: string;

  if (existingId) {
    const updated = await query<{ id: string }>(
      `UPDATE application_documents
       SET document_name = $2,
           file_url = $3,
           system_generated = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [existingId, safeDocumentName, fileUrl]
    );
    documentId = updated.rows[0].id;
  } else {
    const inserted = await query<{ id: string }>(
      `INSERT INTO application_documents (
        id, application_id, document_type, document_name,
        file_url, mime_type, system_generated,
        verification_status, uploaded_at, created_at, updated_at
      ) VALUES (gen_random_uuid(), $1, 'application_slip', $2, $3, 'application/pdf', true, 'pending', NOW(), NOW(), NOW())
      RETURNING id`,
      [application.id, safeDocumentName, fileUrl]
    );
    documentId = inserted.rows[0].id;
  }

  return sendSuccess(res, { documentId, path, publicUrl: fileUrl });
}

async function handleResolveReference(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const { reference, applicationId } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return sendError(res, 'reference is required', HttpStatus.BAD_REQUEST);
  }

  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }
  }

  const normalizedPath = normalizeLegacySupabasePath(reference);
  if (!normalizedPath) {
    return sendError(res, 'Unsupported document reference', HttpStatus.BAD_REQUEST);
  }

  const r2 = getR2Storage();
  const url = r2.getPublicUrl(normalizedPath);
  return sendSuccess(res, {
    path: normalizedPath,
    publicUrl: url,
    migrated: reference !== normalizedPath,
  });
}

/**
 * Upload document to R2
 */
async function handleUpload(req: VercelRequest, res: VercelResponse, authUserId: string, userRole: string) {
  const parsed = validateBody(uploadDocumentBodySchema, req, res);
  if (!parsed) return;

  const { file, fileName, fileType, contentType, userId, applicationId, applicationNumber, documentType } = parsed;

  let resolvedApplicationId: string | undefined = applicationId;
  if (!resolvedApplicationId && applicationNumber) {
    const appResult = await query<{ id: string }>(
      `SELECT id FROM applications WHERE application_number = $1 LIMIT 1`,
      [applicationNumber]
    );
    resolvedApplicationId = appResult.rows[0]?.id;
  }

  // Ownership check: verify user can upload to this application
  if (resolvedApplicationId) {
    const canUpload = await checkDocumentUploadAccess(authUserId, resolvedApplicationId, userRole);
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
  const storagePath = `${effectiveUserId}/${resolvedApplicationId || applicationNumber || 'general'}/${documentType || 'document'}/${timestamp}-${sanitizedFileName}`;

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

  // Audit trail for document upload (Requirement 8.4)
  try {
    await logAuditEvent({
      actor_id: authUserId,
      action: 'document_upload',
      entity_type: 'document',
      entity_id: result.path,
      changes: { storage: 'r2', mime_type: mimeType, size: result.size },
    });
  } catch { /* non-blocking */ }

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

  // Audit trail for document deletion (Requirement 8.4)
  try {
    await logAuditEvent({
      actor_id: authUserId,
      action: 'document_delete',
      entity_type: 'document',
      entity_id: path,
      changes: { storage: 'r2' },
    });
  } catch { /* non-blocking */ }

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
  const parsed = validateBody(extractDocumentBodySchema, req, res);
  if (!parsed) return;

  const { documentUrl, applicationId } = parsed;

  // SSRF prevention: validate URL before fetching
  if (!isAllowedUrl(documentUrl)) {
    return sendError(res, 'Invalid or disallowed document URL', HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_URL');
  }

  // Additional private IP check on parsed hostname
  try {
    const parsedUrl = new URL(documentUrl);
    if (isPrivateIP(parsedUrl.hostname)) {
      return sendError(res, 'Invalid or disallowed document URL', HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_URL');
    }
  } catch {
    return sendError(res, 'Invalid or disallowed document URL', HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_URL');
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
    // AbortController with 10-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(documentUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return sendError(res, 'Document not found', HttpStatus.NOT_FOUND);
    }

    // Streaming response size check (20MB max)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_EXTRACT_RESPONSE_SIZE) {
      return sendError(res, 'Document exceeds maximum allowed size (20MB)', HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_URL');
    }

    // Read body with streaming size enforcement
    const reader = response.body?.getReader();
    if (!reader) {
      return sendError(res, 'Failed to fetch document', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.byteLength;
      if (totalSize > MAX_EXTRACT_RESPONSE_SIZE) {
        reader.cancel();
        return sendError(res, 'Document exceeds maximum allowed size (20MB)', HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_URL');
      }
      chunks.push(value);
    }

    // Combine chunks into a single ArrayBuffer
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    pdfBytes = combined.buffer;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return sendError(res, 'Document fetch timed out', HttpStatus.BAD_REQUEST, 'INVALID_DOCUMENT_URL');
    }
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
