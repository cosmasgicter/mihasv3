import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query, transaction } from '../lib/db';
import { requireAuth, AuthenticationError, AuthorizationError, type AuthContext } from '../lib/auth/middleware';
import { checkApplicationOwnership, checkApplicationModifyAccess, isAdmin as isAdminRole, isReviewer as isReviewerRole } from '../lib/auth/ownership';
import { arcjetProtect, withArcjetProtection } from '../lib/arcjet';
import { 
  ApplicationQueries, 
  DocumentQueries, 
  GradeQueries,
  StatusHistoryQueries,
  ApplicationRecord,
  DocumentRecord,
  GradeRecord,
  StatusHistoryRecord,
  ApplicationStatus,
  PaymentStatus,
  USER_ROLES
} from '../lib/queries';
import { handleError, sendSuccess, sendError, sendValidationError, HttpStatus } from '../lib/errorHandler';
import { publishRealtimeEvent } from '../lib/realtimeBroker';
import { logAuditEvent } from '../lib/auditLogger';
import { renderEmailTemplate } from '../lib/emailTemplates';
import { requireCsrf } from '../lib/csrf';
import { validateBody } from '../lib/validation/middleware';
import {
  createApplicationBodySchema,
  patchCancelInterviewSchema,
  patchRescheduleInterviewSchema,
  patchScheduleInterviewSchema,
  patchSendNotificationSchema,
  patchSyncGradesSchema,
  patchUpdatePaymentStatusSchema,
  patchUpdateStatusSchema,
  patchSaveDraftSchema,
  reviewApplicationBodySchema,
} from '../lib/validation/applications';
import { validateServerEnv } from '../lib/envValidator';
import { z } from 'zod';

// --- Idempotency key helpers (Req 3.3) ---

interface IdempotencyRecord {
  key: string;
  endpoint: string;
  response_json: unknown;
  created_at: string;
}

/**
 * Check if an idempotency key already exists and is not expired (24h window).
 * Returns the cached response if found, null otherwise.
 */
async function checkIdempotencyKey(key: string, endpoint: string): Promise<unknown | null> {
  if (!key) return null;
  try {
    const result = await query<IdempotencyRecord>(
      `SELECT response_json FROM idempotency_keys
       WHERE key = $1 AND endpoint = $2
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [key, endpoint]
    );
    if (result.rowCount > 0) {
      return result.rows[0].response_json;
    }
    return null;
  } catch (err) {
    console.error('[idempotency] Error checking key:', err);
    return null;
  }
}

/**
 * Store an idempotency key with its response for future deduplication.
 * Also cleans up expired keys older than 24 hours.
 */
async function storeIdempotencyKey(key: string, endpoint: string, responseData: unknown): Promise<void> {
  if (!key) return;
  try {
    await query(
      `INSERT INTO idempotency_keys (key, endpoint, response_json, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET response_json = $3, created_at = NOW()`,
      [key, endpoint, JSON.stringify(responseData)]
    );
    // Periodic cleanup: delete expired keys (non-blocking, best-effort)
    query(
      `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`
    ).catch((err) => console.error('[idempotency] Cleanup error:', err));
  } catch (err) {
    console.error('[idempotency] Error storing key:', err);
  }
}

/**
 * Consolidated Applications API
 * 
 * MIGRATED: Uses custom auth middleware and database abstraction
 * PROTECTED: Arcjet rate limiting (60 requests per 10 minutes)
 * 
 * GET /api/applications - List applications
 * GET /api/applications?id=xxx - Get single application
 * GET /api/applications?action=details - List all applications
 * GET /api/applications?action=documents - List documents
 * GET /api/applications?action=grades - List grades
 * GET /api/applications?action=summary - Get summary
 * GET /api/applications?action=review - List pending review (admin)
 * POST /api/applications?action=review - Review application (admin)
 * PUT /api/applications?id=xxx - Update application
 * PATCH /api/applications?id=xxx - Patch application
 * DELETE /api/applications?id=xxx - Delete application
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  const action = req.query.action as string;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // Dedicated unauthenticated tracking route
  if (req.method === 'GET' && action === 'track') {
    return await handlePublicTracking(req, res);
  }

  // CSRF validation for state-changing requests
  if (await requireCsrf(req, res)) return;

  // Require authentication for all other actions (Req 9.1)
  let user: AuthContext;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    throw error;
  }

  const isAdmin = isAdminRole(user.role) || user.role === 'admissions_officer';
  const isReviewer = isReviewerRole(user.role);
  const canReadAllApplications = isAdmin
    || user.permissions.includes('applications:read')
    || user.permissions.includes('applications:review');
  const canReviewApplications = user.permissions.includes('applications:review');
  const canVerifyPayments = user.permissions.includes('payments:verify');
  // Reviewers are read-only — block write operations (Req 9.4)
  const isReviewerOnly = user.role === 'reviewer';

  const id = req.query.id as string;

  try {
    // Handle specific actions
    if (action === 'details') return await handleDetails(req, res, user.userId, canReadAllApplications);
    if (action === 'documents') return await handleDocuments(res);
    if (action === 'grades') return await handleGrades(res);
    if (action === 'summary') return await handleSummary(res);
    if (action === 'review') return await handleReview(req, res, user.userId, canReviewApplications, isReviewerOnly);
    if (action === 'interviews') return await handleInterviews(req, res, user.userId);
    if (action === 'schedule-interview') return await handleScheduleInterview(req, res, user.userId, isAdmin);
    if (action === 'stats') return await handleStats(req, res, user.userId);
    if (action === 'export') return await handleExport(req, res, isAdmin);
    if (action === 'email-slip') return await handleEmailSlip(req, res, user.userId, isAdmin);
    if (action === 'versions') return await handleVersions(req, res, user.userId);

    // Handle CRUD by ID
    if (id) return await handleById(req, res, user.userId, isAdmin, canReadAllApplications, canReviewApplications, canVerifyPayments, id, isReviewerOnly);

    // Default: list applications (GET) or create application (POST)
    if (req.method === 'GET') return await handleDetails(req, res, user.userId, canReadAllApplications);
    if (req.method === 'POST') {
      // Reviewers cannot create applications (Req 9.4)
      if (isReviewerOnly) {
        return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
      }
      return await handleCreate(req, res, user.userId);
    }

    return sendError(res, 'Invalid request', HttpStatus.BAD_REQUEST);
  } catch (error) {
    // Handle authentication/authorization errors explicitly (Req 9.1, 9.3)
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    if (error instanceof AuthorizationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    return handleError(res, error, 'applications');
  }
}

interface PublicTrackingResult {
  application_number: string;
  status: string;
  program_name: string | null;
  intake_name: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  feedback_summary: string | null;
}

function validatePatchPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  res: VercelResponse
): T | null {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.') || '_root';
    fieldErrors[path] = issue.message;
  }

  sendValidationError(res, fieldErrors);
  return null;
}

type ApplicationPaymentMetadataRow = ApplicationRecord & {
  payment_verified_by_name?: string | null;
  payment_verified_by_email?: string | null;
  last_payment_audit_id?: string | null;
  last_payment_audit_at?: string | null;
  last_payment_audit_by_name?: string | null;
  last_payment_audit_by_email?: string | null;
  last_payment_audit_notes?: string | null;
  last_payment_reference?: string | null;
};

const APPLICATION_PAYMENT_METADATA_SELECT = `
  a.*,
  NULLIF(TRIM(CONCAT_WS(' ', verifier.first_name, verifier.last_name)), '') AS payment_verified_by_name,
  verifier.email AS payment_verified_by_email,
  payment_audit.id AS last_payment_audit_id,
  payment_audit.created_at AS last_payment_audit_at,
  payment_audit.actor_name AS last_payment_audit_by_name,
  payment_audit.actor_email AS last_payment_audit_by_email,
  payment_audit.notes AS last_payment_audit_notes,
  COALESCE(NULLIF(a.momo_ref, ''), NULLIF(a.pop_url, '')) AS last_payment_reference
`;

const APPLICATION_PAYMENT_METADATA_JOINS = `
  LEFT JOIN profiles verifier
    ON verifier.id = a.payment_verified_by
  LEFT JOIN LATERAL (
    SELECT
      al.id::text AS id,
      al.created_at::text AS created_at,
      NULLIF(TRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), '') AS actor_name,
      actor.email AS actor_email,
      COALESCE(
        NULLIF(TRIM(al.changes->>'notes'), ''),
        NULLIF(TRIM(al.changes->>'verification_notes'), ''),
        NULLIF(TRIM(al.changes->>'reason'), '')
      ) AS notes
    FROM audit_logs al
    LEFT JOIN profiles actor
      ON actor.id = al.actor_id
    WHERE al.entity_type = 'payment'
      AND al.entity_id = a.id
      AND al.action IN ('payment_verified', 'payment_rejected', 'payment_status_updated')
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT 1
  ) payment_audit ON true
`;

function isValidTrackingCode(code: string): boolean {
  const value = code.trim();
  if (!value || value.length > 50) return false;
  const appNumberPattern = /^(KATC|MIHAS)\d{6}$/;
  if (appNumberPattern.test(value)) return true;
  return /^[a-zA-Z0-9\-_]+$/.test(value);
}

async function handlePublicTracking(req: VercelRequest, res: VercelResponse) {
  const code = (req.query.code as string | undefined)?.trim() || '';

  if (!isValidTrackingCode(code)) {
    return sendError(res, 'Invalid tracking code format', HttpStatus.BAD_REQUEST);
  }

  try {
    // Track endpoint uses separate, stricter throttling from authenticated application flows
    const rateLimitDecision = await arcjetProtect(req, 'session');
    if (!rateLimitDecision.allowed) {
      return sendError(res, 'Too many tracking requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const result = await query<PublicTrackingResult>(
      `SELECT
        application_number,
        status,
        program AS program_name,
        intake AS intake_name,
        submitted_at,
        updated_at,
        LEFT(NULLIF(TRIM(admin_feedback), ''), 240) AS feedback_summary
      FROM applications
      WHERE public_tracking_code = $1 OR application_number = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1`,
      [code]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    return sendSuccess(res, {
      application: result.rows[0]
    });
  } catch (error) {
    return handleError(res, error, 'applications/track');
  }
}

/**
 * Handle creating a new application
 * POST /api/applications
 */
async function handleCreate(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
) {
  const parsed = validateBody(createApplicationBodySchema, req, res);
  if (!parsed) return;

  const body = parsed;

  // Validate institution-program mapping
  const INSTITUTION_PROGRAMS: Record<string, string[]> = {
    'MIHAS': ['Diploma in Registered Nursing', 'Certificate In Psychosocial Counselling'],
    'KATC': ['Diploma in Clinical Medicine', 'Diploma in Environmental Health'],
  };

  const allowedPrograms = INSTITUTION_PROGRAMS[body.institution];
  if (!allowedPrograms) {
    return sendError(res, `Invalid institution: ${body.institution}. Must be MIHAS or KATC`, HttpStatus.BAD_REQUEST);
  }
  if (!allowedPrograms.includes(body.program)) {
    return sendError(
      res,
      `Program "${body.program}" is not offered at ${body.institution}. Valid programs: ${allowedPrograms.join(', ')}`,
      HttpStatus.BAD_REQUEST
    );
  }

  try {
    // Build insert query
    const fields = [
      'user_id', 'application_number', 'public_tracking_code', 'full_name',
      'nrc_number', 'passport_number', 'date_of_birth', 'sex', 'phone', 'email',
      'residence_town', 'nationality', 'next_of_kin_name', 'next_of_kin_phone',
      'program', 'intake', 'institution', 'status'
    ];

    const values = [
      userId,
      body.application_number,
      body.public_tracking_code || null,
      body.full_name,
      body.nrc_number || null,
      body.passport_number || null,
      body.date_of_birth,
      body.sex,
      body.phone,
      body.email,
      body.residence_town,
      body.nationality || 'Zambian',
      body.next_of_kin_name || null,
      body.next_of_kin_phone || null,
      body.program,
      body.intake,
      body.institution,
      body.status || 'draft'
    ];

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const result = await query<ApplicationRecord>(
      `INSERT INTO applications (${fields.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Failed to create application', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    console.log('[applications] Created application:', result.rows[0].id);
    return sendSuccess(res, result.rows[0], HttpStatus.CREATED);
  } catch (error) {
    return handleError(res, error, 'applications/create');
  }
}

async function handleDetails(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  canReadAllApplications: boolean
) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    // Parse pagination and filter params from query string
    // Frontend sends 1-based pages; convert to 0-based for OFFSET calculation
    const rawPage = parseInt(req.query.page as string || '1', 10);
    const page = Math.max(rawPage, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize as string || '50', 10), 1);
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const payment = req.query.payment as string | undefined;
    const program = req.query.program as string | undefined;
    const institution = req.query.institution as string | undefined;
    const sortBy = req.query.sortBy as string || 'date';
    const sortOrder = (req.query.sortOrder as string || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const mine = req.query.mine as string | undefined;

    // Build dynamic query with filters
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    // Scope to user unless admin
    if (!canReadAllApplications || mine === 'true') {
      conditions.push(`a.user_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    if (status) {
      conditions.push(`a.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (search) {
      const searchPattern = `%${search.replace(/[%_]/g, '\\$&')}%`;
      conditions.push(`(a.full_name ILIKE $${paramIndex} OR a.email ILIKE $${paramIndex} OR a.application_number ILIKE $${paramIndex})`);
      values.push(searchPattern);
      paramIndex++;
    }

    if (payment) {
      if (payment === 'not_paid') {
        conditions.push(`a.payment_status IS NULL`);
      } else {
        conditions.push(`a.payment_status = $${paramIndex}`);
        values.push(payment);
        paramIndex++;
      }
    }

    if (program) {
      conditions.push(`a.program = $${paramIndex}`);
      values.push(program);
      paramIndex++;
    }

    if (institution) {
      conditions.push(`a.institution = $${paramIndex}`);
      values.push(institution);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort column mapping
    const sortColumn = sortBy === 'date' ? 'a.created_at' : sortBy === 'name' ? 'a.full_name' : 'a.created_at';

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM applications a ${whereClause}`,
      values
    );
    const totalCount = parseInt(countResult.rows[0]?.count || '0', 10);

    // Fetch page with LIMIT/OFFSET (1-based page → 0-based offset)
    const offset = (page - 1) * pageSize;
    const dataValues = [...values, pageSize, offset];
    const result = await query<ApplicationPaymentMetadataRow>(
      `SELECT ${APPLICATION_PAYMENT_METADATA_SELECT}
       FROM applications a
       ${APPLICATION_PAYMENT_METADATA_JOINS}
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      dataValues
    );

    return sendSuccess(res, {
      applications: result.rows,
      totalCount,
      page,
      pageSize
    });
  } catch (error) {
    return handleError(res, error, 'applications/details');
  }
}

async function handleDocuments(res: VercelResponse) {
  try {
    const q = DocumentQueries.findAll();
    const result = await query<DocumentRecord>(q.text, q.values);
    return sendSuccess(res, result.rows);
  } catch (error) {
    return handleError(res, error, 'applications/documents');
  }
}

async function handleGrades(res: VercelResponse) {
  try {
    const q = GradeQueries.findAll();
    const result = await query<GradeRecord>(q.text, q.values);
    return sendSuccess(res, result.rows);
  } catch (error) {
    return handleError(res, error, 'applications/grades');
  }
}

async function handleSummary(res: VercelResponse) {
  try {
    const q = ApplicationQueries.getSummary();
    const result = await query<{ id: string; status: string; created_at: string }>(q.text, q.values);
    return sendSuccess(res, result.rows);
  } catch (error) {
    return handleError(res, error, 'applications/summary');
  }
}

/**
 * Handle interviews action - Get scheduled interviews for user's applications
 * Requirements: 2.2, 10.1, 10.3 - Return user's interview data with application details
 */
async function handleInterviews(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    // Query interviews for user's applications with application details joined
    const result = await query<{
      id: string;
      application_id: string;
      scheduled_at: string;
      mode: 'in_person' | 'virtual' | 'phone';
      location: string | null;
      status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
      notes: string | null;
      program: string | null;
      application_number: string | null;
    }>(`
      SELECT
        ai.id,
        ai.application_id,
        ai.scheduled_at,
        ai.mode,
        ai.location,
        ai.status,
        ai.notes,
        a.program,
        a.application_number
      FROM application_interviews ai
      INNER JOIN applications a ON ai.application_id = a.id
      WHERE a.user_id = $1
      ORDER BY ai.scheduled_at ASC
    `, [userId]);

    return sendSuccess(res, { interviews: result.rows });
  } catch (error) {
    return handleError(res, error, 'applications/interviews');
  }
}

/**
 * Handle interview scheduling action
 * POST /api/applications?action=schedule-interview
 * Body: { applicationId, scheduled_at, mode, location, notes }
 */
async function handleScheduleInterview(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  isAdmin: boolean
) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  if (!isAdmin) {
    return sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
  }

  const { applicationId, scheduled_at, mode, location, notes } = req.body || {};

  if (!applicationId || !scheduled_at || !mode || !location) {
    return sendError(res, 'Missing required fields: applicationId, scheduled_at, mode, location', HttpStatus.BAD_REQUEST);
  }

  const normalizedMode = mode === 'in-person' ? 'in_person' : mode;
  if (!['in_person', 'virtual', 'phone'].includes(normalizedMode)) {
    return sendError(res, 'Invalid mode. Use: in-person, in_person, virtual, or phone', HttpStatus.BAD_REQUEST);
  }

  try {
    const applicationResult = await query<{ id: string }>(
      'SELECT id FROM applications WHERE id = $1 LIMIT 1',
      [applicationId]
    );

    if (applicationResult.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    const interviewResult = await query<{
      id: string;
      application_id: string;
      scheduled_at: string;
      mode: string;
      location: string;
      notes: string | null;
      status: string;
    }>(
      `INSERT INTO application_interviews (
        application_id, scheduled_at, mode, location, notes, status, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, NOW(), NOW())
      RETURNING id, application_id, scheduled_at, mode, location, notes, status`,
      [applicationId, scheduled_at, normalizedMode, location, notes || null, userId]
    );

    // Create audit trail entry (Requirement 12.3)
    try {
      await logAuditEvent({
        actor_id: userId,
        action: 'interview_scheduled',
        entity_type: 'application',
        entity_id: applicationId,
        changes: { scheduled_at, mode: normalizedMode, interview_id: interviewResult.rows[0]?.id },
      });
    } catch (auditError) {
      console.error('[applications] Failed to create interview audit log:', auditError);
    }

    // Publish real-time event so student sees the update
    try {
      const appOwner = await query<{ user_id: string }>('SELECT user_id FROM applications WHERE id = $1', [applicationId]);
      if (appOwner.rows[0]?.user_id) {
        const now = new Date().toISOString();
        const version = Date.now();
        publishRealtimeEvent(appOwner.rows[0].user_id, {
          event_id: `interview_scheduled:${applicationId}:${version}`,
          event_type: 'interview_scheduled',
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            application_id: applicationId,
            interview_id: interviewResult.rows[0]?.id,
            scheduled_at,
            mode: normalizedMode,
            location,
          },
        });
      }
    } catch (realtimeError) {
      console.error('[applications] Failed to publish interview realtime event:', realtimeError);
    }

    console.log('[applications] Interview scheduled:', applicationId, interviewResult.rows[0]?.id);
    return sendSuccess(res, { interview: interviewResult.rows[0] }, HttpStatus.CREATED);
  } catch (error) {
    return handleError(res, error, 'applications/schedule-interview');
  }
}

/**
 * Handle stats action - Get application statistics for analytics
 * Requirements: 4.1 - Return user's application statistics
 */
async function handleStats(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    // Get application counts by status
    const countResult = await query<{
      total: string;
      drafts: string;
      completed: string;
    }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as drafts,
        COUNT(*) FILTER (WHERE status != 'draft') as completed
      FROM applications
      WHERE user_id = $1
    `, [userId]);

    // Get average time per step (based on updated_at - created_at for completed apps)
    const avgTimeResult = await query<{ avg_time_hours: string | null }>(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) as avg_time_hours
      FROM applications
      WHERE user_id = $1 AND status != 'draft'
    `, [userId]);

    const stats = countResult.rows[0];
    const avgTime = avgTimeResult.rows[0];

    return sendSuccess(res, {
      total_drafts: parseInt(stats?.drafts || '0', 10),
      completed_applications: parseInt(stats?.completed || '0', 10),
      total_applications: parseInt(stats?.total || '0', 10),
      avg_time_hours: avgTime?.avg_time_hours ? parseFloat(avgTime.avg_time_hours) : 0,
    });
  } catch (error) {
    return handleError(res, error, 'applications/stats');
  }
}

async function handleReview(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  canReviewApplications: boolean,
  isReviewerOnly: boolean
) {
  if (!canReviewApplications) {
    return sendError(res, 'Review permission required', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  try {
    if (req.method === 'GET') {
      const q = ApplicationQueries.findPendingReview();
      const result = await query<ApplicationRecord>(q.text, q.values);
      return sendSuccess(res, result.rows);
    }

    if (req.method === 'POST') {
      // Reviewers can read/review but cannot write status changes (Req 9.4)
      if (isReviewerOnly) {
        return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
      }
      const parsed = validateBody(reviewApplicationBodySchema, req, res);
      if (!parsed) return;

      const { application_id, status, notes } = parsed;
      const force = req.body?.force === true;

      const validStatuses: ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'pending_documents'];
      if (!validStatuses.includes(status as ApplicationStatus)) {
        return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
      }

      const existingAppQ = ApplicationQueries.findById(application_id);
      const existingAppResult = await query<ApplicationRecord>(existingAppQ.text, existingAppQ.values);
      const existingApp = existingAppResult.rows[0];

      if (!existingApp) {
        return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
      }

      // Payment warning — advisory only, admin can override with force flag (Req 26.4)
      if (status === 'approved' && existingApp.payment_status !== 'verified' && !force) {
        return sendSuccess(res, {
          warning: true,
          message: 'Payment has not been verified for this application. You can still approve by confirming the override.',
          application_id,
          requested_status: status,
        });
      }

      // Wrap status update + history insert in a transaction for atomicity (Req 30.2)
      const updateQ = ApplicationQueries.updateStatus(
        application_id,
        status as ApplicationStatus,
        userId,
        notes
      );
      const historyQ = StatusHistoryQueries.create(
        application_id,
        status as ApplicationStatus,
        userId,
        notes,
        existingApp.status
      );

      const [updateResult] = await transaction<ApplicationRecord>([
        { text: updateQ.text, values: updateQ.values },
        { text: historyQ.text, values: historyQ.values },
      ]);

      if (updateResult.rowCount === 0) {
        return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
      }

      // Audit trail for application status change (Requirement 21.1)
      try {
        await logAuditEvent({
          actor_id: userId,
          action: 'application_status_changed',
          entity_type: 'application',
          entity_id: application_id,
          changes: { new_status: status, review_action: true },
        });
      } catch (auditError) {
        console.error('[applications/review] Failed to create audit log:', auditError);
      }

      // Queue notification email to student via Resend (Req 26.2)
      if (existingApp.email) {
        try {
          const statusDisplay = status.replace(/[_\s]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          const actionUrl = `/student/application/${application_id}`;
          const htmlBody = renderEmailTemplate('status-change', {
            recipientName: existingApp.full_name || undefined,
            applicationNumber: existingApp.application_number || undefined,
            programName: existingApp.program || undefined,
            status,
            actionUrl,
          });

          await query(
            `INSERT INTO email_queue (
               recipient_email, recipient_name, subject, body, html_body,
               template_name, template_data, status, priority
             ) VALUES ($1, $2, $3, $4, $5, 'status-change', $6, 'pending', 3)`,
            [
              existingApp.email,
              existingApp.full_name || null,
              `Application Status Update: ${statusDisplay}`,
              `Your application status has been updated to: ${statusDisplay}`,
              htmlBody,
              JSON.stringify({
                recipientName: existingApp.full_name || null,
                applicationNumber: existingApp.application_number || null,
                programName: existingApp.program || null,
                status,
                actionUrl,
              }),
            ]
          );
        } catch (emailError) {
          console.error('[applications/review] Failed to queue status change email:', emailError);
        }
      }

      console.log('[applications/review] Application reviewed:', application_id, status);
      return sendSuccess(res, { application: updateResult.rows[0] });
    }

    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, 'applications/review');
  }
}

async function handleById(
  req: VercelRequest, 
  res: VercelResponse, 
  userId: string, 
  isAdmin: boolean, 
  canReadAllApplications: boolean,
  canReviewApplications: boolean,
  canVerifyPayments: boolean,
  applicationId: string,
  isReviewerOnly: boolean
) {
  try {
  // GET - Fetch application details
  if (req.method === 'GET') {
    // Check ownership for non-admin users
    if (!canReadAllApplications) {
      const ownerQ = ApplicationQueries.checkOwnership(applicationId, userId);
      const ownerResult = await query<{ is_owner: boolean }>(ownerQ.text, ownerQ.values);
      if (!ownerResult.rows[0]?.is_owner) {
        return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
      }
    }

    const include = req.query.include as string | undefined;
    const data = await fetchApplicationDetails(applicationId, include);
    if (!data) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    const {
      grades = [],
      documents = [],
      statusHistory = [],
      interview = null,
      ...application
    } = data as Record<string, unknown>;

    return sendSuccess(res, {
      application,
      grades,
      documents,
      statusHistory,
      interview,
    });
  }

  // DELETE
  if (req.method === 'DELETE') {
    // Reviewers cannot delete applications (Req 9.4)
    if (isReviewerOnly) {
      return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
    }

    // Check ownership
    const appQ = ApplicationQueries.findById(applicationId);
    const appResult = await query<ApplicationRecord>(appQ.text, appQ.values);
    
    if (appResult.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    const app = appResult.rows[0];
    if (app.user_id !== userId && !isAdmin) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }

    const deleteQ = ApplicationQueries.delete(applicationId);
    await query(deleteQ.text, deleteQ.values);

    console.log('[applications] Deleted application:', applicationId);
    return sendSuccess(res, { deleted: true });
  }

  // PUT/PATCH
  if (req.method === 'PUT' || req.method === 'PATCH') {
    // Reviewers cannot modify applications (Req 9.4)
    if (isReviewerOnly) {
      return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
    }

    // Check ownership
    const appQ = ApplicationQueries.findById(applicationId);
    const appResult = await query<ApplicationRecord>(appQ.text, appQ.values);
    
    if (appResult.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    const app = appResult.rows[0];
    if (app.user_id !== userId && !isAdmin) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }

    const body = req.body;

    if (req.method === 'PATCH' && body.action) {
      const { action, ...payload } = body;

      if (action === 'update_status') {
        if (!canReviewApplications) {
          return sendError(res, 'Review permission required', HttpStatus.FORBIDDEN);
        }

        const parsedPayload = validatePatchPayload(patchUpdateStatusSchema, payload, res);
        if (!parsedPayload) return;

        const { status, notes } = parsedPayload;
        const force = payload.force === true;

        // Payment warning — advisory only, admin can override with force flag (Req 26.4)
        if (status === 'approved' && app.payment_status !== 'verified' && !force) {
          return sendSuccess(res, {
            warning: true,
            message: 'Payment has not been verified for this application. You can still approve by confirming the override.',
            application_id: applicationId,
            requested_status: status,
          });
        }

        let updateResult;
        try {
          const notificationTitle = 'Application approved';
          const notificationMessage = `Your application ${app.application_number || applicationId} has been approved.`;
          const actionUrl = `/student/application/${applicationId}`;

          updateResult = await query<ApplicationRecord>(
            `WITH updated_application AS (
               UPDATE applications
               SET
                 status = $2,
                 reviewed_by = $3,
                 review_started_at = COALESCE(review_started_at, NOW()),
                 updated_at = NOW()
               WHERE id = $1
               RETURNING *
             ), history_insert AS (
               INSERT INTO application_status_history (id, application_id, status, old_status, new_status, changed_by, notes, created_at)
               SELECT gen_random_uuid(), id, $2, $8, $2, $3, $4, NOW()
               FROM updated_application
               RETURNING id
             ), notification_insert AS (
               INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
               SELECT user_id, $5, $6, 'success', $7, false, NOW()
               FROM updated_application
               WHERE $2 = 'approved'
               RETURNING id
             )
             SELECT ua.*
             FROM updated_application ua`,
            [applicationId, status, userId, notes || null, notificationTitle, notificationMessage, actionUrl, app.status || null]
          );
        } catch (error) {
          const message = (error as Error).message?.toLowerCase() || '';
          if (message.includes('notifications')) {
            return sendError(
              res,
              'Status update failed during notification persistence; no changes were applied.',
              HttpStatus.CONFLICT
            );
          }
          if (message.includes('application_status_history') || message.includes('status_history')) {
            return sendError(
              res,
              'Status update failed during history persistence; no changes were applied.',
              HttpStatus.CONFLICT
            );
          }
          throw error;
        }

        if (!updateResult || updateResult.rowCount === 0) {
          return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
        }

        // Audit trail for application status change (Requirement 21.1)
        try {
          await logAuditEvent({
            actor_id: userId,
            action: 'application_status_changed',
            entity_type: 'application',
            entity_id: applicationId,
            changes: { new_status: status },
          });
        } catch (auditError) {
          console.error('[applications] Failed to create status change audit log:', auditError);
        }

        // Queue notification email to student via Resend (Req 26.2)
        if (app.email) {
          try {
            const statusDisplay = status.replace(/[_\s]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            const actionUrl = `/student/application/${applicationId}`;
            const htmlBody = renderEmailTemplate('status-change', {
              recipientName: app.full_name || undefined,
              applicationNumber: app.application_number || undefined,
              programName: app.program || undefined,
              status,
              actionUrl,
            });

            await query(
              `INSERT INTO email_queue (
                 recipient_email, recipient_name, subject, body, html_body,
                 template_name, template_data, status, priority
               ) VALUES ($1, $2, $3, $4, $5, 'status-change', $6, 'pending', 3)`,
              [
                app.email,
                app.full_name || null,
                `Application Status Update: ${statusDisplay}`,
                `Your application status has been updated to: ${statusDisplay}`,
                htmlBody,
                JSON.stringify({
                  recipientName: app.full_name || null,
                  applicationNumber: app.application_number || null,
                  programName: app.program || null,
                  status,
                  actionUrl,
                }),
              ]
            );
          } catch (emailError) {
            console.error('[applications] Failed to queue status change email:', emailError);
          }
        }

        const now = new Date().toISOString();
        const version = Date.now();
        const baseEvent = {
          entity_id: applicationId,
          version,
          created_at: now,
        };

        publishRealtimeEvent(app.user_id, {
          ...baseEvent,
          event_id: `application_update:${applicationId}:${version}`,
          event_type: 'application_update',
          payload: {
            application_id: applicationId,
            status,
            approved: status === 'approved',
          },
        });

        publishRealtimeEvent(app.user_id, {
          ...baseEvent,
          event_id: `dashboard_refresh:${applicationId}:${version}`,
          event_type: 'dashboard_refresh',
          payload: {
            reason: 'application_status_changed',
            application_id: applicationId,
          },
        });

        if (status === 'approved') {
          publishRealtimeEvent(app.user_id, {
            ...baseEvent,
            event_id: `notification:${applicationId}:${version}`,
            event_type: 'notification',
            payload: {
              title: 'Application approved',
              message: `Your application ${app.application_number || applicationId} has been approved.`,
            },
          });
        }

        console.log('[applications] Status updated:', applicationId, status);
        return sendSuccess(res, updateResult!.rows[0]);
      }

      if (action === 'update_payment_status') {
        if (!canVerifyPayments) {
          return sendError(res, 'Payment verification permission required', HttpStatus.FORBIDDEN);
        }

        const parsedPayload = validatePatchPayload(patchUpdatePaymentStatusSchema, payload, res);
        if (!parsedPayload) return;

        const { paymentStatus, verificationNotes } = parsedPayload;

        const normalizedVerificationNotes = typeof verificationNotes === 'string'
          ? verificationNotes.trim().slice(0, 1000)
          : '';

        if (paymentStatus === 'rejected' && !normalizedVerificationNotes) {
          return sendError(res, 'Rejection notes are required when rejecting a payment.', HttpStatus.BAD_REQUEST);
        }

        if ((paymentStatus === 'verified' || paymentStatus === 'rejected') && !app.pop_url) {
          return sendError(res, 'Payment proof is required before a payment can be reviewed.', HttpStatus.CONFLICT);
        }

        const notificationTitle = paymentStatus === 'verified'
          ? 'Payment Verified'
          : paymentStatus === 'rejected'
            ? 'Payment Rejected'
            : app.payment_status === 'rejected'
              ? 'Payment Resubmission Reopened'
              : 'Payment Under Review';
        const notificationMessage = paymentStatus === 'verified'
          ? `Your payment for application ${app.application_number || applicationId} has been verified.`
          : paymentStatus === 'rejected'
            ? `Your payment for application ${app.application_number || applicationId} was rejected. Please resubmit your payment proof.`
            : app.payment_status === 'rejected'
              ? `Your payment for application ${app.application_number || applicationId} is back under review.`
              : `Your payment for application ${app.application_number || applicationId} is currently under review.`;
        const actionUrl = `/student/application/${applicationId}`;

        let updateResult;
        try {
          updateResult = await query<ApplicationRecord>(
            `WITH updated_application AS (
               UPDATE applications
               SET
                 payment_status = $2,
                 payment_verified_by = $3,
                 payment_verified_at = CASE WHEN $2 = 'verified' THEN NOW() ELSE NULL END,
                 updated_at = NOW()
               WHERE id = $1
               RETURNING *
             ), notification_insert AS (
               INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
               SELECT user_id, $4, $5, $6, $7, false, NOW()
               FROM updated_application
               RETURNING id
             )
             SELECT ua.*
             FROM updated_application ua`,
            [
              applicationId,
              paymentStatus,
              paymentStatus === 'verified' ? userId : null,
              notificationTitle,
              notificationMessage,
              paymentStatus === 'verified' ? 'success' : paymentStatus === 'rejected' ? 'warning' : 'info',
              actionUrl,
            ]
          );
        } catch (notifError) {
          const message = (notifError as Error).message?.toLowerCase() || '';
          if (message.includes('notifications')) {
            return sendError(
              res,
              'Payment status update failed during notification persistence; no changes were applied.',
              HttpStatus.CONFLICT
            );
          }
          throw notifError;
        }

        if (!updateResult || updateResult.rowCount === 0) {
          return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
        }

        // Create audit log entry (Requirement 21.3 - payment verification/rejection)
        try {
          await logAuditEvent({
            actor_id: userId,
            action: paymentStatus === 'verified' ? 'payment_verified' : paymentStatus === 'rejected' ? 'payment_rejected' : 'payment_status_updated',
            entity_type: 'payment',
            entity_id: applicationId,
            changes: {
              payment_status: paymentStatus,
              previous_payment_status: app.payment_status,
              notes: normalizedVerificationNotes || null,
            },
          });
        } catch (auditError) {
          console.error('[applications] Failed to create payment audit log:', auditError);
        }

        // Publish real-time event to student
        const now = new Date().toISOString();
        const version = Date.now();
        publishRealtimeEvent(app.user_id, {
          event_id: `payment_update:${applicationId}:${version}`,
          event_type: 'payment_update',
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            application_id: applicationId,
            payment_status: paymentStatus,
            review_notes: normalizedVerificationNotes || null,
          },
        });

        publishRealtimeEvent(app.user_id, {
          event_id: `dashboard_refresh:${applicationId}:${version}`,
          event_type: 'dashboard_refresh',
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            reason: 'payment_status_changed',
            application_id: applicationId,
          },
        });

        publishRealtimeEvent(app.user_id, {
          event_id: `notification:${applicationId}:${version}`,
          event_type: 'notification',
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            title: notificationTitle,
            content: notificationMessage,
            action_url: actionUrl,
          },
        });

        console.log('[applications] Payment status updated:', applicationId, paymentStatus);
        return sendSuccess(res, updateResult.rows[0]);
      }

      if (action === 'send_notification') {
        if (!isAdmin) {
          return sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
        }

        const parsedPayload = validatePatchPayload(patchSendNotificationSchema, payload, res);
        if (!parsedPayload) return;
        const { title, message } = parsedPayload;

        const actionUrl = `/student/application/${applicationId}`;
        const notificationResult = await query<Record<string, unknown>>(
          `INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
           VALUES ($1, $2, $3, 'info', $4, false, NOW())
           RETURNING *`,
          [app.user_id, title.trim(), message.trim(), actionUrl]
        );

        let emailQueued = false;
        if (app.email) {
          try {
            const htmlBody = renderEmailTemplate('generic', {
              recipientName: app.full_name || undefined,
              message: message.trim(),
              actionUrl
            });

            await query(
              `INSERT INTO email_queue (
                 recipient_email,
                 recipient_name,
                 subject,
                 body,
                 html_body,
                 template_name,
                 template_data,
                 status,
                 priority
               )
               VALUES ($1, $2, $3, $4, $5, 'generic', $6, 'pending', 5)`,
              [
                app.email,
                app.full_name || null,
                title.trim(),
                message.trim(),
                htmlBody,
                JSON.stringify({
                  recipientName: app.full_name || null,
                  message: message.trim(),
                  actionUrl,
                  applicationNumber: app.application_number || null,
                }),
              ]
            );
            emailQueued = true;
          } catch (emailQueueError) {
            console.error('[applications] Failed to queue notification email:', emailQueueError);
          }
        }

        try {
          await logAuditEvent({
            actor_id: userId,
            action: 'application_notification_sent',
            entity_type: 'notification',
            entity_id: (notificationResult.rows[0]?.id as string) || null,
            changes: {
              application_id: applicationId,
              target_user_id: app.user_id,
              email_queued: emailQueued,
            },
          });
        } catch (auditError) {
          console.error('[applications] Failed to create notification audit log:', auditError);
        }

        const now = new Date().toISOString();
        const version = Date.now();
        publishRealtimeEvent(app.user_id, {
          event_id: `notification:${applicationId}:${version}`,
          event_type: 'notification',
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            title: title.trim(),
            content: message.trim(),
            action_url: actionUrl,
          },
        });

        publishRealtimeEvent(app.user_id, {
          event_id: `dashboard_refresh:${applicationId}:${version}`,
          event_type: 'dashboard_refresh',
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            reason: 'admin_notification_sent',
            application_id: applicationId,
          },
        });

        return sendSuccess(res, {
          notification: notificationResult.rows[0],
          email_queued: emailQueued,
        });
      }

      if (action === 'schedule_interview') {
        if (!isAdmin) {
          return sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
        }
        const parsedPayload = validatePatchPayload(patchScheduleInterviewSchema, payload, res);
        if (!parsedPayload) return;
        const { scheduledAt, mode: interviewMode, location: interviewLocation, notes: interviewNotes } = parsedPayload;
        const normalizedMode = interviewMode === 'in-person' ? 'in_person' : interviewMode;
        const interviewResult = await query<{
          id: string; application_id: string; scheduled_at: string; mode: string;
          location: string; notes: string | null; status: string;
        }>(
          `INSERT INTO application_interviews (
            application_id, scheduled_at, mode, location, notes, status, created_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, NOW(), NOW())
          RETURNING id, application_id, scheduled_at, mode, location, notes, status`,
          [applicationId, scheduledAt, normalizedMode, interviewLocation, interviewNotes || null, userId]
        );
        // Audit trail
        try {
          await logAuditEvent({
            actor_id: userId,
            action: 'interview_scheduled',
            entity_type: 'application',
            entity_id: applicationId,
            changes: { scheduled_at: scheduledAt, mode: normalizedMode, interview_id: interviewResult.rows[0]?.id },
          });
        } catch (auditError) {
          console.error('[applications] Failed to create interview audit log:', auditError);
        }
        // Real-time event
        try {
          const now = new Date().toISOString();
          const version = Date.now();
          publishRealtimeEvent(app.user_id, {
            event_id: `interview_scheduled:${applicationId}:${version}`,
            event_type: 'interview_scheduled',
            entity_id: applicationId,
            version, created_at: now,
            payload: { application_id: applicationId, interview_id: interviewResult.rows[0]?.id, scheduled_at: scheduledAt, mode: normalizedMode, location: interviewLocation },
          });
        } catch (realtimeError) {
          console.error('[applications] Failed to publish interview realtime event:', realtimeError);
        }
        console.log('[applications] Interview scheduled via PATCH:', applicationId);
        return sendSuccess(res, { interview: interviewResult.rows[0] }, HttpStatus.CREATED);
      }

      if (action === 'reschedule_interview') {
        if (!isAdmin) {
          return sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
        }
        const parsedPayload = validatePatchPayload(patchRescheduleInterviewSchema, payload, res);
        if (!parsedPayload) return;
        const { scheduledAt, mode: reschedMode, location: reschedLocation, notes: reschedNotes } = parsedPayload;
        // Find the latest scheduled interview for this application
        const existingInterview = await query<{ id: string }>(
          `SELECT id FROM application_interviews WHERE application_id = $1 AND status IN ('scheduled', 'rescheduled')
           ORDER BY created_at DESC LIMIT 1`,
          [applicationId]
        );
        if (existingInterview.rowCount === 0) {
          return sendError(res, 'No active interview found to reschedule', HttpStatus.NOT_FOUND);
        }
        const interviewId = existingInterview.rows[0].id;
        const setClauses: string[] = [`scheduled_at = $1`, `status = 'rescheduled'`, `updated_at = NOW()`];
        const updateValues: (string | null)[] = [scheduledAt];
        let pIdx = 2;
        if (reschedMode) {
          const normalizedMode = reschedMode === 'in-person' ? 'in_person' : reschedMode;
          setClauses.push(`mode = $${pIdx}`); updateValues.push(normalizedMode); pIdx++;
        }
        if (reschedLocation) {
          setClauses.push(`location = $${pIdx}`); updateValues.push(reschedLocation); pIdx++;
        }
        if (reschedNotes !== undefined) {
          setClauses.push(`notes = $${pIdx}`); updateValues.push(reschedNotes || null); pIdx++;
        }
        updateValues.push(interviewId);
        const reschedResult = await query<{
          id: string; application_id: string; scheduled_at: string; mode: string;
          location: string; notes: string | null; status: string;
        }>(
          `UPDATE application_interviews SET ${setClauses.join(', ')} WHERE id = $${pIdx}
           RETURNING id, application_id, scheduled_at, mode, location, notes, status`,
          updateValues
        );
        // Audit trail
        try {
          await logAuditEvent({
            actor_id: userId,
            action: 'interview_rescheduled',
            entity_type: 'application',
            entity_id: applicationId,
            changes: { interview_id: interviewId, scheduled_at: scheduledAt },
          });
        } catch (auditError) {
          console.error('[applications] Failed to create reschedule audit log:', auditError);
        }
        console.log('[applications] Interview rescheduled:', applicationId, interviewId);
        return sendSuccess(res, { interview: reschedResult.rows[0] });
      }

      if (action === 'cancel_interview') {
        if (!isAdmin) {
          return sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
        }
        const parsedPayload = validatePatchPayload(patchCancelInterviewSchema, payload, res);
        if (!parsedPayload) return;
        const { notes: cancelNotes } = parsedPayload;
        const existingInterview = await query<{ id: string }>(
          `SELECT id FROM application_interviews WHERE application_id = $1 AND status IN ('scheduled', 'rescheduled')
           ORDER BY created_at DESC LIMIT 1`,
          [applicationId]
        );
        if (existingInterview.rowCount === 0) {
          return sendError(res, 'No active interview found to cancel', HttpStatus.NOT_FOUND);
        }
        const interviewId = existingInterview.rows[0].id;
        const cancelResult = await query<{
          id: string; application_id: string; scheduled_at: string; mode: string;
          location: string; notes: string | null; status: string;
        }>(
          `UPDATE application_interviews SET status = 'cancelled', notes = COALESCE($1, notes), updated_at = NOW()
           WHERE id = $2
           RETURNING id, application_id, scheduled_at, mode, location, notes, status`,
          [cancelNotes || null, interviewId]
        );
        // Audit trail
        try {
          await logAuditEvent({
            actor_id: userId,
            action: 'interview_cancelled',
            entity_type: 'application',
            entity_id: applicationId,
            changes: { interview_id: interviewId },
          });
        } catch (auditError) {
          console.error('[applications] Failed to create cancel interview audit log:', auditError);
        }
        console.log('[applications] Interview cancelled:', applicationId, interviewId);
        return sendSuccess(res, { interview: cancelResult.rows[0] });
      }

      if (action === 'save_draft') {
        // Only the owner can save drafts (already checked above)
        if (app.status !== 'draft') {
          return sendError(res, 'Can only save drafts for applications in draft status', HttpStatus.BAD_REQUEST, 'INVALID_STATUS');
        }

        const parsedPayload = validatePatchPayload(patchSaveDraftSchema, payload, res);
        if (!parsedPayload) return;

        const { version: newVersion, data: draftData } = parsedPayload;

        // Optimistic concurrency: only update if incoming version > stored version
        const allowedFields = [
          'full_name', 'nrc_number', 'passport_number', 'date_of_birth', 'sex',
          'phone', 'email', 'residence_town', 'nationality',
          'next_of_kin_name', 'next_of_kin_phone',
          'program', 'intake', 'institution',
          'result_slip_url', 'extra_kyc_url',
          'payment_method', 'payer_name', 'payer_phone', 'amount', 'paid_at',
          'momo_ref', 'pop_url',
        ];

        const setClauses: string[] = [];
        const values: unknown[] = [applicationId, newVersion];
        let paramIdx = 3;

        for (const field of allowedFields) {
          if (field in (draftData as Record<string, unknown>)) {
            setClauses.push(`${field} = $${paramIdx}`);
            values.push((draftData as Record<string, unknown>)[field]);
            paramIdx++;
          }
        }

        setClauses.push(`version = $2`);
        setClauses.push(`updated_at = NOW()`);

        const updateResult = await query<ApplicationRecord>(
          `UPDATE applications
           SET ${setClauses.join(', ')}
           WHERE id = $1 AND version < $2
           RETURNING *`,
          values
        );

        if (updateResult.rowCount === 0) {
          // Either the application doesn't exist or version conflict
          const currentApp = await query<{ version: number }>(
            `SELECT version FROM applications WHERE id = $1`,
            [applicationId]
          );
          if (currentApp.rowCount === 0) {
            return sendError(res, 'Application not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
          }
          return sendError(
            res,
            'Version conflict: a newer version already exists on the server',
            HttpStatus.CONFLICT,
            'VERSION_CONFLICT'
          );
        }

        return sendSuccess(res, {
          ...updateResult.rows[0],
          version: newVersion,
        });
      }

      if (action === 'sync_grades') {
        const parsedPayload = validatePatchPayload(patchSyncGradesSchema, payload, res);
        if (!parsedPayload) return;
        const { grades } = parsedPayload;

        // Wrap delete + batch insert in a transaction for atomicity (Req 30.1)
        const deleteQ = GradeQueries.deleteByApplication(applicationId);
        const ops = [{ text: deleteQ.text, values: deleteQ.values }];

        if (grades.length > 0) {
          const values: unknown[] = [];
          const placeholders: string[] = [];
          grades.forEach((g: { subject_id: string; grade: number }, i: number) => {
            const offset = i * 3;
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
            values.push(applicationId, g.subject_id, g.grade);
          });
          ops.push({
            text: `INSERT INTO application_grades (application_id, subject_id, grade)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (application_id, subject_id) DO UPDATE SET grade = EXCLUDED.grade`,
            values,
          });
        }

        await transaction(ops);

        console.log('[applications] Grades synced:', applicationId);
        return sendSuccess(res, { synced: true });
      }
    }

    // Regular update — with idempotency check for submissions (Req 3.3)
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || '';
    const isSubmission = body.status === 'submitted';

    // If this is a submission with an idempotency key, check for duplicate
    if (isSubmission && idempotencyKey) {
      const cachedResponse = await checkIdempotencyKey(idempotencyKey, `applications/${applicationId}/submit`);
      if (cachedResponse) {
        // Return the cached response for duplicate submission (Req 3.3)
        return sendSuccess(res, cachedResponse);
      }
    }

    const updateQ = ApplicationQueries.update(applicationId, body);
    const updateResult = await query<ApplicationRecord>(updateQ.text, updateQ.values);
    
    if (updateResult.rowCount === 0) {
      return sendError(res, 'Update failed', HttpStatus.BAD_REQUEST);
    }

    const responseData = updateResult.rows[0];

    // Store idempotency key for successful submissions (Req 3.3)
    if (isSubmission && idempotencyKey) {
      await storeIdempotencyKey(idempotencyKey, `applications/${applicationId}/submit`, responseData);
    }

    return sendSuccess(res, responseData);
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, 'applications/by-id');
  }
}

async function fetchApplicationDetails(id: string, include?: string) {
  // Fetch application
  const appResult = await query<ApplicationPaymentMetadataRow>(
    `SELECT ${APPLICATION_PAYMENT_METADATA_SELECT}
     FROM applications a
     ${APPLICATION_PAYMENT_METADATA_JOINS}
     WHERE a.id = $1
     LIMIT 1`,
    [id]
  );
  
  if (appResult.rowCount === 0) {
    return null;
  }

  const application = appResult.rows[0];
  const result: Record<string, unknown> = { ...application };
  const includes = include ? include.split(',') : ['grades', 'documents', 'statusHistory', 'interview'];

  // Fetch grades with subject names
  const gradesQ = GradeQueries.findByApplicationId(id);
  const gradesResult = await query<GradeRecord & { subject_name?: string }>(gradesQ.text, gradesQ.values);
  result.grades = gradesResult.rows;

  // Fetch documents
  if (includes.includes('documents')) {
    const docsQ = DocumentQueries.findByApplicationId(id);
    const docsResult = await query<DocumentRecord>(docsQ.text, docsQ.values);
    result.documents = docsResult.rows;
  }

  // Fetch status history
  if (includes.includes('statusHistory')) {
    const historyQ = StatusHistoryQueries.findByApplicationId(id);
    const historyResult = await query<StatusHistoryRecord>(historyQ.text, historyQ.values);
    result.statusHistory = historyResult.rows;
  }

  // Fetch latest interview
  if (includes.includes('interview')) {
    const interviewResult = await query<{
      id: string;
      application_id: string;
      scheduled_at: string;
      mode: string;
      location: string | null;
      status: string;
      notes: string | null;
      created_by: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
        id,
        application_id,
        scheduled_at,
        mode,
        location,
        status,
        notes,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM application_interviews
      WHERE application_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
      [id]
    );

    result.interview = interviewResult.rows[0] || null;
  }

  return result;
}

/**
 * Handle export action - Get applications for export (admin only)
 * Returns paginated applications with all details for CSV/Excel/PDF export
 * 
 * GET /api/applications?action=export&page=0&limit=500&status=xxx&payment=xxx&program=xxx&search=xxx
 */
async function handleExport(
  req: VercelRequest,
  res: VercelResponse,
  isAdmin: boolean
) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  try {
    const page = parseInt(req.query.page as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '500', 10), 1000);
  const offset = page * limit;

  // Build dynamic query with filters
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  // Search filter
  const search = req.query.search as string;
  if (search) {
    const searchPattern = `%${search.replace(/[%_]/g, '\\$&')}%`;
    conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR application_number ILIKE $${paramIndex})`);
    values.push(searchPattern);
    paramIndex++;
  }

  // Status filter
  const status = req.query.status as string;
  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  // Payment status filter
  const payment = req.query.payment as string;
  if (payment) {
    if (payment === 'not_paid') {
      conditions.push(`payment_status IS NULL`);
    } else {
      conditions.push(`payment_status = $${paramIndex}`);
      values.push(payment);
      paramIndex++;
    }
  }

  // Program filter
  const program = req.query.program as string;
  if (program) {
    conditions.push(`program = $${paramIndex}`);
    values.push(program);
    paramIndex++;
  }

  // Institution filter
  const institution = req.query.institution as string;
  if (institution) {
    conditions.push(`institution = $${paramIndex}`);
    values.push(institution);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Add pagination params
  values.push(limit);
  values.push(offset);

  const result = await query<{
    id: string;
    application_number: string;
    full_name: string;
    email: string;
    phone: string;
    program: string;
    intake: string;
    institution: string;
    status: string;
    payment_status: string | null;
    application_fee: number;
    paid_amount: number;
    submitted_at: string;
    created_at: string;
    grades_summary: string;
    total_subjects: number;
    points: number;
    age: number;
    days_since_submission: number;
    payment_verified_at: string | null;
    payment_verified_by_name: string | null;
    payment_verified_by_email: string | null;
    last_payment_audit_at: string | null;
    last_payment_audit_by_name: string | null;
    last_payment_audit_by_email: string | null;
    last_payment_audit_notes: string | null;
    last_payment_reference: string | null;
  }>(`
    SELECT 
      applications.id,
      applications.application_number,
      applications.full_name,
      applications.email,
      applications.phone,
      applications.program,
      applications.intake,
      applications.institution,
      applications.status,
      applications.payment_status,
      COALESCE(applications.application_fee, 0) as application_fee,
      COALESCE(applications.amount, 0) as paid_amount,
      applications.submitted_at,
      applications.created_at,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'subject', COALESCE(s.name, g.subject_id),
            'grade', g.grade
          )
          ORDER BY COALESCE(s.name, g.subject_id)
        )::text
        FROM application_grades g
        LEFT JOIN subjects s ON s.id = g.subject_id
        WHERE g.application_id = applications.id
      ), '[]') as grades_summary,
      COALESCE((
        SELECT COUNT(*)::int
        FROM application_grades g
        WHERE g.application_id = applications.id
      ), 0) as total_subjects,
      COALESCE((
        SELECT SUM(best_five.grade)::int
        FROM (
          SELECT g.grade::int as grade
          FROM application_grades g
          WHERE g.application_id = applications.id
            AND g.grade BETWEEN 1 AND 9
          ORDER BY g.grade ASC
          LIMIT 5
        ) as best_five
      ), 0) as points,
      COALESCE(EXTRACT(YEAR FROM AGE(applications.date_of_birth))::int, 0) as age,
      COALESCE(EXTRACT(DAY FROM NOW() - COALESCE(applications.submitted_at, applications.created_at))::int, 0) as days_since_submission,
      applications.payment_verified_at,
      NULLIF(TRIM(CONCAT_WS(' ', verifier.first_name, verifier.last_name)), '') AS payment_verified_by_name,
      verifier.email AS payment_verified_by_email,
      payment_audit.created_at AS last_payment_audit_at,
      payment_audit.actor_name AS last_payment_audit_by_name,
      payment_audit.actor_email AS last_payment_audit_by_email,
      payment_audit.notes AS last_payment_audit_notes,
      COALESCE(NULLIF(applications.momo_ref, ''), NULLIF(applications.pop_url, '')) AS last_payment_reference
    FROM applications
    LEFT JOIN profiles verifier
      ON verifier.id = applications.payment_verified_by
    LEFT JOIN LATERAL (
      SELECT
        al.created_at::text AS created_at,
        NULLIF(TRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), '') AS actor_name,
        actor.email AS actor_email,
        COALESCE(
          NULLIF(TRIM(al.changes->>'notes'), ''),
          NULLIF(TRIM(al.changes->>'verification_notes'), ''),
          NULLIF(TRIM(al.changes->>'reason'), '')
        ) AS notes
      FROM audit_logs al
      LEFT JOIN profiles actor
        ON actor.id = al.actor_id
      WHERE al.entity_type = 'payment'
        AND al.entity_id = applications.id
        AND al.action IN ('payment_verified', 'payment_rejected', 'payment_status_updated')
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT 1
    ) payment_audit ON true
    ${whereClause}
    ORDER BY applications.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, values);

  return sendSuccess(res, { 
    applications: result.rows,
    page,
    limit,
    hasMore: result.rows.length === limit
  });
  } catch (error) {
    return handleError(res, error, 'applications/export');
  }
}

/**
 * Handle versions action - Get/create application versions
 * NOTE: application_versions table does not exist — returns graceful empty responses
 */
async function handleEmailSlip(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  isAdmin: boolean
) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { applicationId, email } = req.body || {};
  if (!applicationId || !email) {
    return sendError(res, 'Missing required fields: applicationId, email', HttpStatus.BAD_REQUEST);
  }

  // Fetch application
  const appQ = ApplicationQueries.findById(applicationId);
  const appResult = await query<ApplicationRecord>(appQ.text, appQ.values);

  if (appResult.rowCount === 0) {
    return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
  }

  const app = appResult.rows[0];

  // Verify ownership or admin role
  if (app.user_id !== userId && !isAdmin) {
    return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
  }

  try {
    const htmlBody = renderEmailTemplate('application-submitted', {
      recipientName: app.full_name || undefined,
      applicationNumber: app.application_number || undefined,
      programName: (app as unknown as Record<string, unknown>).program as string || undefined,
      actionUrl: `***REMOVED***/student/application/${applicationId}`,
    });

    await query(
      `INSERT INTO email_queue (
         recipient_email,
         recipient_name,
         subject,
         body,
         html_body,
         template_name,
         template_data,
         status,
         priority
       )
       VALUES ($1, $2, $3, $4, $5, 'application-submitted', $6, 'pending', 5)`,
      [
        email,
        app.full_name || null,
        `Application Slip - ${app.application_number || applicationId}`,
        `Your application slip for ${app.application_number || applicationId}`,
        htmlBody,
        JSON.stringify({
          recipientName: app.full_name || null,
          applicationNumber: app.application_number || null,
          programName: (app as unknown as Record<string, unknown>).program || null,
        }),
      ]
    );

    try {
      await logAuditEvent({
        actor_id: userId,
        action: 'application_slip_emailed',
        entity_type: 'application',
        entity_id: applicationId,
        changes: { recipient: email.substring(0, 3) + '***' },
      });
    } catch { /* non-blocking */ }

    return sendSuccess(res, { emailed: true });
  } catch (error) {
    return handleError(res, error, 'applications/email-slip');
  }
}

async function handleVersions(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
) {
  if (req.method === 'GET') {
    return sendSuccess(res, { versions: [], message: 'Version history feature not yet configured' });
  }
  if (req.method === 'POST') {
    return sendError(res, 'Version history feature not yet configured', HttpStatus.SERVICE_UNAVAILABLE);
  }
  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
