/**
 * Contract Comparator
 * 
 * Compares frontend API calls to backend endpoints to detect mismatches.
 * Detects: MISSING_ENDPOINT, UNUSED_ENDPOINT, METHOD_MISMATCH, AUTH_MISMATCH
 * 
 * Validates: Requirements 1.2, 1.5, 1.6, 1.7
 * 
 * @module scripts/audit/contract/comparator
 */

import type { APICallInfo, EndpointInfo, ContractMismatch, ContractMismatchType } from '../types';

/**
 * Normalizes an endpoint path for comparison.
 * - Removes trailing slashes
 * - Handles DYNAMIC placeholders
 * - Extracts base path without query params
 */
function normalizeEndpointPath(endpoint: string): string {
  // Remove query string for base path comparison
  const basePath = endpoint.split('?')[0];
  
  // Remove trailing slash
  let normalized = basePath.replace(/\/$/, '');
  
  // Normalize DYNAMIC placeholders to a consistent format
  normalized = normalized.replace(/DYNAMIC/g, ':dynamic');
  
  return normalized.toLowerCase();
}

/**
 * Extracts the action parameter from an endpoint or query params.
 */
function extractAction(call: APICallInfo): string | undefined {
  // Check queryParams first
  if (call.queryParams?.action) {
    return call.queryParams.action;
  }
  
  // Check queryParams for type (catalog-style endpoints)
  if (call.queryParams?.type) {
    return call.queryParams.type;
  }
  
  // Try to extract from endpoint URL
  const actionMatch = call.endpoint.match(/[?&]action=([^&]+)/);
  if (actionMatch) {
    return actionMatch[1];
  }
  
  const typeMatch = call.endpoint.match(/[?&]type=([^&]+)/);
  if (typeMatch) {
    return typeMatch[1];
  }
  
  return undefined;
}

/**
 * Checks if a frontend call matches a backend endpoint.
 * Considers base path and action parameters.
 */
function endpointMatches(call: APICallInfo, endpoint: EndpointInfo): boolean {
  const callPath = normalizeEndpointPath(call.endpoint);
  const endpointPath = normalizeEndpointPath(endpoint.endpoint);
  
  // Check if base paths match
  if (callPath !== endpointPath) {
    // Handle dynamic segments - if endpoint has :dynamic, it can match any segment
    if (!endpointPath.includes(':dynamic')) {
      return false;
    }
    
    // Split paths and compare segments
    const callSegments = callPath.split('/');
    const endpointSegments = endpointPath.split('/');
    
    if (callSegments.length !== endpointSegments.length) {
      return false;
    }
    
    for (let i = 0; i < callSegments.length; i++) {
      if (endpointSegments[i] !== ':dynamic' && callSegments[i] !== endpointSegments[i]) {
        return false;
      }
    }
  }
  
  // If endpoint has actions, check if the call's action is supported
  const callAction = extractAction(call);
  if (callAction && callAction !== 'DYNAMIC' && endpoint.actions.length > 0) {
    // Check if the action is in the endpoint's supported actions
    return endpoint.actions.includes(callAction);
  }
  
  return true;
}

/**
 * Checks if the HTTP method is supported by the backend endpoint.
 */
function methodMatches(call: APICallInfo, endpoint: EndpointInfo): boolean {
  const supportedMethods = endpoint.method.split(',').map(m => m.trim().toUpperCase());
  return supportedMethods.includes(call.method.toUpperCase());
}


function getAuthMetadataForCall(call: APICallInfo, endpoint: EndpointInfo): {
  requiresAuth: boolean;
  roles?: string[];
  authOptional?: boolean;
} {
  const action = extractAction(call);
  const actionAuth = action ? endpoint.actionAuth?.[action] : undefined;

  if (actionAuth) {
    return actionAuth;
  }

  return {
    requiresAuth: endpoint.requiresAuth,
    roles: endpoint.roles,
  };
}

/**
 * Checks if auth requirements match between frontend and backend.
 */
function authMatches(call: APICallInfo, endpoint: EndpointInfo): boolean {
  const frontendExpectsAuth = call.authMechanism !== 'none';
  const backendAuth = getAuthMetadataForCall(call, endpoint);
  const backendRequiresAuth = backendAuth.requiresAuth;
  
  // Mismatch: Frontend doesn't send auth but backend requires it
  if (!frontendExpectsAuth && backendRequiresAuth) {
    return false;
  }
  
  // Note: Frontend sending auth to a public endpoint is OK (not a mismatch)
  return true;
}

/**
 * Generates evidence string for a mismatch.
 */
function generateMismatchEvidence(
  type: ContractMismatchType,
  call?: APICallInfo,
  endpoint?: EndpointInfo
): string {
  switch (type) {
    case 'MISSING_ENDPOINT':
      if (!call) return 'Frontend call has no matching backend endpoint';
      const action = extractAction(call);
      const actionInfo = action ? ` with action '${action}'` : '';
      return `Frontend calls ${call.method} ${call.endpoint}${actionInfo} at ${call.filePath}:${call.lineNumber}, but no matching backend endpoint exists`;
    
    case 'UNUSED_ENDPOINT':
      if (!endpoint) return 'Backend endpoint is never called by frontend';
      const actionsInfo = endpoint.actions.length > 0 
        ? ` (actions: ${endpoint.actions.join(', ')})` 
        : '';
      return `Backend endpoint ${endpoint.endpoint}${actionsInfo} defined in ${endpoint.filePath} is never called by frontend code`;
    
    case 'METHOD_MISMATCH':
      if (!call || !endpoint) return 'HTTP method mismatch between frontend and backend';
      return `Frontend uses ${call.method} for ${call.endpoint} at ${call.filePath}:${call.lineNumber}, but backend ${endpoint.endpoint} only supports ${endpoint.method}`;
    
    case 'AUTH_MISMATCH':
      if (!call || !endpoint) return 'Auth requirement mismatch between frontend and backend';
      const frontendAuth = call.authMechanism === 'none' ? 'no auth' : call.authMechanism;
      const backendAuthInfo = getAuthMetadataForCall(call, endpoint);
      const backendAuth = backendAuthInfo.requiresAuth
        ? (backendAuthInfo.roles ? `roles: ${backendAuthInfo.roles.join(', ')}` : 'authenticated')
        : (backendAuthInfo.authOptional ? 'optional auth' : 'public');
      return `Frontend sends ${frontendAuth} for ${call.endpoint} at ${call.filePath}:${call.lineNumber}, but backend requires ${backendAuth}`;
    
    default:
      return 'Unknown mismatch type';
  }
}

/**
 * Finds the best matching backend endpoint for a frontend call.
 * Returns undefined if no match is found.
 */
function findMatchingEndpoint(call: APICallInfo, endpoints: EndpointInfo[]): EndpointInfo | undefined {
  // First, try exact path match
  for (const endpoint of endpoints) {
    if (endpointMatches(call, endpoint)) {
      return endpoint;
    }
  }
  
  // Try matching just the base path (ignoring action)
  const callBasePath = normalizeEndpointPath(call.endpoint);
  for (const endpoint of endpoints) {
    const endpointBasePath = normalizeEndpointPath(endpoint.endpoint);
    if (callBasePath === endpointBasePath) {
      return endpoint;
    }
  }
  
  return undefined;
}

/**
 * Compares frontend API calls to backend endpoints and detects mismatches.
 * 
 * @param frontendCalls - Array of frontend API calls
 * @param backendEndpoints - Array of backend endpoint definitions
 * @returns Array of detected contract mismatches
 */
export function compareContracts(
  frontendCalls: APICallInfo[],
  backendEndpoints: EndpointInfo[]
): ContractMismatch[] {
  const mismatches: ContractMismatch[] = [];
  
  // Track which endpoints are used
  const usedEndpoints = new Set<string>();
  
  // Check each frontend call against backend endpoints
  for (const call of frontendCalls) {
    const matchingEndpoint = findMatchingEndpoint(call, backendEndpoints);
    
    if (!matchingEndpoint) {
      // MISSING_ENDPOINT: Frontend calls endpoint that doesn't exist
      mismatches.push({
        type: 'MISSING_ENDPOINT',
        frontendCall: call,
        evidence: generateMismatchEvidence('MISSING_ENDPOINT', call),
      });
      continue;
    }
    
    // Mark endpoint as used
    usedEndpoints.add(matchingEndpoint.endpoint);
    
    // Check for METHOD_MISMATCH
    if (!methodMatches(call, matchingEndpoint)) {
      mismatches.push({
        type: 'METHOD_MISMATCH',
        frontendCall: call,
        backendEndpoint: matchingEndpoint,
        evidence: generateMismatchEvidence('METHOD_MISMATCH', call, matchingEndpoint),
      });
    }
    
    // Check for AUTH_MISMATCH
    if (!authMatches(call, matchingEndpoint)) {
      mismatches.push({
        type: 'AUTH_MISMATCH',
        frontendCall: call,
        backendEndpoint: matchingEndpoint,
        evidence: generateMismatchEvidence('AUTH_MISMATCH', call, matchingEndpoint),
      });
    }
  }
  
  // Check for UNUSED_ENDPOINT: Backend endpoints never called by frontend
  for (const endpoint of backendEndpoints) {
    // Skip catch-all routes - they're meant to handle unmatched routes
    if (endpoint.endpoint.includes('[...path]')) {
      continue;
    }
    
    if (!usedEndpoints.has(endpoint.endpoint)) {
      mismatches.push({
        type: 'UNUSED_ENDPOINT',
        backendEndpoint: endpoint,
        evidence: generateMismatchEvidence('UNUSED_ENDPOINT', undefined, endpoint),
      });
    }
  }
  
  return mismatches;
}

/**
 * Groups mismatches by type for easier analysis.
 */
export function groupMismatchesByType(
  mismatches: ContractMismatch[]
): Record<ContractMismatchType, ContractMismatch[]> {
  const grouped: Record<ContractMismatchType, ContractMismatch[]> = {
    MISSING_ENDPOINT: [],
    UNUSED_ENDPOINT: [],
    METHOD_MISMATCH: [],
    SCHEMA_MISMATCH: [],
    AUTH_MISMATCH: [],
  };
  
  for (const mismatch of mismatches) {
    grouped[mismatch.type].push(mismatch);
  }
  
  return grouped;
}

/**
 * Gets summary statistics for contract comparison results.
 */
export function getComparisonSummary(
  frontendCalls: APICallInfo[],
  backendEndpoints: EndpointInfo[],
  mismatches: ContractMismatch[]
): {
  totalFrontendCalls: number;
  totalBackendEndpoints: number;
  totalMismatches: number;
  mismatchesByType: Record<ContractMismatchType, number>;
  matchedEndpoints: number;
  unmatchedCalls: number;
} {
  const grouped = groupMismatchesByType(mismatches);
  
  return {
    totalFrontendCalls: frontendCalls.length,
    totalBackendEndpoints: backendEndpoints.length,
    totalMismatches: mismatches.length,
    mismatchesByType: {
      MISSING_ENDPOINT: grouped.MISSING_ENDPOINT.length,
      UNUSED_ENDPOINT: grouped.UNUSED_ENDPOINT.length,
      METHOD_MISMATCH: grouped.METHOD_MISMATCH.length,
      SCHEMA_MISMATCH: grouped.SCHEMA_MISMATCH.length,
      AUTH_MISMATCH: grouped.AUTH_MISMATCH.length,
    },
    matchedEndpoints: backendEndpoints.length - grouped.UNUSED_ENDPOINT.length,
    unmatchedCalls: grouped.MISSING_ENDPOINT.length,
  };
}

// CLI entry point
if (import.meta.main) {
  // Import scanners dynamically to avoid circular dependencies
  const { scanFrontendAPICalls } = await import('./frontendScanner');
  const { scanBackendEndpoints } = await import('./backendScanner');
  
  const projectRoot = process.cwd();
  
  console.log('🔍 Running contract comparison...\n');
  
  const [frontendCalls, backendEndpoints] = await Promise.all([
    scanFrontendAPICalls(projectRoot),
    scanBackendEndpoints(projectRoot),
  ]);
  
  const mismatches = compareContracts(frontendCalls, backendEndpoints);
  const summary = getComparisonSummary(frontendCalls, backendEndpoints, mismatches);
  
  console.log('📊 Summary:');
  console.log(`   Frontend API calls: ${summary.totalFrontendCalls}`);
  console.log(`   Backend endpoints: ${summary.totalBackendEndpoints}`);
  console.log(`   Matched endpoints: ${summary.matchedEndpoints}`);
  console.log(`   Total mismatches: ${summary.totalMismatches}`);
  
  console.log('\n📈 Mismatches by Type:');
  for (const [type, count] of Object.entries(summary.mismatchesByType)) {
    if (count > 0) {
      console.log(`   ${type}: ${count}`);
    }
  }
  
  if (mismatches.length > 0) {
    const grouped = groupMismatchesByType(mismatches);
    
    if (grouped.MISSING_ENDPOINT.length > 0) {
      console.log('\n❌ MISSING_ENDPOINT:');
      for (const m of grouped.MISSING_ENDPOINT) {
        console.log(`   • ${m.evidence}`);
      }
    }
    
    if (grouped.UNUSED_ENDPOINT.length > 0) {
      console.log('\n⚠️  UNUSED_ENDPOINT:');
      for (const m of grouped.UNUSED_ENDPOINT) {
        console.log(`   • ${m.evidence}`);
      }
    }
    
    if (grouped.METHOD_MISMATCH.length > 0) {
      console.log('\n🔄 METHOD_MISMATCH:');
      for (const m of grouped.METHOD_MISMATCH) {
        console.log(`   • ${m.evidence}`);
      }
    }
    
    if (grouped.AUTH_MISMATCH.length > 0) {
      console.log('\n🔐 AUTH_MISMATCH:');
      for (const m of grouped.AUTH_MISMATCH) {
        console.log(`   • ${m.evidence}`);
      }
    }
  } else {
    console.log('\n✅ No contract mismatches detected!');
  }
}
