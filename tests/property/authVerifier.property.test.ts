/**
 * Property-Based Tests: Auth Check Verification
 * Feature: frontend-backend-forensic-audit
 * Task: 4.5 Write property test for auth check verification
 * 
 * **Property 5: Auth Check Verification**
 * 
 * *For any* protected page (admin or authenticated routes), the Page Auditor
 * SHALL verify that auth checks are present and correctly implemented.
 * 
 * **Validates: Requirements 2.2**
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  verifyAuthCheck,
  isAdminPage,
  isStudentPage,
  isAuthPage,
  isPublicPage,
} from '../../scripts/audit/page/authVerifier';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Auth verification involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 100;

/**
 * Base temporary directory for test fixtures - unique per test run
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-auth-verifier');

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
 * Valid role names in the MIHAS system
 */
const roleArb = fc.constantFrom(
  'admin',
  'super_admin',
  'student',
  'reviewer',
  'admissions_officer',
  'registrar',
  'finance_officer',
  'academic_head'
);

/**
 * Auth hook patterns that can be used in components
 */
const authHookPatternArb = fc.constantFrom(
  'useAuth',
  'useOptimizedAuthState',
  'useAuthCheck',
  'useRoleQuery'
);

/**
 * Generate useAuth hook destructuring pattern
 */
interface UseAuthConfig {
  hookName: string;
  destructuredVars: string[];
}

const useAuthConfigArb: fc.Arbitrary<UseAuthConfig> = fc.record({
  hookName: authHookPatternArb,
  destructuredVars: fc.array(
    fc.constantFrom('user', 'isAuthenticated', 'isLoading', 'isAdmin', 'hasAdminRole', 'login', 'logout', 'profile'),
    { minLength: 1, maxLength: 4 }
  ),
});

function generateUseAuthCode(config: UseAuthConfig): string {
  const uniqueVars = [...new Set(config.destructuredVars)];
  return `const { ${uniqueVars.join(', ')} } = ${config.hookName}();`;
}

/**
 * Generate ProtectedRoute wrapper pattern
 */
type RouteWrapperType = 'ProtectedRoute' | 'AdminRoute' | 'StudentRoute';

const routeWrapperArb: fc.Arbitrary<RouteWrapperType> = fc.constantFrom(
  'ProtectedRoute',
  'AdminRoute',
  'StudentRoute'
);

/**
 * Generate role check patterns
 */
interface RoleCheckConfig {
  checkType: 'direct' | 'isAdmin' | 'hasAdminRole' | 'isAdminRoleFunction' | 'requireRole';
  roles: string[];
}

const roleCheckConfigArb: fc.Arbitrary<RoleCheckConfig> = fc.record({
  checkType: fc.constantFrom<'direct' | 'isAdmin' | 'hasAdminRole' | 'isAdminRoleFunction' | 'requireRole'>(
    'direct', 'isAdmin', 'hasAdminRole', 'isAdminRoleFunction', 'requireRole'
  ),
  roles: fc.array(roleArb, { minLength: 1, maxLength: 3 }),
});

function generateRoleCheckCode(config: RoleCheckConfig): string {
  switch (config.checkType) {
    case 'direct':
      return `if (user.role === '${config.roles[0]}') { /* admin content */ }`;
    case 'isAdmin':
      return `if (isAdmin) { /* admin content */ }`;
    case 'hasAdminRole':
      return `if (hasAdminRole) { /* admin content */ }`;
    case 'isAdminRoleFunction':
      return `if (isAdminRole(user.role)) { /* admin content */ }`;
    case 'requireRole':
      const roleList = config.roles.map(r => `'${r}'`).join(', ');
      return `requireRole([${roleList}])`;
  }
}

/**
 * Generate a complete React page component with auth patterns
 */
interface PageAuthConfig {
  componentName: string;
  pageType: 'admin' | 'student' | 'auth' | 'public';
  authHook?: UseAuthConfig;
  routeWrapper?: RouteWrapperType;
  roleCheck?: RoleCheckConfig;
  hasRedirect: boolean;
}

const pageAuthConfigArb: fc.Arbitrary<PageAuthConfig> = fc.record({
  componentName: fc.constantFrom('Dashboard', 'Profile', 'Settings', 'Users', 'Applications', 'Login'),
  pageType: fc.constantFrom<'admin' | 'student' | 'auth' | 'public'>('admin', 'student', 'auth', 'public'),
  authHook: fc.option(useAuthConfigArb, { nil: undefined }),
  routeWrapper: fc.option(routeWrapperArb, { nil: undefined }),
  roleCheck: fc.option(roleCheckConfigArb, { nil: undefined }),
  hasRedirect: fc.boolean(),
});

function generatePageComponent(config: PageAuthConfig): string {
  const imports = [`import React from 'react';`];
  const hookCalls: string[] = [];
  let jsxContent = `<div><h1>${config.componentName}</h1></div>`;
  
  // Add auth hook import and usage
  if (config.authHook) {
    imports.push(`import { ${config.authHook.hookName} } from '@/hooks';`);
    hookCalls.push(generateUseAuthCode(config.authHook));
  }
  
  // Add route wrapper import
  if (config.routeWrapper) {
    imports.push(`import { ${config.routeWrapper} } from '@/components/auth';`);
    jsxContent = `<${config.routeWrapper}>\n      ${jsxContent}\n    </${config.routeWrapper}>`;
  }
  
  // Add role check
  let roleCheckCode = '';
  if (config.roleCheck) {
    roleCheckCode = generateRoleCheckCode(config.roleCheck);
  }
  
  // Add redirect logic
  let redirectCode = '';
  if (config.hasRedirect && config.authHook) {
    imports.push(`import { Navigate } from 'react-router-dom';`);
    redirectCode = `if (!isAuthenticated) return <Navigate to="/login" />;`;
  }
  
  return `${imports.join('\n')}

export function ${config.componentName}() {
  ${hookCalls.join('\n  ')}
  
  ${redirectCode}
  ${roleCheckCode}
  
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
  await mkdir(join(testDir, 'src', 'pages', 'admin'), { recursive: true });
  await mkdir(join(testDir, 'src', 'pages', 'student'), { recursive: true });
  await mkdir(join(testDir, 'src', 'pages', 'auth'), { recursive: true });
  await mkdir(join(testDir, 'src', 'pages', 'public'), { recursive: true });
}

/**
 * Write a test page file to the appropriate directory based on page type
 */
async function writeTestPageFile(
  testDir: string,
  filename: string,
  content: string,
  pageType: 'admin' | 'student' | 'auth' | 'public'
): Promise<string> {
  const relativePath = `src/pages/${pageType}/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 5: Auth Check Verification', () => {
  /**
   * **Validates: Requirements 2.2**
   * 
   * WHEN the Audit_System examines a page THEN it SHALL verify auth checks
   * are present and correct.
   */
  
  // Clean up all test fixtures after all tests complete
  afterAll(async () => {
    try {
      await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Page type classification', () => {
    it('PROPERTY: isAdminPage correctly identifies admin pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/pages/admin/Dashboard.tsx',
            'src/pages/admin/Users.tsx',
            'src/pages/admin/Settings.tsx',
            'pages/admin/Applications.tsx'
          ),
          (filePath) => {
            expect(isAdminPage(filePath)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isAdminPage returns false for non-admin pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/pages/student/Dashboard.tsx',
            'src/pages/auth/Login.tsx',
            'src/pages/Home.tsx',
            'src/components/admin/Widget.tsx'
          ),
          (filePath) => {
            expect(isAdminPage(filePath)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isStudentPage correctly identifies student pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/pages/student/Dashboard.tsx',
            'src/pages/student/Applications.tsx',
            'src/pages/student/Profile.tsx',
            'pages/student/Documents.tsx'
          ),
          (filePath) => {
            expect(isStudentPage(filePath)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isAuthPage correctly identifies auth pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/pages/auth/Login.tsx',
            'src/pages/auth/Register.tsx',
            'src/pages/auth/ForgotPassword.tsx',
            'pages/auth/ResetPassword.tsx'
          ),
          (filePath) => {
            expect(isAuthPage(filePath)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isPublicPage correctly identifies public pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'src/pages/LandingPage.tsx',
            'src/pages/NotFoundPage.tsx',
            'src/pages/ErrorPage.tsx',
            'src/pages/Home.tsx',
            'src/pages/404.tsx'
          ),
          (filePath) => {
            expect(isPublicPage(filePath)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('useAuth pattern detection', () => {
    it('PROPERTY: useAuth hook usage is correctly detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          useAuthConfigArb,
          async (authConfig) => {
            const config: PageAuthConfig = {
              componentName: 'TestPage',
              pageType: 'student',
              authHook: authConfig,
              routeWrapper: undefined,
              roleCheck: undefined,
              hasRedirect: false,
            };
            const content = generatePageComponent(config);
            const relativePath = await writeTestPageFile(testDir, 'TestPage.tsx', content, 'student');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            // Should detect auth check
            expect(result.hasAuthCheck).toBe(true);
            expect(result.authMechanism).toBe('useAuth');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All auth hook variants are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          authHookPatternArb,
          async (hookName) => {
            const content = `
import React from 'react';
import { ${hookName} } from '@/hooks';

export function TestPage() {
  const { user, isAuthenticated } = ${hookName}();
  return <div>Test</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'HookTest.tsx', content, 'student');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasAuthCheck).toBe(true);
            expect(result.authMechanism).toBe('useAuth');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('ProtectedRoute pattern detection', () => {
    it('PROPERTY: ProtectedRoute wrapper is correctly detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          routeWrapperArb,
          async (wrapperType) => {
            const content = `
import React from 'react';
import { ${wrapperType} } from '@/components/auth';

export function TestPage() {
  return (
    <${wrapperType}>
      <div>Protected Content</div>
    </${wrapperType}>
  );
}
`;
            const relativePath = await writeTestPageFile(testDir, 'RouteTest.tsx', content, 'student');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasAuthCheck).toBe(true);
            expect(result.authMechanism).toBe('ProtectedRoute');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: AdminRoute implies ProtectedRoute mechanism', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { AdminRoute } from '@/components/auth';

export function AdminDashboard() {
  return (
    <AdminRoute>
      <div>Admin Content</div>
    </AdminRoute>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'AdminDash.tsx', content, 'admin');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(true);
      expect(result.authMechanism).toBe('ProtectedRoute');
    });
  });

  describe('Admin pages without auth checks are flagged', () => {
    it('PROPERTY: Admin page without auth check generates issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function AdminDashboard() {
  return <div>Admin Dashboard</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'NoAuth.tsx', content, 'admin');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(false);
      expect(result.authMechanism).toBe('none');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.includes('Admin page missing auth check'))).toBe(true);
    });

    it('PROPERTY: Admin page without role check generates issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks';

export function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  return <div>Admin Dashboard</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'NoRole.tsx', content, 'admin');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(true);
      expect(result.hasRoleCheck).toBe(false);
      expect(result.issues.some(i => i.includes('Admin page missing role check'))).toBe(true);
    });

    it('PROPERTY: Admin page with both auth and role check has no issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          roleCheckConfigArb,
          async (roleConfig) => {
            const content = `
import React from 'react';
import { useAuth } from '@/hooks';

export function AdminDashboard() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  
  ${generateRoleCheckCode(roleConfig)}
  
  return <div>Admin Dashboard</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'WithRole.tsx', content, 'admin');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasAuthCheck).toBe(true);
            expect(result.hasRoleCheck).toBe(true);
            // Should have no critical issues (may have informational ones)
            const criticalIssues = result.issues.filter(i => 
              i.includes('missing auth check') || i.includes('missing role check')
            );
            expect(criticalIssues.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Role checks are correctly extracted', () => {
    it('PROPERTY: Direct role comparison extracts role name', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          roleArb,
          async (role) => {
            const content = `
import React from 'react';
import { useAuth } from '@/hooks';

export function AdminPage() {
  const { user } = useAuth();
  
  if (user.role === '${role}') {
    return <div>Role-specific content</div>;
  }
  
  return <div>Default content</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'RoleExtract.tsx', content, 'admin');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasRoleCheck).toBe(true);
            expect(result.roles).toContain(role);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isAdmin check adds admin and super_admin roles', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks';

export function AdminPage() {
  const { user, isAdmin } = useAuth();
  
  if (isAdmin) {
    return <div>Admin content</div>;
  }
  
  return <div>Default content</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'IsAdmin.tsx', content, 'admin');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasRoleCheck).toBe(true);
      expect(result.roles).toContain('admin');
      expect(result.roles).toContain('super_admin');
    });

    it('PROPERTY: requireRole wrapper extracts all specified roles', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(roleArb, { minLength: 1, maxLength: 3 }),
          async (roles) => {
            const uniqueRoles = [...new Set(roles)];
            const roleList = uniqueRoles.map(r => `'${r}'`).join(', ');
            const content = `
import React from 'react';
import { requireRole } from '@/lib/auth';

export function AdminPage() {
  requireRole([${roleList}]);
  
  return <div>Admin content</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'RequireRole.tsx', content, 'admin');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasRoleCheck).toBe(true);
            for (const role of uniqueRoles) {
              expect(result.roles).toContain(role);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Student pages auth verification', () => {
    it('PROPERTY: Student page without auth check generates issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function StudentDashboard() {
  return <div>Student Dashboard</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'NoAuth.tsx', content, 'student');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(false);
      expect(result.issues.some(i => i.includes('Student page missing auth check'))).toBe(true);
    });

    it('PROPERTY: Student page with auth check has no auth-related issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          useAuthConfigArb,
          async (authConfig) => {
            const content = `
import React from 'react';
import { ${authConfig.hookName} } from '@/hooks';

export function StudentDashboard() {
  const { ${[...new Set(authConfig.destructuredVars)].join(', ')} } = ${authConfig.hookName}();
  
  return <div>Student Dashboard</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'WithAuth.tsx', content, 'student');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasAuthCheck).toBe(true);
            // Student pages don't require role checks
            const authIssues = result.issues.filter(i => 
              i.includes('Student page missing auth check')
            );
            expect(authIssues.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Auth and public pages are exempt', () => {
    it('PROPERTY: Auth pages without auth check have no issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function LoginPage() {
  return <div>Login Form</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'Login.tsx', content, 'auth');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      // Auth pages don't need auth checks
      expect(result.issues.filter(i => i.includes('missing auth check')).length).toBe(0);
    });

    it('PROPERTY: Public pages without auth check have no issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('LandingPage', 'NotFoundPage', 'ErrorPage', 'HomePage'),
          async (pageName) => {
            const content = `
import React from 'react';

export function ${pageName}() {
  return <div>${pageName}</div>;
}
`;
            // Write to root pages directory with a name that matches public page patterns
            const relativePath = `src/pages/${pageName}.tsx`;
            const filePath = join(testDir, relativePath);
            await writeFile(filePath, content, 'utf-8');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            // Public pages don't need auth checks
            expect(result.issues.filter(i => i.includes('missing auth check')).length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('AuthCheckResult structure is valid', () => {
    it('PROPERTY: verifyAuthCheck always returns valid AuthCheckResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          pageAuthConfigArb,
          async (pageConfig) => {
            const content = generatePageComponent(pageConfig);
            const relativePath = await writeTestPageFile(testDir, 'ValidResult.tsx', content, pageConfig.pageType);
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            // Required fields must be present and have correct types
            expect(typeof result.hasAuthCheck).toBe('boolean');
            expect(['useAuth', 'requireAuth', 'ProtectedRoute', 'none']).toContain(result.authMechanism);
            expect(typeof result.hasRoleCheck).toBe('boolean');
            expect(Array.isArray(result.roles)).toBe(true);
            expect(Array.isArray(result.issues)).toBe(true);
            
            // All roles should be strings
            for (const role of result.roles) {
              expect(typeof role).toBe('string');
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

    it('PROPERTY: hasAuthCheck is true iff authMechanism is not none', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          pageAuthConfigArb,
          async (pageConfig) => {
            const content = generatePageComponent(pageConfig);
            const relativePath = await writeTestPageFile(testDir, 'AuthConsistency.tsx', content, pageConfig.pageType);
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            // hasAuthCheck should be consistent with authMechanism
            if (result.authMechanism === 'none') {
              expect(result.hasAuthCheck).toBe(false);
            } else {
              expect(result.hasAuthCheck).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Roles array is empty when hasRoleCheck is false', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks';

export function SimplePage() {
  const { user } = useAuth();
  return <div>Simple</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'NoRoles.tsx', content, 'student');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      if (!result.hasRoleCheck) {
        expect(result.roles.length).toBe(0);
      }
    });
  });

  describe('Edge cases', () => {
    it('PROPERTY: Non-existent file returns error in issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = verifyAuthCheck('src/pages/NonExistent.tsx', testDir);
      
      expect(result.hasAuthCheck).toBe(false);
      expect(result.authMechanism).toBe('none');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.includes('not found') || i.includes('File not found'))).toBe(true);
    });

    it('PROPERTY: Empty file returns no auth check', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `// Empty file\n`;
      const relativePath = await writeTestPageFile(testDir, 'Empty.tsx', content, 'student');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(false);
      expect(result.authMechanism).toBe('none');
    });

    it('PROPERTY: File with only comments returns no auth check', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
// This is a comment
/* Multi-line
   comment */
`;
      const relativePath = await writeTestPageFile(testDir, 'Comments.tsx', content, 'student');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(false);
      expect(result.authMechanism).toBe('none');
    });

    it('PROPERTY: Multiple auth patterns - highest priority wins', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // ProtectedRoute should take priority over useAuth
      const content = `
import React from 'react';
import { useAuth } from '@/hooks';
import { ProtectedRoute } from '@/components/auth';

export function MultiAuthPage() {
  const { user } = useAuth();
  
  return (
    <ProtectedRoute>
      <div>Content</div>
    </ProtectedRoute>
  );
}
`;
      const relativePath = await writeTestPageFile(testDir, 'MultiAuth.tsx', content, 'student');
      
      const result = verifyAuthCheck(relativePath, testDir);
      
      expect(result.hasAuthCheck).toBe(true);
      // ProtectedRoute should be detected as the mechanism (higher priority)
      expect(result.authMechanism).toBe('ProtectedRoute');
    });

    it('PROPERTY: Multiple role checks - all roles are extracted', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(roleArb, roleArb, roleArb).filter(([a, b, c]) => a !== b && b !== c && a !== c),
          async ([role1, role2, role3]) => {
            const content = `
import React from 'react';
import { useAuth } from '@/hooks';

export function MultiRolePage() {
  const { user, isAdmin } = useAuth();
  
  if (user.role === '${role1}') {
    return <div>Role 1</div>;
  }
  if (user.role === '${role2}') {
    return <div>Role 2</div>;
  }
  if (user.role === '${role3}') {
    return <div>Role 3</div>;
  }
  
  return <div>Default</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'MultiRole.tsx', content, 'admin');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasRoleCheck).toBe(true);
            expect(result.roles).toContain(role1);
            expect(result.roles).toContain(role2);
            expect(result.roles).toContain(role3);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Combined auth and role verification', () => {
    it('PROPERTY: Complete admin page with all checks passes verification', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            useAuthConfigArb,
            roleCheckConfigArb
          ),
          async ([authConfig, roleConfig]) => {
            const content = `
import React from 'react';
import { ${authConfig.hookName} } from '@/hooks';
import { Navigate } from 'react-router-dom';

export function AdminDashboard() {
  const { ${[...new Set(authConfig.destructuredVars)].join(', ')}, isAdmin } = ${authConfig.hookName}();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  ${generateRoleCheckCode(roleConfig)}
  
  return <div>Admin Dashboard</div>;
}
`;
            const relativePath = await writeTestPageFile(testDir, 'CompleteAdmin.tsx', content, 'admin');
            
            const result = verifyAuthCheck(relativePath, testDir);
            
            expect(result.hasAuthCheck).toBe(true);
            expect(result.hasRoleCheck).toBe(true);
            
            // Should have no critical issues
            const criticalIssues = result.issues.filter(i => 
              i.includes('missing auth check') || i.includes('missing role check')
            );
            expect(criticalIssues.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
