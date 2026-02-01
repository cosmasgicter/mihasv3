/**
 * Ownership Check Utilities
 * 
 * These functions replace Supabase RLS policies with API-level ownership checks.
 * All checks are performed in the API middleware layer before database operations.
 * 
 * @see migrations/RLS_REPLACEMENT.md for the full mapping
 */

import { query } from './db';

/**
 * Roles that have admin-level access
 */
const ADMIN_ROLES = ['admin', 'super_admin'] as const;
const REVIEWER_ROLES = ['admin', 'super_admin', 'reviewer'] as const;

type AdminRole = typeof ADMIN_ROLES[number];
type ReviewerRole = typeof REVIEWER_ROLES[number];

/**
 * Check if user has admin role
 */
export function isAdmin(role: string): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

/**
 * Check if user has reviewer role (can view applications)
 */
export function isReviewer(role: string): role is ReviewerRole {
  return REVIEWER_ROLES.includes(role as ReviewerRole);
}

/**
 * Check if user owns their own profile
 * Replaces RLS: auth.uid() = id
 */
export function checkProfileOwnership(userId: string, profileId: string): boolean {
  return userId === profileId;
}

/**
 * Check if user can access an application
 * Replaces RLS: auth.uid() = user_id OR is_admin_user()
 * 
 * @param userId - The authenticated user's ID
 * @param applicationId - The application ID to check
 * @param userRole - The user's role
 * @returns true if user can access the application
 */
export async function checkApplicationOwnership(
  userId: string,
  applicationId: string,
  userRole: string
): Promise<boolean> {
  // Admins and reviewers can access all applications
  if (isReviewer(userRole)) {
    return true;
  }

  // Students can only access their own applications
  try {
    const result = await query<{ user_id: string }>(
      'SELECT user_id FROM applications WHERE id = $1',
      [applicationId]
    );

    if (result.rows.length === 0) {
      return false; // Application doesn't exist
    }

    return result.rows[0].user_id === userId;
  } catch {
    return false;
  }
}

/**
 * Check if user can modify an application
 * Only owners can modify, admins can update status
 * 
 * @param userId - The authenticated user's ID
 * @param applicationId - The application ID to check
 * @param userRole - The user's role
 * @param isStatusUpdate - Whether this is a status update (admin only)
 * @returns true if user can modify the application
 */
export async function checkApplicationModifyAccess(
  userId: string,
  applicationId: string,
  userRole: string,
  isStatusUpdate: boolean = false
): Promise<boolean> {
  // Status updates are admin-only
  if (isStatusUpdate) {
    return isAdmin(userRole);
  }

  // Admins can modify any application
  if (isAdmin(userRole)) {
    return true;
  }

  // Students can only modify their own applications
  try {
    const result = await query<{ user_id: string; status: string }>(
      'SELECT user_id, status FROM applications WHERE id = $1',
      [applicationId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const app = result.rows[0];
    
    // Can only modify own applications
    if (app.user_id !== userId) {
      return false;
    }

    // Can only modify draft applications
    if (app.status !== 'draft') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user can access a document
 * Replaces RLS: auth.uid() = (SELECT user_id FROM applications WHERE id = application_id)
 * 
 * @param userId - The authenticated user's ID
 * @param documentId - The document ID to check
 * @param userRole - The user's role
 * @returns true if user can access the document
 */
export async function checkDocumentOwnership(
  userId: string,
  documentId: string,
  userRole: string
): Promise<boolean> {
  // Admins and reviewers can access all documents
  if (isReviewer(userRole)) {
    return true;
  }

  // Students can only access documents from their own applications
  try {
    const result = await query<{ user_id: string }>(
      `SELECT a.user_id 
       FROM application_documents d
       JOIN applications a ON a.id = d.application_id
       WHERE d.id = $1`,
      [documentId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].user_id === userId;
  } catch {
    return false;
  }
}

/**
 * Check if user can access a document by application ID
 * Used when uploading documents to an application
 */
export async function checkDocumentUploadAccess(
  userId: string,
  applicationId: string,
  userRole: string
): Promise<boolean> {
  // Admins can upload to any application
  if (isAdmin(userRole)) {
    return true;
  }

  // Students can only upload to their own applications
  return checkApplicationOwnership(userId, applicationId, userRole);
}

/**
 * Check if user owns a session
 * Replaces RLS: auth.uid() = user_id
 */
export function checkSessionOwnership(userId: string, sessionUserId: string): boolean {
  return userId === sessionUserId;
}

/**
 * Check if user can access notifications
 * Users can only access their own notifications
 */
export function checkNotificationOwnership(userId: string, notificationUserId: string): boolean {
  return userId === notificationUserId;
}

/**
 * Check if user can access audit logs
 * Only admins can view audit logs
 */
export function checkAuditLogAccess(userRole: string): boolean {
  return isAdmin(userRole);
}

/**
 * Check if user can access a draft
 * Users can only access their own drafts
 */
export async function checkDraftOwnership(
  userId: string,
  draftId: string
): Promise<boolean> {
  try {
    const result = await query<{ user_id: string }>(
      'SELECT user_id FROM application_drafts WHERE id = $1',
      [draftId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].user_id === userId;
  } catch {
    return false;
  }
}

/**
 * Check if user can access payment records
 * Users can access their own payments, admins can access all
 */
export async function checkPaymentOwnership(
  userId: string,
  paymentId: string,
  userRole: string
): Promise<boolean> {
  if (isAdmin(userRole)) {
    return true;
  }

  try {
    const result = await query<{ user_id: string }>(
      'SELECT user_id FROM payments WHERE id = $1',
      [paymentId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].user_id === userId;
  } catch {
    return false;
  }
}
