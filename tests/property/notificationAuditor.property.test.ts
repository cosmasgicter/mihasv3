/**
 * Property-Based Tests: Notification Auditor - Trigger Identification
 * Feature: frontend-backend-forensic-audit
 * Task: 11.3 Write property test for notification trigger identification
 * 
 * **Property 18: Notification Trigger Identification**
 * 
 * *For any* notification trigger or email dispatch point in the codebase,
 * the Notification Auditor SHALL identify it with its delivery mechanism
 * and configuration.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.4**
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  scanNotificationTriggers,
  getNotificationTriggerSummary,
  identifyDuplicateRisks,
  identifyMissingIdempotency,
} from '../../scripts/audit/notification/triggerScanner';
import {
  scanEmailDispatches,
  getEmailDispatchSummary,
  identifyMissingRetry,
  identifyMissingDeduplication,
  identifyHighRiskDispatches,
} from '../../scripts/audit/notification/emailScanner';
import type { DeliveryMechanism } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Reduced for faster execution with file I/O.
 */
const NUM_RUNS = 10;

/**
 * Base temporary directory for test fixtures
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-notification');


// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid delivery mechanisms for notifications
 */
const deliveryMechanismArb = fc.constantFrom<DeliveryMechanism>('realtime', 'email', 'both');

/**
 * Valid notification event types
 */
const notificationEventArb = fc.constantFrom(
  'application_submitted',
  'application_approved',
  'payment_received',
  'document_uploaded',
  'status_update'
);

/**
 * Valid email template names
 */
const emailTemplateArb = fc.constantFrom(
  'Welcome to MIHAS',
  'Application Submitted',
  'Application Approved',
  'Payment Confirmation',
  'Interview Scheduled'
);

// ============================================================================
// Code Generators
// ============================================================================

/**
 * Generate Resend email send code
 */
function generateResendEmailCode(template: string, hasIdempotency: boolean): string {
  const idempotencyCode = hasIdempotency
    ? `const idempotencyKey = \`email-\${userId}-\${Date.now()}\`;`
    : '';
  return `
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
${idempotencyCode}
export async function sendEmail(userId: string, email: string) {
  await resend.emails.send({
    from: 'noreply@mihas.edu.zm',
    to: email,
    subject: '${template}',
    html: '<h2>${template}</h2><p>Content</p>'
  });
}
`;
}

/**
 * Generate toast notification code
 */
function generateToastCode(event: string): string {
  return `
import { useToastStore } from '@/stores/toastStore';

export function showNotification() {
  const { addToast } = useToastStore.getState();
  addToast({
    type: 'success',
    message: 'Notification for ${event}'
  });
}
`;
}

/**
 * Generate SSE broadcast code
 */
function generateSSEBroadcastCode(event: string, hasIdempotency: boolean): string {
  const idempotencyCode = hasIdempotency
    ? `const uniqueId = \`broadcast-\${Date.now()}\`;`
    : '';
  return `
import { broadcastToUser } from '@/lib/sse';
${idempotencyCode}
export async function notifyUser(userId: string) {
  await broadcastToUser(userId, {
    type: '${event}',
    data: { message: 'Update' }
  });
}
`;
}

/**
 * Generate email dispatch code with retry/dedup options
 */
function generateEmailDispatchCode(
  template: string,
  hasRetry: boolean,
  hasDeduplication: boolean
): string {
  const retryCode = hasRetry
    ? `let retries = 3;
  while (retries > 0) {
    try {`
    : '';
  const retryEndCode = hasRetry
    ? `break;
    } catch (e) {
      retries--;
      if (retries === 0) throw e;
    }
  }`
    : '';
  const dedupCode = hasDeduplication
    ? `const idempotencyKey = \`email-\${userId}-\${template}\`;`
    : '';

  return `
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(userId: string, email: string) {
  const template = '${template}';
  ${dedupCode}
  ${retryCode}
  await resend.emails.send({
    from: 'noreply@mihas.edu.zm',
    to: email,
    subject: '${template}',
    html: '<h2>${template}</h2><p>Content</p>'
  });
  ${retryEndCode}
}
`;
}


// ============================================================================
// Test Helpers
// ============================================================================

let testCounter = 0;

/**
 * Create a unique test directory for each test run
 */
async function createTestDir(): Promise<string> {
  const uniqueDir = join(TEST_FIXTURES_BASE, `test-${Date.now()}-${testCounter++}`);
  await mkdir(join(uniqueDir, 'api-src'), { recursive: true });
  await mkdir(join(uniqueDir, 'src', 'services'), { recursive: true });
  await mkdir(join(uniqueDir, 'lib'), { recursive: true });
  return uniqueDir;
}

/**
 * Clean up a test directory
 */
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Write a file to the api-src directory
 */
async function writeApiFile(testDir: string, filename: string, content: string): Promise<void> {
  await writeFile(join(testDir, 'api-src', filename), content, 'utf-8');
}

/**
 * Write a file to the src/services directory
 */
async function writeServiceFile(testDir: string, filename: string, content: string): Promise<void> {
  await writeFile(join(testDir, 'src', 'services', filename), content, 'utf-8');
}

/**
 * Write a file to the lib directory
 */
async function writeLibFile(testDir: string, filename: string, content: string): Promise<void> {
  await writeFile(join(testDir, 'lib', filename), content, 'utf-8');
}

// ============================================================================
// Global Setup/Teardown
// ============================================================================

beforeAll(async () => {
  // Ensure base directory exists
  await mkdir(TEST_FIXTURES_BASE, { recursive: true });
});

afterAll(async () => {
  // Clean up all test fixtures
  try {
    await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});


// ============================================================================
// Property Tests
// ============================================================================

describe('Property 18: Notification Trigger Identification', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.4**
   * 
   * WHEN the Audit_System examines notifications THEN it SHALL audit all notification triggers
   * WHEN the Audit_System examines notifications THEN it SHALL audit all delivery mechanisms
   * WHEN the Audit_System examines email THEN it SHALL verify dispatch mechanisms
   */

  // ==========================================================================
  // Notification Trigger Required Fields
  // ==========================================================================

  describe('All notification triggers have required fields', () => {
    it('PROPERTY: Every NotificationTrigger has event (non-empty string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              const content = generateResendEmailCode(event, hasIdempotency);
              await writeApiFile(testDir, 'email-trigger.ts', content);

              const result = await scanNotificationTriggers(testDir);

              for (const trigger of result.triggers) {
                expect(trigger.event).toBeDefined();
                expect(typeof trigger.event).toBe('string');
                expect(trigger.event.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every NotificationTrigger has filePath (non-empty string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          async (event) => {
            const testDir = await createTestDir();
            try {
              const content = generateToastCode(event);
              await writeServiceFile(testDir, 'toast-trigger.ts', content);

              const result = await scanNotificationTriggers(testDir);

              for (const trigger of result.triggers) {
                expect(trigger.filePath).toBeDefined();
                expect(typeof trigger.filePath).toBe('string');
                expect(trigger.filePath.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every NotificationTrigger has lineNumber (positive integer)', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              const content = generateSSEBroadcastCode(event, hasIdempotency);
              await writeLibFile(testDir, 'sse-trigger.ts', content);

              const result = await scanNotificationTriggers(testDir);

              for (const trigger of result.triggers) {
                expect(trigger.lineNumber).toBeDefined();
                expect(typeof trigger.lineNumber).toBe('number');
                expect(Number.isInteger(trigger.lineNumber)).toBe(true);
                expect(trigger.lineNumber).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every NotificationTrigger has valid deliveryMechanism', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              const content = generateResendEmailCode(event, hasIdempotency);
              await writeApiFile(testDir, 'mechanism-test.ts', content);

              const result = await scanNotificationTriggers(testDir);
              const validMechanisms: DeliveryMechanism[] = ['realtime', 'email', 'both'];

              for (const trigger of result.triggers) {
                expect(trigger.deliveryMechanism).toBeDefined();
                expect(validMechanisms).toContain(trigger.deliveryMechanism);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every NotificationTrigger has hasIdempotencyKey (boolean)', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              const content = generateResendEmailCode(event, hasIdempotency);
              await writeApiFile(testDir, 'idempotency-test.ts', content);

              const result = await scanNotificationTriggers(testDir);

              for (const trigger of result.triggers) {
                expect(typeof trigger.hasIdempotencyKey).toBe('boolean');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Email Dispatch Point Required Fields
  // ==========================================================================

  describe('All email dispatch points have required fields', () => {
    it('PROPERTY: Every EmailDispatchPoint has filePath (non-empty string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              const content = generateEmailDispatchCode(template, hasRetry, hasDedup);
              await writeApiFile(testDir, 'email-dispatch.ts', content);

              const result = await scanEmailDispatches(testDir);

              for (const dispatch of result.dispatchPoints) {
                expect(dispatch.filePath).toBeDefined();
                expect(typeof dispatch.filePath).toBe('string');
                expect(dispatch.filePath.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every EmailDispatchPoint has lineNumber (positive integer)', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              const content = generateEmailDispatchCode(template, hasRetry, hasDedup);
              await writeApiFile(testDir, 'email-line.ts', content);

              const result = await scanEmailDispatches(testDir);

              for (const dispatch of result.dispatchPoints) {
                expect(dispatch.lineNumber).toBeDefined();
                expect(typeof dispatch.lineNumber).toBe('number');
                expect(Number.isInteger(dispatch.lineNumber)).toBe(true);
                expect(dispatch.lineNumber).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every EmailDispatchPoint has template (string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              const content = generateEmailDispatchCode(template, hasRetry, hasDedup);
              await writeApiFile(testDir, 'email-template.ts', content);

              const result = await scanEmailDispatches(testDir);

              for (const dispatch of result.dispatchPoints) {
                expect(dispatch.template).toBeDefined();
                expect(typeof dispatch.template).toBe('string');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every EmailDispatchPoint has hasRetry (boolean)', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              const content = generateEmailDispatchCode(template, hasRetry, hasDedup);
              await writeApiFile(testDir, 'email-retry.ts', content);

              const result = await scanEmailDispatches(testDir);

              for (const dispatch of result.dispatchPoints) {
                expect(dispatch.hasRetry).toBeDefined();
                expect(typeof dispatch.hasRetry).toBe('boolean');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every EmailDispatchPoint has hasDeduplication (boolean)', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              const content = generateEmailDispatchCode(template, hasRetry, hasDedup);
              await writeApiFile(testDir, 'email-dedup.ts', content);

              const result = await scanEmailDispatches(testDir);

              for (const dispatch of result.dispatchPoints) {
                expect(dispatch.hasDeduplication).toBeDefined();
                expect(typeof dispatch.hasDeduplication).toBe('boolean');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Delivery Mechanism Classification
  // ==========================================================================

  describe('Delivery mechanisms are correctly classified', () => {
    it('PROPERTY: Resend email calls are classified as email delivery', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              const content = generateResendEmailCode(template, false);
              await writeApiFile(testDir, 'resend-email.ts', content);

              const result = await scanNotificationTriggers(testDir);
              const emailTriggers = result.triggers.filter(
                t => t.filePath.includes('resend-email.ts')
              );

              for (const trigger of emailTriggers) {
                expect(trigger.deliveryMechanism).toBe('email');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Toast notifications are classified as realtime delivery', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          async (event) => {
            const testDir = await createTestDir();
            try {
              const content = generateToastCode(event);
              await writeServiceFile(testDir, 'toast-notification.ts', content);

              const result = await scanNotificationTriggers(testDir);
              const toastTriggers = result.triggers.filter(
                t => t.filePath.includes('toast-notification.ts')
              );

              for (const trigger of toastTriggers) {
                expect(trigger.deliveryMechanism).toBe('realtime');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: SSE broadcast calls are classified as realtime delivery', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          async (event) => {
            const testDir = await createTestDir();
            try {
              const content = generateSSEBroadcastCode(event, false);
              await writeLibFile(testDir, 'sse-broadcast.ts', content);

              const result = await scanNotificationTriggers(testDir);
              const sseTriggers = result.triggers.filter(
                t => t.filePath.includes('sse-broadcast.ts')
              );

              for (const trigger of sseTriggers) {
                expect(trigger.deliveryMechanism).toBe('realtime');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Delivery mechanism is always one of the valid values', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              // Write multiple trigger types
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(event, hasIdempotency));
              await writeServiceFile(testDir, 'toast.ts', generateToastCode(event));
              await writeLibFile(testDir, 'sse.ts', generateSSEBroadcastCode(event, hasIdempotency));

              const result = await scanNotificationTriggers(testDir);
              const validMechanisms: DeliveryMechanism[] = ['realtime', 'email', 'both'];

              for (const trigger of result.triggers) {
                expect(validMechanisms).toContain(trigger.deliveryMechanism);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Summary Statistics
  // ==========================================================================

  describe('Summary statistics are accurate', () => {
    it('PROPERTY: Summary totalTriggers matches triggers array length', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'trigger1.ts', generateResendEmailCode(event, hasIdempotency));
              await writeServiceFile(testDir, 'trigger2.ts', generateToastCode(event));

              const result = await scanNotificationTriggers(testDir);
              const summary = getNotificationTriggerSummary(result);

              expect(summary.totalTriggers).toBe(result.triggers.length);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary byMechanism counts sum to totalTriggers', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(event, hasIdempotency));
              await writeServiceFile(testDir, 'toast.ts', generateToastCode(event));
              await writeLibFile(testDir, 'sse.ts', generateSSEBroadcastCode(event, hasIdempotency));

              const result = await scanNotificationTriggers(testDir);
              const summary = getNotificationTriggerSummary(result);

              const mechanismSum =
                summary.byMechanism.realtime +
                summary.byMechanism.email +
                summary.byMechanism.both;

              expect(mechanismSum).toBe(summary.totalTriggers);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Email dispatch summary totalDispatchPoints matches array length', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await scanEmailDispatches(testDir);
              const summary = getEmailDispatchSummary(result);

              expect(summary.totalDispatchPoints).toBe(result.dispatchPoints.length);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Email retry stats sum to totalDispatchPoints', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await scanEmailDispatches(testDir);
              const summary = getEmailDispatchSummary(result);

              const retrySum = summary.retryStats.with + summary.retryStats.without;
              expect(retrySum).toBe(summary.totalDispatchPoints);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Email deduplication stats sum to totalDispatchPoints', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await scanEmailDispatches(testDir);
              const summary = getEmailDispatchSummary(result);

              const dedupSum =
                summary.deduplicationStats.with + summary.deduplicationStats.without;
              expect(dedupSum).toBe(summary.totalDispatchPoints);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Risk Identification
  // ==========================================================================

  describe('Risk identification functions work correctly', () => {
    it('PROPERTY: identifyDuplicateRisks returns subset of triggers', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(event, hasIdempotency));

              const result = await scanNotificationTriggers(testDir);
              const risks = identifyDuplicateRisks(result.triggers);

              // Risks should be a subset of all triggers
              expect(risks.length).toBeLessThanOrEqual(result.triggers.length);

              // Every risk should be in the original triggers
              for (const risk of risks) {
                const found = result.triggers.some(
                  t => t.filePath === risk.filePath && t.lineNumber === risk.lineNumber
                );
                expect(found).toBe(true);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: identifyMissingIdempotency returns triggers without idempotency', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(event, hasIdempotency));

              const result = await scanNotificationTriggers(testDir);
              const missing = identifyMissingIdempotency(result.triggers);

              // All returned triggers should have hasIdempotencyKey = false
              for (const trigger of missing) {
                expect(trigger.hasIdempotencyKey).toBe(false);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: identifyMissingRetry returns dispatches without retry', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await scanEmailDispatches(testDir);
              const missing = identifyMissingRetry(result.dispatchPoints);

              // All returned dispatches should have hasRetry = false
              for (const dispatch of missing) {
                expect(dispatch.hasRetry).toBe(false);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: identifyMissingDeduplication returns dispatches without dedup', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await scanEmailDispatches(testDir);
              const missing = identifyMissingDeduplication(result.dispatchPoints);

              // All returned dispatches should have hasDeduplication = false
              for (const dispatch of missing) {
                expect(dispatch.hasDeduplication).toBe(false);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: identifyHighRiskDispatches returns dispatches missing both', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await scanEmailDispatches(testDir);
              const highRisk = identifyHighRiskDispatches(result.dispatchPoints);

              // All returned dispatches should have both hasRetry and hasDeduplication = false
              for (const dispatch of highRisk) {
                expect(dispatch.hasRetry).toBe(false);
                expect(dispatch.hasDeduplication).toBe(false);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge cases', () => {
    it('PROPERTY: Empty directory returns empty results', async () => {
      const testDir = await createTestDir();
      try {
        const triggerResult = await scanNotificationTriggers(testDir);
        const emailResult = await scanEmailDispatches(testDir);

        expect(triggerResult.triggers).toEqual([]);
        expect(emailResult.dispatchPoints).toEqual([]);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('PROPERTY: File with no notification triggers returns empty for that file', async () => {
      const testDir = await createTestDir();
      try {
        const content = `
export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;
`;
        await writeApiFile(testDir, 'no-notifications.ts', content);

        const result = await scanNotificationTriggers(testDir);
        const fileResults = result.triggers.filter(t =>
          t.filePath.includes('no-notifications.ts')
        );

        expect(fileResults).toEqual([]);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('PROPERTY: File with no email dispatches returns empty for that file', async () => {
      const testDir = await createTestDir();
      try {
        const content = `
export function processData(data: string): string {
  return data.toUpperCase();
}
`;
        await writeApiFile(testDir, 'no-emails.ts', content);

        const result = await scanEmailDispatches(testDir);
        const fileResults = result.dispatchPoints.filter(d =>
          d.filePath.includes('no-emails.ts')
        );

        expect(fileResults).toEqual([]);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('PROPERTY: Multiple files are all scanned', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(notificationEventArb, { minLength: 2, maxLength: 3 }),
          async (events) => {
            const testDir = await createTestDir();
            try {
              // Write each event to a different file
              for (let i = 0; i < events.length; i++) {
                await writeApiFile(testDir, `multi-${i}.ts`, generateResendEmailCode(events[i], false));
              }

              const result = await scanNotificationTriggers(testDir);

              // Should have results
              expect(result.triggers.length).toBeGreaterThan(0);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Results are sorted by file path and line number', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(notificationEventArb, { minLength: 2, maxLength: 3 }),
          async (events) => {
            const testDir = await createTestDir();
            try {
              for (let i = 0; i < events.length; i++) {
                await writeApiFile(testDir, `sorted-${i}.ts`, generateResendEmailCode(events[i], false));
              }

              const result = await scanNotificationTriggers(testDir);

              // Check sorting
              for (let i = 1; i < result.triggers.length; i++) {
                const prev = result.triggers[i - 1];
                const curr = result.triggers[i];

                const pathCompare = prev.filePath.localeCompare(curr.filePath);
                if (pathCompare === 0) {
                  // Same file, line numbers should be in order
                  expect(curr.lineNumber).toBeGreaterThanOrEqual(prev.lineNumber);
                } else {
                  // Different files, should be sorted by path
                  expect(pathCompare).toBeLessThanOrEqual(0);
                }
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
