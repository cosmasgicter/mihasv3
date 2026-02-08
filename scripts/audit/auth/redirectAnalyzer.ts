/**
 * Redirect Analyzer for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans the codebase to identify all redirect patterns and verify that
 * redirect targets are appropriate for the user's authentication and role state.
 * 
 * @requirements 4.5 - WHEN the Audit_System examines auth THEN it SHALL verify
 *                     redirect logic is correct
 * 
 * Validates: Property 14 - Redirect Correctness
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Evidence, SecurityIssue } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of redirect mechanisms detected in the codebase.
 */
export type RedirectType =
  | 'Navigate'           // React Router <Navigate to="..." />
  | 'useNavigate'        // React Router navigate() function
  | 'windowLocation'     // window.location.href = "..."
  | 'windowReplace';     // window.location.replace("...")

/**
 * User state context for a redirect.
 */
export type UserStateContext =
  | 'unauthenticated'    // User is not logged in
  | 'authenticated'      // User is logged in (any role)
  | 'student'            // User is a student
  | 'admin'              // User is an admin
  | 'unknown';           // Cannot determine user state

/**
 * Expected redirect target based on user state.
 */
export interface ExpectedRedirect {
  userState: UserStateContext;
  expectedTargets: string[];
  description: string;
}

/**
 * A redirect instance found in the codebase.
 */
export interface RedirectInstance {
  /** Path to the file containing the redirect */
  filePath: string;
  /** Line number where the redirect is found */
  lineNumber: number;
  /** Type of redirect mechanism */
  type: RedirectType;
  /** Target path of the redirect */
  target: string;
  /** Inferred user state context */
  userStateContext: UserStateContext;
  /** Condition that triggers the redirect (if detectable) */
  condition?: string;
  /** Whether this redirect is appropriate for the user state */
  isAppropriate: boolean;
  /** Issues found with this redirect */
  issues: string[];
  /** Evidence of the finding */
  evidence: Evidence;
}


/**
 * A potential redirect loop detected.
 */
export interface RedirectLoop {
  /** Starting point of the loop */
  startPath: string;
  /** Sequence of redirects forming the loop */
  sequence: string[];
  /** Files involved in the loop */
  filesInvolved: string[];
  /** Severity of the loop */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Evidence of the finding */
  evidence: Evidence;
}

/**
 * Result of redirect analysis.
 */
export interface RedirectAnalysisResult {
  /** All redirect instances found */
  redirects: RedirectInstance[];
  /** Inappropriate redirects (wrong target for user state) */
  inappropriateRedirects: RedirectInstance[];
  /** Potential redirect loops detected */
  redirectLoops: RedirectLoop[];
  /** Security issues related to redirects */
  securityIssues: SecurityIssue[];
  /** Summary statistics */
  summary: {
    totalRedirects: number;
    navigateComponents: number;
    useNavigateCalls: number;
    windowLocationRedirects: number;
    inappropriateCount: number;
    loopCount: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Expected redirect targets based on user state.
 */
export const EXPECTED_REDIRECTS: ExpectedRedirect[] = [
  {
    userState: 'unauthenticated',
    expectedTargets: [
      '/auth/signin', '/auth/signup', '/login', '/signin', '/', '/auth/forgot-password',
      // Auth callback can redirect to dashboard after successful auth
      '/dashboard', '/student/dashboard',
      // Error redirects with query params
      '/auth/signin?error',
    ],
    description: 'Unauthenticated users should be redirected to login or public pages',
  },
  {
    userState: 'student',
    expectedTargets: [
      '/student/dashboard', '/apply', '/student/status', '/student/settings', 
      '/student/payment', '/student/interview', '/student/application-wizard',
      '/student/profile', '/student/notifications', '/settings', '/dashboard',
      '/student/application', // Dynamic application detail pages
      // Auth redirect with return URL
      '/auth/signin',
    ],
    description: 'Students should be redirected to student pages',
  },
  {
    userState: 'admin',
    expectedTargets: [
      '/admin', '/admin/dashboard', '/admin/applications', '/admin/users',
      '/admin/programs', '/admin/intakes', '/admin/settings', '/admin/analytics',
      '/admin/audit', '/admin/workflow', '/admin/roles', '/admin/system-health',
      '/admin/profile', '/dashboard',
      // Session expiry redirects to signin
      '/auth/signin',
    ],
    description: 'Admins should be redirected to admin pages',
  },
  {
    userState: 'authenticated',
    expectedTargets: ['/dashboard', '/', '/auth/signin'],
    description: 'Authenticated users (role unknown) should go to dashboard for role-based redirect',
  },
];


/**
 * Patterns for detecting redirect mechanisms.
 */
const REDIRECT_PATTERNS = {
  /** React Router Navigate component: <Navigate to="/path" /> */
  navigateComponent: /<Navigate\s+to\s*=\s*[{]?\s*['"`]([^'"`]+)['"`]\s*[}]?/g,
  
  /** React Router Navigate with dynamic path: <Navigate to={redirectPath} /> */
  navigateDynamic: /<Navigate\s+to\s*=\s*\{([^}]+)\}/g,
  
  /** useNavigate hook call: navigate('/path') or navigate("/path") */
  useNavigateCall: /navigate\s*\(\s*['"`]([^'"`]+)['"`]/g,
  
  /** useNavigate with dynamic path: navigate(redirectPath) */
  useNavigateDynamic: /navigate\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[,)]/g,
  
  /** window.location.href assignment */
  windowLocationHref: /window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/g,
  
  /** window.location.replace call */
  windowLocationReplace: /window\.location\.replace\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
};

/**
 * Patterns for detecting user state context around redirects.
 */
const USER_STATE_PATTERNS = {
  /** Check for unauthenticated user: !user, !isAuthenticated */
  unauthenticated: /if\s*\(\s*!(?:user|isAuthenticated|session)\s*\)/,
  
  /** Check for authenticated user: user, isAuthenticated */
  authenticated: /if\s*\(\s*(?:user|isAuthenticated|session)\s*[^!]/,
  
  /** Check for admin role: isAdmin, hasAdminRole */
  admin: /if\s*\(\s*(?:isAdmin|hasAdminRole|isAdminRole)/,
  
  /** Check for non-admin (student): !isAdmin */
  student: /if\s*\(\s*!(?:isAdmin|hasAdminRole)\s*\)/,
  
  /** Super admin email check */
  superAdmin: /user\.email\s*===?\s*['"`][^'"`]+['"`]/,
};

/**
 * Directories to scan for redirect patterns.
 */
const SCAN_DIRECTORIES = [
  'src/pages',
  'src/components/auth',
  'src/components',
  'src/routes',
];

/**
 * File extensions to scan.
 */
const FILE_EXTENSIONS = ['.tsx', '.ts'];


// =============================================================================
// Core Functions
// =============================================================================

/**
 * Finds the line number of a match in content.
 * 
 * @param content - Full file content
 * @param matchIndex - Index of the match in content
 * @returns Line number (1-indexed)
 */
function getLineNumber(content: string, matchIndex: number): number {
  return content.substring(0, matchIndex).split('\n').length;
}

/**
 * Gets surrounding lines for context.
 * 
 * @param content - Full file content
 * @param lineNumber - Center line number (1-indexed)
 * @param range - Number of lines before and after
 * @returns Combined surrounding lines
 */
function getSurroundingLines(content: string, lineNumber: number, range: number): string {
  const lines = content.split('\n');
  const start = Math.max(0, lineNumber - range - 1);
  const end = Math.min(lines.length, lineNumber + range);
  return lines.slice(start, end).join('\n');
}

/**
 * Infers the user state context from surrounding code.
 * 
 * @param surroundingCode - Code around the redirect
 * @param filePath - Path to the file
 * @returns Inferred user state context
 */
export function inferUserStateContext(surroundingCode: string, filePath: string): UserStateContext {
  // Check file path for hints
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  
  // Admin route guards
  if (normalizedPath.includes('adminroute') || normalizedPath.includes('admin/')) {
    if (USER_STATE_PATTERNS.unauthenticated.test(surroundingCode)) {
      return 'unauthenticated';
    }
    if (USER_STATE_PATTERNS.student.test(surroundingCode)) {
      return 'student'; // Non-admin being redirected away from admin
    }
    return 'admin';
  }
  
  // Student route guards
  if (normalizedPath.includes('studentroute') || normalizedPath.includes('student/')) {
    if (USER_STATE_PATTERNS.unauthenticated.test(surroundingCode)) {
      return 'unauthenticated';
    }
    if (USER_STATE_PATTERNS.admin.test(surroundingCode)) {
      return 'admin'; // Admin being redirected away from student
    }
    return 'student';
  }
  
  // Protected route guards
  if (normalizedPath.includes('protectedroute')) {
    if (USER_STATE_PATTERNS.unauthenticated.test(surroundingCode)) {
      return 'unauthenticated';
    }
    return 'authenticated';
  }
  
  // Dashboard redirect component
  if (normalizedPath.includes('dashboardredirect')) {
    if (USER_STATE_PATTERNS.unauthenticated.test(surroundingCode)) {
      return 'unauthenticated';
    }
    if (USER_STATE_PATTERNS.admin.test(surroundingCode) || 
        USER_STATE_PATTERNS.superAdmin.test(surroundingCode)) {
      return 'admin';
    }
    return 'student'; // Default to student for dashboard redirect
  }
  
  // Auth pages (signin, signup, callback)
  if (normalizedPath.includes('/auth/')) {
    if (surroundingCode.includes('error') || surroundingCode.includes('Error')) {
      return 'unauthenticated'; // Error redirects go to signin
    }
    if (surroundingCode.includes('success') || surroundingCode.includes('session')) {
      return 'authenticated'; // Success redirects go to dashboard
    }
    return 'unknown';
  }
  
  // Check patterns in surrounding code
  if (USER_STATE_PATTERNS.unauthenticated.test(surroundingCode)) {
    return 'unauthenticated';
  }
  if (USER_STATE_PATTERNS.admin.test(surroundingCode)) {
    return 'admin';
  }
  if (USER_STATE_PATTERNS.student.test(surroundingCode)) {
    return 'student';
  }
  if (USER_STATE_PATTERNS.authenticated.test(surroundingCode)) {
    return 'authenticated';
  }
  
  return 'unknown';
}


/**
 * Checks if a redirect target is appropriate for the user state.
 * 
 * @param target - Redirect target path
 * @param userState - User state context
 * @returns Object with isAppropriate flag and issues array
 */
export function checkRedirectAppropriateness(
  target: string,
  userState: UserStateContext
): { isAppropriate: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Unknown user state - can't validate
  if (userState === 'unknown') {
    return { isAppropriate: true, issues: [] };
  }
  
  // Find expected redirects for this user state
  const expectedRedirect = EXPECTED_REDIRECTS.find(e => e.userState === userState);
  if (!expectedRedirect) {
    return { isAppropriate: true, issues: [] };
  }
  
  // Normalize target path - remove query params and trailing slashes for comparison
  const normalizedTarget = target.toLowerCase().replace(/\/$/, '').split('?')[0];
  
  // Handle dynamic paths with template literals (e.g., /student/application/${id})
  const isDynamicPath = target.includes('${') || target.includes('$');
  
  // Check if target is in expected list
  const isExpected = expectedRedirect.expectedTargets.some(expected => {
    const normalizedExpected = expected.toLowerCase();
    
    // Exact match
    if (normalizedTarget === normalizedExpected) return true;
    
    // Prefix match (e.g., /admin/applications matches /admin/applications?status=submitted)
    if (normalizedTarget.startsWith(normalizedExpected + '/')) return true;
    if (normalizedTarget.startsWith(normalizedExpected + '?')) return true;
    
    // Handle query param patterns (e.g., /auth/signin?error matches /auth/signin)
    if (expected.includes('?') && normalizedTarget.startsWith(normalizedExpected.split('?')[0])) return true;
    
    // Handle dynamic paths
    if (isDynamicPath && normalizedTarget.replace(/\$\{[^}]+\}/g, '').startsWith(normalizedExpected)) return true;
    
    return false;
  });
  
  if (!isExpected) {
    // Check for specific inappropriate redirects (security issues)
    if (userState === 'unauthenticated' && normalizedTarget.startsWith('/admin') && !normalizedTarget.includes('signin')) {
      issues.push(`Unauthenticated user redirected to admin page: ${target}`);
    } else if (userState === 'unauthenticated' && normalizedTarget.startsWith('/student') && !target.includes('dashboard')) {
      // Allow dashboard redirect after successful auth
      issues.push(`Unauthenticated user redirected to student page: ${target}`);
    } else if (userState === 'student' && normalizedTarget.startsWith('/admin')) {
      issues.push(`Student redirected to admin page: ${target}`);
    } else if (userState === 'admin' && normalizedTarget.startsWith('/student') && !normalizedTarget.includes('dashboard')) {
      issues.push(`Admin redirected to student page: ${target}`);
    }
    // Don't flag other unexpected redirects as issues - they may be valid edge cases
  }
  
  return {
    isAppropriate: issues.length === 0,
    issues,
  };
}

/**
 * Extracts the condition that triggers a redirect.
 * 
 * @param surroundingCode - Code around the redirect
 * @returns Condition string or undefined
 */
function extractCondition(surroundingCode: string): string | undefined {
  // Look for if statements
  const ifMatch = surroundingCode.match(/if\s*\(([^)]+)\)\s*\{?\s*(?:return\s*)?(?:<Navigate|navigate)/);
  if (ifMatch) {
    return ifMatch[1].trim();
  }
  
  // Look for ternary conditions
  const ternaryMatch = surroundingCode.match(/([^?]+)\s*\?\s*(?:<Navigate|navigate)/);
  if (ternaryMatch) {
    return ternaryMatch[1].trim();
  }
  
  return undefined;
}


/**
 * Scans a file for redirect patterns.
 * 
 * @param filePath - Path to the file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns Array of RedirectInstance objects
 */
export function scanFileForRedirects(
  filePath: string,
  projectRoot: string = process.cwd()
): RedirectInstance[] {
  const fullPath = path.join(projectRoot, filePath);
  const redirects: RedirectInstance[] = [];
  
  try {
    if (!fs.existsSync(fullPath)) {
      return redirects;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Scan for Navigate components
    const navigatePattern = new RegExp(REDIRECT_PATTERNS.navigateComponent.source, 'g');
    let match;
    
    while ((match = navigatePattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      const userStateContext = inferUserStateContext(surroundingCode, filePath);
      const { isAppropriate, issues } = checkRedirectAppropriateness(match[1], userStateContext);
      const condition = extractCondition(surroundingCode);
      
      redirects.push({
        filePath,
        lineNumber,
        type: 'Navigate',
        target: match[1],
        userStateContext,
        condition,
        isAppropriate,
        issues,
        evidence: {
          filePath,
          lineNumbers: [lineNumber],
          codeSnippet: surroundingCode,
          reason: `Navigate component redirecting to ${match[1]}`,
          confidence: userStateContext === 'unknown' ? 'possible' : 'certain',
        },
      });
    }
    
    // Scan for useNavigate calls
    const useNavigatePattern = new RegExp(REDIRECT_PATTERNS.useNavigateCall.source, 'g');
    
    while ((match = useNavigatePattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      const userStateContext = inferUserStateContext(surroundingCode, filePath);
      const { isAppropriate, issues } = checkRedirectAppropriateness(match[1], userStateContext);
      const condition = extractCondition(surroundingCode);
      
      redirects.push({
        filePath,
        lineNumber,
        type: 'useNavigate',
        target: match[1],
        userStateContext,
        condition,
        isAppropriate,
        issues,
        evidence: {
          filePath,
          lineNumbers: [lineNumber],
          codeSnippet: surroundingCode,
          reason: `useNavigate call redirecting to ${match[1]}`,
          confidence: userStateContext === 'unknown' ? 'possible' : 'certain',
        },
      });
    }
    
    // Scan for window.location.href
    const windowHrefPattern = new RegExp(REDIRECT_PATTERNS.windowLocationHref.source, 'g');
    
    while ((match = windowHrefPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      const userStateContext = inferUserStateContext(surroundingCode, filePath);
      const { isAppropriate, issues } = checkRedirectAppropriateness(match[1], userStateContext);
      
      redirects.push({
        filePath,
        lineNumber,
        type: 'windowLocation',
        target: match[1],
        userStateContext,
        isAppropriate,
        issues,
        evidence: {
          filePath,
          lineNumbers: [lineNumber],
          codeSnippet: surroundingCode,
          reason: `window.location.href redirect to ${match[1]}`,
          confidence: 'certain',
        },
      });
    }
    
    // Scan for window.location.replace
    const windowReplacePattern = new RegExp(REDIRECT_PATTERNS.windowLocationReplace.source, 'g');
    
    while ((match = windowReplacePattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      const userStateContext = inferUserStateContext(surroundingCode, filePath);
      const { isAppropriate, issues } = checkRedirectAppropriateness(match[1], userStateContext);
      
      redirects.push({
        filePath,
        lineNumber,
        type: 'windowReplace',
        target: match[1],
        userStateContext,
        isAppropriate,
        issues,
        evidence: {
          filePath,
          lineNumbers: [lineNumber],
          codeSnippet: surroundingCode,
          reason: `window.location.replace redirect to ${match[1]}`,
          confidence: 'certain',
        },
      });
    }
    
    return redirects;
  } catch (error) {
    console.error(`Error scanning file ${filePath}:`, error);
    return redirects;
  }
}


/**
 * Recursively finds all files in a directory.
 * 
 * @param dir - Directory to scan
 * @param projectRoot - Project root for relative paths
 * @param extensions - File extensions to include
 * @returns Array of relative file paths
 */
function findFiles(
  dir: string,
  projectRoot: string,
  extensions: string[] = FILE_EXTENSIONS
): string[] {
  const files: string[] = [];
  const fullDir = path.join(projectRoot, dir);
  
  try {
    if (!fs.existsSync(fullDir)) {
      return files;
    }
    
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry.name);
      const relativePath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...findFiles(relativePath, projectRoot, extensions));
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

/**
 * Detects potential redirect loops in the redirect graph.
 * 
 * @param redirects - All redirect instances
 * @returns Array of detected redirect loops
 */
export function detectRedirectLoops(redirects: RedirectInstance[]): RedirectLoop[] {
  const loops: RedirectLoop[] = [];
  
  // Build a graph of redirects: source path -> target paths
  const redirectGraph: Map<string, { target: string; file: string }[]> = new Map();
  
  for (const redirect of redirects) {
    // Infer source path from file path
    const sourcePath = inferSourcePath(redirect.filePath);
    if (!sourcePath) continue;
    
    const existing = redirectGraph.get(sourcePath) || [];
    existing.push({ target: redirect.target, file: redirect.filePath });
    redirectGraph.set(sourcePath, existing);
  }
  
  // Check for cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function detectCycle(path: string, currentPath: string[], filesInPath: string[]): boolean {
    if (recursionStack.has(path)) {
      // Found a cycle
      const cycleStart = currentPath.indexOf(path);
      const cycle = currentPath.slice(cycleStart);
      cycle.push(path); // Complete the cycle
      
      loops.push({
        startPath: path,
        sequence: cycle,
        filesInvolved: filesInPath.slice(cycleStart),
        severity: cycle.length <= 2 ? 'critical' : 'high',
        evidence: {
          filePath: filesInPath[cycleStart] || 'unknown',
          reason: `Redirect loop detected: ${cycle.join(' → ')}`,
          confidence: 'certain',
        },
      });
      return true;
    }
    
    if (visited.has(path)) {
      return false;
    }
    
    visited.add(path);
    recursionStack.add(path);
    
    const targets = redirectGraph.get(path) || [];
    for (const { target, file } of targets) {
      detectCycle(target, [...currentPath, path], [...filesInPath, file]);
    }
    
    recursionStack.delete(path);
    return false;
  }
  
  // Start DFS from each node
  for (const sourcePath of redirectGraph.keys()) {
    visited.clear();
    recursionStack.clear();
    detectCycle(sourcePath, [], []);
  }
  
  return loops;
}

/**
 * Infers the source path (route) from a file path.
 * 
 * @param filePath - Path to the file
 * @returns Inferred route path or undefined
 */
function inferSourcePath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  
  // Route guard components
  if (normalized.includes('adminroute')) return '/admin/*';
  if (normalized.includes('studentroute')) return '/student/*';
  if (normalized.includes('protectedroute')) return '/*';
  if (normalized.includes('dashboardredirect')) return '/dashboard';
  
  // Auth pages
  if (normalized.includes('signinpage')) return '/auth/signin';
  if (normalized.includes('signuppage')) return '/auth/signup';
  if (normalized.includes('authcallbackpage')) return '/auth/callback';
  if (normalized.includes('forgotpasswordpage')) return '/auth/forgot-password';
  if (normalized.includes('resetpasswordpage')) return '/auth/reset-password';
  
  // Student pages
  if (normalized.includes('student/dashboard')) return '/student/dashboard';
  if (normalized.includes('student/payment')) return '/student/payment';
  if (normalized.includes('applicationwizard')) return '/apply';
  
  // Admin pages
  if (normalized.includes('admin/dashboard')) return '/admin/dashboard';
  if (normalized.includes('admin/applications')) return '/admin/applications';
  
  // Landing page
  if (normalized.includes('landingpage')) return '/';
  
  return undefined;
}


/**
 * Generates security issues from redirect analysis.
 * 
 * @param redirects - All redirect instances
 * @param loops - Detected redirect loops
 * @returns Array of security issues
 */
function generateSecurityIssues(
  redirects: RedirectInstance[],
  loops: RedirectLoop[]
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  
  // Issue: Inappropriate redirects
  for (const redirect of redirects) {
    if (!redirect.isAppropriate && redirect.issues.length > 0) {
      issues.push({
        type: 'PERMISSION_BYPASS',
        filePath: redirect.filePath,
        lineNumber: redirect.lineNumber,
        evidence: redirect.issues.join('; '),
        severity: redirect.userStateContext === 'unauthenticated' && 
                  redirect.target.startsWith('/admin') ? 'critical' : 'medium',
      });
    }
  }
  
  // Issue: Redirect loops
  for (const loop of loops) {
    issues.push({
      type: 'PERMISSION_BYPASS',
      filePath: loop.filesInvolved[0] || 'unknown',
      lineNumber: 1,
      evidence: `Redirect loop: ${loop.sequence.join(' → ')}`,
      severity: loop.severity === 'critical' ? 'critical' : 'high',
    });
  }
  
  return issues;
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyzes all redirects in the codebase.
 * 
 * @param projectRoot - Project root directory
 * @returns Complete redirect analysis result
 * 
 * @requirements 4.5 - Verify redirect logic is correct
 */
export function analyzeRedirects(projectRoot: string = process.cwd()): RedirectAnalysisResult {
  const allRedirects: RedirectInstance[] = [];
  
  // Scan all directories
  for (const dir of SCAN_DIRECTORIES) {
    const files = findFiles(dir, projectRoot);
    
    for (const file of files) {
      const redirects = scanFileForRedirects(file, projectRoot);
      allRedirects.push(...redirects);
    }
  }
  
  // Find inappropriate redirects
  const inappropriateRedirects = allRedirects.filter(r => !r.isAppropriate);
  
  // Detect redirect loops
  const redirectLoops = detectRedirectLoops(allRedirects);
  
  // Generate security issues
  const securityIssues = generateSecurityIssues(allRedirects, redirectLoops);
  
  // Calculate summary statistics
  const summary = {
    totalRedirects: allRedirects.length,
    navigateComponents: allRedirects.filter(r => r.type === 'Navigate').length,
    useNavigateCalls: allRedirects.filter(r => r.type === 'useNavigate').length,
    windowLocationRedirects: allRedirects.filter(r => 
      r.type === 'windowLocation' || r.type === 'windowReplace'
    ).length,
    inappropriateCount: inappropriateRedirects.length,
    loopCount: redirectLoops.length,
  };
  
  return {
    redirects: allRedirects,
    inappropriateRedirects,
    redirectLoops,
    securityIssues,
    summary,
  };
}


// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generates a human-readable report of the redirect analysis.
 * 
 * @param result - Redirect analysis result
 * @returns Formatted report string
 */
export function generateRedirectReport(result: RedirectAnalysisResult): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(70));
  lines.push('MIHAS Redirect Analysis Report');
  lines.push('='.repeat(70));
  lines.push('');
  
  // Summary
  lines.push('Summary');
  lines.push('-'.repeat(70));
  lines.push(`Total Redirects Found: ${result.summary.totalRedirects}`);
  lines.push(`  Navigate Components: ${result.summary.navigateComponents}`);
  lines.push(`  useNavigate Calls: ${result.summary.useNavigateCalls}`);
  lines.push(`  window.location Redirects: ${result.summary.windowLocationRedirects}`);
  lines.push('');
  lines.push(`Inappropriate Redirects: ${result.summary.inappropriateCount} ${result.summary.inappropriateCount > 0 ? '⚠️' : '✓'}`);
  lines.push(`Redirect Loops: ${result.summary.loopCount} ${result.summary.loopCount > 0 ? '🔴' : '✓'}`);
  lines.push('');
  
  // Redirect Loops (Critical)
  if (result.redirectLoops.length > 0) {
    lines.push('Redirect Loops (CRITICAL)');
    lines.push('-'.repeat(70));
    for (const loop of result.redirectLoops) {
      const severityIcon = loop.severity === 'critical' ? '🔴' : '🟠';
      lines.push(`\n${severityIcon} Loop: ${loop.sequence.join(' → ')}`);
      lines.push(`   Files: ${loop.filesInvolved.join(', ')}`);
      lines.push(`   Severity: ${loop.severity}`);
    }
    lines.push('');
  }
  
  // Inappropriate Redirects
  if (result.inappropriateRedirects.length > 0) {
    lines.push('Inappropriate Redirects');
    lines.push('-'.repeat(70));
    for (const redirect of result.inappropriateRedirects) {
      lines.push(`\n⚠️ ${redirect.filePath}:${redirect.lineNumber}`);
      lines.push(`   Type: ${redirect.type}`);
      lines.push(`   Target: ${redirect.target}`);
      lines.push(`   User State: ${redirect.userStateContext}`);
      if (redirect.condition) {
        lines.push(`   Condition: ${redirect.condition}`);
      }
      lines.push(`   Issues:`);
      for (const issue of redirect.issues) {
        lines.push(`     - ${issue}`);
      }
    }
    lines.push('');
  }
  
  // All Redirects by User State
  lines.push('Redirects by User State');
  lines.push('-'.repeat(70));
  
  const byUserState = new Map<UserStateContext, RedirectInstance[]>();
  for (const redirect of result.redirects) {
    const existing = byUserState.get(redirect.userStateContext) || [];
    existing.push(redirect);
    byUserState.set(redirect.userStateContext, existing);
  }
  
  for (const [userState, redirects] of byUserState) {
    lines.push(`\n${userState.toUpperCase()} (${redirects.length} redirects):`);
    
    // Group by target
    const byTarget = new Map<string, RedirectInstance[]>();
    for (const redirect of redirects) {
      const existing = byTarget.get(redirect.target) || [];
      existing.push(redirect);
      byTarget.set(redirect.target, existing);
    }
    
    for (const [target, targetRedirects] of byTarget) {
      const status = targetRedirects.every(r => r.isAppropriate) ? '✓' : '⚠️';
      lines.push(`  ${status} → ${target} (${targetRedirects.length} occurrences)`);
      for (const redirect of targetRedirects.slice(0, 3)) {
        lines.push(`      ${redirect.filePath}:${redirect.lineNumber}`);
      }
      if (targetRedirects.length > 3) {
        lines.push(`      ... and ${targetRedirects.length - 3} more`);
      }
    }
  }
  
  // Security Issues
  if (result.securityIssues.length > 0) {
    lines.push('');
    lines.push('Security Issues');
    lines.push('-'.repeat(70));
    
    const bySeverity = {
      critical: result.securityIssues.filter(i => i.severity === 'critical'),
      high: result.securityIssues.filter(i => i.severity === 'high'),
      medium: result.securityIssues.filter(i => i.severity === 'medium'),
      low: result.securityIssues.filter(i => i.severity === 'low'),
    };
    
    for (const [severity, issues] of Object.entries(bySeverity)) {
      if (issues.length > 0) {
        const icon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🟢';
        lines.push(`\n${icon} ${severity.toUpperCase()} (${issues.length}):`);
        for (const issue of issues) {
          lines.push(`  ${issue.filePath}:${issue.lineNumber}`);
          lines.push(`    ${issue.evidence}`);
        }
      }
    }
  }
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution
// =============================================================================

// Check if running as main module
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('redirectAnalyzer.ts');

if (isMainModule) {
  console.log('MIHAS Redirect Analyzer');
  console.log('=======================');
  console.log('');
  
  const result = analyzeRedirects();
  console.log(generateRedirectReport(result));
}
