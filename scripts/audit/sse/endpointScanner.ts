/**
 * SSE Endpoint Scanner
 * 
 * Scans api-src/ directory for SSE response patterns and extracts
 * event types and auth requirements.
 * 
 * Validates: Requirements 5.1
 * 
 * @module scripts/audit/sse/endpointScanner
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import type { SSEEndpoint } from '../types';

/**
 * Directories to scan for SSE patterns
 */
const SCAN_DIRECTORIES = ['api-src', 'lib'];

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
 * Regex patterns for detecting SSE implementations
 */
const PATTERNS = {
  // Content-Type: text/event-stream header
  sseContentType: /['"`]text\/event-stream['"`]/,
  
  // res.setHeader("Content-Type", "text/event-stream")
  setHeaderSSE: /res\.setHeader\s*\(\s*['"`]Content-Type['"`]\s*,\s*['"`]text\/event-stream['"`]\s*\)/,
  
  // res.write patterns for SSE events
  // Matches: res.write(`event: ${type}\n`), res.write('event: ping\n')
  resWriteEvent: /res\.write\s*\(\s*[`'"](?:event:|data:|id:)/,
  
  // EventSource usage (typically frontend, but might be in tests)
  eventSource: /new\s+EventSource\s*\(/,
  
  // SSE event type definitions
  // Matches: type: "application_update", event: 'notification'
  eventTypeDefinition: /(?:type|event)\s*:\s*['"`]([a-z_]+)['"`]/gi,
  
  // SSEEventType type definition
  sseEventTypeEnum: /type\s+SSEEventType\s*=[\s\S]*?;/,
  
  // Individual event types from union type
  // Matches: | "application_update" or "notification"
  eventTypeUnion: /['"`]([a-z_]+)['"`]/g,
  
  // sendSSEEvent function calls
  sendSSEEvent: /sendSSEEvent\s*\(\s*res\s*,\s*\{[\s\S]*?type\s*:\s*['"`]([^'"`]+)['"`]/g,
  
  // broadcastToUser/broadcastToAll function calls
  broadcastFunction: /broadcast(?:ToUser|ToAll|ApplicationUpdate|Notification|PaymentUpdate|InterviewScheduled|DocumentProcessed)\s*\(/g,
  
  // initializeSSE function
  initializeSSE: /initializeSSE\s*\(/,
  
  // handleSSEConnection function
  handleSSEConnection: /handleSSEConnection\s*\(/,
  
  // requireAuth(req) calls - indicates auth is required
  requireAuth: /requireAuth\s*\(\s*req\s*\)/,
  
  // requireRole(req, [...]) calls
  requireRole: /requireRole\s*\(\s*req\s*,\s*\[/,
  
  // getAuthUser(req) pattern - indicates auth is required
  getAuthUser: /getAuthUser\s*\(\s*req\s*\)/,
  
  // userId parameter in SSE functions (indicates auth required)
  userIdParam: /(?:initializeSSE|handleSSEConnection|broadcastToUser)\s*\([^)]*userId/,
  
  // Export of SSE-related functions
  sseExport: /export\s+(?:function|const|async\s+function)\s+((?:send|broadcast|initialize|handle)(?:SSE|To|Application|Notification|Payment|Interview|Document)[A-Za-z]*)/g,
};

/**
 * Extract event types from SSEEventType union definition
 */
function extractEventTypesFromUnion(content: string): string[] {
  const events: string[] = [];
  const seen = new Set<string>();
  
  // Find SSEEventType definition
  const typeMatch = content.match(PATTERNS.sseEventTypeEnum);
  if (typeMatch) {
    const typeDefinition = typeMatch[0];
    
    // Extract individual event types
    PATTERNS.eventTypeUnion.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PATTERNS.eventTypeUnion.exec(typeDefinition)) !== null) {
      const eventType = match[1];
      if (!seen.has(eventType)) {
        seen.add(eventType);
        events.push(eventType);
      }
    }
  }
  
  return events;
}

/**
 * Extract event types from sendSSEEvent calls
 */
function extractEventTypesFromCalls(content: string): string[] {
  const events: string[] = [];
  const seen = new Set<string>();
  
  // Reset regex lastIndex
  PATTERNS.sendSSEEvent.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.sendSSEEvent.exec(content)) !== null) {
    const eventType = match[1];
    if (!seen.has(eventType)) {
      seen.add(eventType);
      events.push(eventType);
    }
  }
  
  // Also check for event type definitions in object literals
  PATTERNS.eventTypeDefinition.lastIndex = 0;
  while ((match = PATTERNS.eventTypeDefinition.exec(content)) !== null) {
    const eventType = match[1];
    // Filter out common non-event values
    if (!seen.has(eventType) && 
        !['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined'].includes(eventType)) {
      seen.add(eventType);
      events.push(eventType);
    }
  }
  
  return events;
}

/**
 * Detect if authentication is required for SSE endpoint
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
  
  // Check for getAuthUser pattern
  if (PATTERNS.getAuthUser.test(content)) {
    return true;
  }
  
  // Check for userId parameter in SSE functions
  if (PATTERNS.userIdParam.test(content)) {
    return true;
  }
  
  return false;
}

/**
 * Derive endpoint path from filename and directory
 * e.g., api-src/notifications.ts -> /api/notifications
 *       lib/realtime.ts -> /lib/realtime (utility, not direct endpoint)
 */
function deriveEndpoint(filePath: string, directory: string): string {
  const filename = basename(filePath).replace(/\.ts$/, '');
  
  if (directory === 'api-src') {
    // Handle catch-all route
    if (filename === '[...path]') {
      return '/api/[...path]';
    }
    return `/api/${filename}`;
  }
  
  // For lib files, indicate it's a utility module
  return `/${directory}/${filename}`;
}

/**
 * Check if file contains SSE patterns
 */
function hasSSEPatterns(content: string): boolean {
  return (
    PATTERNS.sseContentType.test(content) ||
    PATTERNS.setHeaderSSE.test(content) ||
    PATTERNS.resWriteEvent.test(content) ||
    PATTERNS.initializeSSE.test(content) ||
    PATTERNS.handleSSEConnection.test(content) ||
    PATTERNS.sseEventTypeEnum.test(content)
  );
}

/**
 * Parse a single file for SSE endpoint information
 */
async function parseFile(
  filePath: string, 
  projectRoot: string,
  directory: string
): Promise<SSEEndpoint | null> {
  const content = await readFile(filePath, 'utf-8');
  const relativePath = relative(projectRoot, filePath);
  const filename = basename(filePath);
  
  // Skip non-endpoint files
  if (SKIP_FILES.includes(filename)) {
    return null;
  }
  
  // Check if file contains SSE patterns
  if (!hasSSEPatterns(content)) {
    return null;
  }
  
  // Derive endpoint from filename
  const endpoint = deriveEndpoint(filePath, directory);
  
  // Extract event types
  const eventsFromUnion = extractEventTypesFromUnion(content);
  const eventsFromCalls = extractEventTypesFromCalls(content);
  
  // Combine and deduplicate events
  const allEvents = [...new Set([...eventsFromUnion, ...eventsFromCalls])];
  
  // Detect auth requirements
  const requiresAuth = detectAuthRequired(content);
  
  return {
    path: endpoint,
    filePath: relativePath,
    events: allEvents,
    requiresAuth,
  };
}

/**
 * Scan a directory for SSE endpoint definitions
 */
async function scanDirectory(
  projectRoot: string,
  directory: string
): Promise<SSEEndpoint[]> {
  const endpoints: SSEEndpoint[] = [];
  const dirPath = join(projectRoot, directory);
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Only process TypeScript files
      if (!entry.isFile()) continue;
      
      const ext = entry.name.substring(entry.name.lastIndexOf('.'));
      if (!SCAN_EXTENSIONS.includes(ext)) continue;
      
      const fullPath = join(dirPath, entry.name);
      
      try {
        const endpointInfo = await parseFile(fullPath, projectRoot, directory);
        if (endpointInfo) {
          endpoints.push(endpointInfo);
        }
      } catch (error) {
        console.warn(`Warning: Could not parse file ${entry.name}:`, error);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Warning: Directory not found at ${dirPath}`);
    } else {
      throw error;
    }
  }
  
  return endpoints;
}

/**
 * Scan api-src/ and lib/ directories for SSE endpoint definitions
 * 
 * @param projectRoot - Root directory of the project
 * @returns Array of SSEEndpoint objects
 */
export async function scanSSEEndpoints(projectRoot: string = process.cwd()): Promise<SSEEndpoint[]> {
  const allEndpoints: SSEEndpoint[] = [];
  
  for (const directory of SCAN_DIRECTORIES) {
    const endpoints = await scanDirectory(projectRoot, directory);
    allEndpoints.push(...endpoints);
  }
  
  // Sort by path for consistent output
  allEndpoints.sort((a, b) => a.path.localeCompare(b.path));
  
  return allEndpoints;
}

/**
 * Get summary statistics for scanned SSE endpoints
 */
export function getSSEScanSummary(endpoints: SSEEndpoint[]): {
  totalEndpoints: number;
  totalEvents: number;
  uniqueEvents: string[];
  authRequired: number;
  publicEndpoints: number;
  endpointsByLocation: { apiSrc: SSEEndpoint[]; lib: SSEEndpoint[] };
} {
  const allEvents = new Set<string>();
  let authRequired = 0;
  let publicEndpoints = 0;
  
  const apiSrcEndpoints: SSEEndpoint[] = [];
  const libEndpoints: SSEEndpoint[] = [];
  
  for (const endpoint of endpoints) {
    // Collect unique events
    endpoint.events.forEach(event => allEvents.add(event));
    
    // Count auth requirements
    if (endpoint.requiresAuth) {
      authRequired++;
    } else {
      publicEndpoints++;
    }
    
    // Categorize by location
    if (endpoint.filePath.startsWith('api-src/')) {
      apiSrcEndpoints.push(endpoint);
    } else if (endpoint.filePath.startsWith('lib/')) {
      libEndpoints.push(endpoint);
    }
  }
  
  return {
    totalEndpoints: endpoints.length,
    totalEvents: allEvents.size,
    uniqueEvents: Array.from(allEvents).sort(),
    authRequired,
    publicEndpoints,
    endpointsByLocation: {
      apiSrc: apiSrcEndpoints,
      lib: libEndpoints,
    },
  };
}

/**
 * Check if an endpoint is an actual API endpoint vs utility module
 */
export function isAPIEndpoint(endpoint: SSEEndpoint): boolean {
  return endpoint.path.startsWith('/api/');
}

/**
 * Check if an endpoint is a utility/library module
 */
export function isUtilityModule(endpoint: SSEEndpoint): boolean {
  return endpoint.path.startsWith('/lib/');
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();
  
  console.log('🔍 Scanning for SSE endpoint definitions...\n');
  
  scanSSEEndpoints(projectRoot)
    .then(endpoints => {
      const summary = getSSEScanSummary(endpoints);
      
      console.log('📊 Summary:');
      console.log(`   Total SSE implementations found: ${summary.totalEndpoints}`);
      console.log(`   Unique event types: ${summary.totalEvents}`);
      console.log(`   Auth required: ${summary.authRequired}`);
      console.log(`   Public: ${summary.publicEndpoints}`);
      
      if (summary.uniqueEvents.length > 0) {
        console.log('\n📡 Event Types Found:');
        for (const event of summary.uniqueEvents) {
          console.log(`   • ${event}`);
        }
      }
      
      if (summary.endpointsByLocation.apiSrc.length > 0) {
        console.log('\n🌐 API Endpoints with SSE:');
        for (const ep of summary.endpointsByLocation.apiSrc) {
          console.log(`   ${ep.path}`);
          console.log(`      File: ${ep.filePath}`);
          console.log(`      Events: ${ep.events.length > 0 ? ep.events.join(', ') : '(none detected)'}`);
          console.log(`      Auth: ${ep.requiresAuth ? 'required' : 'public'}`);
        }
      }
      
      if (summary.endpointsByLocation.lib.length > 0) {
        console.log('\n📚 SSE Utility Modules:');
        for (const ep of summary.endpointsByLocation.lib) {
          console.log(`   ${ep.path}`);
          console.log(`      File: ${ep.filePath}`);
          console.log(`      Events: ${ep.events.length > 0 ? ep.events.join(', ') : '(none detected)'}`);
          console.log(`      Auth: ${ep.requiresAuth ? 'required' : 'public'}`);
        }
      }
      
      if (endpoints.length === 0) {
        console.log('\n⚠️  No SSE implementations found in api-src/ or lib/');
        console.log('   This may indicate SSE is not yet implemented or uses different patterns.');
      }
      
      console.log('\n📋 Detailed Results:');
      for (const endpoint of endpoints) {
        console.log(`\n   ${endpoint.filePath}`);
        console.log(`   └─ ${endpoint.path}`);
        console.log(`      Events: ${endpoint.events.length > 0 ? endpoint.events.join(', ') : '(none)'}`);
        console.log(`      Auth: ${endpoint.requiresAuth ? 'required' : 'public'}`);
      }
    })
    .catch(error => {
      console.error('Error scanning for SSE endpoints:', error);
      process.exit(1);
    });
}
