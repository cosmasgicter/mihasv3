/**
 * Final Clean Architecture Summary Generator
 * 
 * Aggregates results from all 8 forensic auditors into a single executive
 * summary report with issue counts and prioritized action items.
 * 
 * Usage:
 *   bun run scripts/audit/generateSummary.ts
 * 
 * Output:
 *   forensic_reports/final-clean-architecture-summary.md
 * 
 * @module scripts/audit/generateSummary
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { getContractAuditSummary } from './contract/reportGenerator';
import { getAuthAuditSummary } from './auth/reportGenerator';
import { getDeadCodeAuditSummary } from './deadcode/reportGenerator';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/final-clean-architecture-summary.md';

interface SummaryData {
  timestamp: string;
  contract: Awaited<ReturnType<typeof getContractAuditSummary>>;
  auth: Awaited<ReturnType<typeof getAuthAuditSummary>>;
  deadCode: ReturnType<typeof getDeadCodeAuditSummary>;
}

function getHealthEmoji(status: string): string {
  return { healthy: '🟢', warning: '🟡', critical: '🔴' }[status] || '⚪';
}

function generateSummaryReport(data: SummaryData): string {
  const { contract, auth, deadCode } = data;

  const overallHealth = [contract.healthStatus, auth.healthStatus, deadCode.healthStatus]
    .includes('critical') ? 'critical'
    : [contract.healthStatus, auth.healthStatus, deadCode.healthStatus]
      .includes('warning') ? 'warning' : 'healthy';

  const healthLabel = {
    healthy: '🟢 **HEALTHY** — System is well-architected',
    warning: '🟡 **WARNING** — Issues detected that need attention',
    critical: '🔴 **CRITICAL** — Immediate action required',
  }[overallHealth];

  const lines: string[] = [];

  // Header
  lines.push('# Final Clean Architecture Summary');
  lines.push('');
  lines.push('> Executive summary of the MIHAS Frontend-Backend Forensic Audit');
  lines.push('');
  lines.push(`**Generated**: ${data.timestamp}`);
  lines.push('');

  // Overall Health
  lines.push('## Overall System Health');
  lines.push('');
  lines.push(healthLabel);
  lines.push('');

  // Subsystem Health Table
  lines.push('## Subsystem Health');
  lines.push('');
  lines.push('| Subsystem | Status | Key Metric |');
  lines.push('|-----------|--------|------------|');
  lines.push(`| Frontend-Backend Contract | ${getHealthEmoji(contract.healthStatus)} ${contract.healthStatus} | ${contract.totalMismatches} mismatches |`);
  lines.push(`| Auth & Security | ${getHealthEmoji(auth.healthStatus)} ${auth.healthStatus} | ${auth.securityIssues} security issues |`);
  lines.push(`| Dead Code | ${getHealthEmoji(deadCode.healthStatus)} ${deadCode.healthStatus} | ${deadCode.totalDeadCodeItems} items, ~${deadCode.totalLinesRemovable} lines removable |`);
  lines.push('');

  // Issue Counts
  lines.push('## Issue Counts');
  lines.push('');
  lines.push('### Contract Audit');
  lines.push('');
  lines.push(`- Frontend API Calls: ${contract.frontendCalls}`);
  lines.push(`- Backend Endpoints: ${contract.backendEndpoints}`);
  lines.push(`- Missing Endpoints: ${contract.mismatchesByType.MISSING_ENDPOINT}`);
  lines.push(`- Unused Endpoints: ${contract.mismatchesByType.UNUSED_ENDPOINT}`);
  lines.push(`- Method Mismatches: ${contract.mismatchesByType.METHOD_MISMATCH}`);
  lines.push(`- Schema Mismatches: ${contract.mismatchesByType.SCHEMA_MISMATCH}`);
  lines.push(`- Auth Mismatches: ${contract.mismatchesByType.AUTH_MISMATCH}`);
  lines.push('');

  lines.push('### Auth & Security');
  lines.push('');
  lines.push(`- Student Workflow Steps: ${auth.studentWorkflowSteps}`);
  lines.push(`- Admin Workflow Steps: ${auth.adminWorkflowSteps}`);
  lines.push(`- Auth State Sources: ${auth.authStateSources}`);
  lines.push(`- State Fragmented: ${auth.isFragmented ? 'Yes ⚠️' : 'No ✅'}`);
  lines.push(`- Security Issues: ${auth.securityIssues}`);
  lines.push('');

  lines.push('### Dead Code');
  lines.push('');
  lines.push(`- Unused Components: ${deadCode.unusedComponents}`);
  lines.push(`- Unused Hooks: ${deadCode.unusedHooks}`);
  lines.push(`- Unused Services: ${deadCode.unusedServices}`);
  lines.push(`- Legacy References: ${deadCode.legacyReferences}`);
  lines.push(`- Commented Code Blocks: ${deadCode.commentedCodeBlocks}`);
  lines.push(`- Dead Feature Flags: ${deadCode.deadFeatureFlags}`);
  lines.push('');

  // Prioritized Action Items
  lines.push('## Prioritized Action Items');
  lines.push('');

  let priority = 1;

  if (contract.mismatchesByType.MISSING_ENDPOINT > 0) {
    lines.push(`**${priority}. Fix ${contract.mismatchesByType.MISSING_ENDPOINT} Missing Endpoint(s)** — Critical`);
    lines.push('   Frontend calls endpoints that don\'t exist in the backend.');
    lines.push('');
    priority++;
  }

  if (auth.securityIssues > 0) {
    lines.push(`**${priority}. Address ${auth.securityIssues} Security Issue(s)** — Critical`);
    lines.push('   Auth workflow has security concerns that need review.');
    lines.push('');
    priority++;
  }

  if (auth.isFragmented) {
    lines.push(`**${priority}. Unify Auth State** — High`);
    lines.push('   Auth state is fragmented across multiple sources.');
    lines.push('');
    priority++;
  }

  if (contract.mismatchesByType.AUTH_MISMATCH > 0) {
    lines.push(`**${priority}. Fix ${contract.mismatchesByType.AUTH_MISMATCH} Auth Mismatch(es)** — High`);
    lines.push('   Frontend/backend auth requirements are misaligned.');
    lines.push('');
    priority++;
  }

  if (deadCode.legacyReferences > 0) {
    lines.push(`**${priority}. Remove ${deadCode.legacyReferences} Legacy Reference(s)** — Medium`);
    lines.push('   Supabase/Cloudflare references remain after migration.');
    lines.push('');
    priority++;
  }

  if (deadCode.totalDeadCodeItems > 0) {
    lines.push(`**${priority}. Clean Up ${deadCode.totalDeadCodeItems} Dead Code Item(s)** — Low`);
    lines.push(`   ~${deadCode.totalLinesRemovable} lines can be safely removed.`);
    lines.push('');
    priority++;
  }

  if (priority === 1) {
    lines.push('✅ No action items. The codebase is clean!');
    lines.push('');
  }

  // Reports Index
  lines.push('## Detailed Reports');
  lines.push('');
  lines.push('| Report | Path |');
  lines.push('|--------|------|');
  lines.push('| Contract Mismatch Report | `forensic_reports/contract-mismatch-report.md` |');
  lines.push('| Page Validation Matrix | `forensic_reports/page-validation-matrix.md` |');
  lines.push('| Loader Unification Plan | `forensic_reports/loader-unification-plan.md` |');
  lines.push('| Auth Workflow Report | `forensic_reports/auth-workflow-report.md` |');
  lines.push('| SSE Implementation Report | `forensic_reports/sse-implementation-report.md` |');
  lines.push('| Notification Flow Report | `forensic_reports/notification-flow-report.md` |');
  lines.push('| Performance Fixes Report | `forensic_reports/performance-fixes-report.md` |');
  lines.push('| Stale Code Removal List | `forensic_reports/stale-code-removal-list.md` |');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by the MIHAS Frontend-Backend Forensic Audit System.*');

  return lines.join('\n');
}

/**
 * Generate the final clean architecture summary
 */
export async function generateFinalSummary(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('📊 Generating Final Clean Architecture Summary...\n');

  console.log('   Collecting contract audit data...');
  const contract = await getContractAuditSummary(projectRoot);

  console.log('   Collecting auth audit data...');
  const auth = await getAuthAuditSummary(projectRoot);

  console.log('   Collecting dead code audit data...');
  const deadCode = getDeadCodeAuditSummary(projectRoot);

  const data: SummaryData = {
    timestamp: new Date().toISOString(),
    contract,
    auth,
    deadCode,
  };

  const report = generateSummaryReport(data);

  // Ensure output directory exists
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);

  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  await writeFile(fullOutputPath, report, 'utf-8');
  console.log(`\n✅ Summary written to: ${outputPath}`);

  return report;
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();

  console.log('📊 MIHAS Clean Architecture Summary');
  console.log('====================================\n');

  generateFinalSummary(projectRoot)
    .then(() => {
      console.log('\nDone.');
    })
    .catch(err => {
      console.error('❌ Error:', err);
      process.exit(1);
    });
}
