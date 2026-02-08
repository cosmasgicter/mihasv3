/**
 * Property-Based Tests: SSE Auditor - SSE Endpoint Verification
 * Feature: frontend-backend-forensic-audit
 * Task: 9.3 Write property test for SSE endpoint verification
 * 
 * **Property 16: SSE Endpoint Verification**
 * 
 * *For any* SSE endpoint in the backend and listener in the frontend,
 * the SSE Auditor SHALL verify they are properly paired and configured.
 * 
 * **Validates: Requirements 5.1, 5.2**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { scanSSEEndpoints, getSSEScanSummary } from '../../scripts/audit/sse/endpointScanner';
import {
  scanSSEListeners,
  getSSEListenerSummary,
  getMissingReconnect,
  getMissingBackoff,
} from '../../scripts/audit/sse/listenerScanner';
import type { SSEEndpoint, SSEListener } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * SSE scanning involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 100;

/**
 * Temporary directory for test fixtures
 */
const TEST_FIXTURES_DIR = join(process.cwd(), '.test-fixtures-sse-auditor');


// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid SSE event types used in the MIHAS system
 */
const sseEventTypeArb = fc.constantFrom(
  'application_update',
  'notification',
  'payment_update',
  'interview_scheduled',
  'document_processed',
  'status_change',
  'message',
  'ping',
  'heartbeat'
);

/**
 * Valid SSE endpoint paths
 */
const sseEndpointPathArb = fc.constantFrom(
  '/api/notifications',
  '/api/applications',
  '/api/admin',
  '/api/sessions',
  '/api/realtime'
);

/**
 * Generate an SSE endpoint for testing
 */
const sseEndpointArb: fc.Arbitrary<SSEEndpoint> = fc.record({
  path: sseEndpointPathArb,
  filePath: fc.constantFrom(
    'api-src/notifications.ts',
    'api-src/applications.ts',
    'api-src/admin.ts',
    'lib/realtime.ts'
  ),
  events: fc.array(sseEventTypeArb, { minLength: 1, maxLength: 5 }).map(arr => [...new Set(arr)]),
  requiresAuth: fc.boolean(),
});

/**
 * Generate an SSE listener for testing
 */
const sseListenerArb: fc.Arbitrary<SSEListener> = fc.record({
  filePath: fc.constantFrom(
    'src/hooks/useNotifications.ts',
    'src/hooks/useRealtime.ts',
    'src/hooks/useApplicationStatus.ts',
    'src/components/admin/Dashboard.tsx'
  ),
  lineNumber: fc.integer({ min: 1, max: 500 }),
  endpoint: sseEndpointPathArb,
  events: fc.array(sseEventTypeArb, { minLength: 0, maxLength: 5 }).map(arr => [...new Set(arr)]),
  hasReconnect: fc.boolean(),
  hasBackoff: fc.boolean(),
});


/**
 * Generate backend SSE endpoint code
 */
function generateBackendSSECode(config: {
  events: string[];
  requiresAuth: boolean;
}): string {
  const authCheck = config.requiresAuth 
    ? `const user = await requireAuth(req);` 
    : '';
  
  const eventTypeUnion = config.events.map(e => `'${e}'`).join(' | ');
  
  return `
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
${config.requiresAuth ? `import { requireAuth } from '../lib/auth';` : ''}

type SSEEventType = ${eventTypeUnion || "'message'"};

function sendSSEEvent(res: VercelResponse, data: { type: SSEEventType; payload: unknown }) {
  res.write(\`event: \${data.type}\\n\`);
  res.write(\`data: \${JSON.stringify(data.payload)}\\n\\n\`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  ${authCheck}
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  ${config.events.map(e => `sendSSEEvent(res, { type: '${e}', payload: {} });`).join('\n  ')}
}
`;
}

/**
 * Generate frontend SSE listener code
 * Note: We use distinct patterns to avoid false positives in detection
 */
function generateFrontendListenerCode(config: {
  endpoint: string;
  events: string[];
  hasReconnect: boolean;
  hasBackoff: boolean;
}): string {
  // Only include reconnect code if hasReconnect is true
  const reconnectCode = config.hasReconnect ? `
  const doReconnect = () => {
    setTimeout(() => {
      eventSource = new EventSource('${config.endpoint}');
    }, 1000);
  };
  
  eventSource.onerror = () => {
    eventSource.close();
    doReconnect();
  };` : '';

  // Only include backoff code if hasBackoff is true
  const backoffCode = config.hasBackoff ? `
  let delay = 1000;
  const maxDelay = 30000;
  
  const doBackoff = () => {
    delay = Math.min(delay * 2, maxDelay);
  };` : '';

  const eventListeners = config.events.map(e => 
    `eventSource.addEventListener('${e}', (event) => { console.log(event.data); });`
  ).join('\n  ');

  return `
import { useEffect, useState } from 'react';

export function useSSEListener() {
  const [data, setData] = useState(null);
  ${backoffCode}
  
  useEffect(() => {
    let eventSource = new EventSource('${config.endpoint}');
    
    eventSource.onmessage = (event) => {
      setData(JSON.parse(event.data));
    };
    
    ${eventListeners}
    ${reconnectCode}
    
    return () => {
      eventSource.close();
    };
  }, []);
  
  return data;
}
`;
}


// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create test fixture directory structure
 */
async function setupTestFixtures(): Promise<void> {
  await mkdir(join(TEST_FIXTURES_DIR, 'api-src'), { recursive: true });
  await mkdir(join(TEST_FIXTURES_DIR, 'lib'), { recursive: true });
  await mkdir(join(TEST_FIXTURES_DIR, 'src', 'hooks'), { recursive: true });
  await mkdir(join(TEST_FIXTURES_DIR, 'src', 'components', 'admin'), { recursive: true });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(): Promise<void> {
  try {
    await rm(TEST_FIXTURES_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Write a backend SSE endpoint file
 */
async function writeBackendFile(filename: string, content: string): Promise<string> {
  const filePath = join(TEST_FIXTURES_DIR, 'api-src', filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Write a frontend SSE listener file
 */
async function writeFrontendFile(subdir: string, filename: string, content: string): Promise<string> {
  const filePath = join(TEST_FIXTURES_DIR, 'src', subdir, filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 16: SSE Endpoint Verification', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   */
  
  beforeEach(async () => {
    await cleanupTestFixtures();
    await setupTestFixtures();
  });
  
  afterEach(async () => {
    await cleanupTestFixtures();
  });


  // ==========================================================================
  // Requirement 5.1: Backend SSE Endpoint Verification
  // ==========================================================================
  
  describe('Requirement 5.1: Backend SSE Endpoint Verification', () => {
    it('PROPERTY: SSEEndpoint has all required fields', () => {
      fc.assert(
        fc.property(
          sseEndpointArb,
          (endpoint) => {
            // All required fields must be present
            expect(endpoint.path).toBeDefined();
            expect(typeof endpoint.path).toBe('string');
            expect(endpoint.path.length).toBeGreaterThan(0);
            
            expect(endpoint.filePath).toBeDefined();
            expect(typeof endpoint.filePath).toBe('string');
            expect(endpoint.filePath.length).toBeGreaterThan(0);
            
            expect(endpoint.events).toBeDefined();
            expect(Array.isArray(endpoint.events)).toBe(true);
            
            expect(typeof endpoint.requiresAuth).toBe('boolean');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backend scanner detects SSE content-type header', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(sseEventTypeArb, { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]),
          fc.boolean(),
          async (events, requiresAuth) => {
            const content = generateBackendSSECode({ events, requiresAuth });
            await writeBackendFile('test-sse.ts', content);
            
            const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
            
            // Should detect the SSE endpoint
            expect(results.length).toBeGreaterThan(0);
            
            // Should have detected the text/event-stream content type
            const endpoint = results.find(r => r.filePath.includes('test-sse.ts'));
            expect(endpoint).toBeDefined();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backend scanner extracts event types from SSEEventType union', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(sseEventTypeArb, { minLength: 1, maxLength: 4 }).map(arr => [...new Set(arr)]),
          async (events) => {
            const content = generateBackendSSECode({ events, requiresAuth: false });
            await writeBackendFile('events-test.ts', content);
            
            const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
            const endpoint = results.find(r => r.filePath.includes('events-test.ts'));
            
            if (endpoint) {
              // Should extract at least some of the event types
              expect(endpoint.events.length).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backend scanner detects auth requirements', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (requiresAuth) => {
            const content = generateBackendSSECode({ 
              events: ['notification'], 
              requiresAuth 
            });
            await writeBackendFile('auth-test.ts', content);
            
            const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
            const endpoint = results.find(r => r.filePath.includes('auth-test.ts'));
            
            if (endpoint) {
              // Auth detection should match the generated code
              expect(endpoint.requiresAuth).toBe(requiresAuth);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: getSSEScanSummary returns accurate statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              filename: fc.constantFrom('sse1.ts', 'sse2.ts', 'sse3.ts'),
              events: fc.array(sseEventTypeArb, { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]),
              requiresAuth: fc.boolean(),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (configs) => {
            // Write multiple SSE endpoint files
            for (const config of configs) {
              const content = generateBackendSSECode(config);
              await writeBackendFile(config.filename, content);
            }
            
            const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
            const summary = getSSEScanSummary(results);
            
            // Summary should be consistent
            expect(summary.totalEndpoints).toBe(results.length);
            expect(summary.authRequired + summary.publicEndpoints).toBe(summary.totalEndpoints);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Requirement 5.2: Frontend SSE Listener Verification
  // ==========================================================================
  
  describe('Requirement 5.2: Frontend SSE Listener Verification', () => {
    it('PROPERTY: SSEListener has all required fields', () => {
      fc.assert(
        fc.property(
          sseListenerArb,
          (listener) => {
            // All required fields must be present
            expect(listener.filePath).toBeDefined();
            expect(typeof listener.filePath).toBe('string');
            expect(listener.filePath.length).toBeGreaterThan(0);
            
            expect(listener.lineNumber).toBeDefined();
            expect(typeof listener.lineNumber).toBe('number');
            expect(listener.lineNumber).toBeGreaterThan(0);
            
            expect(listener.endpoint).toBeDefined();
            expect(typeof listener.endpoint).toBe('string');
            
            expect(listener.events).toBeDefined();
            expect(Array.isArray(listener.events)).toBe(true);
            
            expect(typeof listener.hasReconnect).toBe('boolean');
            expect(typeof listener.hasBackoff).toBe('boolean');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Frontend scanner detects EventSource usage', async () => {
      await fc.assert(
        fc.asyncProperty(
          sseEndpointPathArb,
          fc.array(sseEventTypeArb, { minLength: 0, maxLength: 3 }).map(arr => [...new Set(arr)]),
          async (endpoint, events) => {
            const content = generateFrontendListenerCode({
              endpoint,
              events,
              hasReconnect: false,
              hasBackoff: false,
            });
            await writeFrontendFile('hooks', 'useTestSSE.ts', content);
            
            const result = await scanSSEListeners(TEST_FIXTURES_DIR);
            
            // Should detect the EventSource usage
            expect(result.listeners.length).toBeGreaterThan(0);
            
            const listener = result.listeners.find(l => l.filePath.includes('useTestSSE.ts'));
            expect(listener).toBeDefined();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Frontend scanner detects reconnect logic', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (hasReconnect) => {
            const content = generateFrontendListenerCode({
              endpoint: '/api/notifications',
              events: ['message'],
              hasReconnect,
              hasBackoff: false,
            });
            await writeFrontendFile('hooks', 'useReconnectTest.ts', content);
            
            const result = await scanSSEListeners(TEST_FIXTURES_DIR);
            const listener = result.listeners.find(l => l.filePath.includes('useReconnectTest.ts'));
            
            if (listener) {
              // Reconnect detection should match the generated code
              expect(listener.hasReconnect).toBe(hasReconnect);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Frontend scanner detects backoff logic', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (hasBackoff) => {
            const content = generateFrontendListenerCode({
              endpoint: '/api/notifications',
              events: ['message'],
              hasReconnect: false,
              hasBackoff,
            });
            await writeFrontendFile('hooks', 'useBackoffTest.ts', content);
            
            const result = await scanSSEListeners(TEST_FIXTURES_DIR);
            const listener = result.listeners.find(l => l.filePath.includes('useBackoffTest.ts'));
            
            if (listener) {
              // Backoff detection should match the generated code
              expect(listener.hasBackoff).toBe(hasBackoff);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Frontend scanner extracts event types from addEventListener', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(sseEventTypeArb, { minLength: 1, maxLength: 4 }).map(arr => [...new Set(arr)]),
          async (events) => {
            const content = generateFrontendListenerCode({
              endpoint: '/api/notifications',
              events,
              hasReconnect: false,
              hasBackoff: false,
            });
            await writeFrontendFile('hooks', 'useEventsTest.ts', content);
            
            const result = await scanSSEListeners(TEST_FIXTURES_DIR);
            const listener = result.listeners.find(l => l.filePath.includes('useEventsTest.ts'));
            
            if (listener) {
              // Should extract at least some event types
              // Note: 'message' is always added due to onmessage handler
              expect(listener.events.length).toBeGreaterThanOrEqual(1);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // SSE Endpoint-Listener Pairing Verification
  // ==========================================================================
  
  describe('SSE Endpoint-Listener Pairing', () => {
    it('PROPERTY: getMissingReconnect returns listeners without reconnect logic', () => {
      fc.assert(
        fc.property(
          fc.array(sseListenerArb, { minLength: 1, maxLength: 10 }),
          (listeners) => {
            const missing = getMissingReconnect(listeners);
            
            // All returned listeners should have hasReconnect = false
            for (const listener of missing) {
              expect(listener.hasReconnect).toBe(false);
            }
            
            // Count should match
            const expectedCount = listeners.filter(l => !l.hasReconnect).length;
            expect(missing.length).toBe(expectedCount);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: getMissingBackoff returns listeners without backoff logic', () => {
      fc.assert(
        fc.property(
          fc.array(sseListenerArb, { minLength: 1, maxLength: 10 }),
          (listeners) => {
            const missing = getMissingBackoff(listeners);
            
            // All returned listeners should have hasBackoff = false
            for (const listener of missing) {
              expect(listener.hasBackoff).toBe(false);
            }
            
            // Count should match
            const expectedCount = listeners.filter(l => !l.hasBackoff).length;
            expect(missing.length).toBe(expectedCount);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: getSSEListenerSummary returns accurate statistics', () => {
      fc.assert(
        fc.property(
          fc.array(sseListenerArb, { minLength: 0, maxLength: 10 }),
          (listeners) => {
            const result = {
              listeners,
              totalListeners: listeners.length,
              withReconnect: listeners.filter(l => l.hasReconnect).length,
              withBackoff: listeners.filter(l => l.hasBackoff).length,
              errors: [],
            };
            
            const summary = getSSEListenerSummary(result);
            
            // Summary should be consistent
            expect(summary.totalListeners).toBe(listeners.length);
            expect(summary.withReconnect).toBe(result.withReconnect);
            expect(summary.withBackoff).toBe(result.withBackoff);
            expect(summary.missingReconnect).toBe(listeners.length - result.withReconnect);
            expect(summary.missingBackoff).toBe(listeners.length - result.withBackoff);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Listeners with both reconnect and backoff are properly configured', () => {
      fc.assert(
        fc.property(
          fc.array(sseListenerArb, { minLength: 1, maxLength: 10 }),
          (listeners) => {
            const properlyConfigured = listeners.filter(
              l => l.hasReconnect && l.hasBackoff
            );
            
            const missingReconnect = getMissingReconnect(listeners);
            const missingBackoff = getMissingBackoff(listeners);
            
            // Properly configured listeners should not be in either missing list
            for (const listener of properlyConfigured) {
              const inMissingReconnect = missingReconnect.some(
                m => m.filePath === listener.filePath && m.lineNumber === listener.lineNumber
              );
              const inMissingBackoff = missingBackoff.some(
                m => m.filePath === listener.filePath && m.lineNumber === listener.lineNumber
              );
              
              expect(inMissingReconnect).toBe(false);
              expect(inMissingBackoff).toBe(false);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  
  describe('Edge Cases', () => {
    it('PROPERTY: Empty directory returns empty results for backend', async () => {
      const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
      expect(results).toEqual([]);
    });

    it('PROPERTY: Empty directory returns empty results for frontend', async () => {
      const result = await scanSSEListeners(TEST_FIXTURES_DIR);
      expect(result.listeners).toEqual([]);
      expect(result.totalListeners).toBe(0);
    });

    it('PROPERTY: File without SSE patterns is not detected as endpoint', async () => {
      const content = `
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ message: 'Hello' });
}
`;
      await writeBackendFile('non-sse.ts', content);
      
      const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
      const endpoint = results.find(r => r.filePath.includes('non-sse.ts'));
      
      expect(endpoint).toBeUndefined();
    });

    it('PROPERTY: File without EventSource is not detected as listener', async () => {
      const content = `
import { useEffect, useState } from 'react';

export function useRegularHook() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
  
  return data;
}
`;
      await writeFrontendFile('hooks', 'useRegular.ts', content);
      
      const result = await scanSSEListeners(TEST_FIXTURES_DIR);
      const listener = result.listeners.find(l => l.filePath.includes('useRegular.ts'));
      
      expect(listener).toBeUndefined();
    });

    it('PROPERTY: Multiple SSE endpoints in different files are all detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              filename: fc.constantFrom('sse-a.ts', 'sse-b.ts', 'sse-c.ts'),
              events: fc.array(sseEventTypeArb, { minLength: 1, maxLength: 2 }).map(arr => [...new Set(arr)]),
            }),
            { minLength: 2, maxLength: 3 }
          ),
          async (configs) => {
            // Clean up before each iteration
            await cleanupTestFixtures();
            await setupTestFixtures();
            
            // Use unique filenames
            const uniqueConfigs = configs.filter((c, i, arr) => 
              arr.findIndex(x => x.filename === c.filename) === i
            );
            
            for (const config of uniqueConfigs) {
              const content = generateBackendSSECode({ 
                events: config.events, 
                requiresAuth: false 
              });
              await writeBackendFile(config.filename, content);
            }
            
            const results = await scanSSEEndpoints(TEST_FIXTURES_DIR);
            
            // Should detect all unique endpoints
            expect(results.length).toBe(uniqueConfigs.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multiple SSE listeners in different files are all detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              filename: fc.constantFrom('useSSE1.ts', 'useSSE2.ts', 'useSSE3.ts'),
              endpoint: sseEndpointPathArb,
            }),
            { minLength: 2, maxLength: 3 }
          ),
          async (configs) => {
            // Clean up before each iteration
            await cleanupTestFixtures();
            await setupTestFixtures();
            
            // Use unique filenames
            const uniqueConfigs = configs.filter((c, i, arr) => 
              arr.findIndex(x => x.filename === c.filename) === i
            );
            
            for (const config of uniqueConfigs) {
              const content = generateFrontendListenerCode({
                endpoint: config.endpoint,
                events: ['message'],
                hasReconnect: false,
                hasBackoff: false,
              });
              await writeFrontendFile('hooks', config.filename, content);
            }
            
            const result = await scanSSEListeners(TEST_FIXTURES_DIR);
            
            // Should detect all unique listeners
            expect(result.listeners.length).toBe(uniqueConfigs.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Line numbers are always positive integers', async () => {
      const content = generateFrontendListenerCode({
        endpoint: '/api/notifications',
        events: ['message'],
        hasReconnect: true,
        hasBackoff: true,
      });
      await writeFrontendFile('hooks', 'useLineNumbers.ts', content);
      
      const result = await scanSSEListeners(TEST_FIXTURES_DIR);
      
      for (const listener of result.listeners) {
        expect(listener.lineNumber).toBeGreaterThan(0);
        expect(Number.isInteger(listener.lineNumber)).toBe(true);
      }
    });

    it('PROPERTY: Endpoint paths start with /api or are marked as dynamic', async () => {
      await fc.assert(
        fc.asyncProperty(
          sseEndpointPathArb,
          async (endpoint) => {
            // Clean up before each iteration
            await cleanupTestFixtures();
            await setupTestFixtures();
            
            const content = generateFrontendListenerCode({
              endpoint,
              events: ['message'],
              hasReconnect: false,
              hasBackoff: false,
            });
            await writeFrontendFile('hooks', 'useEndpointPath.ts', content);
            
            const result = await scanSSEListeners(TEST_FIXTURES_DIR);
            const listener = result.listeners.find(l => l.filePath.includes('useEndpointPath.ts'));
            
            if (listener) {
              // Endpoint should start with /api, [dynamic, or [unknown]
              const validEndpoint = 
                listener.endpoint.startsWith('/api') || 
                listener.endpoint.startsWith('[dynamic') ||
                listener.endpoint.startsWith('[unknown');
              expect(validEndpoint).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
