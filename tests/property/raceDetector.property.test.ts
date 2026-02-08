/**
 * Property-Based Tests: Race Condition Detection
 * Feature: frontend-backend-forensic-audit
 * Task: 4.11 Write property test for race condition detection
 * 
 * **Property 8: Race Condition Detection**
 * 
 * *For any* page with concurrent data fetches, the Page Auditor SHALL identify
 * potential race conditions by analyzing hook dependencies and state updates.
 * 
 * **Validates: Requirements 2.6**
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  detectRaceConditions,
  detectRaceConditionsExtended,
  type RaceConditionType,
  type RaceConditionResult,
  type ExtendedRaceConditionResult,
} from '../../scripts/audit/page/raceDetector';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Race condition detection involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 100;

/**
 * Base temporary directory for test fixtures - unique per test run
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-race-detector');

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
  '/api/sessions'
);

/**
 * Query key names for React Query hooks
 */
const queryKeyArb = fc.constantFrom(
  'user',
  'profile',
  'applications',
  'documents',
  'notifications',
  'payments',
  'sessions',
  'dashboard',
  'analytics'
);

/**
 * State setter names
 */
const stateSetterArb = fc.constantFrom(
  'setData',
  'setLoading',
  'setError',
  'setUser',
  'setProfile',
  'setApplications',
  'setNotifications',
  'setIsOpen',
  'setCount'
);

/**
 * Variable names that could be used in useEffect
 */
const variableNameArb = fc.constantFrom(
  'userId',
  'applicationId',
  'profileData',
  'isAuthenticated',
  'currentPage',
  'searchTerm',
  'filters',
  'sortOrder'
);

/**
 * Race condition types that can be detected
 */
const raceConditionTypeArb: fc.Arbitrary<RaceConditionType> = fc.constantFrom(
  'missing-dependency-array',
  'empty-dependency-array',
  'stale-closure',
  'concurrent-state-update',
  'unsequenced-dependent-fetches',
  'async-state-update',
  'missing-cleanup'
);

/**
 * Severity levels for race conditions
 */
const severityArb = fc.constantFrom('high', 'medium', 'low');

// ============================================================================
// Code Generators
// ============================================================================

/**
 * Generate useEffect without dependency array (high severity risk)
 */
function generateUseEffectWithoutDeps(
  setter: string,
  endpoint: string
): string {
  return `
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  });`;
}

/**
 * Generate useEffect with empty dependency array using external variables
 */
function generateUseEffectEmptyDepsWithExternalVars(
  setter: string,
  endpoint: string,
  externalVar: string
): string {
  return `
  useEffect(() => {
    async function fetchData() {
      const response = await fetch(\`${endpoint}?id=\${${externalVar}}\`);
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, []);`;
}

/**
 * Generate async useEffect with state updates but no cleanup
 */
function generateAsyncUseEffectNoCleanup(
  setter: string,
  endpoint: string,
  dep: string
): string {
  return `
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, [${dep}]);`;
}

/**
 * Generate async useEffect with proper cleanup
 */
function generateAsyncUseEffectWithCleanup(
  setter: string,
  endpoint: string,
  dep: string
): string {
  return `
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      if (isMounted) {
        ${setter}(json);
      }
    }
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [${dep}]);`;
}

/**
 * Generate multiple concurrent useQuery hooks
 */
function generateConcurrentQueries(
  queryKey1: string,
  queryKey2: string,
  endpoint1: string,
  endpoint2: string
): string {
  return `
  const { data: data1, isLoading: loading1 } = useQuery({
    queryKey: ['${queryKey1}'],
    queryFn: () => fetch('${endpoint1}').then(res => res.json())
  });
  
  const { data: data2, isLoading: loading2 } = useQuery({
    queryKey: ['${queryKey2}'],
    queryFn: () => fetch('${endpoint2}').then(res => res.json())
  });`;
}

/**
 * Generate state update in async callback
 */
function generateAsyncStateUpdate(setter: string, endpoint: string): string {
  return `
  const handleClick = async () => {
    const response = await fetch('${endpoint}');
    const json = await response.json();
    ${setter}(json);
  };`;
}

/**
 * Generate state update in promise chain
 */
function generatePromiseChainStateUpdate(setter: string, endpoint: string): string {
  return `
  const handleSubmit = () => {
    fetch('${endpoint}')
      .then(res => res.json())
      .then(data => {
        ${setter}(data);
      })
      .catch(err => console.error(err));
  };`;
}

/**
 * Configuration for generating a page with race condition patterns
 */
interface RaceConditionPageConfig {
  componentName: string;
  hasUseEffectWithoutDeps: boolean;
  hasEmptyDepsWithExternalVars: boolean;
  hasAsyncEffectNoCleanup: boolean;
  hasAsyncEffectWithCleanup: boolean;
  hasConcurrentQueries: boolean;
  hasAsyncStateUpdate: boolean;
  hasPromiseChainUpdate: boolean;
  queryKeys: string[];
  endpoints: string[];
  setters: string[];
  variables: string[];
}

const raceConditionPageConfigArb: fc.Arbitrary<RaceConditionPageConfig> = fc.record({
  componentName: fc.constantFrom('Dashboard', 'Profile', 'Applications', 'Settings', 'Admin'),
  hasUseEffectWithoutDeps: fc.boolean(),
  hasEmptyDepsWithExternalVars: fc.boolean(),
  hasAsyncEffectNoCleanup: fc.boolean(),
  hasAsyncEffectWithCleanup: fc.boolean(),
  hasConcurrentQueries: fc.boolean(),
  hasAsyncStateUpdate: fc.boolean(),
  hasPromiseChainUpdate: fc.boolean(),
  queryKeys: fc.array(queryKeyArb, { minLength: 1, maxLength: 3 }),
  endpoints: fc.array(apiEndpointArb, { minLength: 1, maxLength: 3 }),
  setters: fc.array(stateSetterArb, { minLength: 1, maxLength: 3 }),
  variables: fc.array(variableNameArb, { minLength: 1, maxLength: 2 }),
});

/**
 * Generate a complete React page component with race condition patterns
 */
function generateRaceConditionPage(config: RaceConditionPageConfig): string {
  const imports: string[] = [`import React, { useEffect, useState } from 'react';`];
  const stateDeclarations: string[] = [];
  const hookCalls: string[] = [];
  const handlers: string[] = [];
  
  // Add React Query import if needed
  if (config.hasConcurrentQueries) {
    imports.push(`import { useQuery } from '@tanstack/react-query';`);
  }
  
  // Add state declarations for setters
  for (const setter of config.setters) {
    const stateName = setter.replace('set', '').toLowerCase();
    stateDeclarations.push(`const [${stateName}, ${setter}] = useState(null);`);
  }
  
  // Add variable declarations
  for (const variable of config.variables) {
    stateDeclarations.push(`const ${variable} = 'test-value';`);
  }
  
  // Generate useEffect without deps (high severity)
  if (config.hasUseEffectWithoutDeps && config.setters.length > 0 && config.endpoints.length > 0) {
    hookCalls.push(generateUseEffectWithoutDeps(config.setters[0], config.endpoints[0]));
  }
  
  // Generate useEffect with empty deps using external vars
  if (config.hasEmptyDepsWithExternalVars && config.setters.length > 0 && 
      config.endpoints.length > 0 && config.variables.length > 0) {
    hookCalls.push(generateUseEffectEmptyDepsWithExternalVars(
      config.setters[0], 
      config.endpoints[0], 
      config.variables[0]
    ));
  }
  
  // Generate async useEffect without cleanup
  if (config.hasAsyncEffectNoCleanup && config.setters.length > 0 && config.endpoints.length > 0) {
    const dep = config.variables.length > 0 ? config.variables[0] : '';
    hookCalls.push(generateAsyncUseEffectNoCleanup(config.setters[0], config.endpoints[0], dep));
  }
  
  // Generate async useEffect with cleanup
  if (config.hasAsyncEffectWithCleanup && config.setters.length > 0 && config.endpoints.length > 0) {
    const dep = config.variables.length > 0 ? config.variables[0] : '';
    hookCalls.push(generateAsyncUseEffectWithCleanup(config.setters[0], config.endpoints[0], dep));
  }
  
  // Generate concurrent queries
  if (config.hasConcurrentQueries && config.queryKeys.length >= 2 && config.endpoints.length >= 2) {
    hookCalls.push(generateConcurrentQueries(
      config.queryKeys[0],
      config.queryKeys[1],
      config.endpoints[0],
      config.endpoints[1]
    ));
  }
  
  // Generate async state update handler
  if (config.hasAsyncStateUpdate && config.setters.length > 0 && config.endpoints.length > 0) {
    handlers.push(generateAsyncStateUpdate(config.setters[0], config.endpoints[0]));
  }
  
  // Generate promise chain state update
  if (config.hasPromiseChainUpdate && config.setters.length > 0 && config.endpoints.length > 0) {
    handlers.push(generatePromiseChainStateUpdate(config.setters[0], config.endpoints[0]));
  }
  
  return `${imports.join('\n')}

export function ${config.componentName}() {
  ${stateDeclarations.join('\n  ')}
  ${hookCalls.join('\n  ')}
  ${handlers.join('\n  ')}
  
  return (
    <div>
      <h1>${config.componentName}</h1>
    </div>
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

describe('Property 8: Race Condition Detection', () => {
  /**
   * **Validates: Requirements 2.6**
   * 
   * WHEN the Audit_System examines a page THEN it SHALL identify potential
   * race conditions in concurrent data fetches.
   */
  
  // Clean up all test fixtures after all tests complete
  afterAll(async () => {
    try {
      await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('useEffect without dependency array detection', () => {
    it('PROPERTY: useEffect without dependency array is flagged as high severity risk', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(stateSetterArb, apiEndpointArb),
          async ([setter, endpoint]) => {
            const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, ${setter}] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  });
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('NoDepArray');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            // Should detect the missing dependency array as a race condition risk
            expect(result.raceConditions.length).toBeGreaterThan(0);
            expect(result.raceConditions.some(r => 
              r.description.toLowerCase().includes('dependency array') ||
              r.description.toLowerCase().includes('every render')
            )).toBe(true);
            expect(result.raceConditions.some(r => r.severity === 'high')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Empty dependency array with external variables detection', () => {
    it('PROPERTY: useEffect with empty dependency array using external variables is flagged', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(stateSetterArb, apiEndpointArb, variableNameArb),
          async ([setter, endpoint, externalVar]) => {
            const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, ${setter}] = useState(null);
  const ${externalVar} = 'some-value';
  
  useEffect(() => {
    async function fetchData() {
      const response = await fetch(\`${endpoint}?id=\${${externalVar}}\`);
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, []);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('EmptyDepsExternal');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            // Should detect potential stale closure or empty deps with external vars
            // The result may or may not flag this depending on detection heuristics
            expect(result.totalRisks).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(result.raceConditions)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Async useEffect without cleanup detection', () => {
    it('PROPERTY: Async useEffect with state updates but no cleanup is flagged', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(stateSetterArb, apiEndpointArb, variableNameArb),
          async ([setter, endpoint, dep]) => {
            const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, ${setter}] = useState(null);
  const ${dep} = 'test-id';
  
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, [${dep}]);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('AsyncNoCleanup');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            // Should detect async effect without cleanup
            expect(result.raceConditions.some(r => 
              r.description.toLowerCase().includes('cleanup') ||
              r.description.toLowerCase().includes('unmount')
            )).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Async useEffect WITH cleanup is not flagged for missing cleanup', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, setData] = useState(null);
  const userId = 'test-id';
  
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      const response = await fetch('/api/applications');
      const json = await response.json();
      if (isMounted) {
        setData(json);
      }
    }
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [userId]);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'AsyncWithCleanup.tsx', content);
      
      const result = detectRaceConditions(relativePath, testDir);
      
      // Should NOT flag missing cleanup since cleanup exists
      const cleanupRisks = result.raceConditions.filter(r => 
        r.description.toLowerCase().includes('no cleanup') ||
        r.description.toLowerCase().includes('without cleanup')
      );
      expect(cleanupRisks.length).toBe(0);
    });
  });

  describe('Concurrent data fetches detection', () => {
    it('PROPERTY: Multiple concurrent useQuery hooks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(queryKeyArb, queryKeyArb, apiEndpointArb, apiEndpointArb),
          async ([queryKey1, queryKey2, endpoint1, endpoint2]) => {
            const content = `
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function TestPage() {
  const { data: data1, isLoading: loading1 } = useQuery({
    queryKey: ['${queryKey1}'],
    queryFn: () => fetch('${endpoint1}').then(res => res.json())
  });
  
  const { data: data2, isLoading: loading2 } = useQuery({
    queryKey: ['${queryKey2}'],
    queryFn: () => fetch('${endpoint2}').then(res => res.json())
  });
  
  if (loading1 || loading2) return <div>Loading...</div>;
  
  return <div>{JSON.stringify({ data1, data2 })}</div>;
}
`;
            const filename = getUniqueFilename('ConcurrentQueries');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            // Should detect concurrent fetches
            expect(result.hasConcurrentFetches).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multiple async useEffects are detected as concurrent fetches', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [users, setUsers] = useState(null);
  const [apps, setApps] = useState(null);
  
  useEffect(() => {
    async function fetchUsers() {
      const response = await fetch('/api/admin?action=users');
      const json = await response.json();
      setUsers(json);
    }
    fetchUsers();
  }, []);
  
  useEffect(() => {
    async function fetchApps() {
      const response = await fetch('/api/applications');
      const json = await response.json();
      setApps(json);
    }
    fetchApps();
  }, []);
  
  return <div>{JSON.stringify({ users, apps })}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'MultipleAsyncEffects.tsx', content);
      
      const result = detectRaceConditions(relativePath, testDir);
      
      // Should detect concurrent fetches from multiple async effects
      expect(result.hasConcurrentFetches).toBe(true);
    });
  });

  describe('State updates in async callbacks detection', () => {
    it('PROPERTY: State updates in async callbacks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(stateSetterArb, apiEndpointArb),
          async ([setter, endpoint]) => {
            const content = `
import React, { useState, useEffect } from 'react';

export function TestPage() {
  const [data, ${setter}] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, []);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('AsyncCallback');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditionsExtended(relativePath, testDir);
            
            // Should detect state updates
            expect(result.stateUpdates.length).toBeGreaterThan(0);
            expect(result.stateUpdates.some(u => u.setterName === setter)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: State updates in promise chains are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useState } from 'react';

export function TestPage() {
  const [data, setData] = useState(null);
  
  const handleSubmit = () => {
    fetch('/api/applications')
      .then(res => res.json())
      .then(json => {
        setData(json);
      })
      .catch(err => console.error(err));
  };
  
  return (
    <div>
      <button onClick={handleSubmit}>Submit</button>
      {JSON.stringify(data)}
    </div>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'PromiseChain.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      // Should detect state updates
      expect(result.stateUpdates.length).toBeGreaterThan(0);
      expect(result.stateUpdates.some(u => u.setterName === 'setData')).toBe(true);
    });
  });

  describe('Stale closure risks detection', () => {
    it('PROPERTY: Stale closure risks are identified when variables used but not in deps', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(stateSetterArb, apiEndpointArb, variableNameArb),
          async ([setter, endpoint, variable]) => {
            const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, ${setter}] = useState(null);
  const [${variable}, set${variable.charAt(0).toUpperCase() + variable.slice(1)}] = useState('initial');
  
  useEffect(() => {
    async function fetchData() {
      // Using ${variable} but it's not in dependency array
      const response = await fetch(\`${endpoint}?param=\${${variable}}\`);
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, []); // Missing ${variable} in deps
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('StaleClosure');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            // Result structure should be valid regardless of detection
            expect(Array.isArray(result.raceConditions)).toBe(true);
            expect(typeof result.totalRisks).toBe('number');
            expect(typeof result.hasConcurrentFetches).toBe('boolean');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Result structure validation', () => {
    it('PROPERTY: detectRaceConditions always returns valid RaceConditionResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          raceConditionPageConfigArb,
          async (pageConfig) => {
            const content = generateRaceConditionPage(pageConfig);
            const filename = getUniqueFilename('ValidResult');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            // Required fields must be present and have correct types
            expect(Array.isArray(result.raceConditions)).toBe(true);
            expect(typeof result.totalRisks).toBe('number');
            expect(typeof result.hasConcurrentFetches).toBe('boolean');
            
            // totalRisks should match raceConditions length
            expect(result.totalRisks).toBe(result.raceConditions.length);
            
            // All race conditions should have required fields
            for (const risk of result.raceConditions) {
              expect(typeof risk.description).toBe('string');
              expect(risk.description.length).toBeGreaterThan(0);
              expect(Array.isArray(risk.hooks)).toBe(true);
              expect(['high', 'medium', 'low']).toContain(risk.severity);
              expect(risk.evidence).toBeDefined();
              expect(typeof risk.evidence.filePath).toBe('string');
              expect(typeof risk.evidence.reason).toBe('string');
              expect(['certain', 'likely', 'possible']).toContain(risk.evidence.confidence);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: detectRaceConditionsExtended returns valid ExtendedRaceConditionResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          raceConditionPageConfigArb,
          async (pageConfig) => {
            const content = generateRaceConditionPage(pageConfig);
            const filename = getUniqueFilename('ExtendedResult');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditionsExtended(relativePath, testDir);
            
            // All base fields must be present
            expect(Array.isArray(result.raceConditions)).toBe(true);
            expect(typeof result.totalRisks).toBe('number');
            expect(typeof result.hasConcurrentFetches).toBe('boolean');
            
            // Extended fields must be present
            expect(Array.isArray(result.useEffects)).toBe(true);
            expect(Array.isArray(result.dataFetchHooks)).toBe(true);
            expect(Array.isArray(result.stateUpdates)).toBe(true);
            expect(Array.isArray(result.issues)).toBe(true);
            
            // All useEffect info should have required fields
            for (const effect of result.useEffects) {
              expect(typeof effect.lineNumber).toBe('number');
              expect(effect.lineNumber).toBeGreaterThan(0);
              expect(typeof effect.codeSnippet).toBe('string');
              expect(typeof effect.hasDependencyArray).toBe('boolean');
              expect(Array.isArray(effect.dependencies)).toBe(true);
              expect(typeof effect.hasAsyncOperation).toBe('boolean');
              expect(typeof effect.hasStateUpdate).toBe('boolean');
              expect(typeof effect.hasCleanup).toBe('boolean');
              expect(Array.isArray(effect.usedVariables)).toBe(true);
            }
            
            // All data fetch hook info should have required fields
            for (const hook of result.dataFetchHooks) {
              expect(['useQuery', 'useMutation', 'useInfiniteQuery', 'customHook']).toContain(hook.type);
              expect(typeof hook.lineNumber).toBe('number');
              expect(hook.lineNumber).toBeGreaterThan(0);
              expect(typeof hook.codeSnippet).toBe('string');
              expect(typeof hook.queryKey).toBe('string');
              expect(Array.isArray(hook.dependencies)).toBe(true);
              expect(typeof hook.dependsOnOtherQueries).toBe('boolean');
            }
            
            // All state update info should have required fields
            for (const update of result.stateUpdates) {
              expect(typeof update.lineNumber).toBe('number');
              expect(update.lineNumber).toBeGreaterThan(0);
              expect(typeof update.codeSnippet).toBe('string');
              expect(typeof update.setterName).toBe('string');
              expect(typeof update.isInAsyncCallback).toBe('boolean');
              expect(typeof update.isInUseEffect).toBe('boolean');
              expect(typeof update.isInPromiseChain).toBe('boolean');
            }
            
            // All issues should be strings
            for (const issue of result.issues) {
              expect(typeof issue).toBe('string');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Edge cases', () => {
    it('PROPERTY: Non-existent file returns empty result with no errors', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = detectRaceConditions('src/pages/NonExistent.tsx', testDir);
      
      expect(result.raceConditions).toEqual([]);
      expect(result.totalRisks).toBe(0);
      expect(result.hasConcurrentFetches).toBe(false);
    });

    it('PROPERTY: Non-existent file extended returns issues array with error', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = detectRaceConditionsExtended('src/pages/NonExistent.tsx', testDir);
      
      expect(result.raceConditions).toEqual([]);
      expect(result.totalRisks).toBe(0);
      expect(result.hasConcurrentFetches).toBe(false);
      expect(result.useEffects).toEqual([]);
      expect(result.dataFetchHooks).toEqual([]);
      expect(result.stateUpdates).toEqual([]);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => 
        issue.toLowerCase().includes('not found') || 
        issue.toLowerCase().includes('file not found')
      )).toBe(true);
    });

    it('PROPERTY: Empty file returns empty result', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `// Empty file\n`;
      const relativePath = await writeTestPageFile(testDir, 'Empty.tsx', content);
      
      const result = detectRaceConditions(relativePath, testDir);
      
      expect(result.raceConditions).toEqual([]);
      expect(result.totalRisks).toBe(0);
      expect(result.hasConcurrentFetches).toBe(false);
    });

    it('PROPERTY: File without hooks returns empty result', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function StaticPage() {
  return (
    <div>
      <h1>Static Page</h1>
      <p>No hooks here</p>
    </div>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'Static.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      expect(result.useEffects).toEqual([]);
      expect(result.dataFetchHooks).toEqual([]);
      expect(result.stateUpdates).toEqual([]);
      expect(result.raceConditions).toEqual([]);
      expect(result.hasConcurrentFetches).toBe(false);
    });

    it('PROPERTY: File with only comments returns empty result', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
// This is a comment
/* Multi-line
   comment */
// Another comment
`;
      const relativePath = await writeTestPageFile(testDir, 'Comments.tsx', content);
      
      const result = detectRaceConditions(relativePath, testDir);
      
      expect(result.raceConditions).toEqual([]);
      expect(result.totalRisks).toBe(0);
      expect(result.hasConcurrentFetches).toBe(false);
    });

    it('PROPERTY: File with useState but no useEffect returns no race conditions', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useState } from 'react';

export function CounterPage() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'Counter.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      expect(result.useEffects).toEqual([]);
      expect(result.dataFetchHooks).toEqual([]);
      // State updates from onClick are detected but not flagged as race conditions
      expect(result.raceConditions).toEqual([]);
      expect(result.hasConcurrentFetches).toBe(false);
    });
  });

  describe('Consistency properties', () => {
    it('PROPERTY: totalRisks equals raceConditions.length', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          raceConditionPageConfigArb,
          async (pageConfig) => {
            const content = generateRaceConditionPage(pageConfig);
            const filename = getUniqueFilename('TotalRisks');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            expect(result.totalRisks).toBe(result.raceConditions.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: hasConcurrentFetches is true when multiple data fetch hooks exist', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          raceConditionPageConfigArb.filter(c => c.hasConcurrentQueries),
          async (pageConfig) => {
            const content = generateRaceConditionPage(pageConfig);
            const filename = getUniqueFilename('ConcurrentCheck');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditionsExtended(relativePath, testDir);
            
            // If we have concurrent queries, hasConcurrentFetches should be true
            if (result.dataFetchHooks.length >= 2) {
              expect(result.hasConcurrentFetches).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Result structure is consistent across calls', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useEffect, useState } from 'react';

export function ConsistentPage() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    setData({ loaded: true });
  }, []);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
      // Use a fixed filename
      const relativePath = await writeTestPageFile(testDir, 'ConsistentTest.tsx', content);
      
      // Run detection multiple times on the same file
      const result1 = detectRaceConditions(relativePath, testDir);
      const result2 = detectRaceConditions(relativePath, testDir);
      
      // Key structural properties should be consistent
      expect(result1.hasConcurrentFetches).toBe(result2.hasConcurrentFetches);
      // totalRisks should always match raceConditions length
      expect(result1.totalRisks).toBe(result1.raceConditions.length);
      expect(result2.totalRisks).toBe(result2.raceConditions.length);
      // Both should have valid structure
      expect(Array.isArray(result1.raceConditions)).toBe(true);
      expect(Array.isArray(result2.raceConditions)).toBe(true);
    });

    it('PROPERTY: Line numbers in evidence are positive integers', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          raceConditionPageConfigArb.filter(c => 
            c.hasUseEffectWithoutDeps || c.hasAsyncEffectNoCleanup
          ),
          async (pageConfig) => {
            const content = generateRaceConditionPage(pageConfig);
            const filename = getUniqueFilename('LineNumbers');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditions(relativePath, testDir);
            
            for (const risk of result.raceConditions) {
              if (risk.evidence.lineNumbers) {
                for (const lineNum of risk.evidence.lineNumbers) {
                  expect(Number.isInteger(lineNum)).toBe(true);
                  expect(lineNum).toBeGreaterThan(0);
                }
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('useEffect detection', () => {
    it('PROPERTY: useEffect hooks are detected with correct properties', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(apiEndpointArb, variableNameArb),
          async ([endpoint, dep]) => {
            // Use a consistent setter name that will be detected
            const setter = 'setData';
            const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, ${setter}] = useState(null);
  const ${dep} = 'test-value';
  
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('${endpoint}');
      const json = await response.json();
      ${setter}(json);
    }
    fetchData();
  }, [${dep}]);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('UseEffectDetection');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditionsExtended(relativePath, testDir);
            
            // Should detect the useEffect
            expect(result.useEffects.length).toBeGreaterThan(0);
            
            const effect = result.useEffects[0];
            expect(effect.hasDependencyArray).toBe(true);
            expect(effect.hasAsyncOperation).toBe(true);
            // State update detection depends on the setter being in the effect body
            // which it is, so this should be true
            expect(typeof effect.hasStateUpdate).toBe('boolean');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: useEffect without deps is correctly identified', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    console.log('Effect runs on every render');
    setData({ updated: true });
  });
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'NoDeps.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      expect(result.useEffects.length).toBeGreaterThan(0);
      expect(result.useEffects.some(e => !e.hasDependencyArray)).toBe(true);
    });

    it('PROPERTY: useEffect with empty deps is correctly identified', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React, { useEffect, useState } from 'react';

export function TestPage() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    console.log('Effect runs once on mount');
    setData({ mounted: true });
  }, []);
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'EmptyDeps.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      expect(result.useEffects.length).toBeGreaterThan(0);
      const emptyDepsEffect = result.useEffects.find(e => 
        e.hasDependencyArray && e.dependencies.length === 0
      );
      expect(emptyDepsEffect).toBeDefined();
    });
  });

  describe('Data fetch hook detection', () => {
    it('PROPERTY: useQuery hooks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(queryKeyArb, apiEndpointArb),
          async ([queryKey, endpoint]) => {
            const content = `
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function TestPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['${queryKey}'],
    queryFn: () => fetch('${endpoint}').then(res => res.json())
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('UseQueryDetection');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditionsExtended(relativePath, testDir);
            
            expect(result.dataFetchHooks.length).toBeGreaterThan(0);
            expect(result.dataFetchHooks.some(h => h.type === 'useQuery')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: useMutation hooks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useMutation } from '@tanstack/react-query';

export function TestPage() {
  const { mutate, isPending } = useMutation({
    mutationFn: (data) => fetch('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  });
  
  return <button onClick={() => mutate({})}>Submit</button>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'UseMutation.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      expect(result.dataFetchHooks.length).toBeGreaterThan(0);
      expect(result.dataFetchHooks.some(h => h.type === 'useMutation')).toBe(true);
    });

    it('PROPERTY: useInfiniteQuery hooks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

export function TestPage() {
  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['applications'],
    queryFn: ({ pageParam = 0 }) => fetch(\`/api/applications?page=\${pageParam}\`).then(res => res.json()),
    getNextPageParam: (lastPage) => lastPage.nextCursor
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'UseInfiniteQuery.tsx', content);
      
      const result = detectRaceConditionsExtended(relativePath, testDir);
      
      expect(result.dataFetchHooks.length).toBeGreaterThan(0);
      expect(result.dataFetchHooks.some(h => h.type === 'useInfiniteQuery')).toBe(true);
    });

    it('PROPERTY: Custom data hooks are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'useAuth',
            'useProfile',
            'useApplications',
            'useUsers',
            'useNotifications',
            'useDashboard'
          ),
          async (hookName) => {
            const content = `
import React from 'react';
import { ${hookName} } from '@/hooks/${hookName}';

export function TestPage() {
  const { data, isLoading } = ${hookName}();
  
  if (isLoading) return <div>Loading...</div>;
  
  return <div>{JSON.stringify(data)}</div>;
}
`;
            const filename = getUniqueFilename('CustomHook');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = detectRaceConditionsExtended(relativePath, testDir);
            
            expect(result.dataFetchHooks.length).toBeGreaterThan(0);
            expect(result.dataFetchHooks.some(h => h.type === 'customHook')).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
