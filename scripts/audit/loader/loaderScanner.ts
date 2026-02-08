/**
 * Loader Scanner for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans src/ directory for all loader/spinner/skeleton/progress components
 * and identifies both definitions and usages across the codebase.
 * 
 * @requirements 3.1 - WHEN the Audit_System scans the codebase THEN it SHALL
 *                     identify all loader/spinner/skeleton implementations
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoaderInstance, LoaderType } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * A loader component definition (export) found in the codebase.
 */
export interface LoaderDefinition {
  /** Path to the file containing the loader definition */
  filePath: string;
  /** Line number where the component is defined */
  lineNumber: number;
  /** Name of the loader component */
  componentName: string;
  /** Type of loader */
  type: LoaderType;
  /** Whether this is a default export */
  isDefaultExport: boolean;
  /** Whether this loader is deprecated */
  isDeprecated: boolean;
  /** Deprecation message if applicable */
  deprecationMessage?: string;
}

/**
 * A loader component usage (import/JSX) found in the codebase.
 */
export interface LoaderUsage {
  /** Path to the file where the loader is used */
  filePath: string;
  /** Line number where the loader is used */
  lineNumber: number;
  /** Name of the loader component being used */
  componentName: string;
  /** Type of usage: import statement or JSX element */
  usageType: 'import' | 'jsx';
  /** Source file the loader is imported from (if import) */
  importSource?: string;
}

/**
 * Result of scanning for loaders.
 */
export interface LoaderScanResult {
  /** All loader instances found (definitions + usages combined) */
  loaders: LoaderInstance[];
  /** Total number of loader instances */
  totalLoaders: number;
  /** Loader definitions found */
  definitions: LoaderDefinition[];
  /** Loader usages found */
  usages: LoaderUsage[];
  /** Any errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Patterns to identify loader components by name.
 * These are case-insensitive patterns that match component names.
 */
const LOADER_NAME_PATTERNS = [
  /spinner/i,
  /skeleton/i,
  /loading/i,
  /progress/i,
  /loader/i,
  /preloader/i,
];

/**
 * Specific component names known to be loaders.
 */
const KNOWN_LOADER_COMPONENTS = new Set([
  'LoadingSpinner',
  'LoadingOverlay',
  'LoadingFallback',
  'LoadingState',
  'LoadingButton',
  'InlineLoader',
  'DataTableLoader',
  'FormSubmissionLoader',
  'PageContentLoader',
  'Skeleton',
  'SkeletonLoader',
  'SkeletonCard',
  'SkeletonTable',
  'SkeletonAvatar',
  'SkeletonText',
  'SkeletonDashboard',
  'SkeletonForm',
  'TableSkeleton',
  'CardSkeleton',
  'Progress',
  'ProgressIndicator',
  'EnhancedLoadingSpinner',
  'FullScreenLoader',
  'FancyPreloader',
  'PageLoadingFallback',
  'AuthLoadingOverlay',
]);

/**
 * Files/directories to exclude from scanning.
 */
const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determines the loader type based on component name.
 */
function determineLoaderType(componentName: string): LoaderType {
  const lowerName = componentName.toLowerCase();
  
  if (lowerName.includes('skeleton')) {
    return 'skeleton';
  }
  if (lowerName.includes('progress')) {
    return 'progress';
  }
  if (lowerName.includes('overlay') || lowerName.includes('fullscreen')) {
    return 'overlay';
  }
  if (lowerName.includes('inline') || lowerName.includes('button')) {
    return 'inline';
  }
  // Default to spinner for generic loading/spinner components
  return 'spinner';
}

/**
 * Determines if a loader is global (app-level) based on file path and name.
 */
function isGlobalLoader(filePath: string, componentName: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const lowerName = componentName.toLowerCase();
  
  // Global loaders are typically:
  // 1. In the root components/ui directory
  // 2. Named with "Fallback", "Overlay", "FullScreen", "Page" prefix
  // 3. Used at app/layout level
  
  const isInUiRoot = lowerPath.includes('components/ui/') && 
                     !lowerPath.includes('components/ui/skeletons/');
  
  const hasGlobalName = lowerName.includes('fallback') ||
                        lowerName.includes('overlay') ||
                        lowerName.includes('fullscreen') ||
                        lowerName.includes('pageloading') ||
                        lowerName.includes('authloading');
  
  return isInUiRoot && hasGlobalName;
}

/**
 * Checks if a component name matches loader patterns.
 */
function isLoaderComponent(componentName: string): boolean {
  // Check known components first
  if (KNOWN_LOADER_COMPONENTS.has(componentName)) {
    return true;
  }
  
  // Check against patterns
  return LOADER_NAME_PATTERNS.some(pattern => pattern.test(componentName));
}

/**
 * Recursively finds all .tsx and .ts files in a directory.
 */
function findSourceFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    // Skip excluded paths
    if (EXCLUDED_PATHS.includes(entry.name)) {
      continue;
    }
    
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findSourceFiles(fullPath, baseDir));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      // Skip test files and type definition files
      if (!entry.name.includes('.test.') && !entry.name.endsWith('.d.ts')) {
        const relativePath = path.relative(baseDir, fullPath);
        files.push(relativePath);
      }
    }
  }
  
  return files;
}

/**
 * Extracts the line number for a match in content.
 */
function getLineNumber(content: string, matchIndex: number): number {
  const beforeMatch = content.substring(0, matchIndex);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

/**
 * Checks if a file contains deprecation markers.
 */
function extractDeprecationInfo(content: string): { isDeprecated: boolean; message?: string } {
  const deprecatedMatch = content.match(/@deprecated\s+([^\n*]+)/);
  if (deprecatedMatch) {
    return {
      isDeprecated: true,
      message: deprecatedMatch[1].trim()
    };
  }
  return { isDeprecated: false };
}

// =============================================================================
// Scanner Functions
// =============================================================================

/**
 * Finds loader component definitions (exports) in a file.
 */
function findDefinitionsInFile(filePath: string, content: string): LoaderDefinition[] {
  const definitions: LoaderDefinition[] = [];
  const deprecationInfo = extractDeprecationInfo(content);
  
  // Pattern 1: export function ComponentName
  const exportFunctionPattern = /export\s+function\s+([A-Z][a-zA-Z0-9]*)/g;
  let match: RegExpExecArray | null;
  while ((match = exportFunctionPattern.exec(content)) !== null) {
    const componentName = match[1];
    if (isLoaderComponent(componentName)) {
      definitions.push({
        filePath,
        lineNumber: getLineNumber(content, match.index),
        componentName,
        type: determineLoaderType(componentName),
        isDefaultExport: false,
        isDeprecated: deprecationInfo.isDeprecated,
        deprecationMessage: deprecationInfo.message
      });
    }
  }
  
  // Pattern 2: export const ComponentName
  const exportConstPattern = /export\s+const\s+([A-Z][a-zA-Z0-9]*)/g;
  while ((match = exportConstPattern.exec(content)) !== null) {
    const componentName = match[1];
    if (isLoaderComponent(componentName)) {
      definitions.push({
        filePath,
        lineNumber: getLineNumber(content, match.index),
        componentName,
        type: determineLoaderType(componentName),
        isDefaultExport: false,
        isDeprecated: deprecationInfo.isDeprecated,
        deprecationMessage: deprecationInfo.message
      });
    }
  }
  
  // Pattern 3: export default function ComponentName
  const defaultFunctionPattern = /export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)/g;
  while ((match = defaultFunctionPattern.exec(content)) !== null) {
    const componentName = match[1];
    if (isLoaderComponent(componentName)) {
      definitions.push({
        filePath,
        lineNumber: getLineNumber(content, match.index),
        componentName,
        type: determineLoaderType(componentName),
        isDefaultExport: true,
        isDeprecated: deprecationInfo.isDeprecated,
        deprecationMessage: deprecationInfo.message
      });
    }
  }
  
  // Pattern 4: const ComponentName = ... followed by export { ComponentName }
  // or export default ComponentName
  const constDeclarationPattern = /const\s+([A-Z][a-zA-Z0-9]*)\s*=/g;
  while ((match = constDeclarationPattern.exec(content)) !== null) {
    const componentName = match[1];
    if (isLoaderComponent(componentName)) {
      // Check if it's exported
      const exportCheck = new RegExp(`export\\s*\\{[^}]*\\b${componentName}\\b[^}]*\\}`);
      const defaultExportCheck = new RegExp(`export\\s+default\\s+${componentName}\\b`);
      
      if (exportCheck.test(content) || defaultExportCheck.test(content)) {
        // Avoid duplicates from other patterns
        const alreadyFound = definitions.some(d => 
          d.componentName === componentName && d.filePath === filePath
        );
        if (!alreadyFound) {
          definitions.push({
            filePath,
            lineNumber: getLineNumber(content, match.index),
            componentName,
            type: determineLoaderType(componentName),
            isDefaultExport: defaultExportCheck.test(content),
            isDeprecated: deprecationInfo.isDeprecated,
            deprecationMessage: deprecationInfo.message
          });
        }
      }
    }
  }
  
  // Pattern 5: React.forwardRef with displayName
  const forwardRefPattern = /const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*React\.forwardRef/g;
  while ((match = forwardRefPattern.exec(content)) !== null) {
    const componentName = match[1];
    if (isLoaderComponent(componentName)) {
      const alreadyFound = definitions.some(d => 
        d.componentName === componentName && d.filePath === filePath
      );
      if (!alreadyFound) {
        definitions.push({
          filePath,
          lineNumber: getLineNumber(content, match.index),
          componentName,
          type: determineLoaderType(componentName),
          isDefaultExport: false,
          isDeprecated: deprecationInfo.isDeprecated,
          deprecationMessage: deprecationInfo.message
        });
      }
    }
  }
  
  return definitions;
}

/**
 * Finds loader component usages (imports and JSX) in a file.
 */
function findUsagesInFile(filePath: string, content: string): LoaderUsage[] {
  const usages: LoaderUsage[] = [];
  
  // Pattern 1: Named imports - import { ComponentName } from '...'
  const namedImportPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = namedImportPattern.exec(content)) !== null) {
    const importList = match[1];
    const importSource = match[2];
    
    // Split by comma and extract component names
    const components = importList.split(',').map((s: string) => {
      // Handle "Name as Alias" pattern
      const parts = s.trim().split(/\s+as\s+/);
      return parts[0].trim();
    });
    
    for (const componentName of components) {
      if (isLoaderComponent(componentName)) {
        usages.push({
          filePath,
          lineNumber: getLineNumber(content, match.index),
          componentName,
          usageType: 'import',
          importSource
        });
      }
    }
  }
  
  // Pattern 2: Default imports - import ComponentName from '...'
  const defaultImportPattern = /import\s+([A-Z][a-zA-Z0-9]*)\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = defaultImportPattern.exec(content)) !== null) {
    const componentName = match[1];
    const importSource = match[2];
    
    if (isLoaderComponent(componentName)) {
      usages.push({
        filePath,
        lineNumber: getLineNumber(content, match.index),
        componentName,
        usageType: 'import',
        importSource
      });
    }
  }
  
  // Pattern 3: JSX usage - <ComponentName ... /> or <ComponentName>...</ComponentName>
  const jsxPattern = /<([A-Z][a-zA-Z0-9]*)\s*(?:[^>]*?)(?:\/>|>)/g;
  while ((match = jsxPattern.exec(content)) !== null) {
    const componentName = match[1];
    
    if (isLoaderComponent(componentName)) {
      // Avoid counting the same component multiple times on the same line
      const lineNumber = getLineNumber(content, match.index);
      const alreadyFound = usages.some(u => 
        u.componentName === componentName && 
        u.filePath === filePath && 
        u.lineNumber === lineNumber &&
        u.usageType === 'jsx'
      );
      
      if (!alreadyFound) {
        usages.push({
          filePath,
          lineNumber,
          componentName,
          usageType: 'jsx'
        });
      }
    }
  }
  
  return usages;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Finds all loader component definitions in the codebase.
 * 
 * @param baseDir - Base directory to scan (defaults to src/)
 * @returns Array of loader definitions
 */
export function findLoaderDefinitions(baseDir: string = 'src'): LoaderDefinition[] {
  const projectRoot = process.cwd();
  const scanDir = path.join(projectRoot, baseDir);
  const definitions: LoaderDefinition[] = [];
  
  const files = findSourceFiles(scanDir, projectRoot);
  
  for (const filePath of files) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const fileDefinitions = findDefinitionsInFile(filePath, content);
      definitions.push(...fileDefinitions);
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return definitions;
}

/**
 * Finds all loader component usages in the codebase.
 * 
 * @param baseDir - Base directory to scan (defaults to src/)
 * @returns Array of loader usages
 */
export function findLoaderUsages(baseDir: string = 'src'): LoaderUsage[] {
  const projectRoot = process.cwd();
  const scanDir = path.join(projectRoot, baseDir);
  const usages: LoaderUsage[] = [];
  
  const files = findSourceFiles(scanDir, projectRoot);
  
  for (const filePath of files) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const fileUsages = findUsagesInFile(filePath, content);
      usages.push(...fileUsages);
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return usages;
}

/**
 * Scans the codebase for all loader implementations.
 * Combines definitions and usages into LoaderInstance format.
 * 
 * @param baseDir - Base directory to scan (defaults to src/)
 * @returns LoaderScanResult containing all loader instances
 */
export function scanLoaders(baseDir: string = 'src'): LoaderScanResult {
  const projectRoot = process.cwd();
  const scanDir = path.join(projectRoot, baseDir);
  const errors: { filePath: string; error: string }[] = [];
  const definitions: LoaderDefinition[] = [];
  const usages: LoaderUsage[] = [];
  const loaderInstanceMap = new Map<string, LoaderInstance>();
  
  const files = findSourceFiles(scanDir, projectRoot);
  
  for (const filePath of files) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Find definitions
      const fileDefinitions = findDefinitionsInFile(filePath, content);
      definitions.push(...fileDefinitions);
      
      // Find usages
      const fileUsages = findUsagesInFile(filePath, content);
      usages.push(...fileUsages);
    } catch (error) {
      errors.push({
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  // Convert definitions to LoaderInstance format
  for (const def of definitions) {
    const key = `${def.filePath}:${def.lineNumber}:${def.componentName}`;
    if (!loaderInstanceMap.has(key)) {
      loaderInstanceMap.set(key, {
        filePath: def.filePath,
        lineNumber: def.lineNumber,
        componentName: def.componentName,
        type: def.type,
        isGlobal: isGlobalLoader(def.filePath, def.componentName)
      });
    }
  }
  
  // Convert unique usages to LoaderInstance format (JSX usages only, not imports)
  for (const usage of usages) {
    if (usage.usageType === 'jsx') {
      const key = `${usage.filePath}:${usage.lineNumber}:${usage.componentName}`;
      if (!loaderInstanceMap.has(key)) {
        loaderInstanceMap.set(key, {
          filePath: usage.filePath,
          lineNumber: usage.lineNumber,
          componentName: usage.componentName,
          type: determineLoaderType(usage.componentName),
          isGlobal: isGlobalLoader(usage.filePath, usage.componentName)
        });
      }
    }
  }
  
  const loaders = Array.from(loaderInstanceMap.values());
  
  return {
    loaders,
    totalLoaders: loaders.length,
    definitions,
    usages,
    errors
  };
}

/**
 * Gets a summary of loader types found in the codebase.
 */
export function getLoaderTypeSummary(result: LoaderScanResult): Record<LoaderType, number> {
  const summary: Record<LoaderType, number> = {
    spinner: 0,
    skeleton: 0,
    progress: 0,
    overlay: 0,
    inline: 0
  };
  
  for (const loader of result.loaders) {
    summary[loader.type]++;
  }
  
  return summary;
}

/**
 * Gets unique loader component names from scan results.
 */
export function getUniqueLoaderNames(result: LoaderScanResult): string[] {
  const names = new Set<string>();
  
  for (const def of result.definitions) {
    names.add(def.componentName);
  }
  
  return Array.from(names).sort();
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the loader scanner and prints results to console.
 * Can be called directly or via CLI.
 */
export function runLoaderScannerCLI(): void {
  console.log('Loader Scanner Results');
  console.log('======================\n');
  
  const result = scanLoaders();
  
  console.log(`Total loader instances found: ${result.totalLoaders}`);
  console.log(`Definitions found: ${result.definitions.length}`);
  console.log(`Usages found: ${result.usages.length}`);
  console.log('');
  
  // Type summary
  const typeSummary = getLoaderTypeSummary(result);
  console.log('Loader Types:');
  for (const [type, count] of Object.entries(typeSummary)) {
    if (count > 0) {
      console.log(`  - ${type}: ${count}`);
    }
  }
  console.log('');
  
  // Unique component names
  const uniqueNames = getUniqueLoaderNames(result);
  console.log('Unique Loader Components:');
  for (const name of uniqueNames) {
    console.log(`  - ${name}`);
  }
  console.log('');
  
  // Definitions
  if (result.definitions.length > 0) {
    console.log('Loader Definitions:');
    for (const def of result.definitions) {
      const deprecated = def.isDeprecated ? ' [DEPRECATED]' : '';
      const global = isGlobalLoader(def.filePath, def.componentName) ? ' [GLOBAL]' : '';
      console.log(`  - ${def.componentName} (${def.type})${deprecated}${global}`);
      console.log(`    File: ${def.filePath}:${def.lineNumber}`);
    }
    console.log('');
  }
  
  // Global loaders
  const globalLoaders = result.loaders.filter(l => l.isGlobal);
  if (globalLoaders.length > 0) {
    console.log('Global Loaders:');
    for (const loader of globalLoaders) {
      console.log(`  - ${loader.componentName} (${loader.type})`);
      console.log(`    File: ${loader.filePath}:${loader.lineNumber}`);
    }
    console.log('');
  }
  
  // Errors
  if (result.errors.length > 0) {
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`  - ${error.filePath}: ${error.error}`);
    }
  }
}

// Check if running as main module (works on both Windows and Unix)
const isMainModule = (): boolean => {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;
  
  // Normalize paths for comparison (handle Windows backslashes)
  const normalizedScript = scriptPath.replace(/\\/g, '/');
  const normalizedMeta = import.meta.url.replace(/\\/g, '/').replace('file:///', '').replace('file://', '');
  
  return normalizedScript.includes('loaderScanner') || normalizedMeta.includes(normalizedScript);
};

if (isMainModule()) {
  runLoaderScannerCLI();
}
