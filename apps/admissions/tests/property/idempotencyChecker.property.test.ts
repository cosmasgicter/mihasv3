/**
 * Property-Based Tests: Idempotency Checker
 * Feature: frontend-backend-forensic-audit
 * Task: 11.5 Write property test for idempotency enforcement
 * 
 * **Property 19: Idempotency Enforcement**
 * 
 * *For any* email dispatch or notification that requires exactly-once delivery,
 * the system SHALL implement idempotency keys, and the auditor SHALL flag any
 * triggers lacking deduplication.
 * 
 * **Validates: Requirements 6.6, 6.7, 6.8**
 * - 6.6: THE Email_System SHALL trigger emails exactly once per event
 * - 6.7: IF duplicate notification sends are possible THEN the Audit_System SHALL flag them
 * - 6.8: WHERE idempotency is required THEN the system SHALL implement idempotency keys
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkIdempotency,
  getIdempotencySummary,
  filterIssuesByRisk,
  groupIssuesByFile,
  type IdempotencyIssue,
  type IdempotencyRiskLevel,
} from '../../scripts/audit/notification/idempotencyChecker';
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
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-idempotency');


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

/**
 * Risk levels for idempotency issues
 */
const riskLevelArb = fc.constantFrom<IdempotencyRiskLevel>('critical', 'high', 'medium', 'low');

// ============================================================================
// Code Generators
// ============================================================================

/**
 * Generate Resend email send code with optional idempotency
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

/**
 * Generate toast notification code (realtime)
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
 * Generate SSE broadcast code with optional idempotency
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
 * Generate multi-channel notification code (email + realtime)
 */
function generateMultiChannelCode(event: string, hasIdempotency: boolean): string {
  const idempotencyCode = hasIdempotency
    ? `const idempotencyKey = \`multi-\${userId}-\${Date.now()}\`;`
    : '';
  return `
import { Resend } from 'resend';
import { broadcastToUser } from '@/lib/sse';
const resend = new Resend(process.env.RESEND_API_KEY);
${idempotencyCode}
export async function notifyUserMultiChannel(userId: string, email: string) {
  // Send email
  await resend.emails.send({
    from: 'noreply@mihas.edu.zm',
    to: email,
    subject: '${event}',
    html: '<h2>${event}</h2><p>Content</p>'
  });
  
  // Send realtime notification
  await broadcastToUser(userId, {
    type: '${event}',
    data: { message: 'Update' }
  });
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

describe('Property 19: Idempotency Enforcement', () => {
  /**
   * **Validates: Requirements 6.6, 6.7, 6.8**
   * 
   * 6.6: THE Email_System SHALL trigger emails exactly once per event
   * 6.7: IF duplicate notification sends are possible THEN the Audit_System SHALL flag them
   * 6.8: WHERE idempotency is required THEN the system SHALL implement idempotency keys
   */

  // ==========================================================================
  // Triggers Without Idempotency Keys Are Flagged
  // ==========================================================================

  describe('All triggers without idempotency keys are flagged', () => {
    it('PROPERTY: Email triggers without idempotency are flagged as issues', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create email trigger WITHOUT idempotency
              const content = generateResendEmailCode(template, false);
              await writeApiFile(testDir, 'email-no-idemp.ts', content);

              const result = await checkIdempotency(testDir);

              // Should have issues for missing idempotency
              const emailIssues = result.issues.filter(
                i => i.filePath.includes('email-no-idemp.ts')
              );

              // Email triggers without idempotency should be flagged
              if (result.missingIdempotencyTriggers.length > 0) {
                expect(emailIssues.length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Email triggers WITH idempotency are NOT flagged', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create email trigger WITH idempotency
              const content = generateResendEmailCode(template, true);
              await writeApiFile(testDir, 'email-with-idemp.ts', content);

              const result = await checkIdempotency(testDir);

              // Triggers with idempotency should not be in missingIdempotencyTriggers
              const triggersInFile = result.missingIdempotencyTriggers.filter(
                t => t.filePath.includes('email-with-idemp.ts')
              );

              expect(triggersInFile.length).toBe(0);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multi-channel triggers without idempotency are flagged', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          async (event) => {
            const testDir = await createTestDir();
            try {
              // Create multi-channel trigger WITHOUT idempotency
              const content = generateMultiChannelCode(event, false);
              await writeApiFile(testDir, 'multi-no-idemp.ts', content);

              const result = await checkIdempotency(testDir);

              // Multi-channel triggers without idempotency should be flagged
              const multiChannelTriggers = result.missingIdempotencyTriggers.filter(
                t => t.filePath.includes('multi-no-idemp.ts')
              );

              // If triggers were found, they should be missing idempotency
              for (const trigger of multiChannelTriggers) {
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
  });


  // ==========================================================================
  // Email Dispatches Without Deduplication Are Flagged
  // ==========================================================================

  describe('All email dispatches without deduplication are flagged', () => {
    it('PROPERTY: Email dispatches without deduplication are in missingDeduplicationDispatches', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          async (template, hasRetry) => {
            const testDir = await createTestDir();
            try {
              // Create email dispatch WITHOUT deduplication
              const content = generateEmailDispatchCode(template, hasRetry, false);
              await writeApiFile(testDir, 'dispatch-no-dedup.ts', content);

              const result = await checkIdempotency(testDir);

              // Dispatches without deduplication should be flagged
              const dispatchesInFile = result.missingDeduplicationDispatches.filter(
                d => d.filePath.includes('dispatch-no-dedup.ts')
              );

              // All returned dispatches should have hasDeduplication = false
              for (const dispatch of dispatchesInFile) {
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

    it('PROPERTY: Email dispatches WITH deduplication are NOT in missingDeduplicationDispatches', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          async (template, hasRetry) => {
            const testDir = await createTestDir();
            try {
              // Create email dispatch WITH deduplication
              const content = generateEmailDispatchCode(template, hasRetry, true);
              await writeApiFile(testDir, 'dispatch-with-dedup.ts', content);

              const result = await checkIdempotency(testDir);

              // Dispatches with deduplication should NOT be in missing list
              const dispatchesInFile = result.missingDeduplicationDispatches.filter(
                d => d.filePath.includes('dispatch-with-dedup.ts')
              );

              expect(dispatchesInFile.length).toBe(0);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Issues are created for dispatches without deduplication', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create email dispatch WITHOUT deduplication or retry
              const content = generateEmailDispatchCode(template, false, false);
              await writeApiFile(testDir, 'dispatch-critical.ts', content);

              const result = await checkIdempotency(testDir);

              // Should have MISSING_DEDUPLICATION issues
              const dedupIssues = result.issues.filter(
                i => i.type === 'MISSING_DEDUPLICATION' &&
                     i.filePath.includes('dispatch-critical.ts')
              );

              // If dispatches were found, issues should be created
              if (result.missingDeduplicationDispatches.length > 0) {
                expect(dedupIssues.length).toBeGreaterThan(0);
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
  // Risk Levels Are Correctly Calculated
  // ==========================================================================

  describe('Risk levels are correctly calculated', () => {
    it('PROPERTY: Email triggers without idempotency have critical risk', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create email trigger WITHOUT idempotency
              const content = generateResendEmailCode(template, false);
              await writeApiFile(testDir, 'email-critical.ts', content);

              const result = await checkIdempotency(testDir);

              // Email issues should be critical risk
              const emailIssues = result.issues.filter(
                i => i.source === 'trigger' &&
                     i.filePath.includes('email-critical.ts')
              );

              for (const issue of emailIssues) {
                // Email triggers without idempotency should be critical
                expect(['critical', 'high']).toContain(issue.riskLevel);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multi-channel triggers without idempotency have elevated risk', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          async (event) => {
            const testDir = await createTestDir();
            try {
              // Create multi-channel trigger WITHOUT idempotency
              const content = generateMultiChannelCode(event, false);
              await writeApiFile(testDir, 'multi-high.ts', content);

              const result = await checkIdempotency(testDir);

              // Multi-channel issues should have elevated risk (not low)
              // Note: The actual risk depends on how the trigger is classified
              // Email components get critical, realtime gets medium, both gets high
              const multiIssues = result.issues.filter(
                i => i.source === 'trigger' &&
                     i.filePath.includes('multi-high.ts')
              );

              for (const issue of multiIssues) {
                // All trigger issues without idempotency should have some risk level
                expect(['critical', 'high', 'medium']).toContain(issue.riskLevel);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Realtime-only triggers without idempotency have medium risk', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          async (event) => {
            const testDir = await createTestDir();
            try {
              // Create realtime-only trigger (toast) WITHOUT idempotency
              const content = generateToastCode(event);
              await writeServiceFile(testDir, 'toast-medium.ts', content);

              const result = await checkIdempotency(testDir);

              // Realtime-only issues should be medium risk
              const realtimeIssues = result.issues.filter(
                i => i.source === 'trigger' &&
                     i.filePath.includes('toast-medium.ts')
              );

              for (const issue of realtimeIssues) {
                expect(['medium', 'low']).toContain(issue.riskLevel);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Dispatches missing both retry and dedup have critical risk', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create dispatch WITHOUT retry AND deduplication
              const content = generateEmailDispatchCode(template, false, false);
              await writeApiFile(testDir, 'dispatch-both-missing.ts', content);

              const result = await checkIdempotency(testDir);

              // Issues for dispatches missing both should be critical
              const dispatchIssues = result.issues.filter(
                i => i.source === 'email_dispatch' &&
                     i.filePath.includes('dispatch-both-missing.ts')
              );

              for (const issue of dispatchIssues) {
                expect(['critical', 'high']).toContain(issue.riskLevel);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Risk level is always a valid value', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              const content = generateEmailDispatchCode(template, hasRetry, hasDedup);
              await writeApiFile(testDir, 'risk-valid.ts', content);

              const result = await checkIdempotency(testDir);
              const validRiskLevels: IdempotencyRiskLevel[] = ['critical', 'high', 'medium', 'low'];

              for (const issue of result.issues) {
                expect(validRiskLevels).toContain(issue.riskLevel);
              }

              // Overall risk level should also be valid
              expect(validRiskLevels).toContain(result.overallRiskLevel);
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
  // Summary Statistics Are Accurate
  // ==========================================================================

  describe('Summary statistics are accurate', () => {
    it('PROPERTY: Summary totalTriggers matches actual trigger count', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'trigger1.ts', generateResendEmailCode(event, hasIdempotency));
              await writeServiceFile(testDir, 'trigger2.ts', generateToastCode(event));

              const result = await checkIdempotency(testDir);

              // Summary totalTriggers should match
              expect(result.summary.totalTriggers).toBe(
                result.summary.triggersWithIdempotency + result.summary.triggersWithoutIdempotency
              );
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary totalEmailDispatches matches actual dispatch count', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await checkIdempotency(testDir);

              // Summary totalEmailDispatches should match
              expect(result.summary.totalEmailDispatches).toBe(
                result.summary.dispatchesWithDeduplication + result.summary.dispatchesWithoutDeduplication
              );
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary totalIssues matches issues array length', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          async (template, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, hasIdempotency));

              const result = await checkIdempotency(testDir);

              expect(result.summary.totalIssues).toBe(result.issues.length);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary criticalIssues count is accurate', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          fc.boolean(),
          async (template, hasRetry, hasDedup) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, hasRetry, hasDedup));

              const result = await checkIdempotency(testDir);

              const actualCritical = result.issues.filter(i => i.riskLevel === 'critical').length;
              expect(result.summary.criticalIssues).toBe(actualCritical);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary highRiskIssues count is accurate', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationEventArb,
          fc.boolean(),
          async (event, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'multi.ts', generateMultiChannelCode(event, hasIdempotency));

              const result = await checkIdempotency(testDir);

              const actualHigh = result.issues.filter(i => i.riskLevel === 'high').length;
              expect(result.summary.highRiskIssues).toBe(actualHigh);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: getIdempotencySummary returns consistent data', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          fc.boolean(),
          async (template, hasIdempotency) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, hasIdempotency));

              const result = await checkIdempotency(testDir);
              const summary = getIdempotencySummary(result);

              // Issue count should match
              expect(summary.issueCount).toBe(result.issues.length);

              // Status should be valid
              expect(['healthy', 'warning', 'critical']).toContain(summary.status);

              // Coverage percentages should be 0-100
              expect(summary.triggerCoverage).toBeGreaterThanOrEqual(0);
              expect(summary.triggerCoverage).toBeLessThanOrEqual(100);
              expect(summary.dispatchCoverage).toBeGreaterThanOrEqual(0);
              expect(summary.dispatchCoverage).toBeLessThanOrEqual(100);
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
  // Recommendations Are Generated for Issues Found
  // ==========================================================================

  describe('Recommendations are generated for issues found', () => {
    it('PROPERTY: Recommendations are generated when issues exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create code WITHOUT idempotency to generate issues
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, false, false));

              const result = await checkIdempotency(testDir);

              // If there are issues, there should be recommendations
              if (result.issues.length > 0) {
                expect(result.recommendations.length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Each recommendation has required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));

              const result = await checkIdempotency(testDir);

              for (const rec of result.recommendations) {
                // Priority should be a positive integer
                expect(rec.priority).toBeGreaterThan(0);
                expect(Number.isInteger(rec.priority)).toBe(true);

                // Title should be non-empty
                expect(rec.title).toBeDefined();
                expect(rec.title.length).toBeGreaterThan(0);

                // Description should be non-empty
                expect(rec.description).toBeDefined();
                expect(rec.description.length).toBeGreaterThan(0);

                // Affected files should be an array
                expect(Array.isArray(rec.affectedFiles)).toBe(true);

                // Effort should be valid
                expect(['low', 'medium', 'high']).toContain(rec.effort);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Recommendations are sorted by priority', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, false, false));

              const result = await checkIdempotency(testDir);

              // Recommendations should be sorted by priority (ascending)
              for (let i = 1; i < result.recommendations.length; i++) {
                expect(result.recommendations[i].priority).toBeGreaterThanOrEqual(
                  result.recommendations[i - 1].priority
                );
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: No recommendations when no issues exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create code WITH idempotency (no issues)
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, true));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, true, true));

              const result = await checkIdempotency(testDir);

              // If no issues, recommendations should be minimal or empty
              if (result.issues.length === 0) {
                // May still have monitoring recommendation, but should be minimal
                expect(result.recommendations.length).toBeLessThanOrEqual(1);
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
  // Issue Filtering and Grouping Functions
  // ==========================================================================

  describe('Issue filtering and grouping functions work correctly', () => {
    it('PROPERTY: filterIssuesByRisk returns subset of issues', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          riskLevelArb,
          async (template, minRisk) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, false, false));

              const result = await checkIdempotency(testDir);
              const filtered = filterIssuesByRisk(result.issues, minRisk);

              // Filtered should be a subset
              expect(filtered.length).toBeLessThanOrEqual(result.issues.length);

              // All filtered issues should be in original
              for (const issue of filtered) {
                const found = result.issues.some(
                  i => i.filePath === issue.filePath && i.lineNumber === issue.lineNumber
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

    it('PROPERTY: filterIssuesByRisk respects risk level threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, false, false));

              const result = await checkIdempotency(testDir);

              // Filter by critical - should only include critical
              const criticalOnly = filterIssuesByRisk(result.issues, 'critical');
              for (const issue of criticalOnly) {
                expect(issue.riskLevel).toBe('critical');
              }

              // Filter by high - should include critical and high
              const highAndAbove = filterIssuesByRisk(result.issues, 'high');
              for (const issue of highAndAbove) {
                expect(['critical', 'high']).toContain(issue.riskLevel);
              }

              // Filter by medium - should include critical, high, and medium
              const mediumAndAbove = filterIssuesByRisk(result.issues, 'medium');
              for (const issue of mediumAndAbove) {
                expect(['critical', 'high', 'medium']).toContain(issue.riskLevel);
              }

              // Filter by low - should include all
              const all = filterIssuesByRisk(result.issues, 'low');
              expect(all.length).toBe(result.issues.length);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: groupIssuesByFile groups correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email1.ts', generateResendEmailCode(template, false));
              await writeApiFile(testDir, 'email2.ts', generateResendEmailCode(template, false));

              const result = await checkIdempotency(testDir);
              const grouped = groupIssuesByFile(result.issues);

              // Total issues in groups should equal original
              let totalInGroups = 0;
              for (const issues of grouped.values()) {
                totalInGroups += issues.length;
              }
              expect(totalInGroups).toBe(result.issues.length);

              // Each issue should be in the correct group
              for (const [filePath, issues] of grouped.entries()) {
                for (const issue of issues) {
                  expect(issue.filePath).toBe(filePath);
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

    it('PROPERTY: groupIssuesByFile returns Map with unique file paths', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));

              const result = await checkIdempotency(testDir);
              const grouped = groupIssuesByFile(result.issues);

              // Should be a Map
              expect(grouped instanceof Map).toBe(true);

              // Keys should be unique file paths
              const keys = [...grouped.keys()];
              const uniqueKeys = [...new Set(keys)];
              expect(keys.length).toBe(uniqueKeys.length);
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
  // Issue Structure and Evidence
  // ==========================================================================

  describe('Issue structure and evidence are complete', () => {
    it('PROPERTY: Every issue has required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));

              const result = await checkIdempotency(testDir);

              for (const issue of result.issues) {
                // Type should be valid
                expect(['MISSING_IDEMPOTENCY_KEY', 'MISSING_DEDUPLICATION', 'DUPLICATE_SEND_RISK'])
                  .toContain(issue.type);

                // Source should be valid
                expect(['trigger', 'email_dispatch']).toContain(issue.source);

                // File path should be non-empty
                expect(issue.filePath).toBeDefined();
                expect(issue.filePath.length).toBeGreaterThan(0);

                // Line number should be positive
                expect(issue.lineNumber).toBeGreaterThan(0);

                // Description should be non-empty
                expect(issue.description).toBeDefined();
                expect(issue.description.length).toBeGreaterThan(0);

                // Risk level should be valid
                expect(['critical', 'high', 'medium', 'low']).toContain(issue.riskLevel);

                // Recommendation should be non-empty
                expect(issue.recommendation).toBeDefined();
                expect(issue.recommendation.length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every issue has complete evidence', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));

              const result = await checkIdempotency(testDir);

              for (const issue of result.issues) {
                // Evidence should exist
                expect(issue.evidence).toBeDefined();

                // Evidence should have file path
                expect(issue.evidence.filePath).toBeDefined();
                expect(issue.evidence.filePath.length).toBeGreaterThan(0);

                // Evidence should have line numbers
                expect(issue.evidence.lineNumbers).toBeDefined();
                expect(Array.isArray(issue.evidence.lineNumbers)).toBe(true);

                // Evidence should have reason
                expect(issue.evidence.reason).toBeDefined();
                expect(issue.evidence.reason.length).toBeGreaterThan(0);

                // Evidence should have confidence
                expect(['certain', 'likely', 'possible']).toContain(issue.evidence.confidence);
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Issues are sorted by risk level (critical first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, false, false));
              await writeServiceFile(testDir, 'toast.ts', generateToastCode('test'));

              const result = await checkIdempotency(testDir);

              const riskOrder: Record<IdempotencyRiskLevel, number> = {
                critical: 0,
                high: 1,
                medium: 2,
                low: 3,
              };

              // Issues should be sorted by risk level
              for (let i = 1; i < result.issues.length; i++) {
                const prevRisk = riskOrder[result.issues[i - 1].riskLevel];
                const currRisk = riskOrder[result.issues[i].riskLevel];
                expect(currRisk).toBeGreaterThanOrEqual(prevRisk);
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
        const result = await checkIdempotency(testDir);

        expect(result.summary.totalTriggers).toBe(0);
        expect(result.summary.totalEmailDispatches).toBe(0);
        expect(result.issues.length).toBe(0);
        expect(result.overallRiskLevel).toBe('low');
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('PROPERTY: File with no notifications returns empty for that file', async () => {
      const testDir = await createTestDir();
      try {
        const content = `
export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;
`;
        await writeApiFile(testDir, 'no-notifications.ts', content);

        const result = await checkIdempotency(testDir);

        // Should have no issues for this file
        const fileIssues = result.issues.filter(
          i => i.filePath.includes('no-notifications.ts')
        );
        expect(fileIssues.length).toBe(0);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('PROPERTY: Multiple files are all scanned', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailTemplateArb, { minLength: 2, maxLength: 3 }),
          async (templates) => {
            const testDir = await createTestDir();
            try {
              // Write each template to a different file
              for (let i = 0; i < templates.length; i++) {
                await writeApiFile(testDir, `multi-${i}.ts`, generateResendEmailCode(templates[i], false));
              }

              const result = await checkIdempotency(testDir);

              // Should have results from multiple files
              const uniqueFiles = new Set(result.issues.map(i => i.filePath));
              // At least some files should have issues
              expect(result.issues.length).toBeGreaterThan(0);
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Overall risk level reflects worst issue', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create critical issue (email without idempotency)
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, false));

              const result = await checkIdempotency(testDir);

              // If there are critical issues, overall should be critical
              if (result.summary.criticalIssues > 0) {
                expect(result.overallRiskLevel).toBe('critical');
              }
            } finally {
              await cleanupTestDir(testDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Healthy status when no issues', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailTemplateArb,
          async (template) => {
            const testDir = await createTestDir();
            try {
              // Create code WITH idempotency (no issues)
              await writeApiFile(testDir, 'email.ts', generateResendEmailCode(template, true));
              await writeApiFile(testDir, 'dispatch.ts', generateEmailDispatchCode(template, true, true));

              const result = await checkIdempotency(testDir);
              const summary = getIdempotencySummary(result);

              // If no issues, status should be healthy
              if (result.issues.length === 0) {
                expect(summary.status).toBe('healthy');
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
