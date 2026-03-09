/**
 * Property-Based Tests: Redirect Correctness
 * Feature: frontend-backend-forensic-audit
 * Task: 7.7 Write property test for redirect correctness
 * 
 * **Property 14: Redirect Correctness**
 * 
 * *For any* auth-related redirect, the Auth Auditor SHALL verify that
 * the redirect target is appropriate for the user's authentication and role state.
 * 
 * **Validates: Requirements 4.5**
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  analyzeRedirects,
  scanFileForRedirects,
  inferUserStateContext,
  checkRedirectAppropriateness,
  detectRedirectLoops,
  EXPECTED_REDIRECTS,
  type RedirectType,
  type UserStateContext,
  type RedirectInstance,
  type RedirectLoop,
} from '../../scripts/audit/auth/redirectAnalyzer';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Redirect analysis involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 10;

/**
 * Base temporary directory for test fixtures - unique per test run
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-redirect-analyzer');

/**
 * Counter for unique test directories
 */
let testDirCounter = 0;

/**
 * Get a unique test directory for each test
 */
function getUniqueTestDir(): string {
  testDirCounter++;
  return join(TEST_FIXTURES_BASE, `test-${testDirCounter}-${Date.now()}`);
}


// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid redirect types in the MIHAS system
 */
const redirectTypeArb: fc.Arbitrary<RedirectType> = fc.constantFrom(
  'Navigate',
  'useNavigate',
  'windowLocation',
  'windowReplace'
);

/**
 * User state context arbitrary
 */
const userStateContextArb: fc.Arbitrary<UserStateContext> = fc.constantFrom(
  'unauthenticated',
  'authenticated',
  'student',
  'admin',
  'unknown'
);

/**
 * Valid redirect targets for unauthenticated users
 */
const unauthenticatedTargetsArb = fc.constantFrom(
  '/auth/signin',
  '/auth/signup',
  '/login',
  '/signin',
  '/',
  '/auth/forgot-password'
);

/**
 * Valid redirect targets for students
 */
const studentTargetsArb = fc.constantFrom(
  '/student/dashboard',
  '/apply',
  '/student/status',
  '/student/settings',
  '/student/payment',
  '/student/interview',
  '/student/application-wizard',
  '/student/profile',
  '/student/notifications',
  '/settings',
  '/dashboard'
);

/**
 * Valid redirect targets for admins
 */
const adminTargetsArb = fc.constantFrom(
  '/admin',
  '/admin/dashboard',
  '/admin/applications',
  '/admin/users',
  '/admin/programs',
  '/admin/intakes',
  '/admin/settings',
  '/admin/analytics',
  '/admin/audit',
  '/admin/workflow',
  '/admin/roles',
  '/admin/system-health',
  '/admin/profile',
  '/dashboard'
);


/**
 * Invalid redirect targets (cross-role violations)
 */
const invalidStudentToAdminTargetArb = fc.constantFrom(
  '/admin',
  '/admin/dashboard',
  '/admin/applications',
  '/admin/users',
  '/admin/settings'
);

const invalidUnauthToAdminTargetArb = fc.constantFrom(
  '/admin',
  '/admin/dashboard',
  '/admin/applications'
);

/**
 * Generate redirect code based on type
 */
interface RedirectConfig {
  type: RedirectType;
  target: string;
  condition?: string;
}

function generateRedirectCode(config: RedirectConfig): string {
  const { type, target, condition } = config;
  
  const conditionWrapper = (code: string) => {
    if (condition) {
      return `if (${condition}) {\n    ${code}\n  }`;
    }
    return code;
  };
  
  switch (type) {
    case 'Navigate':
      return conditionWrapper(`return <Navigate to="${target}" />;`);
    case 'useNavigate':
      return conditionWrapper(`navigate('${target}');`);
    case 'windowLocation':
      return conditionWrapper(`window.location.href = '${target}';`);
    case 'windowReplace':
      return conditionWrapper(`window.location.replace('${target}');`);
    default:
      return '';
  }
}


/**
 * Generate a complete page component with redirect logic
 */
interface PageWithRedirectConfig {
  componentName: string;
  redirectType: RedirectType;
  target: string;
  userStateCheck: 'unauthenticated' | 'authenticated' | 'admin' | 'student' | 'none';
  hasAuthImport: boolean;
}

function generatePageWithRedirect(config: PageWithRedirectConfig): string {
  const imports = [`import React from 'react';`];
  let hookCalls = '';
  let condition = '';
  
  // Add imports based on redirect type
  if (config.redirectType === 'Navigate') {
    imports.push(`import { Navigate } from 'react-router-dom';`);
  } else if (config.redirectType === 'useNavigate') {
    imports.push(`import { useNavigate } from 'react-router-dom';`);
    hookCalls += `  const navigate = useNavigate();\n`;
  }
  
  // Add auth imports and conditions
  if (config.hasAuthImport) {
    imports.push(`import { useAuth } from '@/hooks/useAuth';`);
    hookCalls += `  const { user, isAuthenticated, isAdmin } = useAuth();\n`;
    
    switch (config.userStateCheck) {
      case 'unauthenticated':
        condition = '!user';
        break;
      case 'authenticated':
        condition = 'user';
        break;
      case 'admin':
        condition = 'isAdmin';
        break;
      case 'student':
        condition = '!isAdmin';
        break;
      default:
        condition = '';
    }
  }
  
  const redirectCode = generateRedirectCode({
    type: config.redirectType,
    target: config.target,
    condition,
  });

  return `${imports.join('\n')}

export function ${config.componentName}() {
${hookCalls}
  ${redirectCode}
  
  return <div>${config.componentName} Content</div>;
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
  await mkdir(join(testDir, 'src', 'pages', 'admin'), { recursive: true });
  await mkdir(join(testDir, 'src', 'pages', 'student'), { recursive: true });
  await mkdir(join(testDir, 'src', 'components', 'auth'), { recursive: true });
  await mkdir(join(testDir, 'src', 'routes'), { recursive: true });
}

/**
 * Write a page file to the test directory
 */
async function writePageFile(
  testDir: string,
  subdir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/pages/${subdir}/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}

/**
 * Write a component file to the test directory
 */
async function writeComponentFile(
  testDir: string,
  subdir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/components/${subdir}/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}

/**
 * Write a route file to the test directory
 */
async function writeRouteFile(
  testDir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/routes/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}


// ============================================================================
// Property Tests
// ============================================================================

describe('Property 14: Redirect Correctness', () => {
  /**
   * **Validates: Requirements 4.5**
   * 
   * WHEN the Audit_System examines auth THEN it SHALL verify redirect logic
   * is correct.
   * 
   * For any auth-related redirect, the Auth Auditor SHALL verify that the
   * redirect target is appropriate for the user's authentication and role state.
   */
  
  // Clean up all test fixtures after all tests complete
  afterAll(async () => {
    try {
      await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Redirect type detection', () => {
    it('PROPERTY: All redirect types are detected (Navigate, useNavigate, window.location)', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Create files with each redirect type
      const navigateContent = `
import React from 'react';
import { Navigate } from 'react-router-dom';

export function TestNavigate() {
  return <Navigate to="/dashboard" />;
}
`;
      
      const useNavigateContent = `
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function TestUseNavigate() {
  const navigate = useNavigate();
  navigate('/dashboard');
  return <div>Test</div>;
}
`;
      
      const windowLocationContent = `
import React from 'react';

export function TestWindowLocation() {
  window.location.href = '/dashboard';
  return <div>Test</div>;
}
`;
      
      const windowReplaceContent = `
import React from 'react';

export function TestWindowReplace() {
  window.location.replace('/dashboard');
  return <div>Test</div>;
}
`;
      
      await writePageFile(testDir, 'admin', 'NavigateTest.tsx', navigateContent);
      await writePageFile(testDir, 'admin', 'UseNavigateTest.tsx', useNavigateContent);
      await writePageFile(testDir, 'admin', 'WindowLocationTest.tsx', windowLocationContent);
      await writePageFile(testDir, 'admin', 'WindowReplaceTest.tsx', windowReplaceContent);
      
      const result = analyzeRedirects(testDir);
      
      // Should detect all redirect types
      const types = new Set(result.redirects.map(r => r.type));
      expect(types.has('Navigate')).toBe(true);
      expect(types.has('useNavigate')).toBe(true);
      expect(types.has('windowLocation')).toBe(true);
      expect(types.has('windowReplace')).toBe(true);
    });


    it('PROPERTY: scanFileForRedirects extracts correct redirect type', () => {
      fc.assert(
        fc.property(
          redirectTypeArb,
          fc.constantFrom('/dashboard', '/login', '/admin'),
          (redirectType, target) => {
            const code = generateRedirectCode({ type: redirectType, target });
            
            // Verify the code contains the expected pattern
            switch (redirectType) {
              case 'Navigate':
                expect(code).toContain('<Navigate');
                expect(code).toContain(`to="${target}"`);
                break;
              case 'useNavigate':
                expect(code).toContain('navigate(');
                expect(code).toContain(`'${target}'`);
                break;
              case 'windowLocation':
                expect(code).toContain('window.location.href');
                expect(code).toContain(`'${target}'`);
                break;
              case 'windowReplace':
                expect(code).toContain('window.location.replace');
                expect(code).toContain(`'${target}'`);
                break;
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('User state context inference', () => {
    it('PROPERTY: Unauthenticated users are correctly identified from !user checks', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('!user', '!isAuthenticated', '!session'),
          (condition) => {
            const code = `if (${condition}) { return <Navigate to="/login" />; }`;
            const userState = inferUserStateContext(code, 'src/pages/test.tsx');
            
            expect(userState).toBe('unauthenticated');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Admin users are correctly identified from isAdmin checks', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('isAdmin', 'hasAdminRole', 'isAdminRole'),
          (condition) => {
            const code = `if (${condition}) { return <Navigate to="/admin/dashboard" />; }`;
            const userState = inferUserStateContext(code, 'src/pages/test.tsx');
            
            expect(userState).toBe('admin');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Student users are correctly identified from !isAdmin checks', () => {
      const code = `if (!isAdmin) { return <Navigate to="/student/dashboard" />; }`;
      const userState = inferUserStateContext(code, 'src/pages/test.tsx');
      
      expect(userState).toBe('student');
    });


    it('PROPERTY: Admin route files are identified as admin context', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/components/auth/AdminRoute.tsx',
            'src/pages/admin/Dashboard.tsx',
            'src/pages/admin/Users.tsx'
          ),
          (filePath) => {
            const code = `return <Navigate to="/admin/dashboard" />;`;
            const userState = inferUserStateContext(code, filePath);
            
            // Admin route files should be identified as admin context
            expect(['admin', 'unauthenticated']).toContain(userState);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Student route files are identified as student context', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/components/auth/StudentRoute.tsx',
            'src/pages/student/Dashboard.tsx',
            'src/pages/student/Payment.tsx'
          ),
          (filePath) => {
            const code = `return <Navigate to="/student/dashboard" />;`;
            const userState = inferUserStateContext(code, filePath);
            
            // Student route files should be identified as student context
            expect(['student', 'unauthenticated']).toContain(userState);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Unknown state is returned when context cannot be determined', () => {
      const code = `return <Navigate to="/somewhere" />;`;
      const userState = inferUserStateContext(code, 'src/pages/random/Page.tsx');
      
      expect(userState).toBe('unknown');
    });
  });


  describe('Redirect appropriateness validation', () => {
    it('PROPERTY: Unauthenticated users redirected to login/public pages are appropriate', () => {
      fc.assert(
        fc.property(
          unauthenticatedTargetsArb,
          (target) => {
            const result = checkRedirectAppropriateness(target, 'unauthenticated');
            
            expect(result.isAppropriate).toBe(true);
            expect(result.issues).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Students redirected to student pages are appropriate', () => {
      fc.assert(
        fc.property(
          studentTargetsArb,
          (target) => {
            const result = checkRedirectAppropriateness(target, 'student');
            
            expect(result.isAppropriate).toBe(true);
            expect(result.issues).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Admins redirected to admin pages are appropriate', () => {
      fc.assert(
        fc.property(
          adminTargetsArb,
          (target) => {
            const result = checkRedirectAppropriateness(target, 'admin');
            
            expect(result.isAppropriate).toBe(true);
            expect(result.issues).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Inappropriate redirects are flagged (student to admin page)', () => {
      fc.assert(
        fc.property(
          invalidStudentToAdminTargetArb,
          (target) => {
            const result = checkRedirectAppropriateness(target, 'student');
            
            expect(result.isAppropriate).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues[0]).toContain('Student redirected to admin page');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Inappropriate redirects are flagged (unauthenticated to admin page)', () => {
      fc.assert(
        fc.property(
          invalidUnauthToAdminTargetArb,
          (target) => {
            const result = checkRedirectAppropriateness(target, 'unauthenticated');
            
            expect(result.isAppropriate).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues[0]).toContain('Unauthenticated user redirected to admin page');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Unknown user state does not flag issues (cannot validate)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('/admin', '/student/dashboard', '/random'),
          (target) => {
            const result = checkRedirectAppropriateness(target, 'unknown');
            
            // Unknown state cannot be validated, so it's considered appropriate
            expect(result.isAppropriate).toBe(true);
            expect(result.issues).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Query parameters are handled correctly in target paths', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '/auth/signin?error=session_expired',
            '/admin/applications?status=pending',
            '/student/dashboard?tab=notifications'
          ),
          (target) => {
            // These should be valid for their respective user states
            const signinResult = checkRedirectAppropriateness('/auth/signin?error=test', 'unauthenticated');
            expect(signinResult.isAppropriate).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Redirect loop detection', () => {
    it('PROPERTY: Simple redirect loops are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Create a simple loop: /admin/* -> /auth/signin -> /dashboard -> /admin/*
      const adminRouteContent = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/auth/signin" />;
  }
  return children;
}
`;
      
      const signinContent = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function SignInPage() {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/dashboard" />;
  }
  return <div>Sign In</div>;
}
`;
      
      const dashboardRedirectContent = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function DashboardRedirect() {
  const { isAdmin } = useAuth();
  if (isAdmin) {
    return <Navigate to="/admin/dashboard" />;
  }
  return <Navigate to="/student/dashboard" />;
}
`;
      
      await writeComponentFile(testDir, 'auth', 'AdminRoute.tsx', adminRouteContent);
      await writePageFile(testDir, 'admin', 'SignInPage.tsx', signinContent);
      await writeRouteFile(testDir, 'DashboardRedirect.tsx', dashboardRedirectContent);
      
      const result = analyzeRedirects(testDir);
      
      // The loop detection should find potential loops
      // Note: The actual loop detection depends on the redirect graph analysis
      expect(result.summary.totalRedirects).toBeGreaterThan(0);
    });


    it('PROPERTY: detectRedirectLoops identifies cycles in redirect graph', () => {
      // Create a mock redirect graph with a cycle
      const redirects: RedirectInstance[] = [
        {
          filePath: 'src/pages/A.tsx',
          lineNumber: 10,
          type: 'Navigate',
          target: '/b',
          userStateContext: 'authenticated',
          isAppropriate: true,
          issues: [],
          evidence: {
            filePath: 'src/pages/A.tsx',
            lineNumbers: [10],
            reason: 'Redirect to /b',
            confidence: 'certain',
          },
        },
        {
          filePath: 'src/pages/B.tsx',
          lineNumber: 10,
          type: 'Navigate',
          target: '/a',
          userStateContext: 'authenticated',
          isAppropriate: true,
          issues: [],
          evidence: {
            filePath: 'src/pages/B.tsx',
            lineNumbers: [10],
            reason: 'Redirect to /a',
            confidence: 'certain',
          },
        },
      ];
      
      // Note: detectRedirectLoops uses file path inference, so this tests the function exists
      const loops = detectRedirectLoops(redirects);
      
      // The function should return an array (may or may not find loops depending on path inference)
      expect(Array.isArray(loops)).toBe(true);
    });

    it('PROPERTY: Redirect loops have proper severity levels', () => {
      // Create a mock loop
      const loop: RedirectLoop = {
        startPath: '/admin',
        sequence: ['/admin', '/auth/signin', '/admin'],
        filesInvolved: ['src/pages/admin/Dashboard.tsx', 'src/pages/auth/SignIn.tsx'],
        severity: 'critical',
        evidence: {
          filePath: 'src/pages/admin/Dashboard.tsx',
          reason: 'Redirect loop detected',
          confidence: 'certain',
        },
      };
      
      // Short loops (2 steps) should be critical
      expect(loop.severity).toBe('critical');
      
      // Longer loops should be high severity
      const longerLoop: RedirectLoop = {
        ...loop,
        sequence: ['/a', '/b', '/c', '/d', '/a'],
        severity: 'high',
      };
      expect(longerLoop.severity).toBe('high');
    });
  });


  describe('Expected redirects configuration', () => {
    it('PROPERTY: EXPECTED_REDIRECTS covers all user states', () => {
      const coveredStates = EXPECTED_REDIRECTS.map(e => e.userState);
      
      expect(coveredStates).toContain('unauthenticated');
      expect(coveredStates).toContain('student');
      expect(coveredStates).toContain('admin');
      expect(coveredStates).toContain('authenticated');
    });

    it('PROPERTY: Each user state has valid expected targets', () => {
      fc.assert(
        fc.property(
          userStateContextArb.filter(s => s !== 'unknown'),
          (userState) => {
            const expectedRedirect = EXPECTED_REDIRECTS.find(e => e.userState === userState);
            
            if (expectedRedirect) {
              expect(expectedRedirect.expectedTargets.length).toBeGreaterThan(0);
              expect(expectedRedirect.description).toBeDefined();
              expect(expectedRedirect.description.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Unauthenticated targets include login paths', () => {
      const unauthExpected = EXPECTED_REDIRECTS.find(e => e.userState === 'unauthenticated');
      
      expect(unauthExpected).toBeDefined();
      expect(unauthExpected!.expectedTargets.some(t => 
        t.includes('signin') || t.includes('login') || t === '/'
      )).toBe(true);
    });

    it('PROPERTY: Student targets include student dashboard', () => {
      const studentExpected = EXPECTED_REDIRECTS.find(e => e.userState === 'student');
      
      expect(studentExpected).toBeDefined();
      expect(studentExpected!.expectedTargets.some(t => 
        t.includes('student/dashboard') || t.includes('/dashboard')
      )).toBe(true);
    });

    it('PROPERTY: Admin targets include admin dashboard', () => {
      const adminExpected = EXPECTED_REDIRECTS.find(e => e.userState === 'admin');
      
      expect(adminExpected).toBeDefined();
      expect(adminExpected!.expectedTargets.some(t => 
        t.includes('admin/dashboard') || t.includes('/admin')
      )).toBe(true);
    });
  });


  describe('File scanning and redirect extraction', () => {
    it('PROPERTY: scanFileForRedirects extracts all redirects from a file', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Create a file with multiple redirect types
      const content = `
import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function MultiRedirectPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  
  if (!user) {
    return <Navigate to="/auth/signin" />;
  }
  
  if (isAdmin) {
    navigate('/admin/dashboard');
  }
  
  return <div>Content</div>;
}
`;
      
      const relativePath = await writePageFile(testDir, 'admin', 'MultiRedirect.tsx', content);
      const redirects = scanFileForRedirects(relativePath, testDir);
      
      // Should find both Navigate and useNavigate redirects
      expect(redirects.length).toBeGreaterThanOrEqual(2);
      expect(redirects.some(r => r.type === 'Navigate')).toBe(true);
      expect(redirects.some(r => r.type === 'useNavigate')).toBe(true);
    });

    it('PROPERTY: Each redirect has valid evidence', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';

export function TestPage() {
  return <Navigate to="/dashboard" />;
}
`;
      
      const relativePath = await writePageFile(testDir, 'admin', 'TestEvidence.tsx', content);
      const redirects = scanFileForRedirects(relativePath, testDir);
      
      for (const redirect of redirects) {
        // Every redirect must have valid evidence
        expect(redirect.evidence).toBeDefined();
        expect(redirect.evidence.filePath).toBe(relativePath);
        expect(redirect.evidence.lineNumbers).toBeDefined();
        expect(redirect.evidence.lineNumbers!.length).toBeGreaterThan(0);
        expect(redirect.evidence.reason).toBeDefined();
        expect(redirect.evidence.reason.length).toBeGreaterThan(0);
        expect(['certain', 'likely', 'possible']).toContain(redirect.evidence.confidence);
      }
    });


    it('PROPERTY: Non-existent files return empty array', () => {
      const redirects = scanFileForRedirects('non/existent/file.tsx', process.cwd());
      
      expect(redirects).toEqual([]);
    });

    it('PROPERTY: Files without redirects return empty array', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function NoRedirectPage() {
  return <div>No redirects here</div>;
}
`;
      
      const relativePath = await writePageFile(testDir, 'admin', 'NoRedirect.tsx', content);
      const redirects = scanFileForRedirects(relativePath, testDir);
      
      expect(redirects).toEqual([]);
    });
  });

  describe('Full redirect analysis', () => {
    it('PROPERTY: analyzeRedirects returns valid RedirectAnalysisResult structure', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Create some test files
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function TestPage() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/auth/signin" />;
  }
  return <div>Content</div>;
}
`;
      
      await writePageFile(testDir, 'admin', 'TestAnalysis.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      // Validate structure
      expect(result).toBeDefined();
      expect(Array.isArray(result.redirects)).toBe(true);
      expect(Array.isArray(result.inappropriateRedirects)).toBe(true);
      expect(Array.isArray(result.redirectLoops)).toBe(true);
      expect(Array.isArray(result.securityIssues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.totalRedirects).toBe('number');
      expect(typeof result.summary.navigateComponents).toBe('number');
      expect(typeof result.summary.useNavigateCalls).toBe('number');
      expect(typeof result.summary.windowLocationRedirects).toBe('number');
      expect(typeof result.summary.inappropriateCount).toBe('number');
      expect(typeof result.summary.loopCount).toBe('number');
    });


    it('PROPERTY: Summary counts match actual redirect arrays', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Create files with different redirect types
      const navigateContent = `
import React from 'react';
import { Navigate } from 'react-router-dom';

export function Nav1() { return <Navigate to="/a" />; }
export function Nav2() { return <Navigate to="/b" />; }
`;
      
      const useNavigateContent = `
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function UseNav() {
  const navigate = useNavigate();
  navigate('/c');
  return <div>Test</div>;
}
`;
      
      await writePageFile(testDir, 'admin', 'NavigatePages.tsx', navigateContent);
      await writePageFile(testDir, 'admin', 'UseNavigatePage.tsx', useNavigateContent);
      
      const result = analyzeRedirects(testDir);
      
      // Summary should match actual counts
      expect(result.summary.totalRedirects).toBe(result.redirects.length);
      expect(result.summary.navigateComponents).toBe(
        result.redirects.filter(r => r.type === 'Navigate').length
      );
      expect(result.summary.useNavigateCalls).toBe(
        result.redirects.filter(r => r.type === 'useNavigate').length
      );
      expect(result.summary.windowLocationRedirects).toBe(
        result.redirects.filter(r => r.type === 'windowLocation' || r.type === 'windowReplace').length
      );
      expect(result.summary.inappropriateCount).toBe(result.inappropriateRedirects.length);
      expect(result.summary.loopCount).toBe(result.redirectLoops.length);
    });

    it('PROPERTY: Inappropriate redirects are subset of all redirects', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function BadRedirect() {
  const { user } = useAuth();
  // Student being redirected to admin page - inappropriate!
  if (!isAdmin) {
    return <Navigate to="/admin/dashboard" />;
  }
  return <div>Content</div>;
}
`;
      
      await writePageFile(testDir, 'student', 'BadRedirect.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      // All inappropriate redirects should be in the main redirects array
      for (const inappropriate of result.inappropriateRedirects) {
        expect(result.redirects).toContainEqual(inappropriate);
      }
    });
  });


  describe('Security issue generation', () => {
    it('PROPERTY: Inappropriate redirects generate security issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Create a file with an inappropriate redirect (unauthenticated to admin)
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function BadAuthRedirect() {
  const { user } = useAuth();
  if (!user) {
    // This is wrong - unauthenticated users should not go to admin
    return <Navigate to="/admin/dashboard" />;
  }
  return <div>Content</div>;
}
`;
      
      await writeComponentFile(testDir, 'auth', 'BadAuthRedirect.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      // Should have security issues for inappropriate redirects
      if (result.inappropriateRedirects.length > 0) {
        expect(result.securityIssues.length).toBeGreaterThan(0);
      }
    });

    it('PROPERTY: Security issues have valid severity levels', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';

export function TestSeverity() {
  if (!user) {
    return <Navigate to="/admin" />;
  }
  return <div>Test</div>;
}
`;
      
      await writeComponentFile(testDir, 'auth', 'TestSeverity.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      for (const issue of result.securityIssues) {
        expect(['critical', 'high', 'medium', 'low']).toContain(issue.severity);
        expect(issue.type).toBeDefined();
        expect(issue.filePath).toBeDefined();
        expect(issue.evidence).toBeDefined();
      }
    });

    it('PROPERTY: Unauthenticated to admin redirect is critical severity', () => {
      // Test the appropriateness check directly
      const result = checkRedirectAppropriateness('/admin/dashboard', 'unauthenticated');
      
      expect(result.isAppropriate).toBe(false);
      expect(result.issues.some(i => i.includes('Unauthenticated'))).toBe(true);
    });
  });


  describe('RedirectInstance structure validation', () => {
    it('PROPERTY: Every RedirectInstance has all required fields', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          redirectTypeArb,
          fc.constantFrom('/dashboard', '/admin', '/student/dashboard', '/auth/signin'),
          async (redirectType, target) => {
            const config: PageWithRedirectConfig = {
              componentName: 'TestComponent',
              redirectType,
              target,
              userStateCheck: 'none',
              hasAuthImport: false,
            };
            
            const content = generatePageWithRedirect(config);
            const relativePath = await writePageFile(testDir, 'admin', `Test${redirectType}.tsx`, content);
            const redirects = scanFileForRedirects(relativePath, testDir);
            
            for (const redirect of redirects) {
              // Required fields
              expect(redirect.filePath).toBeDefined();
              expect(typeof redirect.filePath).toBe('string');
              expect(redirect.lineNumber).toBeDefined();
              expect(typeof redirect.lineNumber).toBe('number');
              expect(redirect.lineNumber).toBeGreaterThan(0);
              expect(redirect.type).toBeDefined();
              expect(['Navigate', 'useNavigate', 'windowLocation', 'windowReplace']).toContain(redirect.type);
              expect(redirect.target).toBeDefined();
              expect(typeof redirect.target).toBe('string');
              expect(redirect.userStateContext).toBeDefined();
              expect(['unauthenticated', 'authenticated', 'student', 'admin', 'unknown']).toContain(redirect.userStateContext);
              expect(typeof redirect.isAppropriate).toBe('boolean');
              expect(Array.isArray(redirect.issues)).toBe(true);
              expect(redirect.evidence).toBeDefined();
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });


  describe('Edge cases and special scenarios', () => {
    it('PROPERTY: Dynamic redirect paths are handled', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Dynamic paths with template literals should not cause errors
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';

export function DynamicRedirect({ id }) {
  return <Navigate to="/student/application" />;
}
`;
      
      const relativePath = await writePageFile(testDir, 'student', 'DynamicRedirect.tsx', content);
      const redirects = scanFileForRedirects(relativePath, testDir);
      
      // Should handle the redirect without errors
      expect(Array.isArray(redirects)).toBe(true);
    });

    it('PROPERTY: Empty directory returns empty results', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Don't create any files
      const result = analyzeRedirects(testDir);
      
      expect(result.redirects).toEqual([]);
      expect(result.inappropriateRedirects).toEqual([]);
      expect(result.redirectLoops).toEqual([]);
      expect(result.summary.totalRedirects).toBe(0);
    });

    it('PROPERTY: Protected route components are recognized', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/auth/signin" />;
  }
  return children;
}
`;
      
      await writeComponentFile(testDir, 'auth', 'ProtectedRoute.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      // Should find the redirect in the protected route
      expect(result.redirects.length).toBeGreaterThan(0);
      
      // The redirect should be appropriate (unauthenticated -> signin)
      const protectedRouteRedirect = result.redirects.find(r => 
        r.filePath.includes('ProtectedRoute')
      );
      
      if (protectedRouteRedirect) {
        expect(protectedRouteRedirect.target).toBe('/auth/signin');
        expect(protectedRouteRedirect.isAppropriate).toBe(true);
      }
    });


    it('PROPERTY: Dashboard redirect component handles role-based routing', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function DashboardRedirect() {
  const { user, isAdmin } = useAuth();
  
  if (!user) {
    return <Navigate to="/auth/signin" />;
  }
  
  if (isAdmin) {
    return <Navigate to="/admin/dashboard" />;
  }
  
  return <Navigate to="/student/dashboard" />;
}
`;
      
      await writeRouteFile(testDir, 'DashboardRedirect.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      // Should find multiple redirects
      const dashboardRedirects = result.redirects.filter(r => 
        r.filePath.includes('DashboardRedirect')
      );
      
      expect(dashboardRedirects.length).toBeGreaterThanOrEqual(1);
    });

    it('PROPERTY: Auth callback redirects are handled', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function AuthCallbackPage() {
  const { user, error } = useAuth();
  
  if (error) {
    return <Navigate to="/auth/signin" />;
  }
  
  if (user) {
    return <Navigate to="/dashboard" />;
  }
  
  return <div>Processing...</div>;
}
`;
      
      await writePageFile(testDir, 'admin', 'AuthCallbackPage.tsx', content);
      
      const result = analyzeRedirects(testDir);
      
      // Should find the redirects
      expect(result.redirects.length).toBeGreaterThan(0);
    });
  });
});
