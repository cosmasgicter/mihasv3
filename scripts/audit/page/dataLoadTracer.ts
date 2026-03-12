/**
 * Data Load Path Tracer for MIHAS Frontend-Backend Forensic Audit
 * 
 * Identifies React Query hooks, useEffect data fetches, and custom hooks
 * that load data. Maps dependencies between hooks and extracts cache strategies.
 * 
 * @requirements 2.1 - WHEN the Audit_System examines a page THEN it SHALL trace
 *                     and document the complete data load path
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DataLoadStep } from '../types';

/**
 * Raw data about a detected data loading pattern before processing.
 */
interface RawDataLoadPattern {
  /** Type of pattern detected */
  type: 'useQuery' | 'useMutation' | 'useInfiniteQuery' | 'useEffect' | 'customHook';
  /** The hook or function name */
  hookName: string;
  /** Line number where detected */
  lineNumber: number;
  /** Raw code snippet */
  codeSnippet: string;
  /** Query key if available */
  queryKey?: string;
  /** Endpoint if detected */
  endpoint?: string;
  /** Dependencies array if available */
  dependencies?: string[];
  /** Cache configuration if detected */
  cacheConfig?: {
    staleTime?: number;
    cacheTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
    enabled?: string;
  };
}

/**
 * Result of tracing data load paths in a file.
 */
export interface DataLoadTraceResult {
  /** Path to the file analyzed */
  filePath: string;
  /** All data load steps found */
  steps: DataLoadStep[];
  /** Raw patterns detected (for debugging) */
  rawPatterns: RawDataLoadPattern[];
  /** Custom hooks used that may load data */
  customHooksUsed: string[];
  /** Errors encountered during analysis */
  errors: string[];
}

/**
 * Known custom hooks that load data in the MIHAS codebase.
 * These are hooks that wrap React Query or make API calls.
 */
const KNOWN_DATA_HOOKS: Record<string, { endpoint: string; description: string }> = {
  'useAuth': { endpoint: '/api/auth?action=session', description: 'Authentication state' },
  'useProfileQuery': { endpoint: '/api/auth?action=session', description: 'User profile data' },
  'useActiveSessions': { endpoint: '/api/sessions?action=list', description: 'Active user sessions' },
  'useApplicationsData': { endpoint: '/api/applications', description: 'Applications data with counts' },
  'useAnalytics': { endpoint: '/api/admin?action=stats', description: 'Analytics metrics' },
  'useUsers': { endpoint: '/api/admin?action=users', description: 'User list' },
  'useUserPermissions': { endpoint: '/api/admin?action=users', description: 'User permissions' },
  'useAdminDashboardPolling': { endpoint: '/api/admin?action=dashboard', description: 'Admin dashboard polling' },
  'useStudentDashboardPolling': { endpoint: '/api/applications', description: 'Student dashboard polling' },
  'useAdminDashboardRefresh': { endpoint: '/api/admin?action=dashboard', description: 'Admin dashboard refresh' },
  'useStudentDashboardRefresh': { endpoint: '/api/applications', description: 'Student dashboard refresh' },
  'useNotificationPreferences': { endpoint: '/api/notifications?action=preferences', description: 'Notification preferences' },
  'useApplicationDrafts': { endpoint: '/api/applications?status=draft', description: 'Application drafts' },
  'useApplicationAnalytics': { endpoint: '/api/admin?action=stats', description: 'Application analytics' },
  'useStorageDownload': { endpoint: '/api/documents', description: 'Storage download' },
  'useStorageList': { endpoint: '/api/documents', description: 'Storage list' },
  'usePredictionResults': { endpoint: '/api/admin?action=stats', description: 'Prediction results' },
  'useWorkflowLogs': { endpoint: '/api/admin?action=stats', description: 'Workflow logs' },
  'useNotificationLogs': { endpoint: '/api/admin?action=stats', description: 'Notification logs' },
  'useDraftManager': { endpoint: 'localStorage', description: 'Draft manager (local)' },
  'useManualRefresh': { endpoint: 'cache-invalidation', description: 'Manual refresh trigger' },
};

/**
 * Extracts useQuery patterns from code content.
 * 
 * Handles patterns like:
 * - useQuery(['key'], () => fetch('/api/...'))
 * - useQuery({ queryKey: ['key'], queryFn: ... })
 * - useQuery({ queryKey: ['key'], queryFn: () => service.method() })
 */
function extractUseQueryPatterns(content: string, _lines: string[]): RawDataLoadPattern[] {
  const patterns: RawDataLoadPattern[] = [];
  
  // Find all useQuery calls and extract their full config blocks
  // Use a more robust approach: find useQuery( and then match balanced braces
  const useQueryStarts = findAllOccurrences(content, /useQuery\s*\(\s*\{/g);
  
  for (const startIndex of useQueryStarts) {
    const lineNumber = getLineNumber(content, startIndex);
    
    // Extract the config block by matching balanced braces
    const configStart = content.indexOf('{', startIndex);
    if (configStart === -1) continue;
    
    const configBlock = extractBalancedBraces(content, configStart);
    if (!configBlock) continue;
    
    // Extract queryKey
    const queryKeyMatch = configBlock.match(/queryKey:\s*\[([^\]]*)\]/);
    const queryKey = queryKeyMatch ? queryKeyMatch[1].trim() : undefined;
    
    // Extract queryFn to find endpoint
    const queryFnMatch = configBlock.match(/queryFn:\s*(\w+)/);
    const endpoint = extractEndpointFromQueryFn(queryFnMatch ? queryFnMatch[1] : configBlock);
    
    // Extract cache config
    const cacheConfig = extractCacheConfig(configBlock);
    
    // Extract enabled condition (dependency)
    const enabledMatch = configBlock.match(/enabled[,:]?\s*([^,}\n]+)/);
    const dependencies: string[] = [];
    if (enabledMatch && !enabledMatch[1].includes('enabled')) {
      dependencies.push(enabledMatch[1].trim());
    }
    
    patterns.push({
      type: 'useQuery',
      hookName: 'useQuery',
      lineNumber,
      codeSnippet: `useQuery({${configBlock.substring(0, 150)}...`,
      queryKey,
      endpoint,
      dependencies,
      cacheConfig
    });
  }
  
  // Pattern 2: useQuery(['key'], queryFn) - array style (legacy)
  const arrayStyleRegex = /useQuery\s*\(\s*\[([^\]]*)\]\s*,\s*([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = arrayStyleRegex.exec(content)) !== null) {
    const queryKey = match[1].trim();
    const queryFn = match[2].trim();
    const lineNumber = getLineNumber(content, match.index);
    const endpoint = extractEndpointFromQueryFn(queryFn);
    
    patterns.push({
      type: 'useQuery',
      hookName: 'useQuery',
      lineNumber,
      codeSnippet: match[0].substring(0, 200),
      queryKey,
      endpoint,
      dependencies: [],
      cacheConfig: {}
    });
  }
  
  return patterns;
}

/**
 * Finds all occurrences of a regex pattern and returns their indices.
 */
function findAllOccurrences(content: string, regex: RegExp): number[] {
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    indices.push(match.index);
  }
  return indices;
}

/**
 * Extracts content within balanced braces starting from a given index.
 */
function extractBalancedBraces(content: string, startIndex: number): string | null {
  if (content[startIndex] !== '{') return null;
  
  let depth = 0;
  let endIndex = startIndex;
  
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    
    if (depth === 0) {
      endIndex = i;
      break;
    }
  }
  
  if (depth !== 0) return null;
  
  return content.substring(startIndex + 1, endIndex);
}

/**
 * Extracts useMutation patterns from code content.
 */
function extractUseMutationPatterns(content: string): RawDataLoadPattern[] {
  const patterns: RawDataLoadPattern[] = [];
  
  const mutationRegex = /useMutation\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
  let match: RegExpExecArray | null;
  
  while ((match = mutationRegex.exec(content)) !== null) {
    const configBlock = match[1];
    const lineNumber = getLineNumber(content, match.index);
    
    // Extract mutationFn to find endpoint
    const mutationFnMatch = configBlock.match(/mutationFn:\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{?([^,}]+)/);
    const endpoint = extractEndpointFromQueryFn(mutationFnMatch ? mutationFnMatch[1] : configBlock);
    
    patterns.push({
      type: 'useMutation',
      hookName: 'useMutation',
      lineNumber,
      codeSnippet: match[0].substring(0, 200),
      endpoint,
      dependencies: [],
      cacheConfig: {}
    });
  }
  
  return patterns;
}

/**
 * Extracts useInfiniteQuery patterns from code content.
 */
function extractUseInfiniteQueryPatterns(content: string): RawDataLoadPattern[] {
  const patterns: RawDataLoadPattern[] = [];
  
  const infiniteRegex = /useInfiniteQuery\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
  let match: RegExpExecArray | null;
  
  while ((match = infiniteRegex.exec(content)) !== null) {
    const configBlock = match[1];
    const lineNumber = getLineNumber(content, match.index);
    
    const queryKeyMatch = configBlock.match(/queryKey:\s*\[([^\]]*)\]/);
    const queryKey = queryKeyMatch ? queryKeyMatch[1].trim() : undefined;
    
    const queryFnMatch = configBlock.match(/queryFn:\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{?([^,}]+)/);
    const endpoint = extractEndpointFromQueryFn(queryFnMatch ? queryFnMatch[1] : configBlock);
    
    const cacheConfig = extractCacheConfig(configBlock);
    
    patterns.push({
      type: 'useInfiniteQuery',
      hookName: 'useInfiniteQuery',
      lineNumber,
      codeSnippet: match[0].substring(0, 200),
      queryKey,
      endpoint,
      dependencies: [],
      cacheConfig
    });
  }
  
  return patterns;
}

/**
 * Extracts useEffect patterns that contain data fetching.
 */
function extractUseEffectDataPatterns(content: string): RawDataLoadPattern[] {
  const patterns: RawDataLoadPattern[] = [];
  
  // Match useEffect with fetch, axios, or service calls
  const effectRegex = /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\s*,\s*\[([^\]]*)\]/gs;
  let match: RegExpExecArray | null;
  
  while ((match = effectRegex.exec(content)) !== null) {
    const effectBody = match[1];
    const depsArray = match[2];
    const lineNumber = getLineNumber(content, match.index);
    
    // Check if this effect contains data fetching
    const hasFetch = /fetch\s*\(|axios\.|\.get\(|\.post\(|Service\.|service\./i.test(effectBody);
    const hasApiCall = /\/api\/|apiClient|applicationService|catalogService|adminDashboardService/i.test(effectBody);
    
    if (hasFetch || hasApiCall) {
      // Extract endpoint from the effect body
      const endpoint = extractEndpointFromEffectBody(effectBody);
      
      // Parse dependencies
      const dependencies = depsArray
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0);
      
      patterns.push({
        type: 'useEffect',
        hookName: 'useEffect',
        lineNumber,
        codeSnippet: match[0].substring(0, 300),
        endpoint,
        dependencies,
        cacheConfig: {}
      });
    }
  }
  
  return patterns;
}

/**
 * Extracts custom hook usage that may load data.
 */
function extractCustomHookPatterns(content: string): RawDataLoadPattern[] {
  const patterns: RawDataLoadPattern[] = [];
  
  // Find all hook usages (functions starting with 'use')
  const hookUsageRegex = /(?:const|let)\s+(?:\{[^}]+\}|\w+)\s*=\s*(use[A-Z][a-zA-Z0-9]*)\s*\(/g;
  let match: RegExpExecArray | null;
  
  while ((match = hookUsageRegex.exec(content)) !== null) {
    const hookName = match[1];
    const lineNumber = getLineNumber(content, match.index);
    
    // Skip React built-in hooks
    const builtInHooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'useDeferredValue', 'useTransition', 'useId', 'useSyncExternalStore', 'useInsertionEffect'];
    if (builtInHooks.includes(hookName)) {
      continue;
    }
    
    // Skip React Query hooks (already handled)
    if (['useQuery', 'useMutation', 'useInfiniteQuery', 'useQueryClient'].includes(hookName)) {
      continue;
    }
    
    // Check if it's a known data hook
    const knownHook = KNOWN_DATA_HOOKS[hookName];
    
    patterns.push({
      type: 'customHook',
      hookName,
      lineNumber,
      codeSnippet: match[0],
      endpoint: knownHook?.endpoint,
      dependencies: [],
      cacheConfig: {}
    });
  }
  
  return patterns;
}

/**
 * Extracts endpoint URL from a query function string.
 */
function extractEndpointFromQueryFn(queryFn: string): string | undefined {
  // Look for fetch('/api/...')
  const fetchMatch = queryFn.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (fetchMatch) {
    return fetchMatch[1];
  }
  
  // Look for axios.get('/api/...')
  const axiosMatch = queryFn.match(/axios\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (axiosMatch) {
    return axiosMatch[1];
  }
  
  // Look for service method calls
  const serviceMatch = queryFn.match(/(\w+Service|\w+Api)\.\w+/);
  if (serviceMatch) {
    return `service:${serviceMatch[1]}`;
  }
  
  // Look for direct API path strings
  const apiPathMatch = queryFn.match(/['"`](\/api\/[^'"`]+)['"`]/);
  if (apiPathMatch) {
    return apiPathMatch[1];
  }
  
  return undefined;
}

/**
 * Extracts endpoint from useEffect body.
 */
function extractEndpointFromEffectBody(body: string): string | undefined {
  // Look for fetch calls
  const fetchMatch = body.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (fetchMatch) {
    return fetchMatch[1];
  }
  
  // Look for service calls
  const serviceMatch = body.match(/(\w+Service|\w+Api)\.\w+/);
  if (serviceMatch) {
    return `service:${serviceMatch[1]}`;
  }
  
  // Look for API client calls
  const apiClientMatch = body.match(/apiClient\.\w+/);
  if (apiClientMatch) {
    return `apiClient:${apiClientMatch[0]}`;
  }
  
  // Look for direct API paths
  const apiPathMatch = body.match(/['"`](\/api\/[^'"`]+)['"`]/);
  if (apiPathMatch) {
    return apiPathMatch[1];
  }
  
  return 'unknown';
}

/**
 * Extracts cache configuration from a query config block.
 */
function extractCacheConfig(configBlock: string): RawDataLoadPattern['cacheConfig'] {
  const config: RawDataLoadPattern['cacheConfig'] = {};
  
  // Extract staleTime - handle expressions like pollingInterval / 2
  const staleTimeMatch = configBlock.match(/staleTime:\s*([^,}\n]+)/);
  if (staleTimeMatch) {
    const value = staleTimeMatch[1].trim();
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue)) {
      config.staleTime = numericValue;
    } else {
      // Store as expression if not a simple number
      config.staleTime = -1; // Indicates dynamic value
    }
  }
  
  // Extract cacheTime (or gcTime in newer versions)
  const cacheTimeMatch = configBlock.match(/(?:cacheTime|gcTime):\s*([^,}\n]+)/);
  if (cacheTimeMatch) {
    const value = cacheTimeMatch[1].trim();
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue)) {
      config.cacheTime = numericValue;
    }
  }
  
  // Extract refetchInterval
  const refetchIntervalMatch = configBlock.match(/refetchInterval:\s*([^,}\n]+)/);
  if (refetchIntervalMatch) {
    const value = refetchIntervalMatch[1].trim();
    // Could be a number, variable, or conditional expression
    if (value !== 'false' && value !== 'undefined') {
      config.staleTime = config.staleTime || -1; // Mark as having polling
    }
  }
  
  // Extract refetchOnWindowFocus
  const refetchWindowMatch = configBlock.match(/refetchOnWindowFocus:\s*(true|false)/);
  if (refetchWindowMatch) {
    config.refetchOnWindowFocus = refetchWindowMatch[1] === 'true';
  }
  
  // Extract refetchOnMount
  const refetchMountMatch = configBlock.match(/refetchOnMount:\s*(true|false|'always')/);
  if (refetchMountMatch) {
    config.refetchOnMount = refetchMountMatch[1] === 'true' || refetchMountMatch[1] === "'always'";
  }
  
  // Extract enabled condition
  const enabledMatch = configBlock.match(/enabled[,:]?\s*([^,}\n]+)/);
  if (enabledMatch) {
    const value = enabledMatch[1].trim();
    if (value && !value.startsWith('enabled') && value !== ',') {
      config.enabled = value;
    }
  }
  
  return config;
}

/**
 * Gets line number from character index in content.
 */
function getLineNumber(content: string, index: number): number {
  const beforeMatch = content.substring(0, index);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

/**
 * Converts cache config to a human-readable strategy string.
 */
function getCacheStrategy(config: RawDataLoadPattern['cacheConfig']): string {
  if (!config || Object.keys(config).length === 0) {
    return 'default';
  }
  
  const parts: string[] = [];
  
  if (config.staleTime !== undefined) {
    if (config.staleTime === 0) {
      parts.push('always-fresh');
    } else if (config.staleTime === -1) {
      parts.push('dynamic-stale');
    } else if (config.staleTime === Infinity || config.staleTime > 3600000) {
      parts.push('long-cache');
    } else if (config.staleTime > 0) {
      parts.push(`stale-${Math.round(config.staleTime / 1000)}s`);
    }
  }
  
  if (config.cacheTime !== undefined) {
    if (config.cacheTime > 0) {
      parts.push(`gc-${Math.round(config.cacheTime / 1000)}s`);
    }
  }
  
  if (config.refetchOnWindowFocus === false) {
    parts.push('no-refetch-focus');
  }
  
  if (config.refetchOnMount === false) {
    parts.push('no-refetch-mount');
  }
  
  if (config.enabled) {
    // Truncate long enabled conditions
    const enabledStr = config.enabled.length > 25 
      ? config.enabled.substring(0, 25) + '...'
      : config.enabled;
    parts.push(`conditional:${enabledStr}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'default';
}

/**
 * Converts raw patterns to DataLoadStep format.
 */
function convertToDataLoadSteps(patterns: RawDataLoadPattern[]): DataLoadStep[] {
  return patterns.map(pattern => ({
    hook: pattern.hookName,
    endpoint: pattern.endpoint || 'unknown',
    dependencies: pattern.dependencies || [],
    cacheStrategy: getCacheStrategy(pattern.cacheConfig)
  }));
}

/**
 * Traces data load paths in a single file.
 * 
 * @param filePath - Path to the file to analyze
 * @param projectRoot - Project root directory
 * @returns DataLoadTraceResult with all detected patterns
 */
export function traceDataLoadPath(filePath: string, projectRoot: string = process.cwd()): DataLoadTraceResult {
  const fullPath = path.join(projectRoot, filePath);
  const errors: string[] = [];
  const rawPatterns: RawDataLoadPattern[] = [];
  const customHooksUsed: string[] = [];
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        filePath,
        steps: [],
        rawPatterns: [],
        customHooksUsed: [],
        errors: [`File not found: ${filePath}`]
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    // Extract all patterns
    const useQueryPatterns = extractUseQueryPatterns(content, lines);
    const useMutationPatterns = extractUseMutationPatterns(content);
    const useInfiniteQueryPatterns = extractUseInfiniteQueryPatterns(content);
    const useEffectPatterns = extractUseEffectDataPatterns(content);
    const customHookPatterns = extractCustomHookPatterns(content);
    
    // Combine all patterns
    rawPatterns.push(
      ...useQueryPatterns,
      ...useMutationPatterns,
      ...useInfiniteQueryPatterns,
      ...useEffectPatterns,
      ...customHookPatterns
    );
    
    // Sort by line number
    rawPatterns.sort((a, b) => a.lineNumber - b.lineNumber);
    
    // Extract custom hook names
    customHookPatterns.forEach(p => {
      if (!customHooksUsed.includes(p.hookName)) {
        customHooksUsed.push(p.hookName);
      }
    });
    
    // Convert to DataLoadStep format
    const steps = convertToDataLoadSteps(rawPatterns);
    
    return {
      filePath,
      steps,
      rawPatterns,
      customHooksUsed,
      errors
    };
  } catch (error) {
    return {
      filePath,
      steps: [],
      rawPatterns: [],
      customHooksUsed: [],
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Traces data load paths for multiple files.
 * 
 * @param filePaths - Array of file paths to analyze
 * @param projectRoot - Project root directory
 * @returns Array of DataLoadTraceResult
 */
export function traceDataLoadPaths(filePaths: string[], projectRoot: string = process.cwd()): DataLoadTraceResult[] {
  return filePaths.map(filePath => traceDataLoadPath(filePath, projectRoot));
}

/**
 * Analyzes hook dependencies to determine load order.
 * Returns hooks sorted by their dependency chain.
 * 
 * @param steps - Data load steps to analyze
 * @returns Ordered array of hooks based on dependencies
 */
export function analyzeHookDependencies(steps: DataLoadStep[]): string[] {
  const hookOrder: string[] = [];
  const visited = new Set<string>();
  
  // Build dependency graph
  const dependencyMap = new Map<string, string[]>();
  steps.forEach(step => {
    dependencyMap.set(step.hook, step.dependencies);
  });
  
  // Topological sort
  function visit(hook: string) {
    if (visited.has(hook)) return;
    visited.add(hook);
    
    const deps = dependencyMap.get(hook) || [];
    deps.forEach(dep => {
      // Check if dependency is another hook
      const depHook = steps.find(s => s.hook === dep || s.endpoint.includes(dep));
      if (depHook) {
        visit(depHook.hook);
      }
    });
    
    hookOrder.push(hook);
  }
  
  steps.forEach(step => visit(step.hook));
  
  return hookOrder;
}

/**
 * Gets a summary of data loading for a file.
 * 
 * @param result - DataLoadTraceResult to summarize
 * @returns Human-readable summary string
 */
export function getDataLoadSummary(result: DataLoadTraceResult): string {
  const lines: string[] = [];
  
  lines.push(`File: ${result.filePath}`);
  lines.push(`Total data load patterns: ${result.steps.length}`);
  
  if (result.steps.length > 0) {
    lines.push('\nData Load Steps:');
    result.steps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step.hook}`);
      lines.push(`     Endpoint: ${step.endpoint}`);
      if (step.dependencies.length > 0) {
        lines.push(`     Dependencies: ${step.dependencies.join(', ')}`);
      }
      lines.push(`     Cache: ${step.cacheStrategy}`);
    });
  }
  
  if (result.customHooksUsed.length > 0) {
    lines.push(`\nCustom hooks used: ${result.customHooksUsed.join(', ')}`);
  }
  
  if (result.errors.length > 0) {
    lines.push(`\nErrors: ${result.errors.join(', ')}`);
  }
  
  return lines.join('\n');
}

// CLI execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2] || 'src/pages/student/Dashboard.tsx';
  
  console.log('Data Load Path Tracer');
  console.log('=====================');
  console.log(`Analyzing: ${testFile}`);
  console.log('');
  
  const result = traceDataLoadPath(testFile);
  console.log(getDataLoadSummary(result));
  
  if (result.rawPatterns.length > 0) {
    console.log('\n\nRaw Patterns Detected:');
    console.log('----------------------');
    result.rawPatterns.forEach((pattern, index) => {
      console.log(`\n${index + 1}. ${pattern.type} at line ${pattern.lineNumber}`);
      console.log(`   Hook: ${pattern.hookName}`);
      if (pattern.queryKey) {
        console.log(`   Query Key: ${pattern.queryKey}`);
      }
      if (pattern.endpoint) {
        console.log(`   Endpoint: ${pattern.endpoint}`);
      }
    });
  }
}
