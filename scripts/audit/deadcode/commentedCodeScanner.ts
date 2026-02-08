/**
 * Commented Code Scanner for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans the codebase for large blocks of commented-out code (3+ consecutive
 * commented lines). Distinguishes between documentation comments (JSDoc) and
 * actual commented-out code. Flags blocks with file path, line numbers, and
 * the commented content as evidence.
 * 
 * @requirements 9.4 - WHEN the Audit_System scans the codebase THEN it SHALL identify commented-out logic
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DeadCodeItem } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * A block of consecutive commented lines found in a source file.
 */
export interface CommentedBlock {
  /** Relative file path from project root */
  filePath: string;
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** The raw commented lines */
  lines: string[];
  /** Whether this is a JSDoc/documentation comment */
  isDocComment: boolean;
  /** Number of lines in the block */
  lineCount: number;
}

/**
 * Result of scanning for commented code.
 */
export interface CommentedCodeScanResult {
  /** All commented blocks found (including doc comments) */
  allBlocks: CommentedBlock[];
  /** Only code comment blocks (excluding doc comments) */
  codeBlocks: CommentedBlock[];
  /** Dead code items for the report */
  deadCodeItems: DeadCodeItem[];
  /** Total files scanned */
  filesScanned: number;
  /** Errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum number of consecutive commented lines to flag as a block.
 */
const MIN_BLOCK_SIZE = 3;

/**
 * Directories to scan for commented code.
 */
const SCAN_DIRECTORIES = [
  'src',
  'api-src',
  'lib',
  'scripts/audit',
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
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(path.relative(projectRoot, fullPath));
      }
    }
  }

  return files;
}

// =============================================================================
// Comment Detection Logic
// =============================================================================

/**
 * Determines if a line is a single-line comment (// ...).
 */
export function isSingleLineComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//');
}

/**
 * Determines if a line is inside or starts a block comment.
 * Returns the state: 'start', 'middle', 'end', 'single', or 'none'.
 */
export function getBlockCommentState(
  line: string,
  inBlockComment: boolean
): { isComment: boolean; newState: boolean } {
  const trimmed = line.trim();

  if (inBlockComment) {
    // We're inside a block comment - check if it ends on this line
    if (trimmed.includes('*/')) {
      return { isComment: true, newState: false };
    }
    return { isComment: true, newState: true };
  }

  // Not in a block comment - check if one starts
  if (trimmed.startsWith('/*')) {
    if (trimmed.includes('*/')) {
      // Single-line block comment like /* ... */
      return { isComment: true, newState: false };
    }
    return { isComment: true, newState: true };
  }

  return { isComment: false, newState: false };
}

/**
 * Determines if a block of commented lines is a JSDoc or documentation comment
 * rather than commented-out code.
 * 
 * JSDoc patterns:
 * - Starts with /** 
 * - Lines contain @param, @returns, @example, @see, @deprecated, etc.
 * - Lines are primarily descriptive text (no code-like patterns)
 * 
 * Documentation comment patterns:
 * - Lines are primarily English prose
 * - No semicolons, braces, or assignment operators
 * - Contains common doc words like "TODO", "NOTE", "FIXME", "HACK"
 * - Section dividers (// ===... / // Title / // ===...)
 */
export function isDocumentationComment(lines: string[]): boolean {
  if (lines.length === 0) return false;

  const firstLine = lines[0].trim();

  // JSDoc block comments: /** ... */
  if (firstLine.startsWith('/**')) {
    return true;
  }

  // Check if the block is inside a JSDoc-style block comment
  // (lines starting with * which is typical JSDoc formatting)
  const jsdocLineCount = lines.filter(l => {
    const t = l.trim();
    return t.startsWith('*') || t.startsWith('/**') || t.startsWith('*/');
  }).length;
  if (jsdocLineCount > lines.length * 0.6) {
    return true;
  }

  // For single-line comments (// ...), check content
  const strippedLines = lines.map(l => {
    const t = l.trim();
    // Remove // prefix
    if (t.startsWith('//')) return t.slice(2).trim();
    // Remove /* */ and * prefixes
    if (t.startsWith('/*')) return t.slice(2).trim();
    if (t.startsWith('*/')) return '';
    if (t.startsWith('*')) return t.slice(1).trim();
    return t;
  });

  // Section dividers: blocks that are mostly separator lines (===, ---, ***)
  // and short title text. Common pattern:
  //   // ============================================
  //   // Section Title
  //   // ============================================
  if (isSectionDivider(strippedLines)) {
    return true;
  }

  // JSDoc tags indicate documentation
  const jsdocTags = ['@param', '@returns', '@return', '@example', '@see', '@deprecated',
    '@throws', '@type', '@typedef', '@property', '@template', '@since',
    '@version', '@author', '@license', '@module', '@namespace',
    '@requirements', '@description', '@summary', '@note'];
  const hasJsdocTags = strippedLines.some(l =>
    jsdocTags.some(tag => l.includes(tag))
  );
  if (hasJsdocTags) return true;

  // Common documentation markers
  const docMarkers = ['TODO', 'FIXME', 'HACK', 'NOTE', 'XXX', 'WARN', 'WARNING',
    'IMPORTANT', 'REVIEW', 'OPTIMIZE', 'REFACTOR'];
  const firstStripped = strippedLines[0] || '';
  const hasDocMarker = docMarkers.some(marker =>
    firstStripped.toUpperCase().startsWith(marker)
  );
  if (hasDocMarker && lines.length <= 5) return true;

  // Short explanatory comments (3-5 lines of prose without code patterns)
  if (lines.length <= 5) {
    const codeCount = countCodeIndicators(strippedLines);
    if (codeCount === 0) return true;
  }

  // Heuristic: check if lines look like code vs prose
  const codeIndicators = countCodeIndicators(strippedLines);
  const proseIndicators = countProseIndicators(strippedLines);

  // If more prose-like than code-like, it's documentation
  if (proseIndicators > codeIndicators && codeIndicators < lines.length * 0.3) {
    return true;
  }

  return false;
}

/**
 * Checks if a block of stripped comment lines is a section divider.
 * Section dividers are decorative separators like:
 *   ============================================
 *   Section Title
 *   ============================================
 */
export function isSectionDivider(strippedLines: string[]): boolean {
  if (strippedLines.length === 0) return false;

  // Count separator lines (lines that are mostly repeated chars like =, -, *)
  const separatorPattern = /^[=\-*~#_]{3,}\s*$/;
  const separatorCount = strippedLines.filter(l => separatorPattern.test(l)).length;

  // If majority of lines are separators, it's a divider
  if (separatorCount >= Math.ceil(strippedLines.length * 0.5)) {
    return true;
  }

  // Pattern: separator + title + separator (exactly 3 lines)
  if (strippedLines.length === 3 &&
      separatorPattern.test(strippedLines[0]) &&
      separatorPattern.test(strippedLines[2]) &&
      !separatorPattern.test(strippedLines[1])) {
    return true;
  }

  return false;
}

/**
 * Counts indicators that suggest lines contain code.
 */
export function countCodeIndicators(lines: string[]): number {
  let count = 0;
  for (const line of lines) {
    if (line.length === 0) continue;
    // Code patterns: assignments, function calls, imports, exports, braces, semicolons
    if (/[;{}]/.test(line)) count++;
    else if (/^\s*(const|let|var|function|class|import|export|return|if|else|for|while|switch|case|break|continue|throw|try|catch|finally|async|await)\b/.test(line)) count++;
    else if (/[=<>!]+/.test(line) && /[a-zA-Z]/.test(line)) count++;
    else if (/\.\w+\(/.test(line)) count++; // method calls
    else if (/\w+\(.*\)/.test(line) && !/^[A-Z][a-z]/.test(line.trim())) count++; // function calls (not sentences)
    else if (/^\s*(\/\/|#)/.test(line)) count++; // nested comments
    else if (/=>/.test(line)) count++; // arrow functions
  }
  return count;
}

/**
 * Counts indicators that suggest lines contain prose/documentation.
 */
export function countProseIndicators(lines: string[]): number {
  let count = 0;
  for (const line of lines) {
    if (line.length === 0) continue;
    // Prose patterns: starts with capital letter, ends with period, contains common words
    if (/^[A-Z][a-z]/.test(line.trim()) && !/{|}|;/.test(line)) count++;
    else if (/\.\s*$/.test(line)) count++;
    else if (/\b(the|is|are|was|were|has|have|this|that|these|those|will|should|must|can|may|might)\b/i.test(line)) count++;
    else if (line.split(' ').length >= 5 && !/[;{}=]/.test(line)) count++; // long text without code chars
  }
  return count;
}

// =============================================================================
// Block Extraction
// =============================================================================

/**
 * Extracts all commented blocks from file content.
 * A block is a sequence of consecutive commented lines.
 */
export function extractCommentedBlocks(filePath: string, content: string): CommentedBlock[] {
  const lines = content.split('\n');
  const blocks: CommentedBlock[] = [];
  let currentBlock: string[] = [];
  let blockStartLine = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-based

    // Check for block comments (/* ... */)
    const blockState = getBlockCommentState(line, inBlockComment);

    if (blockState.isComment) {
      if (currentBlock.length === 0) {
        blockStartLine = lineNumber;
      }
      currentBlock.push(line);
      inBlockComment = blockState.newState;
      continue;
    }

    // Check for single-line comments (//)
    if (isSingleLineComment(line)) {
      if (currentBlock.length === 0) {
        blockStartLine = lineNumber;
      }
      currentBlock.push(line);
      inBlockComment = false;
      continue;
    }

    // Non-comment line: flush current block if it meets minimum size
    if (currentBlock.length >= MIN_BLOCK_SIZE) {
      const isDoc = isDocumentationComment(currentBlock);
      blocks.push({
        filePath,
        startLine: blockStartLine,
        endLine: blockStartLine + currentBlock.length - 1,
        lines: [...currentBlock],
        isDocComment: isDoc,
        lineCount: currentBlock.length,
      });
    }

    currentBlock = [];
    inBlockComment = false;
  }

  // Flush any remaining block at end of file
  if (currentBlock.length >= MIN_BLOCK_SIZE) {
    const isDoc = isDocumentationComment(currentBlock);
    blocks.push({
      filePath,
      startLine: blockStartLine,
      endLine: blockStartLine + currentBlock.length - 1,
      lines: [...currentBlock],
      isDocComment: isDoc,
      lineCount: currentBlock.length,
    });
  }

  return blocks;
}

/**
 * Converts a CommentedBlock to a DeadCodeItem.
 */
function blockToDeadCodeItem(block: CommentedBlock): DeadCodeItem {
  const preview = block.lines
    .slice(0, 5)
    .map(l => l.trim())
    .join('\n');
  const truncated = block.lines.length > 5 ? `\n... (${block.lines.length - 5} more lines)` : '';

  return {
    type: 'COMMENTED_CODE',
    filePath: block.filePath,
    name: `Commented block at lines ${block.startLine}-${block.endLine}`,
    evidence: `${block.lineCount} lines of commented-out code at ${block.filePath}:${block.startLine}-${block.endLine}\n\n${preview}${truncated}`,
    safeToRemove: true,
    dependencies: [],
  };
}

// =============================================================================
// Public API
// =============================================================================

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

/**
 * Scans a single file for commented code blocks.
 */
export function scanFileForCommentedCode(filePath: string, projectRoot: string): CommentedBlock[] {
  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return extractCommentedBlocks(filePath, content);
  } catch {
    return [];
  }
}

/**
 * Scans the entire codebase for commented-out code blocks.
 * Returns only non-documentation comment blocks as DeadCodeItem[].
 */
export function scanCommentedCode(projectRoot: string = process.cwd()): DeadCodeItem[] {
  const files = collectFiles(projectRoot);
  const items: DeadCodeItem[] = [];

  for (const filePath of files) {
    const blocks = scanFileForCommentedCode(filePath, projectRoot);
    // Filter out documentation comments - only flag actual commented-out code
    const codeBlocks = blocks.filter(b => !b.isDocComment);
    for (const block of codeBlocks) {
      items.push(blockToDeadCodeItem(block));
    }
  }

  return items;
}

/**
 * Runs the full commented code scan and returns structured results.
 */
export function scanCommentedCodeFull(projectRoot: string = process.cwd()): CommentedCodeScanResult {
  const files = collectFiles(projectRoot);
  const errors: { filePath: string; error: string }[] = [];
  const allBlocks: CommentedBlock[] = [];

  for (const filePath of files) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const blocks = extractCommentedBlocks(filePath, content);
      allBlocks.push(...blocks);
    } catch (err) {
      errors.push({
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const codeBlocks = allBlocks.filter(b => !b.isDocComment);
  const deadCodeItems = codeBlocks.map(blockToDeadCodeItem);

  return {
    allBlocks,
    codeBlocks,
    deadCodeItems,
    filesScanned: files.length,
    errors,
  };
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the commented code scanner and prints results to console.
 */
export function runCommentedCodeScannerCLI(): void {
  console.log('Commented Code Scanner Results');
  console.log('==============================\n');

  const result = scanCommentedCodeFull();

  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Total comment blocks found: ${result.allBlocks.length}`);
  console.log(`Documentation comment blocks: ${result.allBlocks.length - result.codeBlocks.length}`);
  console.log(`Commented-out code blocks: ${result.codeBlocks.length}`);
  console.log('');

  if (result.codeBlocks.length === 0) {
    console.log('No commented-out code blocks found. Codebase is clean!');
    return;
  }

  // Group by file
  const byFile: Record<string, CommentedBlock[]> = {};
  for (const block of result.codeBlocks) {
    if (!byFile[block.filePath]) {
      byFile[block.filePath] = [];
    }
    byFile[block.filePath].push(block);
  }

  console.log('Commented-Out Code Blocks by File:');
  for (const [filePath, blocks] of Object.entries(byFile)) {
    console.log(`\n  ${filePath} (${blocks.length} block${blocks.length > 1 ? 's' : ''}):`);
    for (const block of blocks) {
      console.log(`    Lines ${block.startLine}-${block.endLine} (${block.lineCount} lines)`);
      // Show first 3 lines as preview
      const preview = block.lines.slice(0, 3);
      for (const line of preview) {
        console.log(`      ${line.trim()}`);
      }
      if (block.lines.length > 3) {
        console.log(`      ... (${block.lines.length - 3} more lines)`);
      }
    }
  }

  const totalLines = result.codeBlocks.reduce((sum, b) => sum + b.lineCount, 0);
  console.log(`\nTotal commented-out lines: ${totalLines}`);

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

  return normalizedScript.includes('commentedCodeScanner') || normalizedMeta.includes(normalizedScript);
};

if (isMainModule()) {
  runCommentedCodeScannerCLI();
}
