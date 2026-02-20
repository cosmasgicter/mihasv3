import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { getAuthUser } from '../lib/auth/middleware';
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
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { publishRealtimeEvent } from '../lib/realtimeBroker';
import { logAuditEvent } from '../lib/auditLogger';

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

  const action = req.query.action as string;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // Dedicated unauthenticated tracking route
  if (req.method === 'GET' && action === 'track') {
    return await handlePublicTracking(req, res);
  }

  // Get authenticated user (supports both cookie and Bearer token)
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  // Determine if user is admin (check role string directly for flexibility)
  const adminRoles = ['admin', 'super_admin', 'admissions_officer'];
  const isAdmin = adminRoles.includes(user.role);

  const id = req.query.id as string;

  try {
    // Handle specific actions
    if (action === 'details') return await handleDetails(req, res, user.userId, isAdmin);
    if (action === 'documents') return await handleDocuments(res);
    if (action === 'grades') return await handleGrades(res);
    if (action === 'summary') return await handleSummary(res);
    if (action === 'review') return await handleReview(req, res, user.userId, isAdmin);
    if (action === 'interviews') return await handleInterviews(req, res, user.userId);
    if (action === 'schedule-interview') return await handleScheduleInterview(req, res, user.userId, isAdmin);
    if (action === 'stats') return await handleStats(req, res, user.userId);
    if (action === 'export') return await handleExport(req, res, isAdmin);
    if (action === 'versions') return await handleVersions(req, res, user.userId);

    // Handle CRUD by ID
    if (id) return await handleById(req, res, user.userId, isAdmin, id);

    // Default: list applications (GET) or create application (POST)
    if (req.method === 'GET') return await handleDetails(req, res, user.userId, isAdmin);
    if (req.method === 'POST') return await handleCreate(req, res, user.userId);

    return sendError(res, 'Invalid request', HttpStatus.BAD_REQUEST);
  } catch (error) {
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
  const body = req.body;
  
  // Validate required fields
  const requiredFields = [
    'application_number', 'full_name', 'date_of_birth', 'sex',
    'phone', 'email', 'residence_town', 'program', 'intake', 'institution'
  ];
  
  for (const field of requiredFields) {
    if (!body[field]) {
      return sendError(res, `Missing required field: ${field}`, HttpStatus.BAD_REQUEST);
    }
  }

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
}

async function handleDetails(
  req: VercelRequest, 
  res: VercelResponse, 
  userId: string, 
  isAdmin: boolean
) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

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
  if (!isAdmin || mine === 'true') {
    conditions.push(`user_id = $${paramIndex}`);
    values.push(userId);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (search) {
    const searchPattern = `%${search.replace(/[%_]/g, '\\$&')}%`;
    conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR application_number ILIKE $${paramIndex})`);
    values.push(searchPattern);
    paramIndex++;
  }

  if (payment) {
    conditions.push(`payment_status = $${paramIndex}`);
    values.push(payment);
    paramIndex++;
  }

  if (program) {
    conditions.push(`program = $${paramIndex}`);
    values.push(program);
    paramIndex++;
  }

  if (institution) {
    conditions.push(`institution = $${paramIndex}`);
    values.push(institution);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort column mapping
  const sortColumn = sortBy === 'date' ? 'created_at' : sortBy === 'name' ? 'full_name' : 'created_at';

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM applications ${whereClause}`,
    values
  );
  const totalCount = parseInt(countResult.rows[0]?.count || '0', 10);

  // Fetch page with LIMIT/OFFSET (1-based page → 0-based offset)
  const offset = (page - 1) * pageSize;
  const dataValues = [...values, pageSize, offset];
  const result = await query<ApplicationRecord>(
    `SELECT * FROM applications ${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    dataValues
  );

  return sendSuccess(res, {
    applications: result.rows,
    totalCount,
    page,
    pageSize
  });
}

async function handleDocuments(res: VercelResponse) {
  const q = DocumentQueries.findAll();
  const result = await query<DocumentRecord>(q.text, q.values);
  return sendSuccess(res, result.rows);
}

async function handleGrades(res: VercelResponse) {
  const q = GradeQueries.findAll();
  const result = await query<GradeRecord>(q.text, q.values);
  return sendSuccess(res, result.rows);
}

async function handleSummary(res: VercelResponse) {
  const q = ApplicationQueries.getSummary();
  const result = await query<{ id: string; status: string; created_at: string }>(q.text, q.values);
  return sendSuccess(res, result.rows);
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
}

async function handleReview(
  req: VercelRequest, 
  res: VercelResponse, 
  userId: string, 
  isAdmin: boolean
) {
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  if (req.method === 'GET') {
    const q = ApplicationQueries.findPendingReview();
    const result = await query<ApplicationRecord>(q.text, q.values);
    return sendSuccess(res, result.rows);
  }

  if (req.method === 'POST') {
    const { application_id, status, notes } = req.body;
    if (!application_id || !status) {
      return sendError(res, 'application_id and status are required', HttpStatus.BAD_REQUEST);
    }

    // Update application status
    const updateQ = ApplicationQueries.updateStatus(
      application_id, 
      status as ApplicationStatus, 
      userId, 
      notes
    );
    const updateResult = await query<ApplicationRecord>(updateQ.text, updateQ.values);

    if (updateResult.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    // Create status history entry
    const historyQ = StatusHistoryQueries.create(
      application_id,
      status as ApplicationStatus,
      userId,
      notes
    );
    await query(historyQ.text, historyQ.values);

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

    console.log('[applications/review] Application reviewed:', application_id, status);
    return sendSuccess(res, { application: updateResult.rows[0] });
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

async function handleById(
  req: VercelRequest, 
  res: VercelResponse, 
  userId: string, 
  isAdmin: boolean, 
  applicationId: string
) {
  // GET - Fetch application details
  if (req.method === 'GET') {
    // Check ownership for non-admin users
    if (!isAdmin) {
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

    return sendSuccess(res, {
      application: data,
      grades: data.grades || [],
      documents: data.documents || [],
      statusHistory: data.statusHistory || [],
    });
  }

  // DELETE
  if (req.method === 'DELETE') {
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
        const { status, notes } = payload;
        const validStatuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'pending_documents'];
        if (!validStatuses.includes(status)) {
          return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
        }
        if (status === 'approved' && app.payment_status !== 'verified') {
          return sendError(res, 'Cannot approve without verified payment', HttpStatus.BAD_REQUEST);
        }

        let updateResult;
        try {
          const notificationTitle = 'Application approved';
          const notificationMessage = `Your application ${app.application_number || applicationId} has been approved.`;

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
               INSERT INTO status_history (application_id, status, changed_by, notes, changed_at)
               SELECT id, $2, $3, $4, NOW()
               FROM updated_application
               RETURNING id
             ), notification_insert AS (
               INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
               SELECT user_id, $5, $6, 'success', false, NOW()
               FROM updated_application
               WHERE $2 = 'approved'
               RETURNING id
             )
             SELECT ua.*
             FROM updated_application ua`,
            [applicationId, status, userId, notes || null, notificationTitle, notificationMessage]
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
          if (message.includes('status_history')) {
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
        const { paymentStatus, verificationNotes } = payload;
        const validPaymentStatuses = ['pending_review', 'verified', 'rejected'];
        if (!validPaymentStatuses.includes(paymentStatus)) {
          return sendError(res, `Invalid payment status. Must be one of: ${validPaymentStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
        }

        const notificationTitle = paymentStatus === 'verified'
          ? 'Payment Verified'
          : paymentStatus === 'rejected'
            ? 'Payment Rejected'
            : 'Payment Status Updated';
        const notificationMessage = paymentStatus === 'verified'
          ? `Your payment for application ${app.application_number || applicationId} has been verified.`
          : paymentStatus === 'rejected'
            ? `Your payment for application ${app.application_number || applicationId} was rejected. Please resubmit your payment proof.`
            : `Your payment status for application ${app.application_number || applicationId} has been updated to ${paymentStatus}.`;

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
               INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
               SELECT user_id, $4, $5, $6, false, NOW()
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
              paymentStatus === 'verified' ? 'success' : paymentStatus === 'rejected' ? 'error' : 'info',
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
            changes: { payment_status: paymentStatus },
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

        console.log('[applications] Payment status updated:', applicationId, paymentStatus);
        return sendSuccess(res, updateResult.rows[0]);
      }

      if (action === 'schedule_interview') {
        if (!isAdmin) {
          return sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
        }
        const { scheduledAt, mode: interviewMode, location: interviewLocation, notes: interviewNotes } = payload;
        if (!scheduledAt || !interviewMode || !interviewLocation) {
          return sendError(res, 'Missing required fields: scheduledAt, mode, location', HttpStatus.BAD_REQUEST);
        }
        const normalizedMode = interviewMode === 'in-person' ? 'in_person' : interviewMode;
        if (!['in_person', 'virtual', 'phone'].includes(normalizedMode)) {
          return sendError(res, 'Invalid mode. Use: in-person, in_person, virtual, or phone', HttpStatus.BAD_REQUEST);
        }
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
        const { scheduledAt, mode: reschedMode, location: reschedLocation, notes: reschedNotes } = payload;
        if (!scheduledAt) {
          return sendError(res, 'Missing required field: scheduledAt', HttpStatus.BAD_REQUEST);
        }
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
        const { notes: cancelNotes } = payload;
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

      if (action === 'sync_grades') {
        const { grades } = payload;
        if (!Array.isArray(grades)) {
          return sendError(res, 'Grades must be an array', HttpStatus.BAD_REQUEST);
        }

        // Delete existing grades
        const deleteQ = GradeQueries.deleteByApplication(applicationId);
        await query(deleteQ.text, deleteQ.values);

        // Insert new grades
        if (grades.length > 0) {
          for (const g of grades) {
            const upsertQ = GradeQueries.upsert(applicationId, g.subject_id, g.grade);
            await query(upsertQ.text, upsertQ.values);
          }
        }

        console.log('[applications] Grades synced:', applicationId);
        return sendSuccess(res, { synced: true });
      }
    }

    // Regular update
    const updateQ = ApplicationQueries.update(applicationId, body);
    const updateResult = await query<ApplicationRecord>(updateQ.text, updateQ.values);
    
    if (updateResult.rowCount === 0) {
      return sendError(res, 'Update failed', HttpStatus.BAD_REQUEST);
    }

    return sendSuccess(res, updateResult.rows[0]);
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

async function fetchApplicationDetails(id: string, include?: string) {
  // Fetch application
  const appQ = ApplicationQueries.findById(id);
  const appResult = await query<ApplicationRecord>(appQ.text, appQ.values);
  
  if (appResult.rowCount === 0) {
    return null;
  }

  const application = appResult.rows[0];
  const result: Record<string, unknown> = { ...application };
  const includes = include ? include.split(',') : ['grades', 'documents', 'statusHistory'];

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
    conditions.push(`payment_status = $${paramIndex}`);
    values.push(payment);
    paramIndex++;
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
    payment_status: string;
    application_fee: number;
    amount: number;
    submitted_at: string;
    created_at: string;
    age: number;
    days_since_submission: number;
  }>(`
    SELECT 
      id,
      application_number,
      full_name,
      email,
      phone,
      program,
      intake,
      institution,
      status,
      payment_status,
      COALESCE(application_fee, 0) as application_fee,
      COALESCE(amount, 0) as amount,
      submitted_at,
      created_at,
      COALESCE(EXTRACT(YEAR FROM AGE(date_of_birth))::int, 0) as age,
      COALESCE(EXTRACT(DAY FROM NOW() - submitted_at)::int, 0) as days_since_submission
    FROM applications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, values);

  return sendSuccess(res, { 
    applications: result.rows,
    page,
    limit,
    hasMore: result.rows.length === limit
  });
}

/**
 * Handle versions action - Get/create application versions
 * NOTE: application_versions table does not exist — returns graceful empty responses
 */
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
