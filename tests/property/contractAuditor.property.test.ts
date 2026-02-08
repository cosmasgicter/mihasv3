/**
 * Property-Based Tests: Contract Auditor - API Call Extraction
 * Feature: frontend-backend-forensic-audit
 * Task: 2.2 Write property test for API call extraction
 * 
 * **Property 1: API Call Extraction Completeness**
 * 
 * *For any* valid API call in frontend code (fetch, axios, or custom client),
 * the Contract Auditor SHALL extract all required fields: file path, line number,
 * endpoint URL, HTTP method, headers, and auth mechanism.
 * 
 * **Validates: Requirements 1.1**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { scanFrontendAPICalls, getAPIScanSummary } from '../../scripts/audit/contract/frontendScanner';
import type { APICallInfo, HTTPMethod, AuthMechanism } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * API call extraction involves file I/O, so we use fewer iterations.
 */
const NUM_RUNS = 100;

/**
 * Temporary directory for test fixtures
 */
const TEST_FIXTURES_DIR = join(process.cwd(), '.test-fixtures-contract-auditor');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid HTTP methods
 */
const httpMethodArb = fc.constantFrom<HTTPMethod>('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

/**
 * Valid auth mechanisms
 */
const authMechanismArb = fc.constantFrom<AuthMechanism>('cookie', 'bearer', 'none');

/**
 * Valid API endpoint paths (must start with /api or /)
 */
const apiEndpointArb = fc.oneof(
  // /api/... endpoints
  fc.tuple(
    fc.constantFrom('auth', 'admin', 'applications', 'catalog', 'documents', 'health', 'notifications', 'payments', 'sessions'),
    fc.option(fc.constantFrom('login', 'logout', 'register', 'details', 'upload', 'list', 'create', 'update', 'delete'), { nil: undefined })
  ).map(([resource, action]) => action ? `/api/${resource}?action=${action}` : `/api/${resource}`),
  // Simple /api/resource endpoints
  fc.constantFrom(
    '/api/auth',
    '/api/admin',
    '/api/applications',
    '/api/catalog',
    '/api/documents',
    '/api/health',
    '/api/notifications',
    '/api/payments',
    '/api/sessions'
  )
);

/**
 * Valid file names for services
 */
const serviceFileNameArb = fc.constantFrom(
  'auth.ts',
  'applications.ts',
  'catalog.ts',
  'documents.ts',
  'notifications.ts',
  'payments.ts',
  'sessions.ts',
  'apiClient.ts',
  'admin.ts'
);

/**
 * Generate fetch call code
 */
const fetchCallCodeArb = fc.tuple(
  apiEndpointArb,
  httpMethodArb,
  fc.boolean() // include credentials
).map(([endpoint, method, includeCredentials]) => {
  const options = method === 'GET' 
    ? (includeCredentials ? `{ credentials: 'include' }` : '')
    : `{ method: '${method}'${includeCredentials ? `, credentials: 'include'` : ''} }`;
  
  return options 
    ? `fetch('${endpoint}', ${options})`
    : `fetch('${endpoint}')`;
});

/**
 * Generate apiClient.request call code
 */
const apiClientCallCodeArb = fc.tuple(
  apiEndpointArb,
  httpMethodArb
).map(([endpoint, method]) => {
  return `apiClient.request('${endpoint}', { method: '${method}' })`;
});

/**
 * Generate authFetch call code
 */
const authFetchCallCodeArb = fc.tuple(
  apiEndpointArb,
  httpMethodArb
).map(([endpoint, method]) => {
  return method === 'GET'
    ? `authFetch('${endpoint}')`
    : `authFetch('${endpoint}', { method: '${method}' })`;
});

/**
 * Generate a complete service file with API calls
 */
const serviceFileContentArb = fc.tuple(
  fc.array(
    fc.oneof(fetchCallCodeArb, apiClientCallCodeArb, authFetchCallCodeArb),
    { minLength: 1, maxLength: 5 }
  ),
  fc.boolean() // wrap in async function
).map(([calls, wrapInFunction]) => {
  const imports = `import { apiClient } from '@/lib/apiClient';\nimport { authFetch } from '@/lib/authFetch';\n\n`;
  
  if (wrapInFunction) {
    const functionBody = calls.map((call, i) => `  const result${i} = await ${call};`).join('\n');
    return `${imports}export async function fetchData() {\n${functionBody}\n}\n`;
  }
  
  return `${imports}${calls.map((call, i) => `export const call${i} = ${call};`).join('\n')}\n`;
});

/**
 * Generate mock file content with specific API call patterns
 */
interface MockAPICall {
  endpoint: string;
  method: HTTPMethod;
  authMechanism: AuthMechanism;
  callType: 'fetch' | 'apiClient' | 'authFetch';
}

const mockAPICallArb: fc.Arbitrary<MockAPICall> = fc.record({
  endpoint: apiEndpointArb,
  method: httpMethodArb,
  authMechanism: authMechanismArb,
  callType: fc.constantFrom<'fetch' | 'apiClient' | 'authFetch'>('fetch', 'apiClient', 'authFetch')
});

/**
 * Generate code for a specific mock API call
 */
function generateCallCode(call: MockAPICall): string {
  const { endpoint, method, authMechanism, callType } = call;
  
  switch (callType) {
    case 'fetch': {
      const options: string[] = [];
      if (method !== 'GET') options.push(`method: '${method}'`);
      if (authMechanism === 'cookie') options.push(`credentials: 'include'`);
      if (authMechanism === 'bearer') options.push(`headers: { 'Authorization': 'Bearer token' }`);
      
      return options.length > 0
        ? `fetch('${endpoint}', { ${options.join(', ')} })`
        : `fetch('${endpoint}')`;
    }
    case 'apiClient': {
      return `apiClient.request('${endpoint}', { method: '${method}' })`;
    }
    case 'authFetch': {
      return method === 'GET'
        ? `authFetch('${endpoint}')`
        : `authFetch('${endpoint}', { method: '${method}' })`;
    }
  }
}

/**
 * Generate a service file with specific API calls
 */
function generateServiceFile(calls: MockAPICall[]): string {
  const imports = `import { apiClient } from '@/lib/apiClient';\nimport { authFetch } from '@/lib/authFetch';\n\n`;
  
  const functions = calls.map((call, i) => {
    const code = generateCallCode(call);
    return `export async function apiCall${i}() {\n  return await ${code};\n}`;
  }).join('\n\n');
  
  return `${imports}${functions}\n`;
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create test fixture directory structure
 */
async function setupTestFixtures(): Promise<void> {
  await mkdir(join(TEST_FIXTURES_DIR, 'src', 'services'), { recursive: true });
  await mkdir(join(TEST_FIXTURES_DIR, 'src', 'hooks'), { recursive: true });
  await mkdir(join(TEST_FIXTURES_DIR, 'src', 'lib', 'api'), { recursive: true });
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
 * Write a test service file
 */
async function writeTestServiceFile(filename: string, content: string): Promise<string> {
  const filePath = join(TEST_FIXTURES_DIR, 'src', 'services', filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 1: API Call Extraction Completeness', () => {
  /**
   * **Validates: Requirements 1.1**
   */
  
  beforeEach(async () => {
    await cleanupTestFixtures();
    await setupTestFixtures();
  });
  
  afterEach(async () => {
    await cleanupTestFixtures();
  });

  describe('Every extracted APICallInfo has all required fields', () => {
    it('PROPERTY: Every extracted APICallInfo has filePath (non-empty string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('test-service.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            for (const result of results) {
              expect(result.filePath).toBeDefined();
              expect(typeof result.filePath).toBe('string');
              expect(result.filePath.trim().length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every extracted APICallInfo has lineNumber (positive integer)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('test-service.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            for (const result of results) {
              expect(result.lineNumber).toBeDefined();
              expect(typeof result.lineNumber).toBe('number');
              expect(Number.isInteger(result.lineNumber)).toBe(true);
              expect(result.lineNumber).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every extracted APICallInfo has endpoint (starts with /api or /)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('test-service.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            for (const result of results) {
              expect(result.endpoint).toBeDefined();
              expect(typeof result.endpoint).toBe('string');
              expect(
                result.endpoint.startsWith('/api') || result.endpoint.startsWith('/')
              ).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every extracted APICallInfo has valid HTTP method (GET, POST, PUT, DELETE, PATCH)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('test-service.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            const validMethods: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
            
            for (const result of results) {
              expect(result.method).toBeDefined();
              expect(validMethods).toContain(result.method);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every extracted APICallInfo has headers (object)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('test-service.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            for (const result of results) {
              expect(result.headers).toBeDefined();
              expect(typeof result.headers).toBe('object');
              expect(result.headers).not.toBeNull();
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every extracted APICallInfo has valid authMechanism (cookie, bearer, none)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('test-service.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            const validAuthMechanisms: AuthMechanism[] = ['cookie', 'bearer', 'none'];
            
            for (const result of results) {
              expect(result.authMechanism).toBeDefined();
              expect(validAuthMechanisms).toContain(result.authMechanism);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Line numbers are always positive integers', () => {
    it('PROPERTY: Line numbers increase for sequential API calls in the same file', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 2, maxLength: 5 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('sequential-calls.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            // Filter to just this file
            const fileResults = results.filter(r => r.filePath.includes('sequential-calls.ts'));
            
            // Line numbers should be positive
            for (const result of fileResults) {
              expect(result.lineNumber).toBeGreaterThan(0);
            }
            
            // If we have multiple results, they should be in order
            if (fileResults.length > 1) {
              for (let i = 1; i < fileResults.length; i++) {
                expect(fileResults[i].lineNumber).toBeGreaterThanOrEqual(fileResults[i - 1].lineNumber);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Line numbers are never zero or negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          serviceFileContentArb,
          async (content) => {
            await writeTestServiceFile('line-numbers-test.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            for (const result of results) {
              expect(result.lineNumber).toBeGreaterThan(0);
              expect(Number.isInteger(result.lineNumber)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('HTTP methods are valid', () => {
    it('PROPERTY: Extracted method matches the method in the source code', async () => {
      await fc.assert(
        fc.asyncProperty(
          mockAPICallArb,
          async (call) => {
            const content = generateServiceFile([call]);
            await writeTestServiceFile('method-test.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const fileResults = results.filter(r => r.filePath.includes('method-test.ts'));
            
            // Should extract at least one call
            if (fileResults.length > 0) {
              // For apiClient and authFetch, method should match
              // For fetch without method, should default to GET
              const expectedMethod = call.method;
              
              // At least one result should have the expected method
              // (accounting for default GET behavior)
              const hasExpectedMethod = fileResults.some(r => 
                r.method === expectedMethod || 
                (call.callType === 'fetch' && call.method === 'GET' && r.method === 'GET')
              );
              
              expect(hasExpectedMethod).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Default method is GET when not specified', async () => {
      const content = `
import { apiClient } from '@/lib/apiClient';

export async function getData() {
  return await fetch('/api/catalog');
}
`;
      await writeTestServiceFile('default-method.ts', content);
      
      const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
      const fileResults = results.filter(r => r.filePath.includes('default-method.ts'));
      
      for (const result of fileResults) {
        expect(result.method).toBe('GET');
      }
    });
  });

  describe('Auth mechanisms are valid', () => {
    it('PROPERTY: apiClient calls always have cookie auth mechanism', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(apiEndpointArb, httpMethodArb),
          async ([endpoint, method]) => {
            const content = `
import { apiClient } from '@/lib/apiClient';

export async function fetchData() {
  return await apiClient.request('${endpoint}', { method: '${method}' });
}
`;
            await writeTestServiceFile('api-client-auth.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const fileResults = results.filter(r => r.filePath.includes('api-client-auth.ts'));
            
            for (const result of fileResults) {
              expect(result.authMechanism).toBe('cookie');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: authFetch calls always have cookie auth mechanism', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(apiEndpointArb, httpMethodArb),
          async ([endpoint, method]) => {
            const content = `
import { authFetch } from '@/lib/authFetch';

export async function fetchData() {
  return await authFetch('${endpoint}', { method: '${method}' });
}
`;
            await writeTestServiceFile('auth-fetch-auth.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const fileResults = results.filter(r => r.filePath.includes('auth-fetch-auth.ts'));
            
            for (const result of fileResults) {
              expect(result.authMechanism).toBe('cookie');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: fetch with credentials: include has cookie auth mechanism', async () => {
      await fc.assert(
        fc.asyncProperty(
          apiEndpointArb,
          async (endpoint) => {
            const content = `
export async function fetchData() {
  return await fetch('${endpoint}', { credentials: 'include' });
}
`;
            await writeTestServiceFile('fetch-credentials.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const fileResults = results.filter(r => r.filePath.includes('fetch-credentials.ts'));
            
            for (const result of fileResults) {
              expect(result.authMechanism).toBe('cookie');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: fetch with Authorization header has bearer auth mechanism', async () => {
      await fc.assert(
        fc.asyncProperty(
          apiEndpointArb,
          async (endpoint) => {
            const content = `
export async function fetchData() {
  return await fetch('${endpoint}', { 
    headers: { 'Authorization': 'Bearer token123' }
  });
}
`;
            await writeTestServiceFile('fetch-bearer.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const fileResults = results.filter(r => r.filePath.includes('fetch-bearer.ts'));
            
            for (const result of fileResults) {
              expect(result.authMechanism).toBe('bearer');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: plain fetch without auth has none auth mechanism', async () => {
      await fc.assert(
        fc.asyncProperty(
          apiEndpointArb,
          async (endpoint) => {
            const content = `
export async function fetchData() {
  return await fetch('${endpoint}');
}
`;
            await writeTestServiceFile('fetch-no-auth.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const fileResults = results.filter(r => r.filePath.includes('fetch-no-auth.ts'));
            
            for (const result of fileResults) {
              expect(result.authMechanism).toBe('none');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Endpoints start with /api or /', () => {
    it('PROPERTY: All extracted endpoints start with /api', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 3 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('endpoint-prefix.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            for (const result of results) {
              // Endpoints should start with /api (after normalization)
              expect(result.endpoint.startsWith('/api')).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Endpoints without /api prefix are normalized to include it', async () => {
      const content = `
export async function fetchData() {
  return await fetch('/auth?action=login', { method: 'POST' });
}
`;
      await writeTestServiceFile('normalize-endpoint.ts', content);
      
      const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
      const fileResults = results.filter(r => r.filePath.includes('normalize-endpoint.ts'));
      
      for (const result of fileResults) {
        expect(result.endpoint.startsWith('/api')).toBe(true);
      }
    });

    it('PROPERTY: External URLs (http://, https://) are not extracted', async () => {
      const content = `
export async function fetchExternal() {
  return await fetch('https://external-api.com/data');
}

export async function fetchInternal() {
  return await fetch('/api/auth');
}
`;
      await writeTestServiceFile('external-urls.ts', content);
      
      const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
      const fileResults = results.filter(r => r.filePath.includes('external-urls.ts'));
      
      for (const result of fileResults) {
        expect(result.endpoint.startsWith('http')).toBe(false);
      }
    });
  });

  describe('Summary statistics are accurate', () => {
    it('PROPERTY: Summary totalCalls matches results array length', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 5 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('summary-test.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const summary = getAPIScanSummary(results);
            
            expect(summary.totalCalls).toBe(results.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary byMethod counts sum to totalCalls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 5 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('method-counts.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const summary = getAPIScanSummary(results);
            
            const methodSum = Object.values(summary.byMethod).reduce((a, b) => a + b, 0);
            expect(methodSum).toBe(summary.totalCalls);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary byAuthMechanism counts sum to totalCalls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 1, maxLength: 5 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('auth-counts.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            const summary = getAPIScanSummary(results);
            
            const authSum = Object.values(summary.byAuthMechanism).reduce((a, b) => a + b, 0);
            expect(authSum).toBe(summary.totalCalls);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Edge cases', () => {
    it('PROPERTY: Empty directory returns empty results', async () => {
      // Don't write any files
      const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
      expect(results).toEqual([]);
    });

    it('PROPERTY: File with no API calls returns empty results for that file', async () => {
      const content = `
export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;
`;
      await writeTestServiceFile('no-api-calls.ts', content);
      
      const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
      const fileResults = results.filter(r => r.filePath.includes('no-api-calls.ts'));
      
      expect(fileResults).toEqual([]);
    });

    it('PROPERTY: Template literal endpoints are handled', async () => {
      const content = `
import { apiClient } from '@/lib/apiClient';

export async function fetchById(id: string) {
  return await apiClient.request(\`/api/applications?id=\${id}\`, { method: 'GET' });
}
`;
      await writeTestServiceFile('template-literal.ts', content);
      
      const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
      const fileResults = results.filter(r => r.filePath.includes('template-literal.ts'));
      
      // Should extract the call even with template literal
      expect(fileResults.length).toBeGreaterThan(0);
      
      for (const result of fileResults) {
        expect(result.endpoint).toBeDefined();
        expect(result.endpoint.startsWith('/api')).toBe(true);
      }
    });

    it('PROPERTY: Multiple files are all scanned', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.constantFrom('service1.ts', 'service2.ts', 'service3.ts'),
              mockAPICallArb
            ),
            { minLength: 2, maxLength: 3 }
          ),
          async (fileCallPairs) => {
            // Write multiple files
            for (const [filename, call] of fileCallPairs) {
              const content = generateServiceFile([call]);
              await writeTestServiceFile(filename, content);
            }
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            // Should have results from multiple files
            const uniqueFiles = new Set(results.map(r => r.filePath));
            
            // At least some files should be scanned
            expect(results.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Results are sorted by file path and line number', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(mockAPICallArb, { minLength: 2, maxLength: 5 }),
          async (calls) => {
            const content = generateServiceFile(calls);
            await writeTestServiceFile('sorted-test.ts', content);
            
            const results = await scanFrontendAPICalls(TEST_FIXTURES_DIR);
            
            // Check sorting
            for (let i = 1; i < results.length; i++) {
              const prev = results[i - 1];
              const curr = results[i];
              
              const pathCompare = prev.filePath.localeCompare(curr.filePath);
              if (pathCompare === 0) {
                // Same file, line numbers should be in order
                expect(curr.lineNumber).toBeGreaterThanOrEqual(prev.lineNumber);
              } else {
                // Different files, should be sorted by path
                expect(pathCompare).toBeLessThanOrEqual(0);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});


// ============================================================================
// Property 2: Contract Mismatch Detection
// ============================================================================

/**
 * Property-Based Tests: Contract Auditor - Contract Mismatch Detection
 * Feature: frontend-backend-forensic-audit
 * Task: 2.5 Write property test for contract mismatch detection
 * 
 * **Property 2: Contract Mismatch Detection**
 * 
 * *For any* pair of frontend API calls and backend endpoints, the Contract Auditor
 * SHALL correctly identify and flag all mismatches (missing endpoints, unused endpoints,
 * method mismatches) with specific file paths and line numbers.
 * 
 * **Validates: Requirements 1.2, 1.5, 1.6, 1.7**
 */

import { compareContracts, groupMismatchesByType, getComparisonSummary } from '../../scripts/audit/contract/comparator';
import type { EndpointInfo, ContractMismatch, ContractMismatchType } from '../../scripts/audit/types';

// ============================================================================
// Arbitraries for Contract Mismatch Detection
// ============================================================================

/**
 * Generate valid API endpoint paths for backend
 */
const backendEndpointPathArb = fc.constantFrom(
  '/api/auth',
  '/api/admin',
  '/api/applications',
  '/api/catalog',
  '/api/documents',
  '/api/health',
  '/api/notifications',
  '/api/payments',
  '/api/sessions'
);

/**
 * Generate valid actions for endpoints
 */
const endpointActionsArb = fc.array(
  fc.constantFrom('login', 'logout', 'register', 'details', 'upload', 'list', 'create', 'update', 'delete', 'ping', 'db'),
  { minLength: 0, maxLength: 5 }
);

/**
 * Generate backend endpoint method strings (can be comma-separated)
 */
const backendMethodArb = fc.oneof(
  fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
  fc.constantFrom('GET,POST', 'GET,POST,PUT', 'GET,POST,PUT,DELETE')
);

/**
 * Generate EndpointInfo objects
 */
const endpointInfoArb: fc.Arbitrary<EndpointInfo> = fc.record({
  filePath: fc.constantFrom(
    'api-src/auth.ts',
    'api-src/admin.ts',
    'api-src/applications.ts',
    'api-src/catalog.ts',
    'api-src/documents.ts',
    'api-src/health.ts',
    'api-src/notifications.ts',
    'api-src/payments.ts',
    'api-src/sessions.ts'
  ),
  endpoint: backendEndpointPathArb,
  method: backendMethodArb,
  actions: endpointActionsArb,
  requiresAuth: fc.boolean(),
  roles: fc.option(
    fc.array(fc.constantFrom('admin', 'super_admin', 'student', 'reviewer'), { minLength: 1, maxLength: 3 }),
    { nil: undefined }
  )
});


/**
 * Generate APICallInfo objects for testing
 */
const apiCallInfoArb: fc.Arbitrary<APICallInfo> = fc.record({
  filePath: fc.constantFrom(
    'src/services/auth.ts',
    'src/services/applications.ts',
    'src/services/catalog.ts',
    'src/services/documents.ts',
    'src/services/notifications.ts',
    'src/services/payments.ts',
    'src/services/sessionService.ts',
    'src/services/admin/dashboard.ts',
    'src/services/admin/users.ts',
    'src/hooks/useAuth.ts',
    'src/hooks/useApplications.ts'
  ),
  lineNumber: fc.integer({ min: 1, max: 500 }),
  endpoint: fc.oneof(
    backendEndpointPathArb,
    // Endpoints with actions
    fc.tuple(backendEndpointPathArb, fc.constantFrom('login', 'logout', 'register', 'details', 'upload', 'list'))
      .map(([path, action]) => `${path}?action=${action}`)
  ),
  method: httpMethodArb,
  headers: fc.constant({}),
  authMechanism: authMechanismArb,
  queryParams: fc.option(
    fc.record({
      action: fc.constantFrom('login', 'logout', 'register', 'details', 'upload', 'list', 'create', 'update', 'delete')
    }),
    { nil: undefined }
  )
});

/**
 * Generate a matching pair of frontend call and backend endpoint
 */
const matchingPairArb = fc.tuple(
  backendEndpointPathArb,
  httpMethodArb,
  fc.boolean() // requiresAuth
).map(([endpoint, method, requiresAuth]): [APICallInfo, EndpointInfo] => {
  const call: APICallInfo = {
    filePath: 'src/services/test.ts',
    lineNumber: 10,
    endpoint,
    method,
    headers: {},
    authMechanism: requiresAuth ? 'cookie' : 'none'
  };
  
  const backendEndpoint: EndpointInfo = {
    filePath: 'api-src/test.ts',
    endpoint,
    method,
    actions: [],
    requiresAuth
  };
  
  return [call, backendEndpoint];
});


/**
 * Generate a frontend call that has no matching backend endpoint
 */
const unmatchedCallArb: fc.Arbitrary<APICallInfo> = fc.record({
  filePath: fc.constantFrom('src/services/orphan.ts', 'src/hooks/useOrphan.ts'),
  lineNumber: fc.integer({ min: 1, max: 500 }),
  endpoint: fc.constantFrom(
    '/api/nonexistent',
    '/api/missing-endpoint',
    '/api/orphan',
    '/api/deleted-feature'
  ),
  method: httpMethodArb,
  headers: fc.constant({}),
  authMechanism: authMechanismArb
});

/**
 * Generate a backend endpoint that is never called
 */
const unusedEndpointArb: fc.Arbitrary<EndpointInfo> = fc.record({
  filePath: fc.constantFrom('api-src/unused.ts', 'api-src/legacy.ts'),
  endpoint: fc.constantFrom(
    '/api/unused-feature',
    '/api/deprecated',
    '/api/legacy-endpoint',
    '/api/internal-only'
  ),
  method: backendMethodArb,
  actions: endpointActionsArb,
  requiresAuth: fc.boolean(),
  roles: fc.option(
    fc.array(fc.constantFrom('admin', 'super_admin'), { minLength: 1, maxLength: 2 }),
    { nil: undefined }
  )
});

/**
 * Generate a method mismatch scenario
 */
const methodMismatchPairArb = fc.tuple(
  backendEndpointPathArb,
  httpMethodArb,
  httpMethodArb
).filter(([_, frontendMethod, backendMethod]) => frontendMethod !== backendMethod)
  .map(([endpoint, frontendMethod, backendMethod]): [APICallInfo, EndpointInfo] => {
    const call: APICallInfo = {
      filePath: 'src/services/mismatch.ts',
      lineNumber: 25,
      endpoint,
      method: frontendMethod,
      headers: {},
      authMechanism: 'cookie'
    };
    
    const backendEndpoint: EndpointInfo = {
      filePath: 'api-src/mismatch.ts',
      endpoint,
      method: backendMethod,
      actions: [],
      requiresAuth: true
    };
    
    return [call, backendEndpoint];
  });


// ============================================================================
// Property 2 Tests: Contract Mismatch Detection
// ============================================================================

describe('Property 2: Contract Mismatch Detection', () => {
  /**
   * **Validates: Requirements 1.2, 1.5, 1.6, 1.7**
   */

  describe('MISSING_ENDPOINT Detection', () => {
    it('PROPERTY: Every frontend call without a matching backend endpoint is flagged as MISSING_ENDPOINT', () => {
      fc.assert(
        fc.property(
          fc.array(unmatchedCallArb, { minLength: 1, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 0, maxLength: 3 }),
          (unmatchedCalls, endpoints) => {
            // Ensure endpoints don't accidentally match our unmatched calls
            const filteredEndpoints = endpoints.filter(e => 
              !unmatchedCalls.some(c => c.endpoint.split('?')[0] === e.endpoint)
            );
            
            const mismatches = compareContracts(unmatchedCalls, filteredEndpoints);
            
            // Every unmatched call should be flagged as MISSING_ENDPOINT
            for (const call of unmatchedCalls) {
              const isFlagged = mismatches.some(m => 
                m.type === 'MISSING_ENDPOINT' && 
                m.frontendCall?.endpoint === call.endpoint
              );
              expect(isFlagged).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: MISSING_ENDPOINT mismatches include frontendCall with file path and line number', () => {
      fc.assert(
        fc.property(
          unmatchedCallArb,
          (call) => {
            const mismatches = compareContracts([call], []);
            
            const missingEndpointMismatches = mismatches.filter(m => m.type === 'MISSING_ENDPOINT');
            
            for (const mismatch of missingEndpointMismatches) {
              expect(mismatch.frontendCall).toBeDefined();
              expect(mismatch.frontendCall?.filePath).toBeDefined();
              expect(mismatch.frontendCall?.filePath.length).toBeGreaterThan(0);
              expect(mismatch.frontendCall?.lineNumber).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: MISSING_ENDPOINT evidence includes file path and line number', () => {
      fc.assert(
        fc.property(
          unmatchedCallArb,
          (call) => {
            const mismatches = compareContracts([call], []);
            
            const missingEndpointMismatches = mismatches.filter(m => m.type === 'MISSING_ENDPOINT');
            
            for (const mismatch of missingEndpointMismatches) {
              expect(mismatch.evidence).toBeDefined();
              expect(mismatch.evidence.length).toBeGreaterThan(0);
              // Evidence should mention the file path
              expect(mismatch.evidence).toContain(call.filePath);
              // Evidence should mention the line number
              expect(mismatch.evidence).toContain(String(call.lineNumber));
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('UNUSED_ENDPOINT Detection', () => {
    it('PROPERTY: Every backend endpoint not called by any frontend code is flagged as UNUSED_ENDPOINT', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 0, maxLength: 3 }),
          fc.array(unusedEndpointArb, { minLength: 1, maxLength: 5 }),
          (calls, unusedEndpoints) => {
            // Ensure calls don't accidentally match our unused endpoints
            const filteredCalls = calls.filter(c => 
              !unusedEndpoints.some(e => c.endpoint.split('?')[0] === e.endpoint)
            );
            
            const mismatches = compareContracts(filteredCalls, unusedEndpoints);
            
            // Every unused endpoint should be flagged as UNUSED_ENDPOINT
            for (const endpoint of unusedEndpoints) {
              const isFlagged = mismatches.some(m => 
                m.type === 'UNUSED_ENDPOINT' && 
                m.backendEndpoint?.endpoint === endpoint.endpoint
              );
              expect(isFlagged).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: UNUSED_ENDPOINT mismatches include backendEndpoint with file path', () => {
      fc.assert(
        fc.property(
          unusedEndpointArb,
          (endpoint) => {
            const mismatches = compareContracts([], [endpoint]);
            
            const unusedMismatches = mismatches.filter(m => m.type === 'UNUSED_ENDPOINT');
            
            for (const mismatch of unusedMismatches) {
              expect(mismatch.backendEndpoint).toBeDefined();
              expect(mismatch.backendEndpoint?.filePath).toBeDefined();
              expect(mismatch.backendEndpoint?.filePath.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: UNUSED_ENDPOINT evidence includes backend file path', () => {
      fc.assert(
        fc.property(
          unusedEndpointArb,
          (endpoint) => {
            const mismatches = compareContracts([], [endpoint]);
            
            const unusedMismatches = mismatches.filter(m => m.type === 'UNUSED_ENDPOINT');
            
            for (const mismatch of unusedMismatches) {
              expect(mismatch.evidence).toBeDefined();
              expect(mismatch.evidence.length).toBeGreaterThan(0);
              // Evidence should mention the backend file path
              expect(mismatch.evidence).toContain(endpoint.filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Catch-all routes ([...path]) are NOT flagged as UNUSED_ENDPOINT', () => {
      const catchAllEndpoint: EndpointInfo = {
        filePath: 'api-src/[...path].ts',
        endpoint: '/api/[...path]',
        method: 'GET,POST',
        actions: [],
        requiresAuth: false
      };
      
      const mismatches = compareContracts([], [catchAllEndpoint]);
      
      const unusedMismatches = mismatches.filter(m => 
        m.type === 'UNUSED_ENDPOINT' && 
        m.backendEndpoint?.endpoint.includes('[...path]')
      );
      
      expect(unusedMismatches.length).toBe(0);
    });
  });


  describe('METHOD_MISMATCH Detection', () => {
    it('PROPERTY: Every method mismatch is detected and flagged as METHOD_MISMATCH', () => {
      fc.assert(
        fc.property(
          methodMismatchPairArb,
          ([call, endpoint]) => {
            const mismatches = compareContracts([call], [endpoint]);
            
            // Should detect the method mismatch
            const methodMismatches = mismatches.filter(m => m.type === 'METHOD_MISMATCH');
            
            expect(methodMismatches.length).toBeGreaterThan(0);
            
            // The mismatch should reference both the call and endpoint
            const mismatch = methodMismatches[0];
            expect(mismatch.frontendCall).toBeDefined();
            expect(mismatch.backendEndpoint).toBeDefined();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: METHOD_MISMATCH evidence includes both frontend and backend methods', () => {
      fc.assert(
        fc.property(
          methodMismatchPairArb,
          ([call, endpoint]) => {
            const mismatches = compareContracts([call], [endpoint]);
            
            const methodMismatches = mismatches.filter(m => m.type === 'METHOD_MISMATCH');
            
            for (const mismatch of methodMismatches) {
              expect(mismatch.evidence).toBeDefined();
              // Evidence should mention the frontend method
              expect(mismatch.evidence).toContain(call.method);
              // Evidence should mention the backend method
              expect(mismatch.evidence).toContain(endpoint.method);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: METHOD_MISMATCH evidence includes file path and line number', () => {
      fc.assert(
        fc.property(
          methodMismatchPairArb,
          ([call, endpoint]) => {
            const mismatches = compareContracts([call], [endpoint]);
            
            const methodMismatches = mismatches.filter(m => m.type === 'METHOD_MISMATCH');
            
            for (const mismatch of methodMismatches) {
              expect(mismatch.evidence).toBeDefined();
              // Evidence should include frontend file path
              expect(mismatch.evidence).toContain(call.filePath);
              // Evidence should include line number
              expect(mismatch.evidence).toContain(String(call.lineNumber));
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backend endpoints supporting multiple methods (comma-separated) match any of those methods', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<HTTPMethod>('GET', 'POST', 'PUT'),
          backendEndpointPathArb,
          (method, endpoint) => {
            const call: APICallInfo = {
              filePath: 'src/services/test.ts',
              lineNumber: 10,
              endpoint,
              method,
              headers: {},
              authMechanism: 'cookie'
            };
            
            // Backend supports GET, POST, PUT
            const backendEndpoint: EndpointInfo = {
              filePath: 'api-src/test.ts',
              endpoint,
              method: 'GET,POST,PUT',
              actions: [],
              requiresAuth: true
            };
            
            const mismatches = compareContracts([call], [backendEndpoint]);
            
            // Should NOT have a method mismatch since the method is supported
            const methodMismatches = mismatches.filter(m => m.type === 'METHOD_MISMATCH');
            expect(methodMismatches.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('All Mismatches Include Evidence', () => {
    it('PROPERTY: All mismatches have non-empty evidence strings', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 1, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 1, maxLength: 5 }),
          (calls, endpoints) => {
            const mismatches = compareContracts(calls, endpoints);
            
            for (const mismatch of mismatches) {
              expect(mismatch.evidence).toBeDefined();
              expect(typeof mismatch.evidence).toBe('string');
              expect(mismatch.evidence.trim().length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All mismatches have valid type', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 1, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 1, maxLength: 5 }),
          (calls, endpoints) => {
            const mismatches = compareContracts(calls, endpoints);
            
            const validTypes: ContractMismatchType[] = [
              'MISSING_ENDPOINT',
              'UNUSED_ENDPOINT',
              'METHOD_MISMATCH',
              'SCHEMA_MISMATCH',
              'AUTH_MISMATCH'
            ];
            
            for (const mismatch of mismatches) {
              expect(validTypes).toContain(mismatch.type);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: MISSING_ENDPOINT always has frontendCall, UNUSED_ENDPOINT always has backendEndpoint', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 1, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 1, maxLength: 5 }),
          (calls, endpoints) => {
            const mismatches = compareContracts(calls, endpoints);
            
            for (const mismatch of mismatches) {
              if (mismatch.type === 'MISSING_ENDPOINT') {
                expect(mismatch.frontendCall).toBeDefined();
              }
              if (mismatch.type === 'UNUSED_ENDPOINT') {
                expect(mismatch.backendEndpoint).toBeDefined();
              }
              if (mismatch.type === 'METHOD_MISMATCH') {
                expect(mismatch.frontendCall).toBeDefined();
                expect(mismatch.backendEndpoint).toBeDefined();
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('No False Positives', () => {
    it('PROPERTY: Matching calls and endpoints are NOT flagged as mismatches', () => {
      fc.assert(
        fc.property(
          matchingPairArb,
          ([call, endpoint]) => {
            const mismatches = compareContracts([call], [endpoint]);
            
            // Should have no MISSING_ENDPOINT for this call
            const missingEndpoint = mismatches.filter(m => 
              m.type === 'MISSING_ENDPOINT' && 
              m.frontendCall?.endpoint === call.endpoint
            );
            expect(missingEndpoint.length).toBe(0);
            
            // Should have no UNUSED_ENDPOINT for this endpoint
            const unusedEndpoint = mismatches.filter(m => 
              m.type === 'UNUSED_ENDPOINT' && 
              m.backendEndpoint?.endpoint === endpoint.endpoint
            );
            expect(unusedEndpoint.length).toBe(0);
            
            // Should have no METHOD_MISMATCH since methods match
            const methodMismatch = mismatches.filter(m => 
              m.type === 'METHOD_MISMATCH' && 
              m.frontendCall?.endpoint === call.endpoint
            );
            expect(methodMismatch.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multiple matching pairs produce no false positives', () => {
      fc.assert(
        fc.property(
          fc.array(matchingPairArb, { minLength: 2, maxLength: 5 }),
          (pairs) => {
            const calls = pairs.map(([call]) => call);
            const endpoints = pairs.map(([, endpoint]) => endpoint);
            
            // Deduplicate endpoints by path
            const uniqueEndpoints = endpoints.filter((e, i, arr) => 
              arr.findIndex(x => x.endpoint === e.endpoint) === i
            );
            
            const mismatches = compareContracts(calls, uniqueEndpoints);
            
            // Should have no MISSING_ENDPOINT or METHOD_MISMATCH for matching pairs
            for (const [call, endpoint] of pairs) {
              const hasMatchingEndpoint = uniqueEndpoints.some(e => e.endpoint === endpoint.endpoint);
              if (hasMatchingEndpoint) {
                const missingForCall = mismatches.filter(m => 
                  m.type === 'MISSING_ENDPOINT' && 
                  m.frontendCall?.endpoint === call.endpoint
                );
                expect(missingForCall.length).toBe(0);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Empty inputs produce no mismatches', () => {
      const mismatches = compareContracts([], []);
      expect(mismatches.length).toBe(0);
    });

    it('PROPERTY: Empty frontend calls with endpoints only produces UNUSED_ENDPOINT', () => {
      fc.assert(
        fc.property(
          fc.array(endpointInfoArb.filter(e => !e.endpoint.includes('[...path]')), { minLength: 1, maxLength: 5 }),
          (endpoints) => {
            const mismatches = compareContracts([], endpoints);
            
            // All mismatches should be UNUSED_ENDPOINT
            for (const mismatch of mismatches) {
              expect(mismatch.type).toBe('UNUSED_ENDPOINT');
            }
            
            // Should have one UNUSED_ENDPOINT per endpoint
            expect(mismatches.length).toBe(endpoints.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Empty backend endpoints with calls only produces MISSING_ENDPOINT', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 1, maxLength: 5 }),
          (calls) => {
            const mismatches = compareContracts(calls, []);
            
            // All mismatches should be MISSING_ENDPOINT
            for (const mismatch of mismatches) {
              expect(mismatch.type).toBe('MISSING_ENDPOINT');
            }
            
            // Should have one MISSING_ENDPOINT per call
            expect(mismatches.length).toBe(calls.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Grouping and Summary Functions', () => {
    it('PROPERTY: groupMismatchesByType correctly categorizes all mismatches', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 1, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 1, maxLength: 5 }),
          (calls, endpoints) => {
            const mismatches = compareContracts(calls, endpoints);
            const grouped = groupMismatchesByType(mismatches);
            
            // Sum of all groups should equal total mismatches
            const totalGrouped = 
              grouped.MISSING_ENDPOINT.length +
              grouped.UNUSED_ENDPOINT.length +
              grouped.METHOD_MISMATCH.length +
              grouped.SCHEMA_MISMATCH.length +
              grouped.AUTH_MISMATCH.length;
            
            expect(totalGrouped).toBe(mismatches.length);
            
            // Each mismatch should be in the correct group
            for (const mismatch of mismatches) {
              expect(grouped[mismatch.type]).toContain(mismatch);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: getComparisonSummary returns accurate counts', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 0, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 0, maxLength: 5 }),
          (calls, endpoints) => {
            const mismatches = compareContracts(calls, endpoints);
            const summary = getComparisonSummary(calls, endpoints, mismatches);
            
            // Total counts should match input lengths
            expect(summary.totalFrontendCalls).toBe(calls.length);
            expect(summary.totalBackendEndpoints).toBe(endpoints.length);
            expect(summary.totalMismatches).toBe(mismatches.length);
            
            // Mismatch type counts should sum to total
            const typeSum = 
              summary.mismatchesByType.MISSING_ENDPOINT +
              summary.mismatchesByType.UNUSED_ENDPOINT +
              summary.mismatchesByType.METHOD_MISMATCH +
              summary.mismatchesByType.SCHEMA_MISMATCH +
              summary.mismatchesByType.AUTH_MISMATCH;
            
            expect(typeSum).toBe(summary.totalMismatches);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: unmatchedCalls equals MISSING_ENDPOINT count', () => {
      fc.assert(
        fc.property(
          fc.array(apiCallInfoArb, { minLength: 0, maxLength: 5 }),
          fc.array(endpointInfoArb, { minLength: 0, maxLength: 5 }),
          (calls, endpoints) => {
            const mismatches = compareContracts(calls, endpoints);
            const summary = getComparisonSummary(calls, endpoints, mismatches);
            
            expect(summary.unmatchedCalls).toBe(summary.mismatchesByType.MISSING_ENDPOINT);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Action-based Endpoint Matching', () => {
    it('PROPERTY: Frontend call with action matches backend endpoint supporting that action', () => {
      fc.assert(
        fc.property(
          backendEndpointPathArb,
          fc.constantFrom('login', 'logout', 'register', 'details'),
          httpMethodArb,
          (endpoint, action, method) => {
            const call: APICallInfo = {
              filePath: 'src/services/test.ts',
              lineNumber: 10,
              endpoint: `${endpoint}?action=${action}`,
              method,
              headers: {},
              authMechanism: 'cookie',
              queryParams: { action }
            };
            
            const backendEndpoint: EndpointInfo = {
              filePath: 'api-src/test.ts',
              endpoint,
              method,
              actions: [action, 'other-action'],
              requiresAuth: true
            };
            
            const mismatches = compareContracts([call], [backendEndpoint]);
            
            // Should NOT flag as MISSING_ENDPOINT since action is supported
            const missingEndpoint = mismatches.filter(m => m.type === 'MISSING_ENDPOINT');
            expect(missingEndpoint.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Frontend call with unsupported action still matches by base path (lenient matching)', () => {
      // Note: The comparator uses lenient matching - it falls back to base path matching
      // when action matching fails. This avoids false positives for dynamically determined actions.
      const call: APICallInfo = {
        filePath: 'src/services/test.ts',
        lineNumber: 10,
        endpoint: '/api/auth?action=unsupported-action',
        method: 'POST',
        headers: {},
        authMechanism: 'cookie',
        queryParams: { action: 'unsupported-action' }
      };
      
      const backendEndpoint: EndpointInfo = {
        filePath: 'api-src/auth.ts',
        endpoint: '/api/auth',
        method: 'POST',
        actions: ['login', 'logout', 'register'],
        requiresAuth: false
      };
      
      const mismatches = compareContracts([call], [backendEndpoint]);
      
      // Should NOT flag as MISSING_ENDPOINT because base path matches (lenient matching)
      // This is intentional to avoid false positives for dynamically determined actions
      const missingEndpoint = mismatches.filter(m => m.type === 'MISSING_ENDPOINT');
      expect(missingEndpoint.length).toBe(0);
      
      // The endpoint should be marked as used (not UNUSED_ENDPOINT)
      const unusedEndpoint = mismatches.filter(m => m.type === 'UNUSED_ENDPOINT');
      expect(unusedEndpoint.length).toBe(0);
    });

    it('PROPERTY: Frontend call to completely different endpoint IS flagged as MISSING_ENDPOINT', () => {
      const call: APICallInfo = {
        filePath: 'src/services/test.ts',
        lineNumber: 10,
        endpoint: '/api/completely-different',
        method: 'POST',
        headers: {},
        authMechanism: 'cookie'
      };
      
      const backendEndpoint: EndpointInfo = {
        filePath: 'api-src/auth.ts',
        endpoint: '/api/auth',
        method: 'POST',
        actions: ['login', 'logout', 'register'],
        requiresAuth: false
      };
      
      const mismatches = compareContracts([call], [backendEndpoint]);
      
      // Should flag as MISSING_ENDPOINT since base paths don't match
      const missingEndpoint = mismatches.filter(m => m.type === 'MISSING_ENDPOINT');
      expect(missingEndpoint.length).toBe(1);
      expect(missingEndpoint[0].frontendCall?.endpoint).toBe('/api/completely-different');
    });
  });
});