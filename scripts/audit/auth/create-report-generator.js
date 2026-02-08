const fs = require('fs');

const content = `/**
 * Auth Workflow Report Generator
 * Validates: Requirements 4.1-4.10
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { AuthAuditResult, SecuritySeverity, BrokenTransition } from '../types';
import { mapWorkflows, toAuthFlowSteps, type WorkflowMappingResult, type WorkflowStepInfo } from './workflowMapper';
import { analyzeAuthState, toAuthAuditStateManagement, type AuthStateAnalysisResult } from './stateAnalyzer';
import { scanAdminPagesForRoleEnforcement, type RoleEnforcementSummary } from './roleChecker';
import { analyzeRedirects, type RedirectAnalysisResult } from './redirectAnalyzer';
import { detectSecurityIssues, type SecurityDetectionResult } from './securityDetector';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/auth-workflow-report.md';

interface CombinedAuthAuditData {
  workflowMapping: WorkflowMappingResult;
  stateAnalysis: AuthStateAnalysisResult;
  roleEnforcement: RoleEnforcementSummary;
  redirectAnalysis: RedirectAnalysisResult;
  securityDetection: SecurityDetectionResult;
}

const getTimestamp = (): string => new Date().toISOString();
const getSeverityEmoji = (s: SecuritySeverity): string => 
  ({ critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[s] || '⚪');
const getStatusEmoji = (s: boolean): string => s ? '✅' : '❌';

function calculateOverallHealth(data: CombinedAuthAuditData): 'healthy' | 'warning' | 'critical' {
  const { securityDetection, stateAnalysis, roleEnforcement, redirectAnalysis } = data;
  if (securityDetection.summary.criticalCount > 0 || roleEnforcement.pagesMissingRoleChecks > 0) return 'critical';
  if (securityDetection.summary.highCount > 0 || securityDetection.brokenTransitions.length > 0 || 
      stateAnalysis.isFragmented || redirectAnalysis.summary.loopCount > 0) return 'warning';
  return 'healthy';
}

function collectAuthAuditData(projectRoot: string = process.cwd()): CombinedAuthAuditData {
  console.log('   Mapping workflows...');
  const workflowMapping = mapWorkflows(projectRoot);
  console.log('   Analyzing auth state...');
  const stateAnalysis = analyzeAuthState(projectRoot);
  console.log('   Checking role enforcement...');
  const roleEnforcement = scanAdminPagesForRoleEnforcement(projectRoot);
  console.log('   Analyzing redirects...');
  const redirectAnalysis = analyzeRedirects(projectRoot);
  console.log('   Detecting security issues...');
  const securityDetection = detectSecurityIssues(projectRoot);
  return { workflowMapping, stateAnalysis, roleEnforcement, redirectAnalysis, securityDetection };
}
`;

const part2 = `
export function generateAuthWorkflowReport(data: CombinedAuthAuditData): string {
  const health = calculateOverallHealth(data);
  const healthStatus = health === 'critical' ? '🔴 **CRITICAL** - Immediate action required'
    : health === 'warning' ? '🟡 **WARNING** - Issues need attention' : '🟢 **HEALTHY** - Auth system is well-configured';
  const { summary } = data.securityDetection;
  
  const sections: string[] = [
    '# Auth Workflow Report',
    '',
    '> Forensic audit of authentication workflows, state management, role enforcement, and security issues.',
    '',
    '**Generated**: ' + getTimestamp(),
    '**Audit Version**: 1.0.0',
    '',
    '## Executive Summary',
    '',
    '### Auth System Health Status',
    healthStatus,
    '',
    '### Overview',
    '| Metric | Count | Status |',
    '|--------|-------|--------|',
    '| Student Workflow Steps | ' + data.workflowMapping.studentWorkflow.length + ' | ' + getStatusEmoji(data.workflowMapping.studentWorkflow.every(s => !s.filePath.includes('[NOT FOUND'))) + ' |',
    '| Admin Workflow Steps | ' + data.workflowMapping.adminWorkflow.length + ' | ' + getStatusEmoji(data.workflowMapping.adminWorkflow.every(s => !s.filePath.includes('[NOT FOUND'))) + ' |',
    '| Auth State Sources | ' + (data.stateAnalysis.stores.length + data.stateAnalysis.contexts.length) + ' | ' + getStatusEmoji(!data.stateAnalysis.isFragmented) + ' |',
    '| Admin Pages Audited | ' + data.roleEnforcement.totalAdminPages + ' | ' + getStatusEmoji(data.roleEnforcement.pagesMissingRoleChecks === 0) + ' |',
    '| Redirects Analyzed | ' + data.redirectAnalysis.summary.totalRedirects + ' | ' + getStatusEmoji(data.redirectAnalysis.summary.inappropriateCount === 0) + ' |',
    '',
    '### Security Issues by Severity',
    '| Severity | Count | Status |',
    '|----------|-------|--------|',
    '| ' + getSeverityEmoji('critical') + ' Critical | ' + summary.criticalCount + ' | ' + (summary.criticalCount === 0 ? '✅' : '⚠️') + ' |',
    '| ' + getSeverityEmoji('high') + ' High | ' + summary.highCount + ' | ' + (summary.highCount === 0 ? '✅' : '⚠️') + ' |',
    '| ' + getSeverityEmoji('medium') + ' Medium | ' + summary.mediumCount + ' | ' + (summary.mediumCount === 0 ? '✅' : 'ℹ️') + ' |',
    '| ' + getSeverityEmoji('low') + ' Low | ' + summary.lowCount + ' | ' + (summary.lowCount === 0 ? '✅' : 'ℹ️') + ' |',
    '',
    '### Key Findings',
    '| Area | Finding |',
    '|------|---------|',
    '| Auth State Fragmentation | ' + (data.stateAnalysis.isFragmented ? '⚠️ Fragmented across multiple sources' : '✅ Single source of truth') + ' |',
    '| Role Enforcement | ' + (data.roleEnforcement.pagesMissingRoleChecks === 0 ? '✅ All admin pages protected' : '⚠️ ' + data.roleEnforcement.pagesMissingRoleChecks + ' pages missing role checks') + ' |',
    '| Redirect Logic | ' + (data.redirectAnalysis.summary.inappropriateCount === 0 ? '✅ All redirects appropriate' : '⚠️ ' + data.redirectAnalysis.summary.inappropriateCount + ' inappropriate redirects') + ' |',
    '| Redirect Loops | ' + (data.redirectAnalysis.summary.loopCount === 0 ? '✅ No redirect loops' : '🔴 ' + data.redirectAnalysis.summary.loopCount + ' redirect loops detected') + ' |',
    '| Broken Transitions | ' + (data.securityDetection.brokenTransitions.length === 0 ? '✅ All workflow transitions valid' : '⚠️ ' + data.securityDetection.brokenTransitions.length + ' broken transitions') + ' |',
    '',
  ];
  
  // Student Workflow
  sections.push('## Student Workflow Mapping', '', '**Expected Flow**: Registration → Email Verification → Profile Setup → Application Wizard → Payment → Interview → Decision', '');
  sections.push('| Step | Component | Route | Guard | Auth Required | Status |', '|------|-----------|-------|-------|---------------|--------|');
  for (const step of data.workflowMapping.studentWorkflow) {
    const status = step.filePath.includes('[NOT FOUND') ? '❌ Missing' : '✅ Found';
    sections.push('| ' + step.action + ' | \\`' + step.component + '\\` | \\`' + (step.routePath || 'N/A') + '\\` | ' + (step.guard || 'none') + ' | ' + (step.requiresAuth ? 'Yes' : 'No') + ' | ' + status + ' |');
  }
  sections.push('');
  
  // Admin Workflow
  sections.push('## Admin Workflow Mapping', '', '**Expected Flow**: Login → Dashboard → Actions (review, approve, reject, etc.)', '');
  sections.push('| Step | Component | Route | Guard | Roles | Status |', '|------|-----------|-------|-------|-------|--------|');
  for (const step of data.workflowMapping.adminWorkflow) {
    const status = step.filePath.includes('[NOT FOUND') ? '❌ Missing' : '✅ Found';
    const roles = step.roleRequired?.join(', ') || 'N/A';
    sections.push('| ' + step.action + ' | \\`' + step.component + '\\` | \\`' + (step.routePath || 'N/A') + '\\` | ' + (step.guard || 'none') + ' | ' + roles + ' | ' + status + ' |');
  }
  sections.push('');
  
  // Auth State Analysis
  sections.push('## Auth State Management Analysis', '');
  sections.push('### Status: ' + (data.stateAnalysis.isFragmented ? '🟡 **WARNING**: Auth state is fragmented' : '🟢 **HEALTHY**: Single source of truth'), '');
  sections.push('| Type | Count | Sources |', '|------|-------|---------|');
  sections.push('| Zustand Stores | ' + data.stateAnalysis.stores.length + ' | ' + (data.stateAnalysis.stores.map(s => '\\`' + s.name + '\\`').join(', ') || 'None') + ' |');
  sections.push('| React Contexts | ' + data.stateAnalysis.contexts.length + ' | ' + (data.stateAnalysis.contexts.map(c => '\\`' + c.name + '\\`').join(', ') || 'None') + ' |');
  sections.push('| State Hooks | ' + data.stateAnalysis.stateHooks.length + ' | ' + (data.stateAnalysis.stateHooks.map(h => '\\`' + h.name + '\\`').join(', ') || 'None') + ' |');
  sections.push('');
  
  // Role Enforcement
  sections.push('## Role Enforcement Audit', '');
  const roleHealthStatus = data.roleEnforcement.pagesMissingRoleChecks === 0
    ? '🟢 **HEALTHY**: All admin pages have proper role enforcement'
    : data.roleEnforcement.criticalIssues > 0 ? '🔴 **CRITICAL**: Admin pages missing role checks' : '🟡 **WARNING**: Some role enforcement issues detected';
  sections.push('### Status: ' + roleHealthStatus, '');
  sections.push('| Metric | Count |', '|--------|-------|');
  sections.push('| Total Admin Pages | ' + data.roleEnforcement.totalAdminPages + ' |');
  sections.push('| Pages with Role Checks | ' + data.roleEnforcement.pagesWithRoleChecks + ' |');
  sections.push('| Pages Missing Role Checks | ' + data.roleEnforcement.pagesMissingRoleChecks + ' |');
  sections.push('| Total Security Issues | ' + data.roleEnforcement.totalSecurityIssues + ' |');
  sections.push('');
  
  // Redirect Analysis
  sections.push('## Redirect Logic Analysis', '');
  const redirectHealthStatus = data.redirectAnalysis.summary.loopCount > 0 ? '🔴 **CRITICAL**: Redirect loops detected'
    : data.redirectAnalysis.summary.inappropriateCount > 0 ? '🟡 **WARNING**: Some inappropriate redirects found' : '🟢 **HEALTHY**: All redirects are appropriate';
  sections.push('### Status: ' + redirectHealthStatus, '');
  sections.push('| Metric | Count |', '|--------|-------|');
  sections.push('| Total Redirects | ' + data.redirectAnalysis.summary.totalRedirects + ' |');
  sections.push('| Inappropriate Redirects | ' + data.redirectAnalysis.summary.inappropriateCount + ' |');
  sections.push('| Redirect Loops | ' + data.redirectAnalysis.summary.loopCount + ' |');
  sections.push('');
  
  // Security Issues
  sections.push('## Security Issues', '');
  if (data.securityDetection.summary.totalIssues === 0) {
    sections.push('✅ **No security issues detected!**', '');
  } else {
    sections.push('| Type | Count |', '|------|-------|');
    for (const [type, count] of Object.entries(data.securityDetection.summary.byType)) {
      if (count > 0) sections.push('| ' + type + ' | ' + count + ' |');
    }
    sections.push('');
  }
  
  // Broken Transitions
  sections.push('## Broken Workflow Transitions', '');
  if (data.securityDetection.brokenTransitions.length === 0) {
    sections.push('✅ **All workflow transitions are valid!**', '');
  } else {
    sections.push('⚠️ **' + data.securityDetection.brokenTransitions.length + ' broken transition(s) detected**', '');
    for (const t of data.securityDetection.brokenTransitions) {
      sections.push('### ' + t.fromStep + ' → ' + t.toStep, '', '- **Reason**: ' + t.reason, '- **File**: \\`' + t.evidence.filePath + '\\`', '');
    }
  }
  
  // Stale Session Risks
  sections.push('## Stale Session Risks', '');
  if (data.securityDetection.staleSessionRisks.length === 0) {
    sections.push('✅ **No stale session risks detected!**', '');
  } else {
    sections.push('⚠️ **' + data.securityDetection.staleSessionRisks.length + ' stale session risk(s) detected**', '');
    for (const risk of data.securityDetection.staleSessionRisks) {
      sections.push('- ' + risk);
    }
    sections.push('');
  }
  
  // Footer
  sections.push('---', '', '*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*', '', '**Validates**: Requirements 4.1-4.10 - Auth and Workflow Coherence');
  
  return sections.join('\\n');
}

export async function generateAuthWorkflowReportFile(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('🔍 Running auth workflow audit...\\n');
  const data = collectAuthAuditData(projectRoot);
  console.log('\\n   Student workflow steps: ' + data.workflowMapping.studentWorkflow.length);
  console.log('   Admin workflow steps: ' + data.workflowMapping.adminWorkflow.length);
  console.log('   Auth state sources: ' + (data.stateAnalysis.stores.length + data.stateAnalysis.contexts.length));
  console.log('   Admin pages audited: ' + data.roleEnforcement.totalAdminPages);
  console.log('   Redirects analyzed: ' + data.redirectAnalysis.summary.totalRedirects);
  console.log('   Security issues: ' + data.securityDetection.summary.totalIssues);
  
  const report = generateAuthWorkflowReport(data);
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });
  await writeFile(fullOutputPath, report, 'utf-8');
  console.log('\\n✅ Report written to: ' + outputPath);
  return report;
}

export function getAuthAuditSummary(projectRoot: string = process.cwd()) {
  const data = collectAuthAuditData(projectRoot);
  const health = calculateOverallHealth(data);
  return {
    studentWorkflowSteps: data.workflowMapping.studentWorkflow.length,
    adminWorkflowSteps: data.workflowMapping.adminWorkflow.length,
    authStateSources: data.stateAnalysis.stores.length + data.stateAnalysis.contexts.length,
    isFragmented: data.stateAnalysis.isFragmented,
    adminPagesAudited: data.roleEnforcement.totalAdminPages,
    pagesMissingRoleChecks: data.roleEnforcement.pagesMissingRoleChecks,
    totalRedirects: data.redirectAnalysis.summary.totalRedirects,
    inappropriateRedirects: data.redirectAnalysis.summary.inappropriateCount,
    redirectLoops: data.redirectAnalysis.summary.loopCount,
    securityIssues: data.securityDetection.summary.totalIssues,
    criticalIssues: data.securityDetection.summary.criticalCount,
    brokenTransitions: data.securityDetection.brokenTransitions.length,
    healthStatus: health,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;
  console.log('📋 Auth Workflow Report Generator');
  console.log('==================================\\n');
  generateAuthWorkflowReportFile(process.cwd(), outputPath)
    .then(report => {
      const lines = report.split('\\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary'));
      if (summaryStart !== -1) {
        const summaryLines = lines.slice(summaryStart, summaryEnd !== -1 ? summaryEnd : summaryStart + 50);
        console.log('\\n' + summaryLines.join('\\n'));
      }
    })
    .catch(error => {
      console.error('❌ Error generating report:', error);
      process.exit(1);
    });
}
`;

fs.writeFileSync('./scripts/audit/auth/reportGenerator.ts', content + part2);
console.log('Full file written:', (content + part2).length, 'bytes');
