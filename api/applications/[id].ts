import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * Fetch application with related data
 */
async function fetchApplicationDetails(id: string, include?: string) {
  const { data: application, error } = await supabaseAdmin
    .from('applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!application) return null;

  const result: Record<string, unknown> = { ...application };
  const includes = include ? include.split(',') : ['grades', 'documents', 'statusHistory'];

  // Fetch grades with subject names
  const { data: grades } = await supabaseAdmin
    .from('application_grades')
    .select('id, grade, subject_id')
    .eq('application_id', id);

  if (grades?.length) {
    const subjectIds = [...new Set(grades.map((g) => g.subject_id))];
    const { data: subjects } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .in('id', subjectIds);

    const subjectNames = subjects?.reduce(
      (acc, s) => ({ ...acc, [s.id]: s.name }),
      {} as Record<string, string>
    ) || {};

    result.grades = grades.map((g) => ({
      ...g,
      subject_name: subjectNames[g.subject_id] || 'Unknown',
    }));
  } else {
    result.grades = [];
  }

  if (includes.includes('documents')) {
    const { data: documents } = await supabaseAdmin
      .from('application_documents')
      .select('*')
      .eq('application_id', id);
    result.documents = documents || [];
  }

  if (includes.includes('statusHistory')) {
    const { data: statusHistory } = await supabaseAdmin
      .from('application_status_history')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false });
    result.statusHistory = statusHistory || [];
  }

  return result;
}


/**
 * GET/PUT/PATCH/DELETE /api/applications/[id]
 * Application CRUD operations
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const { id } = req.query;
  const applicationId = Array.isArray(id) ? id[0] : id;

  if (!applicationId) {
    return sendError(res, 'Application ID required', HttpStatus.BAD_REQUEST);
  }

  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    // GET - Fetch application details
    if (req.method === 'GET') {
      // Check access for non-admins
      if (!auth.isAdmin) {
        const { data: app } = await supabaseAdmin
          .from('applications')
          .select('user_id')
          .eq('id', applicationId)
          .single();

        if (!app || app.user_id !== auth.user.id) {
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

    // DELETE - Remove application
    if (req.method === 'DELETE') {
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('user_id, status')
        .eq('id', applicationId)
        .maybeSingle();

      if (!app) {
        return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
      }

      if (app.user_id !== auth.user.id && !auth.isAdmin) {
        return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
      }

      const { error } = await supabaseAdmin
        .from('applications')
        .delete()
        .eq('id', applicationId);

      if (error) {
        return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      }

      console.log('[applications] Deleted application:', applicationId);
      return sendSuccess(res, { deleted: true });
    }

    // PUT/PATCH - Update application
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('user_id, status, payment_status')
        .eq('id', applicationId)
        .single();

      if (!app || (app.user_id !== auth.user.id && !auth.isAdmin)) {
        return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
      }

      const body = req.body;

      // Handle PATCH actions
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

          const { data, error } = await supabaseAdmin
            .from('applications')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', applicationId)
            .select()
            .single();

          if (error) throw new Error(error.message);

          // Record status history
          await supabaseAdmin.from('application_status_history').insert({
            application_id: applicationId,
            status,
            changed_by: auth.user.id,
            notes: notes || null,
            created_at: new Date().toISOString(),
          });

          console.log('[applications] Status updated:', applicationId, status);
          return sendSuccess(res, data);
        }

        if (action === 'update_payment_status') {
          const { paymentStatus } = payload;
          const validPaymentStatuses = ['pending_review', 'verified', 'rejected'];

          if (!validPaymentStatuses.includes(paymentStatus)) {
            return sendError(res, `Invalid payment status. Must be one of: ${validPaymentStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
          }

          const updateData: Record<string, unknown> = {
            payment_status: paymentStatus,
            updated_at: new Date().toISOString(),
            payment_verified_by: auth.user.id,
          };

          if (paymentStatus === 'verified') {
            updateData.payment_verified_at = new Date().toISOString();
          }

          const { data, error } = await supabaseAdmin
            .from('applications')
            .update(updateData)
            .eq('id', applicationId)
            .select()
            .single();

          if (error) throw new Error(error.message);

          console.log('[applications] Payment status updated:', applicationId, paymentStatus);
          return sendSuccess(res, data);
        }

        if (action === 'sync_grades') {
          const { grades } = payload;
          if (!Array.isArray(grades)) {
            return sendError(res, 'Grades must be an array', HttpStatus.BAD_REQUEST);
          }

          // Delete existing grades
          await supabaseAdmin.from('application_grades').delete().eq('application_id', applicationId);

          // Insert new grades
          if (grades.length > 0) {
            const gradesData = grades.map((g: { subject_id: string; grade: string }) => ({
              application_id: applicationId,
              subject_id: g.subject_id,
              grade: g.grade,
            }));

            const { error: insertError } = await supabaseAdmin.from('application_grades').insert(gradesData);
            if (insertError) throw new Error(insertError.message);
          }

          console.log('[applications] Grades synced:', applicationId);
          return sendSuccess(res, { synced: true });
        }
      }

      // Regular update
      const { data, error } = await supabaseAdmin
        .from('applications')
        .update(body)
        .eq('id', applicationId)
        .select()
        .single();

      if (error) {
        return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      }

      return sendSuccess(res, data);
    }

    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, 'applications/[id]');
  }
}
