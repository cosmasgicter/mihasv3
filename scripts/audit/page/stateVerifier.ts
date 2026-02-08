/**
 * State Handling Verifier for MIHAS Frontend-Backend Forensic Audit
 * 
 * Parses page files to find loading and empty state handling patterns.
 * Verifies that pages with data fetching properly handle loading and empty states.
 * 
 * @requirements 2.4 - WHEN the Audit_System examines a page THEN it SHALL verify
 *                     empty states are handled with appropriate UI
 * @requirements 2.5 - WHEN the Audit_System examines a page THEN it SHALL verify
 *                     loading states are handled with appropriate UI (skeleton/spinner)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Result of verifying state handling in a page file.
 */
export interface StateHandlingResult {
  /** Whether loading states are properly handled */
  hasLoadingStateHandling: boolean;
  /** Whether empty states are properly handled */
  hasEmptyStateHandling: boolean;
  /** Types of loading state handling found */
  loadingHandlingTypes: LoadingHandlingType[];
  /** Types of empty state handling found */
  emptyHandlingTypes: EmptyHandlingType[];
  /** Issues found during verification */
  issues: string[];
}

/**
 * Extended result with detailed information for analysis.
 */
export interface ExtendedStateHandlingResult extends StateHandlingResult {
  /** Whether the page has data fetching */
  hasDataFetching: boolean;
  /** Data fetching patterns detected */
  dataFetchingPatterns: DataFetchingPattern[];
  /** Loading state patterns detected */
  loadingPatterns: LoadingPattern[];
  /** Empty state patterns detected */
  emptyPatterns: EmptyPattern[];
}


/**
 * Types of loading state handling mechanisms.
 */
export type LoadingHandlingType = 
  | 'isLoading-conditional'
  | 'isPending-conditional'
  | 'loading-variable'
  | 'skeleton-component'
  | 'spinner-component'
  | 'loader-component'
  | 'suspense-fallback'
  | 'loading-prop';

/**
 * Types of empty state handling mechanisms.
 */
export type EmptyHandlingType =
  | 'isEmpty-conditional'
  | 'length-check'
  | 'nullish-check'
  | 'empty-component'
  | 'no-data-message'
  | 'fallback-ui';

/**
 * Information about a detected data fetching pattern.
 */
export interface DataFetchingPattern {
  /** Type of data fetching */
  type: 'useQuery' | 'useMutation' | 'useInfiniteQuery' | 'useEffect' | 'fetch' | 'customHook';
  /** Line number where detected */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
  /** Variables destructured (isLoading, data, etc.) */
  destructuredVars: string[];
}

/**
 * Information about a detected loading state pattern.
 */
export interface LoadingPattern {
  /** Type of loading handling */
  type: LoadingHandlingType;
  /** Line number where detected */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
}

/**
 * Information about a detected empty state pattern.
 */
export interface EmptyPattern {
  /** Type of empty handling */
  type: EmptyHandlingType;
  /** Line number where detected */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
}


/**
 * Patterns for detecting data fetching in page files.
 */
const DATA_FETCHING_PATTERNS = {
  /** React Query useQuery hook */
  useQuery: /(?:const|let)\s*\{([^}]*)\}\s*=\s*useQuery\s*\(/g,
  
  /** React Query useMutation hook */
  useMutation: /(?:const|let)\s*\{([^}]*)\}\s*=\s*useMutation\s*\(/g,
  
  /** React Query useInfiniteQuery hook */
  useInfiniteQuery: /(?:const|let)\s*\{([^}]*)\}\s*=\s*useInfiniteQuery\s*\(/g,
  
  /** useEffect with fetch/axios */
  useEffectFetch: /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[^}]*(?:fetch|axios|\.get\(|\.post\()/g,
  
  /** Direct fetch calls */
  fetch: /\bfetch\s*\(\s*['"`][^'"`]*['"`]/g,
  
  /** Custom data hooks (common patterns) */
  customDataHook: /(?:const|let)\s*\{([^}]*)\}\s*=\s*use(?:Auth|Profile|Applications?|Users?|Analytics|Dashboard|Notifications?|Sessions?|Documents?|Payments?)\w*\s*\(/g,
};

/**
 * Patterns for detecting loading state handling.
 */
const LOADING_STATE_PATTERNS = {
  /** isLoading conditional */
  isLoadingConditional: /\bisLoading\s*(?:&&|\?|!)/g,
  
  /** isPending conditional (React Query v5) */
  isPendingConditional: /\bisPending\s*(?:&&|\?|!)/g,
  
  /** loading variable conditional */
  loadingVariable: /\bloading\s*(?:&&|\?|!)/g,
  
  /** if (isLoading) pattern */
  ifIsLoading: /if\s*\(\s*isLoading\s*\)/g,
  
  /** if (isPending) pattern */
  ifIsPending: /if\s*\(\s*isPending\s*\)/g,
  
  /** if (loading) pattern */
  ifLoading: /if\s*\(\s*loading\s*\)/g,
  
  /** Skeleton component usage */
  skeletonComponent: /<Skeleton[^>]*>|Skeleton\s*\(/g,
  
  /** Spinner component usage */
  spinnerComponent: /<Spinner[^>]*>|Spinner\s*\(|<LoadingSpinner[^>]*>/g,
  
  /** Loader component usage */
  loaderComponent: /<Loader[^>]*>|Loader\s*\(|<Loading[^>]*>|Loading\s*\(/g,
  
  /** Suspense fallback */
  suspenseFallback: /<Suspense\s+fallback=/g,
  
  /** loading prop on components */
  loadingProp: /loading=\{[^}]+\}/g,
  
  /** isLoading prop */
  isLoadingProp: /isLoading=\{[^}]+\}/g,
};


/**
 * Patterns for detecting empty state handling.
 */
const EMPTY_STATE_PATTERNS = {
  /** isEmpty conditional */
  isEmptyConditional: /\bisEmpty\s*(?:&&|\?|!)/g,
  
  /** data?.length === 0 pattern */
  lengthZeroCheck: /(?:data|items|results|list|applications|users|notifications)\??\s*\.?\s*length\s*===?\s*0/g,
  
  /** !data?.length pattern */
  noLengthCheck: /!\s*(?:data|items|results|list|applications|users|notifications)\??\s*\.?\s*length/g,
  
  /** data.length === 0 pattern */
  strictLengthCheck: /\.length\s*===?\s*0/g,
  
  /** !data or data === null/undefined */
  nullishCheck: /!\s*data\b|data\s*===?\s*(?:null|undefined)|data\s*==\s*null/g,
  
  /** Empty component usage */
  emptyComponent: /<Empty[^>]*>|<EmptyState[^>]*>|<NoData[^>]*>|<NoResults[^>]*>/g,
  
  /** "No data" or "No results" message */
  noDataMessage: /['"`]No\s+(?:data|results|items|applications|users|records)['"`]/gi,
  
  /** Empty array check */
  emptyArrayCheck: /\[\s*\]\.length|Array\.isArray\([^)]+\)\s*&&\s*[^.]+\.length\s*===?\s*0/g,
  
  /** Fallback UI patterns */
  fallbackUI: /\?\s*<[^>]+>\s*:\s*<[^>]+(?:Empty|NoData|Placeholder)/g,
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
function extractCodeSnippet(content: string, index: number, contextLines: number = 1): string {
  const lines = content.split('\n');
  const lineNumber = getLineNumber(content, index);
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length, lineNumber + contextLines);
  
  return lines.slice(startLine, endLine).join('\n').trim();
}

/**
 * Extracts destructured variables from a hook call.
 */
function extractDestructuredVars(destructureBlock: string): string[] {
  // Remove whitespace and split by comma
  return destructureBlock
    .replace(/\s+/g, '')
    .split(',')
    .map(v => v.split(':')[0].trim()) // Handle renaming like { data: users }
    .filter(v => v.length > 0);
}


/**
 * Detects data fetching patterns in the content.
 */
function detectDataFetchingPatterns(content: string): DataFetchingPattern[] {
  const patterns: DataFetchingPattern[] = [];
  const seenLines = new Set<number>();
  
  // Helper to add pattern if not duplicate
  const addPattern = (
    type: DataFetchingPattern['type'],
    match: RegExpExecArray,
    destructuredVars: string[] = []
  ) => {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) return;
    seenLines.add(lineNumber);
    
    patterns.push({
      type,
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index),
      destructuredVars,
    });
  };
  
  // Detect useQuery
  const useQueryRegex = new RegExp(DATA_FETCHING_PATTERNS.useQuery.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = useQueryRegex.exec(content)) !== null) {
    const vars = extractDestructuredVars(match[1] || '');
    addPattern('useQuery', match, vars);
  }
  
  // Detect useMutation
  const useMutationRegex = new RegExp(DATA_FETCHING_PATTERNS.useMutation.source, 'g');
  while ((match = useMutationRegex.exec(content)) !== null) {
    const vars = extractDestructuredVars(match[1] || '');
    addPattern('useMutation', match, vars);
  }
  
  // Detect useInfiniteQuery
  const useInfiniteQueryRegex = new RegExp(DATA_FETCHING_PATTERNS.useInfiniteQuery.source, 'g');
  while ((match = useInfiniteQueryRegex.exec(content)) !== null) {
    const vars = extractDestructuredVars(match[1] || '');
    addPattern('useInfiniteQuery', match, vars);
  }
  
  // Detect useEffect with fetch
  const useEffectFetchRegex = new RegExp(DATA_FETCHING_PATTERNS.useEffectFetch.source, 'g');
  while ((match = useEffectFetchRegex.exec(content)) !== null) {
    addPattern('useEffect', match, ['loading', 'data', 'error']);
  }
  
  // Detect custom data hooks
  const customHookRegex = new RegExp(DATA_FETCHING_PATTERNS.customDataHook.source, 'g');
  while ((match = customHookRegex.exec(content)) !== null) {
    const vars = extractDestructuredVars(match[1] || '');
    addPattern('customHook', match, vars);
  }
  
  return patterns;
}


/**
 * Detects loading state handling patterns in the content.
 */
function detectLoadingPatterns(content: string): LoadingPattern[] {
  const patterns: LoadingPattern[] = [];
  const seenLines = new Set<number>();
  
  const addPattern = (type: LoadingHandlingType, match: RegExpExecArray) => {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) return;
    seenLines.add(lineNumber);
    
    patterns.push({
      type,
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index),
    });
  };
  
  let match: RegExpExecArray | null;
  
  // isLoading conditionals
  const isLoadingRegex = new RegExp(LOADING_STATE_PATTERNS.isLoadingConditional.source, 'g');
  while ((match = isLoadingRegex.exec(content)) !== null) {
    addPattern('isLoading-conditional', match);
  }
  
  // isPending conditionals
  const isPendingRegex = new RegExp(LOADING_STATE_PATTERNS.isPendingConditional.source, 'g');
  while ((match = isPendingRegex.exec(content)) !== null) {
    addPattern('isPending-conditional', match);
  }
  
  // loading variable conditionals
  const loadingVarRegex = new RegExp(LOADING_STATE_PATTERNS.loadingVariable.source, 'g');
  while ((match = loadingVarRegex.exec(content)) !== null) {
    addPattern('loading-variable', match);
  }
  
  // if (isLoading) patterns
  const ifIsLoadingRegex = new RegExp(LOADING_STATE_PATTERNS.ifIsLoading.source, 'g');
  while ((match = ifIsLoadingRegex.exec(content)) !== null) {
    addPattern('isLoading-conditional', match);
  }
  
  // if (isPending) patterns
  const ifIsPendingRegex = new RegExp(LOADING_STATE_PATTERNS.ifIsPending.source, 'g');
  while ((match = ifIsPendingRegex.exec(content)) !== null) {
    addPattern('isPending-conditional', match);
  }
  
  // if (loading) patterns
  const ifLoadingRegex = new RegExp(LOADING_STATE_PATTERNS.ifLoading.source, 'g');
  while ((match = ifLoadingRegex.exec(content)) !== null) {
    addPattern('loading-variable', match);
  }
  
  // Skeleton components
  const skeletonRegex = new RegExp(LOADING_STATE_PATTERNS.skeletonComponent.source, 'g');
  while ((match = skeletonRegex.exec(content)) !== null) {
    addPattern('skeleton-component', match);
  }
  
  // Spinner components
  const spinnerRegex = new RegExp(LOADING_STATE_PATTERNS.spinnerComponent.source, 'g');
  while ((match = spinnerRegex.exec(content)) !== null) {
    addPattern('spinner-component', match);
  }
  
  // Loader components
  const loaderRegex = new RegExp(LOADING_STATE_PATTERNS.loaderComponent.source, 'g');
  while ((match = loaderRegex.exec(content)) !== null) {
    addPattern('loader-component', match);
  }
  
  // Suspense fallback
  const suspenseRegex = new RegExp(LOADING_STATE_PATTERNS.suspenseFallback.source, 'g');
  while ((match = suspenseRegex.exec(content)) !== null) {
    addPattern('suspense-fallback', match);
  }
  
  // loading prop
  const loadingPropRegex = new RegExp(LOADING_STATE_PATTERNS.loadingProp.source, 'g');
  while ((match = loadingPropRegex.exec(content)) !== null) {
    addPattern('loading-prop', match);
  }
  
  // isLoading prop
  const isLoadingPropRegex = new RegExp(LOADING_STATE_PATTERNS.isLoadingProp.source, 'g');
  while ((match = isLoadingPropRegex.exec(content)) !== null) {
    addPattern('loading-prop', match);
  }
  
  return patterns;
}


/**
 * Detects empty state handling patterns in the content.
 */
function detectEmptyPatterns(content: string): EmptyPattern[] {
  const patterns: EmptyPattern[] = [];
  const seenLines = new Set<number>();
  
  const addPattern = (type: EmptyHandlingType, match: RegExpExecArray) => {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) return;
    seenLines.add(lineNumber);
    
    patterns.push({
      type,
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index),
    });
  };
  
  let match: RegExpExecArray | null;
  
  // isEmpty conditionals
  const isEmptyRegex = new RegExp(EMPTY_STATE_PATTERNS.isEmptyConditional.source, 'g');
  while ((match = isEmptyRegex.exec(content)) !== null) {
    addPattern('isEmpty-conditional', match);
  }
  
  // length === 0 checks
  const lengthZeroRegex = new RegExp(EMPTY_STATE_PATTERNS.lengthZeroCheck.source, 'g');
  while ((match = lengthZeroRegex.exec(content)) !== null) {
    addPattern('length-check', match);
  }
  
  // !data?.length checks
  const noLengthRegex = new RegExp(EMPTY_STATE_PATTERNS.noLengthCheck.source, 'g');
  while ((match = noLengthRegex.exec(content)) !== null) {
    addPattern('length-check', match);
  }
  
  // .length === 0 checks
  const strictLengthRegex = new RegExp(EMPTY_STATE_PATTERNS.strictLengthCheck.source, 'g');
  while ((match = strictLengthRegex.exec(content)) !== null) {
    addPattern('length-check', match);
  }
  
  // nullish checks
  const nullishRegex = new RegExp(EMPTY_STATE_PATTERNS.nullishCheck.source, 'g');
  while ((match = nullishRegex.exec(content)) !== null) {
    addPattern('nullish-check', match);
  }
  
  // Empty components
  const emptyComponentRegex = new RegExp(EMPTY_STATE_PATTERNS.emptyComponent.source, 'g');
  while ((match = emptyComponentRegex.exec(content)) !== null) {
    addPattern('empty-component', match);
  }
  
  // "No data" messages
  const noDataMessageRegex = new RegExp(EMPTY_STATE_PATTERNS.noDataMessage.source, 'gi');
  while ((match = noDataMessageRegex.exec(content)) !== null) {
    addPattern('no-data-message', match);
  }
  
  // Empty array checks
  const emptyArrayRegex = new RegExp(EMPTY_STATE_PATTERNS.emptyArrayCheck.source, 'g');
  while ((match = emptyArrayRegex.exec(content)) !== null) {
    addPattern('length-check', match);
  }
  
  // Fallback UI patterns
  const fallbackUIRegex = new RegExp(EMPTY_STATE_PATTERNS.fallbackUI.source, 'g');
  while ((match = fallbackUIRegex.exec(content)) !== null) {
    addPattern('fallback-ui', match);
  }
  
  return patterns;
}


/**
 * Checks if data fetching patterns have corresponding loading state handling.
 */
function checkLoadingStateHandling(
  dataPatterns: DataFetchingPattern[],
  loadingPatterns: LoadingPattern[],
  content: string
): { hasHandling: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // If no data fetching, loading state handling is not required
  if (dataPatterns.length === 0) {
    return { hasHandling: true, issues: [] };
  }
  
  // Check if any loading patterns exist
  if (loadingPatterns.length === 0) {
    // Check if isLoading is destructured but not used
    const hasIsLoadingDestructured = dataPatterns.some(p => 
      p.destructuredVars.includes('isLoading') || 
      p.destructuredVars.includes('isPending') ||
      p.destructuredVars.includes('loading')
    );
    
    if (hasIsLoadingDestructured) {
      issues.push('isLoading/isPending destructured but not used for conditional rendering');
    } else {
      issues.push('Data fetching detected but no loading state handling found');
    }
    
    return { hasHandling: false, issues };
  }
  
  // Check for each data fetching pattern if there's corresponding loading handling
  for (const dataPattern of dataPatterns) {
    const hasLoadingVar = dataPattern.destructuredVars.some(v => 
      v === 'isLoading' || v === 'isPending' || v === 'loading'
    );
    
    if (hasLoadingVar) {
      // Check if the loading variable is actually used
      const loadingVarUsed = loadingPatterns.some(lp => 
        lp.type === 'isLoading-conditional' ||
        lp.type === 'isPending-conditional' ||
        lp.type === 'loading-variable'
      );
      
      if (!loadingVarUsed) {
        // Check for skeleton/spinner/loader components as alternative
        const hasLoadingUI = loadingPatterns.some(lp =>
          lp.type === 'skeleton-component' ||
          lp.type === 'spinner-component' ||
          lp.type === 'loader-component' ||
          lp.type === 'suspense-fallback'
        );
        
        if (!hasLoadingUI) {
          issues.push(`${dataPattern.type} at line ${dataPattern.lineNumber}: isLoading destructured but not used`);
        }
      }
    }
  }
  
  return { hasHandling: loadingPatterns.length > 0, issues };
}


/**
 * Checks if data fetching patterns have corresponding empty state handling.
 */
function checkEmptyStateHandling(
  dataPatterns: DataFetchingPattern[],
  emptyPatterns: EmptyPattern[],
  content: string
): { hasHandling: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // If no data fetching, empty state handling is not required
  if (dataPatterns.length === 0) {
    return { hasHandling: true, issues: [] };
  }
  
  // Check if any empty patterns exist
  if (emptyPatterns.length === 0) {
    // Check if data is destructured
    const hasDataDestructured = dataPatterns.some(p => 
      p.destructuredVars.includes('data') ||
      p.destructuredVars.some(v => v.toLowerCase().includes('data'))
    );
    
    if (hasDataDestructured) {
      // Check for common empty state patterns in the content
      const hasEmptyCheck = 
        /data\s*&&\s*data\.length\s*[><=]/.test(content) ||
        /data\?\.length/.test(content) ||
        /data\s*\?\s*\.map/.test(content) ||
        /\{data\s*&&/.test(content);
      
      if (!hasEmptyCheck) {
        issues.push('Data fetching detected but no empty state handling found');
      } else {
        // Has implicit empty handling through conditional rendering
        return { hasHandling: true, issues: [] };
      }
    } else {
      issues.push('Data fetching detected but no empty state handling found');
    }
    
    return { hasHandling: false, issues };
  }
  
  return { hasHandling: true, issues };
}

/**
 * Extracts unique loading handling types from patterns.
 */
function extractLoadingHandlingTypes(patterns: LoadingPattern[]): LoadingHandlingType[] {
  const types = new Set<LoadingHandlingType>();
  patterns.forEach(p => types.add(p.type));
  return Array.from(types);
}

/**
 * Extracts unique empty handling types from patterns.
 */
function extractEmptyHandlingTypes(patterns: EmptyPattern[]): EmptyHandlingType[] {
  const types = new Set<EmptyHandlingType>();
  patterns.forEach(p => types.add(p.type));
  return Array.from(types);
}


/**
 * Verifies state handling in a single page file.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns StateHandlingResult with verification details
 */
export function verifyStateHandling(
  filePath: string,
  baseDir: string = process.cwd()
): StateHandlingResult {
  const fullPath = path.join(baseDir, filePath);
  
  // Default result for files that can't be read
  const defaultResult: StateHandlingResult = {
    hasLoadingStateHandling: false,
    hasEmptyStateHandling: false,
    loadingHandlingTypes: [],
    emptyHandlingTypes: [],
    issues: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect patterns
    const dataPatterns = detectDataFetchingPatterns(content);
    const loadingPatterns = detectLoadingPatterns(content);
    const emptyPatterns = detectEmptyPatterns(content);
    
    // Check loading state handling
    const loadingCheck = checkLoadingStateHandling(dataPatterns, loadingPatterns, content);
    
    // Check empty state handling
    const emptyCheck = checkEmptyStateHandling(dataPatterns, emptyPatterns, content);
    
    // Combine issues
    const issues = [...loadingCheck.issues, ...emptyCheck.issues];
    
    return {
      hasLoadingStateHandling: loadingCheck.hasHandling,
      hasEmptyStateHandling: emptyCheck.hasHandling,
      loadingHandlingTypes: extractLoadingHandlingTypes(loadingPatterns),
      emptyHandlingTypes: extractEmptyHandlingTypes(emptyPatterns),
      issues,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}


/**
 * Verifies state handling with extended details for analysis.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns ExtendedStateHandlingResult with detailed verification information
 */
export function verifyStateHandlingExtended(
  filePath: string,
  baseDir: string = process.cwd()
): ExtendedStateHandlingResult {
  const fullPath = path.join(baseDir, filePath);
  
  // Default result for files that can't be read
  const defaultResult: ExtendedStateHandlingResult = {
    hasLoadingStateHandling: false,
    hasEmptyStateHandling: false,
    loadingHandlingTypes: [],
    emptyHandlingTypes: [],
    issues: [],
    hasDataFetching: false,
    dataFetchingPatterns: [],
    loadingPatterns: [],
    emptyPatterns: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect patterns
    const dataPatterns = detectDataFetchingPatterns(content);
    const loadingPatterns = detectLoadingPatterns(content);
    const emptyPatterns = detectEmptyPatterns(content);
    
    // Check loading state handling
    const loadingCheck = checkLoadingStateHandling(dataPatterns, loadingPatterns, content);
    
    // Check empty state handling
    const emptyCheck = checkEmptyStateHandling(dataPatterns, emptyPatterns, content);
    
    // Combine issues
    const issues = [...loadingCheck.issues, ...emptyCheck.issues];
    
    return {
      hasLoadingStateHandling: loadingCheck.hasHandling,
      hasEmptyStateHandling: emptyCheck.hasHandling,
      loadingHandlingTypes: extractLoadingHandlingTypes(loadingPatterns),
      emptyHandlingTypes: extractEmptyHandlingTypes(emptyPatterns),
      issues,
      hasDataFetching: dataPatterns.length > 0,
      dataFetchingPatterns: dataPatterns,
      loadingPatterns,
      emptyPatterns,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}


/**
 * Verifies state handling for multiple page files.
 * 
 * @param filePaths - Array of file paths to verify
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Map of file paths to StateHandlingResult
 */
export function verifyStateHandlingMultiple(
  filePaths: string[],
  baseDir: string = process.cwd()
): Map<string, StateHandlingResult> {
  const results = new Map<string, StateHandlingResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, verifyStateHandling(filePath, baseDir));
  }
  
  return results;
}

/**
 * Gets a summary of state handling verification for a file.
 * 
 * @param filePath - Path to the file
 * @param result - StateHandlingResult or ExtendedStateHandlingResult to summarize
 * @returns Human-readable summary string
 */
export function getStateHandlingSummary(
  filePath: string,
  result: StateHandlingResult | ExtendedStateHandlingResult
): string {
  const lines: string[] = [];
  
  lines.push(`File: ${filePath}`);
  lines.push(`  Loading State: ${result.hasLoadingStateHandling ? '✓ Handled' : '✗ Missing'}`);
  lines.push(`  Empty State: ${result.hasEmptyStateHandling ? '✓ Handled' : '✗ Missing'}`);
  
  if (result.loadingHandlingTypes.length > 0) {
    lines.push(`  Loading Types: ${result.loadingHandlingTypes.join(', ')}`);
  }
  
  if (result.emptyHandlingTypes.length > 0) {
    lines.push(`  Empty Types: ${result.emptyHandlingTypes.join(', ')}`);
  }
  
  // Check for extended result properties
  if ('hasDataFetching' in result) {
    lines.push(`  Has Data Fetching: ${result.hasDataFetching ? 'Yes' : 'No'}`);
    
    if (result.dataFetchingPatterns.length > 0) {
      lines.push(`  Data Fetching Patterns:`);
      for (const pattern of result.dataFetchingPatterns) {
        lines.push(`    - ${pattern.type} at line ${pattern.lineNumber}`);
      }
    }
  }
  
  if (result.issues.length > 0) {
    lines.push(`  Issues:`);
    for (const issue of result.issues) {
      lines.push(`    - ${issue}`);
    }
  }
  
  return lines.join('\n');
}


/**
 * Generates a report of state handling verification for all pages.
 * 
 * @param results - Map of file paths to StateHandlingResult
 * @returns Formatted report string
 */
export function generateStateHandlingReport(
  results: Map<string, StateHandlingResult | ExtendedStateHandlingResult>
): string {
  const lines: string[] = [];
  const pagesWithIssues: [string, StateHandlingResult | ExtendedStateHandlingResult][] = [];
  const pagesMissingLoading: [string, StateHandlingResult | ExtendedStateHandlingResult][] = [];
  const pagesMissingEmpty: [string, StateHandlingResult | ExtendedStateHandlingResult][] = [];
  
  // Categorize pages
  for (const [filePath, result] of results) {
    if (result.issues.length > 0) {
      pagesWithIssues.push([filePath, result]);
    }
    if (!result.hasLoadingStateHandling && 'hasDataFetching' in result && result.hasDataFetching) {
      pagesMissingLoading.push([filePath, result]);
    }
    if (!result.hasEmptyStateHandling && 'hasDataFetching' in result && result.hasDataFetching) {
      pagesMissingEmpty.push([filePath, result]);
    }
  }
  
  lines.push('='.repeat(60));
  lines.push('State Handling Verification Report');
  lines.push('='.repeat(60));
  lines.push('');
  
  lines.push(`Total Pages Analyzed: ${results.size}`);
  lines.push(`Pages with Loading State Handling: ${Array.from(results.values()).filter(r => r.hasLoadingStateHandling).length}`);
  lines.push(`Pages with Empty State Handling: ${Array.from(results.values()).filter(r => r.hasEmptyStateHandling).length}`);
  lines.push(`Pages with Issues: ${pagesWithIssues.length}`);
  lines.push('');
  
  // Loading handling type statistics
  const loadingTypeCounts: Record<string, number> = {};
  for (const [, result] of results) {
    for (const type of result.loadingHandlingTypes) {
      loadingTypeCounts[type] = (loadingTypeCounts[type] || 0) + 1;
    }
  }
  
  if (Object.keys(loadingTypeCounts).length > 0) {
    lines.push('Loading Handling Types Used:');
    for (const [type, count] of Object.entries(loadingTypeCounts)) {
      lines.push(`  - ${type}: ${count} pages`);
    }
    lines.push('');
  }
  
  // Empty handling type statistics
  const emptyTypeCounts: Record<string, number> = {};
  for (const [, result] of results) {
    for (const type of result.emptyHandlingTypes) {
      emptyTypeCounts[type] = (emptyTypeCounts[type] || 0) + 1;
    }
  }
  
  if (Object.keys(emptyTypeCounts).length > 0) {
    lines.push('Empty Handling Types Used:');
    for (const [type, count] of Object.entries(emptyTypeCounts)) {
      lines.push(`  - ${type}: ${count} pages`);
    }
    lines.push('');
  }
  
  if (pagesMissingLoading.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('Pages Missing Loading State Handling:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesMissingLoading) {
      lines.push('');
      lines.push(getStateHandlingSummary(filePath, result));
    }
  }
  
  if (pagesMissingEmpty.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('Pages Missing Empty State Handling:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesMissingEmpty) {
      // Skip if already shown in missing loading section
      if (!pagesMissingLoading.some(([p]) => p === filePath)) {
        lines.push('');
        lines.push(getStateHandlingSummary(filePath, result));
      }
    }
  }
  
  if (pagesWithIssues.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('Pages with Issues:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithIssues) {
      // Skip if already shown in other sections
      const alreadyShown = 
        pagesMissingLoading.some(([p]) => p === filePath) ||
        pagesMissingEmpty.some(([p]) => p === filePath);
      
      if (!alreadyShown) {
        lines.push('');
        lines.push(getStateHandlingSummary(filePath, result));
      }
    }
  }
  
  return lines.join('\n');
}


// CLI execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2] || 'src/pages/student/Dashboard.tsx';
  
  console.log('State Handling Verifier');
  console.log('=======================');
  console.log(`Analyzing: ${testFile}`);
  console.log('');
  
  const result = verifyStateHandlingExtended(testFile);
  console.log(getStateHandlingSummary(testFile, result));
  
  if (result.dataFetchingPatterns.length > 0) {
    console.log('\n\nData Fetching Patterns Detected:');
    console.log('--------------------------------');
    for (const pattern of result.dataFetchingPatterns) {
      console.log(`  Line ${pattern.lineNumber}: ${pattern.type}`);
      if (pattern.destructuredVars.length > 0) {
        console.log(`    Destructured: ${pattern.destructuredVars.join(', ')}`);
      }
    }
  }
  
  if (result.loadingPatterns.length > 0) {
    console.log('\n\nLoading State Patterns Detected:');
    console.log('--------------------------------');
    for (const pattern of result.loadingPatterns) {
      console.log(`  Line ${pattern.lineNumber}: ${pattern.type}`);
    }
  }
  
  if (result.emptyPatterns.length > 0) {
    console.log('\n\nEmpty State Patterns Detected:');
    console.log('------------------------------');
    for (const pattern of result.emptyPatterns) {
      console.log(`  Line ${pattern.lineNumber}: ${pattern.type}`);
    }
  }
}
