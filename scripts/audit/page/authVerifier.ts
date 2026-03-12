/**
 * Auth Check Verifier for MIHAS Frontend-Backend Forensic Audit
 * 
 * Parses page files to find auth-related patterns and verifies that
 * admin pages have appropriate role checks.
 * 
 * @requirements 2.2 - WHEN the Audit_System examines a page THEN it SHALL verify
 *                     auth checks are present and correct
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuthCheckResult, PageAuthMechanism } from '../types';

/**
 * Patterns for detecting auth mechanisms in page files.
 */
const AUTH_PATTERNS = {
  /** useAuth() hook usage - destructures auth state from context */
  useAuth: /(?:const|let)\s*\{[^}]*\}\s*=\s*useAuth\s*\(\s*\)/,
  
  /** useOptimizedAuthState() hook - optimized auth state with isAdmin */
  useOptimizedAuthState: /(?:const|let)\s*\{[^}]*\}\s*=\s*useOptimizedAuthState\s*\(\s*\)/,
  
  /** useAuthCheck() hook - lightweight auth check */
  useAuthCheck: /(?:const|let)\s*\{[^}]*\}\s*=\s*useAuthCheck\s*\(\s*\)/,
  
  /** useAuth() hook - role-based access control via AuthContext */
  useAuthContext: /(?:const|let)\s*\{[^}]*\}\s*=\s*useAuth\s*\(\s*\)/,
  
  /** requireAuth wrapper/HOC pattern */
  requireAuth: /requireAuth\s*\(|withAuth\s*\(/,
  
  /** ProtectedRoute component wrapper */
  protectedRoute: /<ProtectedRoute[^>]*>|ProtectedRoute\s*\(/,
  
  /** AdminRoute component wrapper */
  adminRoute: /<AdminRoute[^>]*>|AdminRoute\s*\(/,
  
  /** StudentRoute component wrapper */
  studentRoute: /<StudentRoute[^>]*>|StudentRoute\s*\(/,
};

/**
 * Patterns for detecting role checks in page files.
 * Note: Patterns that need to extract matches use functions instead of global regexes
 * to avoid state issues with the global flag.
 */
const ROLE_CHECK_PATTERNS = {
  /** Direct role comparison: user.role === 'admin' - non-global for .test() */
  directRoleCheck: /(?:user|profile)\.role\s*===?\s*['"`](\w+)['"`]/,
  
  /** Direct role comparison: user.role === 'admin' - global for .matchAll() */
  directRoleCheckGlobal: /(?:user|profile)\.role\s*===?\s*['"`](\w+)['"`]/g,
  
  /** isAdmin check from useAuth or useOptimizedAuthState */
  isAdminCheck: /\bisAdmin\b/,
  
  /** hasAdminRole check from useAuth */
  hasAdminRoleCheck: /\bhasAdminRole\b/,
  
  /** isAdminRole() function call */
  isAdminRoleFunction: /isAdminRole\s*\(/,
  
  /** Role array includes check */
  roleArrayCheck: /\['[^']+'\]\.includes\s*\(\s*(?:user|profile)\.role\s*\)/,
  
  /** Role-based conditional rendering - non-global for .test() */
  roleConditional: /(?:user|profile)\.role\s*(?:===?|!==?)\s*['"`](\w+)['"`]/,
  
  /** Role-based conditional rendering - global for .matchAll() */
  roleConditionalGlobal: /(?:user|profile)\.role\s*(?:===?|!==?)\s*['"`](\w+)['"`]/g,
  
  /** Super admin email check (hardcoded) */
  superAdminEmailCheck: /user\.email\s*===?\s*['"`][^'"`]+['"`]/,
  
  /** requireRole wrapper */
  requireRoleWrapper: /requireRole\s*\(\s*\[([^\]]+)\]/,
};

/**
 * Known admin roles in the MIHAS system.
 */
const ADMIN_ROLES = ['admin', 'super_admin', 'admissions_officer', 'registrar', 'finance_officer', 'academic_head', 'reviewer'];

/**
 * Checks if a file path represents an admin page.
 * 
 * @param filePath - Path to check
 * @returns True if the path is within src/pages/admin/
 */
export function isAdminPage(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.includes('src/pages/admin/') || normalizedPath.includes('pages/admin/');
}

/**
 * Checks if a file path represents a student page.
 * 
 * @param filePath - Path to check
 * @returns True if the path is within src/pages/student/
 */
export function isStudentPage(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.includes('src/pages/student/') || normalizedPath.includes('pages/student/');
}

/**
 * Checks if a file path represents an auth page (login, signup, etc.).
 * Auth pages typically don't need auth checks.
 * 
 * @param filePath - Path to check
 * @returns True if the path is within src/pages/auth/
 */
export function isAuthPage(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.includes('src/pages/auth/') || normalizedPath.includes('pages/auth/');
}

/**
 * Checks if a file path represents a public page (landing, not found, etc.).
 * 
 * @param filePath - Path to check
 * @returns True if the path is a known public page
 */
export function isPublicPage(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const publicPages = [
    'landingpage',
    'notfoundpage',
    'errorpage',
    '404',
    'home',
    'index',
  ];
  
  const fileName = path.basename(normalizedPath, '.tsx').toLowerCase();
  return publicPages.some(p => fileName.includes(p));
}

/**
 * Detects the auth mechanism used in a page file.
 * 
 * @param content - File content to analyze
 * @returns The detected auth mechanism
 */
function detectAuthMechanism(content: string): PageAuthMechanism {
  // Check for route-level protection first (highest priority)
  if (AUTH_PATTERNS.adminRoute.test(content)) {
    return 'ProtectedRoute'; // AdminRoute implies ProtectedRoute
  }
  
  if (AUTH_PATTERNS.studentRoute.test(content)) {
    return 'ProtectedRoute'; // StudentRoute implies ProtectedRoute
  }
  
  if (AUTH_PATTERNS.protectedRoute.test(content)) {
    return 'ProtectedRoute';
  }
  
  // Check for requireAuth wrapper
  if (AUTH_PATTERNS.requireAuth.test(content)) {
    return 'requireAuth';
  }
  
  // Check for auth hooks
  if (AUTH_PATTERNS.useAuth.test(content) ||
      AUTH_PATTERNS.useOptimizedAuthState.test(content) ||
      AUTH_PATTERNS.useAuthCheck.test(content) ||
      AUTH_PATTERNS.useAuthContext.test(content)) {
    return 'useAuth';
  }
  
  return 'none';
}

/**
 * Extracts roles that are checked in the page content.
 * 
 * @param content - File content to analyze
 * @returns Array of role names found in checks
 */
function extractCheckedRoles(content: string): string[] {
  const roles: Set<string> = new Set();
  
  // Extract roles from direct comparisons (use global version for matchAll)
  const directMatches = content.matchAll(ROLE_CHECK_PATTERNS.directRoleCheckGlobal);
  for (const match of directMatches) {
    if (match[1]) {
      roles.add(match[1]);
    }
  }
  
  // Extract roles from conditional checks (use global version for matchAll)
  const conditionalMatches = content.matchAll(ROLE_CHECK_PATTERNS.roleConditionalGlobal);
  for (const match of conditionalMatches) {
    if (match[1]) {
      roles.add(match[1]);
    }
  }
  
  // Extract roles from requireRole wrapper
  const requireRoleMatch = content.match(ROLE_CHECK_PATTERNS.requireRoleWrapper);
  if (requireRoleMatch && requireRoleMatch[1]) {
    const roleList = requireRoleMatch[1];
    const roleMatches = roleList.matchAll(/['"`](\w+)['"`]/g);
    for (const match of roleMatches) {
      if (match[1]) {
        roles.add(match[1]);
      }
    }
  }
  
  // If isAdmin or hasAdminRole is used, add admin roles
  if (ROLE_CHECK_PATTERNS.isAdminCheck.test(content) ||
      ROLE_CHECK_PATTERNS.hasAdminRoleCheck.test(content) ||
      ROLE_CHECK_PATTERNS.isAdminRoleFunction.test(content)) {
    roles.add('admin');
    roles.add('super_admin');
  }
  
  return Array.from(roles);
}

/**
 * Checks if the page has role-based access control.
 * 
 * @param content - File content to analyze
 * @returns True if role checks are present
 */
function hasRoleCheck(content: string): boolean {
  return (
    ROLE_CHECK_PATTERNS.isAdminCheck.test(content) ||
    ROLE_CHECK_PATTERNS.hasAdminRoleCheck.test(content) ||
    ROLE_CHECK_PATTERNS.isAdminRoleFunction.test(content) ||
    ROLE_CHECK_PATTERNS.directRoleCheck.test(content) ||
    ROLE_CHECK_PATTERNS.roleArrayCheck.test(content) ||
    ROLE_CHECK_PATTERNS.requireRoleWrapper.test(content) ||
    ROLE_CHECK_PATTERNS.superAdminEmailCheck.test(content)
  );
}

/**
 * Identifies issues with auth implementation on a page.
 * 
 * @param filePath - Path to the page file
 * @param content - File content
 * @param authMechanism - Detected auth mechanism
 * @param hasRoleCheckResult - Whether role check is present
 * @returns Array of issue descriptions
 */
function identifyAuthIssues(
  filePath: string,
  content: string,
  authMechanism: PageAuthMechanism,
  hasRoleCheckResult: boolean
): string[] {
  const issues: string[] = [];
  const isAdmin = isAdminPage(filePath);
  const isStudent = isStudentPage(filePath);
  const isAuth = isAuthPage(filePath);
  const isPublic = isPublicPage(filePath);
  
  // Skip auth pages and public pages - they don't need auth checks
  if (isAuth || isPublic) {
    return issues;
  }
  
  // Admin pages should have auth checks
  if (isAdmin && authMechanism === 'none') {
    issues.push('Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute');
  }
  
  // Admin pages should have role checks
  if (isAdmin && !hasRoleCheckResult) {
    issues.push('Admin page missing role check - should verify admin/super_admin role');
  }
  
  // Student pages should have auth checks
  if (isStudent && authMechanism === 'none') {
    issues.push('Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute');
  }
  
  // Check for hardcoded email checks (potential security issue)
  if (ROLE_CHECK_PATTERNS.superAdminEmailCheck.test(content)) {
    // This is a known pattern in the codebase for super admin override
    // Flag it as informational, not an error
    const emailMatch = content.match(/user\.email\s*===?\s*['"`]([^'"`]+)['"`]/);
    if (emailMatch && emailMatch[1]) {
      issues.push(`Hardcoded super admin email check found: ${emailMatch[1]} - consider using role-based check`);
    }
  }
  
  // Check for useAuth without actually using the auth state
  if (AUTH_PATTERNS.useAuth.test(content)) {
    // Extract what's destructured from useAuth
    const useAuthMatch = content.match(/(?:const|let)\s*\{([^}]*)\}\s*=\s*useAuth\s*\(\s*\)/);
    if (useAuthMatch && useAuthMatch[1]) {
      const destructured = useAuthMatch[1].split(',').map(s => s.trim());
      // Check if user is destructured but never used for auth check
      if (destructured.includes('user') && !content.includes('!user') && !content.includes('user &&')) {
        // This might be okay if the page is wrapped in ProtectedRoute
        // Only flag if there's no redirect logic
        if (!content.includes('Navigate') && !content.includes('navigate(')) {
          // Check if there's any conditional rendering based on user
          if (!content.includes('user ?') && !content.includes('user &&')) {
            // This is likely fine - user might be used for display purposes
          }
        }
      }
    }
  }
  
  return issues;
}

/**
 * Verifies auth checks in a single page file.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns AuthCheckResult with verification details
 */
export function verifyAuthCheck(
  filePath: string,
  projectRoot: string = process.cwd()
): AuthCheckResult {
  const fullPath = path.join(projectRoot, filePath);
  
  // Default result for files that can't be read
  const defaultResult: AuthCheckResult = {
    hasAuthCheck: false,
    authMechanism: 'none',
    hasRoleCheck: false,
    roles: [],
    issues: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect auth mechanism
    const authMechanism = detectAuthMechanism(content);
    const hasAuthCheck = authMechanism !== 'none';
    
    // Check for role-based access control
    const hasRoleCheckResult = hasRoleCheck(content);
    
    // Extract checked roles
    const roles = extractCheckedRoles(content);
    
    // Identify issues
    const issues = identifyAuthIssues(filePath, content, authMechanism, hasRoleCheckResult);
    
    return {
      hasAuthCheck,
      authMechanism,
      hasRoleCheck: hasRoleCheckResult,
      roles,
      issues,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}

/**
 * Verifies auth checks for multiple page files.
 * 
 * @param filePaths - Array of file paths to verify
 * @param projectRoot - Project root directory
 * @returns Map of file paths to AuthCheckResult
 */
export function verifyAuthChecks(
  filePaths: string[],
  projectRoot: string = process.cwd()
): Map<string, AuthCheckResult> {
  const results = new Map<string, AuthCheckResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, verifyAuthCheck(filePath, projectRoot));
  }
  
  return results;
}

/**
 * Gets a summary of auth verification for a file.
 * 
 * @param filePath - Path to the file
 * @param result - AuthCheckResult to summarize
 * @returns Human-readable summary string
 */
export function getAuthVerificationSummary(filePath: string, result: AuthCheckResult): string {
  const lines: string[] = [];
  
  lines.push(`File: ${filePath}`);
  lines.push(`  Auth Check: ${result.hasAuthCheck ? '✓ Present' : '✗ Missing'}`);
  lines.push(`  Mechanism: ${result.authMechanism}`);
  lines.push(`  Role Check: ${result.hasRoleCheck ? '✓ Present' : '✗ Missing'}`);
  
  if (result.roles.length > 0) {
    lines.push(`  Roles: ${result.roles.join(', ')}`);
  }
  
  if (result.issues.length > 0) {
    lines.push(`  Issues:`);
    for (const issue of result.issues) {
      lines.push(`    - ${issue}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Generates a report of auth verification for all admin pages.
 * 
 * @param results - Map of file paths to AuthCheckResult
 * @returns Formatted report string
 */
export function generateAdminAuthReport(results: Map<string, AuthCheckResult>): string {
  const lines: string[] = [];
  const adminPages: [string, AuthCheckResult][] = [];
  const pagesWithIssues: [string, AuthCheckResult][] = [];
  
  // Filter admin pages and pages with issues
  for (const [filePath, result] of results) {
    if (isAdminPage(filePath)) {
      adminPages.push([filePath, result]);
    }
    if (result.issues.length > 0) {
      pagesWithIssues.push([filePath, result]);
    }
  }
  
  lines.push('='.repeat(60));
  lines.push('Admin Page Auth Verification Report');
  lines.push('='.repeat(60));
  lines.push('');
  
  lines.push(`Total Admin Pages: ${adminPages.length}`);
  lines.push(`Pages with Auth Check: ${adminPages.filter(([, r]) => r.hasAuthCheck).length}`);
  lines.push(`Pages with Role Check: ${adminPages.filter(([, r]) => r.hasRoleCheck).length}`);
  lines.push(`Pages with Issues: ${pagesWithIssues.length}`);
  lines.push('');
  
  if (adminPages.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('Admin Pages:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of adminPages) {
      lines.push('');
      lines.push(getAuthVerificationSummary(filePath, result));
    }
  }
  
  if (pagesWithIssues.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('Pages with Issues:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithIssues) {
      if (!isAdminPage(filePath)) {
        lines.push('');
        lines.push(getAuthVerificationSummary(filePath, result));
      }
    }
  }
  
  return lines.join('\n');
}

// CLI execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2] || 'src/pages/admin/Dashboard.tsx';
  
  console.log('Auth Check Verifier');
  console.log('===================');
  console.log(`Analyzing: ${testFile}`);
  console.log('');
  
  const result = verifyAuthCheck(testFile);
  console.log(getAuthVerificationSummary(testFile, result));
}
