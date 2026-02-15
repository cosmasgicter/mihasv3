/**
 * Auth Workflow Report Generator
 * Validates: Requirements 4.1-4.10
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { mapWorkflows } from './workflowMapper';
import { analyzeAuthState } from './stateAnalyzer';
import { scanAdminPagesForRoleEnforcement } from './roleChecker';
import { analyzeRedirects } from './redirectAnalyzer';
import { detectSecurityIssues } from './securityDetector';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/auth-workflow-report.md';

interface CombinedAuthAuditData {
  workflowMapping: ReturnType<typeof mapWorkflows>;
  stateAnalysis: ReturnType<typeof analyzeAuthState>;
  roleEnforcement: ReturnType<typeof scanAdminPagesForRoleEnforcement>;
  redirectAnalysis: ReturnType<typeof analyzeRedirects>;
  securityDetection: ReturnType<typeof detectSecurityIssues>;
}

function collectAuthAuditData(projectRoot: string = process.cwd()): CombinedAuthAuditData {
  const workflowMapping = mapWorkflows(projectRoot);
  const stateAnalysis = analyzeAuthState(projectRoot);
  const roleEnforcement = scanAdminPagesForRoleEnforcement(projectRoot);
  const redirectAnalysis = analyzeRedirects(projectRoot);
  const securityDetection = detectSecurityIssues(projectRoot);
  return { workflowMapping, stateAnalysis, roleEnforcement, redirectAnalysis, securityDetection };
}

function calculateOverallHealth(data: CombinedAuthAuditData): 'healthy' | 'warning' | 'critical' {
  if (data.securityDetection.summary.criticalCount > 0 || data.roleEnforcement.pagesMissingRoleChecks > 0) return 'critical';
  if (data.securityDetection.summary.highCount > 0 || data.stateAnalysis.isFragmented || data.redirectAnalysis.summary.loopCount > 0) return 'warning';
  return 'healthy';
}

export function generateAuthWorkflowReport(data: CombinedAuthAuditData): string {
  return [
    '# Auth Workflow Report',
    '',
    `**Generated**: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Student workflow steps: ${data.workflowMapping.studentWorkflow.length}`,
    `- Admin workflow steps: ${data.workflowMapping.adminWorkflow.length}`,
    `- Auth state fragmented: ${data.stateAnalysis.isFragmented ? 'Yes' : 'No'}`,
    `- Admin pages missing role checks: ${data.roleEnforcement.pagesMissingRoleChecks}`,
    `- Redirect loops: ${data.redirectAnalysis.summary.loopCount}`,
    `- Security issues: ${data.securityDetection.summary.totalIssues}`,
    `- Health status: ${calculateOverallHealth(data)}`,
    '',
  ].join('\n');
}

export async function generateAuthWorkflowReportFile(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH,
): Promise<string> {
  const data = collectAuthAuditData(projectRoot);
  const report = generateAuthWorkflowReport(data);
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  await writeFile(fullOutputPath, report, 'utf-8');
  return report;
}

export function getAuthAuditSummary(projectRoot: string = process.cwd()) {
  const data = collectAuthAuditData(projectRoot);
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
    healthStatus: calculateOverallHealth(data),
  };
}

if (import.meta.main) {
  generateAuthWorkflowReportFile().then(() => {
    console.log('✅ Auth workflow report generated');
  }).catch(err => {
    console.error('❌ Error generating auth workflow report:', err);
    process.exit(1);
  });
}
