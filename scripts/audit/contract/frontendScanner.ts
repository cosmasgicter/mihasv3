/**
 * Frontend API Call Scanner
 * 
 * Scans frontend source files (services, hooks) for API calls and extracts
 * endpoint, method, headers, and auth mechanism information.
 * 
 * Validates: Requirements 1.1
 * 
 * @module scripts/audit/contract/frontendScanner
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { APICallInfo, HTTPMethod, AuthMechanism } from '../types';

/**
 * Directories to scan for API calls
 */
const SCAN_DIRECTORIES = [
  'src/services',
  'src/hooks',
  'src/lib/api',
];

/**
 * File extensions to scan
 */
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Regex patterns for detecting API calls
 */
const PATTERNS = {
  // apiClient.request('/endpoint', { method: 'POST', ... })
  // Also handles: apiClient.request(`/endpoint${query}`, ...)
  apiClientRequest: /apiClient\.request\s*(?:<[^>]*>)?\s*\(\s*(['"`])([^'"`\n]+)\1/g,
  
  // apiClient.request with template literal containing buildQueryString or variables
  apiClientRequestTemplate: /apiClient\.request\s*(?:<[^>]*>)?\s*\(\s*`([^`\n]+)`/g,
  
  // fetch('/api/...', { method: '...', ... })
  fetchCall: /fetch\s*\(\s*(['"`])([^'"`\n]+)\1(?:\s*,\s*\{([^}]*)\})?/g,
  
  // fetch(`/api/...`, { method: '...', ... }) - template literals
  fetchTemplateCall: /fetch\s*\(\s*`([^`\n]+)`(?:\s*,\s*\{([^}]*)\})?/g,
  
  // authFetch('/api/...', { method: '...', ... })
  authFetchCall: /authFetch\s*(?:<[^>]*>)?\s*\(\s*(['"`])([^'"`\n]+)\1(?:\s*,\s*\{([^}]*)\})?/g,
  
  // authFetch(`/api/...`, { method: '...', ... }) - template literals
  authFetchTemplateCall: /authFetch\s*(?:<[^>]*>)?\s*\(\s*`([^`\n]+)`(?:\s*,\s*\{([^}]*)\})?/g,
  
  // Method extraction from options object
  methodExtract: /method\s*:\s*['"`]?(GET|POST|PUT|DELETE|PATCH)['"`]?/i,
  
  // Headers extraction
  headersExtract: /headers\s*:\s*\{([^}]*)\}/,
  
  // Credentials extraction (for auth mechanism)
  credentialsExtract: /credentials\s*:\s*['"`]?(include|same-origin|omit)['"`]?/i,
  
  // Query params in URL
  queryParamsExtract: /\?([^'"`\s$]+)/,
  
  // Action parameter specifically
  actionParamExtract: /action=([^&'"`\s$]+)/,
};

/**
 * Extract HTTP method from options string
 */
function extractMethod(optionsStr: string | undefined): HTTPMethod {
  if (!optionsStr) return 'GET';
  
  const match = optionsStr.match(PATTERNS.methodExtract);
  if (match) {
    return match[1].toUpperCase() as HTTPMethod;
  }
  return 'GET';
}

/**
 * Extract headers from options string
 */
function extractHeaders(optionsStr: string | undefined): Record<string, string> {
  if (!optionsStr) return {};
  
  const match = optionsStr.match(PATTERNS.headersExtract);
  if (!match) return {};
  
  const headersStr = match[1];
  const headers: Record<string, string> = {};
  
  // Parse simple key-value pairs
  const headerPairs = headersStr.match(/['"`]?([^:,'"]+)['"`]?\s*:\s*['"`]?([^,'"]+)['"`]?/g);
  if (headerPairs) {
    for (const pair of headerPairs) {
      const [key, value] = pair.split(':').map(s => s.trim().replace(/['"`]/g, ''));
      if (key && value) {
        headers[key] = value;
      }
    }
  }
  
  return headers;
}

/**
 * Determine auth mechanism from options and context
 */
function extractAuthMechanism(optionsStr: string | undefined, isAuthFetch: boolean): AuthMechanism {
  // authFetch always uses cookies
  if (isAuthFetch) return 'cookie';
  
  if (!optionsStr) return 'none';
  
  // Check for credentials: 'include' which indicates cookie auth
  const credMatch = optionsStr.match(PATTERNS.credentialsExtract);
  if (credMatch && credMatch[1].toLowerCase() === 'include') {
    return 'cookie';
  }
  
  // Check for Authorization header
  if (optionsStr.includes('Authorization') || optionsStr.includes('Bearer')) {
    return 'bearer';
  }
  
  return 'none';
}

/**
 * Extract query parameters from endpoint URL
 */
function extractQueryParams(endpoint: string): Record<string, string> {
  const params: Record<string, string> = {};
  
  const queryMatch = endpoint.match(PATTERNS.queryParamsExtract);
  if (queryMatch) {
    const queryStr = queryMatch[1];
    const pairs = queryStr.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        // Handle dynamic values
        if (value && (value.includes('${') || value.includes('${'))) {
          params[key] = 'DYNAMIC';
        } else {
          params[key] = value || '';
        }
      }
    }
  }
  
  return params;
}

/**
 * Normalize endpoint path
 * - Adds /api prefix if missing
 * - Handles template literals with variables
 * - Cleans up malformed paths
 */
function normalizeEndpoint(endpoint: string): string {
  // Handle template literal variables
  let normalized = endpoint;
  
  // Replace ${...} with DYNAMIC placeholder
  normalized = normalized.replace(/\$\{[^}]+\}/g, 'DYNAMIC');
  
  // Clean up any trailing garbage from regex capture (e.g., ")}") 
  normalized = normalized.replace(/[)}\]]+$/, '');
  
  // Clean up double DYNAMIC
  normalized = normalized.replace(/DYNAMICDYNAMIC/g, 'DYNAMIC');
  
  // Clean up malformed query strings
  normalized = normalized.replace(/\?DYNAMIC$/, '');
  normalized = normalized.replace(/\?\$\{[^}]*\}$/, '');
  
  // Handle paths that start with a path segment directly followed by DYNAMIC (e.g., /applicationsDYNAMIC)
  // This happens when buildQueryString is appended: `/applications${buildQueryString(...)}`
  const pathDynamicMatch = normalized.match(/^\/([a-z-]+)DYNAMIC/i);
  if (pathDynamicMatch) {
    normalized = `/${pathDynamicMatch[1]}`;
  }
  
  // Add /api prefix if it's a relative path without it
  if (normalized.startsWith('/') && !normalized.startsWith('/api')) {
    // Check if it looks like an API path (e.g., /auth, /applications)
    const apiPaths = ['auth', 'admin', 'applications', 'catalog', 'documents', 'health', 'notifications', 'payments', 'sessions', 'monitoring', 'interview', 'user-consents', 'push-subscriptions'];
    const firstSegment = normalized.split('/')[1]?.split('?')[0];
    if (apiPaths.includes(firstSegment)) {
      normalized = `/api${normalized}`;
    }
  }
  
  return normalized;
}

/**
 * Get line number for a match in content
 */
function getLineNumber(content: string, matchIndex: number): number {
  const lines = content.substring(0, matchIndex).split('\n');
  return lines.length;
}

/**
 * Parse a single file for API calls
 */
async function parseFile(filePath: string, projectRoot: string): Promise<APICallInfo[]> {
  const calls: APICallInfo[] = [];
  const content = await readFile(filePath, 'utf-8');
  const relativePath = relative(projectRoot, filePath);
  
  // Track processed matches to avoid duplicates
  const processedMatches = new Set<string>();
  
  // Helper to add a call if not duplicate
  const addCall = (
    endpoint: string,
    method: HTTPMethod,
    headers: Record<string, string>,
    authMechanism: AuthMechanism,
    matchIndex: number,
    queryParams: Record<string, string>
  ) => {
    const lineNumber = getLineNumber(content, matchIndex);
    
    // Normalize the endpoint
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    
    // Skip invalid endpoints
    if (!normalizedEndpoint || normalizedEndpoint.length < 2) return;
    
    const key = `${relativePath}:${lineNumber}:${normalizedEndpoint}`;
    
    if (processedMatches.has(key)) return;
    processedMatches.add(key);
    
    // Only include API calls (skip external URLs)
    if (!normalizedEndpoint.startsWith('/api') && !normalizedEndpoint.startsWith('/')) return;
    if (normalizedEndpoint.startsWith('http://') || normalizedEndpoint.startsWith('https://')) return;
    
    calls.push({
      filePath: relativePath,
      lineNumber,
      endpoint: normalizedEndpoint,
      method,
      headers,
      authMechanism,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  };
  
  /**
   * Extract method from context around a match
   * Looks for method in the options object following the endpoint
   */
  const extractMethodFromContext = (matchIndex: number, defaultMethod: HTTPMethod = 'GET'): HTTPMethod => {
    // Look at the next 200 characters for method definition
    const contextAfter = content.substring(matchIndex, matchIndex + 300);
    const methodMatch = contextAfter.match(PATTERNS.methodExtract);
    if (methodMatch) {
      return methodMatch[1].toUpperCase() as HTTPMethod;
    }
    return defaultMethod;
  };
  
  // Pattern 1: apiClient.request() with string literal
  let match: RegExpExecArray | null;
  const apiClientPattern = new RegExp(PATTERNS.apiClientRequest.source, 'g');
  while ((match = apiClientPattern.exec(content)) !== null) {
    const endpoint = match[2];
    const method = extractMethodFromContext(match.index);
    const queryParams = extractQueryParams(endpoint);
    
    // apiClient always uses cookie auth (credentials: 'include')
    addCall(endpoint, method, {}, 'cookie', match.index, queryParams);
  }
  
  // Pattern 1b: apiClient.request() with template literal
  const apiClientTemplatePattern = new RegExp(PATTERNS.apiClientRequestTemplate.source, 'g');
  while ((match = apiClientTemplatePattern.exec(content)) !== null) {
    const endpoint = match[1];
    const method = extractMethodFromContext(match.index);
    const queryParams = extractQueryParams(endpoint);
    
    // apiClient always uses cookie auth (credentials: 'include')
    addCall(endpoint, method, {}, 'cookie', match.index, queryParams);
  }
  
  // Pattern 2: fetch() with string literal
  const fetchPattern = new RegExp(PATTERNS.fetchCall.source, 'g');
  while ((match = fetchPattern.exec(content)) !== null) {
    const endpoint = match[2];
    const optionsStr = match[3];
    
    // Skip non-API calls
    if (!endpoint.includes('/api') && !endpoint.startsWith('/')) continue;
    
    const method = extractMethod(optionsStr);
    const headers = extractHeaders(optionsStr);
    const authMechanism = extractAuthMechanism(optionsStr, false);
    const queryParams = extractQueryParams(endpoint);
    
    addCall(endpoint, method, headers, authMechanism, match.index, queryParams);
  }
  
  // Pattern 3: fetch() with template literal
  const fetchTemplatePattern = new RegExp(PATTERNS.fetchTemplateCall.source, 'g');
  while ((match = fetchTemplatePattern.exec(content)) !== null) {
    const endpoint = match[1];
    const optionsStr = match[2];
    
    // Skip non-API calls
    if (!endpoint.includes('/api') && !endpoint.startsWith('/')) continue;
    
    const method = extractMethod(optionsStr);
    const headers = extractHeaders(optionsStr);
    const authMechanism = extractAuthMechanism(optionsStr, false);
    const queryParams = extractQueryParams(endpoint);
    
    addCall(endpoint, method, headers, authMechanism, match.index, queryParams);
  }
  
  // Pattern 4: authFetch() with string literal
  const authFetchPattern = new RegExp(PATTERNS.authFetchCall.source, 'g');
  while ((match = authFetchPattern.exec(content)) !== null) {
    const endpoint = match[2];
    const optionsStr = match[3];
    const method = extractMethod(optionsStr);
    const headers = extractHeaders(optionsStr);
    const queryParams = extractQueryParams(endpoint);
    
    // authFetch always uses cookie auth
    addCall(endpoint, method, headers, 'cookie', match.index, queryParams);
  }
  
  // Pattern 5: authFetch() with template literal
  const authFetchTemplatePattern = new RegExp(PATTERNS.authFetchTemplateCall.source, 'g');
  while ((match = authFetchTemplatePattern.exec(content)) !== null) {
    const endpoint = match[1];
    const optionsStr = match[2];
    const method = extractMethod(optionsStr);
    const headers = extractHeaders(optionsStr);
    const queryParams = extractQueryParams(endpoint);
    
    // authFetch always uses cookie auth
    addCall(endpoint, method, headers, 'cookie', match.index, queryParams);
  }
  
  return calls;
}

/**
 * Recursively get all files in a directory
 */
async function getFilesRecursively(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await getFilesRecursively(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf('.'));
        if (SCAN_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist, skip
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Warning: Could not read directory ${dir}:`, error);
    }
  }
  
  return files;
}

/**
 * Scan frontend code for API calls
 * 
 * @param projectRoot - Root directory of the project
 * @returns Array of APICallInfo objects
 */
export async function scanFrontendAPICalls(projectRoot: string = process.cwd()): Promise<APICallInfo[]> {
  const allCalls: APICallInfo[] = [];
  
  for (const scanDir of SCAN_DIRECTORIES) {
    const fullDir = join(projectRoot, scanDir);
    const files = await getFilesRecursively(fullDir);
    
    for (const file of files) {
      try {
        const calls = await parseFile(file, projectRoot);
        allCalls.push(...calls);
      } catch (error) {
        console.warn(`Warning: Could not parse file ${file}:`, error);
      }
    }
  }
  
  // Sort by file path and line number for consistent output
  allCalls.sort((a, b) => {
    const pathCompare = a.filePath.localeCompare(b.filePath);
    if (pathCompare !== 0) return pathCompare;
    return a.lineNumber - b.lineNumber;
  });
  
  return allCalls;
}

/**
 * Get summary statistics for scanned API calls
 */
export function getAPIScanSummary(calls: APICallInfo[]): {
  totalCalls: number;
  byMethod: Record<HTTPMethod, number>;
  byAuthMechanism: Record<AuthMechanism, number>;
  uniqueEndpoints: string[];
  filesScanned: number;
} {
  const byMethod: Record<HTTPMethod, number> = {
    GET: 0,
    POST: 0,
    PUT: 0,
    DELETE: 0,
    PATCH: 0,
  };
  
  const byAuthMechanism: Record<AuthMechanism, number> = {
    cookie: 0,
    bearer: 0,
    none: 0,
  };
  
  const endpoints = new Set<string>();
  const files = new Set<string>();
  
  for (const call of calls) {
    byMethod[call.method]++;
    byAuthMechanism[call.authMechanism]++;
    endpoints.add(call.endpoint);
    files.add(call.filePath);
  }
  
  return {
    totalCalls: calls.length,
    byMethod,
    byAuthMechanism,
    uniqueEndpoints: Array.from(endpoints).sort(),
    filesScanned: files.size,
  };
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();
  
  console.log('🔍 Scanning frontend for API calls...\n');
  
  scanFrontendAPICalls(projectRoot)
    .then(calls => {
      const summary = getAPIScanSummary(calls);
      
      console.log('📊 Summary:');
      console.log(`   Total API calls found: ${summary.totalCalls}`);
      console.log(`   Files scanned: ${summary.filesScanned}`);
      console.log(`   Unique endpoints: ${summary.uniqueEndpoints.length}`);
      console.log('\n📈 By HTTP Method:');
      for (const [method, count] of Object.entries(summary.byMethod)) {
        if (count > 0) console.log(`   ${method}: ${count}`);
      }
      console.log('\n🔐 By Auth Mechanism:');
      for (const [auth, count] of Object.entries(summary.byAuthMechanism)) {
        if (count > 0) console.log(`   ${auth}: ${count}`);
      }
      
      console.log('\n📋 API Calls:');
      for (const call of calls) {
        console.log(`\n   ${call.filePath}:${call.lineNumber}`);
        console.log(`   └─ ${call.method} ${call.endpoint}`);
        console.log(`      Auth: ${call.authMechanism}`);
        if (call.queryParams) {
          console.log(`      Params: ${JSON.stringify(call.queryParams)}`);
        }
      }
    })
    .catch(error => {
      console.error('Error scanning frontend:', error);
      process.exit(1);
    });
}
