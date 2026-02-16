import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { getAuthUser } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
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

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // Get authenticated user (supports both cookie and Bearer token)
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  // Determine if user is admin (check role string directly for flexibility)
  const adminRoles = ['admin', 'super_admin', 'admissions_officer'];
  const isAdmin = adminRoles.includes(user.role);

  const action = req.query.action as string;
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

  let q;
  if (isAdmin) {
    q = ApplicationQueries.findAll();
  } else {
    q = ApplicationQueries.findByUserId(userId);
  }

  const result = await query<ApplicationRecord>(q.text, q.values);
  return sendSuccess(res, result.rows);
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

        const updateQ = ApplicationQueries.updateStatus(applicationId, status as ApplicationStatus, userId, notes);
        const updateResult = await query<ApplicationRecord>(updateQ.text, updateQ.values);

        // Create status history entry
        const historyQ = StatusHistoryQueries.create(applicationId, status as ApplicationStatus, userId, notes);
        await query(historyQ.text, historyQ.values);

        console.log('[applications] Status updated:', applicationId, status);
        return sendSuccess(res, updateResult.rows[0]);
      }

      if (action === 'update_payment_status') {
        const { paymentStatus } = payload;
        const validPaymentStatuses = ['pending_review', 'verified', 'rejected'];
        if (!validPaymentStatuses.includes(paymentStatus)) {
          return sendError(res, `Invalid payment status. Must be one of: ${validPaymentStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
        }

        const updateQ = ApplicationQueries.updatePaymentStatus(
          applicationId, 
          paymentStatus as PaymentStatus, 
          paymentStatus === 'verified' ? userId : null
        );
        const updateResult = await query<ApplicationRecord>(updateQ.text, updateQ.values);

        console.log('[applications] Payment status updated:', applicationId, paymentStatus);
        return sendSuccess(res, updateResult.rows[0]);
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
