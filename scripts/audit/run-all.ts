/**
 * Quick runner for all audit report generators
 */
import { generateContractMismatchReport } from './contract/reportGenerator';
import { generatePageValidationReport } from './page/reportGenerator';
import { generateSSEImplementationReport } from './sse/reportGenerator';
import { generateNotificationFlowReport } from './notification/reportGenerator';
import { generatePerformanceFixesReport } from './performance/reportGenerator';

async function main() {
  const root = process.cwd();
  
  console.log('=== RUNNING ALL AUDITORS ===\n');
  
  const auditors = [
    { name: 'Contract', fn: () => generateContractMismatchReport(root) },
    { name: 'Page', fn: () => generatePageValidationReport(root) },
    { name: 'SSE', fn: () => generateSSEImplementationReport(root) },
    { name: 'Notification', fn: () => generateNotificationFlowReport(root) },
    { name: 'Performance', fn: () => generatePerformanceFixesReport(root) },
  ];
  
  for (const auditor of auditors) {
    try {
      console.log(`\n--- ${auditor.name} Auditor ---`);
      await auditor.fn();
      console.log(`✅ ${auditor.name} complete`);
    } catch (err) {
      console.error(`❌ ${auditor.name} failed:`, err);
    }
  }
  
  // Run sync auditors separately
  console.log('\n--- Auth Auditor ---');
  try {
    const { mapWorkflows } = await import('./auth/workflowMapper');
    const { analyzeAuthState } = await import('./auth/stateAnalyzer');
    const { scanAdminPagesForRoleEnforcement } = await import('./auth/roleChecker');
    const { analyzeRedirects } = await import('./auth/redirectAnalyzer');
    const { detectSecurityIssues } = await import('./auth/securityDetector');
    
    const wf = mapWorkflows(root);
    const state = analyzeAuthState(root);
    const roles = scanAdminPagesForRoleEnforcement(root);
    const redirects = analyzeRedirects(root);
    const security = detectSecurityIssues(root);
    
    console.log(`  Student workflow steps: ${wf.studentWorkflow.length}`);
    console.log(`  Admin workflow steps: ${wf.adminWorkflow.length}`);
    console.log(`  Auth state fragmented: ${state.isFragmented}`);
    console.log(`  Admin pages missing role checks: ${roles.pagesMissingRoleChecks}/${roles.totalAdminPages}`);
    console.log(`  Redirect loops: ${redirects.summary.loopCount}`);
    console.log(`  Security issues: ${security.summary.totalIssues}`);
    console.log('✅ Auth complete');
  } catch (err) {
    console.error('❌ Auth failed:', err);
  }
  
  console.log('\n--- Dead Code Auditor ---');
  try {
    const { scanUnusedExports } = await import('./deadcode/unusedExportScanner');
    const { scanLegacyIntegrationsFull } = await import('./deadcode/legacyScanner');
    const { scanCommentedCodeFull } = await import('./deadcode/commentedCodeScanner');
    const { scanFeatureFlagsFull } = await import('./deadcode/featureFlagScanner');
    
    const unused = scanUnusedExports(root);
    const legacy = scanLegacyIntegrationsFull(root);
    const commented = scanCommentedCodeFull(root);
    const flags = scanFeatureFlagsFull(root);
    
    console.log(`  Unused exports: ${unused.unusedExports.length}`);
    console.log(`  Legacy references: ${legacy.deadCodeItems.length}`);
    console.log(`  Commented code blocks: ${commented.codeBlocks.length}`);
    console.log(`  Dead feature flags: ${flags.deadFlags.length}`);
    console.log('✅ Dead code complete');
  } catch (err) {
    console.error('❌ Dead code failed:', err);
  }
  
  // Run loader auditor
  console.log('\n--- Loader Auditor ---');
  try {
    const { scanForLoaders } = await import('./loader/loaderScanner');
    const { findRedundantLoaders } = await import('./loader/redundancyDetector');
    
    const loaders = scanForLoaders(root);
    const redundant = findRedundantLoaders(loaders);
    
    console.log(`  Total loaders: ${loaders.length}`);
    console.log(`  Redundant loaders: ${redundant.length}`);
    console.log('✅ Loader complete');
  } catch (err) {
    console.error('❌ Loader failed:', err);
  }
  
  console.log('\n=== ALL AUDITORS COMPLETE ===');
  console.log('\nReports written to forensic_reports/');
}

main().catch(console.error);
