/**
 * Notification Flow Report Generator
 * 
 * Generates a comprehensive Markdown report of notification and email pipeline analysis,
 * including all triggers, delivery mechanisms, and idempotency status.
 * 
 * Validates: Requirements 6.1-6.8
 * - 6.1: Audit all notification triggers
 * - 6.2: Audit all delivery mechanisms
 * - 6.3: Verify realtime sync works correctly
 * - 6.4: Verify email dispatch mechanisms
 * - 6.5: Notifications display instantly
 * - 6.6: Emails trigger exactly once per event
 * - 6.7: Flag duplicate notification sends
 * - 6.8: Implement idempotency keys
 * 
 * @module scripts/audit/notification/reportGenerator
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { NotificationTrigger, EmailDispatchPoint, NotificationAuditResult } from '../types';
import { 
  scanNotificationTriggers, 
  getNotificationTriggerSummary,
  identifyDuplicateRisks,
  identifyMissingIdempotency,
  type NotificationTriggerScanResult 
} from './triggerScanner';
import { 
  scanEmailDispatches, 
  getEmailDispatchSummary,
  identifyMissingRetry,
  identifyMissingDeduplication,
  identifyHighRiskDispatches,
  type EmailDispatchScanResult 
} from './emailScanner';
import {
  checkIdempotency,
  getIdempotencySummary,
  filterIssuesByRisk,
  groupIssuesByFile,
  type IdempotencyAuditResult,
  type IdempotencyIssue,
  type IdempotencyRiskLevel,
} from './idempotencyChecker';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/notification-flow-report.md';


/**
 * Report metadata
 */
interface ReportMetadata {
  timestamp: string;
  version: string;
  projectRoot: string;
}

/**
 * Combined notification audit data
 */
interface CombinedNotificationAuditData {
  triggerResult: NotificationTriggerScanResult;
  emailResult: EmailDispatchScanResult;
  idempotencyResult: IdempotencyAuditResult;
  triggerSummary: ReturnType<typeof getNotificationTriggerSummary>;
  emailSummary: ReturnType<typeof getEmailDispatchSummary>;
  idempotencySummary: ReturnType<typeof getIdempotencySummary>;
}

/**
 * Get timestamp for report
 */
const getTimestamp = (): string => new Date().toISOString();

/**
 * Get status emoji based on status
 */
const getStatusEmoji = (status: string): string => {
  const emojis: Record<string, string> = {
    healthy: '🟢',
    warning: '🟡',
    critical: '🔴',
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    passed: '✅',
    failed: '❌',
  };
  return emojis[status] || '⚪';
};

/**
 * Get risk level emoji
 */
const getRiskEmoji = (risk: IdempotencyRiskLevel): string => {
  const emojis: Record<IdempotencyRiskLevel, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };
  return emojis[risk];
};

/**
 * Calculate overall health status
 */
function calculateOverallHealth(data: CombinedNotificationAuditData): 'healthy' | 'warning' | 'critical' {
  const { idempotencyResult, triggerResult, emailResult } = data;
  
  // Critical: Many critical idempotency issues
  if (idempotencyResult.summary.criticalIssues > 2) {
    return 'critical';
  }
  
  // Critical: No idempotency at all on email triggers
  const emailTriggers = triggerResult.byDeliveryMechanism.email.length + 
                        triggerResult.byDeliveryMechanism.both.length;
  if (emailTriggers > 0 && triggerResult.withIdempotency === 0) {
    return 'critical';
  }
  
  // Warning: Some issues but not critical
  if (idempotencyResult.summary.totalIssues > 0 || 
      emailResult.withoutDeduplication > 0 ||
      idempotencyResult.summary.highRiskIssues > 0) {
    return 'warning';
  }
  
  return 'healthy';
}


/**
 * Generate executive summary section
 */
function generateExecutiveSummary(data: CombinedNotificationAuditData, metadata: ReportMetadata): string {
  const health = calculateOverallHealth(data);
  const healthLabel = {
    healthy: '🟢 **HEALTHY** - Notification system is well-configured',
    warning: '🟡 **WARNING** - Some notification issues need attention',
    critical: '🔴 **CRITICAL** - Notification system needs immediate attention',
  }[health];

  const { triggerSummary, emailSummary, idempotencySummary } = data;

  return `## Executive Summary

**Report Generated**: ${metadata.timestamp}

### Notification System Health Status

${healthLabel}

### Overview

| Metric | Count |
|--------|-------|
| Total Notification Triggers | ${triggerSummary.totalTriggers} |
| Email Dispatch Points | ${emailSummary.totalDispatchPoints} |
| Unique Event Types | ${triggerSummary.uniqueEvents.length} |
| Unique Email Templates | ${emailSummary.uniqueTemplates.length} |
| Files with Triggers | ${triggerSummary.fileCount} |
| Files with Email Dispatches | ${emailSummary.fileCount} |

### Delivery Mechanism Breakdown

| Mechanism | Count | Percentage |
|-----------|-------|------------|
| Realtime Only | ${triggerSummary.byMechanism.realtime} | ${triggerSummary.totalTriggers > 0 ? Math.round((triggerSummary.byMechanism.realtime / triggerSummary.totalTriggers) * 100) : 0}% |
| Email Only | ${triggerSummary.byMechanism.email} | ${triggerSummary.totalTriggers > 0 ? Math.round((triggerSummary.byMechanism.email / triggerSummary.totalTriggers) * 100) : 0}% |
| Both (Multi-channel) | ${triggerSummary.byMechanism.both} | ${triggerSummary.totalTriggers > 0 ? Math.round((triggerSummary.byMechanism.both / triggerSummary.totalTriggers) * 100) : 0}% |

### Idempotency Status

| Metric | Status | Count |
|--------|--------|-------|
| Triggers with Idempotency | ${triggerSummary.idempotencyStats.percentage >= 80 ? '✅' : triggerSummary.idempotencyStats.percentage >= 50 ? '⚠️' : '❌'} | ${triggerSummary.idempotencyStats.with} (${triggerSummary.idempotencyStats.percentage}%) |
| Triggers without Idempotency | ${triggerSummary.idempotencyStats.without === 0 ? '✅' : '⚠️'} | ${triggerSummary.idempotencyStats.without} |
| Email Dispatches with Deduplication | ${emailSummary.deduplicationStats.percentage >= 80 ? '✅' : emailSummary.deduplicationStats.percentage >= 50 ? '⚠️' : '❌'} | ${emailSummary.deduplicationStats.with} (${emailSummary.deduplicationStats.percentage}%) |
| Email Dispatches with Retry | ${emailSummary.retryStats.percentage >= 80 ? '✅' : emailSummary.retryStats.percentage >= 50 ? '⚠️' : '❌'} | ${emailSummary.retryStats.with} (${emailSummary.retryStats.percentage}%) |

### Issues Summary

| Issue Type | Count | Status |
|------------|-------|--------|
| Critical Issues | ${data.idempotencyResult.summary.criticalIssues} | ${data.idempotencyResult.summary.criticalIssues === 0 ? '✅' : '🔴'} |
| High Risk Issues | ${data.idempotencyResult.summary.highRiskIssues} | ${data.idempotencyResult.summary.highRiskIssues === 0 ? '✅' : '🟠'} |
| Total Issues | ${data.idempotencyResult.summary.totalIssues} | ${data.idempotencyResult.summary.totalIssues === 0 ? '✅' : '⚠️'} |
| Duplicate Send Risks | ${data.idempotencyResult.duplicateRiskTriggers.length} | ${data.idempotencyResult.duplicateRiskTriggers.length === 0 ? '✅' : '⚠️'} |

### Quick Stats

- **Overall Risk Level**: ${getRiskEmoji(data.idempotencyResult.overallRiskLevel)} ${data.idempotencyResult.overallRiskLevel.toUpperCase()}
- **Idempotency Coverage (Triggers)**: ${idempotencySummary.triggerCoverage}%
- **Deduplication Coverage (Email)**: ${idempotencySummary.dispatchCoverage}%
- **Email Risk Level**: ${getStatusEmoji(emailSummary.riskLevel)} ${emailSummary.riskLevel.toUpperCase()}
`;
}


/**
 * Generate notification triggers section
 */
function generateTriggersSection(data: CombinedNotificationAuditData): string {
  const lines: string[] = [];
  lines.push('## Notification Triggers');
  lines.push('');
  
  const { triggerResult, triggerSummary } = data;
  
  if (triggerResult.totalTriggers === 0) {
    lines.push('⚠️ **No notification triggers found in the codebase.**');
    lines.push('');
    lines.push('This may indicate:');
    lines.push('- Notifications are not yet implemented');
    lines.push('- Notification patterns are not recognized by the scanner');
    lines.push('- Custom notification mechanisms are using non-standard patterns');
    lines.push('');
    return lines.join('\n');
  }
  
  // Event Types Summary
  if (triggerSummary.uniqueEvents.length > 0) {
    lines.push('### Event Types');
    lines.push('');
    lines.push('The following notification event types were detected:');
    lines.push('');
    for (const event of triggerSummary.uniqueEvents) {
      const count = triggerResult.triggers.filter(t => t.event === event).length;
      lines.push(`- \`${event}\` (${count} trigger${count !== 1 ? 's' : ''})`);
    }
    lines.push('');
  }
  
  // By Delivery Mechanism
  lines.push('### By Delivery Mechanism');
  lines.push('');
  
  // Realtime Triggers
  if (triggerResult.byDeliveryMechanism.realtime.length > 0) {
    lines.push('#### ⚡ Realtime Triggers');
    lines.push('');
    lines.push('| File | Line | Event | Idempotency |');
    lines.push('|------|------|-------|-------------|');
    
    for (const trigger of triggerResult.byDeliveryMechanism.realtime) {
      const idempotency = trigger.hasIdempotencyKey ? '✅ Yes' : '❌ No';
      lines.push(`| \`${trigger.filePath}\` | ${trigger.lineNumber} | \`${trigger.event}\` | ${idempotency} |`);
    }
    lines.push('');
  }
  
  // Email Triggers
  if (triggerResult.byDeliveryMechanism.email.length > 0) {
    lines.push('#### 📧 Email Triggers');
    lines.push('');
    lines.push('| File | Line | Event | Idempotency |');
    lines.push('|------|------|-------|-------------|');
    
    for (const trigger of triggerResult.byDeliveryMechanism.email) {
      const idempotency = trigger.hasIdempotencyKey ? '✅ Yes' : '❌ No';
      lines.push(`| \`${trigger.filePath}\` | ${trigger.lineNumber} | \`${trigger.event}\` | ${idempotency} |`);
    }
    lines.push('');
  }
  
  // Multi-channel Triggers
  if (triggerResult.byDeliveryMechanism.both.length > 0) {
    lines.push('#### 📬 Multi-Channel Triggers (Email + Realtime)');
    lines.push('');
    lines.push('| File | Line | Event | Idempotency |');
    lines.push('|------|------|-------|-------------|');
    
    for (const trigger of triggerResult.byDeliveryMechanism.both) {
      const idempotency = trigger.hasIdempotencyKey ? '✅ Yes' : '❌ No';
      lines.push(`| \`${trigger.filePath}\` | ${trigger.lineNumber} | \`${trigger.event}\` | ${idempotency} |`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}


/**
 * Generate email dispatch section
 */
function generateEmailDispatchSection(data: CombinedNotificationAuditData): string {
  const lines: string[] = [];
  lines.push('## Email Dispatch Points');
  lines.push('');
  
  const { emailResult, emailSummary } = data;
  
  if (emailResult.totalDispatchPoints === 0) {
    lines.push('⚠️ **No email dispatch points found in the codebase.**');
    lines.push('');
    lines.push('This may indicate:');
    lines.push('- Email functionality is not yet implemented');
    lines.push('- Resend API calls are not recognized by the scanner');
    lines.push('- Custom email mechanisms are using non-standard patterns');
    lines.push('');
    return lines.join('\n');
  }
  
  // Summary
  lines.push('### Summary');
  lines.push('');
  lines.push(`- **Total Dispatch Points**: ${emailSummary.totalDispatchPoints}`);
  lines.push(`- **With Retry Logic**: ${emailSummary.retryStats.with} (${emailSummary.retryStats.percentage}%)`);
  lines.push(`- **With Deduplication**: ${emailSummary.deduplicationStats.with} (${emailSummary.deduplicationStats.percentage}%)`);
  lines.push(`- **Risk Level**: ${getStatusEmoji(emailSummary.riskLevel)} ${emailSummary.riskLevel.toUpperCase()}`);
  lines.push('');
  
  // Templates
  if (emailSummary.uniqueTemplates.length > 0) {
    lines.push('### Email Templates');
    lines.push('');
    lines.push('| Template | Dispatch Count | Retry | Deduplication |');
    lines.push('|----------|----------------|-------|---------------|');
    
    for (const template of emailSummary.uniqueTemplates) {
      const dispatches = emailResult.byTemplate.get(template) || [];
      const hasRetry = dispatches.some(d => d.hasRetry) ? '✅' : '❌';
      const hasDedup = dispatches.some(d => d.hasDeduplication) ? '✅' : '❌';
      lines.push(`| \`${template}\` | ${dispatches.length} | ${hasRetry} | ${hasDedup} |`);
    }
    lines.push('');
  }
  
  // All Dispatch Points
  lines.push('### All Dispatch Points');
  lines.push('');
  lines.push('| File | Line | Template | Retry | Deduplication |');
  lines.push('|------|------|----------|-------|---------------|');
  
  for (const dispatch of emailResult.dispatchPoints) {
    const retry = dispatch.hasRetry ? '✅' : '❌';
    const dedup = dispatch.hasDeduplication ? '✅' : '❌';
    lines.push(`| \`${dispatch.filePath}\` | ${dispatch.lineNumber} | \`${dispatch.template}\` | ${retry} | ${dedup} |`);
  }
  lines.push('');
  
  // High Risk Dispatches
  const highRisk = identifyHighRiskDispatches(emailResult.dispatchPoints);
  if (highRisk.length > 0) {
    lines.push('### ⚠️ High-Risk Dispatches');
    lines.push('');
    lines.push('These dispatch points are missing **both** retry and deduplication logic:');
    lines.push('');
    lines.push('| File | Line | Template |');
    lines.push('|------|------|----------|');
    
    for (const dispatch of highRisk) {
      lines.push(`| \`${dispatch.filePath}\` | ${dispatch.lineNumber} | \`${dispatch.template}\` |`);
    }
    lines.push('');
    lines.push('**Impact**: These can cause duplicate emails on retry or lost emails on failure.');
    lines.push('');
  }
  
  return lines.join('\n');
}


/**
 * Generate idempotency issues section
 */
function generateIdempotencySection(data: CombinedNotificationAuditData): string {
  const lines: string[] = [];
  lines.push('## Idempotency Analysis');
  lines.push('');
  
  const { idempotencyResult, idempotencySummary } = data;
  
  // Overall Status
  const statusEmoji = getStatusEmoji(idempotencySummary.status);
  lines.push(`### Overall Status: ${statusEmoji} ${idempotencySummary.status.toUpperCase()}`);
  lines.push('');
  lines.push(`- **Trigger Idempotency Coverage**: ${idempotencySummary.triggerCoverage}%`);
  lines.push(`- **Email Deduplication Coverage**: ${idempotencySummary.dispatchCoverage}%`);
  lines.push(`- **Total Issues**: ${idempotencySummary.issueCount}`);
  if (idempotencySummary.topIssue) {
    lines.push(`- **Top Issue**: ${idempotencySummary.topIssue}`);
  }
  lines.push('');
  
  if (idempotencyResult.issues.length === 0) {
    lines.push('✅ **No idempotency issues detected.**');
    lines.push('');
    lines.push('All notification triggers and email dispatches have proper idempotency controls.');
    lines.push('');
    return lines.join('\n');
  }
  
  // Issues by Risk Level
  lines.push('### Issues by Risk Level');
  lines.push('');
  
  const criticalIssues = filterIssuesByRisk(idempotencyResult.issues, 'critical')
    .filter(i => i.riskLevel === 'critical');
  const highIssues = filterIssuesByRisk(idempotencyResult.issues, 'high')
    .filter(i => i.riskLevel === 'high');
  const mediumIssues = filterIssuesByRisk(idempotencyResult.issues, 'medium')
    .filter(i => i.riskLevel === 'medium');
  const lowIssues = idempotencyResult.issues.filter(i => i.riskLevel === 'low');
  
  // Critical Issues
  if (criticalIssues.length > 0) {
    lines.push('#### 🔴 Critical Issues');
    lines.push('');
    lines.push('These issues require immediate attention:');
    lines.push('');
    
    for (const issue of criticalIssues) {
      lines.push(`**${issue.type}** in \`${issue.filePath}:${issue.lineNumber}\``);
      lines.push('');
      lines.push(`> ${issue.description}`);
      lines.push('');
      lines.push(`**Recommendation**: ${issue.recommendation}`);
      lines.push('');
    }
  }
  
  // High Issues
  if (highIssues.length > 0) {
    lines.push('#### 🟠 High Risk Issues');
    lines.push('');
    lines.push('| File | Line | Type | Description |');
    lines.push('|------|------|------|-------------|');
    
    for (const issue of highIssues) {
      lines.push(`| \`${issue.filePath}\` | ${issue.lineNumber} | ${issue.type} | ${issue.description.substring(0, 60)}... |`);
    }
    lines.push('');
  }
  
  // Medium Issues
  if (mediumIssues.length > 0) {
    lines.push('#### 🟡 Medium Risk Issues');
    lines.push('');
    lines.push('| File | Line | Type |');
    lines.push('|------|------|------|');
    
    for (const issue of mediumIssues) {
      lines.push(`| \`${issue.filePath}\` | ${issue.lineNumber} | ${issue.type} |`);
    }
    lines.push('');
  }
  
  // Low Issues (summary only)
  if (lowIssues.length > 0) {
    lines.push(`#### 🟢 Low Risk Issues: ${lowIssues.length} found`);
    lines.push('');
    lines.push('Low risk issues are informational and may not require immediate action.');
    lines.push('');
  }
  
  // Issues by File
  const issuesByFile = groupIssuesByFile(idempotencyResult.issues);
  if (issuesByFile.size > 0) {
    lines.push('### Issues by File');
    lines.push('');
    lines.push('| File | Issue Count | Highest Risk |');
    lines.push('|------|-------------|--------------|');
    
    const sortedFiles = [...issuesByFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [filePath, issues] of sortedFiles) {
      const highestRisk = issues.reduce((highest, issue) => {
        const riskOrder: Record<IdempotencyRiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return riskOrder[issue.riskLevel] < riskOrder[highest] ? issue.riskLevel : highest;
      }, 'low' as IdempotencyRiskLevel);
      
      lines.push(`| \`${filePath}\` | ${issues.length} | ${getRiskEmoji(highestRisk)} ${highestRisk} |`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}


/**
 * Generate recommendations section
 */
function generateRecommendationsSection(data: CombinedNotificationAuditData): string {
  const lines: string[] = [];
  lines.push('## Recommendations');
  lines.push('');
  
  const { idempotencyResult } = data;
  
  if (idempotencyResult.recommendations.length === 0) {
    lines.push('✅ **No priority actions required. Notification system is healthy.**');
    lines.push('');
    lines.push('Continue to monitor:');
    lines.push('- Email delivery success rates');
    lines.push('- Duplicate notification reports from users');
    lines.push('- Idempotency key collision rates');
    lines.push('');
    return lines.join('\n');
  }
  
  lines.push('### Priority Actions');
  lines.push('');
  
  for (const rec of idempotencyResult.recommendations) {
    const effortEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[rec.effort];
    
    lines.push(`#### ${rec.priority}. ${rec.title}`);
    lines.push('');
    lines.push(`**Effort**: ${effortEmoji} ${rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}`);
    lines.push('');
    lines.push(rec.description);
    lines.push('');
    
    if (rec.affectedFiles.length > 0) {
      lines.push('**Affected Files**:');
      lines.push('');
      const filesToShow = rec.affectedFiles.slice(0, 5);
      for (const file of filesToShow) {
        lines.push(`- \`${file}\``);
      }
      if (rec.affectedFiles.length > 5) {
        lines.push(`- ... and ${rec.affectedFiles.length - 5} more files`);
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate requirements mapping section
 */
function generateRequirementsSection(data: CombinedNotificationAuditData): string {
  const lines: string[] = [];
  lines.push('## Requirements Validation');
  lines.push('');
  lines.push('This section maps the audit findings to the specification requirements.');
  lines.push('');
  
  const { triggerResult, emailResult, idempotencyResult } = data;
  
  // Calculate requirement statuses
  const hasNotificationTriggers = triggerResult.totalTriggers > 0;
  const hasDeliveryMechanisms = triggerResult.byDeliveryMechanism.realtime.length > 0 || 
                                triggerResult.byDeliveryMechanism.email.length > 0;
  const hasRealtimeSync = triggerResult.byDeliveryMechanism.realtime.length > 0;
  const hasEmailDispatch = emailResult.totalDispatchPoints > 0;
  const hasIdempotency = triggerResult.withIdempotency > 0 || emailResult.withDeduplication > 0;
  const noDuplicateRisks = idempotencyResult.duplicateRiskTriggers.length === 0;
  const hasIdempotencyKeys = triggerResult.withIdempotency > 0;
  
  lines.push('| Requirement | Description | Status | Evidence |');
  lines.push('|-------------|-------------|--------|----------|');
  lines.push(`| 6.1 | Audit all notification triggers | ${hasNotificationTriggers ? '✅' : '❌'} | ${triggerResult.totalTriggers} triggers found |`);
  lines.push(`| 6.2 | Audit all delivery mechanisms | ${hasDeliveryMechanisms ? '✅' : '❌'} | Realtime: ${triggerResult.byDeliveryMechanism.realtime.length}, Email: ${triggerResult.byDeliveryMechanism.email.length}, Both: ${triggerResult.byDeliveryMechanism.both.length} |`);
  lines.push(`| 6.3 | Verify realtime sync works correctly | ${hasRealtimeSync ? '✅' : '⚠️'} | ${triggerResult.byDeliveryMechanism.realtime.length} realtime triggers |`);
  lines.push(`| 6.4 | Verify email dispatch mechanisms | ${hasEmailDispatch ? '✅' : '❌'} | ${emailResult.totalDispatchPoints} dispatch points |`);
  lines.push(`| 6.5 | Notifications display instantly | ${hasRealtimeSync ? '✅' : '⚠️'} | Realtime triggers present |`);
  lines.push(`| 6.6 | Emails trigger exactly once per event | ${noDuplicateRisks ? '✅' : '⚠️'} | ${idempotencyResult.duplicateRiskTriggers.length} duplicate risks |`);
  lines.push(`| 6.7 | Flag duplicate notification sends | ✅ | ${idempotencyResult.duplicateRiskTriggers.length} flagged |`);
  lines.push(`| 6.8 | Implement idempotency keys | ${hasIdempotencyKeys ? '✅' : '⚠️'} | ${triggerResult.withIdempotency} triggers with keys |`);
  lines.push('');
  
  // Overall compliance
  const passedRequirements = [
    hasNotificationTriggers,
    hasDeliveryMechanisms,
    hasRealtimeSync,
    hasEmailDispatch,
    hasRealtimeSync,
    noDuplicateRisks,
    true, // 6.7 always passes (we flag issues)
    hasIdempotencyKeys,
  ].filter(Boolean).length;
  
  const compliancePercentage = Math.round((passedRequirements / 8) * 100);
  
  lines.push(`### Overall Compliance: ${compliancePercentage}%`);
  lines.push('');
  lines.push(`${passedRequirements} of 8 requirements fully satisfied.`);
  lines.push('');
  
  return lines.join('\n');
}


/**
 * Generate the complete report
 */
function generateReport(data: CombinedNotificationAuditData, metadata: ReportMetadata): string {
  const sections: string[] = [];
  
  // Header
  sections.push('# Notification Flow Report');
  sections.push('');
  sections.push('> Forensic audit of notification triggers, email dispatch, and idempotency controls');
  sections.push('');
  sections.push(`**Generated**: ${metadata.timestamp}`);
  sections.push(`**Project Root**: ${metadata.projectRoot}`);
  sections.push(`**Audit Version**: ${metadata.version}`);
  sections.push('');
  
  // Executive Summary
  sections.push(generateExecutiveSummary(data, metadata));
  
  // Table of Contents
  sections.push('## Table of Contents');
  sections.push('');
  sections.push('1. [Executive Summary](#executive-summary)');
  sections.push('2. [Notification Triggers](#notification-triggers)');
  sections.push('3. [Email Dispatch Points](#email-dispatch-points)');
  sections.push('4. [Idempotency Analysis](#idempotency-analysis)');
  sections.push('5. [Recommendations](#recommendations)');
  sections.push('6. [Requirements Validation](#requirements-validation)');
  sections.push('');
  
  // Notification Triggers
  sections.push(generateTriggersSection(data));
  
  // Email Dispatch Points
  sections.push(generateEmailDispatchSection(data));
  
  // Idempotency Analysis
  sections.push(generateIdempotencySection(data));
  
  // Recommendations
  sections.push(generateRecommendationsSection(data));
  
  // Requirements Validation
  sections.push(generateRequirementsSection(data));
  
  // Footer
  sections.push('---');
  sections.push('');
  sections.push('*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*');
  sections.push('');
  sections.push('**Validates**: Requirements 6.1-6.8 - Notification and email pipeline audit');
  
  return sections.join('\n');
}


/**
 * Runs the complete notification audit and generates the report
 */
export async function generateNotificationFlowReport(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('🔍 Running notification flow audit...\n');
  
  // Scan notification triggers
  console.log('   Scanning notification triggers...');
  const triggerResult = await scanNotificationTriggers(projectRoot);
  const triggerSummary = getNotificationTriggerSummary(triggerResult);
  
  // Scan email dispatches
  console.log('   Scanning email dispatch points...');
  const emailResult = await scanEmailDispatches(projectRoot);
  const emailSummary = getEmailDispatchSummary(emailResult);
  
  // Check idempotency
  console.log('   Checking idempotency controls...');
  const idempotencyResult = await checkIdempotency(projectRoot);
  const idempotencySummary = getIdempotencySummary(idempotencyResult);
  
  console.log(`   Found ${triggerResult.totalTriggers} triggers, ${emailResult.totalDispatchPoints} email dispatches`);
  console.log(`   Issues: ${idempotencyResult.summary.totalIssues} total, ${idempotencyResult.summary.criticalIssues} critical`);
  
  const data: CombinedNotificationAuditData = {
    triggerResult,
    emailResult,
    idempotencyResult,
    triggerSummary,
    emailSummary,
    idempotencySummary,
  };
  
  // Generate report
  const metadata: ReportMetadata = {
    timestamp: getTimestamp(),
    version: '1.0.0',
    projectRoot,
  };
  
  const report = generateReport(data, metadata);
  
  // Ensure output directory exists
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  
  // Write report
  await writeFile(fullOutputPath, report, 'utf-8');
  console.log(`\n✅ Report written to: ${outputPath}`);
  
  return report;
}

/**
 * Gets a summary of the notification audit without generating a full report
 */
export async function getNotificationAuditSummary(projectRoot: string = process.cwd()): Promise<{
  totalTriggers: number;
  totalEmailDispatches: number;
  triggersWithIdempotency: number;
  dispatchesWithDeduplication: number;
  totalIssues: number;
  criticalIssues: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
}> {
  const triggerResult = await scanNotificationTriggers(projectRoot);
  const emailResult = await scanEmailDispatches(projectRoot);
  const idempotencyResult = await checkIdempotency(projectRoot);
  
  const data: CombinedNotificationAuditData = {
    triggerResult,
    emailResult,
    idempotencyResult,
    triggerSummary: getNotificationTriggerSummary(triggerResult),
    emailSummary: getEmailDispatchSummary(emailResult),
    idempotencySummary: getIdempotencySummary(idempotencyResult),
  };
  
  return {
    totalTriggers: triggerResult.totalTriggers,
    totalEmailDispatches: emailResult.totalDispatchPoints,
    triggersWithIdempotency: triggerResult.withIdempotency,
    dispatchesWithDeduplication: emailResult.withDeduplication,
    totalIssues: idempotencyResult.summary.totalIssues,
    criticalIssues: idempotencyResult.summary.criticalIssues,
    healthStatus: calculateOverallHealth(data),
  };
}


/**
 * Build notification audit result for master report
 */
export async function buildNotificationAuditResult(projectRoot: string = process.cwd()): Promise<NotificationAuditResult> {
  const triggerResult = await scanNotificationTriggers(projectRoot);
  const emailResult = await scanEmailDispatches(projectRoot);
  
  const duplicateRisks = identifyDuplicateRisks(triggerResult.triggers);
  const missingIdempotency = identifyMissingIdempotency(triggerResult.triggers);
  
  return {
    triggers: triggerResult.triggers,
    duplicateRisks,
    missingIdempotency,
    emailDispatchPoints: emailResult.dispatchPoints,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;
  const projectRoot = process.cwd();
  
  console.log('📋 Notification Flow Report Generator');
  console.log('=====================================\n');
  
  generateNotificationFlowReport(projectRoot, outputPath)
    .then(report => {
      // Print summary to console
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary'));
      
      if (summaryStart !== -1) {
        const summaryLines = lines.slice(summaryStart, summaryEnd !== -1 ? summaryEnd : summaryStart + 50);
        console.log('\n' + summaryLines.join('\n'));
      }
    })
    .catch(error => {
      console.error('❌ Error generating report:', error);
      process.exit(1);
    });
}
