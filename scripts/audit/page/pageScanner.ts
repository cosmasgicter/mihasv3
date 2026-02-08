/**
 * Page Scanner for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans src/pages/ directory for all page components and extracts
 * component names and file paths.
 * 
 * @requirements 2.1 - WHEN the Audit_System examines a page THEN it SHALL trace
 *                     and document the complete data load path
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Information about a page component discovered during scanning.
 */
export interface PageInfo {
  /** Relative path to the page file from project root */
  filePath: string;
  /** Name of the React component */
  componentName: string;
  /** Whether this is a default export */
  isDefaultExport: boolean;
  /** Named exports found in the file (if any) */
  namedExports: string[];
}

/**
 * Result of scanning the pages directory.
 */
export interface PageScanResult {
  /** All page components found */
  pages: PageInfo[];
  /** Total number of pages scanned */
  totalPages: number;
  /** Any errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

/**
 * Recursively finds all .tsx files in a directory.
 * 
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative path calculation
 * @returns Array of file paths relative to baseDir
 */
function findTsxFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      files.push(...findTsxFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      // Add .tsx files with relative path
      const relativePath = path.relative(baseDir, fullPath);
      files.push(relativePath);
    }
  }
  
  return files;
}

/**
 * Extracts the component name from a default export statement.
 * 
 * Handles patterns like:
 * - export default function ComponentName()
 * - export default ComponentName
 * - export default function ComponentName() {
 * - export default memo(ComponentName)
 * 
 * @param content - File content to parse
 * @returns Component name or null if not found
 */
function extractDefaultExportName(content: string): string | null {
  // Pattern 1: export default function ComponentName
  const functionPattern = /export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)/;
  const functionMatch = content.match(functionPattern);
  if (functionMatch) {
    return functionMatch[1];
  }
  
  // Pattern 2: export default ComponentName (direct reference)
  // Must be at end of file or followed by newline/semicolon
  const directPattern = /export\s+default\s+([A-Z][a-zA-Z0-9]*)\s*[;\n]?$/m;
  const directMatch = content.match(directPattern);
  if (directMatch) {
    return directMatch[1];
  }
  
  // Pattern 3: export default memo(ComponentName) or similar HOC wrappers
  const hocPattern = /export\s+default\s+(?:memo|forwardRef|React\.memo)\s*\(\s*([A-Z][a-zA-Z0-9]*)/;
  const hocMatch = content.match(hocPattern);
  if (hocMatch) {
    return hocMatch[1];
  }
  
  // Pattern 4: Look for function/const declaration followed by export default
  // e.g., function MyComponent() { ... } \n export default MyComponent
  const separateExportPattern = /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=|\()[\s\S]*?export\s+default\s+\1/;
  const separateMatch = content.match(separateExportPattern);
  if (separateMatch) {
    return separateMatch[1];
  }
  
  // Pattern 5: Arrow function with const
  // const ComponentName = () => { ... }
  // export default ComponentName
  const arrowPattern = /const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/;
  const arrowMatch = content.match(arrowPattern);
  if (arrowMatch) {
    // Verify it's exported as default
    const exportCheck = new RegExp(`export\\s+default\\s+${arrowMatch[1]}\\b`);
    if (exportCheck.test(content)) {
      return arrowMatch[1];
    }
  }
  
  return null;
}

/**
 * Extracts named exports from file content.
 * 
 * Handles patterns like:
 * - export function ComponentName
 * - export const ComponentName
 * - export { ComponentName }
 * 
 * @param content - File content to parse
 * @returns Array of named export names
 */
function extractNamedExports(content: string): string[] {
  const exports: string[] = [];
  
  // Pattern 1: export function ComponentName
  const functionPattern = /export\s+function\s+([A-Z][a-zA-Z0-9]*)/g;
  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  // Pattern 2: export const ComponentName
  const constPattern = /export\s+const\s+([A-Z][a-zA-Z0-9]*)/g;
  while ((match = constPattern.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  // Pattern 3: export { ComponentName } or export { ComponentName as Alias }
  const bracketPattern = /export\s*\{([^}]+)\}/g;
  while ((match = bracketPattern.exec(content)) !== null) {
    const exportList = match[1];
    // Split by comma and extract names
    const names = exportList.split(',').map(s => {
      // Handle "Name as Alias" pattern - take the original name
      const parts = s.trim().split(/\s+as\s+/);
      return parts[0].trim();
    }).filter(name => /^[A-Z][a-zA-Z0-9]*$/.test(name));
    exports.push(...names);
  }
  
  return [...new Set(exports)]; // Remove duplicates
}

/**
 * Derives a component name from the file path when extraction fails.
 * 
 * @param filePath - Path to the file
 * @returns Derived component name
 */
function deriveComponentNameFromPath(filePath: string): string {
  const fileName = path.basename(filePath, '.tsx');
  // Convert kebab-case or snake_case to PascalCase
  return fileName
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Parses a single page file to extract component information.
 * 
 * @param filePath - Relative path to the page file
 * @param projectRoot - Project root directory
 * @returns PageInfo or null if parsing fails
 */
function parsePageFile(filePath: string, projectRoot: string): PageInfo | null {
  const fullPath = path.join(projectRoot, filePath);
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Extract default export name
    const defaultExportName = extractDefaultExportName(content);
    
    // Extract named exports
    const namedExports = extractNamedExports(content);
    
    // Determine component name
    let componentName: string;
    let isDefaultExport = false;
    
    if (defaultExportName) {
      componentName = defaultExportName;
      isDefaultExport = true;
    } else if (namedExports.length > 0) {
      // Use first named export as primary component
      componentName = namedExports[0];
    } else {
      // Derive from file name as fallback
      componentName = deriveComponentNameFromPath(filePath);
    }
    
    return {
      filePath,
      componentName,
      isDefaultExport,
      namedExports
    };
  } catch (error) {
    // Return null to indicate parsing failure
    return null;
  }
}

/**
 * Scans the src/pages/ directory for all page components.
 * 
 * @param projectRoot - Root directory of the project (defaults to cwd)
 * @returns PageScanResult containing all discovered pages
 */
export function scanPages(projectRoot: string = process.cwd()): PageScanResult {
  const pagesDir = path.join(projectRoot, 'src', 'pages');
  const errors: { filePath: string; error: string }[] = [];
  const pages: PageInfo[] = [];
  
  // Find all .tsx files in src/pages/
  const tsxFiles = findTsxFiles(pagesDir, projectRoot);
  
  for (const filePath of tsxFiles) {
    try {
      const pageInfo = parsePageFile(filePath, projectRoot);
      
      if (pageInfo) {
        pages.push(pageInfo);
      } else {
        errors.push({
          filePath,
          error: 'Failed to parse page component'
        });
      }
    } catch (error) {
      errors.push({
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return {
    pages,
    totalPages: pages.length,
    errors
  };
}

/**
 * Gets a list of all page file paths without parsing.
 * Useful for quick enumeration.
 * 
 * @param projectRoot - Root directory of the project
 * @returns Array of page file paths
 */
export function getPageFilePaths(projectRoot: string = process.cwd()): string[] {
  const pagesDir = path.join(projectRoot, 'src', 'pages');
  return findTsxFiles(pagesDir, projectRoot);
}

/**
 * Checks if a file path represents a page component.
 * 
 * @param filePath - Path to check
 * @returns True if the path is within src/pages/
 */
export function isPageFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.includes('src/pages/') && normalizedPath.endsWith('.tsx');
}

// CLI execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = scanPages();
  console.log('Page Scanner Results:');
  console.log('=====================');
  console.log(`Total pages found: ${result.totalPages}`);
  console.log('');
  
  if (result.pages.length > 0) {
    console.log('Pages:');
    for (const page of result.pages) {
      console.log(`  - ${page.componentName} (${page.filePath})`);
      if (page.namedExports.length > 0) {
        console.log(`    Named exports: ${page.namedExports.join(', ')}`);
      }
    }
  }
  
  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`  - ${error.filePath}: ${error.error}`);
    }
  }
}
