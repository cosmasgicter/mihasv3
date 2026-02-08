/**
 * SSE Implementation Report Generator
 * 
 * Generates a comprehensive Markdown report of SSE implementation analysis,
 * including endpoint/listener mapping, gaps, and recommendations.
 * 
 * Validates: Requirements 5.1-5.10
 * 
 * @module scripts/audit/sse/reportGenerator
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { SSEEndpoint, SSEListener, SSEAuditResult } from '../types';
import { scanSSEEndpoints, getSSEScanSummary, isAPIEndpoint, isUtilityModule } from './endpointScanner';
import { scanSSEListeners, getMissingReconnect, getMissingBackoff, getSSEListenerSummary } from './listenerScanner';

const DEFAULT_OUTPUT_PATH = 'forensic_reports/sse-implementation-report.md';

/**
 * Features that should use SSE for real-time updates
 */
const EXPECTED_SSE_FEATURES = [
  { name: 'Notifications', eventType: 'notification', description: 'Real-time notification updates for students' },
  { name: 'Application Status', eventType: 'application_update', description: 'Application status change notifications' },
  { name: 'Admin Dashboard', eventType: 'admin_update', description: 'Real-time admin dashboard statistics' },
  { name: 'Payment Updates', eventType: 'payment_update', description: 'Payment status notifications' },
  { name: 'Interview Scheduling', eventType: 'interview_scheduled', description: 'Interview schedule notifications' },
  { name: 'Document Processing', eventType: 'document_processed', description: 'Document OCR/processing status' },
];

/**
 * Report metadata
 */
interface ReportMetadata {
  timestamp: string;
  version: string;
  projectRoot: string;
}

/**
 * Combined SSE audit data
 */
interface CombinedSSEAuditData {
  endpoints: SSEEndpoint[];
  listeners: SSEListener[];
  endpointSummary: ReturnType<typeof getSSEScanSummary>;
  listenerSummary: ReturnType<typeof getSSEListenerSummary>;
  missingReconnect: SSEListener[];
  missingBackoff: SSEListener[];
  unwiredFeatures: string[];
  endpointListenerMapping: EndpointListenerMapping[];
}


/**
 * Mapping between endpoints and listeners
 */
interface EndpointListenerMapping {
  endpoint: SSEEndpoint;
  listeners: SSEListener[];
  status: 'wired' | 'partial' | 'unwired';
  missingEvents: string[];
}

/**
 * Get timestamp for report
 */
const getTimestamp = (): string => new Date().toISOString();

/**
 * Get status emoji
 */
const getStatusEmoji = (status: string): string => {
  const emojis: Record<string, string> = {
    wired: '✅',
    partial: '🟡',
    unwired: '❌',
    healthy: '🟢',
    warning: '🟡',
    critical: '🔴',
  };
  return emojis[status] || '⚪';
};

/**
 * Calculate overall health status
 */
function calculateOverallHealth(data: CombinedSSEAuditData): 'healthy' | 'warning' | 'critical' {
  const { missingReconnect, missingBackoff, unwiredFeatures, endpointListenerMapping } = data;
  
  // Critical: No SSE endpoints or listeners at all
  if (data.endpoints.length === 0 && data.listeners.length === 0) {
    return 'critical';
  }
  
  // Critical: Many unwired features or missing reconnect logic
  if (unwiredFeatures.length > 3 || missingReconnect.length > data.listeners.length / 2) {
    return 'critical';
  }
  
  // Warning: Some issues but not critical
  if (missingReconnect.length > 0 || missingBackoff.length > 0 || unwiredFeatures.length > 0) {
    return 'warning';
  }
  
  // Check endpoint-listener mapping
  const unwiredEndpoints = endpointListenerMapping.filter(m => m.status === 'unwired');
  if (unwiredEndpoints.length > 0) {
    return 'warning';
  }
  
  return 'healthy';
}

/**
 * Map endpoints to their listeners
 */
function mapEndpointsToListeners(
  endpoints: SSEEndpoint[],
  listeners: SSEListener[]
): EndpointListenerMapping[] {
  const mappings: EndpointListenerMapping[] = [];
  
  for (const endpoint of endpoints) {
    // Find listeners that connect to this endpoint
    const matchingListeners = listeners.filter(listener => {
      // Check if listener endpoint matches
      const listenerEndpoint = listener.endpoint.toLowerCase();
      const endpointPath = endpoint.path.toLowerCase();
      
      // Direct match
      if (listenerEndpoint.includes(endpointPath.replace('/api/', ''))) {
        return true;
      }
      
      // Check for sessions endpoint (common SSE endpoint)
      if (endpointPath.includes('sessions') && listenerEndpoint.includes('sessions')) {
        return true;
      }
      
      // Check for dynamic endpoints
      if (listener.endpoint.startsWith('[dynamic:')) {
        return true;
      }
      
      return false;
    });
    
    // Determine which events are missing listeners
    const listenedEvents = new Set<string>();
    matchingListeners.forEach(l => l.events.forEach(e => listenedEvents.add(e)));
    
    const missingEvents = endpoint.events.filter(e => !listenedEvents.has(e));
    
    // Determine status
    let status: 'wired' | 'partial' | 'unwired';
    if (matchingListeners.length === 0) {
      status = 'unwired';
    } else if (missingEvents.length > 0) {
      status = 'partial';
    } else {
      status = 'wired';
    }
    
    mappings.push({
      endpoint,
      listeners: matchingListeners,
      status,
      missingEvents,
    });
  }
  
  return mappings;
}


/**
 * Identify features that should use SSE but don't have listeners
 */
function identifyUnwiredFeatures(
  endpoints: SSEEndpoint[],
  listeners: SSEListener[]
): string[] {
  const unwired: string[] = [];
  
  // Get all event types from endpoints
  const availableEvents = new Set<string>();
  endpoints.forEach(ep => ep.events.forEach(e => availableEvents.add(e)));
  
  // Get all event types being listened to
  const listenedEvents = new Set<string>();
  listeners.forEach(l => l.events.forEach(e => listenedEvents.add(e)));
  
  // Check expected features
  for (const feature of EXPECTED_SSE_FEATURES) {
    const hasEndpoint = availableEvents.has(feature.eventType);
    const hasListener = listenedEvents.has(feature.eventType);
    
    if (hasEndpoint && !hasListener) {
      unwired.push(`${feature.name} (${feature.eventType}): Endpoint exists but no listener found`);
    } else if (!hasEndpoint && !hasListener) {
      unwired.push(`${feature.name} (${feature.eventType}): Neither endpoint nor listener implemented`);
    }
  }
  
  return unwired;
}

/**
 * Generate executive summary section
 */
function generateExecutiveSummary(data: CombinedSSEAuditData, metadata: ReportMetadata): string {
  const health = calculateOverallHealth(data);
  const healthLabel = {
    healthy: '🟢 **HEALTHY** - SSE implementation is well-configured',
    warning: '🟡 **WARNING** - Some SSE issues need attention',
    critical: '🔴 **CRITICAL** - SSE implementation needs immediate attention',
  }[health];

  const { endpointSummary, listenerSummary, missingReconnect, missingBackoff, unwiredFeatures } = data;

  return `## Executive Summary

**Report Generated**: ${metadata.timestamp}

### SSE System Health Status

${healthLabel}

### Overview

| Metric | Count |
|--------|-------|
| Backend SSE Endpoints | ${endpointSummary.totalEndpoints} |
| Frontend SSE Listeners | ${listenerSummary.totalListeners} |
| Unique Event Types (Backend) | ${endpointSummary.uniqueEvents.length} |
| Unique Event Types (Frontend) | ${listenerSummary.uniqueEvents.length} |
| Listeners with Reconnect | ${listenerSummary.withReconnect} |
| Listeners with Backoff | ${listenerSummary.withBackoff} |

### Issues Summary

| Issue Type | Count | Status |
|------------|-------|--------|
| Missing Reconnect Logic | ${missingReconnect.length} | ${missingReconnect.length === 0 ? '✅' : '⚠️'} |
| Missing Backoff Logic | ${missingBackoff.length} | ${missingBackoff.length === 0 ? '✅' : '⚠️'} |
| Unwired Features | ${unwiredFeatures.length} | ${unwiredFeatures.length === 0 ? '✅' : '⚠️'} |

### Quick Stats

- **SSE Client Implementation**: ${data.listeners.some(l => l.filePath.includes('sseClient')) ? '✅ Robust client exists' : '⚠️ No centralized client'}
- **Reconnection Coverage**: ${listenerSummary.totalListeners > 0 ? Math.round((listenerSummary.withReconnect / listenerSummary.totalListeners) * 100) : 0}%
- **Backoff Coverage**: ${listenerSummary.totalListeners > 0 ? Math.round((listenerSummary.withBackoff / listenerSummary.totalListeners) * 100) : 0}%
- **Auth Required Endpoints**: ${endpointSummary.authRequired} / ${endpointSummary.totalEndpoints}
`;
}


/**
 * Generate backend endpoints section
 */
function generateEndpointsSection(data: CombinedSSEAuditData): string {
  const lines: string[] = [];
  lines.push('## Backend SSE Endpoints');
  lines.push('');
  
  if (data.endpoints.length === 0) {
    lines.push('⚠️ **No SSE endpoints found in the backend.**');
    lines.push('');
    lines.push('This may indicate:');
    lines.push('- SSE is not yet implemented');
    lines.push('- SSE patterns are not recognized by the scanner');
    lines.push('- SSE is implemented using non-standard patterns');
    lines.push('');
    return lines.join('\n');
  }
  
  // API Endpoints
  const apiEndpoints = data.endpoints.filter(isAPIEndpoint);
  if (apiEndpoints.length > 0) {
    lines.push('### API Endpoints');
    lines.push('');
    lines.push('| Endpoint | File | Events | Auth Required |');
    lines.push('|----------|------|--------|---------------|');
    
    for (const ep of apiEndpoints) {
      const events = ep.events.length > 0 ? ep.events.join(', ') : '(none detected)';
      const auth = ep.requiresAuth ? '✅ Yes' : '❌ No';
      lines.push(`| \`${ep.path}\` | \`${ep.filePath}\` | ${events} | ${auth} |`);
    }
    lines.push('');
  }
  
  // Utility Modules
  const utilModules = data.endpoints.filter(isUtilityModule);
  if (utilModules.length > 0) {
    lines.push('### SSE Utility Modules');
    lines.push('');
    lines.push('These are shared SSE utilities used by API endpoints:');
    lines.push('');
    lines.push('| Module | File | Events Defined | Auth Required |');
    lines.push('|--------|------|----------------|---------------|');
    
    for (const ep of utilModules) {
      const events = ep.events.length > 0 ? ep.events.join(', ') : '(none detected)';
      const auth = ep.requiresAuth ? '✅ Yes' : '❌ No';
      lines.push(`| \`${ep.path}\` | \`${ep.filePath}\` | ${events} | ${auth} |`);
    }
    lines.push('');
  }
  
  // Event Types Summary
  if (data.endpointSummary.uniqueEvents.length > 0) {
    lines.push('### Event Types Defined');
    lines.push('');
    lines.push('The following SSE event types are defined in the backend:');
    lines.push('');
    for (const event of data.endpointSummary.uniqueEvents) {
      lines.push(`- \`${event}\``);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate frontend listeners section
 */
function generateListenersSection(data: CombinedSSEAuditData): string {
  const lines: string[] = [];
  lines.push('## Frontend SSE Listeners');
  lines.push('');
  
  if (data.listeners.length === 0) {
    lines.push('⚠️ **No SSE listeners found in the frontend.**');
    lines.push('');
    lines.push('This may indicate:');
    lines.push('- SSE is not yet implemented on the frontend');
    lines.push('- EventSource usage is not recognized by the scanner');
    lines.push('- Custom SSE hooks are using non-standard patterns');
    lines.push('');
    return lines.join('\n');
  }
  
  lines.push('| File | Line | Endpoint | Events | Reconnect | Backoff |');
  lines.push('|------|------|----------|--------|-----------|---------|');
  
  for (const listener of data.listeners) {
    const events = listener.events.length > 0 ? listener.events.join(', ') : '(generic)';
    const reconnect = listener.hasReconnect ? '✅' : '❌';
    const backoff = listener.hasBackoff ? '✅' : '❌';
    lines.push(`| \`${listener.filePath}\` | ${listener.lineNumber} | \`${listener.endpoint}\` | ${events} | ${reconnect} | ${backoff} |`);
  }
  lines.push('');
  
  // Event Types Summary
  if (data.listenerSummary.uniqueEvents.length > 0) {
    lines.push('### Event Types Listened');
    lines.push('');
    lines.push('The following SSE event types are being listened for:');
    lines.push('');
    for (const event of data.listenerSummary.uniqueEvents) {
      lines.push(`- \`${event}\``);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}


/**
 * Generate endpoint-listener mapping section
 */
function generateMappingSection(data: CombinedSSEAuditData): string {
  const lines: string[] = [];
  lines.push('## Endpoint-Listener Mapping');
  lines.push('');
  
  if (data.endpointListenerMapping.length === 0) {
    lines.push('No endpoint-listener mappings to display.');
    lines.push('');
    return lines.join('\n');
  }
  
  lines.push('This section shows how backend SSE endpoints are connected to frontend listeners.');
  lines.push('');
  
  // Summary table
  const wired = data.endpointListenerMapping.filter(m => m.status === 'wired').length;
  const partial = data.endpointListenerMapping.filter(m => m.status === 'partial').length;
  const unwired = data.endpointListenerMapping.filter(m => m.status === 'unwired').length;
  
  lines.push('### Mapping Summary');
  lines.push('');
  lines.push('| Status | Count | Description |');
  lines.push('|--------|-------|-------------|');
  lines.push(`| ${getStatusEmoji('wired')} Wired | ${wired} | Endpoint has matching listeners for all events |`);
  lines.push(`| ${getStatusEmoji('partial')} Partial | ${partial} | Endpoint has listeners but some events are not handled |`);
  lines.push(`| ${getStatusEmoji('unwired')} Unwired | ${unwired} | Endpoint has no matching listeners |`);
  lines.push('');
  
  // Detailed mapping
  lines.push('### Detailed Mapping');
  lines.push('');
  
  for (const mapping of data.endpointListenerMapping) {
    const statusEmoji = getStatusEmoji(mapping.status);
    lines.push(`#### ${statusEmoji} ${mapping.endpoint.path}`);
    lines.push('');
    lines.push(`- **File**: \`${mapping.endpoint.filePath}\``);
    lines.push(`- **Events**: ${mapping.endpoint.events.length > 0 ? mapping.endpoint.events.join(', ') : '(none)'}`);
    lines.push(`- **Auth Required**: ${mapping.endpoint.requiresAuth ? 'Yes' : 'No'}`);
    lines.push(`- **Status**: ${mapping.status.toUpperCase()}`);
    lines.push('');
    
    if (mapping.listeners.length > 0) {
      lines.push('**Connected Listeners:**');
      lines.push('');
      for (const listener of mapping.listeners) {
        const reconnectStatus = listener.hasReconnect ? '✅ reconnect' : '❌ no reconnect';
        const backoffStatus = listener.hasBackoff ? '✅ backoff' : '❌ no backoff';
        lines.push(`- \`${listener.filePath}:${listener.lineNumber}\` (${reconnectStatus}, ${backoffStatus})`);
      }
      lines.push('');
    } else {
      lines.push('**No listeners found for this endpoint.**');
      lines.push('');
    }
    
    if (mapping.missingEvents.length > 0) {
      lines.push('**Missing Event Handlers:**');
      lines.push('');
      for (const event of mapping.missingEvents) {
        lines.push(`- \`${event}\` - No listener handles this event`);
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate gaps and issues section
 */
function generateGapsSection(data: CombinedSSEAuditData): string {
  const lines: string[] = [];
  lines.push('## Gaps and Issues');
  lines.push('');
  
  const hasIssues = data.missingReconnect.length > 0 || 
                   data.missingBackoff.length > 0 || 
                   data.unwiredFeatures.length > 0;
  
  if (!hasIssues) {
    lines.push('✅ **No significant gaps or issues detected.**');
    lines.push('');
    lines.push('The SSE implementation appears to be well-configured with:');
    lines.push('- All listeners have reconnection logic');
    lines.push('- All listeners implement exponential backoff');
    lines.push('- All expected features are wired to SSE');
    lines.push('');
    return lines.join('\n');
  }
  
  // Missing Reconnect Logic
  if (data.missingReconnect.length > 0) {
    lines.push('### ⚠️ Missing Reconnect Logic');
    lines.push('');
    lines.push('The following listeners do not implement auto-reconnect on connection loss:');
    lines.push('');
    lines.push('| File | Line | Endpoint |');
    lines.push('|------|------|----------|');
    
    for (const listener of data.missingReconnect) {
      lines.push(`| \`${listener.filePath}\` | ${listener.lineNumber} | \`${listener.endpoint}\` |`);
    }
    lines.push('');
    lines.push('**Impact**: Users may lose real-time updates without notification.');
    lines.push('');
    lines.push('**Recommendation**: Use the robust SSE client from `src/lib/sseClient.ts` which implements auto-reconnect.');
    lines.push('');
  }
  
  // Missing Backoff Logic
  if (data.missingBackoff.length > 0) {
    lines.push('### ⚠️ Missing Exponential Backoff');
    lines.push('');
    lines.push('The following listeners do not implement exponential backoff:');
    lines.push('');
    lines.push('| File | Line | Endpoint |');
    lines.push('|------|------|----------|');
    
    for (const listener of data.missingBackoff) {
      lines.push(`| \`${listener.filePath}\` | ${listener.lineNumber} | \`${listener.endpoint}\` |`);
    }
    lines.push('');
    lines.push('**Impact**: Rapid reconnection attempts can overwhelm the server and drain mobile battery.');
    lines.push('');
    lines.push('**Recommendation**: Implement exponential backoff (1s, 2s, 4s, 8s, max 30s) as per Requirements 5.4.');
    lines.push('');
  }
  
  // Unwired Features
  if (data.unwiredFeatures.length > 0) {
    lines.push('### ⚠️ Unwired Features');
    lines.push('');
    lines.push('The following features should use SSE but are not properly wired:');
    lines.push('');
    for (const feature of data.unwiredFeatures) {
      lines.push(`- ${feature}`);
    }
    lines.push('');
    lines.push('**Recommendation**: Wire these features to SSE for real-time updates, with polling fallback.');
    lines.push('');
  }
  
  return lines.join('\n');
}


/**
 * Generate recommendations section
 */
function generateRecommendations(data: CombinedSSEAuditData): string {
  const lines: string[] = [];
  lines.push('## Recommendations');
  lines.push('');
  
  let priority = 1;
  const recommendations: string[] = [];
  
  // Critical: No SSE implementation
  if (data.endpoints.length === 0 && data.listeners.length === 0) {
    recommendations.push(`**${priority}. Implement SSE Infrastructure (Critical)**

SSE is not implemented. Create:
- Backend SSE endpoint in \`api-src/sessions.ts\` with \`action=connect\`
- Frontend SSE client using \`src/lib/sseClient.ts\`
- Event types for notifications, application updates, etc.
`);
    priority++;
  }
  
  // High: Missing reconnect logic
  if (data.missingReconnect.length > 0) {
    recommendations.push(`**${priority}. Add Reconnect Logic (High)**

${data.missingReconnect.length} listener(s) lack auto-reconnect:
${data.missingReconnect.map(l => `- \`${l.filePath}\``).join('\n')}

Use the robust SSE client from \`src/lib/sseClient.ts\` which handles reconnection automatically.
`);
    priority++;
  }
  
  // High: Missing backoff logic
  if (data.missingBackoff.length > 0) {
    recommendations.push(`**${priority}. Implement Exponential Backoff (High)**

${data.missingBackoff.length} listener(s) lack exponential backoff:
${data.missingBackoff.map(l => `- \`${l.filePath}\``).join('\n')}

Implement backoff strategy: 1s → 2s → 4s → 8s → 16s → 30s (max).
This is critical for battery life on mobile devices (Requirement 5.5).
`);
    priority++;
  }
  
  // Medium: Unwired features
  if (data.unwiredFeatures.length > 0) {
    recommendations.push(`**${priority}. Wire Remaining Features to SSE (Medium)**

The following features should use SSE for real-time updates:
${data.unwiredFeatures.map(f => `- ${f}`).join('\n')}

Ensure polling fallback is implemented for each (Requirement 5.10).
`);
    priority++;
  }
  
  // Medium: Partial mappings
  const partialMappings = data.endpointListenerMapping.filter(m => m.status === 'partial');
  if (partialMappings.length > 0) {
    recommendations.push(`**${priority}. Complete Event Handler Coverage (Medium)**

Some endpoints have events without handlers:
${partialMappings.map(m => `- \`${m.endpoint.path}\`: Missing handlers for ${m.missingEvents.join(', ')}`).join('\n')}
`);
    priority++;
  }
  
  // Low: Optimization suggestions
  if (data.listeners.length > 0 && data.listenerSummary.uniqueEndpoints.length > 1) {
    recommendations.push(`**${priority}. Consider Consolidating SSE Connections (Low)**

Multiple SSE endpoints detected (${data.listenerSummary.uniqueEndpoints.length}). Consider:
- Using a single SSE connection with event type routing
- This reduces connection overhead and simplifies state management
`);
    priority++;
  }
  
  if (recommendations.length === 0) {
    lines.push('✅ **No priority actions required. SSE implementation is healthy.**');
    lines.push('');
    lines.push('Continue to monitor:');
    lines.push('- Connection stability in production');
    lines.push('- Battery usage on mobile devices');
    lines.push('- Reconnection success rates');
  } else {
    lines.push('### Priority Actions');
    lines.push('');
    lines.push(recommendations.join('\n'));
  }
  
  return lines.join('\n');
}

/**
 * Generate feature wiring status section
 */
function generateFeatureWiringSection(data: CombinedSSEAuditData): string {
  const lines: string[] = [];
  lines.push('## Feature Wiring Status');
  lines.push('');
  lines.push('This section shows the SSE wiring status for expected real-time features.');
  lines.push('');
  
  // Get all event types
  const backendEvents = new Set<string>();
  data.endpoints.forEach(ep => ep.events.forEach(e => backendEvents.add(e)));
  
  const frontendEvents = new Set<string>();
  data.listeners.forEach(l => l.events.forEach(e => frontendEvents.add(e)));
  
  lines.push('| Feature | Event Type | Backend | Frontend | Status |');
  lines.push('|---------|------------|---------|----------|--------|');
  
  for (const feature of EXPECTED_SSE_FEATURES) {
    const hasBackend = backendEvents.has(feature.eventType);
    const hasFrontend = frontendEvents.has(feature.eventType);
    
    let status: string;
    if (hasBackend && hasFrontend) {
      status = '✅ Wired';
    } else if (hasBackend && !hasFrontend) {
      status = '🟡 Backend only';
    } else if (!hasBackend && hasFrontend) {
      status = '🟡 Frontend only';
    } else {
      status = '❌ Not implemented';
    }
    
    const backendStatus = hasBackend ? '✅' : '❌';
    const frontendStatus = hasFrontend ? '✅' : '❌';
    
    lines.push(`| ${feature.name} | \`${feature.eventType}\` | ${backendStatus} | ${frontendStatus} | ${status} |`);
  }
  lines.push('');
  
  // Requirements mapping
  lines.push('### Requirements Mapping');
  lines.push('');
  lines.push('| Requirement | Description | Status |');
  lines.push('|-------------|-------------|--------|');
  lines.push(`| 5.1 | Backend SSE endpoints function correctly | ${data.endpoints.length > 0 ? '✅' : '❌'} |`);
  lines.push(`| 5.2 | Frontend SSE listeners properly implemented | ${data.listeners.length > 0 ? '✅' : '❌'} |`);
  lines.push(`| 5.3 | Auto-reconnect on connection loss | ${data.listenerSummary.withReconnect > 0 ? '✅' : '❌'} |`);
  lines.push(`| 5.4 | Exponential backoff strategy | ${data.listenerSummary.withBackoff > 0 ? '✅' : '❌'} |`);
  lines.push(`| 5.5 | Battery-friendly on mobile | ${data.listeners.some(l => l.filePath.includes('sseClient')) ? '✅' : '⚠️'} |`);
  lines.push(`| 5.6 | Wired to notification updates | ${frontendEvents.has('notification') ? '✅' : '❌'} |`);
  lines.push(`| 5.7 | Wired to application status updates | ${frontendEvents.has('application_update') ? '✅' : '❌'} |`);
  lines.push(`| 5.8 | Wired to admin dashboard updates | ${frontendEvents.has('admin_update') || backendEvents.has('admin_update') ? '✅' : '⚠️'} |`);
  lines.push(`| 5.9 | Wired to user-facing updates | ${data.listeners.length > 0 ? '✅' : '❌'} |`);
  lines.push(`| 5.10 | Polling fallback where SSE impossible | ${data.listeners.some(l => l.filePath.includes('Polling') || l.filePath.includes('polling')) ? '✅' : '⚠️'} |`);
  lines.push('');
  
  return lines.join('\n');
}


/**
 * Generate the complete report
 */
function generateReport(data: CombinedSSEAuditData, metadata: ReportMetadata): string {
  const sections: string[] = [];
  
  // Header
  sections.push('# SSE Implementation Report');
  sections.push('');
  sections.push('> Forensic audit of Server-Sent Events implementation for real-time updates');
  sections.push('');
  sections.push(`**Generated**: ${metadata.timestamp}`);
  sections.push(`**Project Root**: ${metadata.projectRoot}`);
  sections.push(`**Audit Version**: ${metadata.version}`);
  sections.push('');
  
  // Executive Summary
  sections.push(generateExecutiveSummary(data, metadata));
  
  // Table of Contents
  sections.push('## Table of Contents');
  sections.push('');
  sections.push('1. [Executive Summary](#executive-summary)');
  sections.push('2. [Backend SSE Endpoints](#backend-sse-endpoints)');
  sections.push('3. [Frontend SSE Listeners](#frontend-sse-listeners)');
  sections.push('4. [Endpoint-Listener Mapping](#endpoint-listener-mapping)');
  sections.push('5. [Feature Wiring Status](#feature-wiring-status)');
  sections.push('6. [Gaps and Issues](#gaps-and-issues)');
  sections.push('7. [Recommendations](#recommendations)');
  sections.push('');
  
  // Backend Endpoints
  sections.push(generateEndpointsSection(data));
  
  // Frontend Listeners
  sections.push(generateListenersSection(data));
  
  // Endpoint-Listener Mapping
  sections.push(generateMappingSection(data));
  
  // Feature Wiring Status
  sections.push(generateFeatureWiringSection(data));
  
  // Gaps and Issues
  sections.push(generateGapsSection(data));
  
  // Recommendations
  sections.push(generateRecommendations(data));
  
  // Footer
  sections.push('---');
  sections.push('');
  sections.push('*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*');
  sections.push('');
  sections.push('**Validates**: Requirements 5.1-5.10 - SSE implementation and real-time updates');
  
  return sections.join('\n');
}

/**
 * Runs the complete SSE audit and generates the report
 */
export async function generateSSEImplementationReport(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('🔍 Running SSE implementation audit...\n');
  
  // Scan backend endpoints
  console.log('   Scanning backend SSE endpoints...');
  const endpoints = await scanSSEEndpoints(projectRoot);
  const endpointSummary = getSSEScanSummary(endpoints);
  
  // Scan frontend listeners
  console.log('   Scanning frontend SSE listeners...');
  const listenerResult = await scanSSEListeners(projectRoot);
  const listeners = listenerResult.listeners;
  const listenerSummary = getSSEListenerSummary(listenerResult);
  
  // Identify issues
  console.log('   Analyzing gaps and issues...');
  const missingReconnect = getMissingReconnect(listeners);
  const missingBackoff = getMissingBackoff(listeners);
  const unwiredFeatures = identifyUnwiredFeatures(endpoints, listeners);
  
  // Map endpoints to listeners
  console.log('   Mapping endpoints to listeners...');
  const endpointListenerMapping = mapEndpointsToListeners(endpoints, listeners);
  
  const data: CombinedSSEAuditData = {
    endpoints,
    listeners,
    endpointSummary,
    listenerSummary,
    missingReconnect,
    missingBackoff,
    unwiredFeatures,
    endpointListenerMapping,
  };
  
  console.log(`   Found ${endpoints.length} endpoints, ${listeners.length} listeners`);
  console.log(`   Issues: ${missingReconnect.length} missing reconnect, ${missingBackoff.length} missing backoff`);
  
  // Generate report
  const metadata: ReportMetadata = {
    timestamp: getTimestamp(),
    version: '1.0.0',
    projectRoot,
  };
  
  const report = generateReport(data, metadata);
  
  // Ensure output directory exists
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  
  // Write report
  await writeFile(fullOutputPath, report, 'utf-8');
  console.log(`\n✅ Report written to: ${outputPath}`);
  
  return report;
}

/**
 * Gets a summary of the SSE audit without generating a full report
 */
export async function getSSEAuditSummary(projectRoot: string = process.cwd()): Promise<{
  backendEndpoints: number;
  frontendListeners: number;
  missingReconnect: number;
  missingBackoff: number;
  unwiredFeatures: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
}> {
  const endpoints = await scanSSEEndpoints(projectRoot);
  const listenerResult = await scanSSEListeners(projectRoot);
  const listeners = listenerResult.listeners;
  
  const missingReconnect = getMissingReconnect(listeners);
  const missingBackoff = getMissingBackoff(listeners);
  const unwiredFeatures = identifyUnwiredFeatures(endpoints, listeners);
  const endpointListenerMapping = mapEndpointsToListeners(endpoints, listeners);
  
  const data: CombinedSSEAuditData = {
    endpoints,
    listeners,
    endpointSummary: getSSEScanSummary(endpoints),
    listenerSummary: getSSEListenerSummary(listenerResult),
    missingReconnect,
    missingBackoff,
    unwiredFeatures,
    endpointListenerMapping,
  };
  
  return {
    backendEndpoints: endpoints.length,
    frontendListeners: listeners.length,
    missingReconnect: missingReconnect.length,
    missingBackoff: missingBackoff.length,
    unwiredFeatures: unwiredFeatures.length,
    healthStatus: calculateOverallHealth(data),
  };
}

/**
 * Build SSE audit result for master report
 */
export async function buildSSEAuditResult(projectRoot: string = process.cwd()): Promise<SSEAuditResult> {
  const endpoints = await scanSSEEndpoints(projectRoot);
  const listenerResult = await scanSSEListeners(projectRoot);
  const listeners = listenerResult.listeners;
  
  const missingReconnect = getMissingReconnect(listeners);
  const missingBackoff = getMissingBackoff(listeners);
  const unwiredFeatures = identifyUnwiredFeatures(endpoints, listeners);
  
  return {
    backendEndpoints: endpoints,
    frontendListeners: listeners,
    missingReconnect,
    missingBackoff,
    unwiredFeatures,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;
  const projectRoot = process.cwd();
  
  console.log('📋 SSE Implementation Report Generator');
  console.log('======================================\n');
  
  generateSSEImplementationReport(projectRoot, outputPath)
    .then(report => {
      // Print summary to console
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary'));
      
      if (summaryStart !== -1) {
        const summaryLines = lines.slice(summaryStart, summaryEnd !== -1 ? summaryEnd : summaryStart + 35);
        console.log('\n' + summaryLines.join('\n'));
      }
    })
    .catch(error => {
      console.error('❌ Error generating report:', error);
      process.exit(1);
    });
}
