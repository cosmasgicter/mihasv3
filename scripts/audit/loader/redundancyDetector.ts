/**
 * Redundancy Detector for MIHAS Loader Audit System
 * 
 * Compares loader implementations to identify redundant loaders that serve
 * the same purpose and should be unified.
 * 
 * @requirements 3.2 - IF redundant loader implementations exist THEN the
 *                     Audit_System SHALL flag them for removal
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoaderInstance, LoaderType, Evidence } from '../types';
import { generateEvidence } from '../utils/evidence';
import type { LoaderDefinition, LoaderScanResult } from './loaderScanner';

// =============================================================================
// Types
// =============================================================================

/**
 * A group of redundant loaders that serve the same purpose.
 */
export interface RedundantLoaderGroup {
  /** Unique identifier for this redundancy group */
  groupId: string;
  /** The type of loader in this group */
  loaderType: LoaderType;
  /** The primary/canonical loader that should be kept */
  primaryLoader: LoaderInstance;
  /** Redundant loaders that should be removed */
  redundantLoaders: LoaderInstance[];
  /** Reason why these loaders are considered redundant */
  reason: string;
  /** Similarity score (0-1) indicating how similar the loaders are */
  similarityScore: number;
  /** Evidence supporting the redundancy finding */
  evidence: Evidence;
}

/**
 * Result of redundancy detection.
 */
export interface RedundancyDetectionResult {
  /** All redundant loader groups found */
  redundantGroups: RedundantLoaderGroup[];
  /** Total number of redundant loaders */
  totalRedundant: number;
  /** Loaders that are unique (not redundant) */
  uniqueLoaders: LoaderInstance[];
  /** Summary by loader type */
  summaryByType: Record<LoaderType, { total: number; redundant: number }>;
}

/**
 * Similarity analysis between two loaders.
 */
interface LoaderSimilarity {
  loader1: LoaderInstance;
  loader2: LoaderInstance;
  nameSimilarity: number;
  typeSimilarity: number;
  functionalSimilarity: number;
  overallSimilarity: number;
  reasons: string[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Threshold for considering two loaders as redundant.
 * Loaders with similarity >= this threshold are flagged.
 */
const REDUNDANCY_THRESHOLD = 0.7;

/**
 * Weight factors for different similarity aspects.
 */
const SIMILARITY_WEIGHTS = {
  name: 0.4,
  type: 0.3,
  functional: 0.3,
};

/**
 * Common loader name patterns that indicate similar functionality.
 */
const FUNCTIONAL_PATTERNS: Record<string, string[]> = {
  spinner: ['spinner', 'loading', 'loader', 'spin'],
  skeleton: ['skeleton', 'placeholder', 'shimmer'],
  progress: ['progress', 'bar', 'indicator'],
  overlay: ['overlay', 'fullscreen', 'modal', 'backdrop'],
  inline: ['inline', 'button', 'small', 'mini'],
};

/**
 * Patterns that indicate a loader is a wrapper/variant of another.
 */
const VARIANT_PATTERNS = [
  /^Enhanced/i,
  /^Custom/i,
  /^Fancy/i,
  /^Simple/i,
  /^Basic/i,
  /^Advanced/i,
  /^New/i,
  /^Old/i,
  /^Legacy/i,
  /^V2$/i,
  /^V3$/i,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculates the Levenshtein distance between two strings.
 * Used for fuzzy name matching.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Create a matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculates name similarity between two loader names.
 * Returns a score between 0 and 1.
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  // Normalize names (lowercase, remove common prefixes/suffixes)
  const normalize = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/component$/i, '')
      .replace(/^(loading|loader)/i, '')
      .replace(/(loading|loader)$/i, '');
  };
  
  const normalized1 = normalize(name1);
  const normalized2 = normalize(name2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) {
    return 1.0;
  }
  
  // Check if one contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.9;
  }
  
  // Calculate Levenshtein-based similarity
  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  const similarity = 1 - (distance / maxLen);
  
  return Math.max(0, similarity);
}

/**
 * Calculates type similarity between two loaders.
 * Returns 1.0 if same type, 0.5 if related types, 0 otherwise.
 */
function calculateTypeSimilarity(type1: LoaderType, type2: LoaderType): number {
  if (type1 === type2) {
    return 1.0;
  }
  
  // Related type pairs
  const relatedTypes: [LoaderType, LoaderType][] = [
    ['spinner', 'inline'],
    ['overlay', 'spinner'],
    ['skeleton', 'progress'],
  ];
  
  for (const [t1, t2] of relatedTypes) {
    if ((type1 === t1 && type2 === t2) || (type1 === t2 && type2 === t1)) {
      return 0.5;
    }
  }
  
  return 0;
}

/**
 * Calculates functional similarity based on name patterns.
 * Returns a score between 0 and 1.
 */
function calculateFunctionalSimilarity(name1: string, name2: string): number {
  const lowerName1 = name1.toLowerCase();
  const lowerName2 = name2.toLowerCase();
  
  // Check if both names match the same functional patterns
  let matchingPatterns = 0;
  let totalPatterns = 0;
  
  for (const [category, patterns] of Object.entries(FUNCTIONAL_PATTERNS)) {
    const name1Matches = patterns.some(p => lowerName1.includes(p));
    const name2Matches = patterns.some(p => lowerName2.includes(p));
    
    if (name1Matches || name2Matches) {
      totalPatterns++;
      if (name1Matches && name2Matches) {
        matchingPatterns++;
      }
    }
  }
  
  if (totalPatterns === 0) return 0;
  
  // Check for variant patterns (Enhanced*, Custom*, etc.)
  const isVariant1 = VARIANT_PATTERNS.some(p => p.test(name1));
  const isVariant2 = VARIANT_PATTERNS.some(p => p.test(name2));
  
  // If one is a variant of a base name that matches the other
  if (isVariant1 || isVariant2) {
    const baseName1 = name1.replace(/^(Enhanced|Custom|Fancy|Simple|Basic|Advanced|New|Old|Legacy)/i, '');
    const baseName2 = name2.replace(/^(Enhanced|Custom|Fancy|Simple|Basic|Advanced|New|Old|Legacy)/i, '');
    
    if (baseName1.toLowerCase() === baseName2.toLowerCase()) {
      return 0.95;
    }
  }
  
  return matchingPatterns / totalPatterns;
}

/**
 * Analyzes similarity between two loaders.
 */
function analyzeLoaderSimilarity(loader1: LoaderInstance, loader2: LoaderInstance): LoaderSimilarity {
  const nameSimilarity = calculateNameSimilarity(loader1.componentName, loader2.componentName);
  const typeSimilarity = calculateTypeSimilarity(loader1.type, loader2.type);
  const functionalSimilarity = calculateFunctionalSimilarity(loader1.componentName, loader2.componentName);
  
  // Calculate weighted overall similarity
  const overallSimilarity = 
    nameSimilarity * SIMILARITY_WEIGHTS.name +
    typeSimilarity * SIMILARITY_WEIGHTS.type +
    functionalSimilarity * SIMILARITY_WEIGHTS.functional;
  
  // Build reasons for similarity
  const reasons: string[] = [];
  
  if (nameSimilarity >= 0.8) {
    reasons.push(`Similar names: "${loader1.componentName}" and "${loader2.componentName}"`);
  }
  
  if (typeSimilarity === 1.0) {
    reasons.push(`Same loader type: ${loader1.type}`);
  } else if (typeSimilarity > 0) {
    reasons.push(`Related loader types: ${loader1.type} and ${loader2.type}`);
  }
  
  if (functionalSimilarity >= 0.8) {
    reasons.push('Serve the same functional purpose based on naming patterns');
  }
  
  // Check for variant relationship
  const isVariant1 = VARIANT_PATTERNS.some(p => p.test(loader1.componentName));
  const isVariant2 = VARIANT_PATTERNS.some(p => p.test(loader2.componentName));
  if (isVariant1 || isVariant2) {
    reasons.push('One appears to be a variant/enhanced version of the other');
  }
  
  return {
    loader1,
    loader2,
    nameSimilarity,
    typeSimilarity,
    functionalSimilarity,
    overallSimilarity,
    reasons,
  };
}

/**
 * Determines which loader should be the primary (kept) loader.
 * Prefers: global loaders, loaders in ui/ directory, simpler names.
 */
function determinePrimaryLoader(loaders: LoaderInstance[]): LoaderInstance {
  // Sort by priority
  const sorted = [...loaders].sort((a, b) => {
    // Prefer global loaders
    if (a.isGlobal && !b.isGlobal) return -1;
    if (!a.isGlobal && b.isGlobal) return 1;
    
    // Prefer loaders in components/ui/
    const aInUi = a.filePath.includes('components/ui/');
    const bInUi = b.filePath.includes('components/ui/');
    if (aInUi && !bInUi) return -1;
    if (!aInUi && bInUi) return 1;
    
    // Prefer simpler names (shorter, no variant prefixes)
    const aIsVariant = VARIANT_PATTERNS.some(p => p.test(a.componentName));
    const bIsVariant = VARIANT_PATTERNS.some(p => p.test(b.componentName));
    if (!aIsVariant && bIsVariant) return -1;
    if (aIsVariant && !bIsVariant) return 1;
    
    // Prefer shorter names
    return a.componentName.length - b.componentName.length;
  });
  
  return sorted[0];
}

/**
 * Groups similar loaders together using Union-Find algorithm.
 */
function groupSimilarLoaders(
  loaders: LoaderInstance[],
  threshold: number
): LoaderInstance[][] {
  const n = loaders.length;
  if (n === 0) return [];
  
  // Union-Find data structure
  const parent: number[] = Array(n).fill(0).map((_, i) => i);
  const rank: number[] = Array(n).fill(0);
  
  const find = (x: number): number => {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  };
  
  const union = (x: number, y: number): void => {
    const px = find(x);
    const py = find(y);
    if (px === py) return;
    
    if (rank[px] < rank[py]) {
      parent[px] = py;
    } else if (rank[px] > rank[py]) {
      parent[py] = px;
    } else {
      parent[py] = px;
      rank[px]++;
    }
  };
  
  // Compare all pairs and union similar loaders
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const similarity = analyzeLoaderSimilarity(loaders[i], loaders[j]);
      if (similarity.overallSimilarity >= threshold) {
        union(i, j);
      }
    }
  }
  
  // Group loaders by their root parent
  const groups = new Map<number, LoaderInstance[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(loaders[i]);
  }
  
  // Return only groups with more than one loader (redundant groups)
  return Array.from(groups.values()).filter(group => group.length > 1);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Identifies redundant loaders from a list of loader instances.
 * 
 * @param loaders - Array of loader instances to analyze
 * @param threshold - Similarity threshold for redundancy (default: 0.7)
 * @returns Array of redundant loader instances
 */
export function identifyRedundant(
  loaders: LoaderInstance[],
  threshold: number = REDUNDANCY_THRESHOLD
): LoaderInstance[] {
  const groups = groupSimilarLoaders(loaders, threshold);
  const redundant: LoaderInstance[] = [];
  
  for (const group of groups) {
    const primary = determinePrimaryLoader(group);
    for (const loader of group) {
      if (loader !== primary) {
        redundant.push(loader);
      }
    }
  }
  
  return redundant;
}

/**
 * Detects redundant loaders and returns detailed analysis.
 * 
 * @param loaders - Array of loader instances to analyze
 * @param threshold - Similarity threshold for redundancy (default: 0.7)
 * @returns Detailed redundancy detection result
 */
export function detectRedundancy(
  loaders: LoaderInstance[],
  threshold: number = REDUNDANCY_THRESHOLD
): RedundancyDetectionResult {
  const groups = groupSimilarLoaders(loaders, threshold);
  const redundantGroups: RedundantLoaderGroup[] = [];
  const redundantSet = new Set<string>();
  
  let groupCounter = 0;
  
  for (const group of groups) {
    groupCounter++;
    const primary = determinePrimaryLoader(group);
    const redundantInGroup = group.filter(l => l !== primary);
    
    // Mark all redundant loaders
    for (const loader of redundantInGroup) {
      redundantSet.add(`${loader.filePath}:${loader.lineNumber}:${loader.componentName}`);
    }
    
    // Calculate group similarity (average pairwise similarity)
    let totalSimilarity = 0;
    let pairCount = 0;
    const allReasons: string[] = [];
    
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const similarity = analyzeLoaderSimilarity(group[i], group[j]);
        totalSimilarity += similarity.overallSimilarity;
        pairCount++;
        allReasons.push(...similarity.reasons);
      }
    }
    
    const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;
    
    // Deduplicate reasons
    const uniqueReasons = [...new Set(allReasons)];
    const reason = uniqueReasons.join('; ');
    
    // Generate evidence
    const evidence = generateEvidence({
      filePath: primary.filePath,
      lineNumbers: [primary.lineNumber, ...redundantInGroup.map(l => l.lineNumber)],
      reason: `Redundant loader group detected: ${group.map(l => l.componentName).join(', ')}. ${reason}`,
      confidence: avgSimilarity >= 0.9 ? 'certain' : avgSimilarity >= 0.8 ? 'likely' : 'possible',
    });
    
    redundantGroups.push({
      groupId: `redundant-loader-group-${groupCounter}`,
      loaderType: primary.type,
      primaryLoader: primary,
      redundantLoaders: redundantInGroup,
      reason,
      similarityScore: avgSimilarity,
      evidence,
    });
  }
  
  // Identify unique loaders (not in any redundant group)
  const uniqueLoaders = loaders.filter(loader => {
    const key = `${loader.filePath}:${loader.lineNumber}:${loader.componentName}`;
    return !redundantSet.has(key) && 
           !redundantGroups.some(g => 
             g.primaryLoader.filePath === loader.filePath &&
             g.primaryLoader.lineNumber === loader.lineNumber &&
             g.primaryLoader.componentName === loader.componentName
           );
  });
  
  // Calculate summary by type
  const summaryByType: Record<LoaderType, { total: number; redundant: number }> = {
    spinner: { total: 0, redundant: 0 },
    skeleton: { total: 0, redundant: 0 },
    progress: { total: 0, redundant: 0 },
    overlay: { total: 0, redundant: 0 },
    inline: { total: 0, redundant: 0 },
  };
  
  for (const loader of loaders) {
    summaryByType[loader.type].total++;
  }
  
  for (const group of redundantGroups) {
    for (const loader of group.redundantLoaders) {
      summaryByType[loader.type].redundant++;
    }
  }
  
  return {
    redundantGroups,
    totalRedundant: redundantSet.size,
    uniqueLoaders,
    summaryByType,
  };
}

/**
 * Analyzes similarity between two specific loaders.
 * Useful for detailed comparison.
 * 
 * @param loader1 - First loader to compare
 * @param loader2 - Second loader to compare
 * @returns Detailed similarity analysis
 */
export function compareLoaders(
  loader1: LoaderInstance,
  loader2: LoaderInstance
): LoaderSimilarity {
  return analyzeLoaderSimilarity(loader1, loader2);
}

/**
 * Generates a unification plan for redundant loaders.
 * 
 * @param result - Redundancy detection result
 * @returns Markdown-formatted unification plan
 */
export function generateUnificationPlan(result: RedundancyDetectionResult): string {
  const lines: string[] = [];
  
  lines.push('# Loader Unification Plan');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Redundant Loaders**: ${result.totalRedundant}`);
  lines.push(`- **Redundant Groups**: ${result.redundantGroups.length}`);
  lines.push(`- **Unique Loaders**: ${result.uniqueLoaders.length}`);
  lines.push('');
  
  // Summary by type
  lines.push('### By Type');
  lines.push('');
  lines.push('| Type | Total | Redundant | Keep |');
  lines.push('|------|-------|-----------|------|');
  for (const [type, stats] of Object.entries(result.summaryByType)) {
    if (stats.total > 0) {
      lines.push(`| ${type} | ${stats.total} | ${stats.redundant} | ${stats.total - stats.redundant} |`);
    }
  }
  lines.push('');
  
  // Redundant groups
  if (result.redundantGroups.length > 0) {
    lines.push('## Redundant Loader Groups');
    lines.push('');
    
    for (const group of result.redundantGroups) {
      lines.push(`### ${group.groupId}`);
      lines.push('');
      lines.push(`**Type**: ${group.loaderType}`);
      lines.push(`**Similarity Score**: ${(group.similarityScore * 100).toFixed(1)}%`);
      lines.push(`**Confidence**: ${group.evidence.confidence}`);
      lines.push('');
      
      lines.push('**Keep (Primary)**:');
      lines.push(`- \`${group.primaryLoader.componentName}\` at \`${group.primaryLoader.filePath}:${group.primaryLoader.lineNumber}\``);
      lines.push('');
      
      lines.push('**Remove (Redundant)**:');
      for (const loader of group.redundantLoaders) {
        lines.push(`- \`${loader.componentName}\` at \`${loader.filePath}:${loader.lineNumber}\``);
      }
      lines.push('');
      
      lines.push('**Reason**:');
      lines.push(`> ${group.reason}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }
  
  // Unique loaders
  if (result.uniqueLoaders.length > 0) {
    lines.push('## Unique Loaders (No Action Required)');
    lines.push('');
    for (const loader of result.uniqueLoaders) {
      lines.push(`- \`${loader.componentName}\` (${loader.type}) at \`${loader.filePath}:${loader.lineNumber}\``);
    }
    lines.push('');
  }
  
  // Action items
  lines.push('## Action Items');
  lines.push('');
  lines.push('1. Review each redundant group and confirm the primary loader is the correct choice');
  lines.push('2. Update imports in files using redundant loaders to use the primary loader');
  lines.push('3. Remove redundant loader files after updating all imports');
  lines.push('4. Run tests to ensure no regressions');
  lines.push('');
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the redundancy detector and prints results to console.
 */
export function runRedundancyDetectorCLI(): void {
  // Import scanner dynamically to avoid circular dependency
  const { scanLoaders } = require('./loaderScanner');
  
  console.log('Loader Redundancy Detection Results');
  console.log('====================================\n');
  
  const scanResult: LoaderScanResult = scanLoaders();
  
  // Get unique loader definitions for redundancy analysis
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
  
  console.log(`Analyzing ${loaderDefinitions.length} unique loader definitions...\n`);
  
  const result = detectRedundancy(loaderDefinitions);
  
  console.log(`Total Redundant Loaders: ${result.totalRedundant}`);
  console.log(`Redundant Groups: ${result.redundantGroups.length}`);
  console.log(`Unique Loaders: ${result.uniqueLoaders.length}`);
  console.log('');
  
  // Print redundant groups
  if (result.redundantGroups.length > 0) {
    console.log('Redundant Loader Groups:');
    console.log('------------------------');
    for (const group of result.redundantGroups) {
      console.log(`\n${group.groupId} (${group.loaderType})`);
      console.log(`  Similarity: ${(group.similarityScore * 100).toFixed(1)}%`);
      console.log(`  Keep: ${group.primaryLoader.componentName} (${group.primaryLoader.filePath})`);
      console.log('  Remove:');
      for (const loader of group.redundantLoaders) {
        console.log(`    - ${loader.componentName} (${loader.filePath})`);
      }
      console.log(`  Reason: ${group.reason}`);
    }
  } else {
    console.log('No redundant loaders detected.');
  }
  
  console.log('\n');
  
  // Print unification plan
  const plan = generateUnificationPlan(result);
  console.log(plan);
}

// Check if running as main module
const isMainModule = (): boolean => {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;
  
  const normalizedScript = scriptPath.replace(/\\/g, '/');
  const normalizedMeta = import.meta.url.replace(/\\/g, '/').replace('file:///', '').replace('file://', '');
  
  return normalizedScript.includes('redundancyDetector') || normalizedMeta.includes(normalizedScript);
};

if (isMainModule()) {
  runRedundancyDetectorCLI();
}
