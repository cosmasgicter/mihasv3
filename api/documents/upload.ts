import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * POST /api/documents/upload
 * Upload a document to Supabase storage
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
    // For Vercel, we expect JSON with base64 encoded file
    // or multipart form data handled by middleware
    const { file, fileName, fileType, contentType, userId, applicationId, documentType } = req.body;

    if (!file || !fileName) {
      return sendError(res, 'File and fileName are required', HttpStatus.BAD_REQUEST);
    }

    // Decode base64 file
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
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.log('[upload] Storage error');
      return sendError(res, error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { data: urlData } = supabaseAdmin.storage.from('app_docs').getPublicUrl(data.path);

    console.log('[upload] Document uploaded:', data.path);
    return sendSuccess(res, {
      path: data.path,
      url: urlData.publicUrl,
    });
  } catch (error) {
    return handleError(res, error, 'documents/upload');
  }
}
