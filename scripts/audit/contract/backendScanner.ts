/**
 * Backend Endpoint Scanner
 * 
 * Scans api-src/ directory for endpoint definitions and extracts
 * actions from switch statements, auth requirements from middleware usage.
 * 
 * Validates: Requirements 1.2
 * 
 * @module scripts/audit/contract/backendScanner
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import type { EndpointInfo } from '../types';

/**
 * Directory containing backend endpoint source files
 */
const API_SRC_DIRECTORY = 'api-src';

/**
 * File extensions to scan
 */
const SCAN_EXTENSIONS = ['.ts'];

/**
 * Files to skip (not actual endpoints)
 */
const SKIP_FILES = [
  'tsconfig.json',
  '_auth.ts.legacy',
];

/**
 * Regex patterns for extracting endpoint information
 */
const PATTERNS = {
  // case 'action': patterns in switch statements
  // Matches: case 'login':, case "logout":, case `refresh`:
  // Excludes HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD)
  switchCase: /case\s+['"`]([^'"`]+)['"`]\s*:/g,
  
  // HTTP methods to filter out from actions
  httpMethods: /^(GET|POST|PUT|DELETE|PATCH|HEAD)$/i,
  
  // requireAuth(req) calls - indicates auth is required
  requireAuth: /requireAuth\s*\(\s*req\s*\)/,
  
  // requireRole(req, ['admin', 'super_admin']) calls
  // Captures the roles array
  requireRole: /requireRole\s*\(\s*req\s*,\s*\[([^\]]+)\]\s*\)/,
  
  // getUserFromRequest pattern (also indicates auth)
  getUserFromRequest: /getUserFromRequest\s*\(\s*req\s*\)/,
  
  // getAuthUser(req) pattern - indicates auth is required
  getAuthUser: /getAuthUser\s*\(\s*req\s*\)/,
  
  // Auth check pattern: if (!user) return sendError(...UNAUTHORIZED)
  authCheckPattern: /if\s*\(\s*!user\s*\)[\s\S]{0,100}UNAUTHORIZED/,
  
  // withArcjetProtection export pattern
  arcjetProtection: /withArcjetProtection\s*\(\s*handler\s*,\s*['"`]([^'"`]+)['"`]\s*\)/,
  
  // Action query parameter extraction
  actionQuery: /const\s+action\s*=\s*req\.query\.action/,
  
  // Type query parameter extraction (for catalog-style endpoints)
  typeQuery: /const\s+type\s*=\s*req\.query\.type/,
  
  // if (type === 'xxx') patterns
  typeCondition: /if\s*\(\s*type\s*===?\s*['"`]([^'"`]+)['"`]\s*\)/g,
  
  // if (action === 'xxx') patterns (alternative to switch)
  actionCondition: /if\s*\(\s*action\s*===?\s*['"`]([^'"`]+)['"`]\s*\)/g,
  
  // Default action in switch
  defaultAction: /default\s*:/,
};

/**
 * Extract actions from switch statements in file content
 */
function extractActions(content: string): string[] {
  const actions: string[] = [];
  const seen = new Set<string>();
  
  // Reset regex lastIndex
  PATTERNS.switchCase.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.switchCase.exec(content)) !== null) {
    const action = match[1];
    // Filter out HTTP methods (they appear in nested switch statements)
    if (!seen.has(action) && !PATTERNS.httpMethods.test(action)) {
      seen.add(action);
      actions.push(action);
    }
  }
  
  // Also check for type-based routing (like catalog.ts)
  if (PATTERNS.typeQuery.test(content)) {
    PATTERNS.typeCondition.lastIndex = 0;
    while ((match = PATTERNS.typeCondition.exec(content)) !== null) {
      const typeAction = match[1];
      if (!seen.has(typeAction) && !PATTERNS.httpMethods.test(typeAction)) {
        seen.add(typeAction);
        actions.push(typeAction);
      }
    }
  }
  
  // Also check for action-based if conditions (like applications.ts)
  if (PATTERNS.actionQuery.test(content)) {
    PATTERNS.actionCondition.lastIndex = 0;
    while ((match = PATTERNS.actionCondition.exec(content)) !== null) {
      const actionValue = match[1];
      if (!seen.has(actionValue) && !PATTERNS.httpMethods.test(actionValue)) {
        seen.add(actionValue);
        actions.push(actionValue);
      }
    }
  }
  
  return actions;
}

/**
 * Extract roles from requireRole middleware usage
 */
function extractRoles(content: string): string[] | undefined {
  const match = content.match(PATTERNS.requireRole);
  if (!match) return undefined;
  
  // Parse the roles array: ['admin', 'super_admin']
  const rolesStr = match[1];
  const roles: string[] = [];
  
  // Extract individual role strings
  const roleMatches = rolesStr.matchAll(/['"`]([^'"`]+)['"`]/g);
  for (const roleMatch of roleMatches) {
    roles.push(roleMatch[1]);
  }
  
  return roles.length > 0 ? roles : undefined;
}

/**
 * Determine if authentication is required for the endpoint
 */
function detectAuthRequired(content: string): boolean {
  // Check for requireAuth middleware
  if (PATTERNS.requireAuth.test(content)) {
    return true;
  }
  
  // Check for requireRole middleware (implies auth)
  if (PATTERNS.requireRole.test(content)) {
    return true;
  }
  
  // Check for getUserFromRequest pattern
  if (PATTERNS.getUserFromRequest.test(content)) {
    return true;
  }
  
  // Check for getAuthUser pattern with UNAUTHORIZED check
  if (PATTERNS.getAuthUser.test(content) && PATTERNS.authCheckPattern.test(content)) {
    return true;
  }
  
  return false;
}

/**
 * Derive endpoint path from filename
 * e.g., auth.ts -> /api/auth
 *       [...path].ts -> /api/[...path]
 */
function deriveEndpoint(filename: string): string {
  // Remove .ts extension
  const name = filename.replace(/\.ts$/, '');
  
  // Handle catch-all route
  if (name === '[...path]') {
    return '/api/[...path]';
  }
  
  return `/api/${name}`;
}

/**
 * Determine supported HTTP methods from file content
 * Most endpoints support both GET and POST
 */
function detectMethods(content: string): string {
  const methods: string[] = [];
  
  // Check for explicit method checks
  if (content.includes("req.method === 'GET'") || content.includes('req.method !== \'GET\'')) {
    methods.push('GET');
  }
  if (content.includes("req.method === 'POST'") || content.includes('req.method !== \'POST\'')) {
    methods.push('POST');
  }
  if (content.includes("req.method === 'PUT'") || content.includes('req.method !== \'PUT\'')) {
    methods.push('PUT');
  }
  if (content.includes("req.method === 'DELETE'") || content.includes('req.method !== \'DELETE\'')) {
    methods.push('DELETE');
  }
  if (content.includes("req.method === 'PATCH'") || content.includes('req.method !== \'PATCH\'')) {
    methods.push('PATCH');
  }
  
  // If no specific methods detected, assume GET and POST (common pattern)
  if (methods.length === 0) {
    return 'GET,POST';
  }
  
  return methods.join(',');
}

/**
 * Parse a single backend file for endpoint information
 */
async function parseFile(filePath: string, projectRoot: string): Promise<EndpointInfo | null> {
  const content = await readFile(filePath, 'utf-8');
  const relativePath = relative(projectRoot, filePath);
  const filename = basename(filePath);
  
  // Skip non-endpoint files
  if (SKIP_FILES.includes(filename)) {
    return null;
  }
  
  // Derive endpoint from filename
  const endpoint = deriveEndpoint(filename);
  
  // Extract actions from switch statements
  const actions = extractActions(content);
  
  // Detect auth requirements
  const requiresAuth = detectAuthRequired(content);
  
  // Extract roles if requireRole is used
  const roles = extractRoles(content);
  
  // Detect supported methods
  const method = detectMethods(content);
  
  return {
    filePath: relativePath,
    endpoint,
    method,
    actions,
    requiresAuth,
    roles,
  };
}

/**
 * Scan backend api-src/ directory for endpoint definitions
 * 
 * @param projectRoot - Root directory of the project
 * @returns Array of EndpointInfo objects
 */
export async function scanBackendEndpoints(projectRoot: string = process.cwd()): Promise<EndpointInfo[]> {
  const endpoints: EndpointInfo[] = [];
  const apiSrcDir = join(projectRoot, API_SRC_DIRECTORY);
  
  try {
    const entries = await readdir(apiSrcDir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Only process TypeScript files
      if (!entry.isFile()) continue;
      
      const ext = entry.name.substring(entry.name.lastIndexOf('.'));
      if (!SCAN_EXTENSIONS.includes(ext)) continue;
      
      const fullPath = join(apiSrcDir, entry.name);
      
      try {
        const endpointInfo = await parseFile(fullPath, projectRoot);
        if (endpointInfo) {
          endpoints.push(endpointInfo);
        }
      } catch (error) {
        console.warn(`Warning: Could not parse file ${entry.name}:`, error);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Warning: api-src directory not found at ${apiSrcDir}`);
    } else {
      throw error;
    }
  }
  
  // Sort by endpoint path for consistent output
  endpoints.sort((a, b) => a.endpoint.localeCompare(b.endpoint));
  
  return endpoints;
}

/**
 * Get summary statistics for scanned backend endpoints
 */
export function getBackendScanSummary(endpoints: EndpointInfo[]): {
  totalEndpoints: number;
  totalActions: number;
  authRequired: number;
  roleProtected: number;
  endpointsByAuth: { public: string[]; authenticated: string[]; roleProtected: string[] };
} {
  let totalActions = 0;
  let authRequired = 0;
  let roleProtected = 0;
  
  const publicEndpoints: string[] = [];
  const authenticatedEndpoints: string[] = [];
  const roleProtectedEndpoints: string[] = [];
  
  for (const endpoint of endpoints) {
    totalActions += endpoint.actions.length;
    
    if (endpoint.roles && endpoint.roles.length > 0) {
      roleProtected++;
      roleProtectedEndpoints.push(endpoint.endpoint);
    } else if (endpoint.requiresAuth) {
      authRequired++;
      authenticatedEndpoints.push(endpoint.endpoint);
    } else {
      publicEndpoints.push(endpoint.endpoint);
    }
  }
  
  return {
    totalEndpoints: endpoints.length,
    totalActions,
    authRequired,
    roleProtected,
    endpointsByAuth: {
      public: publicEndpoints,
      authenticated: authenticatedEndpoints,
      roleProtected: roleProtectedEndpoints,
    },
  };
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();
  
  console.log('🔍 Scanning backend for endpoint definitions...\n');
  
  scanBackendEndpoints(projectRoot)
    .then(endpoints => {
      const summary = getBackendScanSummary(endpoints);
      
      console.log('📊 Summary:');
      console.log(`   Total endpoints found: ${summary.totalEndpoints}`);
      console.log(`   Total actions: ${summary.totalActions}`);
      console.log(`   Auth required: ${summary.authRequired}`);
      console.log(`   Role protected: ${summary.roleProtected}`);
      
      console.log('\n🔓 Public Endpoints:');
      for (const ep of summary.endpointsByAuth.public) {
        console.log(`   ${ep}`);
      }
      
      console.log('\n🔐 Authenticated Endpoints:');
      for (const ep of summary.endpointsByAuth.authenticated) {
        console.log(`   ${ep}`);
      }
      
      console.log('\n👑 Role-Protected Endpoints:');
      for (const ep of summary.endpointsByAuth.roleProtected) {
        console.log(`   ${ep}`);
      }
      
      console.log('\n📋 Endpoint Details:');
      for (const endpoint of endpoints) {
        console.log(`\n   ${endpoint.filePath}`);
        console.log(`   └─ ${endpoint.endpoint}`);
        console.log(`      Methods: ${endpoint.method}`);
        console.log(`      Actions: ${endpoint.actions.length > 0 ? endpoint.actions.join(', ') : '(none)'}`);
        console.log(`      Auth: ${endpoint.requiresAuth ? 'required' : 'public'}`);
        if (endpoint.roles) {
          console.log(`      Roles: ${endpoint.roles.join(', ')}`);
        }
      }
    })
    .catch(error => {
      console.error('Error scanning backend:', error);
      process.exit(1);
    });
}
