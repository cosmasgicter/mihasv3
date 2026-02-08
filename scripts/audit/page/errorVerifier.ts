/**
 * Error Handling Verifier for MIHAS Frontend-Backend Forensic Audit
 * 
 * Parses page files to find error handling patterns and verifies that
 * API calls have appropriate error handling mechanisms.
 * 
 * @requirements 2.3 - WHEN the Audit_System examines a page THEN it SHALL verify
 *                     error handling exists for all API calls
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ErrorHandlingResult } from '../types';

/**
 * Types of error handling mechanisms that can be detected.
 */
export type ErrorHandlingType = 'try-catch' | 'catch-method' | 'onError' | 'error-boundary';

/**
 * Information about a detected API call in the code.
 */
interface APICallLocation {
  /** Line number where the call is made */
  lineNumber: number;
  /** The API call code snippet */
  codeSnippet: string;
  /** Type of API call (fetch, axios, service, etc.) */
  callType: string;
  /** Whether this call has error handling */
  hasErrorHandling: boolean;
  /** Type of error handling if present */
  errorHandlingType?: ErrorHandlingType;
}

/**
 * Patterns for detecting API calls in page files.
 */
const API_CALL_PATTERNS = {
  /** fetch() calls */
  fetch: /\bfetch\s*\(\s*['"`][^'"`]*['"`]/g,
  
  /** axios calls */
  axios: /\baxios\s*\.\s*(?:get|post|put|delete|patch|request)\s*\(/g,
  
  /** Service method calls (e.g., applicationService.getApplications()) */
  serviceCall: /\b\w+Service\s*\.\s*\w+\s*\(/g,
  
  /** API client calls */
  apiClient: /\bapiClient\s*\.\s*(?:get|post|put|delete|patch)\s*\(/g,
  
  /** Direct /api/ path in fetch or similar */
  apiPath: /['"`]\/api\/[^'"`]+['"`]/g,
  
  /** React Query useQuery with queryFn */
  useQuery: /useQuery\s*\(\s*\{[^}]*queryFn/g,
  
  /** React Query useMutation with mutationFn */
  useMutation: /useMutation\s*\(\s*\{[^}]*mutationFn/g,
};

/**
 * Patterns for detecting error handling mechanisms.
 */
const ERROR_HANDLING_PATTERNS = {
  /** try-catch blocks */
  tryCatch: /\btry\s*\{/g,
  
  /** .catch() method on promises */
  catchMethod: /\.catch\s*\(/g,
  
  /** onError callback in React Query */
  onError: /\bonError\s*:/g,
  
  /** ErrorBoundary component usage */
  errorBoundary: /<ErrorBoundary[^>]*>|ErrorBoundary\s*\(/g,
  
  /** Error state handling (isError from React Query) */
  isError: /\bisError\b/g,
  
  /** error variable from React Query destructuring */
  errorDestructure: /\{\s*[^}]*\berror\b[^}]*\}\s*=\s*use(?:Query|Mutation|InfiniteQuery)/g,
  
  /** Conditional error rendering */
  errorConditional: /\bif\s*\(\s*error\s*\)|error\s*&&|error\s*\?/g,
  
  /** toast.error or similar error notifications */
  toastError: /toast\s*\.\s*error\s*\(|showError\s*\(|setError\s*\(/g,
};

/**
 * Gets line number from character index in content.
 */
function getLineNumber(content: string, index: number): number {
  const beforeMatch = content.substring(0, index);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

/**
 * Extracts a code snippet around a given index.
 */
function extractCodeSnippet(content: string, index: number, contextLines: number = 2): string {
  const lines = content.split('\n');
  const lineNumber = getLineNumber(content, index);
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length, lineNumber + contextLines);
  
  return lines.slice(startLine, endLine).join('\n').trim();
}

/**
 * Checks if a position in the code is within a try block.
 */
function isWithinTryBlock(content: string, position: number): boolean {
  // Look backwards from position to find if we're inside a try block
  const beforePosition = content.substring(0, position);
  
  // Count try { and } to determine nesting
  let tryDepth = 0;
  let braceDepth = 0;
  let inTry = false;
  
  // Simple state machine to track try blocks
  const tryMatches = [...beforePosition.matchAll(/\btry\s*\{/g)];
  const catchMatches = [...beforePosition.matchAll(/\}\s*catch\s*\(/g)];
  
  // Get all positions
  const events: { pos: number; type: 'try' | 'catch' }[] = [
    ...tryMatches.map(m => ({ pos: m.index!, type: 'try' as const })),
    ...catchMatches.map(m => ({ pos: m.index!, type: 'catch' as const })),
  ].sort((a, b) => a.pos - b.pos);
  
  // Track brace depth after each try
  for (const event of events) {
    if (event.type === 'try') {
      tryDepth++;
    } else if (event.type === 'catch') {
      tryDepth = Math.max(0, tryDepth - 1);
    }
  }
  
  return tryDepth > 0;
}

/**
 * Checks if a position in the code has a .catch() following it.
 */
function hasCatchMethod(content: string, position: number): boolean {
  // Look forward from position to find .catch()
  const afterPosition = content.substring(position);
  
  // Check if there's a .catch() within reasonable distance (same statement)
  // Look for .catch( before the next semicolon or closing brace
  const nextSemicolon = afterPosition.indexOf(';');
  const nextBrace = afterPosition.indexOf('}');
  const endOfStatement = Math.min(
    nextSemicolon === -1 ? Infinity : nextSemicolon,
    nextBrace === -1 ? Infinity : nextBrace
  );
  
  const statementPart = afterPosition.substring(0, endOfStatement);
  return /\.catch\s*\(/.test(statementPart);
}

/**
 * Checks if a position is within a React Query hook with onError.
 */
function hasOnErrorHandler(content: string, position: number): boolean {
  // Find the enclosing useQuery/useMutation block
  const beforePosition = content.substring(0, position);
  
  // Find the last useQuery or useMutation before this position
  const queryMatch = beforePosition.match(/use(?:Query|Mutation|InfiniteQuery)\s*\(\s*\{[^}]*$/);
  if (!queryMatch) {
    return false;
  }
  
  // Get the full hook config block
  const hookStart = beforePosition.lastIndexOf(queryMatch[0]);
  const afterHookStart = content.substring(hookStart);
  
  // Find the closing brace of the config object
  let braceDepth = 0;
  let configEnd = 0;
  for (let i = 0; i < afterHookStart.length; i++) {
    if (afterHookStart[i] === '{') braceDepth++;
    if (afterHookStart[i] === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        configEnd = i;
        break;
      }
    }
  }
  
  const configBlock = afterHookStart.substring(0, configEnd + 1);
  return /\bonError\s*:/.test(configBlock);
}

/**
 * Detects all API calls in the content and their error handling status.
 */
function detectAPICalls(content: string): APICallLocation[] {
  const calls: APICallLocation[] = [];
  const seenPositions = new Set<number>();
  
  // Helper to add a call if not already seen
  const addCall = (match: RegExpExecArray, callType: string) => {
    const lineNumber = getLineNumber(content, match.index);
    
    // Avoid duplicates at same line
    if (seenPositions.has(lineNumber)) {
      return;
    }
    seenPositions.add(lineNumber);
    
    // Check for error handling
    const inTry = isWithinTryBlock(content, match.index);
    const hasCatch = hasCatchMethod(content, match.index);
    const hasOnError = hasOnErrorHandler(content, match.index);
    
    let hasErrorHandling = inTry || hasCatch || hasOnError;
    let errorHandlingType: ErrorHandlingType | undefined;
    
    if (inTry) {
      errorHandlingType = 'try-catch';
    } else if (hasCatch) {
      errorHandlingType = 'catch-method';
    } else if (hasOnError) {
      errorHandlingType = 'onError';
    }
    
    calls.push({
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 1),
      callType,
      hasErrorHandling,
      errorHandlingType,
    });
  };
  
  // Detect fetch calls
  let match: RegExpExecArray | null;
  const fetchRegex = new RegExp(API_CALL_PATTERNS.fetch.source, 'g');
  while ((match = fetchRegex.exec(content)) !== null) {
    addCall(match, 'fetch');
  }
  
  // Detect axios calls
  const axiosRegex = new RegExp(API_CALL_PATTERNS.axios.source, 'g');
  while ((match = axiosRegex.exec(content)) !== null) {
    addCall(match, 'axios');
  }
  
  // Detect service calls
  const serviceRegex = new RegExp(API_CALL_PATTERNS.serviceCall.source, 'g');
  while ((match = serviceRegex.exec(content)) !== null) {
    addCall(match, 'service');
  }
  
  // Detect API client calls
  const apiClientRegex = new RegExp(API_CALL_PATTERNS.apiClient.source, 'g');
  while ((match = apiClientRegex.exec(content)) !== null) {
    addCall(match, 'apiClient');
  }
  
  return calls;
}

/**
 * Detects error handling mechanisms present in the content.
 */
function detectErrorHandlingMechanisms(content: string): ErrorHandlingType[] {
  const mechanisms: Set<ErrorHandlingType> = new Set();
  
  // Check for try-catch - create new regex to avoid state issues
  if (/\btry\s*\{/.test(content)) {
    mechanisms.add('try-catch');
  }
  
  // Check for .catch() method
  if (/\.catch\s*\(/.test(content)) {
    mechanisms.add('catch-method');
  }
  
  // Check for onError callback
  if (/\bonError\s*:/.test(content)) {
    mechanisms.add('onError');
  }
  
  // Check for ErrorBoundary
  if (/<ErrorBoundary[^>]*>|ErrorBoundary\s*\(/.test(content)) {
    mechanisms.add('error-boundary');
  }
  
  return Array.from(mechanisms);
}

/**
 * Checks if the file has error state handling (isError, error variable).
 */
function hasErrorStateHandling(content: string): boolean {
  // Use inline regex to avoid global state issues
  return (
    /\bisError\b/.test(content) ||
    /\{\s*[^}]*\berror\b[^}]*\}\s*=\s*use(?:Query|Mutation|InfiniteQuery)/.test(content) ||
    /\bif\s*\(\s*error\s*\)|error\s*&&|error\s*\?/.test(content) ||
    /toast\s*\.\s*error\s*\(|showError\s*\(|setError\s*\(/.test(content)
  );
}

/**
 * Checks if the file imports or uses ErrorBoundary.
 */
function hasErrorBoundary(content: string): boolean {
  // Check for ErrorBoundary import
  const hasImport = /import\s+.*ErrorBoundary.*from/.test(content);
  
  // Check for ErrorBoundary usage
  const hasUsage = ERROR_HANDLING_PATTERNS.errorBoundary.test(content);
  
  return hasImport || hasUsage;
}

/**
 * Identifies issues with error handling in the file.
 */
function identifyErrorHandlingIssues(
  content: string,
  apiCalls: APICallLocation[],
  mechanisms: ErrorHandlingType[]
): string[] {
  const issues: string[] = [];
  
  // Check for unhandled API calls
  const unhandledCalls = apiCalls.filter(call => !call.hasErrorHandling);
  if (unhandledCalls.length > 0) {
    for (const call of unhandledCalls) {
      issues.push(`API call at line ${call.lineNumber} (${call.callType}) lacks error handling`);
    }
  }
  
  // Check if there are API calls but no error handling mechanisms
  if (apiCalls.length > 0 && mechanisms.length === 0) {
    issues.push('File contains API calls but no error handling mechanisms detected');
  }
  
  // Check for React Query usage without error state handling
  const hasReactQuery = /use(?:Query|Mutation|InfiniteQuery)\s*\(/.test(content);
  if (hasReactQuery && !hasErrorStateHandling(content)) {
    issues.push('React Query hooks used but error state (isError/error) not handled in UI');
  }
  
  // Check for async functions without try-catch
  const asyncFunctions = content.match(/async\s+(?:function\s+\w+|\(\s*\)|[^=]+=\s*async)/g);
  if (asyncFunctions && asyncFunctions.length > 0) {
    const tryCatchCount = (content.match(/\btry\s*\{/g) || []).length;
    if (tryCatchCount < asyncFunctions.length) {
      // Not all async functions have try-catch, but this might be okay if using .catch()
      const catchMethodCount = (content.match(/\.catch\s*\(/g) || []).length;
      if (tryCatchCount + catchMethodCount < asyncFunctions.length) {
        issues.push('Some async functions may lack error handling');
      }
    }
  }
  
  return issues;
}

/**
 * Verifies error handling in a single page file.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns ErrorHandlingResult with verification details
 */
export function verifyErrorHandling(
  filePath: string,
  projectRoot: string = process.cwd()
): ErrorHandlingResult {
  const fullPath = path.join(projectRoot, filePath);
  
  // Default result for files that can't be read
  const defaultResult: ErrorHandlingResult = {
    hasErrorHandling: false,
    errorHandlingTypes: [],
    unhandledCalls: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        unhandledCalls: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect API calls and their error handling status
    const apiCalls = detectAPICalls(content);
    
    // Detect error handling mechanisms
    const mechanisms = detectErrorHandlingMechanisms(content);
    
    // Check for ErrorBoundary
    if (hasErrorBoundary(content) && !mechanisms.includes('error-boundary')) {
      mechanisms.push('error-boundary');
    }
    
    // Get unhandled calls
    const unhandledCalls = apiCalls
      .filter(call => !call.hasErrorHandling)
      .map(call => `${call.callType} at line ${call.lineNumber}`);
    
    // Determine if error handling exists
    const hasErrorHandling = mechanisms.length > 0 || hasErrorStateHandling(content);
    
    return {
      hasErrorHandling,
      errorHandlingTypes: mechanisms,
      unhandledCalls,
    };
  } catch (error) {
    return {
      ...defaultResult,
      unhandledCalls: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}

/**
 * Verifies error handling for multiple page files.
 * 
 * @param filePaths - Array of file paths to verify
 * @param projectRoot - Project root directory
 * @returns Map of file paths to ErrorHandlingResult
 */
export function verifyErrorHandlingMultiple(
  filePaths: string[],
  projectRoot: string = process.cwd()
): Map<string, ErrorHandlingResult> {
  const results = new Map<string, ErrorHandlingResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, verifyErrorHandling(filePath, projectRoot));
  }
  
  return results;
}

/**
 * Extended result with issues for detailed analysis.
 */
export interface ExtendedErrorHandlingResult extends ErrorHandlingResult {
  /** Issues found during error handling verification */
  issues: string[];
  /** Detailed API call information */
  apiCalls: APICallLocation[];
}

/**
 * Verifies error handling with extended details including issues.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns ExtendedErrorHandlingResult with verification details and issues
 */
export function verifyErrorHandlingExtended(
  filePath: string,
  projectRoot: string = process.cwd()
): ExtendedErrorHandlingResult {
  const fullPath = path.join(projectRoot, filePath);
  
  // Default result for files that can't be read
  const defaultResult: ExtendedErrorHandlingResult = {
    hasErrorHandling: false,
    errorHandlingTypes: [],
    unhandledCalls: [],
    issues: [],
    apiCalls: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect API calls and their error handling status
    const apiCalls = detectAPICalls(content);
    
    // Detect error handling mechanisms
    const mechanisms = detectErrorHandlingMechanisms(content);
    
    // Check for ErrorBoundary
    if (hasErrorBoundary(content) && !mechanisms.includes('error-boundary')) {
      mechanisms.push('error-boundary');
    }
    
    // Get unhandled calls
    const unhandledCalls = apiCalls
      .filter(call => !call.hasErrorHandling)
      .map(call => `${call.callType} at line ${call.lineNumber}`);
    
    // Identify issues
    const issues = identifyErrorHandlingIssues(content, apiCalls, mechanisms);
    
    // Determine if error handling exists
    const hasErrorHandling = mechanisms.length > 0 || hasErrorStateHandling(content);
    
    return {
      hasErrorHandling,
      errorHandlingTypes: mechanisms,
      unhandledCalls,
      issues,
      apiCalls,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}

/**
 * Gets a summary of error handling verification for a file.
 * 
 * @param filePath - Path to the file
 * @param result - ErrorHandlingResult or ExtendedErrorHandlingResult to summarize
 * @returns Human-readable summary string
 */
export function getErrorHandlingSummary(
  filePath: string,
  result: ErrorHandlingResult | ExtendedErrorHandlingResult
): string {
  const lines: string[] = [];
  
  lines.push(`File: ${filePath}`);
  lines.push(`  Error Handling: ${result.hasErrorHandling ? '✓ Present' : '✗ Missing'}`);
  
  if (result.errorHandlingTypes.length > 0) {
    lines.push(`  Mechanisms: ${result.errorHandlingTypes.join(', ')}`);
  }
  
  if (result.unhandledCalls.length > 0) {
    lines.push(`  Unhandled Calls:`);
    for (const call of result.unhandledCalls) {
      lines.push(`    - ${call}`);
    }
  }
  
  // Check for issues in extended result
  if ('issues' in result && result.issues.length > 0) {
    lines.push(`  Issues:`);
    for (const issue of result.issues) {
      lines.push(`    - ${issue}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Generates a report of error handling verification for all pages.
 * 
 * @param results - Map of file paths to ErrorHandlingResult
 * @returns Formatted report string
 */
export function generateErrorHandlingReport(
  results: Map<string, ErrorHandlingResult | ExtendedErrorHandlingResult>
): string {
  const lines: string[] = [];
  const pagesWithIssues: [string, ErrorHandlingResult | ExtendedErrorHandlingResult][] = [];
  const pagesWithoutHandling: [string, ErrorHandlingResult | ExtendedErrorHandlingResult][] = [];
  
  // Categorize pages
  for (const [filePath, result] of results) {
    if (!result.hasErrorHandling) {
      pagesWithoutHandling.push([filePath, result]);
    }
    if (result.unhandledCalls.length > 0 || ('issues' in result && result.issues.length > 0)) {
      pagesWithIssues.push([filePath, result]);
    }
  }
  
  lines.push('='.repeat(60));
  lines.push('Error Handling Verification Report');
  lines.push('='.repeat(60));
  lines.push('');
  
  lines.push(`Total Pages Analyzed: ${results.size}`);
  lines.push(`Pages with Error Handling: ${results.size - pagesWithoutHandling.length}`);
  lines.push(`Pages without Error Handling: ${pagesWithoutHandling.length}`);
  lines.push(`Pages with Issues: ${pagesWithIssues.length}`);
  lines.push('');
  
  // Mechanism usage statistics
  const mechanismCounts: Record<string, number> = {};
  for (const [, result] of results) {
    for (const mechanism of result.errorHandlingTypes) {
      mechanismCounts[mechanism] = (mechanismCounts[mechanism] || 0) + 1;
    }
  }
  
  if (Object.keys(mechanismCounts).length > 0) {
    lines.push('Error Handling Mechanisms Used:');
    for (const [mechanism, count] of Object.entries(mechanismCounts)) {
      lines.push(`  - ${mechanism}: ${count} pages`);
    }
    lines.push('');
  }
  
  if (pagesWithoutHandling.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('Pages Without Error Handling:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithoutHandling) {
      lines.push('');
      lines.push(getErrorHandlingSummary(filePath, result));
    }
  }
  
  if (pagesWithIssues.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('Pages with Issues:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithIssues) {
      // Skip if already shown in "without handling" section
      if (!pagesWithoutHandling.some(([p]) => p === filePath)) {
        lines.push('');
        lines.push(getErrorHandlingSummary(filePath, result));
      }
    }
  }
  
  return lines.join('\n');
}

// CLI execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2] || 'src/pages/student/Dashboard.tsx';
  
  console.log('Error Handling Verifier');
  console.log('=======================');
  console.log(`Analyzing: ${testFile}`);
  console.log('');
  
  const result = verifyErrorHandlingExtended(testFile);
  console.log(getErrorHandlingSummary(testFile, result));
  
  if (result.apiCalls.length > 0) {
    console.log('\n\nDetected API Calls:');
    console.log('-------------------');
    for (const call of result.apiCalls) {
      const status = call.hasErrorHandling 
        ? `✓ ${call.errorHandlingType}` 
        : '✗ No handling';
      console.log(`  Line ${call.lineNumber}: ${call.callType} - ${status}`);
    }
  }
}
