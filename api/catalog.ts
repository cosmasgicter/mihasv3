import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { CatalogQueries, ProgramRecord, IntakeRecord, SubjectRecord } from '../lib/queries';
import { withArcjetProtection } from '../lib/arcjet';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';

/**
 * Consolidated Catalog API
 * 
 * MIGRATED: Uses database abstraction layer instead of Supabase SDK
 * PROTECTED: Arcjet rate limiting (100 requests per 10 minutes - public endpoint)
 * 
 * GET /api/catalog?type=programs - List programs
 * GET /api/catalog?type=intakes - List intakes
 * GET /api/catalog?type=subjects - List subjects
 */
async function handler(req: VercelRequest, res: VercelResponse) {
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
      const q = CatalogQueries.getPrograms();
      const result = await query<ProgramRecord>(q.text, q.values);
      
      // Return programs directly - no institution join in current schema
      res.setHeader('Cache-Control', 'public, max-age=300');
      return sendSuccess(res, { programs: result.rows });
    }

    if (type === 'intakes') {
      const q = CatalogQueries.getIntakes();
      const result = await query<IntakeRecord>(q.text, q.values);

      res.setHeader('Cache-Control', 'public, max-age=300');
      return sendSuccess(res, { intakes: result.rows });
    }

    if (type === 'subjects') {
      const q = CatalogQueries.getSubjects();
      const result = await query<SubjectRecord>(q.text, q.values);

      res.setHeader('Cache-Control', 'public, max-age=300');
      return sendSuccess(res, { subjects: result.rows });
    }

    return sendError(res, 'Invalid type. Use: programs, intakes, or subjects', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'catalog');
  }
}

// Export with Arcjet protection (high rate limit for public endpoint)
export default withArcjetProtection(handler, 'general');
