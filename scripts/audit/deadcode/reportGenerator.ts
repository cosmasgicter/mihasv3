/**
 * Dead Code Audit Report Generator
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { scanUnusedExports } from './unusedExportScanner';
import { scanLegacyIntegrationsFull } from './legacyScanner';
import { scanCommentedCodeFull } from './commentedCodeScanner';
import { scanFeatureFlagsFull } from './featureFlagScanner';
import type { DeadCodeAuditResult } from '../types';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/stale-code-removal-list.md';

function collectDeadCodeData(projectRoot: string = process.cwd()): DeadCodeAuditResult {
  const unused = scanUnusedExports(projectRoot).unusedExports;
  const legacy = scanLegacyIntegrationsFull(projectRoot).deadCodeItems;
  const commented = scanCommentedCodeFull(projectRoot).deadCodeItems;
  const flags = scanFeatureFlagsFull(projectRoot).deadFlags;

  const unusedComponents = unused.filter(item => item.type === 'COMPONENT');
  const unusedHooks = unused.filter(item => item.type === 'HOOK');
  const unusedServices = unused.filter(item => item.type === 'SERVICE');

  const totalLinesRemovable =
    (unusedComponents.length + unusedHooks.length + unusedServices.length) * 5 +
    commented.length * 3 +
    flags.length * 2;

  return {
    unusedComponents,
    unusedHooks,
    unusedServices,
    legacyIntegrations: legacy,
    commentedCode: commented,
    deadFeatureFlags: flags,
    totalLinesRemovable,
  };
}

function generateReport(data: DeadCodeAuditResult): string {
  const totalItems =
    data.unusedComponents.length +
    data.unusedHooks.length +
    data.unusedServices.length +
    data.legacyIntegrations.length +
    data.commentedCode.length +
    data.deadFeatureFlags.length;

  return [
    '# Stale Code Removal List',
    '',
    `**Generated**: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Unused components: ${data.unusedComponents.length}`,
    `- Unused hooks: ${data.unusedHooks.length}`,
    `- Unused services: ${data.unusedServices.length}`,
    `- Legacy integrations: ${data.legacyIntegrations.length}`,
    `- Commented code blocks: ${data.commentedCode.length}`,
    `- Dead feature flags: ${data.deadFeatureFlags.length}`,
    `- Total dead code items: ${totalItems}`,
    `- Estimated removable lines: ${data.totalLinesRemovable}`,
    '',
  ].join('\n');
}

export async function generateStaleCodeRemovalReport(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH,
): Promise<string> {
  const data = collectDeadCodeData(projectRoot);
  const report = generateReport(data);
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  await writeFile(fullOutputPath, report, 'utf-8');
  return report;
}

export function getDeadCodeAuditSummary(projectRoot: string = process.cwd()) {
  const data = collectDeadCodeData(projectRoot);
  const totalDeadCodeItems =
    data.unusedComponents.length +
    data.unusedHooks.length +
    data.unusedServices.length +
    data.legacyIntegrations.length +
    data.commentedCode.length +
    data.deadFeatureFlags.length;

  const healthStatus: 'healthy' | 'warning' | 'critical' =
    totalDeadCodeItems > 250 ? 'critical' : totalDeadCodeItems > 50 ? 'warning' : 'healthy';

  return {
    unusedComponents: data.unusedComponents.length,
    unusedHooks: data.unusedHooks.length,
    unusedServices: data.unusedServices.length,
    legacyReferences: data.legacyIntegrations.length,
    commentedCodeBlocks: data.commentedCode.length,
    deadFeatureFlags: data.deadFeatureFlags.length,
    totalDeadCodeItems,
    totalLinesRemovable: data.totalLinesRemovable,
    healthStatus,
  };
}

if (import.meta.main) {
  generateStaleCodeRemovalReport().then(() => {
    console.log('✅ Stale code report generated');
  }).catch(err => {
    console.error('❌ Error generating stale code report:', err);
    process.exit(1);
  });
}
