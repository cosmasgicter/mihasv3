/**
 * Idempotency Checker
 * 
 * Checks for idempotency keys in email dispatches and notification triggers,
 * flagging triggers without deduplication to ensure exactly-once delivery.
 * 
 * Validates: Requirements 6.6, 6.7, 6.8
 * - 6.6: THE Email_System SHALL trigger emails exactly once per event
 * - 6.7: IF duplicate notification sends are possible THEN the Audit_System SHALL flag them
 * - 6.8: WHERE idempotency is required THEN the system SHALL implement idempotency keys
 * 
 * @module scripts/audit/notification/idempotencyChecker
 */

import type { NotificationTrigger, EmailDispatchPoint, Evidence } from '../types';
import { 
  scanNotificationTriggers, 
  identifyDuplicateRisks,
  identifyMissingIdempotency,
  type NotificationTriggerScanResult 
} from './triggerScanner';
import { 
  scanEmailDispatches, 
  identifyMissingDeduplication,
  identifyHighRiskDispatches,
  type EmailDispatchScanResult 
} from './emailScanner';

/**
 * Risk level for idempotency issues
 */
export type IdempotencyRiskLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * An idempotency issue found during the audit
 */
export interface IdempotencyIssue {
  /** Type of issue */
  type: 'MISSING_IDEMPOTENCY_KEY' | 'MISSING_DEDUPLICATION' | 'DUPLICATE_SEND_RISK';
  /** Source of the issue */
  source: 'trigger' | 'email_dispatch';
  /** File path where the issue was found */
  filePath: string;
  /** Line number of the issue */
  lineNumber: number;
  /** Description of the issue */
  description: string;
  /** Risk level */
  riskLevel: IdempotencyRiskLevel;
  /** Evidence supporting the finding */
  evidence: Evidence;
  /** Recommendation for fixing */
  recommendation: string;
}

/**
 * Recommendation for improving idempotency
 */
export interface IdempotencyRecommendation {
  /** Priority of the recommendation (1 = highest) */
  priority: number;
  /** Title of the recommendation */
  title: string;
  /** Detailed description */
  description: string;
  /** Files affected */
  affectedFiles: string[];
  /** Effort estimate */
  effort: 'low' | 'medium' | 'high';
}

/**
 * Complete idempotency audit result
 */
export interface IdempotencyAuditResult {
  /** Summary statistics */
  summary: {
    totalTriggers: number;
    triggersWithIdempotency: number;
    triggersWithoutIdempotency: number;
    totalEmailDispatches: number;
    dispatchesWithDeduplication: number;
    dispatchesWithoutDeduplication: number;
    totalIssues: number;
    criticalIssues: number;
    highRiskIssues: number;
  };
  /** Overall risk level */
  overallRiskLevel: IdempotencyRiskLevel;
  /** All issues found */
  issues: IdempotencyIssue[];
  /** Triggers missing idempotency keys */
  missingIdempotencyTriggers: NotificationTrigger[];
  /** Email dispatches missing deduplication */
  missingDeduplicationDispatches: EmailDispatchPoint[];
  /** Triggers with duplicate send risk */
  duplicateRiskTriggers: NotificationTrigger[];
  /** High-risk email dispatches (missing both retry and deduplication) */
  highRiskDispatches: EmailDispatchPoint[];
  /** Recommendations for improvement */
  recommendations: IdempotencyRecommendation[];
  /** Errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

/**
 * Calculate risk level based on delivery mechanism and context
 */
function calculateTriggerRiskLevel(trigger: NotificationTrigger): IdempotencyRiskLevel {
  // Email triggers without idempotency are critical - can cause duplicate emails
  if (trigger.deliveryMechanism === 'email' && !trigger.hasIdempotencyKey) {
    return 'critical';
  }
  
  // Multi-channel triggers without idempotency are high risk
  if (trigger.deliveryMechanism === 'both' && !trigger.hasIdempotencyKey) {
    return 'high';
  }
  
  // Realtime-only triggers without idempotency are medium risk
  // (duplicate toasts are annoying but not as bad as duplicate emails)
  if (trigger.deliveryMechanism === 'realtime' && !trigger.hasIdempotencyKey) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Calculate risk level for email dispatch points
 */
function calculateDispatchRiskLevel(dispatch: EmailDispatchPoint): IdempotencyRiskLevel {
  // Missing both retry and deduplication is critical
  if (!dispatch.hasRetry && !dispatch.hasDeduplication) {
    return 'critical';
  }
  
  // Missing deduplication alone is high risk
  if (!dispatch.hasDeduplication) {
    return 'high';
  }
  
  // Has deduplication but missing retry is medium risk
  if (!dispatch.hasRetry) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Create evidence for a trigger issue
 */
function createTriggerEvidence(trigger: NotificationTrigger): Evidence {
  return {
    filePath: trigger.filePath,
    lineNumbers: [trigger.lineNumber],
    reason: `Notification trigger for event '${trigger.event}' (${trigger.deliveryMechanism}) lacks idempotency key`,
    confidence: 'certain',
  };
}

/**
 * Create evidence for an email dispatch issue
 */
function createDispatchEvidence(dispatch: EmailDispatchPoint): Evidence {
  const issues: string[] = [];
  if (!dispatch.hasDeduplication) {
    issues.push('missing deduplication');
  }
  if (!dispatch.hasRetry) {
    issues.push('missing retry logic');
  }
  
  return {
    filePath: dispatch.filePath,
    lineNumbers: [dispatch.lineNumber],
    reason: `Email dispatch for template '${dispatch.template}' has ${issues.join(' and ')}`,
    confidence: 'certain',
  };
}

/**
 * Generate recommendation for adding idempotency key
 */
function getIdempotencyKeyRecommendation(trigger: NotificationTrigger): string {
  if (trigger.deliveryMechanism === 'email' || trigger.deliveryMechanism === 'both') {
    return `Add an idempotency key using a unique identifier (e.g., \`\${userId}_\${eventType}_\${timestamp}\` or a UUID). ` +
           `Store sent notification IDs in a cache or database to prevent duplicate sends.`;
  }
  
  return `Consider adding an idempotency key to prevent duplicate notifications. ` +
         `Use a combination of user ID, event type, and timestamp or a unique event ID.`;
}

/**
 * Generate recommendation for adding deduplication
 */
function getDeduplicationRecommendation(dispatch: EmailDispatchPoint): string {
  const recommendations: string[] = [];
  
  if (!dispatch.hasDeduplication) {
    recommendations.push(
      `Add deduplication logic using an idempotency key. ` +
      `Check if an email with the same key has been sent before dispatching.`
    );
  }
  
  if (!dispatch.hasRetry) {
    recommendations.push(
      `Add retry logic with exponential backoff for transient failures.`
    );
  }
  
  return recommendations.join(' ');
}

/**
 * Build issues list from triggers and dispatches
 */
function buildIssuesList(
  missingIdempotencyTriggers: NotificationTrigger[],
  missingDeduplicationDispatches: EmailDispatchPoint[],
  duplicateRiskTriggers: NotificationTrigger[],
  highRiskDispatches: EmailDispatchPoint[]
): IdempotencyIssue[] {
  const issues: IdempotencyIssue[] = [];
  
  // Add issues for triggers missing idempotency
  for (const trigger of missingIdempotencyTriggers) {
    const riskLevel = calculateTriggerRiskLevel(trigger);
    
    issues.push({
      type: 'MISSING_IDEMPOTENCY_KEY',
      source: 'trigger',
      filePath: trigger.filePath,
      lineNumber: trigger.lineNumber,
      description: `Notification trigger for '${trigger.event}' (${trigger.deliveryMechanism}) lacks idempotency key`,
      riskLevel,
      evidence: createTriggerEvidence(trigger),
      recommendation: getIdempotencyKeyRecommendation(trigger),
    });
  }
  
  // Add issues for email dispatches missing deduplication
  for (const dispatch of missingDeduplicationDispatches) {
    const riskLevel = calculateDispatchRiskLevel(dispatch);
    
    issues.push({
      type: 'MISSING_DEDUPLICATION',
      source: 'email_dispatch',
      filePath: dispatch.filePath,
      lineNumber: dispatch.lineNumber,
      description: `Email dispatch for template '${dispatch.template}' lacks deduplication logic`,
      riskLevel,
      evidence: createDispatchEvidence(dispatch),
      recommendation: getDeduplicationRecommendation(dispatch),
    });
  }
  
  // Add duplicate risk issues (email triggers without idempotency)
  for (const trigger of duplicateRiskTriggers) {
    // Skip if already added as missing idempotency
    const alreadyAdded = issues.some(
      i => i.filePath === trigger.filePath && i.lineNumber === trigger.lineNumber
    );
    
    if (!alreadyAdded) {
      issues.push({
        type: 'DUPLICATE_SEND_RISK',
        source: 'trigger',
        filePath: trigger.filePath,
        lineNumber: trigger.lineNumber,
        description: `Email trigger for '${trigger.event}' has duplicate send risk`,
        riskLevel: 'critical',
        evidence: createTriggerEvidence(trigger),
        recommendation: getIdempotencyKeyRecommendation(trigger),
      });
    }
  }
  
  // Sort by risk level (critical first)
  const riskOrder: Record<IdempotencyRiskLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  
  issues.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);
  
  return issues;
}

/**
 * Calculate overall risk level based on issues
 */
function calculateOverallRiskLevel(issues: IdempotencyIssue[]): IdempotencyRiskLevel {
  if (issues.length === 0) {
    return 'low';
  }
  
  const criticalCount = issues.filter(i => i.riskLevel === 'critical').length;
  const highCount = issues.filter(i => i.riskLevel === 'high').length;
  
  if (criticalCount > 0) {
    return 'critical';
  }
  
  if (highCount > 2) {
    return 'critical';
  }
  
  if (highCount > 0) {
    return 'high';
  }
  
  const mediumCount = issues.filter(i => i.riskLevel === 'medium').length;
  if (mediumCount > 3) {
    return 'high';
  }
  
  if (mediumCount > 0) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Generate recommendations based on issues found
 */
function generateRecommendations(
  issues: IdempotencyIssue[],
  missingIdempotencyTriggers: NotificationTrigger[],
  missingDeduplicationDispatches: EmailDispatchPoint[]
): IdempotencyRecommendation[] {
  const recommendations: IdempotencyRecommendation[] = [];
  let priority = 1;
  
  // Critical: Email dispatches without deduplication
  const criticalDispatches = missingDeduplicationDispatches.filter(
    d => !d.hasDeduplication && !d.hasRetry
  );
  
  if (criticalDispatches.length > 0) {
    recommendations.push({
      priority: priority++,
      title: 'Add Idempotency to Critical Email Dispatches',
      description: 
        `${criticalDispatches.length} email dispatch point(s) lack both deduplication and retry logic. ` +
        `These are at high risk of sending duplicate emails or losing emails on failure. ` +
        `Implement idempotency keys and retry with exponential backoff.`,
      affectedFiles: [...new Set(criticalDispatches.map(d => d.filePath))],
      effort: 'medium',
    });
  }
  
  // High: Email triggers without idempotency
  const emailTriggers = missingIdempotencyTriggers.filter(
    t => t.deliveryMechanism === 'email' || t.deliveryMechanism === 'both'
  );
  
  if (emailTriggers.length > 0) {
    recommendations.push({
      priority: priority++,
      title: 'Add Idempotency Keys to Email Triggers',
      description: 
        `${emailTriggers.length} email notification trigger(s) lack idempotency keys. ` +
        `This can result in duplicate emails being sent if the trigger is called multiple times. ` +
        `Generate a unique idempotency key for each notification event.`,
      affectedFiles: [...new Set(emailTriggers.map(t => t.filePath))],
      effort: 'low',
    });
  }
  
  // Medium: Create centralized idempotency service
  if (issues.length > 3) {
    recommendations.push({
      priority: priority++,
      title: 'Create Centralized Idempotency Service',
      description: 
        `Multiple idempotency issues detected across the codebase. ` +
        `Consider creating a centralized idempotency service in \`lib/idempotency.ts\` that: ` +
        `(1) generates consistent idempotency keys, ` +
        `(2) tracks sent notifications in a cache/database, ` +
        `(3) provides a simple API for checking and recording sends.`,
      affectedFiles: ['lib/idempotency.ts (new)'],
      effort: 'medium',
    });
  }
  
  // Medium: Realtime triggers without idempotency
  const realtimeTriggers = missingIdempotencyTriggers.filter(
    t => t.deliveryMechanism === 'realtime'
  );
  
  if (realtimeTriggers.length > 5) {
    recommendations.push({
      priority: priority++,
      title: 'Add Idempotency to Realtime Triggers',
      description: 
        `${realtimeTriggers.length} realtime notification trigger(s) lack idempotency. ` +
        `While less critical than email, duplicate toasts/notifications can degrade UX. ` +
        `Consider adding client-side deduplication for realtime notifications.`,
      affectedFiles: [...new Set(realtimeTriggers.map(t => t.filePath))],
      effort: 'low',
    });
  }
  
  // Low: Add monitoring for duplicate sends
  if (issues.length > 0) {
    recommendations.push({
      priority: priority++,
      title: 'Add Monitoring for Duplicate Sends',
      description: 
        `Implement monitoring to detect duplicate notification/email sends in production. ` +
        `Log idempotency key usage and alert on potential duplicates. ` +
        `This helps catch issues that slip through code review.`,
      affectedFiles: ['lib/auditLogger.ts'],
      effort: 'low',
    });
  }
  
  return recommendations;
}

/**
 * Check idempotency across notification triggers and email dispatches
 * 
 * @param projectRoot - Root directory of the project
 * @returns Complete idempotency audit result
 */
export async function checkIdempotency(
  projectRoot: string = process.cwd()
): Promise<IdempotencyAuditResult> {
  const errors: { filePath: string; error: string }[] = [];
  
  // Scan notification triggers
  let triggerResult: NotificationTriggerScanResult;
  try {
    triggerResult = await scanNotificationTriggers(projectRoot);
    errors.push(...triggerResult.errors);
  } catch (error) {
    errors.push({ filePath: 'triggerScanner', error: String(error) });
    triggerResult = {
      triggers: [],
      totalTriggers: 0,
      byDeliveryMechanism: { realtime: [], email: [], both: [] },
      withIdempotency: 0,
      withoutIdempotency: 0,
      errors: [],
    };
  }
  
  // Scan email dispatches
  let dispatchResult: EmailDispatchScanResult;
  try {
    dispatchResult = await scanEmailDispatches(projectRoot);
    errors.push(...dispatchResult.errors);
  } catch (error) {
    errors.push({ filePath: 'emailScanner', error: String(error) });
    dispatchResult = {
      dispatchPoints: [],
      totalDispatchPoints: 0,
      withRetry: 0,
      withoutRetry: 0,
      withDeduplication: 0,
      withoutDeduplication: 0,
      byTemplate: new Map(),
      errors: [],
    };
  }
  
  // Identify issues
  const missingIdempotencyTriggers = identifyMissingIdempotency(triggerResult.triggers);
  const missingDeduplicationDispatches = identifyMissingDeduplication(dispatchResult.dispatchPoints);
  const duplicateRiskTriggers = identifyDuplicateRisks(triggerResult.triggers);
  const highRiskDispatches = identifyHighRiskDispatches(dispatchResult.dispatchPoints);
  
  // Build issues list
  const issues = buildIssuesList(
    missingIdempotencyTriggers,
    missingDeduplicationDispatches,
    duplicateRiskTriggers,
    highRiskDispatches
  );
  
  // Calculate overall risk level
  const overallRiskLevel = calculateOverallRiskLevel(issues);
  
  // Generate recommendations
  const recommendations = generateRecommendations(
    issues,
    missingIdempotencyTriggers,
    missingDeduplicationDispatches
  );
  
  // Build summary
  const summary = {
    totalTriggers: triggerResult.totalTriggers,
    triggersWithIdempotency: triggerResult.withIdempotency,
    triggersWithoutIdempotency: triggerResult.withoutIdempotency,
    totalEmailDispatches: dispatchResult.totalDispatchPoints,
    dispatchesWithDeduplication: dispatchResult.withDeduplication,
    dispatchesWithoutDeduplication: dispatchResult.withoutDeduplication,
    totalIssues: issues.length,
    criticalIssues: issues.filter(i => i.riskLevel === 'critical').length,
    highRiskIssues: issues.filter(i => i.riskLevel === 'high').length,
  };
  
  return {
    summary,
    overallRiskLevel,
    issues,
    missingIdempotencyTriggers,
    missingDeduplicationDispatches,
    duplicateRiskTriggers,
    highRiskDispatches,
    recommendations,
    errors,
  };
}

/**
 * Get a quick summary of idempotency status
 */
export function getIdempotencySummary(result: IdempotencyAuditResult): {
  status: 'healthy' | 'warning' | 'critical';
  triggerCoverage: number;
  dispatchCoverage: number;
  issueCount: number;
  topIssue: string | null;
} {
  const { summary, issues, overallRiskLevel } = result;
  
  // Calculate coverage percentages
  const triggerCoverage = summary.totalTriggers > 0
    ? Math.round((summary.triggersWithIdempotency / summary.totalTriggers) * 100)
    : 100;
  
  const dispatchCoverage = summary.totalEmailDispatches > 0
    ? Math.round((summary.dispatchesWithDeduplication / summary.totalEmailDispatches) * 100)
    : 100;
  
  // Determine status
  let status: 'healthy' | 'warning' | 'critical';
  if (overallRiskLevel === 'critical') {
    status = 'critical';
  } else if (overallRiskLevel === 'high' || overallRiskLevel === 'medium') {
    status = 'warning';
  } else {
    status = 'healthy';
  }
  
  // Get top issue
  const topIssue = issues.length > 0
    ? `${issues[0].type} in ${issues[0].filePath}:${issues[0].lineNumber}`
    : null;
  
  return {
    status,
    triggerCoverage,
    dispatchCoverage,
    issueCount: issues.length,
    topIssue,
  };
}

/**
 * Filter issues by risk level
 */
export function filterIssuesByRisk(
  issues: IdempotencyIssue[],
  minRiskLevel: IdempotencyRiskLevel
): IdempotencyIssue[] {
  const riskOrder: Record<IdempotencyRiskLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  
  const minRisk = riskOrder[minRiskLevel];
  return issues.filter(i => riskOrder[i.riskLevel] <= minRisk);
}

/**
 * Group issues by file
 */
export function groupIssuesByFile(
  issues: IdempotencyIssue[]
): Map<string, IdempotencyIssue[]> {
  const grouped = new Map<string, IdempotencyIssue[]>();
  
  for (const issue of issues) {
    const existing = grouped.get(issue.filePath) || [];
    existing.push(issue);
    grouped.set(issue.filePath, existing);
  }
  
  return grouped;
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();
  
  console.log('🔐 Checking idempotency across notifications and emails...\n');
  
  checkIdempotency(projectRoot)
    .then(result => {
      const summary = getIdempotencySummary(result);
      
      // Status header
      const statusEmoji = {
        healthy: '🟢',
        warning: '🟡',
        critical: '🔴',
      }[summary.status];
      
      console.log(`${statusEmoji} Idempotency Status: ${summary.status.toUpperCase()}\n`);
      
      // Summary stats
      console.log('📊 Summary:');
      console.log(`   Total notification triggers: ${result.summary.totalTriggers}`);
      console.log(`   Triggers with idempotency: ${result.summary.triggersWithIdempotency} (${summary.triggerCoverage}%)`);
      console.log(`   Total email dispatches: ${result.summary.totalEmailDispatches}`);
      console.log(`   Dispatches with deduplication: ${result.summary.dispatchesWithDeduplication} (${summary.dispatchCoverage}%)`);
      
      console.log('\n⚠️  Issues Found:');
      console.log(`   Total issues: ${result.summary.totalIssues}`);
      console.log(`   Critical: ${result.summary.criticalIssues}`);
      console.log(`   High risk: ${result.summary.highRiskIssues}`);
      
      // Show critical and high issues
      const criticalAndHigh = filterIssuesByRisk(result.issues, 'high');
      if (criticalAndHigh.length > 0) {
        console.log('\n🔴 Critical & High Risk Issues:');
        for (const issue of criticalAndHigh) {
          const emoji = issue.riskLevel === 'critical' ? '🔴' : '🟠';
          console.log(`\n   ${emoji} ${issue.type}`);
          console.log(`      File: ${issue.filePath}:${issue.lineNumber}`);
          console.log(`      ${issue.description}`);
          console.log(`      Recommendation: ${issue.recommendation}`);
        }
      }
      
      // Show recommendations
      if (result.recommendations.length > 0) {
        console.log('\n📋 Recommendations:');
        for (const rec of result.recommendations) {
          console.log(`\n   ${rec.priority}. ${rec.title} (${rec.effort} effort)`);
          console.log(`      ${rec.description}`);
          if (rec.affectedFiles.length <= 3) {
            console.log(`      Files: ${rec.affectedFiles.join(', ')}`);
          } else {
            console.log(`      Files: ${rec.affectedFiles.slice(0, 3).join(', ')} and ${rec.affectedFiles.length - 3} more`);
          }
        }
      }
      
      // Show errors if any
      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        for (const error of result.errors) {
          console.log(`   ${error.filePath}: ${error.error}`);
        }
      }
      
      console.log('\n✅ Idempotency check complete!');
      
      // Exit with error code if critical issues found
      if (summary.status === 'critical') {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Error checking idempotency:', error);
      process.exit(1);
    });
}
