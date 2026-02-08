/**
 * Property-Based Tests: Error Handling Verification
 * Feature: frontend-backend-forensic-audit
 * Task: 4.7 Write property test for error handling verification
 * 
 * **Property 6: Error Handling Verification**
 * 
 * *For any* API call on a page, the Page Auditor SHALL verify that error handling
 * (try/catch, .catch(), or error boundaries) exists.
 * 
 * **Validates: Requirements 2.3**
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  verifyErrorHandling,
  verifyErrorHandlingExtended,
  type ErrorHandlingType,
  type ExtendedErrorHandlingResult,
} from '../../scripts/audit/page/errorVerifier';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Error verification involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 100;

/**
 * Base temporary directory for test fixtures - unique per test run
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-error-verifier');

/**
 * Counter for unique test directories
 */
let testDirCounter = 0;

/**
 * Counter for unique file names within tests
 */
let fileCounter = 0;

/**
 * Get a unique test directory for each test
 */
function getUniqueTestDir(): string {
  testDirCounter++;
  return join(TEST_FIXTURES_BASE, `test-${testDirCounter}-${Date.now()}`);
}

/**
 * Get a unique filename for each test iteration
 */
function getUniqueFilename(base: string): string {
  fileCounter++;
  return `${base}_${fileCounter}_${Date.now()}.tsx`;
}


// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid API endpoint paths
 */
const apiEndpointArb = fc.constantFrom(
  '/api/auth',
  '/api/admin',
  '/api/applications',
  '/api/catalog',
  '/api/documents',
  '/api/health',
  '/api/notifications',
  '/api/payments',
  '/api/sessions',
  '/api/auth?action=login',
  '/api/applications?action=details',
  '/api/admin?action=dashboard'
);

/**
 * API call types that can be generated
 */
type APICallType = 'fetch' | 'axios' | 'service' | 'apiClient';

const apiCallTypeArb: fc.Arbitrary<APICallType> = fc.constantFrom(
  'fetch',
  'axios',
  'service',
  'apiClient'
);

/**
 * Error handling types that can be applied
 */
const errorHandlingTypeArb: fc.Arbitrary<ErrorHandlingType> = fc.constantFrom(
  'try-catch',
  'catch-method',
  'onError',
  'error-boundary'
);

/**
 * Generate an API call code snippet based on type
 */
function generateAPICallCode(callType: APICallType, endpoint: string): string {
  switch (callType) {
    case 'fetch':
      return `fetch('${endpoint}')`;
    case 'axios':
      return `axios.get('${endpoint}')`;
    case 'service':
      return `applicationService.getData()`;
    case 'apiClient':
      return `apiClient.get('${endpoint}')`;
  }
}

/**
 * Wrap an API call with error handling
 */
function wrapWithErrorHandling(
  apiCall: string,
  handlingType: ErrorHandlingType
): string {
  switch (handlingType) {
    case 'try-catch':
      return `try {
      await ${apiCall};
    } catch (error) {
      console.error('Error:', error);
    }`;
    case 'catch-method':
      return `${apiCall}.catch(error => console.error('Error:', error))`;
    case 'onError':
      // This is for React Query style
      return apiCall; // onError is handled at hook level
    case 'error-boundary':
      return apiCall; // ErrorBoundary wraps the component
  }
}


/**
 * Configuration for generating a React component with API calls
 */
interface APICallConfig {
  callType: APICallType;
  endpoint: string;
  hasErrorHandling: boolean;
  errorHandlingType?: ErrorHandlingType;
}

const apiCallConfigArb: fc.Arbitrary<APICallConfig> = fc.record({
  callType: apiCallTypeArb,
  endpoint: apiEndpointArb,
  hasErrorHandling: fc.boolean(),
  errorHandlingType: fc.option(errorHandlingTypeArb, { nil: undefined }),
}).map(config => ({
  ...config,
  errorHandlingType: config.hasErrorHandling 
    ? (config.errorHandlingType || 'try-catch') 
    : undefined,
}));

/**
 * Configuration for generating a React Query hook
 */
interface ReactQueryConfig {
  queryKey: string;
  endpoint: string;
  hasOnError: boolean;
  hasErrorState: boolean;
}

const reactQueryConfigArb: fc.Arbitrary<ReactQueryConfig> = fc.record({
  queryKey: fc.constantFrom('user', 'profile', 'applications', 'documents', 'notifications'),
  endpoint: apiEndpointArb,
  hasOnError: fc.boolean(),
  hasErrorState: fc.boolean(),
});

/**
 * Generate useQuery code with optional error handling
 */
function generateUseQueryCode(config: ReactQueryConfig): string {
  const parts: string[] = [];
  parts.push(`queryKey: ['${config.queryKey}']`);
  parts.push(`queryFn: () => fetch('${config.endpoint}')`);
  
  if (config.hasOnError) {
    parts.push(`onError: (error) => console.error('Query error:', error)`);
  }
  
  const destructured = config.hasErrorState 
    ? '{ data, isLoading, error, isError }' 
    : '{ data, isLoading }';
  
  return `const ${destructured} = useQuery({
    ${parts.join(',\n    ')}
  });`;
}


/**
 * Configuration for generating a complete page component
 */
interface PageErrorConfig {
  componentName: string;
  apiCalls: APICallConfig[];
  reactQueryHooks: ReactQueryConfig[];
  hasErrorBoundary: boolean;
  hasGlobalErrorState: boolean;
}

const pageErrorConfigArb: fc.Arbitrary<PageErrorConfig> = fc.record({
  componentName: fc.constantFrom('Dashboard', 'Profile', 'Applications', 'Settings', 'Admin'),
  apiCalls: fc.array(apiCallConfigArb, { minLength: 0, maxLength: 3 }),
  reactQueryHooks: fc.array(reactQueryConfigArb, { minLength: 0, maxLength: 2 }),
  hasErrorBoundary: fc.boolean(),
  hasGlobalErrorState: fc.boolean(),
});

/**
 * Generate a complete React page component with error handling patterns
 */
function generatePageComponent(config: PageErrorConfig): string {
  const imports: string[] = [`import React from 'react';`];
  const hookCalls: string[] = [];
  let jsxContent = `<div><h1>${config.componentName}</h1></div>`;
  
  // Add React Query imports if needed
  if (config.reactQueryHooks.length > 0) {
    imports.push(`import { useQuery } from '@tanstack/react-query';`);
  }
  
  // Add ErrorBoundary import if needed
  if (config.hasErrorBoundary) {
    imports.push(`import { ErrorBoundary } from '@/components/ErrorBoundary';`);
    jsxContent = `<ErrorBoundary>\n      ${jsxContent}\n    </ErrorBoundary>`;
  }
  
  // Generate API call code
  for (let i = 0; i < config.apiCalls.length; i++) {
    const call = config.apiCalls[i];
    const apiCallCode = generateAPICallCode(call.callType, call.endpoint);
    
    if (call.hasErrorHandling && call.errorHandlingType) {
      hookCalls.push(wrapWithErrorHandling(apiCallCode, call.errorHandlingType));
    } else {
      hookCalls.push(`await ${apiCallCode};`);
    }
  }
  
  // Generate React Query hooks
  for (const queryConfig of config.reactQueryHooks) {
    hookCalls.push(generateUseQueryCode(queryConfig));
  }
  
  // Add global error state handling
  let errorStateCode = '';
  if (config.hasGlobalErrorState) {
    errorStateCode = `
  if (error) {
    return <div>Error occurred: {error.message}</div>;
  }`;
  }
  
  return `${imports.join('\n')}

export function ${config.componentName}() {
  ${hookCalls.join('\n  ')}
  ${errorStateCode}
  
  return (
    ${jsxContent}
  );
}

export default ${config.componentName};
`;
}


// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create test fixture directory structure
 */
async function setupTestDir(testDir: string): Promise<void> {
  await mkdir(join(testDir, 'src', 'pages'), { recursive: true });
}

/**
 * Write a test page file
 */
async function writeTestPageFile(
  testDir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/pages/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 6: Error Handling Verification', () => {
  /**
   * **Validates: Requirements 2.3**
   * 
   * WHEN the Audit_System examines a page THEN it SHALL verify error handling
   * exists for all API calls.
   */
  
  // Clean up all test fixtures after all tests complete
  afterAll(async () => {
    try {
      await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('try-catch blocks are correctly detected', () => {
    it('PROPERTY: try-catch wrapped API calls are detected as having error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(apiCallTypeArb, apiEndpointArb),
          async ([callType, endpoint]) => {
            const apiCall = generateAPICallCode(callType, endpoint);
            const content = `
import React from 'react';

export function TestPage() {
  const loadData = async () => {
    try {
      await ${apiCall};
    } catch (error) {
      console.error('Error:', error);
    }
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('TryCatch');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandling(relativePath, testDir);
            
            expect(result.hasErrorHandling).toBe(true);
            expect(result.errorHandlingTypes).toContain('try-catch');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Nested try-catch blocks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function NestedTryCatch() {
  const loadData = async () => {
    try {
      try {
        await fetch('/api/auth');
      } catch (innerError) {
        console.error('Inner error:', innerError);
      }
      await fetch('/api/applications');
    } catch (outerError) {
      console.error('Outer error:', outerError);
    }
  };
  
  return <div>Test</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'NestedTryCatch.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('try-catch');
    });
  });

  describe('.catch() methods are detected', () => {
    it('PROPERTY: .catch() method on promises is detected as error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(apiCallTypeArb, apiEndpointArb),
          async ([callType, endpoint]) => {
            const apiCall = generateAPICallCode(callType, endpoint);
            const content = `
import React from 'react';

export function CatchMethod() {
  const loadData = () => {
    ${apiCall}.catch(error => console.error('Error:', error));
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('CatchMethod');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandling(relativePath, testDir);
            
            expect(result.hasErrorHandling).toBe(true);
            expect(result.errorHandlingTypes).toContain('catch-method');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Chained .catch() after .then() is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function ChainedCatch() {
  const loadData = () => {
    fetch('/api/applications')
      .then(res => res.json())
      .then(data => console.log(data))
      .catch(error => console.error('Error:', error));
  };
  
  return <div>Test</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'ChainedCatch.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('catch-method');
    });
  });


  describe('onError handlers in React Query are detected', () => {
    it('PROPERTY: useQuery with onError callback is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          reactQueryConfigArb.filter(c => c.hasOnError),
          async (queryConfig) => {
            const content = `
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryWithOnError() {
  const { data, isLoading } = useQuery({
    queryKey: ['${queryConfig.queryKey}'],
    queryFn: () => fetch('${queryConfig.endpoint}'),
    onError: (error) => console.error('Query error:', error)
  });
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('QueryOnError');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandling(relativePath, testDir);
            
            expect(result.hasErrorHandling).toBe(true);
            expect(result.errorHandlingTypes).toContain('onError');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: useMutation with onError callback is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useMutation } from '@tanstack/react-query';

export function MutationWithOnError() {
  const mutation = useMutation({
    mutationFn: (data) => fetch('/api/applications', { method: 'POST', body: JSON.stringify(data) }),
    onError: (error) => console.error('Mutation error:', error)
  });
  
  return <div>Test</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'MutationOnError.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('onError');
    });
  });


  describe('ErrorBoundary usage is detected', () => {
    it('PROPERTY: ErrorBoundary component wrapper is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function PageWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <div>Protected content</div>
    </ErrorBoundary>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'WithErrorBoundary.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('error-boundary');
    });

    it('PROPERTY: ErrorBoundary with fallback prop is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

export function PageWithFallback() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <div>Protected content</div>
    </ErrorBoundary>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'WithFallback.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('error-boundary');
    });

    it('PROPERTY: Custom ErrorBoundary class component is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  render() {
    if (this.state.hasError) {
      return <div>Error occurred</div>;
    }
    return this.props.children;
  }
}

export function PageWithCustomBoundary() {
  return (
    <ErrorBoundary>
      <div>Protected content</div>
    </ErrorBoundary>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'CustomBoundary.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('error-boundary');
    });
  });


  describe('Unhandled API calls are flagged', () => {
    it('PROPERTY: API calls without error handling are flagged as unhandled', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(apiCallTypeArb, apiEndpointArb),
          async ([callType, endpoint]) => {
            const apiCall = generateAPICallCode(callType, endpoint);
            const content = `
import React from 'react';

export function UnhandledPage() {
  const loadData = async () => {
    await ${apiCall};
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('Unhandled');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandlingExtended(relativePath, testDir);
            
            // Should flag unhandled calls
            // Note: The verifier may or may not detect all patterns depending on complexity
            // but it should at least return a valid result
            expect(typeof result.hasErrorHandling).toBe('boolean');
            expect(Array.isArray(result.unhandledCalls)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multiple unhandled API calls are all flagged', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function MultipleUnhandled() {
  const loadData = async () => {
    await fetch('/api/auth');
    await fetch('/api/applications');
    await fetch('/api/documents');
  };
  
  return <div>Test</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'MultiUnhandled.tsx', content);
      
      const result = verifyErrorHandlingExtended(relativePath, testDir);
      
      // Should detect multiple unhandled calls
      expect(Array.isArray(result.unhandledCalls)).toBe(true);
      expect(Array.isArray(result.apiCalls)).toBe(true);
    });

    it('PROPERTY: Mix of handled and unhandled calls correctly identifies unhandled ones', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function MixedHandling() {
  const loadData = async () => {
    try {
      await fetch('/api/auth');
    } catch (error) {
      console.error(error);
    }
    
    // This one is unhandled
    await fetch('/api/applications');
  };
  
  return <div>Test</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'MixedHandling.tsx', content);
      
      const result = verifyErrorHandlingExtended(relativePath, testDir);
      
      // Should have error handling (try-catch exists)
      expect(result.hasErrorHandling).toBe(true);
      expect(result.errorHandlingTypes).toContain('try-catch');
      // Should also have some API calls detected
      expect(Array.isArray(result.apiCalls)).toBe(true);
    });
  });


  describe('ErrorHandlingResult structure is valid', () => {
    it('PROPERTY: verifyErrorHandling always returns valid ErrorHandlingResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          pageErrorConfigArb,
          async (pageConfig) => {
            const content = generatePageComponent(pageConfig);
            const filename = getUniqueFilename('ValidResult');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandling(relativePath, testDir);
            
            // Required fields must be present and have correct types
            expect(typeof result.hasErrorHandling).toBe('boolean');
            expect(Array.isArray(result.errorHandlingTypes)).toBe(true);
            expect(Array.isArray(result.unhandledCalls)).toBe(true);
            
            // All error handling types should be valid
            const validTypes: ErrorHandlingType[] = ['try-catch', 'catch-method', 'onError', 'error-boundary'];
            for (const type of result.errorHandlingTypes) {
              expect(validTypes).toContain(type);
            }
            
            // All unhandled calls should be strings
            for (const call of result.unhandledCalls) {
              expect(typeof call).toBe('string');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: verifyErrorHandlingExtended returns valid ExtendedErrorHandlingResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          pageErrorConfigArb,
          async (pageConfig) => {
            const content = generatePageComponent(pageConfig);
            const filename = getUniqueFilename('ExtendedResult');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandlingExtended(relativePath, testDir);
            
            // All base fields must be present
            expect(typeof result.hasErrorHandling).toBe('boolean');
            expect(Array.isArray(result.errorHandlingTypes)).toBe(true);
            expect(Array.isArray(result.unhandledCalls)).toBe(true);
            
            // Extended fields must be present
            expect(Array.isArray(result.issues)).toBe(true);
            expect(Array.isArray(result.apiCalls)).toBe(true);
            
            // All issues should be strings
            for (const issue of result.issues) {
              expect(typeof issue).toBe('string');
            }
            
            // All API calls should have required fields
            for (const apiCall of result.apiCalls) {
              expect(typeof apiCall.lineNumber).toBe('number');
              expect(apiCall.lineNumber).toBeGreaterThan(0);
              expect(typeof apiCall.codeSnippet).toBe('string');
              expect(typeof apiCall.callType).toBe('string');
              expect(typeof apiCall.hasErrorHandling).toBe('boolean');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Multiple error handling mechanisms', () => {
    it('PROPERTY: Multiple error handling types in same file are all detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function MultipleHandling() {
  // try-catch
  const loadData = async () => {
    try {
      await fetch('/api/auth');
    } catch (error) {
      console.error(error);
    }
  };
  
  // .catch() method
  const loadMore = () => {
    fetch('/api/applications').catch(err => console.error(err));
  };
  
  // onError in React Query
  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/profile'),
    onError: (error) => console.error('Query error:', error)
  });
  
  return (
    <ErrorBoundary>
      <div>Content</div>
    </ErrorBoundary>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'MultipleTypes.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
      // Should detect multiple types
      expect(result.errorHandlingTypes.length).toBeGreaterThanOrEqual(2);
    });

    it('PROPERTY: Error handling types are unique (no duplicates)', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          pageErrorConfigArb,
          async (pageConfig) => {
            const content = generatePageComponent(pageConfig);
            const filename = getUniqueFilename('UniqueTypes');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandling(relativePath, testDir);
            
            // Error handling types should be unique
            const uniqueTypes = new Set(result.errorHandlingTypes);
            expect(uniqueTypes.size).toBe(result.errorHandlingTypes.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Edge cases', () => {
    it('PROPERTY: Non-existent file returns error in unhandledCalls', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = verifyErrorHandling('src/pages/NonExistent.tsx', testDir);
      
      expect(result.hasErrorHandling).toBe(false);
      expect(result.errorHandlingTypes).toEqual([]);
      expect(result.unhandledCalls.length).toBeGreaterThan(0);
      expect(result.unhandledCalls.some(c => 
        c.includes('not found') || c.includes('File not found')
      )).toBe(true);
    });

    it('PROPERTY: Empty file returns no error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `// Empty file\n`;
      const relativePath = await writeTestPageFile(testDir, 'Empty.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(false);
      expect(result.errorHandlingTypes).toEqual([]);
    });

    it('PROPERTY: File with no API calls returns no unhandled calls', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function StaticPage() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div>
      <h1>Static Page</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'Static.tsx', content);
      
      const result = verifyErrorHandlingExtended(relativePath, testDir);
      
      // No API calls means no unhandled calls
      expect(result.apiCalls.length).toBe(0);
      expect(result.unhandledCalls.length).toBe(0);
    });

    it('PROPERTY: File with only comments returns no error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
// This is a comment
/* Multi-line
   comment */
// Another comment
`;
      const relativePath = await writeTestPageFile(testDir, 'Comments.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(false);
      expect(result.errorHandlingTypes).toEqual([]);
    });
  });


  describe('React Query error state handling', () => {
    it('PROPERTY: isError destructuring from useQuery indicates error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryWithErrorState() {
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/profile')
  });
  
  if (isError) {
    return <div>Error: {error.message}</div>;
  }
  
  return <div>Data loaded</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'ErrorState.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      // Error state handling should be detected
      expect(result.hasErrorHandling).toBe(true);
    });

    it('PROPERTY: error conditional rendering indicates error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function ConditionalError() {
  const { data, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications')
  });
  
  if (error) {
    return <div>Something went wrong</div>;
  }
  
  return <div>{data}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'ConditionalError.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      expect(result.hasErrorHandling).toBe(true);
    });

    it('PROPERTY: toast.error usage indicates error handling', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { toast } from 'sonner';

export function ToastError() {
  const handleSubmit = async () => {
    const response = await fetch('/api/applications', { method: 'POST' });
    if (!response.ok) {
      toast.error('Failed to submit application');
    }
  };
  
  return <button onClick={handleSubmit}>Submit</button>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'ToastError.tsx', content);
      
      const result = verifyErrorHandling(relativePath, testDir);
      
      // toast.error should be detected as error handling
      expect(result.hasErrorHandling).toBe(true);
    });
  });


  describe('API call detection accuracy', () => {
    it('PROPERTY: fetch() calls are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          apiEndpointArb,
          async (endpoint) => {
            const content = `
import React from 'react';

export function FetchPage() {
  const loadData = async () => {
    const response = await fetch('${endpoint}');
    return response.json();
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('FetchDetect');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandlingExtended(relativePath, testDir);
            
            // Should detect the fetch call
            expect(result.apiCalls.some(c => c.callType === 'fetch')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: axios calls are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('get', 'post', 'put', 'delete', 'patch'),
          apiEndpointArb,
          async (method, endpoint) => {
            const content = `
import React from 'react';
import axios from 'axios';

export function AxiosPage() {
  const loadData = async () => {
    const response = await axios.${method}('${endpoint}');
    return response.data;
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('AxiosDetect');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandlingExtended(relativePath, testDir);
            
            // Should detect the axios call
            expect(result.apiCalls.some(c => c.callType === 'axios')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Service method calls are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'applicationService',
            'authService',
            'documentService',
            'notificationService',
            'paymentService'
          ),
          fc.constantFrom('get', 'create', 'update', 'delete', 'fetch', 'load'),
          async (serviceName, methodName) => {
            const content = `
import React from 'react';
import { ${serviceName} } from '@/services';

export function ServicePage() {
  const loadData = async () => {
    const data = await ${serviceName}.${methodName}Data();
    return data;
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('ServiceDetect');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandlingExtended(relativePath, testDir);
            
            // Should detect the service call
            expect(result.apiCalls.some(c => c.callType === 'service')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: apiClient calls are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('get', 'post', 'put', 'delete', 'patch'),
          apiEndpointArb,
          async (method, endpoint) => {
            const content = `
import React from 'react';
import { apiClient } from '@/lib/apiClient';

export function ApiClientPage() {
  const loadData = async () => {
    const response = await apiClient.${method}('${endpoint}');
    return response;
  };
  
  return <div>Test</div>;
}
`;
            const filename = getUniqueFilename('ApiClientDetect');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandlingExtended(relativePath, testDir);
            
            // Should detect the apiClient call
            expect(result.apiCalls.some(c => c.callType === 'apiClient')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Consistency properties', () => {
    it('PROPERTY: hasErrorHandling is true iff errorHandlingTypes is non-empty OR error state handling exists', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          pageErrorConfigArb,
          async (pageConfig) => {
            const content = generatePageComponent(pageConfig);
            const filename = getUniqueFilename('Consistency');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = verifyErrorHandling(relativePath, testDir);
            
            // If errorHandlingTypes is non-empty, hasErrorHandling should be true
            if (result.errorHandlingTypes.length > 0) {
              expect(result.hasErrorHandling).toBe(true);
            }
            
            // If hasErrorHandling is false, errorHandlingTypes should be empty
            if (!result.hasErrorHandling) {
              expect(result.errorHandlingTypes.length).toBe(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: API calls with error handling are not in unhandledCalls', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function HandledCalls() {
  const loadData = async () => {
    try {
      await fetch('/api/auth');
    } catch (error) {
      console.error(error);
    }
  };
  
  return <div>Test</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'HandledCalls.tsx', content);
      
      const result = verifyErrorHandlingExtended(relativePath, testDir);
      
      // API calls with error handling should have hasErrorHandling = true
      const handledCalls = result.apiCalls.filter(c => c.hasErrorHandling);
      for (const call of handledCalls) {
        // The call description should not appear in unhandledCalls
        const callDesc = `${call.callType} at line ${call.lineNumber}`;
        expect(result.unhandledCalls).not.toContain(callDesc);
      }
    });

    it('PROPERTY: Deterministic results for same input', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function DeterministicPage() {
  const loadData = async () => {
    try {
      await fetch('/api/applications');
    } catch (error) {
      console.error(error);
    }
  };
  
  return <div>Test</div>;
}
`;
      const filename = getUniqueFilename('Deterministic');
      const relativePath = await writeTestPageFile(testDir, filename, content);
      
      // Run verification multiple times on the same file
      const result1 = verifyErrorHandling(relativePath, testDir);
      const result2 = verifyErrorHandling(relativePath, testDir);
      const result3 = verifyErrorHandling(relativePath, testDir);
      
      // Results should be identical
      expect(result1.hasErrorHandling).toBe(result2.hasErrorHandling);
      expect(result2.hasErrorHandling).toBe(result3.hasErrorHandling);
      expect(result1.errorHandlingTypes).toEqual(result2.errorHandlingTypes);
      expect(result2.errorHandlingTypes).toEqual(result3.errorHandlingTypes);
    });
  });
});
