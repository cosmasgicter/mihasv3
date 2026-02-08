/**
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
