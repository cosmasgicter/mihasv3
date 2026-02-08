/**
 * Unused Export Scanner for MIHAS Frontend-Backend Forensic Audit
 * 
 * Builds an import graph across the codebase and identifies exports
 * that are never imported anywhere. Focuses on components, hooks,
 * services, and utilities in the src/ directory.
 * 
 * @requirements 9.1 - WHEN the Audit_System scans the codebase THEN it SHALL identify unused components
 * @requirements 9.2 - WHEN the Audit_System scans the codebase THEN it SHALL identify unused hooks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DeadCodeItem, DeadCodeType } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * An export found in a source file.
 */
export interface ExportEntry {
  /** Relative file path from project root */
  filePath: string;
  /** Name of the exported symbol */
  name: string;
  /** Line number of the export */
  lineNumber: number;
  /** Whether this is a default export */
  isDefault: boolean;
  /** Classified type of the export */
  type: DeadCodeType;
}

/**
 * An import found in a source file.
 */
export interface ImportEntry {
  /** File that contains the import statement */
  importerPath: string;
  /** The import source/specifier (e.g., '@/hooks/useAuth') */
  importSource: string;
  /** Names imported (empty for side-effect imports) */
  importedNames: string[];
  /** Whether a default import is used */
  hasDefaultImport: boolean;
  /** The default import name (if any) */
  defaultImportName?: string;
  /** Line number of the import */
  lineNumber: number;
}

/**
 * Result of scanning for unused exports.
 */
export interface UnusedExportScanResult {
  /** All exports found in the codebase */
  allExports: ExportEntry[];
  /** All imports found in the codebase */
  allImports: ImportEntry[];
  /** Exports that are never imported */
  unusedExports: DeadCodeItem[];
  /** Total files scanned */
  filesScanned: number;
  /** Errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Directories to scan for exports.
 */
const EXPORT_SCAN_DIRECTORIES = [
  'src/components',
  'src/hooks',
  'src/services',
  'src/stores',
  'src/utils',
  'src/lib',
  'src/contexts',
  'src/types',
  'src/routes',
  'src/forms',
  'src/config',
  'src/data',
  'src/design-system',
];

/**
 * Additional files at src/ root to scan for imports (entry points).
 */
const ENTRY_POINT_FILES = [
  'src/App.tsx',
  'src/App.lazy.tsx',
  'src/main.tsx',
  'src/service-worker.ts',
  'src/v2-improvements-index.ts',
];

/**
 * All directories to scan for imports (consumers of exports).
 */
const IMPORT_SCAN_DIRECTORIES = [
  'src/pages',
  'src/examples',
  'src/analysis',
  ...EXPORT_SCAN_DIRECTORIES,
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
      if (SOURCE_EXTENSIONS.has(ext) && !entry.name.includes('.test.') && !entry.name.endsWith('.d.ts')) {
        files.push(path.relative(projectRoot, fullPath));
      }
    }
  }

  return files;
}

/**
 * Gets the line number for a regex match index in content.
 */
function getLineNumber(content: string, matchIndex: number): number {
  let count = 1;
  for (let i = 0; i < matchIndex; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  return count;
}

/**
 * Classifies an export by its type based on name and file path.
 */
export function classifyExport(name: string, filePath: string): DeadCodeType {
  const lowerPath = filePath.toLowerCase();

  // Hooks: start with 'use' and are in hooks/ or have hook-like names
  if (/^use[A-Z]/.test(name) || lowerPath.includes('/hooks/')) {
    return 'HOOK';
  }

  // Components: PascalCase names in components/ or pages/
  if (lowerPath.includes('/components/') || lowerPath.includes('/pages/')) {
    return 'COMPONENT';
  }

  // Services: in services/ or stores/ directory
  if (lowerPath.includes('/services/') || lowerPath.includes('/stores/')) {
    return 'SERVICE';
  }

  // Contexts: in contexts/ directory
  if (lowerPath.includes('/contexts/')) {
    return 'COMPONENT';
  }

  // Everything else is a utility
  return 'UTIL';
}

/**
 * Resolves an import specifier to a relative file path (without extension).
 * Handles @/ alias and relative paths.
 */
export function resolveImportPath(importSource: string, importerPath: string): string | null {
  // Handle @/ alias -> src/
  if (importSource.startsWith('@/')) {
    return 'src/' + importSource.slice(2);
  }

  // Handle relative imports
  if (importSource.startsWith('./') || importSource.startsWith('../')) {
    const importerDir = path.dirname(importerPath);
    const resolved = path.normalize(path.join(importerDir, importSource));
    // Normalize to forward slashes
    return resolved.replace(/\\/g, '/');
  }

  // External package imports - not relevant for our graph
  return null;
}

/**
 * Strips file extension for path matching.
 */
function stripExtension(filePath: string): string {
  return filePath.replace(/\.(tsx?|jsx?|js|ts)$/, '');
}

// =============================================================================
// Export Extraction
// =============================================================================

/**
 * Extracts all exports from a file's content.
 */
export function extractExports(filePath: string, content: string): ExportEntry[] {
  const exports: ExportEntry[] = [];
  const seenNames = new Set<string>();

  const addExport = (name: string, lineNumber: number, isDefault: boolean) => {
    const key = `${name}:${isDefault}`;
    if (seenNames.has(key)) return;
    seenNames.add(key);
    exports.push({
      filePath,
      name,
      lineNumber,
      isDefault,
      type: classifyExport(name, filePath),
    });
  };

  let match: RegExpExecArray | null;

  // Pattern 1: export function Name
  const exportFunctionRe = /export\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportFunctionRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), false);
  }

  // Pattern 2: export const/let/var Name
  const exportVarRe = /export\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportVarRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), false);
  }

  // Pattern 3: export class Name
  const exportClassRe = /export\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportClassRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), false);
  }

  // Pattern 4: export interface Name / export type Name
  const exportTypeRe = /export\s+(?:interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportTypeRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), false);
  }

  // Pattern 5: export enum Name
  const exportEnumRe = /export\s+enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportEnumRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), false);
  }

  // Pattern 6: export default function Name
  const exportDefaultFuncRe = /export\s+default\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportDefaultFuncRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), true);
  }

  // Pattern 7: export default class Name
  const exportDefaultClassRe = /export\s+default\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = exportDefaultClassRe.exec(content)) !== null) {
    addExport(match[1], getLineNumber(content, match.index), true);
  }

  // Pattern 8: export default Name (identifier reference)
  const exportDefaultRefRe = /export\s+default\s+([A-Z][A-Za-z0-9_$]*)\s*[;\n]/gm;
  while ((match = exportDefaultRefRe.exec(content)) !== null) {
    const fullMatch = match[0];
    if (!fullMatch.includes('function') && !fullMatch.includes('class')) {
      addExport(match[1], getLineNumber(content, match.index), true);
    }
  }

  // Pattern 9: export { Name1, Name2, ... }
  const exportBracketRe = /export\s*\{([^}]+)\}/g;
  while ((match = exportBracketRe.exec(content)) !== null) {
    const exportList = match[1];
    // Skip re-exports (export { ... } from '...')
    const afterBrace = content.substring(match.index + match[0].length, match.index + match[0].length + 20);
    if (afterBrace.trimStart().startsWith('from')) continue;

    const names = exportList.split(',');
    for (const nameStr of names) {
      const trimmed = nameStr.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+as\s+/);
      const name = parts[0].trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && name !== 'default') {
        addExport(name, getLineNumber(content, match.index), false);
      }
    }
  }

  return exports;
}

// =============================================================================
// Import Extraction
// =============================================================================

/**
 * Extracts all imports from a file's content.
 */
export function extractImports(filePath: string, content: string): ImportEntry[] {
  const imports: ImportEntry[] = [];

  let match: RegExpExecArray | null;

  // Pattern 1: import { Name1, Name2 } from 'source'
  const namedImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = namedImportRe.exec(content)) !== null) {
    const importList = match[1];
    const importSource = match[2];
    const importedNames = importList
      .split(',')
      .map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[0].trim();
      })
      .filter(n => n.length > 0 && /^[A-Za-z_$]/.test(n));

    imports.push({
      importerPath: filePath,
      importSource,
      importedNames,
      hasDefaultImport: false,
      lineNumber: getLineNumber(content, match.index),
    });
  }

  // Pattern 2: import DefaultName from 'source'
  const defaultImportRe = /import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = defaultImportRe.exec(content)) !== null) {
    const defaultName = match[1];
    const importSource = match[2];
    // Skip "import type" which is handled separately
    const beforeMatch = content.substring(Math.max(0, match.index - 10), match.index);
    if (beforeMatch.includes('type')) continue;

    imports.push({
      importerPath: filePath,
      importSource,
      importedNames: [],
      hasDefaultImport: true,
      defaultImportName: defaultName,
      lineNumber: getLineNumber(content, match.index),
    });
  }

  // Pattern 3: import DefaultName, { Name1, Name2 } from 'source'
  const mixedImportRe = /import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = mixedImportRe.exec(content)) !== null) {
    const defaultName = match[1];
    const importList = match[2];
    const importSource = match[3];
    const importedNames = importList
      .split(',')
      .map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[0].trim();
      })
      .filter(n => n.length > 0 && /^[A-Za-z_$]/.test(n));

    imports.push({
      importerPath: filePath,
      importSource,
      importedNames,
      hasDefaultImport: true,
      defaultImportName: defaultName,
      lineNumber: getLineNumber(content, match.index),
    });
  }

  // Pattern 4: import type { Name1, Name2 } from 'source'
  const typeImportRe = /import\s+type\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = typeImportRe.exec(content)) !== null) {
    const importList = match[1];
    const importSource = match[2];
    const importedNames = importList
      .split(',')
      .map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[0].trim();
      })
      .filter(n => n.length > 0 && /^[A-Za-z_$]/.test(n));

    imports.push({
      importerPath: filePath,
      importSource,
      importedNames,
      hasDefaultImport: false,
      lineNumber: getLineNumber(content, match.index),
    });
  }

  // Pattern 5: Re-exports - export { Name } from 'source'
  const reExportRe = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = reExportRe.exec(content)) !== null) {
    const importList = match[1];
    const importSource = match[2];
    const importedNames = importList
      .split(',')
      .map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[0].trim();
      })
      .filter(n => n.length > 0 && /^[A-Za-z_$]/.test(n));

    imports.push({
      importerPath: filePath,
      importSource,
      importedNames,
      hasDefaultImport: false,
      lineNumber: getLineNumber(content, match.index),
    });
  }

  // Pattern 6: export * from 'source' (wildcard re-export)
  const wildcardReExportRe = /export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = wildcardReExportRe.exec(content)) !== null) {
    imports.push({
      importerPath: filePath,
      importSource: match[1],
      importedNames: ['*'],
      hasDefaultImport: false,
      lineNumber: getLineNumber(content, match.index),
    });
  }

  return imports;
}

// =============================================================================
// Import Graph Building (Optimized with lookup maps)
// =============================================================================

/**
 * Pre-resolved import data for fast lookup.
 * Maps a resolved file path (without extension) to the set of named imports
 * and whether a default import or wildcard exists.
 */
interface ResolvedImportTarget {
  namedImports: Set<string>;
  hasDefaultImport: boolean;
  hasWildcard: boolean;
}

/**
 * Builds a lookup map from resolved file paths to their imported names.
 * This avoids O(exports × imports) path resolution during the matching phase.
 */
function buildImportLookup(allImports: ImportEntry[]): Map<string, ResolvedImportTarget> {
  const lookup = new Map<string, ResolvedImportTarget>();

  const getOrCreate = (key: string): ResolvedImportTarget => {
    let entry = lookup.get(key);
    if (!entry) {
      entry = { namedImports: new Set(), hasDefaultImport: false, hasWildcard: false };
      lookup.set(key, entry);
    }
    return entry;
  };

  for (const imp of allImports) {
    const resolved = resolveImportPath(imp.importSource, imp.importerPath);
    if (!resolved) continue;

    const resolvedStripped = stripExtension(resolved);

    // Add to the direct path key
    const target = getOrCreate(resolvedStripped);

    if (imp.importedNames.includes('*')) {
      target.hasWildcard = true;
    }

    if (imp.hasDefaultImport) {
      target.hasDefaultImport = true;
    }

    for (const name of imp.importedNames) {
      if (name !== '*') {
        target.namedImports.add(name);
      }
    }
  }

  return lookup;
}

/**
 * Checks if an import source resolves to a given export file path.
 * Handles @/ alias, relative paths, and index file resolution.
 * Exported for testing.
 */
export function doesImportMatchExport(
  importSource: string,
  importerPath: string,
  exportFilePath: string
): boolean {
  const resolved = resolveImportPath(importSource, importerPath);
  if (!resolved) return false;

  const resolvedStripped = stripExtension(resolved);
  const exportStripped = stripExtension(exportFilePath);

  if (resolvedStripped === exportStripped) return true;
  if (resolvedStripped + '/index' === exportStripped) return true;
  if (exportStripped + '/index' === resolvedStripped) return true;

  return false;
}

/**
 * Determines if an export is used, using the pre-built lookup map.
 */
function isExportUsedFast(
  exportEntry: ExportEntry,
  importLookup: Map<string, ResolvedImportTarget>
): boolean {
  const exportStripped = stripExtension(exportEntry.filePath);

  // Check direct path match and index file variants
  const keysToCheck = [
    exportStripped,
    exportStripped + '/index',
  ];

  // Also check if the export is in an index file and someone imports the directory
  if (exportStripped.endsWith('/index')) {
    keysToCheck.push(exportStripped.slice(0, -6)); // remove '/index'
  }

  for (const key of keysToCheck) {
    const target = importLookup.get(key);
    if (!target) continue;

    // Wildcard re-export means everything is used
    if (target.hasWildcard) return true;

    // Check named imports
    if (!exportEntry.isDefault && target.namedImports.has(exportEntry.name)) {
      return true;
    }

    // Check default imports
    if (exportEntry.isDefault && target.hasDefaultImport) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Collects all source files from a set of directories, deduplicating.
 */
function collectFiles(dirs: string[], projectRoot: string): string[] {
  const seen = new Set<string>();
  const files: string[] = [];

  for (const scanDir of dirs) {
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

/**
 * Reads a file and extracts exports.
 */
function extractExportsFromFile(filePath: string, projectRoot: string): ExportEntry[] {
  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return extractExports(filePath, content);
  } catch {
    return [];
  }
}

/**
 * Reads a file and extracts imports.
 */
function extractImportsFromFile(filePath: string, projectRoot: string): ImportEntry[] {
  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return extractImports(filePath, content);
  } catch {
    return [];
  }
}

/**
 * Scans the codebase for all exports in the specified directories.
 */
export function scanExports(projectRoot: string = process.cwd()): ExportEntry[] {
  const files = collectFiles(EXPORT_SCAN_DIRECTORIES, projectRoot);
  const allExports: ExportEntry[] = [];

  for (const filePath of files) {
    allExports.push(...extractExportsFromFile(filePath, projectRoot));
  }

  return allExports;
}

/**
 * Scans the codebase for all imports across all source files.
 */
export function scanImports(projectRoot: string = process.cwd()): ImportEntry[] {
  const files = collectFiles(IMPORT_SCAN_DIRECTORIES, projectRoot);
  const allImports: ImportEntry[] = [];

  for (const filePath of files) {
    allImports.push(...extractImportsFromFile(filePath, projectRoot));
  }

  // Also scan entry point files
  for (const entryFile of ENTRY_POINT_FILES) {
    const fullPath = path.join(projectRoot, entryFile);
    if (fs.existsSync(fullPath)) {
      allImports.push(...extractImportsFromFile(entryFile, projectRoot));
    }
  }

  return allImports;
}

/**
 * Finds all unused exports in the codebase.
 * Builds an import graph and identifies exports with no importers.
 */
export function findUnusedExports(projectRoot: string = process.cwd()): DeadCodeItem[] {
  const allExports = scanExports(projectRoot);
  const allImports = scanImports(projectRoot);
  const importLookup = buildImportLookup(allImports);

  const unusedItems: DeadCodeItem[] = [];

  for (const exp of allExports) {
    if (!isExportUsedFast(exp, importLookup)) {
      unusedItems.push({
        type: exp.type,
        filePath: exp.filePath,
        name: exp.name,
        evidence: `Export '${exp.name}' in ${exp.filePath}:${exp.lineNumber} is not imported by any file in the codebase`,
        safeToRemove: true,
        dependencies: [],
      });
    }
  }

  return unusedItems;
}

/**
 * Runs the full unused export scan and returns structured results.
 */
export function scanUnusedExports(projectRoot: string = process.cwd()): UnusedExportScanResult {
  const errors: { filePath: string; error: string }[] = [];

  // Collect all files (deduplicated) for counting
  const allDirs = [...new Set([...EXPORT_SCAN_DIRECTORIES, ...IMPORT_SCAN_DIRECTORIES])];
  const allFiles = collectFiles(allDirs, projectRoot);
  const scannedFileSet = new Set(allFiles);
  for (const entryFile of ENTRY_POINT_FILES) {
    if (fs.existsSync(path.join(projectRoot, entryFile))) {
      scannedFileSet.add(entryFile);
    }
  }

  // Scan exports and imports once
  const allExports = scanExports(projectRoot);
  const allImports = scanImports(projectRoot);

  // Build optimized lookup and find unused
  const importLookup = buildImportLookup(allImports);
  const unusedExports: DeadCodeItem[] = [];

  for (const exp of allExports) {
    if (!isExportUsedFast(exp, importLookup)) {
      unusedExports.push({
        type: exp.type,
        filePath: exp.filePath,
        name: exp.name,
        evidence: `Export '${exp.name}' in ${exp.filePath}:${exp.lineNumber} is not imported by any file in the codebase`,
        safeToRemove: true,
        dependencies: [],
      });
    }
  }

  return {
    allExports,
    allImports,
    unusedExports,
    filesScanned: scannedFileSet.size,
    errors,
  };
}

/**
 * Filters unused exports to only return unused components.
 */
export function findUnusedComponents(projectRoot: string = process.cwd()): DeadCodeItem[] {
  return findUnusedExports(projectRoot).filter(item => item.type === 'COMPONENT');
}

/**
 * Filters unused exports to only return unused hooks.
 */
export function findUnusedHooks(projectRoot: string = process.cwd()): DeadCodeItem[] {
  return findUnusedExports(projectRoot).filter(item => item.type === 'HOOK');
}

/**
 * Filters unused exports to only return unused services.
 */
export function findUnusedServices(projectRoot: string = process.cwd()): DeadCodeItem[] {
  return findUnusedExports(projectRoot).filter(item => item.type === 'SERVICE');
}

/**
 * Filters unused exports to only return unused utilities.
 */
export function findUnusedUtils(projectRoot: string = process.cwd()): DeadCodeItem[] {
  return findUnusedExports(projectRoot).filter(item => item.type === 'UTIL');
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the unused export scanner and prints results to console.
 */
export function runUnusedExportScannerCLI(): void {
  console.log('Unused Export Scanner Results');
  console.log('============================\n');

  const result = scanUnusedExports();

  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Total exports found: ${result.allExports.length}`);
  console.log(`Total imports found: ${result.allImports.length}`);
  console.log(`Unused exports found: ${result.unusedExports.length}`);
  console.log('');

  // Group by type
  const byType: Record<string, DeadCodeItem[]> = {};
  for (const item of result.unusedExports) {
    if (!byType[item.type]) {
      byType[item.type] = [];
    }
    byType[item.type].push(item);
  }

  console.log('Unused Exports by Type:');
  for (const [type, items] of Object.entries(byType)) {
    console.log(`\n  ${type} (${items.length}):`);
    for (const item of items) {
      console.log(`    - ${item.name}`);
      console.log(`      File: ${item.filePath}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errors) {
      console.log(`  - ${error.filePath}: ${error.error}`);
    }
  }
}

// Check if running as main module
const isMainModule = (): boolean => {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;

  const normalizedScript = scriptPath.replace(/\\/g, '/');
  const normalizedMeta = import.meta.url.replace(/\\/g, '/').replace('file:///', '').replace('file://', '');

  return normalizedScript.includes('unusedExportScanner') || normalizedMeta.includes(normalizedScript);
};

if (isMainModule()) {
  runUnusedExportScannerCLI();
}
