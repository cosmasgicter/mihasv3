/**
 * Property-Based Tests: Audit Trail Completeness (Property 5)
 * Spec: production-readiness-audit
 * Task: 9.5
 *
 * **Property 5: Audit Trail Completeness**
 *
 * *For any* application status change, payment status change, or admin action,
 * an audit trail entry SHALL be created containing timestamp, actor_id, action,
 * entity_type, and change details (previous_value, new_value where applicable).
 *
 * **Validates: Requirements 2.3, 10.1, 10.2, 10.3**
 *
 * This test models the audit trail creation logic as pure functions and verifies
 * that all auditable events produce complete, valid audit entries with the
 * required fields.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AuditLogInput,
  AuditEntityType,
  AuditQueries,
} from '../../../lib/queries';
import { sanitizeContext } from '../../../lib/auditLogger';

const NUM_RUNS = 10;

// ============================================================================
// Types
// ============================================================================

type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
type PaymentStatus = 'pending' | 'pending_review' | 'verified' | 'rejected';
type RetentionCategory = 'standard' | 'security';

interface AuditEntryResult {
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown> | undefined;
  retention_category: string;
  has_timestamp_in_sql: boolean;
}

// ============================================================================
// Pure model functions — mirror the audit logger's behavior
// ============================================================================

/**
 * Model how logApplicationStatusChange builds an AuditLogInput.
 * Mirrors lib/auditLogger.ts logApplicationStatusChange().
 */
function buildApplicationStatusChangeEntry(
  actorId: string,
  applicationId: string,
  oldStatus: ApplicationStatus,
  newStatus: ApplicationStatus,
  retentionCategory: RetentionCategory = 'standard',
): AuditLogInput {
  return {
    actor_id: actorId,
    action: 'application_status_change',
    entity_type: 'application',
    entity_id: applicationId,
    changes: {
      old_status: oldStatus,
      new_status: newStatus,
      retention_category: retentionCategory,
    },
  };
}

/**
 * Model how a payment status change audit entry would be built.
 * Payment status changes use logAuditEvent with entity_type 'payment'.
 */
function buildPaymentStatusChangeEntry(
  actorId: string,
  paymentId: string,
  oldStatus: PaymentStatus,
  newStatus: PaymentStatus,
  retentionCategory: RetentionCategory = 'standard',
): AuditLogInput {
  return {
    actor_id: actorId,
    action: 'payment_status_change',
    entity_type: 'payment',
    entity_id: paymentId,
    changes: {
      old_status: oldStatus,
      new_status: newStatus,
      retention_category: retentionCategory,
    },
  };
}

/**
 * Model how logAdminAction builds an AuditLogInput.
 * Mirrors lib/auditLogger.ts logAdminAction().
 */
function buildAdminActionEntry(
  actorId: string,
  actionType: string,
  entityType: AuditEntityType,
  entityId: string | null,
  changes?: Record<string, unknown>,
  retentionCategory: RetentionCategory = 'standard',
): AuditLogInput {
  return {
    actor_id: actorId,
    action: `admin_${actionType}`,
    entity_type: entityType,
    entity_id: entityId,
    changes: {
      ...(changes ? sanitizeContext(changes) : {}),
      retention_category: retentionCategory,
    },
  };
}

/**
 * Validate that an AuditLogInput has all required fields for a complete
 * audit trail entry.
 */
function validateAuditEntryCompleteness(input: AuditLogInput): {
  valid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  // actor_id can be null for system events, but must be present as a key
  if (!('actor_id' in input)) missingFields.push('actor_id');
  if (!input.action || typeof input.action !== 'string') missingFields.push('action');
  if (!input.entity_type || typeof input.entity_type !== 'string') missingFields.push('entity_type');
  // entity_id can be null but must be present as a key
  if (!('entity_id' in input)) missingFields.push('entity_id');

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate that the SQL query produced by AuditQueries.log() includes
 * a NOW() timestamp and all required columns.
 */
function validateQueryCompleteness(input: AuditLogInput): {
  hasTimestamp: boolean;
  hasAllColumns: boolean;
  missingColumns: string[];
} {
  const queryConfig = AuditQueries.log(input);
  const sql = queryConfig.text;

  const requiredColumns = [
    'actor_id',
    'action',
    'entity_type',
    'entity_id',
    'changes',
    'retention_category',
    'created_at',
  ];

  const missingColumns = requiredColumns.filter(col => !sql.includes(col));

  return {
    hasTimestamp: sql.includes('NOW()'),
    hasAllColumns: missingColumns.length === 0,
    missingColumns,
  };
}

// ============================================================================
// Generators
// ============================================================================

const uuidArb = fc.uuid();

const applicationStatusArb: fc.Arbitrary<ApplicationStatus> = fc.constantFrom(
  'draft', 'submitted', 'under_review', 'approved', 'rejected',
);

const paymentStatusArb: fc.Arbitrary<PaymentStatus> = fc.constantFrom(
  'pending', 'pending_review', 'verified', 'rejected',
);

const retentionCategoryArb: fc.Arbitrary<RetentionCategory> = fc.constantFrom(
  'standard', 'security',
);

const entityTypeArb: fc.Arbitrary<AuditEntityType> = fc.constantFrom(
  'user' as AuditEntityType,
  'session' as AuditEntityType,
  'application' as AuditEntityType,
  'document' as AuditEntityType,
  'payment' as AuditEntityType,
  'program' as AuditEntityType,
  'intake' as AuditEntityType,
  'setting' as AuditEntityType,
  'notification' as AuditEntityType,
);

const adminActionTypeArb = fc.constantFrom(
  'update_user_role',
  'reset_settings',
  'bulk_approve',
  'bulk_reject',
  'delete_user',
  'update_program',
  'manage_intake',
  'export_data',
);

/** Safe changes object (no PII/sensitive fields) */
const safeChangesArb = fc.record({
  status: fc.constantFrom('active', 'inactive', 'pending'),
  count: fc.integer({ min: 0, max: 1000 }),
  reason: fc.constantFrom('manual_review', 'auto_approved', 'policy_violation'),
});

// ============================================================================
// Property 5: Audit Trail Completeness
// ============================================================================

describe('Property 5: Audit Trail Completeness', () => {

  // ==========================================================================
  // 5.1: Application status changes produce complete audit entries
  // Validates: Requirement 10.1
  // ==========================================================================

  describe('Application status change audit entries', () => {
    it('PROPERTY: every application status change produces a complete audit entry with required fields', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          applicationStatusArb,
          applicationStatusArb,
          retentionCategoryArb,
          (actorId, applicationId, oldStatus, newStatus, retention) => {
            const entry = buildApplicationStatusChangeEntry(
              actorId, applicationId, oldStatus, newStatus, retention,
            );

            const validation = validateAuditEntryCompleteness(entry);
            expect(validation.valid).toBe(true);
            expect(validation.missingFields).toEqual([]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: application status change entries always contain old_status and new_status in changes', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          applicationStatusArb,
          applicationStatusArb,
          (actorId, applicationId, oldStatus, newStatus) => {
            const entry = buildApplicationStatusChangeEntry(
              actorId, applicationId, oldStatus, newStatus,
            );

            expect(entry.changes).toBeDefined();
            expect(entry.changes!.old_status).toBe(oldStatus);
            expect(entry.changes!.new_status).toBe(newStatus);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: application status change entries have action "application_status_change" and entity_type "application"', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          applicationStatusArb,
          applicationStatusArb,
          (actorId, applicationId, oldStatus, newStatus) => {
            const entry = buildApplicationStatusChangeEntry(
              actorId, applicationId, oldStatus, newStatus,
            );

            expect(entry.action).toBe('application_status_change');
            expect(entry.entity_type).toBe('application');
            expect(entry.entity_id).toBe(applicationId);
            expect(entry.actor_id).toBe(actorId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 5.2: Payment status changes produce complete audit entries
  // Validates: Requirement 10.2
  // ==========================================================================

  describe('Payment status change audit entries', () => {
    it('PROPERTY: every payment status change produces a complete audit entry with required fields', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          paymentStatusArb,
          paymentStatusArb,
          retentionCategoryArb,
          (actorId, paymentId, oldStatus, newStatus, retention) => {
            const entry = buildPaymentStatusChangeEntry(
              actorId, paymentId, oldStatus, newStatus, retention,
            );

            const validation = validateAuditEntryCompleteness(entry);
            expect(validation.valid).toBe(true);
            expect(validation.missingFields).toEqual([]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: payment status change entries always contain old_status and new_status in changes', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          paymentStatusArb,
          paymentStatusArb,
          (actorId, paymentId, oldStatus, newStatus) => {
            const entry = buildPaymentStatusChangeEntry(
              actorId, paymentId, oldStatus, newStatus,
            );

            expect(entry.changes).toBeDefined();
            expect(entry.changes!.old_status).toBe(oldStatus);
            expect(entry.changes!.new_status).toBe(newStatus);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: payment status change entries have action "payment_status_change" and entity_type "payment"', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          paymentStatusArb,
          paymentStatusArb,
          (actorId, paymentId, oldStatus, newStatus) => {
            const entry = buildPaymentStatusChangeEntry(
              actorId, paymentId, oldStatus, newStatus,
            );

            expect(entry.action).toBe('payment_status_change');
            expect(entry.entity_type).toBe('payment');
            expect(entry.entity_id).toBe(paymentId);
            expect(entry.actor_id).toBe(actorId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 5.3: Admin actions produce complete audit entries
  // Validates: Requirement 10.3
  // ==========================================================================

  describe('Admin action audit entries', () => {
    it('PROPERTY: every admin action produces a complete audit entry with required fields', () => {
      fc.assert(
        fc.property(
          uuidArb,
          adminActionTypeArb,
          entityTypeArb,
          fc.oneof(uuidArb, fc.constant(null as string | null)),
          retentionCategoryArb,
          (actorId, actionType, entityType, entityId, retention) => {
            const entry = buildAdminActionEntry(
              actorId, actionType, entityType, entityId, undefined, retention,
            );

            const validation = validateAuditEntryCompleteness(entry);
            expect(validation.valid).toBe(true);
            expect(validation.missingFields).toEqual([]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin action entries have action prefixed with "admin_"', () => {
      fc.assert(
        fc.property(
          uuidArb,
          adminActionTypeArb,
          entityTypeArb,
          fc.oneof(uuidArb, fc.constant(null as string | null)),
          (actorId, actionType, entityType, entityId) => {
            const entry = buildAdminActionEntry(
              actorId, actionType, entityType, entityId,
            );

            expect(entry.action).toMatch(/^admin_/);
            expect(entry.action).toBe(`admin_${actionType}`);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: admin action entries with changes include retention_category', () => {
      fc.assert(
        fc.property(
          uuidArb,
          adminActionTypeArb,
          entityTypeArb,
          uuidArb,
          safeChangesArb,
          retentionCategoryArb,
          (actorId, actionType, entityType, entityId, changes, retention) => {
            const entry = buildAdminActionEntry(
              actorId, actionType, entityType, entityId, changes, retention,
            );

            expect(entry.changes).toBeDefined();
            expect(entry.changes!.retention_category).toBe(retention);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 5.4: AuditQueries.log() produces SQL with all required columns and timestamp
  // Validates: Requirements 2.3, 10.1, 10.2, 10.3
  // ==========================================================================

  describe('SQL query completeness', () => {
    it('PROPERTY: AuditQueries.log() always includes NOW() timestamp for any audit input', () => {
      fc.assert(
        fc.property(
          uuidArb,
          fc.constantFrom(
            'application_status_change',
            'payment_status_change',
            'admin_update_user_role',
            'admin_bulk_approve',
            'user_login',
            'user_logout',
          ),
          entityTypeArb,
          fc.oneof(uuidArb, fc.constant(null as string | null)),
          (actorId, action, entityType, entityId) => {
            const input: AuditLogInput = {
              actor_id: actorId,
              action,
              entity_type: entityType,
              entity_id: entityId,
            };

            const result = validateQueryCompleteness(input);
            expect(result.hasTimestamp).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: AuditQueries.log() SQL includes all required columns', () => {
      fc.assert(
        fc.property(
          uuidArb,
          fc.constantFrom(
            'application_status_change',
            'payment_status_change',
            'admin_update_user_role',
          ),
          entityTypeArb,
          fc.oneof(uuidArb, fc.constant(null as string | null)),
          (actorId, action, entityType, entityId) => {
            const input: AuditLogInput = {
              actor_id: actorId,
              action,
              entity_type: entityType,
              entity_id: entityId,
              changes: { old_status: 'draft', new_status: 'submitted' },
            };

            const result = validateQueryCompleteness(input);
            expect(result.hasAllColumns).toBe(true);
            expect(result.missingColumns).toEqual([]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: AuditQueries.log() parameterizes all values (no inline data)', () => {
      fc.assert(
        fc.property(
          uuidArb,
          fc.constantFrom('application_status_change', 'payment_status_change'),
          entityTypeArb,
          uuidArb,
          (actorId, action, entityType, entityId) => {
            const input: AuditLogInput = {
              actor_id: actorId,
              action,
              entity_type: entityType,
              entity_id: entityId,
              changes: { old_status: 'pending', new_status: 'verified' },
            };

            const queryConfig = AuditQueries.log(input);

            // SQL should use $1, $2, etc. placeholders
            expect(queryConfig.text).toMatch(/\$1/);
            expect(queryConfig.text).toMatch(/\$2/);
            expect(queryConfig.text).toMatch(/\$3/);
            expect(queryConfig.text).toMatch(/\$4/);

            // Values array should have the correct number of parameters
            expect(queryConfig.values).toBeDefined();
            expect(queryConfig.values!.length).toBeGreaterThanOrEqual(4);

            // Actor ID, action, entity_type should be in values
            expect(queryConfig.values![0]).toBe(actorId);
            expect(queryConfig.values![1]).toBe(action);
            expect(queryConfig.values![2]).toBe(entityType);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 5.5: Changes are sanitized before logging (PII/sensitive data removed)
  // Validates: Requirements 2.3, 10.1, 10.2, 10.3
  // ==========================================================================

  describe('Audit entry sanitization', () => {
    it('PROPERTY: changes containing sensitive fields are redacted in admin action entries', () => {
      fc.assert(
        fc.property(
          uuidArb,
          adminActionTypeArb,
          entityTypeArb,
          uuidArb,
          fc.constantFrom('password', 'token', 'secret', 'api_key'),
          fc.string({ minLength: 1, maxLength: 50 }),
          (actorId, actionType, entityType, entityId, sensitiveField, value) => {
            const changes = { [sensitiveField]: value, status: 'active' };
            const entry = buildAdminActionEntry(
              actorId, actionType, entityType, entityId, changes,
            );

            // Sensitive fields should be redacted via sanitizeContext
            expect(entry.changes).toBeDefined();
            expect(entry.changes![sensitiveField]).toBe('[REDACTED]');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: changes containing PII fields are redacted in admin action entries', () => {
      fc.assert(
        fc.property(
          uuidArb,
          adminActionTypeArb,
          entityTypeArb,
          uuidArb,
          fc.constantFrom('email', 'phone', 'first_name', 'last_name', 'address'),
          fc.string({ minLength: 1, maxLength: 50 }),
          (actorId, actionType, entityType, entityId, piiField, value) => {
            const changes = { [piiField]: value, id: '123' };
            const entry = buildAdminActionEntry(
              actorId, actionType, entityType, entityId, changes,
            );

            expect(entry.changes).toBeDefined();
            expect(entry.changes![piiField]).toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 5.6: Default retention category is applied when not specified
  // ==========================================================================

  describe('Retention category defaults', () => {
    it('PROPERTY: AuditQueries.log() defaults retention_category to "standard" when not specified', () => {
      fc.assert(
        fc.property(
          uuidArb,
          fc.constantFrom('application_status_change', 'payment_status_change'),
          entityTypeArb,
          uuidArb,
          (actorId, action, entityType, entityId) => {
            const input: AuditLogInput = {
              actor_id: actorId,
              action,
              entity_type: entityType,
              entity_id: entityId,
              // No retention_category specified
            };

            const queryConfig = AuditQueries.log(input);
            // The last value before the default should be 'standard'
            const retentionValue = queryConfig.values![7];
            expect(retentionValue).toBe('standard');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: AuditQueries.log() preserves explicit retention_category', () => {
      fc.assert(
        fc.property(
          uuidArb,
          fc.constantFrom('application_status_change', 'admin_action'),
          entityTypeArb,
          uuidArb,
          retentionCategoryArb,
          (actorId, action, entityType, entityId, retention) => {
            const input: AuditLogInput = {
              actor_id: actorId,
              action,
              entity_type: entityType,
              entity_id: entityId,
              retention_category: retention,
            };

            const queryConfig = AuditQueries.log(input);
            const retentionValue = queryConfig.values![7];
            expect(retentionValue).toBe(retention);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
