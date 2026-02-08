/**
 * Feature Flag Scanner for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans the codebase for feature flag definitions and checks whether
 * each flag is actually used in conditional expressions (if, ternary,
 * &&, ||). Flags that are defined but never used in conditionals are
 * reported as dead feature flags.
 * 
 * Feature flag patterns detected:
 * - Constants: FEATURE_*, FLAG_*, ENABLE_*, IS_*_ENABLED, USE_*_FEATURE
 * - Environment variables: VITE_FEATURE_*, VITE_ENABLE_*, process.env.FEATURE_*,
 *   import.meta.env.VITE_FEATURE_*
 * - Objects with feature flag patterns (e.g., featureFlags.someFlag)
 * 
 * @requirements 9.5 - WHEN the Audit_System scans the codebase THEN it SHALL identify dead feature flags
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DeadCodeItem } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * A feature flag definition found in a source file.
 */
export interface FeatureFlagDefinition {
  /** Relative file path from project root */
  filePath: string;
  /** Name of the feature flag */
  name: string;
  /** Line number where the flag is defined (1-based) */
  lineNumber: number;
  /** How the flag was detected */
  source: 'constant' | 'env_variable' | 'object_property';
  /** The raw line of code where the flag was found */
  rawLine: string;
}

/**
 * A usage of a feature flag in a conditional expression.
 */
export interface FeatureFlagUsage {
  /** Relative file path from project root */
  filePath: string;
  /** Name of the feature flag used */
  flagName: string;
  /** Line number where the flag is used (1-based) */
  lineNumber: number;
  /** Type of conditional expression */
  conditionalType: 'if' | 'ternary' | 'logical_and' | 'logical_or' | 'switch';
  /** The raw line of code where the flag is used */
  rawLine: string;
}

/**
 * Result of scanning for feature flags.
 */
export interface FeatureFlagScanResult {
  /** All feature flag definitions found */
  definitions: FeatureFlagDefinition[];
  /** All feature flag usages in conditionals */
  usages: FeatureFlagUsage[];
  /** Dead feature flags (defined but not used in conditionals) */
  deadFlags: DeadCodeItem[];
  /** Total files scanned */
  filesScanned: number;
  /** Errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Directories to scan for feature flags.
 */
const SCAN_DIRECTORIES = [
  'src',
  'api-src',
  'lib',
];

/**
 * Paths to exclude from scanning.
 */
const EXCLUDED_PATHS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
]);

/**
 * File extensions to scan.
 */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * Patterns for detecting feature flag constant definitions.
 * Matches: export const FEATURE_X = ..., const ENABLE_X = ..., etc.
 */
const CONSTANT_FLAG_PATTERNS = [
  // FEATURE_*, FLAG_*, ENABLE_* constants
  /(?:export\s+)?(?:const|let|var)\s+(FEATURE_[A-Z][A-Z0-9_]*)\s*[=:]/,
  /(?:export\s+)?(?:const|let|var)\s+(FLAG_[A-Z][A-Z0-9_]*)\s*[=:]/,
  /(?:export\s+)?(?:const|let|var)\s+(ENABLE_[A-Z][A-Z0-9_]*)\s*[=:]/,
  // IS_*_ENABLED pattern
  /(?:export\s+)?(?:const|let|var)\s+(IS_[A-Z][A-Z0-9_]*_ENABLED)\s*[=:]/,
  // USE_*_FEATURE pattern
  /(?:export\s+)?(?:const|let|var)\s+(USE_[A-Z][A-Z0-9_]*_FEATURE)\s*[=:]/,
];

/**
 * Patterns for detecting environment variable feature flags.
 * Matches: process.env.FEATURE_*, import.meta.env.VITE_FEATURE_*, etc.
 */
const ENV_FLAG_PATTERNS = [
  // process.env.FEATURE_* or process.env.ENABLE_*
  /process\.env\.(FEATURE_[A-Z][A-Z0-9_]*)/,
  /process\.env\.(ENABLE_[A-Z][A-Z0-9_]*)/,
  /process\.env\.(VITE_FEATURE_[A-Z][A-Z0-9_]*)/,
  /process\.env\.(VITE_ENABLE_[A-Z][A-Z0-9_]*)/,
  // import.meta.env.VITE_FEATURE_* or import.meta.env.VITE_ENABLE_*
  /import\.meta\.env\.(VITE_FEATURE_[A-Z][A-Z0-9_]*)/,
  /import\.meta\.env\.(VITE_ENABLE_[A-Z][A-Z0-9_]*)/,
];

/**
 * Patterns for detecting feature flag object properties.
 * Matches: featureFlags.someFlag, features.enableX, flags.isEnabled, etc.
 */
const OBJECT_FLAG_PATTERNS = [
  // featureFlags.propertyName or featureFlags['propertyName']
  /(?:featureFlags|features|flags)\.([\w]+)/,
  /(?:featureFlags|features|flags)\[['"](\w+)['"]\]/,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Recursively finds all source files in a directory.
 */
function findSourceFiles(dir: string, projectRoot: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_PATHS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findSourceFiles(fullPath, projectRoot));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(path.relative(projectRoot, fullPath));
      }
    }
  }

  return files;
}

/**
 * Collects all source files from scan directories, deduplicating.
 */
function collectFiles(projectRoot: string): string[] {
  const seen = new Set<string>();
  const files: string[] = [];

  for (const scanDir of SCAN_DIRECTORIES) {
    const fullDir = path.join(projectRoot, scanDir);
    for (const f of findSourceFiles(fullDir, projectRoot)) {
      if (!seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  }

  return files;
}

// =============================================================================
// Feature Flag Detection
// =============================================================================

/**
 * Extracts feature flag definitions from file content.
 * Looks for constant definitions, environment variable references,
 * and object property patterns that match feature flag naming conventions.
 */
export function extractFeatureFlagDefinitions(
  filePath: string,
  content: string
): FeatureFlagDefinition[] {
  const definitions: FeatureFlagDefinition[] = [];
  const lines = content.split('\n');
  const seenFlags = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmed = line.trim();

    // Skip comment-only lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    // Check constant flag patterns
    for (const pattern of CONSTANT_FLAG_PATTERNS) {
      const match = pattern.exec(line);
      if (match && match[1]) {
        const flagName = match[1];
        if (!seenFlags.has(flagName)) {
          seenFlags.add(flagName);
          definitions.push({
            filePath,
            name: flagName,
            lineNumber,
            source: 'constant',
            rawLine: trimmed,
          });
        }
      }
    }

    // Check environment variable flag patterns (only in definition context)
    // i.e., when assigned to a variable: const x = process.env.FEATURE_X
    for (const pattern of ENV_FLAG_PATTERNS) {
      const match = pattern.exec(line);
      if (match && match[1]) {
        const flagName = match[1];
        // Only count as a definition if it's being assigned to a variable
        if (/(?:const|let|var)\s+\w+\s*=/.test(line) || /^\s*(?:export\s+)?(?:const|let|var)/.test(line)) {
          if (!seenFlags.has(flagName)) {
            seenFlags.add(flagName);
            definitions.push({
              filePath,
              name: flagName,
              lineNumber,
              source: 'env_variable',
              rawLine: trimmed,
            });
          }
        }
      }
    }

    // Check object flag patterns (only in definition/assignment context)
    for (const pattern of OBJECT_FLAG_PATTERNS) {
      const match = pattern.exec(line);
      if (match && match[1]) {
        const propName = match[1];
        // Only count as definition if it's an assignment (key: value or prop = value)
        if (/:\s*(?:true|false|['"]|process\.env|import\.meta)/.test(line) ||
            /=\s*(?:true|false|['"]|process\.env|import\.meta)/.test(line)) {
          const flagName = `featureFlags.${propName}`;
          if (!seenFlags.has(flagName)) {
            seenFlags.add(flagName);
            definitions.push({
              filePath,
              name: flagName,
              lineNumber,
              source: 'object_property',
              rawLine: trimmed,
            });
          }
        }
      }
    }
  }

  return definitions;
}

/**
 * Extracts feature flag usages in conditional expressions from file content.
 * Looks for flags used in if statements, ternary operators, && and || expressions.
 */
export function extractFeatureFlagUsages(
  filePath: string,
  content: string,
  knownFlags: string[]
): FeatureFlagUsage[] {
  const usages: FeatureFlagUsage[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmed = line.trim();

    // Skip comment-only lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    for (const flagName of knownFlags) {
      // Determine the search token based on flag type
      const searchTokens = getSearchTokens(flagName);

      for (const token of searchTokens) {
        if (!line.includes(token)) continue;

        const conditionalType = detectConditionalType(line, token);
        if (conditionalType) {
          usages.push({
            filePath,
            flagName,
            lineNumber,
            conditionalType,
            rawLine: trimmed,
          });
          break; // Only count one usage per flag per line
        }
      }
    }
  }

  return usages;
}

/**
 * Gets the search tokens for a flag name.
 * For object property flags like "featureFlags.someFlag", returns both
 * the full dotted name and the property name.
 */
function getSearchTokens(flagName: string): string[] {
  const tokens = [flagName];

  // For env variable flags, also search for the full env access patterns
  if (flagName.startsWith('VITE_')) {
    tokens.push(`import.meta.env.${flagName}`);
    tokens.push(`process.env.${flagName}`);
  } else if (flagName.startsWith('FEATURE_') || flagName.startsWith('ENABLE_')) {
    tokens.push(`process.env.${flagName}`);
  }

  // For object property flags, the flagName already includes the prefix
  // e.g., "featureFlags.someFlag"

  return tokens;
}

/**
 * Detects what type of conditional expression a flag is used in.
 * Returns null if the flag is not used in a conditional context.
 */
export function detectConditionalType(
  line: string,
  flagToken: string
): FeatureFlagUsage['conditionalType'] | null {
  const trimmed = line.trim();

  // Skip definition lines (const/let/var assignments that define the flag)
  if (/^\s*(?:export\s+)?(?:const|let|var)\s+/.test(trimmed) && 
      trimmed.includes('=') && 
      !trimmed.includes('?') &&
      !trimmed.includes('&&') &&
      !trimmed.includes('||')) {
    // This is a simple assignment, not a conditional
    // But allow ternary and logical operators in assignments
    return null;
  }

  // Check for if/else if statements
  if (/\bif\s*\(/.test(trimmed) || /\belse\s+if\s*\(/.test(trimmed)) {
    return 'if';
  }

  // Check for switch statements
  if (/\bswitch\s*\(/.test(trimmed)) {
    return 'switch';
  }

  // Check for ternary operator (? :)
  if (trimmed.includes('?') && trimmed.includes(':')) {
    return 'ternary';
  }

  // Check for logical AND (&&) - common pattern: flag && <component>
  if (trimmed.includes('&&')) {
    return 'logical_and';
  }

  // Check for logical OR (||) - common pattern: flag || fallback
  if (trimmed.includes('||')) {
    return 'logical_or';
  }

  // Check for ternary on the same line as an assignment
  // e.g., const x = FLAG ? a : b
  if (/=\s*.*\?.*:/.test(trimmed)) {
    return 'ternary';
  }

  return null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Scans the codebase for feature flags and identifies dead ones.
 * A dead feature flag is one that is defined but never used in a conditional expression.
 * 
 * @param projectRoot - The root directory of the project
 * @returns Array of DeadCodeItem for each dead feature flag
 */
export function scanFeatureFlags(projectRoot: string = process.cwd()): DeadCodeItem[] {
  const result = scanFeatureFlagsFull(projectRoot);
  return result.deadFlags;
}

/**
 * Runs the full feature flag scan and returns structured results.
 * 
 * @param projectRoot - The root directory of the project
 * @returns Complete scan result with definitions, usages, and dead flags
 */
export function scanFeatureFlagsFull(projectRoot: string = process.cwd()): FeatureFlagScanResult {
  const files = collectFiles(projectRoot);
  const errors: { filePath: string; error: string }[] = [];
  const allDefinitions: FeatureFlagDefinition[] = [];
  const allUsages: FeatureFlagUsage[] = [];

  // Phase 1: Collect all feature flag definitions
  for (const filePath of files) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const defs = extractFeatureFlagDefinitions(filePath, content);
      allDefinitions.push(...defs);
    } catch (err) {
      errors.push({
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Phase 2: Collect all known flag names
  const knownFlagNames = allDefinitions.map(d => d.name);

  // Phase 3: Scan all files for flag usages in conditionals
  for (const filePath of files) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const usages = extractFeatureFlagUsages(filePath, content, knownFlagNames);
      allUsages.push(...usages);
    } catch (err) {
      // Already captured in phase 1 if same file
      if (!errors.some(e => e.filePath === filePath)) {
        errors.push({
          filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Phase 4: Identify dead flags (defined but not used in conditionals)
  const usedFlagNames = new Set(allUsages.map(u => u.flagName));
  const deadFlags: DeadCodeItem[] = [];

  for (const def of allDefinitions) {
    if (!usedFlagNames.has(def.name)) {
      deadFlags.push({
        type: 'FEATURE_FLAG',
        filePath: def.filePath,
        name: def.name,
        evidence: `Feature flag '${def.name}' defined at ${def.filePath}:${def.lineNumber} is not used in any conditional expression (if, ternary, &&, ||). Source: ${def.source}. Definition: ${def.rawLine}`,
        safeToRemove: true,
        dependencies: [],
      });
    }
  }

  return {
    definitions: allDefinitions,
    usages: allUsages,
    deadFlags,
    filesScanned: files.length,
    errors,
  };
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the feature flag scanner and prints results to console.
 */
export function runFeatureFlagScannerCLI(): void {
  console.log('Feature Flag Scanner Results');
  console.log('============================\n');

  const result = scanFeatureFlagsFull();

  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Feature flag definitions found: ${result.definitions.length}`);
  console.log(`Feature flag usages in conditionals: ${result.usages.length}`);
  console.log(`Dead feature flags: ${result.deadFlags.length}`);
  console.log('');

  if (result.definitions.length > 0) {
    console.log('Feature Flag Definitions:');
    for (const def of result.definitions) {
      const usageCount = result.usages.filter(u => u.flagName === def.name).length;
      const status = usageCount > 0 ? `✓ used (${usageCount} conditional${usageCount > 1 ? 's' : ''})` : '✗ DEAD';
      console.log(`  ${status} ${def.name}`);
      console.log(`    File: ${def.filePath}:${def.lineNumber}`);
      console.log(`    Source: ${def.source}`);
      console.log(`    Definition: ${def.rawLine}`);
      console.log('');
    }
  }

  if (result.deadFlags.length > 0) {
    console.log('\nDead Feature Flags (defined but never used in conditionals):');
    for (const flag of result.deadFlags) {
      console.log(`  - ${flag.name}`);
      console.log(`    File: ${flag.filePath}`);
      console.log(`    Evidence: ${flag.evidence}`);
      console.log('');
    }
  } else if (result.definitions.length > 0) {
    console.log('\nAll feature flags are used in conditionals. No dead flags found!');
  } else {
    console.log('No feature flag definitions found in the codebase.');
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errors) {
      console.log(`  - ${error.filePath}: ${error.error}`);
    }
  }
}

// Check if running as main module (not imported by another module)
const isMainModule = (): boolean => {
  try {
    const scriptPath = process.argv[1];
    if (!scriptPath) return false;

    // Don't run CLI when loaded by test runners
    if (scriptPath.includes('vitest') || scriptPath.includes('jest') || scriptPath.includes('mocha')) {
      return false;
    }

    const normalizedScript = scriptPath.replace(/\\/g, '/');
    return normalizedScript.includes('featureFlagScanner');
  } catch {
    return false;
  }
};

if (isMainModule()) {
  runFeatureFlagScannerCLI();
}
