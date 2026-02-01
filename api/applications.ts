import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './utils/cors';
import { query } from './utils/db';
import { getAuthUser } from './utils/auth_middleware';
import { withArcjetProtection } from './utils/arcjet';
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
} from './utils/queries';
import { handleError, sendSuccess, sendError, HttpStatus } from './utils/errorHandler';

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
    if (action === 'details') return handleDetails(req, res, user.userId, isAdmin);
    if (action === 'documents') return handleDocuments(res);
    if (action === 'grades') return handleGrades(res);
    if (action === 'summary') return handleSummary(res);
    if (action === 'review') return handleReview(req, res, user.userId, isAdmin);

    // Handle CRUD by ID
    if (id) return handleById(req, res, user.userId, isAdmin, id);

    // Default: list applications
    if (req.method === 'GET') return handleDetails(req, res, user.userId, isAdmin);

    return sendError(res, 'Invalid request', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'applications');
  }
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

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
