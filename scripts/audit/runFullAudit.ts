/**
 * Full forensic audit runner.
 */
import { generateContractMismatchReport } from './contract/reportGenerator';
import { generatePageValidationReport } from './page/reportGenerator';
import { generateLoaderUnificationReport } from './loader/reportGenerator';
import { generateAuthWorkflowReportFile } from './auth/reportGenerator';
import { generateSSEImplementationReport } from './sse/reportGenerator';
import { generateNotificationFlowReport } from './notification/reportGenerator';
import { generatePerformanceFixesReport } from './performance/reportGenerator';
import { generateStaleCodeRemovalReport } from './deadcode/reportGenerator';
import { generateFinalSummary } from './generateSummary';

type AuditKey =
  | 'contract'
  | 'page'
  | 'loader'
  | 'auth'
  | 'sse'
  | 'notification'
  | 'performance'
  | 'deadcode'
  | 'summary';

const ALL_AUDITS: AuditKey[] = ['contract', 'page', 'loader', 'auth', 'sse', 'notification', 'performance', 'deadcode', 'summary'];

function parseArgs(args: string[]): AuditKey[] {
  if (args.length === 0 || args.includes('--full')) return ALL_AUDITS;

  const map: Record<string, AuditKey> = {
    '--contract': 'contract',
    '--page': 'page',
    '--loader': 'loader',
    '--auth': 'auth',
    '--sse': 'sse',
    '--notification': 'notification',
    '--performance': 'performance',
    '--deadcode': 'deadcode',
    '--summary': 'summary',
  };

  const selected = args
    .map(arg => map[arg])
    .filter((audit): audit is AuditKey => Boolean(audit));

  return selected.length > 0 ? selected : ALL_AUDITS;
}

async function runAudit(audit: AuditKey, root: string): Promise<void> {
  switch (audit) {
    case 'contract':
      await generateContractMismatchReport(root);
      break;
    case 'page':
      await generatePageValidationReport(root);
      break;
    case 'loader':
      await generateLoaderUnificationReport(root);
      break;
    case 'auth':
      await generateAuthWorkflowReportFile(root);
      break;
    case 'sse':
      await generateSSEImplementationReport(root);
      break;
    case 'notification':
      await generateNotificationFlowReport(root);
      break;
    case 'performance':
      await generatePerformanceFixesReport(root);
      break;
    case 'deadcode':
      await generateStaleCodeRemovalReport(root);
      break;
    case 'summary':
      await generateFinalSummary(root);
      break;
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const selectedAudits = parseArgs(process.argv.slice(2));

  console.log('🔍 MIHAS Forensic Audit Runner');
  console.log(`Running: ${selectedAudits.join(', ')}\n`);

  for (const audit of selectedAudits) {
    try {
      console.log(`--- ${audit} ---`);
      await runAudit(audit, root);
      console.log(`✅ ${audit} complete\n`);
    } catch (error) {
      console.error(`❌ ${audit} failed`, error);
      process.exitCode = 1;
    }
  }
}

main().catch(err => {
  console.error('❌ Failed to run forensic audit', err);
  process.exit(1);
});
