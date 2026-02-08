/**
 * Loader Unification Plan Report Generator
 * Validates: Requirements 3.1, 3.2
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { LoaderInstance, LoaderType } from '../types';
import { scanLoaders, getLoaderTypeSummary, getUniqueLoaderNames } from './loaderScanner';
import type { LoaderScanResult, LoaderUsage } from './loaderScanner';
import { detectRedundancy } from './redundancyDetector';
import type { RedundancyDetectionResult } from './redundancyDetector';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/loader-unification-plan.md';

const LOADER_TYPE_TO_VARIANT: Record<LoaderType, string> = {
  spinner: 'inline',
  skeleton: 'skeleton',
  progress: 'inline',
  overlay: 'overlay',
  inline: 'inline',
};

function getTimestamp(): string {
  return new Date().toISOString();
}

function getHealthEmoji(isRedundant: boolean): string {
  return isRedundant ? '' : '';
}

function getTypeEmoji(type: LoaderType): string {
  const emojis: Record<LoaderType, string> = {
    spinner: '',
    skeleton: '',
    progress: '',
    overlay: '',
    inline: '',
  };
  return emojis[type] || '';
}

function calculateOverallHealth(totalLoaders: number, redundantCount: number): 'healthy' | 'warning' | 'critical' {
  if (totalLoaders === 0) return 'healthy';
  const ratio = redundantCount / totalLoaders;
  if (ratio > 0.5) return 'critical';
  if (ratio > 0.2) return 'warning';
  return 'healthy';
}

function generateExecutiveSummary(scanResult: LoaderScanResult, redundancyResult: RedundancyDetectionResult): string {
  const typeSummary = getLoaderTypeSummary(scanResult);
  const health = calculateOverallHealth(scanResult.definitions.length, redundancyResult.totalRedundant);
  const healthStatus = health === 'critical' ? ' **CRITICAL** - High loader redundancy' : health === 'warning' ? ' **WARNING** - Some redundant loaders' : ' **HEALTHY** - Minimal redundancy';

  return `## Executive Summary

**Report Generated**: ${getTimestamp()}

### Loader System Health Status

${healthStatus}

### Overview

| Metric | Count |
|--------|-------|
| Total Loader Definitions | ${scanResult.definitions.length} |
| Total Loader Usages | ${scanResult.usages.length} |
| Unique Loader Components | ${getUniqueLoaderNames(scanResult).length} |
| Redundant Loaders | ${redundancyResult.totalRedundant} |
| Redundant Groups | ${redundancyResult.redundantGroups.length} |

### Loaders by Type

| Type | Total | Redundant | Keep |
|------|-------|-----------|------|
| ${getTypeEmoji('spinner')} Spinner | ${typeSummary.spinner} | ${redundancyResult.summaryByType.spinner.redundant} | ${typeSummary.spinner - redundancyResult.summaryByType.spinner.redundant} |
| ${getTypeEmoji('skeleton')} Skeleton | ${typeSummary.skeleton} | ${redundancyResult.summaryByType.skeleton.redundant} | ${typeSummary.skeleton - redundancyResult.summaryByType.skeleton.redundant} |
| ${getTypeEmoji('progress')} Progress | ${typeSummary.progress} | ${redundancyResult.summaryByType.progress.redundant} | ${typeSummary.progress - redundancyResult.summaryByType.progress.redundant} |
| ${getTypeEmoji('overlay')} Overlay | ${typeSummary.overlay} | ${redundancyResult.summaryByType.overlay.redundant} | ${typeSummary.overlay - redundancyResult.summaryByType.overlay.redundant} |
| ${getTypeEmoji('inline')} Inline | ${typeSummary.inline} | ${redundancyResult.summaryByType.inline.redundant} | ${typeSummary.inline - redundancyResult.summaryByType.inline.redundant} |

`;
}

function generateLoaderInventory(scanResult: LoaderScanResult, redundancyResult: RedundancyDetectionResult): string {
  const lines: string[] = [];
  lines.push('## Loader Inventory');
  lines.push('');
  lines.push('Complete list of all loader components found in the codebase.');
  lines.push('');

  const redundantKeys = new Set<string>();
  for (const group of redundancyResult.redundantGroups) {
    for (const loader of group.redundantLoaders) {
      redundantKeys.add(`${loader.filePath}:${loader.componentName}`);
    }
  }

  lines.push('### Loader Definitions');
  lines.push('');
  lines.push('| Component | Type | File | Line | Status |');
  lines.push('|-----------|------|------|------|--------|');

  for (const def of scanResult.definitions) {
    const key = `${def.filePath}:${def.componentName}`;
    const isRedundant = redundantKeys.has(key);
    const statusEmoji = getHealthEmoji(isRedundant);
    const status = isRedundant ? 'Redundant' : 'Keep';
    const typeEmoji = getTypeEmoji(def.type);
    const displayPath = def.filePath.length > 45 ? '...' + def.filePath.slice(-42) : def.filePath;
    lines.push(`| \`${def.componentName}\` | ${typeEmoji} ${def.type} | \`${displayPath}\` | ${def.lineNumber} | ${statusEmoji} ${status} |`);
  }

  lines.push('');
  lines.push('**Legend**: 🟢 Keep | 🔴 Redundant');
  lines.push('');
  return lines.join('\n');
}

function generateRedundantGroupsSection(redundancyResult: RedundancyDetectionResult): string {
  const lines: string[] = [];
  lines.push('## Redundant Loader Groups');
  lines.push('');

  if (redundancyResult.redundantGroups.length === 0) {
    lines.push('✅ **No redundant loader groups detected!**');
    lines.push('');
    lines.push('All loader implementations are unique and serve distinct purposes.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('The following groups of loaders serve similar purposes and should be unified.');
  lines.push('');

  for (const group of redundancyResult.redundantGroups) {
    const typeEmoji = getTypeEmoji(group.loaderType);
    const confidencePercent = (group.similarityScore * 100).toFixed(0);
    
    lines.push(`### ${typeEmoji} ${group.groupId}`);
    lines.push('');
    lines.push(`**Type**: ${group.loaderType}`);
    lines.push(`**Similarity**: ${confidencePercent}%`);
    lines.push(`**Confidence**: ${group.evidence.confidence}`);
    lines.push('');
    lines.push('#### Keep (Primary)');
    lines.push('');
    lines.push(`- **\`${group.primaryLoader.componentName}\`**`);
    lines.push(`  - File: \`${group.primaryLoader.filePath}\``);
    lines.push(`  - Line: ${group.primaryLoader.lineNumber}`);
    lines.push(`  - Global: ${group.primaryLoader.isGlobal ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push('#### Remove (Redundant)');
    lines.push('');
    for (const loader of group.redundantLoaders) {
      lines.push(`- **\`${loader.componentName}\`**`);
      lines.push(`  - File: \`${loader.filePath}\``);
      lines.push(`  - Line: ${loader.lineNumber}`);
    }
    lines.push('');
    lines.push('#### Reason');
    lines.push('');
    lines.push(`> ${group.reason}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function generateReplacementStrategy(redundancyResult: RedundancyDetectionResult): string {
  const lines: string[] = [];
  lines.push('## Replacement Strategy');
  lines.push('');
  lines.push('This section provides a detailed plan for migrating to the UnifiedLoader component.');
  lines.push('');
  lines.push('### Target: UnifiedLoader Component');
  lines.push('');
  lines.push('All loaders should be replaced with the `UnifiedLoader` component located at:');
  lines.push('');
  lines.push('```');
  lines.push('src/components/ui/UnifiedLoader.tsx');
  lines.push('```');
  lines.push('');
  lines.push('### UnifiedLoader Variants');
  lines.push('');
  lines.push('| Variant | Use Case | Replaces |');
  lines.push('|---------|----------|----------|');
  lines.push('| `page` | Full page loading states | LoadingFallback, PageLoader, FullScreenLoader |');
  lines.push('| `inline` | Within content loading | LoadingSpinner, InlineLoader, Spinner |');
  lines.push('| `skeleton` | Placeholder content | Skeleton, SkeletonCard, SkeletonTable |');
  lines.push('| `overlay` | Modal-like overlay | LoadingOverlay, AuthLoadingOverlay |');
  lines.push('');
  lines.push('### UnifiedLoader Sizes');
  lines.push('');
  lines.push('| Size | Use Case |');
  lines.push('|------|----------|');
  lines.push('| `sm` | Buttons, inline text |');
  lines.push('| `md` | Cards, sections (default) |');
  lines.push('| `lg` | Full page, modals |');
  lines.push('');

  if (redundancyResult.redundantGroups.length > 0) {
    lines.push('### Migration Examples');
    lines.push('');
    for (const group of redundancyResult.redundantGroups) {
      const variant = LOADER_TYPE_TO_VARIANT[group.loaderType];
      lines.push(`#### Migrating ${group.primaryLoader.componentName}`);
      lines.push('');
      lines.push('**Before:**');
      lines.push('```tsx');
      lines.push(`<${group.primaryLoader.componentName} />`);
      lines.push('```');
      lines.push('');
      lines.push('**After:**');
      lines.push('```tsx');
      lines.push(`<UnifiedLoader variant="${variant}" />`);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateGlobalLoadingStateSection(): string {
  return `## Global Loading State Management

The application uses a Zustand store for managing global loading states.

### Loading Store Location

\`\`\`
src/stores/loadingStore.ts
\`\`\`

### Usage Pattern

\`\`\`tsx
import { useLoadingStore, useLoadingKey } from '@/stores/loadingStore';

// Option 1: Full store access
const { startLoading, stopLoading, isKeyLoading } = useLoadingStore();

// Option 2: Single key helper
const [isLoading, startLoading, stopLoading] = useLoadingKey('fetch-data');

// Start loading
startLoading('fetch-applications');

// Check loading state
if (isKeyLoading('fetch-applications')) {
  return <UnifiedLoader variant="page" message="Loading applications..." />;
}

// Stop loading
stopLoading('fetch-applications');
\`\`\`

### Benefits

- **Single source of truth**: All loading states in one store
- **No double loaders**: Prevents multiple spinners from showing
- **Key-based tracking**: Track multiple concurrent operations
- **Easy debugging**: \`getActiveKeys()\` shows all active loading operations

`;
}

function generateActionItems(scanResult: LoaderScanResult, redundancyResult: RedundancyDetectionResult): string {
  const lines: string[] = [];
  lines.push('## Action Items');
  lines.push('');

  if (redundancyResult.totalRedundant === 0) {
    lines.push(' **No immediate actions required!**');
    lines.push('');
    lines.push('The loader system is well-organized. Consider the following maintenance tasks:');
    lines.push('');
    lines.push('1. Continue using `UnifiedLoader` for new loading states');
    lines.push('2. Use `loadingStore` for global loading state management');
    lines.push('3. Ensure all loaders have proper accessibility labels');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('### Priority 1: Remove Redundant Loaders (High)');
  lines.push('');
  lines.push('The following loaders should be removed and replaced with UnifiedLoader:');
  lines.push('');

  let itemNum = 1;
  for (const group of redundancyResult.redundantGroups) {
    for (const loader of group.redundantLoaders) {
      lines.push(`${itemNum}. Remove \`${loader.componentName}\` from \`${loader.filePath}\``);
      lines.push(`   - Replace with: \`<UnifiedLoader variant="${LOADER_TYPE_TO_VARIANT[loader.type]}" />\``);
      itemNum++;
    }
  }
  lines.push('');

  lines.push('### Priority 2: Update Import Statements (Medium)');
  lines.push('');
  lines.push('After removing redundant loaders, update all files that import them.');
  lines.push('');

  lines.push('### Priority 3: Verify No Visual Regressions (Low)');
  lines.push('');
  lines.push('After migration, verify:');
  lines.push('');
  lines.push('- [ ] No visual flicker during page transitions');
  lines.push('- [ ] No double loaders appearing');
  lines.push('- [ ] Loading states work on mobile devices');
  lines.push('- [ ] Accessibility labels are present (screen reader support)');
  lines.push('- [ ] Reduced motion preference is respected');
  lines.push('');

  return lines.join('\n');
}

function generateUsagesAppendix(scanResult: LoaderScanResult): string {
  const lines: string[] = [];
  lines.push('## Appendix: Loader Usages');
  lines.push('');
  lines.push('This section documents where each loader is used in the codebase.');
  lines.push('');

  const usagesByComponent = new Map<string, LoaderUsage[]>();
  for (const usage of scanResult.usages) {
    const existing = usagesByComponent.get(usage.componentName) || [];
    existing.push(usage);
    usagesByComponent.set(usage.componentName, existing);
  }

  if (usagesByComponent.size === 0) {
    lines.push('No loader usages found in the codebase.');
    lines.push('');
    return lines.join('\n');
  }

  const sortedComponents = [...usagesByComponent.entries()].sort((a, b) => b[1].length - a[1].length);

  for (const [componentName, usages] of sortedComponents) {
    const jsxUsages = usages.filter(u => u.usageType === 'jsx');
    const importUsages = usages.filter(u => u.usageType === 'import');

    lines.push(`### ${componentName}`);
    lines.push('');
    lines.push(`**Total Usages**: ${usages.length} (${importUsages.length} imports, ${jsxUsages.length} JSX)`);
    lines.push('');

    if (importUsages.length > 0) {
      lines.push('**Imported in:**');
      lines.push('');
      for (const usage of importUsages.slice(0, 10)) {
        lines.push(`- \`${usage.filePath}:${usage.lineNumber}\``);
      }
      if (importUsages.length > 10) {
        lines.push(`- ... and ${importUsages.length - 10} more`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function generateLoaderUnificationPlan(scanResult: LoaderScanResult, redundancyResult: RedundancyDetectionResult): string {
  const sections: string[] = [];

  sections.push('# Loader Unification Plan');
  sections.push('');
  sections.push('> Forensic audit of all loader/spinner/skeleton implementations with a detailed unification strategy.');
  sections.push('');
  sections.push(`**Generated**: ${getTimestamp()}`);
  sections.push(`**Audit Version**: 1.0.0`);
  sections.push('');
  sections.push('## Table of Contents');
  sections.push('');
  sections.push('1. [Executive Summary](#executive-summary)');
  sections.push('2. [Loader Inventory](#loader-inventory)');
  sections.push('3. [Redundant Loader Groups](#redundant-loader-groups)');
  sections.push('4. [Replacement Strategy](#replacement-strategy)');
  sections.push('5. [Global Loading State Management](#global-loading-state-management)');
  sections.push('6. [Action Items](#action-items)');
  sections.push('7. [Appendix: Loader Usages](#appendix-loader-usages)');
  sections.push('');

  sections.push(generateExecutiveSummary(scanResult, redundancyResult));
  sections.push(generateLoaderInventory(scanResult, redundancyResult));
  sections.push(generateRedundantGroupsSection(redundancyResult));
  sections.push(generateReplacementStrategy(redundancyResult));
  sections.push(generateGlobalLoadingStateSection());
  sections.push(generateActionItems(scanResult, redundancyResult));
  sections.push(generateUsagesAppendix(scanResult));

  sections.push('---');
  sections.push('');
  sections.push('*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*');
  sections.push('');
  sections.push('**Validates**: Requirements 3.1, 3.2 - Loader System Unification');

  return sections.join('\n');
}

export async function generateLoaderUnificationReport(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log(' Running loader audit...\n');

  const scanResult = scanLoaders('src');
  
  console.log(`   Found ${scanResult.definitions.length} loader definitions`);
  console.log(`   Found ${scanResult.usages.length} loader usages`);

  const uniqueLoaders = new Map<string, LoaderInstance>();
  for (const def of scanResult.definitions) {
    const key = `${def.filePath}:${def.componentName}`;
    if (!uniqueLoaders.has(key)) {
      uniqueLoaders.set(key, {
        filePath: def.filePath,
        lineNumber: def.lineNumber,
        componentName: def.componentName,
        type: def.type,
        isGlobal: scanResult.loaders.find(
          l => l.filePath === def.filePath && l.componentName === def.componentName
        )?.isGlobal ?? false,
      });
    }
  }

  const loaderDefinitions = Array.from(uniqueLoaders.values());

  console.log(`\n Analyzing ${loaderDefinitions.length} unique loaders for redundancy...`);
  const redundancyResult = detectRedundancy(loaderDefinitions);
  
  console.log(`   Found ${redundancyResult.totalRedundant} redundant loaders`);
  console.log(`   Found ${redundancyResult.redundantGroups.length} redundant groups`);

  const report = generateLoaderUnificationPlan(scanResult, redundancyResult);

  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  await writeFile(fullOutputPath, report, 'utf-8');
  console.log(`\n Report written to: ${outputPath}`);

  return report;
}

export function getLoaderAuditSummary(): {
  totalDefinitions: number;
  totalUsages: number;
  uniqueLoaders: number;
  redundantLoaders: number;
  redundantGroups: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
  byType: Record<LoaderType, { total: number; redundant: number }>;
} {
  const scanResult = scanLoaders('src');
  
  const uniqueLoaders = new Map<string, LoaderInstance>();
  for (const def of scanResult.definitions) {
    const key = `${def.filePath}:${def.componentName}`;
    if (!uniqueLoaders.has(key)) {
      uniqueLoaders.set(key, {
        filePath: def.filePath,
        lineNumber: def.lineNumber,
        componentName: def.componentName,
        type: def.type,
        isGlobal: scanResult.loaders.find(
          l => l.filePath === def.filePath && l.componentName === def.componentName
        )?.isGlobal ?? false,
      });
    }
  }

  const loaderDefinitions = Array.from(uniqueLoaders.values());
  const redundancyResult = detectRedundancy(loaderDefinitions);

  const healthStatus = calculateOverallHealth(
    scanResult.definitions.length,
    redundancyResult.totalRedundant
  );

  return {
    totalDefinitions: scanResult.definitions.length,
    totalUsages: scanResult.usages.length,
    uniqueLoaders: loaderDefinitions.length,
    redundantLoaders: redundancyResult.totalRedundant,
    redundantGroups: redundancyResult.redundantGroups.length,
    healthStatus,
    byType: redundancyResult.summaryByType,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;

  console.log('📋 Loader Unification Plan Report Generator');
  console.log('============================================\n');

  generateLoaderUnificationReport(process.cwd(), outputPath)
    .then(report => {
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary'));
      
      if (summaryStart !== -1) {
        const summaryLines = lines.slice(summaryStart, summaryEnd !== -1 ? summaryEnd : summaryStart + 40);
        console.log('\n' + summaryLines.join('\n'));
      }
    })
    .catch(error => {
      console.error('❌ Error generating report:', error);
      process.exit(1);
    });
}
