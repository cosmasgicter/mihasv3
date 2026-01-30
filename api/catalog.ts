import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Consolidated Catalog API
 * GET /api/catalog?type=programs - List programs
 * GET /api/catalog?type=intakes - List intakes
 * GET /api/catalog?type=subjects - List subjects
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const type = req.query.type as string || 'programs';

  try {
    if (type === 'programs') {
      const { data, error } = await supabaseAdmin
        .from('programs')
        .select('*, institutions(id, name, slug, full_name)')
        .order('created_at', { ascending: false });

      if (error) return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return sendSuccess(res, { programs: data || [] });
    }

    if (type === 'intakes') {
      const { data, error } = await supabaseAdmin
        .from('intakes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return sendSuccess(res, { intakes: data || [] });
    }

    if (type === 'subjects') {
      const { data, error } = await supabaseAdmin
        .from('subjects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return sendSuccess(res, { subjects: data || [] });
    }

    return sendError(res, 'Invalid type. Use: programs, intakes, or subjects', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'catalog');
  }
}
