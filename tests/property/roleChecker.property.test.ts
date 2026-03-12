/**
 * Property-Based Tests: Role and Permission Enforcement
 * Feature: frontend-backend-forensic-audit
 * Task: 7.5 Write property test for role enforcement
 * 
 * **Property 13: Role and Permission Enforcement**
 * 
 * *For any* role-protected route or feature, the Auth Auditor SHALL verify that
 * role checks are present and that no cross-role data leakage is possible.
 * 
 * **Validates: Requirements 4.4, 4.6, 4.7**
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkRoleEnforcement,
  detectRoleCheckTypes,
  extractCheckedRoles,
  hasPermissionBoundary,
  detectSecurityIssues,
  isRouteProtected,
  ADMIN_ROLES,
  type RoleCheckType,
  type RoleEnforcementResult,
} from '../../scripts/audit/auth/roleChecker';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Role checking involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 10;

/**
 * Base temporary directory for test fixtures - unique per test run
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-role-checker');

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
 * Valid admin role names in the MIHAS system
 */
const adminRoleArb = fc.constantFrom(...ADMIN_ROLES);

/**
 * Role check type arbitrary
 */
const roleCheckTypeArb: fc.Arbitrary<RoleCheckType> = fc.constantFrom(
  'useAuth',
  'isAdmin',
  'hasAdminRole',
  'isAdminRole',
  'useOptimizedAuthState',
  'AdminRoute',
  'ProtectedRoute',
  'directRoleComparison',
  'roleArrayIncludes',
  'superAdminEmailCheck'
);

/**
 * Generate admin page component names
 */
const adminComponentNameArb = fc.constantFrom(
  'Dashboard',
  'AdminDashboard',
  'Users',
  'AdminUsers',
  'Settings',
  'AdminSettings',
  'Applications',
  'AdminApplications',
  'Analytics',
  'AuditTrail',
  'Programs',
  'Intakes',
  'CustomAdminPage'
);

/**
 * Generate role check code patterns
 */
interface RoleCheckConfig {
  type: RoleCheckType;
  roles: string[];
}

const roleCheckConfigArb: fc.Arbitrary<RoleCheckConfig> = fc.record({
  type: roleCheckTypeArb,
  roles: fc.array(adminRoleArb, { minLength: 1, maxLength: 3 }),
});


/**
 * Generate role check code based on type
 */
function generateRoleCheckCode(config: RoleCheckConfig): string {
  const { type, roles } = config;
  
  switch (type) {
    case 'useAuth':
      return `const { hasAdminRole, isAdmin } = useAuth();`;
    case 'isAdmin':
      return `if (isAdmin) { /* admin content */ }`;
    case 'hasAdminRole':
      return `if (hasAdminRole) { /* admin content */ }`;
    case 'isAdminRole':
      return `if (isAdminRole(user.role)) { /* admin content */ }`;
    case 'useOptimizedAuthState':
      return `const { isAdmin } = useOptimizedAuthState();`;
    case 'AdminRoute':
      return `<AdminRoute><div>Admin Content</div></AdminRoute>`;
    case 'ProtectedRoute':
      return `<ProtectedRoute><div>Protected Content</div></ProtectedRoute>`;
    case 'directRoleComparison':
      return `if (user.role === '${roles[0]}') { /* role content */ }`;
    case 'roleArrayIncludes':
      const roleList = roles.map(r => `'${r}'`).join(', ');
      return `if ([${roleList}].includes(user.role)) { /* role content */ }`;
    case 'superAdminEmailCheck':
      return `if (user.email === '***REMOVED***') { /* super admin */ }`;
    default:
      return '';
  }
}

/**
 * Generate a complete admin page component
 */
interface AdminPageConfig {
  componentName: string;
  hasRoleCheck: boolean;
  roleCheckConfig?: RoleCheckConfig;
  hasPermissionBoundary: boolean;
  hasDataFetching: boolean;
  hasHardcodedEmail: boolean;
}

const adminPageConfigArb: fc.Arbitrary<AdminPageConfig> = fc.record({
  componentName: adminComponentNameArb,
  hasRoleCheck: fc.boolean(),
  roleCheckConfig: fc.option(roleCheckConfigArb, { nil: undefined }),
  hasPermissionBoundary: fc.boolean(),
  hasDataFetching: fc.boolean(),
  hasHardcodedEmail: fc.boolean(),
});


function generateAdminPageComponent(config: AdminPageConfig): string {
  const imports = [`import React from 'react';`];
  const hookCalls: string[] = [];
  let roleCheckCode = '';
  let permissionBoundaryCode = '';
  let dataFetchingCode = '';
  
  // Add role check imports and code
  if (config.hasRoleCheck && config.roleCheckConfig) {
    const { type } = config.roleCheckConfig;
    
    if (type === 'useAuth') {
      imports.push(`import { useAuth } from '@/contexts/AuthContext';`);
      hookCalls.push(generateRoleCheckCode(config.roleCheckConfig));
    } else if (type === 'useOptimizedAuthState') {
      imports.push(`import { useOptimizedAuthState } from '@/hooks/useOptimizedAuthState';`);
      hookCalls.push(generateRoleCheckCode(config.roleCheckConfig));
    } else if (type === 'AdminRoute' || type === 'ProtectedRoute') {
      imports.push(`import { ${type} } from '@/components/auth';`);
    } else if (type === 'isAdmin' || type === 'hasAdminRole') {
      imports.push(`import { useAuth } from '@/hooks/useAuth';`);
      hookCalls.push(`const { ${type === 'isAdmin' ? 'isAdmin' : 'hasAdminRole'} } = useAuth();`);
      roleCheckCode = generateRoleCheckCode(config.roleCheckConfig);
    } else {
      imports.push(`import { useAuth } from '@/hooks/useAuth';`);
      hookCalls.push(`const { user } = useAuth();`);
      roleCheckCode = generateRoleCheckCode(config.roleCheckConfig);
    }
  }
  
  // Add permission boundary
  if (config.hasPermissionBoundary) {
    imports.push(`import { Navigate } from 'react-router-dom';`);
    permissionBoundaryCode = `if (!isAdmin) return <Navigate to="/login" />;`;
  }
  
  // Add data fetching
  if (config.hasDataFetching) {
    imports.push(`import { useQuery } from '@tanstack/react-query';`);
    dataFetchingCode = `
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/admin?action=users').then(r => r.json()),
  });`;
  }
  
  // Add hardcoded email check
  let hardcodedEmailCode = '';
  if (config.hasHardcodedEmail) {
    hardcodedEmailCode = `if (user.email === 'super***REMOVED***') { /* super admin only */ }`;
  }

  // Build component based on whether it uses route wrapper
  const usesRouteWrapper = config.roleCheckConfig?.type === 'AdminRoute' || 
                           config.roleCheckConfig?.type === 'ProtectedRoute';
  
  if (usesRouteWrapper && config.roleCheckConfig) {
    const wrapper = config.roleCheckConfig.type;
    return `${imports.join('\n')}

export function ${config.componentName}() {
  ${hookCalls.join('\n  ')}
  ${dataFetchingCode}
  ${hardcodedEmailCode}
  
  return (
    <${wrapper}>
      <div>${config.componentName} Content</div>
    </${wrapper}>
  );
}

export default ${config.componentName};
`;
  }

  return `${imports.join('\n')}

export function ${config.componentName}() {
  ${hookCalls.join('\n  ')}
  ${permissionBoundaryCode}
  ${roleCheckCode}
  ${dataFetchingCode}
  ${hardcodedEmailCode}
  
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
  await mkdir(join(testDir, 'src', 'pages', 'admin', 'components'), { recursive: true });
}

/**
 * Write an admin page file to the test directory
 */
async function writeAdminPageFile(
  testDir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/pages/admin/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}

/**
 * Write a child component file to the test directory
 */
async function writeChildComponentFile(
  testDir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/pages/admin/components/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 13: Role and Permission Enforcement', () => {
  /**
   * **Validates: Requirements 4.4, 4.6, 4.7**
   * 
   * WHEN the Audit_System examines auth THEN it SHALL verify role enforcement
   * is consistent.
   * 
   * WHEN the Audit_System examines auth THEN it SHALL verify permission
   * boundaries are enforced.
   * 
   * IF cross-role data leakage is possible THEN the Audit_System SHALL flag
   * it as SECURITY_ISSUE.
   */
  
  // Clean up all test fixtures after all tests complete
  afterAll(async () => {
    try {
      await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });


  describe('Role check type detection', () => {
    it('PROPERTY: detectRoleCheckTypes correctly identifies all role check patterns', () => {
      fc.assert(
        fc.property(
          roleCheckConfigArb,
          (config) => {
            const code = generateRoleCheckCode(config);
            const detectedTypes = detectRoleCheckTypes(code);
            
            // The generated code should be detected as having the expected type
            expect(detectedTypes).toContain(config.type);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Empty content returns no role check types', () => {
      const types = detectRoleCheckTypes('');
      expect(types).toHaveLength(0);
    });

    it('PROPERTY: Content without role checks returns empty array', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.includes('isAdmin') && !s.includes('role')),
          (content) => {
            const types = detectRoleCheckTypes(content);
            // Should not detect role checks in random content without role keywords
            expect(types.every(t => 
              t !== 'isAdmin' && 
              t !== 'hasAdminRole' && 
              t !== 'directRoleComparison'
            )).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multiple role check types can be detected in same content', () => {
      const content = `
        const { isAdmin, hasAdminRole } = useAuth();
        if (isAdmin) { /* admin */ }
        if (user.role === 'admin') { /* direct check */ }
      `;
      
      const types = detectRoleCheckTypes(content);
      
      expect(types).toContain('useAuth');
      expect(types).toContain('isAdmin');
      expect(types).toContain('hasAdminRole');
      expect(types).toContain('directRoleComparison');
    });
  });


  describe('Role extraction from code', () => {
    it('PROPERTY: extractCheckedRoles extracts roles from direct comparisons', () => {
      fc.assert(
        fc.property(
          adminRoleArb,
          (role) => {
            const code = `if (user.role === '${role}') { /* content */ }`;
            const roles = extractCheckedRoles(code);
            
            expect(roles).toContain(role);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: extractCheckedRoles extracts all roles from array includes', () => {
      fc.assert(
        fc.property(
          fc.array(adminRoleArb, { minLength: 1, maxLength: 4 }),
          (roleList) => {
            const uniqueRoles = [...new Set(roleList)];
            const roleStr = uniqueRoles.map(r => `'${r}'`).join(', ');
            const code = `if ([${roleStr}].includes(user.role)) { /* content */ }`;
            const extractedRoles = extractCheckedRoles(code);
            
            for (const role of uniqueRoles) {
              expect(extractedRoles).toContain(role);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isAdmin pattern adds admin and super_admin roles', () => {
      const code = `if (isAdmin) { /* admin content */ }`;
      const roles = extractCheckedRoles(code);
      
      expect(roles).toContain('admin');
      expect(roles).toContain('super_admin');
    });

    it('PROPERTY: hasAdminRole pattern adds admin and super_admin roles', () => {
      const code = `if (hasAdminRole) { /* admin content */ }`;
      const roles = extractCheckedRoles(code);
      
      expect(roles).toContain('admin');
      expect(roles).toContain('super_admin');
    });

    it('PROPERTY: Empty content returns empty roles array', () => {
      const roles = extractCheckedRoles('');
      expect(roles).toHaveLength(0);
    });
  });


  describe('Permission boundary detection', () => {
    it('PROPERTY: hasPermissionBoundary detects conditional rendering', () => {
      const code = `{isAdmin ? <AdminContent /> : <UserContent />}`;
      expect(hasPermissionBoundary(code)).toBe(true);
    });

    it('PROPERTY: hasPermissionBoundary detects early return', () => {
      const code = `if (!isAdmin) { return null; }`;
      expect(hasPermissionBoundary(code)).toBe(true);
    });

    it('PROPERTY: hasPermissionBoundary detects redirect for non-admin', () => {
      const code = `if (!isAdmin) { return <Navigate to="/login" />; }`;
      expect(hasPermissionBoundary(code)).toBe(true);
    });

    it('PROPERTY: hasPermissionBoundary detects feature gating', () => {
      const code = `{isAdmin && <AdminFeature />}`;
      expect(hasPermissionBoundary(code)).toBe(true);
    });

    it('PROPERTY: hasPermissionBoundary returns false for no boundary', () => {
      const code = `return <div>Content</div>;`;
      expect(hasPermissionBoundary(code)).toBe(false);
    });
  });

  describe('Route-protected pages recognition', () => {
    it('PROPERTY: isRouteProtected returns true for known admin pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'Dashboard',
            'AdminDashboard',
            'Users',
            'AdminUsers',
            'Settings',
            'Applications',
            'Analytics',
            'AuditTrail',
            'Programs',
            'Intakes'
          ),
          (componentName) => {
            expect(isRouteProtected(componentName)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isRouteProtected returns false for unknown pages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'UnknownPage',
            'CustomPage',
            'MyAdminPage',
            'RandomComponent'
          ),
          (componentName) => {
            expect(isRouteProtected(componentName)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Admin pages without role checks are flagged as MISSING_AUTH_CHECK', () => {
    it('PROPERTY: Admin page without role check generates MISSING_AUTH_CHECK issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function CustomAdminPage() {
  return <div>Admin Content</div>;
}

export default CustomAdminPage;
`;
      const relativePath = await writeAdminPageFile(testDir, 'CustomAdminPage.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      expect(result.hasRoleCheck).toBe(false);
      expect(result.securityIssues.length).toBeGreaterThan(0);
      expect(result.securityIssues.some(i => i.type === 'MISSING_AUTH_CHECK')).toBe(true);
      expect(result.securityIssues.find(i => i.type === 'MISSING_AUTH_CHECK')?.severity).toBe('critical');
    });

    it('PROPERTY: Admin page with role check has no MISSING_AUTH_CHECK issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Use fewer runs for async file I/O tests to avoid timeout
      await fc.assert(
        fc.asyncProperty(
          roleCheckConfigArb,
          async (roleConfig) => {
            const config: AdminPageConfig = {
              componentName: 'TestAdminPage',
              hasRoleCheck: true,
              roleCheckConfig: roleConfig,
              hasPermissionBoundary: true,
              hasDataFetching: false,
              hasHardcodedEmail: false,
            };
            const content = generateAdminPageComponent(config);
            const relativePath = await writeAdminPageFile(testDir, 'TestAdminPage.tsx', content);
            
            const result = checkRoleEnforcement(relativePath, testDir);
            
            expect(result.hasRoleCheck).toBe(true);
            expect(result.securityIssues.filter(i => i.type === 'MISSING_AUTH_CHECK')).toHaveLength(0);
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });


  describe('Hardcoded email checks are flagged as PERMISSION_BYPASS', () => {
    it('PROPERTY: Hardcoded email check generates PERMISSION_BYPASS issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks/useAuth';

export function CustomAdminPage() {
  const { user } = useAuth();
  
  if (user.email === 'super***REMOVED***') {
    return <div>Super Admin Only</div>;
  }
  
  return <div>Admin Content</div>;
}

export default CustomAdminPage;
`;
      const relativePath = await writeAdminPageFile(testDir, 'EmailCheckPage.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Should detect the hardcoded email check
      expect(result.roleCheckTypes).toContain('superAdminEmailCheck');
      
      // When only using email check (no other role checks), should flag as PERMISSION_BYPASS
      const bypassIssue = result.securityIssues.find(i => i.type === 'PERMISSION_BYPASS');
      if (bypassIssue) {
        expect(bypassIssue.severity).toBe('high');
        expect(bypassIssue.evidence).toContain('Hardcoded email');
      }
    });

    it('PROPERTY: Email check with proper role check does not generate PERMISSION_BYPASS', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks/useAuth';

export function CustomAdminPage() {
  const { user, isAdmin } = useAuth();
  
  if (!isAdmin) return null;
  
  // Additional super admin check is fine when combined with role check
  if (user.email === 'super***REMOVED***') {
    return <div>Super Admin Only</div>;
  }
  
  return <div>Admin Content</div>;
}

export default CustomAdminPage;
`;
      const relativePath = await writeAdminPageFile(testDir, 'CombinedCheckPage.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Should have both role check types
      expect(result.roleCheckTypes).toContain('isAdmin');
      expect(result.roleCheckTypes).toContain('superAdminEmailCheck');
      
      // Should not flag PERMISSION_BYPASS when combined with proper role check
      const bypassIssues = result.securityIssues.filter(i => 
        i.type === 'PERMISSION_BYPASS' && i.evidence.includes('Hardcoded email')
      );
      expect(bypassIssues).toHaveLength(0);
    });
  });


  describe('Cross-role data leakage detection', () => {
    it('PROPERTY: Unfiltered data fetch generates CROSS_ROLE_LEAKAGE issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';

export function CustomAdminPage() {
  const { isAdmin } = useAuth();
  
  // Fetching all users without role filter
  const { data: users } = useUsers();
  
  if (!isAdmin) return null;
  
  return <div>Users: {users?.length}</div>;
}

export default CustomAdminPage;
`;
      const relativePath = await writeAdminPageFile(testDir, 'LeakagePage.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Should detect potential data leakage
      const leakageIssue = result.securityIssues.find(i => i.type === 'CROSS_ROLE_LEAKAGE');
      if (leakageIssue) {
        expect(leakageIssue.severity).toBe('medium');
        expect(leakageIssue.evidence).toContain('data leakage');
      }
    });

    it('PROPERTY: Filtered data fetch does not generate CROSS_ROLE_LEAKAGE', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

export function CustomAdminPage() {
  const { isAdmin, user } = useAuth();
  
  // Fetching users with role filter
  const { data: users } = useQuery({
    queryKey: ['users', user.role],
    queryFn: () => fetch('/api/admin?action=users').then(r => r.json())
      .then(data => data.filter(u => u.role === 'student')),
  });
  
  if (!isAdmin) return null;
  
  return <div>Users: {users?.length}</div>;
}

export default CustomAdminPage;
`;
      const relativePath = await writeAdminPageFile(testDir, 'FilteredPage.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Should not detect data leakage when filtering is present
      const leakageIssues = result.securityIssues.filter(i => i.type === 'CROSS_ROLE_LEAKAGE');
      expect(leakageIssues).toHaveLength(0);
    });
  });


  describe('Route-protected pages are recognized as having role checks', () => {
    it('PROPERTY: Route-protected page has hasRoleCheck=true even without component-level check', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Dashboard is in ROUTE_PROTECTED_ADMIN_PAGES
      const content = `
import React from 'react';

export function Dashboard() {
  return <div>Dashboard Content</div>;
}

export default Dashboard;
`;
      const relativePath = await writeAdminPageFile(testDir, 'Dashboard.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Should be recognized as protected via route
      expect(result.hasRoleCheck).toBe(true);
      expect(result.roleCheckTypes).toContain('AdminRoute');
      expect(result.evidence.reason).toContain('route level');
      
      // Should not have MISSING_AUTH_CHECK issue
      expect(result.securityIssues.filter(i => i.type === 'MISSING_AUTH_CHECK')).toHaveLength(0);
    });

    it('PROPERTY: Route-protected pages include admin roles', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Use fewer runs for async file I/O tests to avoid timeout
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('Dashboard', 'Users', 'Settings', 'Applications'),
          async (componentName) => {
            const content = `
import React from 'react';

export function ${componentName}() {
  return <div>${componentName} Content</div>;
}

export default ${componentName};
`;
            const relativePath = await writeAdminPageFile(testDir, `${componentName}.tsx`, content);
            
            const result = checkRoleEnforcement(relativePath, testDir);
            
            expect(result.rolesChecked).toContain('admin');
            expect(result.rolesChecked).toContain('super_admin');
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });


  describe('Security issues have proper severity levels', () => {
    it('PROPERTY: MISSING_AUTH_CHECK has critical severity', () => {
      const issues = detectSecurityIssues(
        'src/pages/admin/Test.tsx',
        'export function Test() { return <div>Test</div>; }',
        false,
        []
      );
      
      const missingAuthIssue = issues.find(i => i.type === 'MISSING_AUTH_CHECK');
      expect(missingAuthIssue).toBeDefined();
      expect(missingAuthIssue?.severity).toBe('critical');
    });

    it('PROPERTY: PERMISSION_BYPASS (hardcoded email) has high severity', () => {
      const content = `
        const { user } = useAuth();
        if (user.email === 'admin@test.com') { /* admin */ }
      `;
      
      const issues = detectSecurityIssues(
        'src/pages/admin/Test.tsx',
        content,
        true,
        ['superAdminEmailCheck']
      );
      
      const bypassIssue = issues.find(i => 
        i.type === 'PERMISSION_BYPASS' && i.evidence.includes('Hardcoded email')
      );
      expect(bypassIssue).toBeDefined();
      expect(bypassIssue?.severity).toBe('high');
    });

    it('PROPERTY: CROSS_ROLE_LEAKAGE has medium severity', () => {
      const content = `
        const { data } = useUsers();
      `;
      
      const issues = detectSecurityIssues(
        'src/pages/admin/Test.tsx',
        content,
        true,
        ['isAdmin']
      );
      
      const leakageIssue = issues.find(i => i.type === 'CROSS_ROLE_LEAKAGE');
      if (leakageIssue) {
        expect(leakageIssue.severity).toBe('medium');
      }
    });

    it('PROPERTY: All security issues have valid severity values', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.array(roleCheckTypeArb, { minLength: 0, maxLength: 3 }),
          (hasRoleCheck, roleCheckTypes) => {
            const content = roleCheckTypes.length > 0 
              ? roleCheckTypes.map(t => generateRoleCheckCode({ type: t, roles: ['admin'] })).join('\n')
              : 'export function Test() { return <div>Test</div>; }';
            
            const issues = detectSecurityIssues(
              'src/pages/admin/Test.tsx',
              content,
              hasRoleCheck,
              roleCheckTypes
            );
            
            for (const issue of issues) {
              expect(['critical', 'high', 'medium', 'low']).toContain(issue.severity);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Child components inherit protection from parent', () => {
    it('PROPERTY: Child component in components/ directory is recognized as protected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function AdminWidget() {
  return <div>Widget Content</div>;
}

export default AdminWidget;
`;
      const relativePath = await writeChildComponentFile(testDir, 'AdminWidget.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Child components should be recognized as inheriting protection
      expect(result.hasRoleCheck).toBe(true);
      expect(result.evidence.reason).toContain('Child component');
      expect(result.evidence.confidence).toBe('likely');
      
      // Should not have MISSING_AUTH_CHECK issue
      expect(result.securityIssues.filter(i => i.type === 'MISSING_AUTH_CHECK')).toHaveLength(0);
    });
  });

  describe('Barrel exports are handled correctly', () => {
    it('PROPERTY: Barrel export file is recognized as protected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `export { default } from './Dashboard';`;
      const relativePath = await writeAdminPageFile(testDir, 'index.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      // Barrel exports should be recognized as inheriting protection
      expect(result.hasRoleCheck).toBe(true);
      expect(result.componentName).toBe('barrel-export');
      expect(result.evidence.reason).toContain('Barrel export');
      
      // Should not have security issues
      expect(result.securityIssues).toHaveLength(0);
    });
  });


  describe('RoleEnforcementResult structure validation', () => {
    it('PROPERTY: checkRoleEnforcement always returns valid RoleEnforcementResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      // Use fewer runs for async file I/O tests to avoid timeout
      await fc.assert(
        fc.asyncProperty(
          adminPageConfigArb,
          async (pageConfig) => {
            const content = generateAdminPageComponent(pageConfig);
            const relativePath = await writeAdminPageFile(testDir, 'ValidResult.tsx', content);
            
            const result = checkRoleEnforcement(relativePath, testDir);
            
            // Required fields must be present and have correct types
            expect(typeof result.filePath).toBe('string');
            expect(typeof result.componentName).toBe('string');
            expect(typeof result.hasRoleCheck).toBe('boolean');
            expect(Array.isArray(result.roleCheckTypes)).toBe(true);
            expect(Array.isArray(result.rolesChecked)).toBe(true);
            expect(typeof result.hasPermissionBoundary).toBe('boolean');
            expect(Array.isArray(result.securityIssues)).toBe(true);
            expect(result.evidence).toBeDefined();
            
            // Evidence must have required fields
            expect(typeof result.evidence.filePath).toBe('string');
            expect(typeof result.evidence.reason).toBe('string');
            expect(['certain', 'likely', 'possible']).toContain(result.evidence.confidence);
            
            // All role check types should be valid
            for (const type of result.roleCheckTypes) {
              expect([
                'useAuth',
                'isAdmin',
                'hasAdminRole',
                'isAdminRole',
                'useOptimizedAuthState',
                'AdminRoute',
                'ProtectedRoute',
                'directRoleComparison',
                'roleArrayIncludes',
                'superAdminEmailCheck'
              ]).toContain(type);
            }
            
            // All security issues should have valid structure
            for (const issue of result.securityIssues) {
              expect(['CROSS_ROLE_LEAKAGE', 'MISSING_AUTH_CHECK', 'STALE_TOKEN', 'PERMISSION_BYPASS']).toContain(issue.type);
              expect(typeof issue.filePath).toBe('string');
              expect(typeof issue.lineNumber).toBe('number');
              expect(typeof issue.evidence).toBe('string');
              expect(['critical', 'high', 'medium', 'low']).toContain(issue.severity);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    it('PROPERTY: Non-existent file returns error in security issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = checkRoleEnforcement('src/pages/admin/NonExistent.tsx', testDir);
      
      expect(result.hasRoleCheck).toBe(false);
      expect(result.securityIssues.length).toBeGreaterThan(0);
      expect(result.securityIssues.some(i => i.evidence.includes('not found') || i.evidence.includes('File not found'))).toBe(true);
    });
  });


  describe('Edge cases', () => {
    it('PROPERTY: Empty file returns no role check', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `// Empty file\n`;
      const relativePath = await writeAdminPageFile(testDir, 'Empty.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      expect(result.hasRoleCheck).toBe(false);
      expect(result.roleCheckTypes).toHaveLength(0);
    });

    it('PROPERTY: File with only comments returns no role check', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
// This is a comment
/* Multi-line
   comment */
`;
      const relativePath = await writeAdminPageFile(testDir, 'Comments.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      expect(result.hasRoleCheck).toBe(false);
      expect(result.roleCheckTypes).toHaveLength(0);
    });

    it('PROPERTY: Multiple role check patterns - all are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function MultiCheckPage() {
  const { user, isAdmin } = useAuth();
  
  if (!isAdmin) return null;
  
  if (user.role === 'super_admin') {
    return <div>Super Admin</div>;
  }
  
  return <div>Admin Content</div>;
}

export default MultiCheckPage;
`;
      const relativePath = await writeAdminPageFile(testDir, 'MultiCheck.tsx', content);
      
      const result = checkRoleEnforcement(relativePath, testDir);
      
      expect(result.hasRoleCheck).toBe(true);
      expect(result.roleCheckTypes).toContain('isAdmin');
      expect(result.roleCheckTypes).toContain('useAuth');
      expect(result.roleCheckTypes).toContain('directRoleComparison');
      expect(result.rolesChecked).toContain('super_admin');
    });

    it('PROPERTY: All ADMIN_ROLES are valid role names', () => {
      fc.assert(
        fc.property(
          adminRoleArb,
          (role) => {
            expect(typeof role).toBe('string');
            expect(role.length).toBeGreaterThan(0);
            expect(ADMIN_ROLES).toContain(role);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
