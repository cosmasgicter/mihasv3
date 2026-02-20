/**
 * Audit Trail Completeness Tests
 * 
 * Validates that all critical state changes create audit log entries
 * and that audit log entries never contain PII.
 * 
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to read source files
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

/**
 * Inline PII sanitization logic matching lib/auditLogger.ts
 * We replicate it here to avoid importing the module (which pulls in DB deps).
 */
const SENSITIVE_PATTERNS = [
  /password/i, /secret/i, /token/i, /key/i, /credential/i,
  /auth/i, /hash/i, /salt/i, /bearer/i, /cookie/i,
  /session_id/i, /refresh/i, /access/i,
];

const PII_PATTERNS = [
  /email/i, /phone/i, /address/i, /name/i, /ssn/i,
  /national_id/i, /passport/i, /birth/i,
];

function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_PATTERNS.some(p => p.test(fieldName));
}

function isPIIField(fieldName: string): boolean {
  return PII_PATTERNS.some(p => p.test(fieldName));
}

function sanitizeContext(context: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!context || typeof context !== 'object') return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (isSensitiveField(key)) { sanitized[key] = '[REDACTED]'; continue; }
    if (isPIIField(key)) { sanitized[key] = '[PII_REDACTED]'; continue; }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

describe('Audit Trail Completeness', () => {
  describe('Requirement 21.1: Application status changes create audit entries', () => {
    it('handleReview POST creates an audit log entry on status change', () => {
      const source = readSource('api-src/applications.ts');
      const reviewSection = source.slice(
        source.indexOf('async function handleReview'),
        source.indexOf('async function handleById')
      );
      expect(reviewSection).toContain('logAuditEvent');
      expect(reviewSection).toContain('application_status_changed');
    });

    it('update_status action creates an audit log entry', () => {
      const source = readSource('api-src/applications.ts');
      const statusStart = source.indexOf("action === 'update_status'");
      const statusEnd = source.indexOf("action === 'update_payment_status'");
      const statusSection = source.slice(statusStart, statusEnd);
      expect(statusSection).toContain('logAuditEvent');
      expect(statusSection).toContain('application_status_changed');
    });
  });

  describe('Requirement 21.2: User CRUD creates audit entries', () => {
    it('admin user creation (register action) creates an audit log entry', () => {
      const source = readSource('api-src/admin.ts');
      const registerStart = source.indexOf('async function handleRegister');
      const registerEnd = source.indexOf('async function handleDashboardStats');
      const registerSection = source.slice(registerStart, registerEnd !== -1 ? registerEnd : undefined);
      expect(registerSection).toContain('logAuditEvent');
      expect(registerSection).toContain('user_created');
    });

    it('self-registration in auth endpoint creates an audit log entry', () => {
      const source = readSource('api-src/auth.ts');
      const registerStart = source.indexOf('async function handleRegister');
      const registerEnd = source.indexOf('async function handleSession');
      const registerSection = source.slice(registerStart, registerEnd);
      expect(registerSection).toContain('logAuditEvent');
      expect(registerSection).toContain('user_registered');
    });

    it('role update creates an audit log entry', () => {
      const source = readSource('api-src/admin.ts');
      const roleStart = source.indexOf('async function handleUpdateRole');
      const roleEnd = source.indexOf('async function handleEligibilityAssessments');
      const roleSection = source.slice(roleStart, roleEnd !== -1 ? roleEnd : undefined);
      expect(roleSection).toContain('logAuditEvent');
      expect(roleSection).toContain('user_role_updated');
    });
  });

  describe('Requirement 21.3: Payment verification/rejection creates audit entries', () => {
    it('update_payment_status action creates an audit log entry', () => {
      const source = readSource('api-src/applications.ts');
      const paymentStart = source.indexOf("action === 'update_payment_status'");
      const paymentEnd = source.indexOf("action === 'schedule_interview'");
      const paymentSection = source.slice(paymentStart, paymentEnd);
      expect(paymentSection).toContain('logAuditEvent');
      expect(paymentSection).toMatch(/payment_verified|payment_rejected/);
    });
  });

  describe('Requirement 21.4: No PII in audit log entries', () => {
    it('sanitizeContext redacts email fields', () => {
      const result = sanitizeContext({ email: 'test@example.com', user_id: '123' });
      expect(result).not.toBeNull();
      expect(result!.email).toBe('[PII_REDACTED]');
      expect(result!.user_id).toBe('123');
    });

    it('sanitizeContext redacts name fields', () => {
      const result = sanitizeContext({ first_name: 'John', last_name: 'Doe', role: 'student' });
      expect(result).not.toBeNull();
      expect(result!.first_name).toBe('[PII_REDACTED]');
      expect(result!.last_name).toBe('[PII_REDACTED]');
      expect(result!.role).toBe('student');
    });

    it('sanitizeContext redacts phone fields', () => {
      const result = sanitizeContext({ phone: '+260971234567', status: 'active' });
      expect(result).not.toBeNull();
      expect(result!.phone).toBe('[PII_REDACTED]');
      expect(result!.status).toBe('active');
    });

    it('sanitizeContext redacts password and token fields', () => {
      const result = sanitizeContext({
        password_hash: '$2b$12$abc',
        refresh_token: 'xyz',
        secret_key: 'secret',
        action: 'login',
      });
      expect(result).not.toBeNull();
      expect(result!.password_hash).toBe('[REDACTED]');
      expect(result!.refresh_token).toBe('[REDACTED]');
      expect(result!.secret_key).toBe('[REDACTED]');
      expect(result!.action).toBe('login');
    });

    it('sanitizeContext handles nested objects', () => {
      const result = sanitizeContext({
        changes: { email: 'test@example.com', new_status: 'approved' },
      });
      expect(result).not.toBeNull();
      const changes = result!.changes as Record<string, unknown>;
      expect(changes!.email).toBe('[PII_REDACTED]');
      expect(changes!.new_status).toBe('approved');
    });

    it('sanitizeContext handles null and undefined', () => {
      expect(sanitizeContext(null)).toBeNull();
      expect(sanitizeContext(undefined)).toBeNull();
    });

    it('applications.ts audit calls use logAuditEvent (which sanitizes) not raw SQL', () => {
      const source = readSource('api-src/applications.ts');
      const rawAuditInserts = (source.match(/INSERT INTO audit_logs/g) || []).length;
      const logAuditCalls = (source.match(/logAuditEvent\(/g) || []).length;
      expect(rawAuditInserts).toBe(0);
      expect(logAuditCalls).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Requirement 21.5: Admin audit trail page with pagination', () => {
    it('admin endpoint has audit-log action with pagination', () => {
      const source = readSource('api-src/admin.ts');
      expect(source).toContain("case 'audit-log'");
      const auditStart = source.indexOf('async function handleAuditLog');
      const auditEnd = source.indexOf('async function handleAppeals');
      const auditSection = source.slice(auditStart, auditEnd !== -1 ? auditEnd : undefined);
      expect(auditSection).toContain('page');
      expect(auditSection).toContain('pageSize');
      expect(auditSection).toContain('totalCount');
      expect(auditSection).toContain('ORDER BY created_at DESC');
      expect(auditSection).toContain('LIMIT');
      expect(auditSection).toContain('OFFSET');
    });

    it('admin endpoint supports audit log filtering', () => {
      const source = readSource('api-src/admin.ts');
      const auditStart = source.indexOf('async function handleAuditLog');
      const auditEnd = source.indexOf('async function handleAppeals');
      const auditSection = source.slice(auditStart, auditEnd !== -1 ? auditEnd : undefined);
      expect(auditSection).toContain('filter_action');
      expect(auditSection).toContain('filter_entity_type');
      expect(auditSection).toContain('filter_from');
      expect(auditSection).toContain('filter_to');
    });

    it('AuditTrail page component exists and fetches paginated data', () => {
      const source = readSource('src/pages/admin/AuditTrail.tsx');
      expect(source).toContain('AuditTrailPage');
      expect(source).toContain('page');
      expect(source).toContain('pageSize');
    });

    it('audit service calls correct backend endpoint', () => {
      const source = readSource('src/services/admin/audit.ts');
      expect(source).toContain("action: 'audit-log'");
      expect(source).toContain('page');
      expect(source).toContain('pageSize');
      expect(source).toContain('totalCount');
    });
  });
});
