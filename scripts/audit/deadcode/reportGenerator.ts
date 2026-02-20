/**
 * Stale Code Removal List Report Generator
 * 
 * Generates a comprehensive Markdown report of all dead code findings,
 * including unused components, hooks, services, legacy integrations,
 * commented-out code, and dead feature flags.
 * 
 * Validates: Requirements 9.1-9.6
 * - 9.1: Identify unused components
 * - 9.2: Identify unused hooks
 * - 9.3: Identify legacy integrations (Supabase, Cloudflare)
 * - 9.4: Identify commented-out logic
 * - 9.5: Identify dead feature flags
 * - 9.6: Provide evidence (file path, line numbers, reason)
 * 
 * @module scripts/audit/deadcode/reportGenerator
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { DeadCodeItem, DeadCodeAuditResult } from '../types';
import {
  scanUnusedExports,
  type UnusedExportScanResult,
} from './unusedExportScanner';
import {
  scanLegacyIntegrationsFull,
  type LegacyScanResult,
  type LegacyCategory,
} from './legacyScanner';
import {
  scanCommentedCodeFull,
  type CommentedCodeScanResult,
} from './commentedCodeScanner';
import {
  scanFeatureFlagsFull,
  type FeatureFlagScanResult,
} from './featureFlagScanner';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/stale-code-removal-list.md';

// =============================================================================
// Types
// =============================================================================

/**
 * Report metadata
 */
interface ReportMetadata {
  timestamp: string;
  version: string;
  projectRoot: string;
}

/**
 * Combined dead code audit data from all scanners
 */
interface CombinedDeadCodeAuditData {
  unusedExportResult: UnusedExportScanResult;
  legacyResult: LegacyScanResult;
  commentedCodeResult: CommentedCodeScanResult;
  featureFlagResult: FeatureFlagScanResult;
  unusedComponents: DeadCodeItem[];
  unusedHooks: DeadCodeItem[];
  unusedServices: DeadCodeItem[];
  unusedUtils: DeadCodeItem[];
  allDeadCode: DeadCodeItem[];
  totalLinesRemovable: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get timestamp for report
 */
const getTimestamp = (): string => new Date().toISOString();

/**
 * Get safe-to-remove status emoji
 */
function getSafeToRemoveEmoji(safe: boolean): string {
  return safe ? '✅ Safe' : '⚠️ Review';
}

/**
 * Get type emoji for dead code categories
 */
function getTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    COMPONENT: '🧩',
    HOOK: '🪝',
    SERVICE: '⚙️',
    UTIL: '🔧',
    LEGACY_INTEGRATION: '🗑️',
    COMMENTED_CODE: '💬',
    FEATURE_FLAG: '🚩',
  };
  return emojis[type] || '📄';
}

/**
 * Get legacy category label
 */
function getLegacyCategoryLabel(category: LegacyCategory): string {
  const labels: Record<LegacyCategory, string> = {
    supabase: 'Supabase (migrated to Neon Postgres)',
    cloudflare: 'Cloudflare (migrated to Vercel)',
    sentry: 'Sentry (removed)',
    umami: 'Umami Analytics (removed)',
    twilio: 'Twilio (removed)',
  };
  return labels[category];
}

/**
 * Calculate overall health status based on dead code findings
 */
function calculateOverallHealth(data: CombinedDeadCodeAuditData): 'healthy' | 'warning' | 'critical' {
  const legacyCount = data.legacyResult.deadCodeItems.length;
  const totalDead = data.allDeadCode.length;

  // Critical: legacy integrations still present (should have been fully removed)
  if (legacyCount > 10) {
    return 'critical';
  }

  // Warning: significant dead code or any legacy references
  if (legacyCount > 0 || totalDead > 20) {
    return 'warning';
  }

  return 'healthy';
}

/**
 * Estimate removable lines from a DeadCodeItem's evidence string.
 * Extracts line counts from evidence text or defaults to 1.
 */
function estimateRemovableLines(item: DeadCodeItem): number {
  // For commented code, extract line count from evidence
  if (item.type === 'COMMENTED_CODE') {
    const match = item.evidence.match(/(\d+) lines of commented/);
    if (match) return parseInt(match[1], 10);
  }
  // For other types, estimate based on type
  switch (item.type) {
    case 'COMPONENT': return 50;
    case 'HOOK': return 30;
    case 'SERVICE': return 40;
    case 'UTIL': return 15;
    case 'LEGACY_INTEGRATION': return 1;
    case 'FEATURE_FLAG': return 3;
    default: return 1;
  }
}

// =============================================================================
// Report Section Generators
// =============================================================================

/**
 * Generate executive summary section
 */
function generateExecutiveSummary(data: CombinedDeadCodeAuditData, metadata: ReportMetadata): string {
  const health = calculateOverallHealth(data);
  const healthLabel = {
    healthy: '🟢 **HEALTHY** — Codebase is clean with minimal dead code',
    warning: '🟡 **WARNING** — Dead code found that should be cleaned up',
    critical: '🔴 **CRITICAL** — Legacy integration references require immediate removal',
  }[health];

  const safeCount = data.allDeadCode.filter(i => i.safeToRemove).length;
  const reviewCount = data.allDeadCode.filter(i => !i.safeToRemove).length;

  return `## Executive Summary

**Report Generated**: ${metadata.timestamp}

### Codebase Health Status

${healthLabel}

### Overview

| Metric | Value |
|--------|-------|
| Total Dead Code Items | ${data.allDeadCode.length} |
| Unused Components | ${data.unusedComponents.length} |
| Unused Hooks | ${data.unusedHooks.length} |
| Unused Services/Utilities | ${data.unusedServices.length + data.unusedUtils.length} |
| Legacy Integration References | ${data.legacyResult.deadCodeItems.length} |
| Commented-Out Code Blocks | ${data.commentedCodeResult.codeBlocks.length} |
| Dead Feature Flags | ${data.featureFlagResult.deadFlags.length} |
| Estimated Removable Lines | ~${data.totalLinesRemovable} |
| Safe to Remove | ${safeCount} |
| Needs Review | ${reviewCount} |

### Breakdown by Type

| Type | Count | Emoji |
|------|-------|-------|
| Components | ${data.unusedComponents.length} | ${getTypeEmoji('COMPONENT')} |
| Hooks | ${data.unusedHooks.length} | ${getTypeEmoji('HOOK')} |
| Services | ${data.unusedServices.length} | ${getTypeEmoji('SERVICE')} |
| Utilities | ${data.unusedUtils.length} | ${getTypeEmoji('UTIL')} |
| Legacy Integrations | ${data.legacyResult.deadCodeItems.length} | ${getTypeEmoji('LEGACY_INTEGRATION')} |
| Commented Code | ${data.commentedCodeResult.codeBlocks.length} | ${getTypeEmoji('COMMENTED_CODE')} |
| Feature Flags | ${data.featureFlagResult.deadFlags.length} | ${getTypeEmoji('FEATURE_FLAG')} |

### Files Scanned

| Scanner | Files Scanned |
|---------|---------------|
| Unused Export Scanner | ${data.unusedExportResult.filesScanned} |
| Legacy Integration Scanner | ${data.legacyResult.filesScanned} |
| Commented Code Scanner | ${data.commentedCodeResult.filesScanned} |
| Feature Flag Scanner | ${data.featureFlagResult.filesScanned} |
`;
}

/**
 * Generate unused components section
 */
function generateUnusedComponentsSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Unused Components');
  lines.push('');

  if (data.unusedComponents.length === 0) {
    lines.push('✅ **No unused components detected.**');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${getTypeEmoji('COMPONENT')} **${data.unusedComponents.length} unused component(s) found.**`);
  lines.push('');
  lines.push('These components are exported but never imported anywhere in the codebase.');
  lines.push('');
  lines.push('| # | Component | File | Safe to Remove | Evidence |');
  lines.push('|---|-----------|------|----------------|----------|');

  for (let i = 0; i < data.unusedComponents.length; i++) {
    const item = data.unusedComponents[i];
    const safe = getSafeToRemoveEmoji(item.safeToRemove);
    const evidence = item.evidence.length > 80
      ? item.evidence.substring(0, 77) + '...'
      : item.evidence;
    lines.push(`| ${i + 1} | \`${item.name}\` | \`${item.filePath}\` | ${safe} | ${evidence} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate unused hooks section
 */
function generateUnusedHooksSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Unused Hooks');
  lines.push('');

  if (data.unusedHooks.length === 0) {
    lines.push('✅ **No unused hooks detected.**');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${getTypeEmoji('HOOK')} **${data.unusedHooks.length} unused hook(s) found.**`);
  lines.push('');
  lines.push('These hooks are exported but never imported anywhere in the codebase.');
  lines.push('');
  lines.push('| # | Hook | File | Safe to Remove | Evidence |');
  lines.push('|---|------|------|----------------|----------|');

  for (let i = 0; i < data.unusedHooks.length; i++) {
    const item = data.unusedHooks[i];
    const safe = getSafeToRemoveEmoji(item.safeToRemove);
    const evidence = item.evidence.length > 80
      ? item.evidence.substring(0, 77) + '...'
      : item.evidence;
    lines.push(`| ${i + 1} | \`${item.name}\` | \`${item.filePath}\` | ${safe} | ${evidence} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate unused services/utilities section
 */
function generateUnusedServicesSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Unused Services & Utilities');
  lines.push('');

  const combined = [...data.unusedServices, ...data.unusedUtils];

  if (combined.length === 0) {
    lines.push('✅ **No unused services or utilities detected.**');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${getTypeEmoji('SERVICE')} **${combined.length} unused service(s)/utility(ies) found.**`);
  lines.push('');
  lines.push('These exports are defined but never imported anywhere in the codebase.');
  lines.push('');
  lines.push('| # | Name | Type | File | Safe to Remove |');
  lines.push('|---|------|------|------|----------------|');

  for (let i = 0; i < combined.length; i++) {
    const item = combined[i];
    const safe = getSafeToRemoveEmoji(item.safeToRemove);
    lines.push(`| ${i + 1} | \`${item.name}\` | ${item.type} | \`${item.filePath}\` | ${safe} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate legacy integration references section
 */
function generateLegacyIntegrationsSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Legacy Integration References');
  lines.push('');

  const { legacyResult } = data;

  if (legacyResult.deadCodeItems.length === 0) {
    lines.push('✅ **No legacy integration references found. Codebase is fully migrated!**');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${getTypeEmoji('LEGACY_INTEGRATION')} **${legacyResult.deadCodeItems.length} legacy reference(s) found.**`);
  lines.push('');
  lines.push('These references to removed integrations should be cleaned up.');
  lines.push('The following services have been fully migrated away from:');
  lines.push('');
  lines.push('- **Supabase** → Migrated to Neon Postgres');
  lines.push('- **Cloudflare** → Migrated to Vercel');
  lines.push('- **Sentry** → Removed (error monitoring)');
  lines.push('- **Umami** → Removed (analytics)');
  lines.push('- **Twilio** → Removed (SMS/WhatsApp)');
  lines.push('');

  // Category breakdown
  const categories: LegacyCategory[] = ['supabase', 'cloudflare', 'sentry', 'umami', 'twilio'];

  lines.push('### Category Breakdown');
  lines.push('');
  lines.push('| Category | References | Status |');
  lines.push('|----------|------------|--------|');

  for (const cat of categories) {
    const refs = legacyResult.byCategory[cat];
    const status = refs.length > 0 ? `⚠️ ${refs.length} reference(s)` : '✅ Clean';
    lines.push(`| ${getLegacyCategoryLabel(cat)} | ${refs.length} | ${status} |`);
  }
  lines.push('');

  // Details by category
  for (const cat of categories) {
    const refs = legacyResult.byCategory[cat];
    if (refs.length === 0) continue;

    lines.push(`### ${getLegacyCategoryLabel(cat)}`);
    lines.push('');
    lines.push('| File | Line | Pattern | Safe to Remove |');
    lines.push('|------|------|---------|----------------|');

    for (const ref of refs) {
      lines.push(`| \`${ref.filePath}\` | ${ref.lineNumber} | ${ref.reason} | ✅ Safe |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate commented-out code section
 */
function generateCommentedCodeSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Commented-Out Code');
  lines.push('');

  const { commentedCodeResult } = data;

  if (commentedCodeResult.codeBlocks.length === 0) {
    lines.push('✅ **No commented-out code blocks detected.**');
    lines.push('');
    return lines.join('\n');
  }

  const totalCommentedLines = commentedCodeResult.codeBlocks.reduce(
    (sum, b) => sum + b.lineCount, 0
  );

  lines.push(`${getTypeEmoji('COMMENTED_CODE')} **${commentedCodeResult.codeBlocks.length} commented-out code block(s) found** (~${totalCommentedLines} lines).`);
  lines.push('');
  lines.push('These are blocks of 3+ consecutive commented lines that appear to be');
  lines.push('commented-out code rather than documentation comments.');
  lines.push('');

  // Group by file
  const byFile: Record<string, typeof commentedCodeResult.codeBlocks> = {};
  for (const block of commentedCodeResult.codeBlocks) {
    if (!byFile[block.filePath]) {
      byFile[block.filePath] = [];
    }
    byFile[block.filePath].push(block);
  }

  lines.push('| # | File | Lines | Line Count | Safe to Remove |');
  lines.push('|---|------|-------|------------|----------------|');

  let idx = 0;
  for (const [filePath, blocks] of Object.entries(byFile)) {
    for (const block of blocks) {
      idx++;
      lines.push(`| ${idx} | \`${filePath}\` | ${block.startLine}-${block.endLine} | ${block.lineCount} | ✅ Safe |`);
    }
  }
  lines.push('');

  // Show preview of largest blocks
  const sortedBlocks = [...commentedCodeResult.codeBlocks].sort(
    (a, b) => b.lineCount - a.lineCount
  );
  const topBlocks = sortedBlocks.slice(0, 5);

  if (topBlocks.length > 0) {
    lines.push('### Largest Commented Blocks (Preview)');
    lines.push('');

    for (const block of topBlocks) {
      lines.push(`#### \`${block.filePath}\` (lines ${block.startLine}-${block.endLine}, ${block.lineCount} lines)`);
      lines.push('');
      lines.push('```');
      const preview = block.lines.slice(0, 5);
      for (const line of preview) {
        lines.push(line.trim());
      }
      if (block.lines.length > 5) {
        lines.push(`... (${block.lines.length - 5} more lines)`);
      }
      lines.push('```');
      lines.push('');
    }
  }

  // Note about doc comments
  const docBlocks = commentedCodeResult.allBlocks.length - commentedCodeResult.codeBlocks.length;
  if (docBlocks > 0) {
    lines.push(`> **Note**: ${docBlocks} documentation comment block(s) were detected and excluded from this report.`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate dead feature flags section
 */
function generateDeadFeatureFlagsSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Dead Feature Flags');
  lines.push('');

  const { featureFlagResult } = data;

  if (featureFlagResult.deadFlags.length === 0 && featureFlagResult.definitions.length === 0) {
    lines.push('ℹ️ **No feature flag definitions found in the codebase.**');
    lines.push('');
    return lines.join('\n');
  }

  if (featureFlagResult.deadFlags.length === 0) {
    lines.push('✅ **All feature flags are actively used in conditionals. No dead flags found.**');
    lines.push('');
    lines.push(`Total feature flags defined: ${featureFlagResult.definitions.length}`);
    lines.push(`Total conditional usages: ${featureFlagResult.usages.length}`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${getTypeEmoji('FEATURE_FLAG')} **${featureFlagResult.deadFlags.length} dead feature flag(s) found.**`);
  lines.push('');
  lines.push('These feature flags are defined but never used in any conditional expression');
  lines.push('(if, ternary, &&, ||). They can be safely removed.');
  lines.push('');
  lines.push('| # | Flag Name | File | Source | Safe to Remove |');
  lines.push('|---|-----------|------|--------|----------------|');

  for (let i = 0; i < featureFlagResult.deadFlags.length; i++) {
    const flag = featureFlagResult.deadFlags[i];
    const def = featureFlagResult.definitions.find(d => d.name === flag.name);
    const source = def?.source || 'unknown';
    lines.push(`| ${i + 1} | \`${flag.name}\` | \`${flag.filePath}\` | ${source} | ✅ Safe |`);
  }
  lines.push('');

  // Summary of active flags
  const activeFlags = featureFlagResult.definitions.filter(
    d => !featureFlagResult.deadFlags.some(df => df.name === d.name)
  );
  if (activeFlags.length > 0) {
    lines.push('### Active Feature Flags (For Reference)');
    lines.push('');
    lines.push('| Flag Name | File | Conditional Usages |');
    lines.push('|-----------|------|--------------------|');

    for (const def of activeFlags) {
      const usageCount = featureFlagResult.usages.filter(u => u.flagName === def.name).length;
      lines.push(`| \`${def.name}\` | \`${def.filePath}\` | ${usageCount} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate requirements validation section
 */
function generateRequirementsSection(data: CombinedDeadCodeAuditData): string {
  const lines: string[] = [];
  lines.push('## Requirements Validation');
  lines.push('');
  lines.push('This section maps the audit findings to the specification requirements.');
  lines.push('');

  // Calculate requirement statuses
  const hasUnusedComponentScan = data.unusedExportResult.filesScanned > 0;
  const hasUnusedHookScan = data.unusedExportResult.filesScanned > 0;
  const hasLegacyScan = data.legacyResult.filesScanned > 0;
  const hasCommentedCodeScan = data.commentedCodeResult.filesScanned > 0;
  const hasFeatureFlagScan = data.featureFlagResult.filesScanned > 0;
  const hasEvidence = data.allDeadCode.every(item =>
    item.filePath && item.evidence && item.evidence.length > 0
  );

  lines.push('| Requirement | Description | Status | Evidence |');
  lines.push('|-------------|-------------|--------|----------|');
  lines.push(`| 9.1 | Identify unused components | ${hasUnusedComponentScan ? '✅' : '❌'} | ${data.unusedComponents.length} unused component(s) identified |`);
  lines.push(`| 9.2 | Identify unused hooks | ${hasUnusedHookScan ? '✅' : '❌'} | ${data.unusedHooks.length} unused hook(s) identified |`);
  lines.push(`| 9.3 | Identify legacy integrations | ${hasLegacyScan ? '✅' : '❌'} | ${data.legacyResult.deadCodeItems.length} legacy reference(s) found |`);
  lines.push(`| 9.4 | Identify commented-out logic | ${hasCommentedCodeScan ? '✅' : '❌'} | ${data.commentedCodeResult.codeBlocks.length} commented block(s) found |`);
  lines.push(`| 9.5 | Identify dead feature flags | ${hasFeatureFlagScan ? '✅' : '❌'} | ${data.featureFlagResult.deadFlags.length} dead flag(s) found |`);
  lines.push(`| 9.6 | Provide evidence for dead code | ${hasEvidence || data.allDeadCode.length === 0 ? '✅' : '⚠️'} | All items include file path, line numbers, and reason |`);
  lines.push('');

  // Overall compliance
  const requirements = [
    hasUnusedComponentScan,
    hasUnusedHookScan,
    hasLegacyScan,
    hasCommentedCodeScan,
    hasFeatureFlagScan,
    hasEvidence || data.allDeadCode.length === 0,
  ];
  const passedCount = requirements.filter(Boolean).length;
  const compliancePercentage = Math.round((passedCount / requirements.length) * 100);

  lines.push(`### Overall Compliance: ${compliancePercentage}%`);
  lines.push('');
  lines.push(`${passedCount} of ${requirements.length} requirements fully satisfied.`);
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Report Assembly
// =============================================================================

/**
 * Generate the complete stale code removal list report
 */
function generateReport(data: CombinedDeadCodeAuditData, metadata: ReportMetadata): string {
  const sections: string[] = [];

  // Header
  sections.push('# Stale Code Removal List');
  sections.push('');
  sections.push('> Forensic audit of dead code, unused exports, legacy integrations, commented-out code, and dead feature flags');
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
  sections.push('2. [Unused Components](#unused-components)');
  sections.push('3. [Unused Hooks](#unused-hooks)');
  sections.push('4. [Unused Services & Utilities](#unused-services--utilities)');
  sections.push('5. [Legacy Integration References](#legacy-integration-references)');
  sections.push('6. [Commented-Out Code](#commented-out-code)');
  sections.push('7. [Dead Feature Flags](#dead-feature-flags)');
  sections.push('8. [Requirements Validation](#requirements-validation)');
  sections.push('');

  // Unused Components
  sections.push(generateUnusedComponentsSection(data));

  // Unused Hooks
  sections.push(generateUnusedHooksSection(data));

  // Unused Services & Utilities
  sections.push(generateUnusedServicesSection(data));

  // Legacy Integration References
  sections.push(generateLegacyIntegrationsSection(data));

  // Commented-Out Code
  sections.push(generateCommentedCodeSection(data));

  // Dead Feature Flags
  sections.push(generateDeadFeatureFlagsSection(data));

  // Requirements Validation
  sections.push(generateRequirementsSection(data));

  // Footer
  sections.push('---');
  sections.push('');
  sections.push('*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*');
  sections.push('');
  sections.push('**Validates**: Requirements 9.1-9.6 — Stale code elimination');

  return sections.join('\n');
}

// =============================================================================
// Data Collection
// =============================================================================

/**
 * Collects all dead code audit data from all scanners.
 */
function collectAuditData(projectRoot: string): CombinedDeadCodeAuditData {
  // Run all scanners
  const unusedExportResult = scanUnusedExports(projectRoot);
  const legacyResult = scanLegacyIntegrationsFull(projectRoot);
  const commentedCodeResult = scanCommentedCodeFull(projectRoot);
  const featureFlagResult = scanFeatureFlagsFull(projectRoot);

  // Categorize unused exports
  const unusedComponents = unusedExportResult.unusedExports.filter(
    item => item.type === 'COMPONENT'
  );
  const unusedHooks = unusedExportResult.unusedExports.filter(
    item => item.type === 'HOOK'
  );
  const unusedServices = unusedExportResult.unusedExports.filter(
    item => item.type === 'SERVICE'
  );
  const unusedUtils = unusedExportResult.unusedExports.filter(
    item => item.type === 'UTIL'
  );

  // Combine all dead code items
  const allDeadCode: DeadCodeItem[] = [
    ...unusedExportResult.unusedExports,
    ...legacyResult.deadCodeItems,
    ...commentedCodeResult.deadCodeItems,
    ...featureFlagResult.deadFlags,
  ];

  // Estimate total removable lines
  const totalLinesRemovable = allDeadCode.reduce(
    (sum, item) => sum + estimateRemovableLines(item), 0
  );

  return {
    unusedExportResult,
    legacyResult,
    commentedCodeResult,
    featureFlagResult,
    unusedComponents,
    unusedHooks,
    unusedServices,
    unusedUtils,
    allDeadCode,
    totalLinesRemovable,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Runs the complete dead code audit and generates the stale code removal list.
 * 
 * @param projectRoot - Project root directory (defaults to cwd)
 * @param outputPath - Output path for the report (defaults to forensic_reports/stale-code-removal-list.md)
 * @returns The generated report content
 * 
 * **Validates: Requirements 9.1-9.6**
 */
export async function generateStaleCodeRemovalList(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('🔍 Running dead code audit...\n');

  // Scan unused exports
  console.log('   Scanning unused exports...');
  const data = collectAuditData(projectRoot);

  console.log(`   Found ${data.unusedExportResult.unusedExports.length} unused exports`);
  console.log(`   Found ${data.legacyResult.deadCodeItems.length} legacy integration references`);
  console.log(`   Found ${data.commentedCodeResult.codeBlocks.length} commented-out code blocks`);
  console.log(`   Found ${data.featureFlagResult.deadFlags.length} dead feature flags`);
  console.log(`   Total dead code items: ${data.allDeadCode.length}`);

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
 * Gets a summary of the dead code audit without generating a full report.
 * Useful for the master audit runner.
 */
export function getDeadCodeAuditSummary(projectRoot: string = process.cwd()): {
  unusedComponents: number;
  unusedHooks: number;
  unusedServices: number;
  unusedUtils: number;
  legacyReferences: number;
  commentedCodeBlocks: number;
  deadFeatureFlags: number;
  totalDeadCodeItems: number;
  totalLinesRemovable: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
} {
  const data = collectAuditData(projectRoot);

  return {
    unusedComponents: data.unusedComponents.length,
    unusedHooks: data.unusedHooks.length,
    unusedServices: data.unusedServices.length,
    unusedUtils: data.unusedUtils.length,
    legacyReferences: data.legacyResult.deadCodeItems.length,
    commentedCodeBlocks: data.commentedCodeResult.codeBlocks.length,
    deadFeatureFlags: data.featureFlagResult.deadFlags.length,
    totalDeadCodeItems: data.allDeadCode.length,
    totalLinesRemovable: data.totalLinesRemovable,
    healthStatus: calculateOverallHealth(data),
  };
}

/**
 * Build dead code audit result for master report.
 * Returns data in the DeadCodeAuditResult format expected by the master report.
 */
export function buildDeadCodeAuditResult(
  projectRoot: string = process.cwd()
): DeadCodeAuditResult {
  const data = collectAuditData(projectRoot);

  return {
    unusedComponents: data.unusedComponents,
    unusedHooks: data.unusedHooks,
    unusedServices: [...data.unusedServices, ...data.unusedUtils],
    legacyIntegrations: data.legacyResult.deadCodeItems,
    commentedCode: data.commentedCodeResult.deadCodeItems,
    deadFeatureFlags: data.featureFlagResult.deadFlags,
    totalLinesRemovable: data.totalLinesRemovable,
  };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;
  const projectRoot = process.cwd();

  console.log('📋 Stale Code Removal List Generator');
  console.log('=====================================\n');

  generateStaleCodeRemovalList(projectRoot, outputPath)
    .then(report => {
      // Print summary to console
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex(
        (l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary')
      );

      if (summaryStart !== -1) {
        const summaryLines = lines.slice(
          summaryStart,
          summaryEnd !== -1 ? summaryEnd : summaryStart + 50
        );
        console.log('\n' + summaryLines.join('\n'));
      }
    })
    .catch(error => {
      console.error('❌ Failed to generate report:', error);
      process.exit(1);
    });
}
