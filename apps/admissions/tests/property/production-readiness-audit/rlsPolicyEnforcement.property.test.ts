/**
 * Property-Based Tests: RLS Policy Enforcement (Property 6)
 * Spec: production-readiness-audit
 * Task: 1.7
 *
 * **Property 6: RLS Policy Enforcement**
 *
 * *For any* authenticated user, database queries SHALL only return rows where
 * the user has access according to RLS policies — students see only their own
 * data, admins see all data, and service_role has full access.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9**
 *
 * This test models the RLS access control rules as pure functions and verifies
 * the properties hold for arbitrary user/role/resource combinations.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

const NUM_RUNS = 10;

// ============================================================================
// Types
// ============================================================================

type Role = 'super_admin' | 'admin' | 'reviewer' | 'student' | 'service_role';
type Operation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

interface AuthContext {
  userId: string;
  role: Role;
}

interface ProfileRow {
  id: string; // owner is the profile itself
}

interface ApplicationRow {
  id: string;
  user_id: string;
}

interface ApplicationDocumentRow {
  id: string;
  application_id: string;
  /** Resolved owner from the parent application */
  _resolved_user_id: string;
}

interface PaymentRow {
  id: string;
  application_id: string;
  /** Resolved owner from the parent application */
  _resolved_user_id: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
}

interface DeviceSessionRow {
  id: string;
  user_id: string;
}

// ============================================================================
// RLS Policy Model (pure functions)
// ============================================================================

/**
 * Profiles RLS:
 * - Owner (id = auth.uid()): full access to own row
 * - Admin/super_admin: read all
 * - Service role: full access
 * - Others: no access
 */
function canAccessProfile(ctx: AuthContext, row: ProfileRow, op: Operation): boolean {
  if (ctx.role === 'service_role') return true;
  if (row.id === ctx.userId) return true; // owner: full access
  if ((ctx.role === 'admin' || ctx.role === 'super_admin') && op === 'SELECT') return true;
  return false;
}

/**
 * Applications RLS:
 * - Owner (user_id = auth.uid()): full access to own rows
 * - Admin/super_admin: full access to all
 * - Reviewer: SELECT only
 * - Service role: full access
 */
function canAccessApplication(ctx: AuthContext, row: ApplicationRow, op: Operation): boolean {
  if (ctx.role === 'service_role') return true;
  if (row.user_id === ctx.userId) return true; // owner: full access
  if (ctx.role === 'admin' || ctx.role === 'super_admin') return true; // admin: full
  if (ctx.role === 'reviewer' && op === 'SELECT') return true;
  return false;
}

/**
 * Application Documents RLS:
 * - Owner (via applications.user_id): full access
 * - Admin/super_admin: full access
 * - Service role: full access
 */
function canAccessDocument(ctx: AuthContext, row: ApplicationDocumentRow, op: Operation): boolean {
  if (ctx.role === 'service_role') return true;
  if (row._resolved_user_id === ctx.userId) return true; // cascading ownership
  if (ctx.role === 'admin' || ctx.role === 'super_admin') return true;
  return false;
}

/**
 * Payments RLS:
 * - Owner (via applications.user_id): full access
 * - Admin/super_admin: full access
 * - Service role: full access
 */
function canAccessPayment(ctx: AuthContext, row: PaymentRow, op: Operation): boolean {
  if (ctx.role === 'service_role') return true;
  if (row._resolved_user_id === ctx.userId) return true; // cascading ownership
  if (ctx.role === 'admin' || ctx.role === 'super_admin') return true;
  return false;
}

/**
 * Notifications (in_app_notifications) RLS:
 * - Owner (user_id): SELECT only (read own notifications)
 * - Admin/super_admin: INSERT only (send system notifications)
 * - Service role: full access
 */
function canAccessNotification(ctx: AuthContext, row: NotificationRow, op: Operation): boolean {
  if (ctx.role === 'service_role') return true;
  if (row.user_id === ctx.userId && op === 'SELECT') return true; // owner: read only
  if ((ctx.role === 'admin' || ctx.role === 'super_admin') && op === 'INSERT') return true;
  return false;
}

/**
 * Device Sessions RLS:
 * - Owner (user_id): full access to own sessions
 * - Admin: no access (privacy)
 * - Service role: full access
 */
function canAccessDeviceSession(ctx: AuthContext, row: DeviceSessionRow, op: Operation): boolean {
  if (ctx.role === 'service_role') return true;
  if (row.user_id === ctx.userId) return true; // owner: full access
  // Admins have NO access to user device sessions
  return false;
}

// ============================================================================
// Generators
// ============================================================================

const uuidArb = fc.uuid();

const studentRoleArb: fc.Arbitrary<Role> = fc.constant('student' as Role);
const adminRoleArb: fc.Arbitrary<Role> = fc.constantFrom('admin' as Role, 'super_admin' as Role);
const serviceRoleArb: fc.Arbitrary<Role> = fc.constant('service_role' as Role);
const allRolesArb: fc.Arbitrary<Role> = fc.constantFrom(
  'super_admin' as Role, 'admin' as Role, 'reviewer' as Role, 'student' as Role
);
const operationArb: fc.Arbitrary<Operation> = fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE');

/** Generate an auth context with a specific role */
function authContextArb(roleArb: fc.Arbitrary<Role>): fc.Arbitrary<AuthContext> {
  return fc.record({ userId: uuidArb, role: roleArb });
}

/** Generate a profile row */
const profileRowArb: fc.Arbitrary<ProfileRow> = fc.record({ id: uuidArb });

/** Generate an application row */
const applicationRowArb: fc.Arbitrary<ApplicationRow> = fc.record({
  id: uuidArb,
  user_id: uuidArb,
});

/** Generate a document row with resolved owner */
const documentRowArb: fc.Arbitrary<ApplicationDocumentRow> = fc.record({
  id: uuidArb,
  application_id: uuidArb,
  _resolved_user_id: uuidArb,
});

/** Generate a payment row with resolved owner */
const paymentRowArb: fc.Arbitrary<PaymentRow> = fc.record({
  id: uuidArb,
  application_id: uuidArb,
  _resolved_user_id: uuidArb,
});

/** Generate a notification row */
const notificationRowArb: fc.Arbitrary<NotificationRow> = fc.record({
  id: uuidArb,
  user_id: uuidArb,
});

/** Generate a device session row */
const deviceSessionRowArb: fc.Arbitrary<DeviceSessionRow> = fc.record({
  id: uuidArb,
  user_id: uuidArb,
});

// ============================================================================
// Property 6: RLS Policy Enforcement
// ============================================================================

describe('Property 6: RLS Policy Enforcement', () => {

  // ==========================================================================
  // Req 3.1: Students see only their own data across all tables
  // ==========================================================================

  /**
   * **Validates: Requirements 3.1, 3.5, 3.6, 3.7, 3.8, 3.9**
   * Students must be denied access to rows they do not own.
   */
  describe('Student isolation — cannot access other users\' data', () => {
    it('PROPERTY: student cannot SELECT another user\'s profile', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          profileRowArb,
          (ctx, row) => {
            // Ensure the row belongs to a different user
            fc.pre(row.id !== ctx.userId);
            expect(canAccessProfile(ctx, row, 'SELECT')).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student cannot access another user\'s application (any operation)', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          applicationRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row.user_id !== ctx.userId);
            expect(canAccessApplication(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student cannot access another user\'s documents', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          documentRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row._resolved_user_id !== ctx.userId);
            expect(canAccessDocument(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student cannot access another user\'s payments', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          paymentRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row._resolved_user_id !== ctx.userId);
            expect(canAccessPayment(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student cannot read another user\'s notifications', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          notificationRowArb,
          (ctx, row) => {
            fc.pre(row.user_id !== ctx.userId);
            expect(canAccessNotification(ctx, row, 'SELECT')).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student cannot access another user\'s device sessions', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          deviceSessionRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row.user_id !== ctx.userId);
            expect(canAccessDeviceSession(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Req 3.2: Students CAN access their own data
  // ==========================================================================

  /**
   * **Validates: Requirements 3.2, 3.5, 3.6, 3.7, 3.8, 3.9**
   * Students must be able to access rows they own.
   */
  describe('Student self-access — can access own data', () => {
    it('PROPERTY: student can access own profile', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          operationArb,
          (ctx, op) => {
            const ownProfile: ProfileRow = { id: ctx.userId };
            expect(canAccessProfile(ctx, ownProfile, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student can access own applications', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          operationArb,
          (ctx, appId, op) => {
            const ownApp: ApplicationRow = { id: appId, user_id: ctx.userId };
            expect(canAccessApplication(ctx, ownApp, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student can access own documents (via application ownership)', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          uuidArb,
          operationArb,
          (ctx, docId, appId, op) => {
            const ownDoc: ApplicationDocumentRow = {
              id: docId,
              application_id: appId,
              _resolved_user_id: ctx.userId,
            };
            expect(canAccessDocument(ctx, ownDoc, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student can access own payments (via application ownership)', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          uuidArb,
          operationArb,
          (ctx, payId, appId, op) => {
            const ownPay: PaymentRow = {
              id: payId,
              application_id: appId,
              _resolved_user_id: ctx.userId,
            };
            expect(canAccessPayment(ctx, ownPay, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student can read own notifications', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          (ctx, notifId) => {
            const ownNotif: NotificationRow = { id: notifId, user_id: ctx.userId };
            expect(canAccessNotification(ctx, ownNotif, 'SELECT')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: student can manage own device sessions', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          operationArb,
          (ctx, sessionId, op) => {
            const ownSession: DeviceSessionRow = { id: sessionId, user_id: ctx.userId };
            expect(canAccessDeviceSession(ctx, ownSession, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Req 3.3: Admins see all data (with table-specific restrictions)
  // ==========================================================================

  /**
   * **Validates: Requirements 3.3, 3.5, 3.6, 3.7, 3.8, 3.9**
   * Admins have broad access but with table-specific restrictions.
   */
  describe('Admin access — broad access with restrictions', () => {
    it('PROPERTY: admin can read any profile', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          profileRowArb,
          (ctx, row) => {
            expect(canAccessProfile(ctx, row, 'SELECT')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin cannot UPDATE/DELETE another user\'s profile', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          profileRowArb,
          fc.constantFrom('UPDATE' as Operation, 'DELETE' as Operation),
          (ctx, row, op) => {
            fc.pre(row.id !== ctx.userId);
            expect(canAccessProfile(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin has full access to all applications', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          applicationRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessApplication(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin has full access to all documents', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          documentRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessDocument(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin has full access to all payments', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          paymentRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessPayment(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin can INSERT notifications (system notifications)', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          notificationRowArb,
          (ctx, row) => {
            expect(canAccessNotification(ctx, row, 'INSERT')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin cannot SELECT/UPDATE/DELETE notifications of other users', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          notificationRowArb,
          fc.constantFrom('SELECT' as Operation, 'UPDATE' as Operation, 'DELETE' as Operation),
          (ctx, row, op) => {
            fc.pre(row.user_id !== ctx.userId);
            expect(canAccessNotification(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin has NO access to user device sessions', () => {
      fc.assert(
        fc.property(
          authContextArb(adminRoleArb),
          deviceSessionRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row.user_id !== ctx.userId);
            expect(canAccessDeviceSession(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Service role: full access everywhere
  // ==========================================================================

  /**
   * **Validates: Requirements 3.1, 3.5, 3.6, 3.7, 3.8, 3.9**
   * Service role has unrestricted access to all tables.
   */
  describe('Service role — full unrestricted access', () => {
    it('PROPERTY: service_role can perform any operation on any profile', () => {
      fc.assert(
        fc.property(
          authContextArb(serviceRoleArb),
          profileRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessProfile(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: service_role can perform any operation on any application', () => {
      fc.assert(
        fc.property(
          authContextArb(serviceRoleArb),
          applicationRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessApplication(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: service_role can perform any operation on any document', () => {
      fc.assert(
        fc.property(
          authContextArb(serviceRoleArb),
          documentRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessDocument(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: service_role can perform any operation on any payment', () => {
      fc.assert(
        fc.property(
          authContextArb(serviceRoleArb),
          paymentRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessPayment(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: service_role can perform any operation on any notification', () => {
      fc.assert(
        fc.property(
          authContextArb(serviceRoleArb),
          notificationRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessNotification(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: service_role can perform any operation on any device session', () => {
      fc.assert(
        fc.property(
          authContextArb(serviceRoleArb),
          deviceSessionRowArb,
          operationArb,
          (ctx, row, op) => {
            expect(canAccessDeviceSession(ctx, row, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Cross-cutting: reviewer access is read-only on applications
  // ==========================================================================

  describe('Reviewer access — read-only on applications', () => {
    it('PROPERTY: reviewer can SELECT any application', () => {
      fc.assert(
        fc.property(
          authContextArb(fc.constant('reviewer' as Role)),
          applicationRowArb,
          (ctx, row) => {
            expect(canAccessApplication(ctx, row, 'SELECT')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: reviewer cannot INSERT/UPDATE/DELETE applications they don\'t own', () => {
      fc.assert(
        fc.property(
          authContextArb(fc.constant('reviewer' as Role)),
          applicationRowArb,
          fc.constantFrom('INSERT' as Operation, 'UPDATE' as Operation, 'DELETE' as Operation),
          (ctx, row, op) => {
            fc.pre(row.user_id !== ctx.userId);
            expect(canAccessApplication(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Notification write restriction for students
  // ==========================================================================

  describe('Notification write restrictions', () => {
    it('PROPERTY: student cannot INSERT/UPDATE/DELETE notifications', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          notificationRowArb,
          fc.constantFrom('INSERT' as Operation, 'UPDATE' as Operation, 'DELETE' as Operation),
          (ctx, row, op) => {
            // Even own notifications — students can only read
            expect(canAccessNotification(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Cascading ownership consistency
  // ==========================================================================

  /**
   * **Validates: Requirements 3.6, 3.7**
   * Document and payment access must be consistent with application ownership.
   */
  describe('Cascading ownership — documents and payments follow application owner', () => {
    it('PROPERTY: if student owns the application, they can access its documents', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          uuidArb,
          operationArb,
          (ctx, docId, appId, op) => {
            const doc: ApplicationDocumentRow = {
              id: docId,
              application_id: appId,
              _resolved_user_id: ctx.userId, // student owns the parent application
            };
            expect(canAccessDocument(ctx, doc, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: if student does NOT own the application, they cannot access its documents', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          documentRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row._resolved_user_id !== ctx.userId);
            expect(canAccessDocument(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: if student owns the application, they can access its payments', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          uuidArb,
          uuidArb,
          operationArb,
          (ctx, payId, appId, op) => {
            const pay: PaymentRow = {
              id: payId,
              application_id: appId,
              _resolved_user_id: ctx.userId,
            };
            expect(canAccessPayment(ctx, pay, op)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: if student does NOT own the application, they cannot access its payments', () => {
      fc.assert(
        fc.property(
          authContextArb(studentRoleArb),
          paymentRowArb,
          operationArb,
          (ctx, row, op) => {
            fc.pre(row._resolved_user_id !== ctx.userId);
            expect(canAccessPayment(ctx, row, op)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
